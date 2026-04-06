"""Spatial aggregation utilities for gridded weather data."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
import xarray as xr


def load_district_boundaries(path: str | Path, country_code: str | None = None) -> gpd.GeoDataFrame:
    """Load district boundaries from GeoJSON and normalize the schema."""

    districts = gpd.read_file(path)
    required = {"district_id", "country_code", "admin1", "name"}
    missing = required.difference(districts.columns)
    if missing:
        raise ValueError(f"District GeoJSON missing properties: {sorted(missing)}")

    if country_code is not None:
        districts = districts.loc[districts["country_code"] == country_code].copy()

    if districts.empty:
        raise ValueError("No districts matched the requested country code.")

    if districts.crs is None:
        districts = districts.set_crs(epsg=4326)
    elif districts.crs.to_epsg() != 4326:
        districts = districts.to_crs(epsg=4326)

    return districts[["district_id", "country_code", "admin1", "name", "geometry"]].copy()


def _get_coord_name(dataset: xr.Dataset, candidates: tuple[str, ...]) -> str:
    for candidate in candidates:
        if candidate in dataset.coords:
            return candidate
        if candidate in dataset.dims:
            return candidate
    raise KeyError(f"Could not find any of the coordinate names {candidates}")


def relative_humidity_from_dewpoint(temp_c: np.ndarray, dewpoint_c: np.ndarray) -> np.ndarray:
    """Approximate relative humidity from temperature and dewpoint in Celsius."""

    saturation_vapor_pressure = 6.112 * np.exp((17.67 * temp_c) / (temp_c + 243.5))
    actual_vapor_pressure = 6.112 * np.exp((17.67 * dewpoint_c) / (dewpoint_c + 243.5))
    rh = np.clip((actual_vapor_pressure / saturation_vapor_pressure) * 100.0, 0.0, 100.0)
    return rh


def dataset_to_daily_grid_frame(
    dataset: xr.Dataset,
    temperature_var: str = "temp_2m",
    rh_var: str = "relative_humidity_2m",
    dewpoint_var: str = "dewpoint_2m",
) -> pd.DataFrame:
    """Convert an hourly ERA5-Land style dataset into a daily grid dataframe."""

    time_name = _get_coord_name(dataset, ("time", "valid_time"))
    lat_name = _get_coord_name(dataset, ("latitude", "lat"))
    lon_name = _get_coord_name(dataset, ("longitude", "lon"))

    if temperature_var not in dataset:
        raise KeyError(f"Dataset is missing required variable '{temperature_var}'")

    temp_c = dataset[temperature_var] - 273.15

    if rh_var in dataset:
        rh = dataset[rh_var]
    elif dewpoint_var in dataset:
        dewpoint_c = dataset[dewpoint_var] - 273.15
        rh = xr.apply_ufunc(relative_humidity_from_dewpoint, temp_c, dewpoint_c)
    else:
        raise KeyError(
            f"Dataset must include either '{rh_var}' or '{dewpoint_var}' to derive humidity."
        )

    frame = (
        xr.Dataset({"temp_c": temp_c, "rh": rh})
        .to_dataframe()
        .reset_index()
        .rename(columns={lat_name: "lat", lon_name: "lon", time_name: "time"})
    )
    frame["time"] = pd.to_datetime(frame["time"], utc=True).dt.tz_convert(None)
    frame["date"] = frame["time"].dt.date

    daily = (
        frame.groupby(["date", "lat", "lon"], observed=True)
        .agg(
            tmax_c=("temp_c", "max"),
            tmin_c=("temp_c", "min"),
            rh_mean=("rh", "mean"),
            valid_steps=("temp_c", lambda series: int(series.notna().sum())),
        )
        .reset_index()
    )
    return daily


def _grid_cell_assignments(
    daily_grid_df: pd.DataFrame,
    districts_gdf: gpd.GeoDataFrame,
) -> pd.DataFrame:
    """Assign grid cell centers to districts using a spatial join."""

    unique_cells = daily_grid_df[["lat", "lon"]].drop_duplicates().copy()
    cell_points = gpd.GeoDataFrame(
        unique_cells,
        geometry=gpd.points_from_xy(unique_cells["lon"], unique_cells["lat"]),
        crs="EPSG:4326",
    )
    joined = gpd.sjoin(
        cell_points,
        districts_gdf[["district_id", "country_code", "admin1", "name", "geometry"]],
        how="inner",
        predicate="within",
    )
    assignments = joined[["lat", "lon", "district_id", "country_code", "admin1", "name"]].drop_duplicates()
    if assignments.empty:
        raise ValueError("No grid cells intersected district geometries.")
    return assignments


def aggregate_daily_grid_to_districts(
    daily_grid_df: pd.DataFrame,
    districts_gdf: gpd.GeoDataFrame,
) -> pd.DataFrame:
    """Aggregate daily grid-cell weather summaries to district-day features."""

    assignments = _grid_cell_assignments(daily_grid_df, districts_gdf)
    expected_cells = (
        assignments.groupby(["country_code", "district_id"], observed=True)
        .size()
        .rename("expected_cells")
        .reset_index()
    )
    merged = daily_grid_df.merge(assignments, on=["lat", "lon"], how="inner")

    aggregated = (
        merged.groupby(["country_code", "district_id", "date"], observed=True)
        .agg(
            tmax_c=("tmax_c", "mean"),
            tmin_c=("tmin_c", "mean"),
            rh_mean=("rh_mean", "mean"),
            observed_cells=("lat", "nunique"),
        )
        .reset_index()
    )
    aggregated = aggregated.merge(expected_cells, on=["country_code", "district_id"], how="left")
    aggregated["data_quality_score"] = (
        aggregated["observed_cells"] / aggregated["expected_cells"].replace({0: np.nan})
    ).fillna(0.0)
    return aggregated.drop(columns=["observed_cells", "expected_cells"])

