"""Tests for demand quantile forecasts."""

from __future__ import annotations

import uuid

import numpy as np
import pandas as pd

from app.services.demand_model import HierarchicalDemandForecaster


def _make_synthetic_frames() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(7)
    periods = 240
    dates = pd.date_range("2023-01-01", periods=periods, freq="D")
    district_id = str(uuid.uuid4())
    sku_id = "electrolyte_drink_main"

    hi = 34 + 5 * np.sin(np.arange(periods) / 15) + rng.normal(0, 1.0, periods)
    tmax = hi - rng.normal(2.5, 0.3, periods)
    promo = (np.arange(periods) % 17 == 0).astype(int)
    price = 2.8 + 0.2 * np.sin(np.arange(periods) / 21)
    units = 120 + 2.4 * hi + 18 * promo - 6 * price + rng.normal(0, 4.5, periods)

    demand = pd.DataFrame(
        {
            "country_code": "IN",
            "district_id": district_id,
            "sku_id": sku_id,
            "date": dates.date,
            "units": units,
            "revenue": units * price,
            "in_stock_flag": True,
            "price": price,
            "promo_flag": promo.astype(bool),
        }
    )
    weather = pd.DataFrame(
        {
            "country_code": "IN",
            "district_id": district_id,
            "date": dates.date,
            "tmax_c": tmax,
            "tmin_c": tmax - 7,
            "rh_mean": 55,
            "hi_max_c": hi,
            "hi_3day_mean": pd.Series(hi).rolling(3, min_periods=1).mean().to_numpy(),
            "hi_7day_mean": pd.Series(hi).rolling(7, min_periods=1).mean().to_numpy(),
            "consecutive_hi_days_gt_35_c": (hi > 35).astype(int),
            "consecutive_hi_days_gt_40_c": (hi > 40).astype(int),
            "consecutive_hi_days_gt_45_c": (hi > 45).astype(int),
            "warm_night_flag": (tmax > 35).astype(int),
            "anom_tmax": tmax - np.mean(tmax),
            "anom_hi": hi - np.mean(hi),
            "data_quality_score": 1.0,
        }
    )
    districts = pd.DataFrame(
        {
            "country_code": ["IN"],
            "district_id": [district_id],
            "admin1": ["Gujarat"],
            "name": ["Ahmedabad"],
        }
    )
    return demand, weather, districts


def test_quantile_model_orders_predictions_and_has_reasonable_coverage() -> None:
    """The quantile forecaster should preserve ordering and cover holdout observations."""

    demand, weather, districts = _make_synthetic_frames()
    train_demand = demand.iloc[:200].copy()
    train_weather = weather.iloc[:200].copy()
    future = demand.iloc[200:].copy().merge(
        weather[["country_code", "district_id", "date", "tmax_c", "hi_max_c", "anom_hi", "warm_night_flag"]],
        on=["country_code", "district_id", "date"],
        how="left",
    )

    model = HierarchicalDemandForecaster(min_training_rows=60, random_state=13).fit(
        demand_actuals=train_demand,
        weather_features=train_weather,
        district_metadata=districts,
    )
    predictions = model.predict(future)

    assert not predictions.empty
    assert (predictions["p10"] <= predictions["p50"]).all()
    assert (predictions["p50"] <= predictions["p90"]).all()

    scored = predictions.merge(
        demand[["country_code", "district_id", "sku_id", "date", "units"]],
        left_on=["country_code", "district_id", "sku_id", "forecast_date"],
        right_on=["country_code", "district_id", "sku_id", "date"],
        how="left",
    )
    coverage = ((scored["units"] >= scored["p10"]) & (scored["units"] <= scored["p90"])).mean()
    assert 0.55 <= coverage <= 1.0
