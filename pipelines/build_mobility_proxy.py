"""Build district movement intensity proxy from public-feasible components."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

DISTRICT_GEO = Path("data_processed/bd_admin_district.geojson")
POP_AGG = Path("data_processed/pop_density_admin.parquet")
OUT = Path("data_processed/mobility_proxy.parquet")


def _normalize(s: pd.Series) -> pd.Series:
    lo, hi = float(s.min()), float(s.max())
    if hi <= lo:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - lo) / (hi - lo)


def main() -> None:
    gdf = gpd.read_file(DISTRICT_GEO)[["district_code", "district_name", "geometry"]].copy().to_crs("EPSG:4326")
    pop = pd.read_parquet(POP_AGG)

    df = gdf.merge(pop, on=["district_code", "district_name"], how="left")

    # 1) Road-network density proxy: high near urban cores + high population density.
    cent = df.to_crs("EPSG:3857").geometry.centroid.to_crs("EPSG:4326")
    df["centroid_lat"] = cent.y
    df["centroid_lon"] = cent.x

    urban_core_dist = np.sqrt((df["centroid_lat"] - 23.81) ** 2 + (df["centroid_lon"] - 90.41) ** 2)
    df["urban_proximity"] = 1 / (1 + urban_core_dist)
    df["road_network_density_proxy"] = 0.55 * _normalize(df["mean_pop_density"]).fillna(0) + 0.45 * _normalize(df["urban_proximity"]).fillna(0)

    # 2) Transport hub proxy: more hubs in higher-density districts.
    df["transport_hub_proxy"] = np.ceil(1 + 5 * _normalize(df["mean_pop_density"]).fillna(0)).astype(int)

    # 3) Commuter intensity proxy from adjacency + population.
    adjacency = []
    for i, row_i in df.iterrows():
        n = 0
        for j, row_j in df.iterrows():
            if i == j:
                continue
            if row_i.geometry.touches(row_j.geometry):
                n += 1
        adjacency.append(n)
    df["adjacent_district_count"] = adjacency

    pop_norm = _normalize(df["population_exposed_proxy"].fillna(0))
    adj_norm = _normalize(df["adjacent_district_count"].astype(float))
    urb_norm = _normalize(df["urban_proximity"].fillna(0))
    df["commuter_intensity_proxy"] = 0.5 * pop_norm + 0.3 * adj_norm + 0.2 * urb_norm

    df["movement_intensity_proxy"] = (
        0.45 * df["road_network_density_proxy"]
        + 0.25 * _normalize(df["transport_hub_proxy"].astype(float))
        + 0.30 * df["commuter_intensity_proxy"]
    )
    df["movement_rank"] = df["movement_intensity_proxy"].rank(ascending=False, method="dense").astype(int)

    cols = [
        "district_code",
        "district_name",
        "mean_pop_density",
        "population_exposed_proxy",
        "road_network_density_proxy",
        "transport_hub_proxy",
        "adjacent_district_count",
        "commuter_intensity_proxy",
        "movement_intensity_proxy",
        "movement_rank",
    ]
    out = df[cols].sort_values("movement_rank")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_parquet(OUT, index=False)

    print(f"Wrote {OUT} ({len(out)} rows)")


if __name__ == "__main__":
    main()
