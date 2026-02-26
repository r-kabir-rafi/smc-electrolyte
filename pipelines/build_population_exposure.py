"""Build population density raster and district exposure aggregates."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point
import tifffile

DISTRICT_GEO = Path("data_processed/bd_admin_district.geojson")
OUT_TIF = Path("data_processed/pop_density.tif")
OUT_AGG = Path("data_processed/pop_density_admin.parquet")
OUT_GEO = Path("data_processed/pop_density_district.geojson")

# Bangladesh bounding box
MIN_LON, MIN_LAT, MAX_LON, MAX_LAT = 88.0, 20.5, 92.8, 26.7
RES = 0.05

URBAN_CENTERS = [
    (23.8103, 90.4125, 1.0),   # Dhaka
    (22.3569, 91.7832, 0.8),   # Chattogram
    (24.3745, 88.6042, 0.6),   # Rajshahi
    (22.8456, 89.5403, 0.55),  # Khulna
    (22.7010, 90.3535, 0.5),   # Barishal
    (24.8949, 91.8687, 0.5),   # Sylhet
]


def _population_surface() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lons = np.arange(MIN_LON, MAX_LON + RES, RES)
    lats = np.arange(MIN_LAT, MAX_LAT + RES, RES)
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    density = np.zeros_like(lon_grid, dtype=float)
    for clat, clon, weight in URBAN_CENTERS:
        d2 = ((lat_grid - clat) / 0.9) ** 2 + ((lon_grid - clon) / 0.9) ** 2
        density += weight * np.exp(-d2)

    # Scale to persons per km2 proxy range.
    density = 60 + (density / density.max()) * 7800
    return density.astype(np.float32), lats, lons


def _write_geotiff_with_sidecars(arr: np.ndarray, lats: np.ndarray, lons: np.ndarray) -> None:
    OUT_TIF.parent.mkdir(parents=True, exist_ok=True)
    # TIFF stores top row first; flip latitude axis so north is up.
    img = np.flipud(arr)
    tifffile.imwrite(OUT_TIF, img)

    # World file (.tfw): pixel size x, rotation, rotation, pixel size y, top-left x, top-left y
    xsize = float(lons[1] - lons[0])
    ysize = float(lats[1] - lats[0])
    top_left_x = MIN_LON
    top_left_y = MAX_LAT
    OUT_TIF.with_suffix(".tfw").write_text(
        f"{xsize}\n0.0\n0.0\n{-ysize}\n{top_left_x}\n{top_left_y}\n",
        encoding="utf-8",
    )
    OUT_TIF.with_suffix(".prj").write_text(
        'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
        'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
        encoding="utf-8",
    )


def _aggregate_by_district(arr: np.ndarray, lats: np.ndarray, lons: np.ndarray) -> pd.DataFrame:
    gdf = gpd.read_file(DISTRICT_GEO)[["district_code", "district_name", "geometry"]].copy()
    gdf = gdf.to_crs("EPSG:4326")

    rows = []
    for _, row in gdf.iterrows():
        vals = []
        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                pt = Point(float(lon), float(lat))
                if row.geometry.contains(pt) or row.geometry.touches(pt):
                    vals.append(float(arr[i, j]))

        if vals:
            mean_density = float(np.mean(vals))
            cell_area_km2 = (RES * 111.0) * (RES * 111.0)
            pop_exposed = float(np.sum(vals) * cell_area_km2)
            rows.append(
                {
                    "district_code": row.district_code,
                    "district_name": row.district_name,
                    "mean_pop_density": mean_density,
                    "population_exposed_proxy": pop_exposed,
                    "num_cells": len(vals),
                }
            )

    return pd.DataFrame(rows)


def main() -> None:
    arr, lats, lons = _population_surface()
    _write_geotiff_with_sidecars(arr, lats, lons)

    agg = _aggregate_by_district(arr, lats, lons)
    agg.to_parquet(OUT_AGG, index=False)

    dist = gpd.read_file(DISTRICT_GEO)
    merged = dist.merge(agg, on=["district_code", "district_name"], how="left")
    merged.to_file(OUT_GEO, driver="GeoJSON")

    print(f"Wrote {OUT_TIF}")
    print(f"Wrote {OUT_AGG} ({len(agg)} rows)")
    print(f"Wrote {OUT_GEO}")


if __name__ == "__main__":
    main()
