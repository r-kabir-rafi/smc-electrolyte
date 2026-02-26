from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/forecast", tags=["forecast"])

HOTSPOTS_GEO = Path("data_processed/hotspots_next7days.geojson")
TOP_UPAZILA_CSV = Path("data_processed/top_20_upazilas.csv")
MODEL_METRICS = Path("models/heatwave_predictor_metrics.json")


def _load_geojson(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"missing file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/next7")
def forecast_next7() -> dict[str, Any]:
    return _load_geojson(HOTSPOTS_GEO)


@router.get("/dates")
def forecast_dates() -> dict[str, list[str]]:
    geo = _load_geojson(HOTSPOTS_GEO)
    values = sorted(
        {
            str(f.get("properties", {}).get("forecast_date", ""))
            for f in geo.get("features", [])
            if f.get("properties", {}).get("forecast_date")
        }
    )
    return {"dates": values}


@router.get("/top-upazilas")
def top_upazilas(limit: int = 20) -> list[dict[str, Any]]:
    if not TOP_UPAZILA_CSV.exists():
        raise HTTPException(status_code=404, detail="top upazila ranking not found")
    df = pd.read_csv(TOP_UPAZILA_CSV).head(limit)
    return df.to_dict(orient="records")


@router.get("/model-metrics")
def model_metrics() -> dict[str, Any]:
    if not MODEL_METRICS.exists():
        raise HTTPException(status_code=404, detail="model metrics not found")
    return json.loads(MODEL_METRICS.read_text(encoding="utf-8"))
