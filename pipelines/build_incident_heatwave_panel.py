"""Build district-day panel linking incidents with heatwave intensity and lag features."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd

INCIDENTS_GEO = Path("data_processed/heatstroke_incidents.geojson")
HEATWAVE_INDEX = Path("data_processed/heatwave_index_daily.parquet")
OUT_PANEL = Path("data_processed/incident_heatwave_panel.parquet")


def _prepare_heatwave() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    hx = pd.read_parquet(HEATWAVE_INDEX)
    hx = hx[hx["entity_type"] == "district"].copy()
    hx["date"] = pd.to_datetime(hx["date"])
    hx["doy"] = hx["date"].dt.dayofyear

    keep = ["district_code", "date", "doy", "tmax_c", "intensity_score", "intensity_category"]
    hx = hx[keep].dropna(subset=["district_code"])

    clim = (
        hx.groupby(["district_code", "doy"], as_index=False)
        .agg(
            tmax_c=("tmax_c", "mean"),
            intensity_score=("intensity_score", "mean"),
            intensity_category=("intensity_category", lambda x: x.mode().iloc[0]),
        )
        .rename(
            columns={
                "tmax_c": "clim_tmax_c",
                "intensity_score": "clim_intensity_score",
                "intensity_category": "clim_intensity_category",
            }
        )
    )

    nat = (
        hx.groupby(["doy"], as_index=False)
        .agg(
            nat_tmax_c=("tmax_c", "mean"),
            nat_intensity_score=("intensity_score", "mean"),
            nat_intensity_category=("intensity_category", lambda x: x.mode().iloc[0]),
        )
        .rename(columns={"doy": "doy_nat"})
    )
    nat = nat.set_index("doy_nat").sort_index()
    nat = nat.reindex(range(1, 367))
    nat["nat_tmax_c"] = nat["nat_tmax_c"].ffill().bfill()
    nat["nat_intensity_score"] = nat["nat_intensity_score"].ffill().bfill()
    nat["nat_intensity_category"] = nat["nat_intensity_category"].ffill().bfill().fillna("none")
    nat = nat.reset_index().rename(columns={"index": "doy_nat"})

    return hx, clim, nat


def _attach_heatwave_for_date(
    df: pd.DataFrame, hx: pd.DataFrame, clim: pd.DataFrame, nat: pd.DataFrame, prefix: str
) -> pd.DataFrame:
    out = df.merge(
        hx.rename(
            columns={
                "date": f"{prefix}_date",
                "tmax_c": f"{prefix}_tmax_c_exact",
                "intensity_score": f"{prefix}_intensity_score_exact",
                "intensity_category": f"{prefix}_intensity_category_exact",
            }
        )[["district_code", f"{prefix}_date", f"{prefix}_tmax_c_exact", f"{prefix}_intensity_score_exact", f"{prefix}_intensity_category_exact"]],
        left_on=["district_code", f"{prefix}_date"],
        right_on=["district_code", f"{prefix}_date"],
        how="left",
    )

    out[f"{prefix}_doy"] = pd.to_datetime(out[f"{prefix}_date"]).dt.dayofyear
    out = out.merge(clim, left_on=["district_code", f"{prefix}_doy"], right_on=["district_code", "doy"], how="left")
    out = out.merge(nat, left_on=f"{prefix}_doy", right_on="doy_nat", how="left")

    out[f"{prefix}_tmax_c"] = (
        out[f"{prefix}_tmax_c_exact"].fillna(out["clim_tmax_c"]).fillna(out["nat_tmax_c"])
    )
    out[f"{prefix}_intensity_score"] = (
        out[f"{prefix}_intensity_score_exact"].fillna(out["clim_intensity_score"]).fillna(out["nat_intensity_score"])
    )
    out[f"{prefix}_intensity_category"] = (
        out[f"{prefix}_intensity_category_exact"]
        .fillna(out["clim_intensity_category"])
        .fillna(out["nat_intensity_category"])
    )

    out[f"{prefix}_match_strategy"] = "exact"
    out.loc[out[f"{prefix}_intensity_score_exact"].isna() & out["clim_intensity_score"].notna(), f"{prefix}_match_strategy"] = "climatology_doy"
    out.loc[
        out[f"{prefix}_intensity_score_exact"].isna()
        & out["clim_intensity_score"].isna()
        & out["nat_intensity_score"].notna(),
        f"{prefix}_match_strategy",
    ] = "national_climatology_doy"
    out.loc[out[f"{prefix}_intensity_score"].isna(), f"{prefix}_match_strategy"] = "missing"

    drop_cols = [
        "doy",
        "clim_tmax_c",
        "clim_intensity_score",
        "clim_intensity_category",
        "nat_tmax_c",
        "nat_intensity_score",
        "nat_intensity_category",
        "doy_nat",
        f"{prefix}_tmax_c_exact",
        f"{prefix}_intensity_score_exact",
        f"{prefix}_intensity_category_exact",
    ]
    return out.drop(columns=[c for c in drop_cols if c in out.columns])


def main() -> None:
    incidents = gpd.read_file(INCIDENTS_GEO)
    incidents["event_date"] = pd.to_datetime(incidents["date_occurred"], errors="coerce")
    incidents["event_date"] = incidents["event_date"].fillna(pd.to_datetime(incidents["date_published"], errors="coerce"))
    incidents = incidents.dropna(subset=["event_date", "district_code"]).copy()

    hx, clim, nat = _prepare_heatwave()

    panel = incidents.drop(columns=["geometry"]).copy()
    panel["event_date"] = pd.to_datetime(panel["event_date"])  # normalize

    for lag in range(0, 8):
        prefix = f"lag_{lag}"
        panel[f"{prefix}_date"] = panel["event_date"] - pd.to_timedelta(lag, unit="D")
        panel = _attach_heatwave_for_date(panel, hx=hx, clim=clim, nat=nat, prefix=prefix)

    panel.to_parquet(OUT_PANEL, index=False)
    print(f"Wrote {OUT_PANEL} ({len(panel)} rows)")


if __name__ == "__main__":
    main()
