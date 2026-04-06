"""Tests for anomalies, rolling means, and persistence counters."""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from app.services.heat_features import add_heat_feature_columns


def test_anomalies_and_persistence_on_toy_series() -> None:
    """Persistence counters and anomalies should match expected values."""

    district_id = "district-a"
    daily = pd.DataFrame(
        [
            {"country_code": "IN", "district_id": district_id, "date": date(2024, 5, 1), "tmax_c": 34.0, "tmin_c": 20.0, "rh_mean": 30.0},
            {"country_code": "IN", "district_id": district_id, "date": date(2024, 5, 2), "tmax_c": 36.0, "tmin_c": 21.0, "rh_mean": 30.0},
            {"country_code": "IN", "district_id": district_id, "date": date(2024, 5, 3), "tmax_c": 41.0, "tmin_c": 22.0, "rh_mean": 30.0},
            {"country_code": "IN", "district_id": district_id, "date": date(2024, 5, 4), "tmax_c": 39.0, "tmin_c": 23.0, "rh_mean": 30.0},
            {"country_code": "IN", "district_id": district_id, "date": date(2024, 5, 5), "tmax_c": 46.0, "tmin_c": 24.0, "rh_mean": 30.0},
        ]
    )

    normals = pd.DataFrame(
        [
            {
                "country_code": "IN",
                "district_id": district_id,
                "month": 5,
                "normal_tmax_c": 30.0,
                "normal_hi_max_c": 30.0,
            }
        ]
    )
    warm_nights = pd.DataFrame(
        [
            {
                "country_code": "IN",
                "district_id": district_id,
                "month": 5,
                "tmin_p90_c": 22.5,
            }
        ]
    )

    enriched = add_heat_feature_columns(daily, normals_df=normals, warm_night_thresholds_df=warm_nights)

    assert enriched["consecutive_hi_days_gt_35_c"].tolist() == [0, 1, 2, 3, 4]
    assert enriched["consecutive_hi_days_gt_40_c"].tolist() == [0, 0, 1, 0, 1]
    assert enriched["consecutive_hi_days_gt_45_c"].tolist() == [0, 0, 0, 0, 1]
    assert enriched["anom_tmax"].tolist() == [4.0, 6.0, 11.0, 9.0, 16.0]
    assert enriched["anom_hi"].tolist() == [4.0, 6.0, 11.0, 9.0, 16.0]
    assert enriched["warm_night_flag"].tolist() == [False, False, False, True, True]
    assert enriched.loc[2, "hi_3day_mean"] == pytest.approx(37.0, abs=1e-6)
    assert enriched.loc[4, "hi_3day_mean"] == pytest.approx(42.0, abs=1e-6)
