"""Hierarchical demand forecasting with weather regressors."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models import DemandActual, DemandForecast, District, WeatherDailyFeature


QUANTILES = (0.10, 0.50, 0.90)


@dataclass(slots=True)
class NaiveQuantileModel:
    """Fallback model that returns historical unconditional quantiles."""

    quantile_value: float

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        """Return a constant quantile forecast."""

        return np.full(shape=(len(features),), fill_value=self.quantile_value, dtype=float)


@dataclass
class GroupModelBundle:
    """Container for district-SKU quantile models."""

    feature_columns: list[str]
    admin1: str
    models: dict[float, Any] = field(default_factory=dict)


def _cyclical_components(values: pd.Series, period: int) -> tuple[pd.Series, pd.Series]:
    radians = 2.0 * np.pi * values / period
    return np.sin(radians), np.cos(radians)


def prepare_training_frame(
    demand_actuals: pd.DataFrame,
    weather_features: pd.DataFrame,
) -> pd.DataFrame:
    """Join demand with weather features and add model features."""

    frame = demand_actuals.merge(
        weather_features,
        on=["country_code", "district_id", "date"],
        how="left",
        validate="many_to_one",
    )
    frame["date"] = pd.to_datetime(frame["date"])
    frame["dow"] = frame["date"].dt.dayofweek
    frame["month"] = frame["date"].dt.month
    frame["dow_sin"], frame["dow_cos"] = _cyclical_components(frame["dow"], 7)
    frame["month_sin"], frame["month_cos"] = _cyclical_components(frame["month"], 12)
    frame["promo_flag"] = frame["promo_flag"].fillna(False).astype(int)
    frame["in_stock_flag"] = frame["in_stock_flag"].fillna(True).astype(int)
    frame["warm_night_flag"] = frame["warm_night_flag"].fillna(False).astype(int)
    frame["price"] = frame["price"].fillna(frame["price"].median() if "price" in frame else 0.0).fillna(0.0)
    frame["anom_hi"] = frame["anom_hi"].fillna(0.0)
    frame["hi_max_c"] = frame["hi_max_c"].fillna(frame["tmax_c"])
    return frame


def enforce_quantile_monotonicity(frame: pd.DataFrame) -> pd.DataFrame:
    """Ensure p10 <= p50 <= p90 for each forecast row."""

    ordered = frame.copy()
    values = ordered[["p10", "p50", "p90"]].to_numpy(dtype=float)
    ordered_values = np.maximum.accumulate(values, axis=1)
    ordered[["p10", "p50", "p90"]] = ordered_values
    return ordered


class HierarchicalDemandForecaster:
    """Demand forecasting model with optional admin1 reconciliation."""

    def __init__(
        self,
        min_training_rows: int = 45,
        random_state: int = 42,
    ) -> None:
        self.min_training_rows = min_training_rows
        self.random_state = random_state
        self.feature_columns = [
            "dow_sin",
            "dow_cos",
            "month_sin",
            "month_cos",
            "tmax_c",
            "hi_max_c",
            "anom_hi",
            "warm_night_flag",
            "price",
            "promo_flag",
            "in_stock_flag",
        ]
        self.group_models: dict[tuple[str, str, str], GroupModelBundle] = {}
        self.district_admin1_map: dict[tuple[str, str], str] = {}

    def fit(
        self,
        demand_actuals: pd.DataFrame,
        weather_features: pd.DataFrame,
        district_metadata: pd.DataFrame,
    ) -> "HierarchicalDemandForecaster":
        """Fit per-district quantile models."""

        frame = prepare_training_frame(demand_actuals, weather_features)
        district_meta = district_metadata[["country_code", "district_id", "admin1"]].drop_duplicates()
        frame = frame.merge(
            district_meta,
            on=["country_code", "district_id"],
            how="left",
            validate="many_to_one",
        )
        frame["admin1"] = frame["admin1"].fillna("UNKNOWN")

        for row in district_meta.itertuples(index=False):
            self.district_admin1_map[(row.country_code, str(row.district_id))] = row.admin1

        grouped = frame.groupby(["country_code", "district_id", "sku_id"], observed=True)
        for (country_code, district_id, sku_id), group in grouped:
            group = group.sort_values("date")
            key = (country_code, str(district_id), sku_id)
            bundle = GroupModelBundle(
                feature_columns=self.feature_columns.copy(),
                admin1=str(group["admin1"].iloc[0]),
            )

            if len(group) < self.min_training_rows:
                history = group["units"].to_numpy(dtype=float)
                bundle.models = {
                    quantile: NaiveQuantileModel(float(np.quantile(history, quantile)))
                    for quantile in QUANTILES
                }
                self.group_models[key] = bundle
                continue

            features = group[self.feature_columns]
            target = group["units"].to_numpy(dtype=float)
            for quantile in QUANTILES:
                model = GradientBoostingRegressor(
                    loss="quantile",
                    alpha=quantile,
                    random_state=self.random_state,
                    n_estimators=250,
                    learning_rate=0.05,
                    max_depth=3,
                    min_samples_leaf=5,
                )
                model.fit(features, target)
                bundle.models[quantile] = model
            self.group_models[key] = bundle

        return self

    def predict(
        self,
        future_frame: pd.DataFrame,
        admin1_totals: pd.DataFrame | None = None,
        run_time: datetime | None = None,
    ) -> pd.DataFrame:
        """Generate district-level probabilistic forecasts."""

        if not self.group_models:
            raise RuntimeError("The forecasting model must be fit before prediction.")

        frame = future_frame.copy()
        frame["date"] = pd.to_datetime(frame["date"])
        frame["dow"] = frame["date"].dt.dayofweek
        frame["month"] = frame["date"].dt.month
        frame["dow_sin"], frame["dow_cos"] = _cyclical_components(frame["dow"], 7)
        frame["month_sin"], frame["month_cos"] = _cyclical_components(frame["month"], 12)
        frame["promo_flag"] = frame.get("promo_flag", False)
        frame["promo_flag"] = frame["promo_flag"].fillna(False).astype(int)
        frame["in_stock_flag"] = frame.get("in_stock_flag", True)
        frame["in_stock_flag"] = frame["in_stock_flag"].fillna(True).astype(int)
        frame["price"] = frame.get("price", 0.0)
        frame["price"] = frame["price"].fillna(0.0).astype(float)
        frame["warm_night_flag"] = frame.get("warm_night_flag", False)
        frame["warm_night_flag"] = frame["warm_night_flag"].fillna(False).astype(int)
        frame["anom_hi"] = frame.get("anom_hi", 0.0)
        frame["anom_hi"] = frame["anom_hi"].fillna(0.0).astype(float)
        frame["hi_max_c"] = frame.get("hi_max_c", frame["tmax_c"])
        now = run_time or datetime.now(timezone.utc)

        output_rows: list[dict[str, Any]] = []
        grouped = frame.groupby(["country_code", "district_id", "sku_id"], observed=True)
        for (country_code, district_id, sku_id), group in grouped:
            key = (country_code, str(district_id), sku_id)
            if key not in self.group_models:
                continue
            bundle = self.group_models[key]
            features = group[bundle.feature_columns]
            predictions = {
                quantile: bundle.models[quantile].predict(features)
                for quantile in QUANTILES
            }
            for index, row in group.reset_index(drop=True).iterrows():
                output_rows.append(
                    {
                        "country_code": country_code,
                        "district_id": row["district_id"],
                        "admin1": bundle.admin1,
                        "sku_id": sku_id,
                        "run_time": now,
                        "forecast_date": row["date"].date(),
                        "p10": max(0.0, float(predictions[0.10][index])),
                        "p50": max(0.0, float(predictions[0.50][index])),
                        "p90": max(0.0, float(predictions[0.90][index])),
                        "drivers_json": {
                            "tmax_c": float(row["tmax_c"]),
                            "hi_max_c": float(row["hi_max_c"]),
                            "anom_hi": float(row["anom_hi"]),
                            "warm_night_flag": bool(row["warm_night_flag"]),
                            "promo_flag": bool(row["promo_flag"]),
                            "in_stock_flag": bool(row["in_stock_flag"]),
                            "price": float(row["price"]),
                        },
                    }
                )

        forecasts = pd.DataFrame(output_rows)
        if forecasts.empty:
            return forecasts

        forecasts = enforce_quantile_monotonicity(forecasts)
        if admin1_totals is not None and not admin1_totals.empty:
            forecasts = self.reconcile_to_admin1_totals(forecasts, admin1_totals)
        return forecasts

    def reconcile_to_admin1_totals(
        self,
        forecasts: pd.DataFrame,
        admin1_totals: pd.DataFrame,
    ) -> pd.DataFrame:
        """Apply least-squares reconciliation to match admin1 totals."""

        reconciled = forecasts.copy()
        totals = admin1_totals.copy()
        totals["forecast_date"] = pd.to_datetime(totals["forecast_date"]).dt.date

        for quantile in ("p10", "p50", "p90"):
            target_column = quantile if quantile in totals.columns else None
            if target_column is None:
                continue

            for key, group in reconciled.groupby(
                ["country_code", "admin1", "sku_id", "forecast_date"], observed=True
            ):
                country_code, admin1, sku_id, forecast_date = key
                target_rows = totals.loc[
                    (totals["country_code"] == country_code)
                    & (totals["admin1"] == admin1)
                    & (totals["sku_id"] == sku_id)
                    & (totals["forecast_date"] == forecast_date)
                ]
                if target_rows.empty:
                    continue

                target_total = float(target_rows.iloc[0][target_column])
                current_total = float(group[quantile].sum())
                adjustment = (target_total - current_total) / max(len(group), 1)
                reconciled.loc[group.index, quantile] = np.maximum(0.0, group[quantile] + adjustment)

        return enforce_quantile_monotonicity(reconciled)

    def save_forecasts(self, session: Session, forecasts: pd.DataFrame) -> None:
        """Persist demand forecasts to PostgreSQL."""

        if forecasts.empty:
            return

        rows = forecasts[
            ["country_code", "district_id", "sku_id", "run_time", "forecast_date", "p10", "p50", "p90", "drivers_json"]
        ].to_dict(orient="records")
        statement = insert(DemandForecast).values(rows)
        statement = statement.on_conflict_do_update(
            index_elements=[
                DemandForecast.country_code,
                DemandForecast.district_id,
                DemandForecast.sku_id,
                DemandForecast.run_time,
                DemandForecast.forecast_date,
            ],
            set_={
                "p10": statement.excluded.p10,
                "p50": statement.excluded.p50,
                "p90": statement.excluded.p90,
                "drivers_json": statement.excluded.drivers_json,
            },
        )
        session.execute(statement)
        session.commit()


def load_training_frames(
    session: Session,
    country_code: str,
    sku_id: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load ORM tables into pandas frames for training."""

    demand_query = select(DemandActual).where(DemandActual.country_code == country_code)
    if sku_id is not None:
        demand_query = demand_query.where(DemandActual.sku_id == sku_id)

    weather_query = select(WeatherDailyFeature).where(WeatherDailyFeature.country_code == country_code)
    district_query = select(District).where(District.country_code == country_code)

    demand = pd.DataFrame([row.__dict__ for row in session.execute(demand_query).scalars()])
    weather = pd.DataFrame([row.__dict__ for row in session.execute(weather_query).scalars()])
    districts = pd.DataFrame([row.__dict__ for row in session.execute(district_query).scalars()])

    if "_sa_instance_state" in demand.columns:
        demand = demand.drop(columns=["_sa_instance_state"])
    if "_sa_instance_state" in weather.columns:
        weather = weather.drop(columns=["_sa_instance_state"])
    if "_sa_instance_state" in districts.columns:
        districts = districts.drop(columns=["_sa_instance_state"])
    return demand, weather, districts


def build_parser() -> argparse.ArgumentParser:
    """Construct a CLI parser for fitting and forecasting demand."""

    parser = argparse.ArgumentParser(description="Train district-level demand forecasts.")
    parser.add_argument("--country-code", required=True)
    parser.add_argument("--sku-id", default=None)
    parser.add_argument("--future-weather-json", required=True)
    parser.add_argument("--admin1-totals-json", default=None)
    return parser


def main() -> None:
    """CLI entrypoint."""

    from ..db import SessionLocal

    args = build_parser().parse_args()
    future_weather = pd.read_json(args.future_weather_json)
    admin1_totals = pd.read_json(args.admin1_totals_json) if args.admin1_totals_json else None

    with SessionLocal() as session:
        demand, weather, districts = load_training_frames(session, args.country_code, args.sku_id)
        model = HierarchicalDemandForecaster().fit(demand, weather, districts)
        forecasts = model.predict(future_weather, admin1_totals=admin1_totals)
        model.save_forecasts(session, forecasts)
        print(json.dumps({"rows_written": int(len(forecasts))}))


if __name__ == "__main__":
    main()
