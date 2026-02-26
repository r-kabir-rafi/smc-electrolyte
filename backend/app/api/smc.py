from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/smc", tags=["smc"])

PRIORITY_CSV = Path("data_processed/smc_priority_index.csv")
PRIORITY_MAP = Path("data_processed/smc_priority_map.geojson")
META = Path("data_processed/smc_priority_meta.json")


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"missing file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/priority-index")
def priority_index(limit: int = 50, area_type: str | None = None) -> list[dict[str, Any]]:
    if not PRIORITY_CSV.exists():
        raise HTTPException(status_code=404, detail="priority index file missing")
    df = pd.read_csv(PRIORITY_CSV)
    if area_type in {"district", "upazila"}:
        df = df[df["area_type"] == area_type]
    df = df.sort_values("smc_priority_score", ascending=False).head(limit)
    return df.to_dict(orient="records")


@router.get("/priority-map")
def priority_map() -> dict[str, Any]:
    return _read_json(PRIORITY_MAP)


@router.get("/priority-meta")
def priority_meta() -> dict[str, Any]:
    return _read_json(META)
