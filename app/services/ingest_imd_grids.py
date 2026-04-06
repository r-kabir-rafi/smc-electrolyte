"""IMD daily gridded temperature ingestion."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import xarray as xr
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import WeatherDailyFeature
from .aggregate_to_districts import load_district_boundaries
from .ingest_era5_land import upsert_districts, upsert_weather_daily_features


@dataclass(slots=True)
class IMDGridConfig:
    """Metadata needed to parse IMD-style binary grids."""

    latitudes: list[float]
    longitudes: list[float]
    dtype: str = "float32"
    scale_factor: float = 1.0
    offset: float = 0.0
    missing_value: float | None = None
    variable_name: str = "tmax_c"

    @classmethod
    def from_json(cls, path: str | Path) -> "IMDGridConfig":
        """Load grid metadata from a JSON file."""

        with Path(path).open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return cls(**payload)


def parse_imd_daily_binary(
    file_path: str | Path,
    grid_config: IMDGridConfig,
    date_value: str,
) -> xr.Dataset:
    """Parse a single IMD daily binary grid into an xarray dataset.

    This parser assumes the binary file is a dense lat x lon array. If a
    deployment uses a different binary layout, replace this function while
    keeping the same interface.
    """

    path = Path(file_path)
    values = np.fromfile(path, dtype=np.dtype(grid_config.dtype))
    expected_size = len(grid_config.latitudes) * len(grid_config.longitudes)
    if values.size != expected_size:
        raise ValueError(
            f"Unexpected IMD grid size for {path}: expected {expected_size}, got {values.size}"
        )

    matrix = values.reshape((len(grid_config.latitudes), len(grid_config.longitudes)))
    matrix = matrix.astype(float) * grid_config.scale_factor + grid_config.offset
    if grid_config.missing_value is not None:
        matrix = np.where(matrix == grid_config.missing_value, np.nan, matrix)

    return xr.Dataset(
        {
            grid_config.variable_name: (("time", "lat", "lon"), matrix[np.newaxis, :, :]),
        },
        coords={
            "time": [np.datetime64(date_value)],
            "lat": grid_config.latitudes,
            "lon": grid_config.longitudes,
        },
    )


def aggregate_imd_daily_tmax_to_districts(
    dataset: xr.Dataset,
    districts_gdf: gpd.GeoDataFrame,
) -> pd.DataFrame:
    """Aggregate a daily district tmax grid using district containment."""

    variable_name = next(iter(dataset.data_vars))
    frame = dataset[variable_name].to_dataframe().reset_index()
    frame["date"] = pd.to_datetime(frame["time"]).dt.date
    cell_points = gpd.GeoDataFrame(
        frame[["lat", "lon"]].drop_duplicates(),
        geometry=gpd.points_from_xy(frame["lon"], frame["lat"]),
        crs="EPSG:4326",
    )
    joined = gpd.sjoin(
        cell_points,
        districts_gdf[["district_id", "country_code", "geometry"]],
        how="inner",
        predicate="within",
    )[["lat", "lon", "country_code", "district_id"]]

    merged = frame.merge(joined, on=["lat", "lon"], how="inner")
    return (
        merged.groupby(["country_code", "district_id", "date"], observed=True)
        .agg(tmax_c=(variable_name, "mean"))
        .reset_index()
    )


def ingest_imd_daily_tmax(
    session: Session,
    binary_file: str | Path,
    metadata_json: str | Path,
    districts_geojson: str | Path,
    country_code: str,
    date_value: str,
) -> pd.DataFrame:
    """Ingest a single IMD daily tmax binary grid.

    IMD tmax alone is not enough to fully derive heat index. This updater
    therefore merges the new district tmax values into existing daily feature
    rows, preserving previously ingested humidity and other features.
    """

    config = IMDGridConfig.from_json(metadata_json)
    dataset = parse_imd_daily_binary(binary_file, config, date_value)
    districts = load_district_boundaries(districts_geojson, country_code)
    upsert_districts(session, districts)
    aggregated = aggregate_imd_daily_tmax_to_districts(dataset, districts)

    existing_rows = session.execute(
        select(WeatherDailyFeature).where(
            WeatherDailyFeature.country_code == country_code,
            WeatherDailyFeature.date == pd.to_datetime(date_value).date(),
        )
    ).scalars()
    existing_map = {(row.country_code, row.district_id, row.date): row for row in existing_rows}

    upsert_rows: list[dict[str, object]] = []
    for row in aggregated.itertuples(index=False):
        existing = existing_map.get((row.country_code, row.district_id, row.date))
        upsert_rows.append(
            {
                "country_code": row.country_code,
                "district_id": row.district_id,
                "date": row.date,
                "tmax_c": float(row.tmax_c),
                "tmin_c": existing.tmin_c if existing else float(row.tmax_c),
                "rh_mean": existing.rh_mean if existing else 50.0,
                "hi_max_c": existing.hi_max_c if existing else float(row.tmax_c),
                "hi_3day_mean": existing.hi_3day_mean if existing else float(row.tmax_c),
                "hi_7day_mean": existing.hi_7day_mean if existing else float(row.tmax_c),
                "consecutive_hi_days_gt_35_c": existing.consecutive_hi_days_gt_35_c if existing else 0,
                "consecutive_hi_days_gt_40_c": existing.consecutive_hi_days_gt_40_c if existing else 0,
                "consecutive_hi_days_gt_45_c": existing.consecutive_hi_days_gt_45_c if existing else 0,
                "warm_night_flag": existing.warm_night_flag if existing else False,
                "anom_tmax": existing.anom_tmax if existing else None,
                "anom_hi": existing.anom_hi if existing else None,
                "data_quality_score": existing.data_quality_score if existing else 0.5,
            }
        )

    frame = pd.DataFrame(upsert_rows)
    upsert_weather_daily_features(session, frame)
    session.commit()
    return frame


def build_parser() -> argparse.ArgumentParser:
    """Construct a CLI parser for IMD ingestion."""

    parser = argparse.ArgumentParser(description="Ingest IMD daily tmax binary data.")
    parser.add_argument("--country-code", required=True)
    parser.add_argument("--districts-geojson", required=True)
    parser.add_argument("--metadata-json", required=True)
    parser.add_argument("--binary-file", required=True)
    parser.add_argument("--date", required=True, help="Grid date in YYYY-MM-DD format.")
    return parser


def main() -> None:
    """CLI entrypoint."""

    from ..db import SessionLocal

    args = build_parser().parse_args()
    with SessionLocal() as session:
        ingest_imd_daily_tmax(
            session=session,
            binary_file=args.binary_file,
            metadata_json=args.metadata_json,
            districts_geojson=args.districts_geojson,
            country_code=args.country_code,
            date_value=args.date,
        )


if __name__ == "__main__":
    main()
