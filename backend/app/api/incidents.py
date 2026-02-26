from __future__ import annotations

import csv
import io
import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/incidents", tags=["incidents"])

INCIDENTS_GEOJSON_PATH = Path("data_processed/heatstroke_incidents.geojson")
INCIDENTS_CSV_PATH = Path("data_processed/heatstroke_incidents.csv")
INCIDENTS_PARQUET_PATH = Path("data_processed/heatstroke_incidents.parquet")
DISTRICT_PATH = Path("data_processed/bd_admin_district.geojson")
UPAZILA_PATH = Path("data_processed/bd_admin_upazila.geojson")

DATE_RE = r"^\d{4}-\d{2}-\d{2}$"

DIVISION_DISTRICTS: dict[str, set[str]] = {
    "barishal": {"barguna", "barishal", "bhola", "jhalokati", "patuakhali", "pirojpur"},
    "chattogram": {
        "bandarban",
        "brahmanbaria",
        "chandpur",
        "chattogram",
        "chittagong",
        "comilla",
        "cox's bazar",
        "feni",
        "khagrachhari",
        "lakshmipur",
        "noakhali",
        "rangamati",
    },
    "dhaka": {
        "dhaka",
        "faridpur",
        "gazipur",
        "gopalganj",
        "kishoreganj",
        "madaripur",
        "manikganj",
        "munshiganj",
        "narayanganj",
        "narsingdi",
        "rajbari",
        "shariatpur",
        "tangail",
    },
    "khulna": {"bagerhat", "chuadanga", "jashore", "jhenaidah", "khulna", "kushtia", "magura", "meherpur", "narail", "satkhira"},
    "mymensingh": {"jamalpur", "mymensingh", "netrokona", "sherpur"},
    "rajshahi": {"bogra", "chapainawabganj", "joypurhat", "naogaon", "natore", "nawabganj", "pabna", "rajshahi", "sirajganj"},
    "rangpur": {"dinajpur", "gaibandha", "kurigram", "lalmonirhat", "nilphamari", "panchagarh", "rangpur", "thakurgaon"},
    "sylhet": {"habiganj", "moulvibazar", "sunamganj", "sylhet"},
}


def _parse_iso_date(value: str | None, field_name: str) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid {field_name}, expected YYYY-MM-DD") from exc


def _coerce_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@lru_cache(maxsize=1)
def _admin_lookups() -> tuple[dict[str, str], dict[str, str]]:
    district_by_code: dict[str, str] = {}
    upazila_by_code: dict[str, str] = {}

    if DISTRICT_PATH.exists():
        districts = json.loads(DISTRICT_PATH.read_text(encoding="utf-8"))
        for feature in districts.get("features", []):
            props = feature.get("properties", {})
            district_code = str(props.get("district_code", "")).strip()
            district_name = str(props.get("district_name", "")).strip()
            if district_code and district_name:
                district_by_code[district_code] = district_name

    if UPAZILA_PATH.exists():
        upazilas = json.loads(UPAZILA_PATH.read_text(encoding="utf-8"))
        for feature in upazilas.get("features", []):
            props = feature.get("properties", {})
            upazila_code = str(props.get("upazila_code", "")).strip()
            upazila_name = str(props.get("upazila_name", "")).strip()
            if upazila_code and upazila_name:
                upazila_by_code[upazila_code] = upazila_name

    return district_by_code, upazila_by_code


def _extract_district_from_text(location_text: str, known_districts: list[str]) -> str | None:
    if not location_text:
        return None
    lower_text = location_text.lower()
    for district in known_districts:
        if district.lower() in lower_text:
            return district
    return None


@lru_cache(maxsize=1)
def _load_incidents() -> list[dict[str, Any]]:
    district_by_code, upazila_by_code = _admin_lookups()
    incidents: list[dict[str, Any]] = []

    if INCIDENTS_GEOJSON_PATH.exists():
        data = json.loads(INCIDENTS_GEOJSON_PATH.read_text(encoding="utf-8"))
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geom = feature.get("geometry") or {}
            coords = geom.get("coordinates") if geom.get("type") == "Point" else None

            district_code = str(props.get("district_code", "")).strip() or None
            upazila_code = str(props.get("upazila_code", "")).strip() or None
            district = district_by_code.get(district_code or "")
            upazila = upazila_by_code.get(upazila_code or "")

            raw_location = str(props.get("location_text_raw", "") or "").strip()
            district = district or _extract_district_from_text(
                raw_location,
                sorted(set(district_by_code.values()), key=len, reverse=True),
            )

            if upazila and district:
                place = f"{district}, {upazila}"
            else:
                place = district or raw_location or "Unknown"

            date_occurred = str(props.get("date_occurred", "") or "")
            date_published = str(props.get("date_published", "") or "")
            display_date = date_occurred or date_published

            injuries = _coerce_int(props.get("injured"))
            if injuries is None:
                injuries = _coerce_int(props.get("hospitalized"))

            incidents.append(
                {
                    "id": str(props.get("incident_id") or props.get("id") or "").strip(),
                    "date_occurred": date_occurred or None,
                    "date_published": date_published or None,
                    "date_for_sort": display_date or None,
                    "district": district,
                    "upazila": upazila,
                    "district_code": district_code,
                    "upazila_code": upazila_code,
                    "deaths": _coerce_int(props.get("deaths")),
                    "injured": injuries,
                    "source_name": str(props.get("source_name") or props.get("source") or "").strip() or None,
                    "source_url": str(props.get("source_url") or props.get("url") or "").strip() or None,
                    "headline": str(props.get("headline") or "").strip() or None,
                    "place": place,
                    "lat": float(coords[1]) if isinstance(coords, list) and len(coords) == 2 else None,
                    "lon": float(coords[0]) if isinstance(coords, list) and len(coords) == 2 else None,
                }
            )
        return [row for row in incidents if row["id"]]

    if INCIDENTS_CSV_PATH.exists() or INCIDENTS_PARQUET_PATH.exists():
        if INCIDENTS_CSV_PATH.exists():
            df = pd.read_csv(INCIDENTS_CSV_PATH)
        else:
            df = pd.read_parquet(INCIDENTS_PARQUET_PATH)

        known = sorted(set(district_by_code.values()), key=len, reverse=True)
        for row in df.to_dict(orient="records"):
            raw_location = str(row.get("location_text_raw", "") or "").strip()
            district = _extract_district_from_text(raw_location, known)
            date_occurred = str(row.get("date_occurred", "") or "")
            date_published = str(row.get("date_published", "") or "")
            display_date = date_occurred or date_published

            injuries = _coerce_int(row.get("injured"))
            if injuries is None:
                injuries = _coerce_int(row.get("hospitalized"))

            incidents.append(
                {
                    "id": str(row.get("incident_id") or row.get("id") or "").strip(),
                    "date_occurred": date_occurred or None,
                    "date_published": date_published or None,
                    "date_for_sort": display_date or None,
                    "district": district,
                    "upazila": None,
                    "district_code": None,
                    "upazila_code": None,
                    "deaths": _coerce_int(row.get("deaths")),
                    "injured": injuries,
                    "source_name": str(row.get("source_name") or row.get("source") or "").strip() or None,
                    "source_url": str(row.get("source_url") or row.get("url") or "").strip() or None,
                    "headline": str(row.get("headline") or "").strip() or None,
                    "place": district or raw_location or "Unknown",
                    "lat": None,
                    "lon": None,
                }
            )

        return [row for row in incidents if row["id"]]

    raise HTTPException(
        status_code=404,
        detail="incidents dataset not found (expected data_processed/heatstroke_incidents.geojson|csv|parquet)",
    )


def _apply_filters(
    incidents: list[dict[str, Any]],
    *,
    start_date: date | None,
    end_date: date | None,
    division: str | None,
    district: str | None,
    incident_type: Literal["death", "injury", "all"],
    query: str | None,
) -> list[dict[str, Any]]:
    filtered = incidents

    if start_date or end_date:
        out: list[dict[str, Any]] = []
        for item in filtered:
            raw = item.get("date_for_sort")
            if not raw:
                continue
            try:
                item_date = date.fromisoformat(str(raw))
            except ValueError:
                continue
            if start_date and item_date < start_date:
                continue
            if end_date and item_date > end_date:
                continue
            out.append(item)
        filtered = out

    if division:
        dkey = division.strip().lower()
        districts = DIVISION_DISTRICTS.get(dkey, set())
        if districts:
            filtered = [
                item
                for item in filtered
                if str(item.get("district") or "").strip().lower() in districts
            ]

    if district:
        district_lower = district.strip().lower()
        filtered = [
            item for item in filtered if str(item.get("district") or "").strip().lower() == district_lower
        ]

    if incident_type == "death":
        filtered = [item for item in filtered if (item.get("deaths") or 0) > 0]
    elif incident_type == "injury":
        filtered = [item for item in filtered if (item.get("injured") or 0) > 0]

    if query:
        q = query.strip().lower()
        filtered = [
            item
            for item in filtered
            if q in str(item.get("place") or "").lower()
            or q in str(item.get("headline") or "").lower()
        ]

    return filtered


def _sort_items(items: list[dict[str, Any]], sort: Literal["date_desc", "date_asc"]) -> list[dict[str, Any]]:
    reverse = sort == "date_desc"
    return sorted(
        items,
        key=lambda row: (str(row.get("date_for_sort") or "0000-00-00"), str(row.get("id") or "")),
        reverse=reverse,
    )


def _shape_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("id"),
        "date_occurred": item.get("date_occurred"),
        "date_published": item.get("date_published"),
        "district": item.get("district"),
        "upazila": item.get("upazila"),
        "deaths": item.get("deaths"),
        "injured": item.get("injured"),
        "source_name": item.get("source_name"),
        "source_url": item.get("source_url"),
        "headline": item.get("headline"),
        "place": item.get("place"),
        "lat": item.get("lat"),
        "lon": item.get("lon"),
        "district_code": item.get("district_code"),
        "upazila_code": item.get("upazila_code"),
    }


@router.get("")
def list_incidents(
    response: Response,
    start_date: str | None = Query(default=None, pattern=DATE_RE),
    end_date: str | None = Query(default=None, pattern=DATE_RE),
    division: str | None = Query(default=None),
    district: str | None = Query(default=None),
    type: Literal["death", "injury", "all"] = Query(default="all"),
    q: str | None = Query(default=None),
    sort: Literal["date_desc", "date_asc"] = Query(default="date_desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=5000),
) -> dict[str, Any]:
    start_dt = _parse_iso_date(start_date, "start_date")
    end_dt = _parse_iso_date(end_date, "end_date")
    if start_dt and end_dt and start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")

    filtered = _apply_filters(
        _load_incidents(),
        start_date=start_dt,
        end_date=end_dt,
        division=division,
        district=district,
        incident_type=type,
        query=q,
    )
    ordered = _sort_items(filtered, sort)

    total = len(ordered)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_items = ordered[start_idx:end_idx]

    response.headers["Cache-Control"] = "public, max-age=300"

    return {
        "items": [_shape_item(row) for row in page_items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/districts")
def incidents_districts(response: Response) -> dict[str, list[str]]:
    values = sorted({str(item.get("district")) for item in _load_incidents() if item.get("district")})
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"districts": values}


@router.get("/dates")
def incidents_dates(response: Response) -> dict[str, list[str]]:
    values = sorted({str(item.get("date_for_sort")) for item in _load_incidents() if item.get("date_for_sort")})
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"dates": values}


@router.get("/export")
def export_incidents_csv(
    start_date: str | None = Query(default=None, pattern=DATE_RE),
    end_date: str | None = Query(default=None, pattern=DATE_RE),
    division: str | None = Query(default=None),
    district: str | None = Query(default=None),
    type: Literal["death", "injury", "all"] = Query(default="all"),
    q: str | None = Query(default=None),
    sort: Literal["date_desc", "date_asc"] = Query(default="date_desc"),
) -> StreamingResponse:
    start_dt = _parse_iso_date(start_date, "start_date")
    end_dt = _parse_iso_date(end_date, "end_date")
    if start_dt and end_dt and start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")

    filtered = _apply_filters(
        _load_incidents(),
        start_date=start_dt,
        end_date=end_dt,
        division=division,
        district=district,
        incident_type=type,
        query=q,
    )
    ordered = _sort_items(filtered, sort)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "date_occurred",
            "date_published",
            "district",
            "upazila",
            "deaths",
            "injured",
            "source_name",
            "source_url",
            "headline",
            "lat",
            "lon",
        ]
    )
    for row in ordered:
        writer.writerow(
            [
                row.get("id"),
                row.get("date_occurred") or "",
                row.get("date_published") or "",
                row.get("district") or "",
                row.get("upazila") or "",
                row.get("deaths") if row.get("deaths") is not None else "",
                row.get("injured") if row.get("injured") is not None else "",
                row.get("source_name") or "",
                row.get("source_url") or "",
                row.get("headline") or "",
                row.get("lat") if row.get("lat") is not None else "",
                row.get("lon") if row.get("lon") is not None else "",
            ]
        )

    csv_bytes = io.BytesIO(output.getvalue().encode("utf-8"))
    headers = {
        "Content-Disposition": 'attachment; filename="incidents_export.csv"',
        "Cache-Control": "public, max-age=300",
    }
    return StreamingResponse(csv_bytes, media_type="text/csv", headers=headers)


@router.get("/{incident_id}")
def get_incident_detail(incident_id: str, response: Response) -> dict[str, Any]:
    for item in _load_incidents():
        if str(item.get("id")) == incident_id:
            response.headers["Cache-Control"] = "public, max-age=300"
            return _shape_item(item)
    raise HTTPException(status_code=404, detail="incident not found")
