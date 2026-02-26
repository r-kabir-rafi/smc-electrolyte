"""Build processed Bangladesh admin boundaries for district/upazila.

Usage:
  python pipelines/etl_admin_boundaries.py
  python pipelines/etl_admin_boundaries.py --use-demo

Expected raw inputs (public source drops):
  data_raw/bd_admin_district.geojson
  data_raw/bd_admin_upazila.geojson
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DATA_RAW = Path("data_raw")
DATA_PROCESSED = Path("data_processed")

DISTRICT_RAW = DATA_RAW / "bd_admin_district.geojson"
UPAZILA_RAW = DATA_RAW / "bd_admin_upazila.geojson"

DISTRICT_OUT = DATA_PROCESSED / "bd_admin_district.geojson"
UPAZILA_OUT = DATA_PROCESSED / "bd_admin_upazila.geojson"


def _read_geojson(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _write_geojson(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)


def _first(props: dict[str, Any], keys: list[str], default: str = "") -> str:
    for key in keys:
        if key in props and props[key] not in (None, ""):
            return str(props[key]).strip()
    return default


def _normalize_district(raw: dict[str, Any]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for feature in raw.get("features", []):
        props = feature.get("properties", {})
        district_code = _first(props, ["district_code", "DIST_CODE", "ADM2_PCODE", "id"])
        district_name = _first(
            props,
            ["district_name", "DIST_NAME", "ADM2_EN", "name", "shapeName"],
            default="Unknown",
        )
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "district_code": district_code,
                    "district_name": district_name,
                },
                "geometry": feature.get("geometry"),
            }
        )

    return {"type": "FeatureCollection", "features": features}


def _normalize_upazila(raw: dict[str, Any]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for feature in raw.get("features", []):
        props = feature.get("properties", {})
        upazila_code = _first(props, ["upazila_code", "UPA_CODE", "ADM3_PCODE", "id"])
        upazila_name = _first(
            props,
            ["upazila_name", "UPA_NAME", "ADM3_EN", "name", "shapeName"],
            default="Unknown",
        )
        district_code = _first(props, ["district_code", "DIST_CODE", "ADM2_PCODE"])
        district_name = _first(props, ["district_name", "DIST_NAME", "ADM2_EN"], default="Unknown")
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "upazila_code": upazila_code,
                    "upazila_name": upazila_name,
                    "district_code": district_code,
                    "district_name": district_name,
                },
                "geometry": feature.get("geometry"),
            }
        )

    return {"type": "FeatureCollection", "features": features}


def _demo_district() -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"district_code": "BD-13", "district_name": "Dhaka"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [90.30, 23.67],
                            [90.55, 23.67],
                            [90.55, 23.93],
                            [90.30, 23.93],
                            [90.30, 23.67],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"district_code": "BD-10", "district_name": "Chattogram"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [91.68, 22.20],
                            [91.96, 22.20],
                            [91.96, 22.48],
                            [91.68, 22.48],
                            [91.68, 22.20],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"district_code": "BD-69", "district_name": "Rajshahi"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [88.45, 24.25],
                            [88.78, 24.25],
                            [88.78, 24.50],
                            [88.45, 24.50],
                            [88.45, 24.25],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"district_code": "BD-27", "district_name": "Khulna"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [89.45, 22.75],
                            [89.75, 22.75],
                            [89.75, 23.00],
                            [89.45, 23.00],
                            [89.45, 22.75],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"district_code": "BD-06", "district_name": "Barishal"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [90.25, 22.55],
                            [90.55, 22.55],
                            [90.55, 22.80],
                            [90.25, 22.80],
                            [90.25, 22.55],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {"district_code": "BD-60", "district_name": "Sylhet"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [91.72, 24.80],
                            [92.05, 24.80],
                            [92.05, 25.10],
                            [91.72, 25.10],
                            [91.72, 24.80],
                        ]
                    ],
                },
            },
        ],
    }


def _demo_upazila() -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "upazila_code": "BD-13-18",
                    "upazila_name": "Dhamrai",
                    "district_code": "BD-13",
                    "district_name": "Dhaka",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [90.16, 23.85],
                            [90.30, 23.85],
                            [90.30, 23.98],
                            [90.16, 23.98],
                            [90.16, 23.85],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "upazila_code": "BD-10-41",
                    "upazila_name": "Patiya",
                    "district_code": "BD-10",
                    "district_name": "Chattogram",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [91.84, 22.25],
                            [91.96, 22.25],
                            [91.96, 22.36],
                            [91.84, 22.36],
                            [91.84, 22.25],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "upazila_code": "BD-69-85",
                    "upazila_name": "Paba",
                    "district_code": "BD-69",
                    "district_name": "Rajshahi",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [88.52, 24.34],
                            [88.66, 24.34],
                            [88.66, 24.46],
                            [88.52, 24.46],
                            [88.52, 24.34],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "upazila_code": "BD-27-47",
                    "upazila_name": "Dumuria",
                    "district_code": "BD-27",
                    "district_name": "Khulna",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [89.53, 22.82],
                            [89.68, 22.82],
                            [89.68, 22.95],
                            [89.53, 22.95],
                            [89.53, 22.82],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "upazila_code": "BD-06-06",
                    "upazila_name": "Babuganj",
                    "district_code": "BD-06",
                    "district_name": "Barishal",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [90.33, 22.60],
                            [90.49, 22.60],
                            [90.49, 22.74],
                            [90.33, 22.74],
                            [90.33, 22.60],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "upazila_code": "BD-60-88",
                    "upazila_name": "South Surma",
                    "district_code": "BD-60",
                    "district_name": "Sylhet",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [91.80, 24.85],
                            [91.98, 24.85],
                            [91.98, 24.99],
                            [91.80, 24.99],
                            [91.80, 24.85],
                        ]
                    ],
                },
            },
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--use-demo",
        action="store_true",
        help="Generate a small demo dataset when public raw files are unavailable.",
    )
    args = parser.parse_args()

    if DISTRICT_RAW.exists() and UPAZILA_RAW.exists():
        district = _normalize_district(_read_geojson(DISTRICT_RAW))
        upazila = _normalize_upazila(_read_geojson(UPAZILA_RAW))
    elif args.use_demo:
        district = _demo_district()
        upazila = _demo_upazila()
    else:
        raise FileNotFoundError(
            "Missing raw boundary files. Add data_raw/bd_admin_district.geojson and "
            "data_raw/bd_admin_upazila.geojson, or run with --use-demo."
        )

    _write_geojson(DISTRICT_OUT, district)
    _write_geojson(UPAZILA_OUT, upazila)
    print(f"Wrote {DISTRICT_OUT}")
    print(f"Wrote {UPAZILA_OUT}")


if __name__ == "__main__":
    main()
