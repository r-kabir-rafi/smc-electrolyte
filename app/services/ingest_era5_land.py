"""ERA5-Land ingestion pipeline."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

import geopandas as gpd
import pandas as pd
import xarray as xr
from geoalchemy2.shape import from_shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models import District, WeatherDailyFeature
from .aggregate_to_districts import (
    aggregate_daily_grid_to_districts,
    dataset_to_daily_grid_frame,
    load_district_boundaries,
)
from .heat_features import (
    add_heat_feature_columns,
    compute_monthly_normals,
    compute_monthly_tmin_percentiles,
)


def _to_geometry_value(geometry: BaseGeometry) -> object:
    """Convert a Shapely geometry into a PostGIS-compatible value."""

    return from_shape(geometry, srid=4326)


def upsert_districts(session: Session, districts_gdf: gpd.GeoDataFrame) -> None:
    """Insert or update district boundaries."""

    rows = []
    for row in districts_gdf.itertuples(index=False):
        rows.append(
            {
                "district_id": row.district_id,
                "country_code": row.country_code,
                "admin1": row.admin1,
                "name": row.name,
                "geom": _to_geometry_value(row.geometry),
                "centroid": _to_geometry_value(row.geometry.centroid),
            }
        )

    statement = insert(District).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[District.district_id],
        set_={
            "country_code": statement.excluded.country_code,
            "admin1": statement.excluded.admin1,
            "name": statement.excluded.name,
            "geom": statement.excluded.geom,
            "centroid": statement.excluded.centroid,
        },
    )
    session.execute(statement)


def load_historical_features_for_normals(session: Session, country_code: str) -> pd.DataFrame:
    """Load previously ingested weather features for climatology joins."""

    query = select(
        WeatherDailyFeature.country_code,
        WeatherDailyFeature.district_id,
        WeatherDailyFeature.date,
        WeatherDailyFeature.tmax_c,
        WeatherDailyFeature.tmin_c,
        WeatherDailyFeature.hi_max_c,
    ).where(WeatherDailyFeature.country_code == country_code)

    records = session.execute(query).mappings().all()
    if not records:
        return pd.DataFrame(
            columns=["country_code", "district_id", "date", "tmax_c", "tmin_c", "hi_max_c"]
        )
    return pd.DataFrame(records)


def upsert_weather_daily_features(session: Session, frame: pd.DataFrame) -> None:
    """Upsert computed district-day heat features."""

    if frame.empty:
        return

    rows = frame.to_dict(orient="records")
    statement = insert(WeatherDailyFeature).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=[
            WeatherDailyFeature.country_code,
            WeatherDailyFeature.district_id,
            WeatherDailyFeature.date,
        ],
        set_={
            "tmax_c": statement.excluded.tmax_c,
            "tmin_c": statement.excluded.tmin_c,
            "rh_mean": statement.excluded.rh_mean,
            "hi_max_c": statement.excluded.hi_max_c,
            "hi_3day_mean": statement.excluded.hi_3day_mean,
            "hi_7day_mean": statement.excluded.hi_7day_mean,
            "consecutive_hi_days_gt_35_c": statement.excluded.consecutive_hi_days_gt_35_c,
            "consecutive_hi_days_gt_40_c": statement.excluded.consecutive_hi_days_gt_40_c,
            "consecutive_hi_days_gt_45_c": statement.excluded.consecutive_hi_days_gt_45_c,
            "warm_night_flag": statement.excluded.warm_night_flag,
            "anom_tmax": statement.excluded.anom_tmax,
            "anom_hi": statement.excluded.anom_hi,
            "data_quality_score": statement.excluded.data_quality_score,
        },
    )
    session.execute(statement)


def ingest_era5_land_files(
    session: Session,
    netcdf_paths: Iterable[str | Path],
    districts_geojson_path: str | Path,
    country_code: str,
    temperature_var: str = "temp_2m",
    rh_var: str = "relative_humidity_2m",
    dewpoint_var: str = "dewpoint_2m",
) -> pd.DataFrame:
    """Read ERA5-Land files, aggregate to districts, and persist daily features."""

    districts_gdf = load_district_boundaries(districts_geojson_path, country_code)
    upsert_districts(session, districts_gdf)

    dataset = xr.open_mfdataset(
        [str(path) for path in netcdf_paths],
        combine="by_coords",
    )
    daily_grid = dataset_to_daily_grid_frame(
        dataset,
        temperature_var=temperature_var,
        rh_var=rh_var,
        dewpoint_var=dewpoint_var,
    )
    district_daily = aggregate_daily_grid_to_districts(daily_grid, districts_gdf)

    historical = load_historical_features_for_normals(session, country_code)
    combined_history = pd.concat(
        [
            historical,
            district_daily[["country_code", "district_id", "date", "tmax_c", "tmin_c"]].assign(
                hi_max_c=pd.NA
            ),
        ],
        ignore_index=True,
    )
    if "hi_max_c" in historical.columns and not historical.empty:
        normals = compute_monthly_normals(historical)
    else:
        normals = pd.DataFrame()
    warm_night_thresholds = compute_monthly_tmin_percentiles(combined_history)

    enriched = add_heat_feature_columns(
        district_daily,
        normals_df=normals,
        warm_night_thresholds_df=warm_night_thresholds,
    )
    upsert_weather_daily_features(session, enriched)
    session.commit()
    return enriched


def build_parser() -> argparse.ArgumentParser:
    """Construct a CLI parser for ERA5-Land ingestion."""

    parser = argparse.ArgumentParser(description="Ingest ERA5-Land NetCDF weather data.")
    parser.add_argument("--country-code", required=True)
    parser.add_argument("--districts-geojson", required=True)
    parser.add_argument("--netcdf", nargs="+", required=True)
    parser.add_argument("--temperature-var", default="temp_2m")
    parser.add_argument("--rh-var", default="relative_humidity_2m")
    parser.add_argument("--dewpoint-var", default="dewpoint_2m")
    return parser


def main() -> None:
    """CLI entrypoint."""

    from ..db import SessionLocal

    args = build_parser().parse_args()
    with SessionLocal() as session:
        ingest_era5_land_files(
            session=session,
            netcdf_paths=args.netcdf,
            districts_geojson_path=args.districts_geojson,
            country_code=args.country_code,
            temperature_var=args.temperature_var,
            rh_var=args.rh_var,
            dewpoint_var=args.dewpoint_var,
        )


if __name__ == "__main__":
    main()
