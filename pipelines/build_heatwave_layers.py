"""Build district choropleth layers from heatwave index data."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

DISTRICT_GEOJSON = Path("data_processed/bd_admin_district.geojson")
INDEX_IN = Path("data_processed/heatwave_index_daily.parquet")
DAILY_OUT = Path("data_processed/heatwave_district_daily.geojson")
WEEKLY_OUT = Path("data_processed/heatwave_district_weekly.geojson")


def _read_geojson(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _write_geojson(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)


def main() -> None:
    if not DISTRICT_GEOJSON.exists() or not INDEX_IN.exists():
        raise FileNotFoundError("Missing district boundaries or heatwave index input")

    districts = _read_geojson(DISTRICT_GEOJSON)
    idx = pd.read_parquet(INDEX_IN)
    idx["date"] = pd.to_datetime(idx["date"])
    idx = idx[idx["entity_type"] == "district"].copy()

    if idx.empty:
        raise ValueError("No district rows found in heatwave index")

    latest_ver = idx["model_version"].mode().iloc[0]

    daily_map = {
        (str(r["date"].date()), r["district_code"]): r
        for _, r in idx.iterrows()
    }

    daily_features: list[dict[str, Any]] = []
    for feature in districts.get("features", []):
        props = feature.get("properties", {})
        district_code = props.get("district_code")
        for date in sorted(idx["date"].dt.date.unique()):
            row = daily_map.get((str(date), district_code))
            if row is None:
                continue
            merged_props = {
                **props,
                "date": str(date),
                "tmax_c": float(row["tmax_c"]),
                "intensity_score": int(row["intensity_score"]),
                "intensity_category": str(row["intensity_category"]),
                "model_version": latest_ver,
            }
            daily_features.append(
                {
                    "type": "Feature",
                    "properties": merged_props,
                    "geometry": feature.get("geometry"),
                }
            )

    _write_geojson(DAILY_OUT, {"type": "FeatureCollection", "features": daily_features})
    print(f"Wrote {DAILY_OUT}")

    weekly = idx.copy()
    weekly["week_start"] = weekly["date"] - pd.to_timedelta(weekly["date"].dt.weekday, unit="D")
    weekly = (
        weekly.groupby(["week_start", "district_code", "district_name"], as_index=False)
        .agg(tmax_c=("tmax_c", "mean"), intensity_score=("intensity_score", "max"))
    )
    weekly["intensity_category"] = "none"
    weekly.loc[weekly["intensity_score"] == 1, "intensity_category"] = "watch"
    weekly.loc[weekly["intensity_score"] == 2, "intensity_category"] = "high"
    weekly.loc[weekly["intensity_score"] >= 3, "intensity_category"] = "extreme"

    weekly_map = {
        (str(r["week_start"].date()), r["district_code"]): r
        for _, r in weekly.iterrows()
    }

    weekly_features: list[dict[str, Any]] = []
    for feature in districts.get("features", []):
        props = feature.get("properties", {})
        district_code = props.get("district_code")
        for week_start in sorted(weekly["week_start"].dt.date.unique()):
            row = weekly_map.get((str(week_start), district_code))
            if row is None:
                continue
            merged_props = {
                **props,
                "week_start": str(week_start),
                "tmax_c": float(row["tmax_c"]),
                "intensity_score": int(row["intensity_score"]),
                "intensity_category": str(row["intensity_category"]),
                "model_version": latest_ver,
            }
            weekly_features.append(
                {
                    "type": "Feature",
                    "properties": merged_props,
                    "geometry": feature.get("geometry"),
                }
            )

    _write_geojson(WEEKLY_OUT, {"type": "FeatureCollection", "features": weekly_features})
    print(f"Wrote {WEEKLY_OUT}")


if __name__ == "__main__":
    main()
