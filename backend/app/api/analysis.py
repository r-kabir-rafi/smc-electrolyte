from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/analysis", tags=["analysis"])

METRICS_PATH = Path("data_processed/analysis_metrics.json")
PANEL_PATH = Path("data_processed/incident_heatwave_panel.parquet")


def _read_metrics() -> dict[str, Any]:
    if not METRICS_PATH.exists():
        raise HTTPException(status_code=404, detail="analysis metrics not found")
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))


@router.get("/metrics")
def analysis_metrics() -> dict[str, Any]:
    return _read_metrics()


@router.get("/heatmap")
def analysis_heatmap() -> dict[str, Any]:
    return _read_metrics().get("heatmap", {})


@router.get("/lags")
def analysis_lags() -> list[dict[str, Any]]:
    return _read_metrics().get("lag_correlations", [])


@router.get("/panel-preview")
def panel_preview(limit: int = 25) -> list[dict[str, Any]]:
    if not PANEL_PATH.exists():
        raise HTTPException(status_code=404, detail="incident heatwave panel not found")
    df = pd.read_parquet(PANEL_PATH).head(limit)
    if "event_date" in df.columns:
        df["event_date"] = pd.to_datetime(df["event_date"], errors="coerce").astype(str)
    return df.to_dict(orient="records")
