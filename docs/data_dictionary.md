# Data Dictionary (Draft)

## Planned datasets
- Heatwave indicators (daily max temp, anomaly, duration)
- Population exposure (district/upazila level)
- Heatstroke/health incident records (news-derived)
- Mobility proxies (to be specified)

## Implemented datasets (Phase 3)
- `data_processed/tmax_daily.parquet`
  - `date`, `lat`, `lon`, `grid_id`, `tmax_c`
- `data_processed/tmax_daily_district.parquet`
  - `date`, `district_code`, `district_name`, `tmax_c`
- `data_processed/heatwave_index_daily.parquet`
  - `date`, `entity_type`, temperature fields, threshold flags, percentile anomaly fields, `intensity_score`, `intensity_category`, `model_version`
- `data_processed/heatwave_district_daily.geojson`
  - district geometry + per-day intensity properties
- `data_processed/heatwave_district_weekly.geojson`
  - district geometry + per-week intensity properties
- `data_processed/incident_heatwave_panel.parquet`
  - incident-level rows with `event_date`, district mapping, and `lag_0..lag_7` heatwave features
- `data_processed/analysis_metrics.json`
  - lag correlations, Poisson/NegBin summary stats, and heatmap matrix for dashboard rendering
- `data_processed/pop_density.tif`
  - gridded population density proxy raster (with `.tfw` and `.prj` sidecars)
- `data_processed/pop_density_admin.parquet`
  - district-level mean population density and exposed population proxy
- `data_processed/mobility_proxy.parquet`
  - district-level movement proxy components and final ranking

## Core fields (target)
- `event_date` (date)
- `district` (string)
- `upazila` (string, optional)
- `lat`, `lon` (float)
- `heatwave_intensity_index` (float)
- `incident_count` (int)
- `population_exposed` (int)
- `source_url` (string)
