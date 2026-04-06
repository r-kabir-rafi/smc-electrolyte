"""SQLAlchemy ORM models."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class District(Base):
    """District boundary metadata."""

    __tablename__ = "districts"

    district_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    country_code: Mapped[str] = mapped_column(String(2), index=True)
    admin1: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str] = mapped_column(String(128), index=True)
    geom: Mapped[object] = mapped_column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=True))
    centroid: Mapped[object] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True))


class WeatherDailyFeature(Base):
    """District-level daily heat features derived from gridded weather."""

    __tablename__ = "weather_daily_features"

    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    district_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("districts.district_id", ondelete="CASCADE"),
        primary_key=True,
    )
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    tmax_c: Mapped[float] = mapped_column(Float)
    tmin_c: Mapped[float] = mapped_column(Float)
    rh_mean: Mapped[float] = mapped_column(Float)
    hi_max_c: Mapped[float] = mapped_column(Float)
    hi_3day_mean: Mapped[float] = mapped_column(Float)
    hi_7day_mean: Mapped[float] = mapped_column(Float)
    consecutive_hi_days_gt_35_c: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_hi_days_gt_40_c: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_hi_days_gt_45_c: Mapped[int] = mapped_column(Integer, default=0)
    warm_night_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    anom_tmax: Mapped[float | None] = mapped_column(Float, nullable=True)
    anom_hi: Mapped[float | None] = mapped_column(Float, nullable=True)
    data_quality_score: Mapped[float] = mapped_column(Float, default=1.0)

    __table_args__ = (
        Index("ix_weather_daily_country_date", "country_code", "date"),
        Index("ix_weather_daily_country_district_date", "country_code", "district_id", "date"),
    )


class WeatherForecast(Base):
    """District-level probabilistic weather forecasts."""

    __tablename__ = "weather_forecasts"

    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    district_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("districts.district_id", ondelete="CASCADE"),
        primary_key=True,
    )
    run_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    forecast_date: Mapped[date] = mapped_column(Date, primary_key=True)
    source: Mapped[str] = mapped_column(String(16), primary_key=True, default="gefs")
    tmax_p10: Mapped[float | None] = mapped_column(Float, nullable=True)
    tmax_p50: Mapped[float] = mapped_column(Float)
    tmax_p90: Mapped[float | None] = mapped_column(Float, nullable=True)
    hi_max_p10: Mapped[float | None] = mapped_column(Float, nullable=True)
    hi_max_p50: Mapped[float] = mapped_column(Float)
    hi_max_p90: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        Index("ix_weather_forecast_country_run", "country_code", "run_time"),
        Index("ix_weather_forecast_country_district_date", "country_code", "district_id", "forecast_date"),
    )


class DemandActual(Base):
    """Observed demand per district and SKU."""

    __tablename__ = "demand_actuals"

    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    district_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("districts.district_id", ondelete="CASCADE"),
        primary_key=True,
    )
    sku_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    units: Mapped[float] = mapped_column(Float)
    revenue: Mapped[float] = mapped_column(Float)
    in_stock_flag: Mapped[bool] = mapped_column(Boolean, default=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    promo_flag: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    __table_args__ = (
        Index("ix_demand_actuals_country_date", "country_code", "date"),
        Index("ix_demand_actuals_country_sku", "country_code", "sku_id"),
    )


class DemandForecast(Base):
    """Probabilistic demand forecasts per district and SKU."""

    __tablename__ = "demand_forecasts"

    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    district_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("districts.district_id", ondelete="CASCADE"),
        primary_key=True,
    )
    sku_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    run_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    forecast_date: Mapped[date] = mapped_column(Date, primary_key=True)
    p10: Mapped[float] = mapped_column(Float)
    p50: Mapped[float] = mapped_column(Float)
    p90: Mapped[float] = mapped_column(Float)
    drivers_json: Mapped[dict[str, object]] = mapped_column(JSONB, default=dict)

    __table_args__ = (
        Index("ix_demand_forecasts_country_run", "country_code", "run_time"),
        Index("ix_demand_forecasts_country_district_date", "country_code", "district_id", "forecast_date"),
    )


class IncidentAggregate(Base):
    """Aggregated incident counts with suppression metadata."""

    __tablename__ = "incidents_agg"

    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    district_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("districts.district_id", ondelete="CASCADE"),
        primary_key=True,
    )
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    incident_type: Mapped[str] = mapped_column(String(64), primary_key=True)
    source: Mapped[str] = mapped_column(String(128), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    suppressed_flag: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index("ix_incidents_country_date", "country_code", "date"),
        Index("ix_incidents_country_district_date", "country_code", "district_id", "date"),
    )
