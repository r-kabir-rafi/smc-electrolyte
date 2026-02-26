from __future__ import annotations

from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/heatwave", tags=["heatwave"])

INDEX_PATH = Path("data_processed/heatwave_index_daily.parquet")
DISTRICT_BOUNDARY_PATH = Path("data_processed/bd_admin_district.geojson")


def _read_index() -> pd.DataFrame:
    if not INDEX_PATH.exists():
        raise HTTPException(status_code=404, detail="heatwave index not found")
    df = pd.read_parquet(INDEX_PATH)
    df["date"] = pd.to_datetime(df["date"])
    return df


def _district_index() -> pd.DataFrame:
    df = _read_index()
    district = df[df["entity_type"] == "district"].copy()
    if district.empty:
        raise HTTPException(status_code=404, detail="district heatwave index not found")
    return district


def _weekly_rollup(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["week_start"] = out["date"] - pd.to_timedelta(out["date"].dt.weekday, unit="D")
    grouped = (
        out.groupby(["week_start", "district_code", "district_name"], as_index=False)
        .agg(tmax_c=("tmax_c", "mean"), intensity_score=("intensity_score", "max"))
        .sort_values(["week_start", "district_code"])
    )
    grouped["intensity_category"] = "none"
    grouped.loc[grouped["intensity_score"] == 1, "intensity_category"] = "watch"
    grouped.loc[grouped["intensity_score"] == 2, "intensity_category"] = "high"
    grouped.loc[grouped["intensity_score"] >= 3, "intensity_category"] = "extreme"
    return grouped


def _join_district_features(df: pd.DataFrame, date_field: str) -> dict[str, Any]:
    if not DISTRICT_BOUNDARY_PATH.exists():
        raise HTTPException(status_code=404, detail="district boundary file not found")
    boundaries = gpd.read_file(DISTRICT_BOUNDARY_PATH)
    merged = boundaries.merge(
        df,
        left_on="district_code",
        right_on="district_code",
        how="left",
    ).dropna(subset=["intensity_score"])
    merged[date_field] = merged[date_field].astype(str)
    return merged.__geo_interface__


@router.get("/summary")
def heatwave_summary() -> dict[str, Any]:
    district = _district_index()
    latest = district["date"].max()
    top = (
        district[district["date"] == latest]
        .sort_values(["intensity_score", "tmax_c"], ascending=False)
        .head(10)[["district_code", "district_name", "tmax_c", "intensity_category"]]
        .to_dict(orient="records")
    )
    return {
        "country": "Bangladesh",
        "as_of_date": str(latest.date()),
        "district_hotspots": top,
        "note": "Historical heatwave summary from reproducible district index",
    }


@router.get("/dates")
def heatwave_dates(level: str = Query(default="daily", pattern="^(daily|weekly)$")) -> dict[str, list[str]]:
    district = _district_index()
    if level == "daily":
        values = sorted(district["date"].dt.date.astype(str).unique().tolist())
        return {"level": "daily", "dates": values}
    weekly = _weekly_rollup(district)
    values = sorted(weekly["week_start"].dt.date.astype(str).unique().tolist())
    return {"level": "weekly", "dates": values}


@router.get("/categories")
def heatwave_categories() -> dict[str, Any]:
    return {
        "thresholds_c": [36, 38, 40],
        "categories": ["none", "watch", "high", "extreme"],
        "version": "heatwave-index-v1.0",
    }


@router.get("/choropleth")
def heatwave_choropleth(
    date: str = Query(..., description="YYYY-MM-DD"),
    level: str = Query(default="daily", pattern="^(daily|weekly)$"),
) -> dict[str, Any]:
    district = _district_index()

    if level == "daily":
        target = pd.to_datetime(date, errors="coerce")
        if pd.isna(target):
            raise HTTPException(status_code=400, detail="invalid date")
        selected = district[district["date"] == target].copy()
        if selected.empty:
            raise HTTPException(status_code=404, detail="no data for selected date")
        selected = selected[
            ["date", "district_code", "district_name", "tmax_c", "intensity_score", "intensity_category"]
        ]
        return _join_district_features(selected, "date")

    weekly = _weekly_rollup(district)
    target = pd.to_datetime(date, errors="coerce")
    if pd.isna(target):
        raise HTTPException(status_code=400, detail="invalid date")
    selected = weekly[weekly["week_start"] == target].copy()
    if selected.empty:
        raise HTTPException(status_code=404, detail="no data for selected week")
    selected = selected[
        ["week_start", "district_code", "district_name", "tmax_c", "intensity_score", "intensity_category"]
    ]
    return _join_district_features(selected, "week_start")
