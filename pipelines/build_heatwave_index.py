"""Compute reproducible heatwave index from daily Tmax."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

GRID_IN = Path("data_processed/tmax_daily.parquet")
DISTRICT_IN = Path("data_processed/tmax_daily_district.parquet")
OUT = Path("data_processed/heatwave_index_daily.parquet")
MODEL_VERSION = "heatwave-index-v1.0"


def _compute_index(df: pd.DataFrame, entity_type: str) -> pd.DataFrame:
    out = df.copy()
    out["date"] = pd.to_datetime(out["date"])
    out["doy"] = out["date"].dt.dayofyear

    out["threshold_36"] = (out["tmax_c"] >= 36.0).astype(int)
    out["threshold_38"] = (out["tmax_c"] >= 38.0).astype(int)
    out["threshold_40"] = (out["tmax_c"] >= 40.0).astype(int)
    out["threshold_level"] = out[["threshold_36", "threshold_38", "threshold_40"]].sum(axis=1)

    if entity_type == "district":
        group_cols = ["district_code", "doy"]
    else:
        group_cols = ["grid_id", "doy"]

    p90 = (
        out.groupby(group_cols, as_index=False)["tmax_c"]
        .quantile(0.9)
        .rename(columns={"tmax_c": "p90_doy"})
    )

    out = out.merge(p90, on=group_cols, how="left")
    out["anomaly_c"] = out["tmax_c"] - out["p90_doy"]
    out["anomaly_flag"] = (out["anomaly_c"] > 0).astype(int)

    out["intensity_score"] = out["threshold_level"] + out["anomaly_flag"]
    out["intensity_category"] = "none"
    out.loc[out["intensity_score"] == 1, "intensity_category"] = "watch"
    out.loc[out["intensity_score"] == 2, "intensity_category"] = "high"
    out.loc[out["intensity_score"] >= 3, "intensity_category"] = "extreme"

    out["entity_type"] = entity_type
    out["model_version"] = MODEL_VERSION
    return out


def main() -> None:
    frames: list[pd.DataFrame] = []

    if GRID_IN.exists():
        grid = pd.read_parquet(GRID_IN)
        frames.append(_compute_index(grid, entity_type="grid"))

    if DISTRICT_IN.exists():
        district = pd.read_parquet(DISTRICT_IN)
        frames.append(_compute_index(district, entity_type="district"))

    if not frames:
        raise FileNotFoundError("No Tmax parquet inputs found")

    merged = pd.concat(frames, ignore_index=True)
    merged = merged.sort_values(["date", "entity_type"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    merged.to_parquet(OUT, index=False)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
