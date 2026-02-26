from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.api.admin import get_district_by_code, get_districts, get_upazila_by_code
from app.api.analysis import analysis_heatmap, analysis_lags, analysis_metrics
from app.api.exposure import mobility_ranking, population_districts
from app.api.forecast import forecast_dates, forecast_next7, top_upazilas
from app.api.heatwave import heatwave_categories, heatwave_dates, heatwave_summary
from app.api.smc import priority_index, priority_map


def test_admin_handlers() -> None:
    districts = get_districts()
    assert districts["type"] == "FeatureCollection"
    one = get_district_by_code("BD-13")
    assert one["properties"]["district_code"] == "BD-13"
    upa = get_upazila_by_code("BD-10-41")
    assert upa["properties"]["upazila_code"] == "BD-10-41"


def test_heatwave_handlers() -> None:
    summary = heatwave_summary()
    assert summary["country"] == "Bangladesh"
    dates = heatwave_dates("daily")
    assert len(dates["dates"]) > 0
    cats = heatwave_categories()
    assert "categories" in cats


def test_analysis_handlers() -> None:
    metrics = analysis_metrics()
    assert "lag_correlations" in metrics
    lags = analysis_lags()
    assert len(lags) > 0
    heatmap = analysis_heatmap()
    assert "matrix" in heatmap


def test_forecast_handlers() -> None:
    geo = forecast_next7()
    assert geo["type"] == "FeatureCollection"
    dates = forecast_dates()
    assert len(dates["dates"]) == 7
    top = top_upazilas(5)
    assert len(top) > 0


def test_exposure_handlers() -> None:
    pop = population_districts()
    assert pop["type"] == "FeatureCollection"
    rank = mobility_ranking(5)
    assert len(rank) > 0


def test_smc_handlers() -> None:
    idx = priority_index(limit=5, area_type="district")
    assert len(idx) > 0
    geo = priority_map()
    assert geo["type"] == "FeatureCollection"
