# SMC Electrolyte Heatwave Risk Platform

Phase 1 scaffold for Bangladesh heatwave + health risk analytics.

## Stack
- Backend: FastAPI (Python)
- Frontend: Next.js + Leaflet map shell
- ETL/Pipelines: Python scripts
- Storage: Postgres + PostGIS

## Quickstart
```bash
make setup
```

Start services in separate terminals:
```bash
make backend-dev
make frontend-dev
```

Frontend: http://localhost:3000
Backend: http://localhost:8000/docs

## Admin Boundary Pipeline
```bash
python3 pipelines/etl_admin_boundaries.py
```

If public source files are not present in `data_raw/`, run demo mode:
```bash
python3 pipelines/etl_admin_boundaries.py --use-demo
```

API endpoints:
- `GET /api/v1/admin/districts`
- `GET /api/v1/admin/upazilas`
- `GET /api/v1/admin/districts/{district_code}`
- `GET /api/v1/admin/upazilas/{upazila_code}`

## Incidents Page + API
Frontend routes:
- `GET /incidents` — filterable table with pagination and CSV export
- `GET /incidents/{id}` — detail view with map

Backend incidents endpoints:
- `GET /api/v1/incidents` — paginated list with filters
- `GET /api/v1/incidents/{id}` — single incident detail
- `GET /api/v1/incidents/districts` — list of districts for dropdown
- `GET /api/v1/incidents/export` — CSV download of filtered results

Incident data source resolution order:
1. `data_processed/heatstroke_incidents.geojson` (preferred; includes geocoded points/admin codes)
2. `data_processed/heatstroke_incidents.csv`
3. `data_processed/heatstroke_incidents.parquet`

`/api/v1/incidents` supports:
- `start_date`, `end_date` (YYYY-MM-DD)
- `district`
- `type=death|injury|all`
- `q` (search over place + headline)
- `sort=date_desc|date_asc`
- `page`, `page_size`

## Historical Heatwave Pipeline (Phase 3)
Generate demo temperature and derived heatwave layers:
```bash
python3 pipelines/generate_demo_temperature.py
python3 pipelines/etl_temperature.py
python3 pipelines/build_heatwave_index.py
python3 pipelines/build_heatwave_layers.py
```

Primary processed outputs:
- `data_processed/tmax_daily.parquet`
- `data_processed/heatwave_index_daily.parquet`
- `data_processed/heatwave_district_daily.geojson`
- `data_processed/heatwave_district_weekly.geojson`

Heatwave API:
- `GET /api/v1/heatwave/dates?level=daily|weekly`
- `GET /api/v1/heatwave/choropleth?level=daily|weekly&date=YYYY-MM-DD`
- `GET /api/v1/heatwave/categories`
- `GET /api/v1/heatwave/summary`

Source notes:
- [temperature_sources.md](/home/rafi/code/smc-electrolyte/docs/temperature_sources.md)
- [heatwave_definition.md](/home/rafi/code/smc-electrolyte/docs/heatwave_definition.md)

## Heatstroke News Pipeline (Phase 4)
```bash
python3 pipelines/news_collect.py --demo --demo-count 520
python3 pipelines/extract_heatstroke_incidents.py
python3 pipelines/geocode_incidents.py
```

Outputs:
- `data_raw/news/articles.jsonl`
- `data_intermediate/news_parsed.parquet`
- `data_processed/heatstroke_incidents.csv`
- `data_processed/heatstroke_incidents.geojson`

Audit helpers:
```bash
python3 pipelines/audit_incident_extraction.py --sample-size 80
python3 pipelines/audit_incident_extraction.py --score --sample-path data_intermediate/incident_audit_sample.csv
```

Details:
- [news_pipeline.md](/home/rafi/code/smc-electrolyte/docs/news_pipeline.md)

## Overlay + Correlation (Phase 5)
Build incident-heatwave join panel and analytics:
```bash
python3 pipelines/build_incident_heatwave_panel.py
python3 pipelines/run_incident_heatwave_analysis.py
```

Outputs:
- `data_processed/incident_heatwave_panel.parquet`
- `data_processed/analysis_metrics.json`
- `docs/analysis_summary.md`

Analysis API:
- `GET /api/v1/analysis/metrics`
- `GET /api/v1/analysis/lags`
- `GET /api/v1/analysis/heatmap`
- `GET /api/v1/analysis/panel-preview`

## Forecast Layer (Phase 6)
Build prediction dataset, train models, and generate hotspots:
```bash
python3 pipelines/build_prediction_dataset.py
python3 pipelines/train_heatwave_models.py
python3 pipelines/generate_hotspot_forecasts.py
```

Outputs:
- `data_processed/model_training.parquet`
- `models/heatwave_predictor.pkl`
- `docs/model_card.md`
- `data_processed/hotspots_next7days.geojson`
- `data_processed/top_20_upazilas.csv`

Forecast API:
- `GET /api/v1/forecast/next7`
- `GET /api/v1/forecast/dates`
- `GET /api/v1/forecast/top-upazilas`
- `GET /api/v1/forecast/model-metrics`

## Population Exposure + Mobility Proxy (Phase 7)
Build layers:
```bash
python3 pipelines/build_population_exposure.py
python3 pipelines/build_mobility_proxy.py
```

Outputs:
- `data_processed/pop_density.tif`
- `data_processed/pop_density_admin.parquet`
- `data_processed/mobility_proxy.parquet`

Exposure API:
- `GET /api/v1/exposure/population-districts`
- `GET /api/v1/exposure/mobility-districts`
- `GET /api/v1/exposure/mobility-ranking`
- `GET /api/v1/exposure/population-raster-meta`

Details:
- [exposure_methodology.md](/home/rafi/code/smc-electrolyte/docs/exposure_methodology.md)

## SMC Priority + Activation (Phase 8)
Build composite priority score and business outputs:
```bash
python3 pipelines/build_smc_priority_index.py
python3 pipelines/build_smc_activation_outputs.py
```

Outputs:
- `data_processed/smc_priority_index.csv`
- `data_processed/smc_priority_map.geojson`
- `docs/smc_activation/priority_areas.md`
- `docs/smc_activation/messaging_themes.md`
- `docs/smc_activation/timing_calendar.md`
- `docs/smc_activation/one_pagers/*.md`

SMC API:
- `GET /api/v1/smc/priority-index`
- `GET /api/v1/smc/priority-map`
- `GET /api/v1/smc/priority-meta`

Details:
- [smc_priority_methodology.md](/home/rafi/code/smc-electrolyte/docs/smc_priority_methodology.md)

## Repo Layout
- `frontend/` map UI
- `backend/` API + data services
- `pipelines/` ETL scripts
- `data_raw/` immutable source drops
- `data_intermediate/` transformed staging data
- `data_processed/` analytics-ready outputs
- `models/` model artifacts and metadata
- `docs/` data dictionary and methodology
- `tests/` cross-cutting/integration tests
