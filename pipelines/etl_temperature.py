"""Temperature ETL: NetCDF to daily parquet (grid + district aggregate)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
import xarray as xr
from shapely.geometry import Point

RAW_DIR = Path("data_raw/temperature")
DISTRICT_PATH = Path("data_processed/bd_admin_district.geojson")

GRID_OUT = Path("data_processed/tmax_daily.parquet")
DISTRICT_OUT = Path("data_processed/tmax_daily_district.parquet")


def _select_tmax_var(ds: xr.Dataset) -> str:
    for candidate in ["tmax", "tasmax", "TMAX", "temperature_max"]:
        if candidate in ds.data_vars:
            return candidate
    raise KeyError("No Tmax-like variable found in dataset")


def _to_celsius(values: np.ndarray, units: str | None) -> np.ndarray:
    if units and units.lower() in {"k", "kelvin"}:
        return values - 273.15
    return values


def _point_to_district(
    lat: float,
    lon: float,
    districts: list[tuple[str, str, Any]],
) -> tuple[str | None, str | None]:
    point = Point(lon, lat)
    for district_code, district_name, geometry in districts:
        if geometry.contains(point) or geometry.touches(point):
            return district_code, district_name
    return None, None


def main() -> None:
    nc_files = sorted(RAW_DIR.glob("*.nc"))
    if not nc_files:
        raise FileNotFoundError("No NetCDF files found under data_raw/temperature")

    rows: list[pd.DataFrame] = []
    for nc_path in nc_files:
        ds = xr.open_dataset(nc_path)
        var = _select_tmax_var(ds)
        units = str(ds[var].attrs.get("units", "")).strip()

        frame = ds[var].to_dataframe().reset_index()
        frame = frame.rename(columns={var: "tmax_raw"})
        frame["tmax_c"] = _to_celsius(frame["tmax_raw"].to_numpy(), units)
        frame["date"] = pd.to_datetime(frame["time"]).dt.date
        frame["lat"] = frame["lat"].astype(float)
        frame["lon"] = frame["lon"].astype(float)
        frame["grid_id"] = frame.apply(
            lambda r: f"{r['lat']:.3f}_{r['lon']:.3f}",
            axis=1,
        )

        rows.append(frame[["date", "lat", "lon", "grid_id", "tmax_c"]])

    grid_df = pd.concat(rows, ignore_index=True)
    GRID_OUT.parent.mkdir(parents=True, exist_ok=True)
    grid_df.to_parquet(GRID_OUT, index=False)
    print(f"Wrote {GRID_OUT}")

    if DISTRICT_PATH.exists():
        district_gdf = gpd.read_file(DISTRICT_PATH)[["district_code", "district_name", "geometry"]]
        districts = [
            (row["district_code"], row["district_name"], row["geometry"])
            for _, row in district_gdf.iterrows()
        ]

        district_map = grid_df[["lat", "lon"]].drop_duplicates().copy()
        mapped = district_map.apply(
            lambda r: _point_to_district(r["lat"], r["lon"], districts),
            axis=1,
            result_type="expand",
        )
        district_map[["district_code", "district_name"]] = mapped

        with_district = grid_df.merge(district_map, on=["lat", "lon"], how="left")
        with_district = with_district.dropna(subset=["district_code"])

        district_daily = (
            with_district.groupby(["date", "district_code", "district_name"], as_index=False)
            .agg(tmax_c=("tmax_c", "mean"))
            .sort_values(["date", "district_code"])
        )
        district_daily.to_parquet(DISTRICT_OUT, index=False)
        print(f"Wrote {DISTRICT_OUT}")


if __name__ == "__main__":
    main()
