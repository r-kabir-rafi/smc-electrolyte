# District Heat + Demand Backend

This repository now contains two major pieces:

1. `frontend/`: the existing Next.js dashboard.
2. `app/`: a Python 3.11 FastAPI backend for district-level weather ingestion, heat-feature engineering, demand forecasting, and informational trigger evaluation.

The backend is designed for:

- district-level weather feature ingestion from ERA5-Land and optional IMD daily grids
- district-level demand forecasting with weather regressors and probabilistic outputs
- informational campaign trigger evaluation for forecast scenarios

No endpoint in the backend makes medical claims. Trigger recommendations are informational only.

## Backend Layout

```text
app/
  main.py
  db.py
  models.py
  schemas.py
  services/
    heat_features.py
    ingest_era5_land.py
    ingest_imd_grids.py
    aggregate_to_districts.py
    demand_model.py
    trigger_engine.py
tests/
  test_heat_index.py
  test_anomalies_persistence.py
  test_demand_quantiles.py
  test_trigger_engine.py
```

## Local Setup

### 1. Start PostgreSQL + PostGIS

```bash
docker compose up -d
```

This starts a local PostGIS-enabled PostgreSQL service on `localhost:5432`.

### 2. Create a Python 3.11 virtual environment

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements-backend.txt
```

### 3. Configure environment variables

Copy the example file and adjust as needed:

```bash
cp .env.example .env
```

Important variables:

- `DATABASE_URL`: SQLAlchemy connection string
- `AUTO_CREATE_SCHEMA`: set to `true` for local table creation on API startup
- `CDSAPI_URL` and `CDSAPI_KEY`: placeholders for ERA5-Land acquisition workflows
- `IMD_METADATA_JSON` and `IMD_BINARY_DIR`: optional IMD ingestion paths

### 4. Run the API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Database Notes

The backend uses PostgreSQL/PostGIS and includes these ORM-backed tables:

- `districts`
- `weather_daily_features`
- `weather_forecasts`
- `demand_actuals`
- `demand_forecasts`
- `incidents_agg`

All tables include `country_code` to support multi-country deployments.

Incident suppression rules are enforced at the API layer for any incident-serving endpoints you add later:

- counts below 5 must not be returned directly
- instead, return `suppressed_flag=true`

The current generated API does not expose incidents, but the schema supports the rule.

## Example Commands

### Ingest ERA5-Land NetCDF files

```bash
python -m app.services.ingest_era5_land \
  --country-code IN \
  --districts-geojson data/in_districts.geojson \
  --netcdf data/era5/2024-05.nc data/era5/2024-06.nc
```

### Ingest a single IMD daily tmax binary

```bash
python -m app.services.ingest_imd_grids \
  --country-code IN \
  --districts-geojson data/in_districts.geojson \
  --metadata-json /data/imd/config.json \
  --binary-file /data/imd/binaries/tmax_20240501.bin \
  --date 2024-05-01
```

### Train and write demand forecasts

Prepare a future-weather JSON file with rows containing:

- `country_code`
- `district_id`
- `sku_id`
- `date`
- `tmax_c`
- `hi_max_c`
- `anom_hi`
- `warm_night_flag`
- optional `price`, `promo_flag`, `in_stock_flag`

Then run:

```bash
python -m app.services.demand_model \
  --country-code IN \
  --sku-id electrolyte_drink_main \
  --future-weather-json data/future_weather.json
```

### Run tests

```bash
pytest tests -q
```

## API Summary

### `GET /v1/districts?country_code=IN`

Returns districts for a country.

### `GET /v1/district/{district_id}/heat?start=YYYY-MM-DD&end=YYYY-MM-DD`

Returns daily district heat features.

### `GET /v1/district/{district_id}/forecast?run_time=latest&horizon_days=14`

Returns `p10/p50/p90` weather forecasts for `tmax` and `hi_max`.

### `POST /v1/triggers/evaluate`

Evaluates a forecast scenario against a rule and returns:

- `TRIGGER` or `NO_TRIGGER`
- earliest qualifying trigger window
- reason codes
- informational audience/channel recommendations
- explainability fields

## Frontend

The existing Next.js dashboard remains under `frontend/`.

Recommended frontend flow:

```bash
bash scripts/setup_frontend.sh
bash scripts/dev_frontend.sh
```
