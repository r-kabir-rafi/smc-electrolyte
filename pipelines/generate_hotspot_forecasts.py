"""Generate next-7-day district hotspot forecasts and upazila ranking."""

from __future__ import annotations

import pickle
from pathlib import Path

import geopandas as gpd
import pandas as pd

TRAINING_IN = Path("data_processed/model_training.parquet")
MODEL_IN = Path("models/heatwave_predictor.pkl")
DISTRICT_GEO = Path("data_processed/bd_admin_district.geojson")
UPAZILA_GEO = Path("data_processed/bd_admin_upazila.geojson")

OUT_GEO = Path("data_processed/hotspots_next7days.geojson")
OUT_CSV = Path("data_processed/top_20_upazilas.csv")


def _risk_band(prob: float) -> str:
    if prob >= 0.75:
        return "extreme"
    if prob >= 0.55:
        return "high"
    if prob >= 0.35:
        return "watch"
    return "low"


def main() -> None:
    df = pd.read_parquet(TRAINING_IN)
    df["date"] = pd.to_datetime(df["date"])

    with MODEL_IN.open("rb") as fh:
        bundle = pickle.load(fh)

    cat_cols = bundle["feature_columns"]["categorical"]
    num_cols = bundle["feature_columns"]["numeric"]
    feature_cols = cat_cols + num_cols

    latest = df["date"].max()
    curr = df[df["date"] == latest].copy()

    probs = {}
    for horizon in [1, 3, 7]:
        model = bundle["horizons"][f"h{horizon}"]
        probs[horizon] = model.predict_proba(curr[feature_cols])[:, 1]

    rows = []
    for day in range(1, 8):
        if day <= 3:
            w = (day - 1) / (3 - 1) if day > 1 else 0.0
            day_prob = probs[1] * (1 - w) + probs[3] * w
        elif day <= 7:
            w = (day - 3) / (7 - 3)
            day_prob = probs[3] * (1 - w) + probs[7] * w
        else:
            day_prob = probs[7]

        target_date = latest + pd.Timedelta(days=day)
        for (_, row), p in zip(curr.iterrows(), day_prob):
            rows.append(
                {
                    "district_code": row["district_code"],
                    "district_name": row["district_name"],
                    "forecast_date": target_date,
                    "horizon_days": day,
                    "risk_probability": float(p),
                    "risk_band": _risk_band(float(p)),
                }
            )

    forecast_df = pd.DataFrame(rows)

    district_gdf = gpd.read_file(DISTRICT_GEO)
    forecast_geo = district_gdf.merge(forecast_df, on=["district_code", "district_name"], how="inner")
    forecast_geo["forecast_date"] = pd.to_datetime(forecast_geo["forecast_date"]).dt.date.astype(str)
    forecast_geo.to_file(OUT_GEO, driver="GeoJSON")

    upazila = gpd.read_file(UPAZILA_GEO)
    upazila_rank = upazila[["upazila_code", "upazila_name", "district_code", "district_name"]].merge(
        forecast_df.groupby(["district_code", "district_name"], as_index=False)["risk_probability"].max(),
        on=["district_code", "district_name"],
        how="left",
    )
    upazila_rank["risk_probability"] = upazila_rank["risk_probability"].fillna(0)
    upazila_rank["risk_band"] = upazila_rank["risk_probability"].apply(_risk_band)
    upazila_rank = upazila_rank.sort_values("risk_probability", ascending=False).head(20)
    upazila_rank.to_csv(OUT_CSV, index=False)

    print(f"Wrote {OUT_GEO} ({len(forecast_geo)} features)")
    print(f"Wrote {OUT_CSV} ({len(upazila_rank)} rows)")


if __name__ == "__main__":
    main()
