"""Build composite SMC priority index from forecast, population exposure, and mobility."""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

FORECAST_GEO = Path("data_processed/hotspots_next7days.geojson")
POP_ADMIN = Path("data_processed/pop_density_admin.parquet")
MOBILITY = Path("data_processed/mobility_proxy.parquet")
DISTRICT_GEO = Path("data_processed/bd_admin_district.geojson")
UPAZILA_GEO = Path("data_processed/bd_admin_upazila.geojson")
TOP_UPAZILA = Path("data_processed/top_20_upazilas.csv")

OUT_CSV = Path("data_processed/smc_priority_index.csv")
OUT_GEO = Path("data_processed/smc_priority_map.geojson")

WEIGHTS = {
    "heatwave": 0.5,
    "population": 0.3,
    "mobility": 0.2,
}


def _normalize(series: pd.Series) -> pd.Series:
    lo, hi = float(series.min()), float(series.max())
    if hi <= lo:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - lo) / (hi - lo)


def _district_priority() -> pd.DataFrame:
    forecast = gpd.read_file(FORECAST_GEO)
    pop = pd.read_parquet(POP_ADMIN)
    mob = pd.read_parquet(MOBILITY)
    district_base = gpd.read_file(DISTRICT_GEO)[["district_code", "district_name"]].copy()

    fx = (
        forecast.groupby(["district_code", "district_name"], as_index=False)
        .agg(
            heatwave_prob_max=("risk_probability", "max"),
            heatwave_prob_mean=("risk_probability", "mean"),
        )
        .sort_values("heatwave_prob_max", ascending=False)
    )
    fx["heatwave_forecast_score"] = 0.6 * fx["heatwave_prob_max"] + 0.4 * fx["heatwave_prob_mean"]

    df = district_base.merge(fx, on=["district_code", "district_name"], how="left").merge(
        pop,
        on=["district_code", "district_name"],
        how="left",
    ).merge(
        mob[["district_code", "district_name", "movement_intensity_proxy"]],
        on=["district_code", "district_name"],
        how="left",
    )
    df["heatwave_forecast_score"] = df["heatwave_forecast_score"].fillna(0)

    df["pop_exposure_score"] = _normalize(df["population_exposed_proxy"].fillna(0))
    df["mobility_proxy_score"] = _normalize(df["movement_intensity_proxy"].fillna(0))

    df["smc_priority_score"] = (
        WEIGHTS["heatwave"] * df["heatwave_forecast_score"].fillna(0)
        + WEIGHTS["population"] * df["pop_exposure_score"]
        + WEIGHTS["mobility"] * df["mobility_proxy_score"]
    )
    df["smc_priority_rank"] = df["smc_priority_score"].rank(ascending=False, method="dense").astype(int)

    df["explainability_note"] = df.apply(
        lambda r: (
            f"heatwave={r['heatwave_forecast_score']:.3f}*0.5 + "
            f"population={r['pop_exposure_score']:.3f}*0.3 + "
            f"mobility={r['mobility_proxy_score']:.3f}*0.2"
        ),
        axis=1,
    )

    df["area_type"] = "district"
    return df


def _upazila_priority(district_df: pd.DataFrame) -> pd.DataFrame:
    upa = gpd.read_file(UPAZILA_GEO)[["upazila_code", "upazila_name", "district_code", "district_name"]]
    top = pd.read_csv(TOP_UPAZILA)

    merged = upa.merge(
        top[["upazila_code", "upazila_name", "district_code", "district_name", "risk_probability"]],
        on=["upazila_code", "upazila_name", "district_code", "district_name"],
        how="left",
    )
    merged = merged.merge(
        district_df[["district_code", "pop_exposure_score", "mobility_proxy_score"]],
        on="district_code",
        how="left",
    )

    merged["heatwave_forecast_score"] = merged["risk_probability"].fillna(0)
    merged["pop_exposure_score"] = merged["pop_exposure_score"].fillna(0)
    merged["mobility_proxy_score"] = merged["mobility_proxy_score"].fillna(0)

    merged["smc_priority_score"] = (
        WEIGHTS["heatwave"] * merged["heatwave_forecast_score"]
        + WEIGHTS["population"] * merged["pop_exposure_score"]
        + WEIGHTS["mobility"] * merged["mobility_proxy_score"]
    )
    merged["smc_priority_rank"] = merged["smc_priority_score"].rank(ascending=False, method="dense").astype(int)
    merged["explainability_note"] = merged.apply(
        lambda r: (
            f"heatwave={r['heatwave_forecast_score']:.3f}*0.5 + "
            f"population={r['pop_exposure_score']:.3f}*0.3 + "
            f"mobility={r['mobility_proxy_score']:.3f}*0.2"
        ),
        axis=1,
    )
    merged["area_type"] = "upazila"
    return merged


def _write_priority_map(district_df: pd.DataFrame, upazila_df: pd.DataFrame) -> None:
    d_geo = gpd.read_file(DISTRICT_GEO)
    u_geo = gpd.read_file(UPAZILA_GEO)

    d = d_geo.merge(
        district_df[
            [
                "district_code",
                "district_name",
                "smc_priority_score",
                "smc_priority_rank",
                "heatwave_forecast_score",
                "pop_exposure_score",
                "mobility_proxy_score",
                "explainability_note",
                "area_type",
            ]
        ],
        on=["district_code", "district_name"],
        how="left",
    )

    u = u_geo.merge(
        upazila_df[
            [
                "upazila_code",
                "upazila_name",
                "district_code",
                "district_name",
                "smc_priority_score",
                "smc_priority_rank",
                "heatwave_forecast_score",
                "pop_exposure_score",
                "mobility_proxy_score",
                "explainability_note",
                "area_type",
            ]
        ],
        on=["upazila_code", "upazila_name", "district_code", "district_name"],
        how="left",
    )

    all_geo = pd.concat([d, u], ignore_index=True)
    gdf = gpd.GeoDataFrame(all_geo, geometry="geometry", crs="EPSG:4326")
    gdf.to_file(OUT_GEO, driver="GeoJSON")


def main() -> None:
    district_df = _district_priority()
    upazila_df = _upazila_priority(district_df)

    district_keep = district_df[
        [
            "area_type",
            "district_code",
            "district_name",
            "heatwave_forecast_score",
            "pop_exposure_score",
            "mobility_proxy_score",
            "smc_priority_score",
            "smc_priority_rank",
            "explainability_note",
        ]
    ].copy()
    district_keep["upazila_code"] = ""
    district_keep["upazila_name"] = ""

    upazila_keep = upazila_df[
        [
            "area_type",
            "district_code",
            "district_name",
            "upazila_code",
            "upazila_name",
            "heatwave_forecast_score",
            "pop_exposure_score",
            "mobility_proxy_score",
            "smc_priority_score",
            "smc_priority_rank",
            "explainability_note",
        ]
    ].copy()

    final = pd.concat([district_keep, upazila_keep], ignore_index=True)
    final = final.sort_values(["area_type", "smc_priority_rank", "smc_priority_score"], ascending=[True, True, False])
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    final.to_csv(OUT_CSV, index=False)

    _write_priority_map(district_df, upazila_df)

    top_dist = district_keep.sort_values("smc_priority_score", ascending=False).head(20)
    top_upa = upazila_keep.sort_values("smc_priority_score", ascending=False).head(20)

    stable_report = {
        "weighting": WEIGHTS,
        "top_districts": top_dist[["district_name", "smc_priority_score"]].to_dict(orient="records"),
        "top_upazilas": top_upa[["upazila_name", "district_name", "smc_priority_score"]].to_dict(orient="records"),
    }
    Path("data_processed/smc_priority_meta.json").write_text(json.dumps(stable_report, indent=2), encoding="utf-8")

    print(f"Wrote {OUT_CSV} ({len(final)} rows)")
    print(f"Wrote {OUT_GEO}")


if __name__ == "__main__":
    main()
