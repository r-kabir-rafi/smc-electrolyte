"""Real-time weather and electrolyte risk API endpoints."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/realtime", tags=["realtime"])

REALTIME_DAILY_PATH = Path("data_processed/heatwave_realtime_daily.geojson")
FORECAST_PATH = Path("data_processed/forecast_realtime.geojson")
HISTORICAL_CSV = Path("data_raw/temperature/historical_latest.csv")
FORECAST_CSV = Path("data_raw/temperature/forecast_latest.csv")


def _load_geojson(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found: {path.name}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/current")
def current_conditions() -> dict[str, Any]:
    """Get current/latest weather conditions with electrolyte risk for all districts."""
    data = _load_geojson(REALTIME_DAILY_PATH)
    
    # Get latest date
    dates = set()
    for feat in data.get("features", []):
        d = feat.get("properties", {}).get("date")
        if d:
            dates.add(d)
    
    latest_date = max(dates) if dates else None
    
    # Filter to latest date only
    latest_features = [
        f for f in data.get("features", [])
        if f.get("properties", {}).get("date") == latest_date
    ]
    
    # Sort by risk score descending
    latest_features.sort(
        key=lambda x: x.get("properties", {}).get("risk_score", 0),
        reverse=True
    )
    
    return {
        "type": "FeatureCollection",
        "as_of_date": latest_date,
        "features": latest_features,
    }


@router.get("/forecast")
def forecast_conditions() -> dict[str, Any]:
    """Get 7-day forecast with electrolyte risk predictions."""
    data = _load_geojson(FORECAST_PATH)
    return data


@router.get("/dates")
def available_dates() -> dict[str, list[str]]:
    """Get list of available dates in historical and forecast data."""
    result = {"historical": [], "forecast": []}
    
    try:
        hist = _load_geojson(REALTIME_DAILY_PATH)
        dates = set()
        for feat in hist.get("features", []):
            d = feat.get("properties", {}).get("date")
            if d:
                dates.add(d)
        result["historical"] = sorted(dates)
    except Exception:
        pass
    
    try:
        fc = _load_geojson(FORECAST_PATH)
        dates = set()
        for feat in fc.get("features", []):
            d = feat.get("properties", {}).get("forecast_date")
            if d:
                dates.add(d)
        result["forecast"] = sorted(dates)
    except Exception:
        pass
    
    return result


@router.get("/choropleth")
def realtime_choropleth(date: str = Query(..., description="Date in YYYY-MM-DD format")) -> dict[str, Any]:
    """Get choropleth data for a specific date."""
    data = _load_geojson(REALTIME_DAILY_PATH)
    
    features = [
        f for f in data.get("features", [])
        if f.get("properties", {}).get("date") == date
    ]
    
    if not features:
        raise HTTPException(status_code=404, detail=f"No data for date: {date}")
    
    return {
        "type": "FeatureCollection",
        "date": date,
        "features": features,
    }


@router.get("/electrolyte-risk")
def electrolyte_risk_summary() -> dict[str, Any]:
    """Get electrolyte risk summary across all districts."""
    data = _load_geojson(REALTIME_DAILY_PATH)
    
    # Get latest date
    dates = set()
    for feat in data.get("features", []):
        d = feat.get("properties", {}).get("date")
        if d:
            dates.add(d)
    latest_date = max(dates) if dates else None
    
    # Filter to latest
    latest = [
        f.get("properties", {})
        for f in data.get("features", [])
        if f.get("properties", {}).get("date") == latest_date
    ]
    
    # Count by risk category
    categories = {"extreme": 0, "high": 0, "moderate": 0, "low": 0, "minimal": 0}
    for props in latest:
        cat = props.get("risk_category", "minimal")
        if cat in categories:
            categories[cat] += 1
    
    # Top risk districts
    top_risk = sorted(latest, key=lambda x: x.get("risk_score", 0), reverse=True)[:5]
    
    # Total electrolyte packs needed estimation
    total_packs = sum(p.get("recommended_electrolyte_packs", 0) for p in latest)
    total_water = sum(p.get("recommended_water_liters", 0) for p in latest)
    
    return {
        "as_of_date": latest_date,
        "risk_distribution": categories,
        "top_risk_districts": [
            {
                "district": p.get("district_name"),
                "risk_score": p.get("risk_score"),
                "risk_category": p.get("risk_category"),
                "tmax_c": p.get("tmax_c"),
                "heat_index_c": p.get("heat_index_c"),
                "recommendation": p.get("recommendation"),
            }
            for p in top_risk
        ],
        "total_districts": len(latest),
        "estimated_electrolyte_packs_per_person": total_packs / max(1, len(latest)),
        "estimated_water_liters_per_person": total_water / max(1, len(latest)),
    }


@router.get("/forecast-risk")
def forecast_risk_timeline() -> dict[str, Any]:
    """Get electrolyte risk forecast for next 7 days."""
    data = _load_geojson(FORECAST_PATH)
    
    # Group by date
    by_date = {}
    for feat in data.get("features", []):
        props = feat.get("properties", {})
        date = props.get("forecast_date")
        if not date:
            continue
        
        if date not in by_date:
            by_date[date] = {
                "extreme": 0, "high": 0, "moderate": 0, "low": 0, "minimal": 0,
                "avg_temp": 0, "avg_risk": 0, "count": 0, "total_packs": 0
            }
        
        cat = props.get("risk_category", "minimal")
        if cat in by_date[date]:
            by_date[date][cat] += 1
        by_date[date]["avg_temp"] += props.get("tmax_c", 0)
        by_date[date]["avg_risk"] += props.get("risk_score", 0)
        by_date[date]["total_packs"] += props.get("recommended_electrolyte_packs", 0)
        by_date[date]["count"] += 1
    
    # Calculate averages
    timeline = []
    for date in sorted(by_date.keys()):
        d = by_date[date]
        count = max(1, d["count"])
        timeline.append({
            "date": date,
            "avg_tmax_c": round(d["avg_temp"] / count, 1),
            "avg_risk_score": round(d["avg_risk"] / count, 3),
            "risk_distribution": {
                "extreme": d["extreme"],
                "high": d["high"],
                "moderate": d["moderate"],
                "low": d["low"],
                "minimal": d["minimal"],
            },
            "total_electrolyte_packs_needed": d["total_packs"],
        })
    
    return {"forecast_timeline": timeline}
