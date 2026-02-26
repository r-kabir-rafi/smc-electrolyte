"""Fetch real-time and historical temperature data from Open-Meteo API.

Open-Meteo is free, no API key required, and provides:
- Historical temperature data
- 7-day forecasts
- Humidity, apparent temperature (heat index)
- Hourly and daily aggregations

Usage:
    python3 pipelines/fetch_openmeteo_temperature.py --days 30
    python3 pipelines/fetch_openmeteo_temperature.py --forecast
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import requests

# Bangladesh district centroids (major districts)
DISTRICT_COORDS = {
    "Dhaka": {"lat": 23.8103, "lon": 90.4125, "code": "BD-13"},
    "Chittagong": {"lat": 22.3569, "lon": 91.7832, "code": "BD-10"},
    "Rajshahi": {"lat": 24.3745, "lon": 88.6042, "code": "BD-69"},
    "Khulna": {"lat": 22.8456, "lon": 89.5403, "code": "BD-27"},
    "Barisal": {"lat": 22.7010, "lon": 90.3535, "code": "BD-06"},
    "Sylhet": {"lat": 24.8949, "lon": 91.8687, "code": "BD-60"},
    "Rangpur": {"lat": 25.7439, "lon": 89.2752, "code": "BD-55"},
    "Mymensingh": {"lat": 24.7471, "lon": 90.4203, "code": "BD-34"},
    "Comilla": {"lat": 23.4607, "lon": 91.1809, "code": "BD-08"},
    "Gazipur": {"lat": 23.9999, "lon": 90.4203, "code": "BD-33"},
    "Narayanganj": {"lat": 23.6238, "lon": 90.5000, "code": "BD-35"},
    "Bogra": {"lat": 24.8510, "lon": 89.3697, "code": "BD-03"},
    "Cox's Bazar": {"lat": 21.4272, "lon": 92.0058, "code": "BD-11"},
    "Jessore": {"lat": 23.1667, "lon": 89.2167, "code": "BD-22"},
    "Dinajpur": {"lat": 25.6217, "lon": 88.6354, "code": "BD-17"},
}

OUTPUT_DIR = Path("data_processed")
RAW_DIR = Path("data_raw/temperature")


def calculate_heat_index(temp_c: float, humidity: float) -> float:
    """Calculate heat index (apparent temperature) in Celsius.
    
    Uses simplified Rothfusz regression equation.
    """
    # Convert to Fahrenheit for formula
    T = temp_c * 9/5 + 32
    R = humidity
    
    if T < 80:
        # Simple formula for lower temps
        HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (R * 0.094))
    else:
        # Full Rothfusz regression
        HI = (-42.379 + 2.04901523*T + 10.14333127*R 
              - 0.22475541*T*R - 0.00683783*T*T 
              - 0.05481717*R*R + 0.00122874*T*T*R 
              + 0.00085282*T*R*R - 0.00000199*T*T*R*R)
        
        # Adjustments
        if R < 13 and 80 <= T <= 112:
            HI -= ((13 - R) / 4) * ((17 - abs(T - 95)) / 17) ** 0.5
        elif R > 85 and 80 <= T <= 87:
            HI += ((R - 85) / 10) * ((87 - T) / 5)
    
    # Convert back to Celsius
    return (HI - 32) * 5/9


def calculate_electrolyte_risk(temp_c: float, humidity: float, heat_index_c: float) -> dict:
    """Calculate electrolyte depletion risk score and recommendations.
    
    Returns risk level (0-1) and hydration recommendations.
    """
    # Base risk from temperature
    if temp_c >= 40:
        temp_risk = 1.0
    elif temp_c >= 35:
        temp_risk = 0.7 + (temp_c - 35) * 0.06
    elif temp_c >= 30:
        temp_risk = 0.4 + (temp_c - 30) * 0.06
    elif temp_c >= 25:
        temp_risk = 0.1 + (temp_c - 25) * 0.06
    else:
        temp_risk = 0.1
    
    # Humidity modifier (high humidity = harder to cool via sweat)
    humidity_factor = 1.0 + (humidity - 50) * 0.005 if humidity > 50 else 1.0
    
    # Heat index modifier
    hi_diff = heat_index_c - temp_c
    hi_factor = 1.0 + hi_diff * 0.02 if hi_diff > 0 else 1.0
    
    risk_score = min(1.0, temp_risk * humidity_factor * hi_factor)
    
    # Risk category and recommendations
    if risk_score >= 0.8:
        category = "extreme"
        water_l = 4.0
        electrolyte_packs = 3
        recommendation = "Critical: Stay indoors, continuous hydration required"
    elif risk_score >= 0.6:
        category = "high"
        water_l = 3.0
        electrolyte_packs = 2
        recommendation = "High risk: Limit outdoor activity, frequent hydration"
    elif risk_score >= 0.4:
        category = "moderate"
        water_l = 2.5
        electrolyte_packs = 1
        recommendation = "Moderate: Regular water breaks, consider electrolytes"
    elif risk_score >= 0.2:
        category = "low"
        water_l = 2.0
        electrolyte_packs = 0
        recommendation = "Low risk: Normal hydration adequate"
    else:
        category = "minimal"
        water_l = 1.5
        electrolyte_packs = 0
        recommendation = "Minimal risk: Standard hydration"
    
    return {
        "risk_score": round(risk_score, 3),
        "risk_category": category,
        "recommended_water_liters": water_l,
        "recommended_electrolyte_packs": electrolyte_packs,
        "recommendation": recommendation,
    }


def fetch_historical(days: int = 30) -> pd.DataFrame:
    """Fetch historical temperature data from Open-Meteo."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    all_data = []
    
    for district, coords in DISTRICT_COORDS.items():
        print(f"Fetching {district}...")
        
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
            "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,apparent_temperature_max",
            "timezone": "Asia/Dhaka",
        }
        
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            
            daily = data.get("daily", {})
            dates = daily.get("time", [])
            tmax = daily.get("temperature_2m_max", [])
            tmin = daily.get("temperature_2m_min", [])
            humidity = daily.get("relative_humidity_2m_mean", [])
            apparent_max = daily.get("apparent_temperature_max", [])
            
            for i, date in enumerate(dates):
                t = tmax[i] if i < len(tmax) and tmax[i] is not None else 30.0
                h = humidity[i] if i < len(humidity) and humidity[i] is not None else 70.0
                hi = apparent_max[i] if i < len(apparent_max) and apparent_max[i] is not None else calculate_heat_index(t, h)
                
                elec_risk = calculate_electrolyte_risk(t, h, hi)
                
                all_data.append({
                    "district_code": coords["code"],
                    "district_name": district,
                    "date": date,
                    "tmax_c": t,
                    "tmin_c": tmin[i] if i < len(tmin) else None,
                    "humidity_pct": h,
                    "heat_index_c": hi,
                    **elec_risk,
                })
            
            time.sleep(0.5)  # Rate limiting
            
        except Exception as e:
            print(f"  Error fetching {district}: {e}")
    
    return pd.DataFrame(all_data)


def fetch_forecast() -> pd.DataFrame:
    """Fetch 7-day forecast from Open-Meteo."""
    all_data = []
    
    for district, coords in DISTRICT_COORDS.items():
        print(f"Fetching forecast for {district}...")
        
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,apparent_temperature_max",
            "timezone": "Asia/Dhaka",
            "forecast_days": 7,
        }
        
        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            
            daily = data.get("daily", {})
            dates = daily.get("time", [])
            tmax = daily.get("temperature_2m_max", [])
            tmin = daily.get("temperature_2m_min", [])
            humidity = daily.get("relative_humidity_2m_mean", [])
            apparent_max = daily.get("apparent_temperature_max", [])
            
            for i, date in enumerate(dates):
                t = tmax[i] if i < len(tmax) and tmax[i] is not None else 30.0
                h = humidity[i] if i < len(humidity) and humidity[i] is not None else 70.0
                hi = apparent_max[i] if i < len(apparent_max) and apparent_max[i] is not None else calculate_heat_index(t, h)
                
                elec_risk = calculate_electrolyte_risk(t, h, hi)
                
                all_data.append({
                    "district_code": coords["code"],
                    "district_name": district,
                    "forecast_date": date,
                    "tmax_c": t,
                    "tmin_c": tmin[i] if i < len(tmin) else None,
                    "humidity_pct": h,
                    "heat_index_c": hi,
                    **elec_risk,
                })
            
            time.sleep(0.3)
            
        except Exception as e:
            print(f"  Error fetching {district}: {e}")
    
    return pd.DataFrame(all_data)


def intensity_category(tmax: float) -> str:
    """Classify heatwave intensity."""
    if tmax >= 40:
        return "extreme"
    elif tmax >= 37:
        return "high"
    elif tmax >= 34:
        return "watch"
    return "none"


def save_geojson(df: pd.DataFrame, output_path: Path, date_col: str = "date") -> None:
    """Convert dataframe to GeoJSON with real district boundaries."""
    # Load real boundaries
    real_path = OUTPUT_DIR / "bd_districts_real.geojson"
    if real_path.exists():
        with open(real_path) as f:
            real_districts = json.load(f)
        
        geo_lookup = {}
        for feat in real_districts["features"]:
            name = feat["properties"].get("NAME_2", "").lower()
            geo_lookup[name] = feat["geometry"]
    else:
        geo_lookup = {}
    
    name_map = {
        "barisal": "barisal",
        "chittagong": "chittagong",
        "dhaka": "dhaka",
        "khulna": "khulna",
        "sylhet": "sylhet",
        "rajshahi": "rajshahi",
        "rangpur": "rangpur",
        "mymensingh": "mymensingh",
        "comilla": "comilla",
        "gazipur": "gazipur",
        "narayanganj": "narayanganj",
        "bogra": "bogra",
        "cox's bazar": "cox's bazar",
        "jessore": "jessore",
        "dinajpur": "dinajpur",
    }
    
    features = []
    for _, row in df.iterrows():
        district_name = row["district_name"].lower()
        gadm_name = name_map.get(district_name, district_name)
        
        geometry = geo_lookup.get(gadm_name, {
            "type": "Point",
            "coordinates": [90.4, 23.8]  # Fallback to Dhaka center
        })
        
        props = row.to_dict()
        props["intensity_category"] = intensity_category(row["tmax_c"])
        
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": geometry,
        })
    
    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }
    
    with open(output_path, "w") as f:
        json.dump(geojson, f)
    
    print(f"Saved {len(features)} features to {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch Open-Meteo temperature data")
    parser.add_argument("--days", type=int, default=30, help="Historical days to fetch")
    parser.add_argument("--forecast", action="store_true", help="Fetch 7-day forecast")
    parser.add_argument("--all", action="store_true", help="Fetch both historical and forecast")
    args = parser.parse_args()
    
    OUTPUT_DIR.mkdir(exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    
    if args.forecast or args.all:
        print("\n=== Fetching 7-day forecast ===")
        forecast_df = fetch_forecast()
        
        # Save as CSV
        forecast_df.to_csv(RAW_DIR / "forecast_latest.csv", index=False)
        
        # Save as GeoJSON
        save_geojson(forecast_df, OUTPUT_DIR / "forecast_realtime.geojson", "forecast_date")
        
        print(f"Forecast data: {len(forecast_df)} records")
        print(forecast_df[["district_name", "forecast_date", "tmax_c", "risk_category"]].head(10))
    
    if not args.forecast or args.all:
        print(f"\n=== Fetching {args.days} days historical data ===")
        hist_df = fetch_historical(args.days)
        
        # Save as CSV
        hist_df.to_csv(RAW_DIR / "historical_latest.csv", index=False)
        
        # Save as GeoJSON for daily view
        save_geojson(hist_df, OUTPUT_DIR / "heatwave_realtime_daily.geojson", "date")
        
        print(f"Historical data: {len(hist_df)} records")
        print(hist_df[["district_name", "date", "tmax_c", "risk_category"]].tail(10))
    
    print("\n=== Done ===")
    print("Data saved to data_processed/ and data_raw/temperature/")


if __name__ == "__main__":
    main()
