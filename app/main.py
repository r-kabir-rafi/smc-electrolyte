"""FastAPI application exposing district heat and trigger APIs."""

from __future__ import annotations

import os
import time
import uuid
from collections.abc import Iterator
from datetime import date, datetime, timedelta, timezone

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from .db import Base, get_engine, get_session
from .models import District, WeatherDailyFeature, WeatherForecast
from .schemas import (
    DistrictRead,
    HeatFeatureRead,
    TriggerEvaluateRequest,
    TriggerEvaluateResponse,
    WeatherForecastDay,
    WeatherForecastResponse,
)
from .services.trigger_engine import TriggerRuleConfig, evaluate_trigger


app = FastAPI(
    title="District Heat Intelligence API",
    version="1.0.0",
    description=(
        "District-level heat, forecast, and informational trigger APIs. "
        "This service returns informational planning guidance only."
    ),
)


_DISTRICT_CACHE: dict[str, tuple[float, list[DistrictRead]]] = {}
_DISTRICT_CACHE_TTL_SECONDS = int(os.getenv("DISTRICT_CACHE_TTL_SECONDS", "300"))


@app.on_event("startup")
def startup() -> None:
    """Optional schema creation for local development."""

    if os.getenv("AUTO_CREATE_SCHEMA", "false").lower() == "true":
        Base.metadata.create_all(bind=get_engine())


def _get_country_code_for_district(session: Session, district_id: uuid.UUID) -> str:
    district = session.get(District, district_id)
    if district is None:
        raise HTTPException(status_code=404, detail="District not found.")
    return district.country_code


def _cached_districts(session: Session, country_code: str) -> list[DistrictRead]:
    now = time.time()
    cached = _DISTRICT_CACHE.get(country_code)
    if cached and now - cached[0] < _DISTRICT_CACHE_TTL_SECONDS:
        return cached[1]

    rows = session.execute(
        select(District)
        .where(District.country_code == country_code)
        .order_by(District.admin1.asc(), District.name.asc())
    ).scalars()
    payload = [DistrictRead.model_validate(row) for row in rows]
    _DISTRICT_CACHE[country_code] = (now, payload)
    return payload


def _resolve_run_time(session: Session, district_id: uuid.UUID, run_time: str) -> datetime:
    country_code = _get_country_code_for_district(session, district_id)
    if run_time == "latest":
        latest = session.execute(
            select(func.max(WeatherForecast.run_time)).where(
                WeatherForecast.country_code == country_code,
                WeatherForecast.district_id == district_id,
            )
        ).scalar_one_or_none()
        if latest is None:
            raise HTTPException(status_code=404, detail="No weather forecasts are available for the district.")
        return latest

    try:
        parsed = datetime.fromisoformat(run_time.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="run_time must be 'latest' or an ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _monthly_hi_normals(session: Session, district_id: uuid.UUID, country_code: str) -> dict[int, float]:
    rows = session.execute(
        select(
            extract("month", WeatherDailyFeature.date).label("month"),
            func.avg(WeatherDailyFeature.hi_max_c).label("normal_hi"),
        ).where(
            WeatherDailyFeature.country_code == country_code,
            WeatherDailyFeature.district_id == district_id,
        ).group_by("month")
    ).all()
    return {int(month): float(normal_hi) for month, normal_hi in rows if month is not None and normal_hi is not None}


@app.get("/v1/districts", response_model=list[DistrictRead])
def list_districts(
    country_code: str = Query(..., min_length=2, max_length=2),
    session: Session = Depends(get_session),
) -> list[DistrictRead]:
    """Return districts for a country."""

    return _cached_districts(session, country_code.upper())


@app.get("/v1/district/{district_id}/heat", response_model=list[HeatFeatureRead])
def district_heat_features(
    district_id: uuid.UUID,
    start: date,
    end: date,
    session: Session = Depends(get_session),
) -> list[HeatFeatureRead]:
    """Return daily district heat features for a date range."""

    if end < start:
        raise HTTPException(status_code=400, detail="end must be on or after start.")

    country_code = _get_country_code_for_district(session, district_id)
    rows = session.execute(
        select(WeatherDailyFeature)
        .where(
            WeatherDailyFeature.country_code == country_code,
            WeatherDailyFeature.district_id == district_id,
            WeatherDailyFeature.date >= start,
            WeatherDailyFeature.date <= end,
        )
        .order_by(WeatherDailyFeature.date.asc())
    ).scalars()
    return [HeatFeatureRead.model_validate(row) for row in rows]


@app.get("/v1/district/{district_id}/forecast", response_model=WeatherForecastResponse)
def district_weather_forecast(
    district_id: uuid.UUID,
    run_time: str = "latest",
    horizon_days: int = Query(14, ge=1, le=30),
    session: Session = Depends(get_session),
) -> WeatherForecastResponse:
    """Return weather forecast quantiles for a district."""

    country_code = _get_country_code_for_district(session, district_id)
    resolved_run_time = _resolve_run_time(session, district_id, run_time)

    rows = list(
        session.execute(
            select(WeatherForecast)
            .where(
                WeatherForecast.country_code == country_code,
                WeatherForecast.district_id == district_id,
                WeatherForecast.run_time == resolved_run_time,
            )
            .order_by(WeatherForecast.forecast_date.asc())
            .limit(horizon_days)
        ).scalars()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No weather forecasts matched the request.")

    items = [
        WeatherForecastDay(
            forecast_date=row.forecast_date,
            tmax_p10=row.tmax_p10,
            tmax_p50=row.tmax_p50,
            tmax_p90=row.tmax_p90,
            hi_max_p10=row.hi_max_p10,
            hi_max_p50=row.hi_max_p50,
            hi_max_p90=row.hi_max_p90,
            source=row.source,
        )
        for row in rows
    ]
    return WeatherForecastResponse(
        district_id=district_id,
        run_time=resolved_run_time,
        horizon_days=horizon_days,
        items=items,
    )


@app.post("/v1/triggers/evaluate", response_model=TriggerEvaluateResponse)
def evaluate_triggers(
    request: TriggerEvaluateRequest,
    session: Session = Depends(get_session),
) -> TriggerEvaluateResponse:
    """Evaluate forecast scenarios and return informational campaign guidance."""

    country_code = _get_country_code_for_district(session, request.district_id)
    resolved_run_time = _resolve_run_time(session, request.district_id, "latest")
    end_date = date.today() + timedelta(days=14)

    forecast_rows = list(
        session.execute(
            select(WeatherForecast)
            .where(
                WeatherForecast.country_code == country_code,
                WeatherForecast.district_id == request.district_id,
                WeatherForecast.run_time == resolved_run_time,
                WeatherForecast.forecast_date <= end_date,
            )
            .order_by(WeatherForecast.forecast_date.asc())
        ).scalars()
    )
    if not forecast_rows:
        raise HTTPException(status_code=404, detail="No forecast data is available for trigger evaluation.")

    normals = _monthly_hi_normals(session, request.district_id, country_code)
    forecast_frame = pd.DataFrame(
        [
            {
                "forecast_date": row.forecast_date,
                "hi_max_p10": row.hi_max_p10,
                "hi_max_p50": row.hi_max_p50,
                "hi_max_p90": row.hi_max_p90,
                "anom_hi_p10": (row.hi_max_p10 - normals.get(row.forecast_date.month, row.hi_max_p10))
                if row.hi_max_p10 is not None
                else None,
                "anom_hi_p50": row.hi_max_p50 - normals.get(row.forecast_date.month, row.hi_max_p50),
                "anom_hi_p90": (row.hi_max_p90 - normals.get(row.forecast_date.month, row.hi_max_p90))
                if row.hi_max_p90 is not None
                else None,
            }
            for row in forecast_rows
        ]
    )
    result = evaluate_trigger(
        forecast_frame=forecast_frame,
        rule=TriggerRuleConfig(**request.rule.model_dump()),
        scenario=request.scenario,
        sku_id=request.sku_id,
    )
    return TriggerEvaluateResponse.model_validate(result)
