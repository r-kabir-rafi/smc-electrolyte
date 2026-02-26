"""Build model training dataset for heatwave forecast horizons."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

HX_IN = Path("data_processed/heatwave_index_daily.parquet")
OUT = Path("data_processed/model_training.parquet")

START_YEAR = 2018
END_YEAR = 2025


def _expand_history_from_climatology(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df["doy"] = df["date"].dt.dayofyear

    clim = (
        df.groupby(["district_code", "district_name", "doy"], as_index=False)
        .agg(tmax_c=("tmax_c", "mean"), intensity_score=("intensity_score", "mean"))
        .sort_values(["district_code", "doy"])
    )

    rows: list[dict[str, float | str | int]] = []
    rng = np.random.default_rng(123)

    for (_, row) in clim.iterrows():
        for year in range(START_YEAR, END_YEAR + 1):
            try:
                date = pd.Timestamp.fromisocalendar(year, 1, 1) + pd.Timedelta(days=int(row["doy"] - 1))
            except Exception:
                continue
            if date.year != year:
                continue
            year_trend = (year - START_YEAR) * 0.03
            noise = float(rng.normal(0, 0.5))
            tmax = float(row["tmax_c"]) + year_trend + noise
            intensity = float(row["intensity_score"]) + 0.15 * year_trend + 0.08 * noise

            rows.append(
                {
                    "date": date,
                    "district_code": str(row["district_code"]),
                    "district_name": str(row["district_name"]),
                    "tmax_c": tmax,
                    "intensity_score": max(0.0, intensity),
                }
            )

    out = pd.DataFrame(rows)
    out["date"] = pd.to_datetime(out["date"])  # normalize
    return out.sort_values(["district_code", "date"]).reset_index(drop=True)


def _feature_engineering(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["year"] = out["date"].dt.year
    out["month"] = out["date"].dt.month
    out["doy"] = out["date"].dt.dayofyear
    out["weekofyear"] = out["date"].dt.isocalendar().week.astype(int)

    out["sin_doy"] = np.sin(2 * np.pi * out["doy"] / 365.0)
    out["cos_doy"] = np.cos(2 * np.pi * out["doy"] / 365.0)

    grouped = out.groupby("district_code")
    out["tmax_lag1"] = grouped["tmax_c"].shift(1)
    out["tmax_lag3_mean"] = grouped["tmax_c"].transform(lambda s: s.shift(1).rolling(3).mean())
    out["tmax_lag7_mean"] = grouped["tmax_c"].transform(lambda s: s.shift(1).rolling(7).mean())

    out["intensity_lag1"] = grouped["intensity_score"].shift(1)
    out["intensity_lag3_mean"] = grouped["intensity_score"].transform(lambda s: s.shift(1).rolling(3).mean())
    out["intensity_lag7_mean"] = grouped["intensity_score"].transform(lambda s: s.shift(1).rolling(7).mean())

    out["recent_tmax_trend_7d"] = grouped["tmax_c"].transform(
        lambda s: s.shift(1).rolling(7).apply(
            lambda x: float(x.iloc[-1] - x.iloc[0]) if len(x) == 7 else np.nan
        )
    )

    out["monthly_tmax_clim"] = out.groupby(["district_code", "month"])["tmax_c"].transform("mean")
    out["monthly_intensity_clim"] = out.groupby(["district_code", "month"])["intensity_score"].transform("mean")

    # Targets: class if high/extreme heatwave (intensity >= 2)
    for horizon in [1, 3, 7]:
        out[f"target_h{horizon}"] = (
            grouped["intensity_score"].shift(-horizon).fillna(0) >= 2.0
        ).astype(int)

    out = out.dropna(
        subset=[
            "tmax_lag1",
            "tmax_lag3_mean",
            "tmax_lag7_mean",
            "intensity_lag1",
            "intensity_lag3_mean",
            "intensity_lag7_mean",
            "recent_tmax_trend_7d",
        ]
    )
    return out.reset_index(drop=True)


def main() -> None:
    hx = pd.read_parquet(HX_IN)
    hx = hx[hx["entity_type"] == "district"].copy()

    expanded = _expand_history_from_climatology(hx)
    model_df = _feature_engineering(expanded)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    model_df.to_parquet(OUT, index=False)
    print(f"Wrote {OUT} ({len(model_df)} rows)")


if __name__ == "__main__":
    main()
