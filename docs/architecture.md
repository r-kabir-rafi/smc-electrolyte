# Architecture (Phase 1)

## Services
- `frontend` (Next.js): map UI and dashboard shell
- `backend` (FastAPI): API for health, heatwave summaries, and future analytics endpoints
- `db` (Postgres + PostGIS): geospatial storage and query engine

## Data flow (target)
1. Pipelines ingest sources into `data_raw/`.
2. ETL scripts transform into `data_intermediate/` and `data_processed/`.
3. Backend serves processed outputs and model results.
4. Frontend renders map overlays and ranked hotspot/market lists.
