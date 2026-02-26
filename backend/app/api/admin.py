from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/admin", tags=["admin"])

DISTRICT_PATH = Path("data_processed/bd_admin_district.geojson")
DISTRICT_REAL_PATH = Path("data_processed/bd_districts_real.geojson")
UPAZILA_PATH = Path("data_processed/bd_admin_upazila.geojson")


@lru_cache(maxsize=2)
def _read_geojson(path: str) -> dict[str, Any]:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Missing boundary file: {file_path}")
    with file_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _find_feature(collection: dict[str, Any], field: str, code: str) -> dict[str, Any] | None:
    for feature in collection.get("features", []):
        if str(feature.get("properties", {}).get(field, "")).lower() == code.lower():
            return feature
    return None


@router.get("/districts")
def get_districts() -> dict[str, Any]:
    # Use real GADM boundaries if available, fall back to simplified
    if DISTRICT_REAL_PATH.exists():
        return _read_geojson(str(DISTRICT_REAL_PATH))
    return _read_geojson(str(DISTRICT_PATH))


@router.get("/upazilas")
def get_upazilas() -> dict[str, Any]:
    return _read_geojson(str(UPAZILA_PATH))


@router.get("/districts/{district_code}")
def get_district_by_code(district_code: str) -> dict[str, Any]:
    collection = _read_geojson(str(DISTRICT_PATH))
    feature = _find_feature(collection, "district_code", district_code)
    if feature is None:
        raise HTTPException(status_code=404, detail="district code not found")
    return feature


@router.get("/upazilas/{upazila_code}")
def get_upazila_by_code(upazila_code: str) -> dict[str, Any]:
    collection = _read_geojson(str(UPAZILA_PATH))
    feature = _find_feature(collection, "upazila_code", upazila_code)
    if feature is None:
        raise HTTPException(status_code=404, detail="upazila code not found")
    return feature
