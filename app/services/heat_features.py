"""Heat feature engineering utilities."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import numpy as np
import pandas as pd


DEFAULT_NORMAL_YEARS = (1991, 2020)
PERSISTENCE_THRESHOLDS_C = (35.0, 40.0, 45.0)


def celsius_to_fahrenheit(value_c: float | np.ndarray) -> float | np.ndarray:
    """Convert Celsius to Fahrenheit."""

    return (value_c * 9.0 / 5.0) + 32.0


def fahrenheit_to_celsius(value_f: float | np.ndarray) -> float | np.ndarray:
    """Convert Fahrenheit to Celsius."""

    return (value_f - 32.0) * 5.0 / 9.0


def rothfusz_heat_index_c(
    temperature_c: float | np.ndarray,
    relative_humidity: float | np.ndarray,
) -> float | np.ndarray:
    """Compute heat index in Celsius using the Rothfusz regression.

    The regression is only applied for temperatures at or above 26.7C (80F)
    and relative humidity at or above 40%. For cooler or drier conditions,
    the function returns the air temperature itself.
    """

    temp_arr = np.asarray(temperature_c, dtype=float)
    rh_arr = np.asarray(relative_humidity, dtype=float)
    temp_f = celsius_to_fahrenheit(temp_arr)

    regression_f = (
        -42.379
        + 2.04901523 * temp_f
        + 10.14333127 * rh_arr
        - 0.22475541 * temp_f * rh_arr
        - 6.83783e-3 * temp_f**2
        - 5.481717e-2 * rh_arr**2
        + 1.22874e-3 * temp_f**2 * rh_arr
        + 8.5282e-4 * temp_f * rh_arr**2
        - 1.99e-6 * temp_f**2 * rh_arr**2
    )

    applies = (temp_arr >= 26.7) & (rh_arr >= 40.0)

    low_humidity_adjustment = (
        ((13.0 - rh_arr) / 4.0)
        * np.sqrt(np.maximum(0.0, (17.0 - np.abs(temp_f - 95.0)) / 17.0))
    )
    low_humidity_mask = applies & (rh_arr < 13.0) & (temp_f >= 80.0) & (temp_f <= 112.0)
    regression_f = np.where(low_humidity_mask, regression_f - low_humidity_adjustment, regression_f)

    high_humidity_adjustment = ((rh_arr - 85.0) / 10.0) * ((87.0 - temp_f) / 5.0)
    high_humidity_mask = applies & (rh_arr > 85.0) & (temp_f >= 80.0) & (temp_f <= 87.0)
    regression_f = np.where(high_humidity_mask, regression_f + high_humidity_adjustment, regression_f)

    result_c = np.where(applies, fahrenheit_to_celsius(regression_f), temp_arr)
    if temp_arr.ndim == 0 and rh_arr.ndim == 0:
        return float(np.asarray(result_c).item())
    return result_c


def consecutive_days_above_threshold(
    values: pd.Series,
    threshold_c: float,
) -> pd.Series:
    """Return consecutive-day counters for values above a threshold."""

    counts: list[int] = []
    streak = 0
    for value in values.fillna(-np.inf):
        if value > threshold_c:
            streak += 1
        else:
            streak = 0
        counts.append(streak)
    return pd.Series(counts, index=values.index, dtype="int64")


def compute_monthly_normals(
    historical_df: pd.DataFrame,
    start_year: int = DEFAULT_NORMAL_YEARS[0],
    end_year: int = DEFAULT_NORMAL_YEARS[1],
) -> pd.DataFrame:
    """Compute district-month normals from a historical daily feature frame."""

    if historical_df.empty:
        return pd.DataFrame(
            columns=["country_code", "district_id", "month", "normal_tmax_c", "normal_hi_max_c"]
        )

    frame = historical_df.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.loc[frame["date"].dt.year.between(start_year, end_year)]
    if frame.empty:
        return pd.DataFrame(
            columns=["country_code", "district_id", "month", "normal_tmax_c", "normal_hi_max_c"]
        )

    frame["month"] = frame["date"].dt.month
    normals = (
        frame.groupby(["country_code", "district_id", "month"], observed=True)
        .agg(normal_tmax_c=("tmax_c", "mean"), normal_hi_max_c=("hi_max_c", "mean"))
        .reset_index()
    )
    return normals


def compute_monthly_tmin_percentiles(
    historical_df: pd.DataFrame,
    percentile: float = 0.90,
    start_year: int = DEFAULT_NORMAL_YEARS[0],
    end_year: int = DEFAULT_NORMAL_YEARS[1],
) -> pd.DataFrame:
    """Compute district-month warm night thresholds from historical tmin."""

    if historical_df.empty:
        return pd.DataFrame(columns=["country_code", "district_id", "month", "tmin_p90_c"])

    frame = historical_df.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.loc[frame["date"].dt.year.between(start_year, end_year)]
    if frame.empty:
        return pd.DataFrame(columns=["country_code", "district_id", "month", "tmin_p90_c"])

    frame["month"] = frame["date"].dt.month
    percentiles = (
        frame.groupby(["country_code", "district_id", "month"], observed=True)["tmin_c"]
        .quantile(percentile)
        .rename("tmin_p90_c")
        .reset_index()
    )
    return percentiles


def add_heat_feature_columns(
    daily_df: pd.DataFrame,
    normals_df: pd.DataFrame | None = None,
    warm_night_thresholds_df: pd.DataFrame | None = None,
    persistence_thresholds_c: Iterable[float] = PERSISTENCE_THRESHOLDS_C,
) -> pd.DataFrame:
    """Enrich district-day weather aggregates with heat features."""

    required_columns = {"country_code", "district_id", "date", "tmax_c", "tmin_c", "rh_mean"}
    missing = required_columns.difference(daily_df.columns)
    if missing:
        raise ValueError(f"Daily weather frame is missing columns: {sorted(missing)}")

    frame = daily_df.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.sort_values(["country_code", "district_id", "date"]).reset_index(drop=True)
    frame["hi_max_c"] = rothfusz_heat_index_c(frame["tmax_c"].to_numpy(), frame["rh_mean"].to_numpy())

    grouped = frame.groupby(["country_code", "district_id"], observed=True, sort=False)
    frame["hi_3day_mean"] = grouped["hi_max_c"].transform(
        lambda series: series.rolling(window=3, min_periods=1).mean()
    )
    frame["hi_7day_mean"] = grouped["hi_max_c"].transform(
        lambda series: series.rolling(window=7, min_periods=1).mean()
    )

    for threshold in persistence_thresholds_c:
        suffix = str(int(threshold))
        column = f"consecutive_hi_days_gt_{suffix}_c"
        frame[column] = grouped["hi_max_c"].transform(
            lambda series, thr=threshold: consecutive_days_above_threshold(series, thr)
        )

    frame["month"] = frame["date"].dt.month

    if normals_df is not None and not normals_df.empty:
        merged = frame.merge(
            normals_df,
            on=["country_code", "district_id", "month"],
            how="left",
        )
        frame["anom_tmax"] = merged["tmax_c"] - merged["normal_tmax_c"]
        frame["anom_hi"] = merged["hi_max_c"] - merged["normal_hi_max_c"]
    else:
        frame["anom_tmax"] = np.nan
        frame["anom_hi"] = np.nan

    if warm_night_thresholds_df is not None and not warm_night_thresholds_df.empty:
        merged = frame.merge(
            warm_night_thresholds_df,
            on=["country_code", "district_id", "month"],
            how="left",
        )
        frame["warm_night_flag"] = (merged["tmin_c"] >= merged["tmin_p90_c"]).fillna(False)
    else:
        frame["warm_night_flag"] = False

    if "data_quality_score" not in frame.columns:
        frame["data_quality_score"] = 1.0
    else:
        frame["data_quality_score"] = frame["data_quality_score"].fillna(1.0)

    frame["date"] = frame["date"].dt.date
    return frame[
        [
            "country_code",
            "district_id",
            "date",
            "tmax_c",
            "tmin_c",
            "rh_mean",
            "hi_max_c",
            "hi_3day_mean",
            "hi_7day_mean",
            "consecutive_hi_days_gt_35_c",
            "consecutive_hi_days_gt_40_c",
            "consecutive_hi_days_gt_45_c",
            "warm_night_flag",
            "anom_tmax",
            "anom_hi",
            "data_quality_score",
        ]
    ]

