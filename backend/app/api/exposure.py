from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/exposure", tags=["exposure"])

DISTRICT_GEO = Path("data_processed/bd_admin_district.geojson")
POP_AGG = Path("data_processed/pop_density_admin.parquet")
MOBILITY = Path("data_processed/mobility_proxy.parquet")
POP_RASTER = Path("data_processed/pop_density.tif")


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"missing file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


@router.get("/population-districts")
def population_districts() -> dict[str, Any]:
    if not DISTRICT_GEO.exists() or not POP_AGG.exists():
        raise HTTPException(status_code=404, detail="population exposure files missing")

    dist = gpd.read_file(DISTRICT_GEO)
    agg = pd.read_parquet(POP_AGG)
    merged = dist.merge(agg, on=["district_code", "district_name"], how="left")
    return merged.__geo_interface__


@router.get("/mobility-districts")
def mobility_districts() -> dict[str, Any]:
    if not DISTRICT_GEO.exists() or not MOBILITY.exists():
        raise HTTPException(status_code=404, detail="mobility proxy files missing")

    dist = gpd.read_file(DISTRICT_GEO)
    mob = pd.read_parquet(MOBILITY)
    merged = dist.merge(mob, on=["district_code", "district_name"], how="left")
    return merged.__geo_interface__


@router.get("/mobility-ranking")
def mobility_ranking(limit: int = 20) -> list[dict[str, Any]]:
    if not MOBILITY.exists():
        raise HTTPException(status_code=404, detail="mobility proxy file missing")
    df = pd.read_parquet(MOBILITY).sort_values("movement_rank").head(limit)
    return df.to_dict(orient="records")


@router.get("/population-raster-meta")
def population_raster_meta() -> dict[str, Any]:
    if not POP_RASTER.exists():
        raise HTTPException(status_code=404, detail="population raster missing")
    return {
        "path": str(POP_RASTER),
        "worldfile": str(POP_RASTER.with_suffix(".tfw")),
        "projection": str(POP_RASTER.with_suffix(".prj")),
        "format": "tiff",
    }
