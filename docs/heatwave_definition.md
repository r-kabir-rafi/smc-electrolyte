# Heatwave Definition (v1.0)

Model version: `heatwave-index-v1.0`

## Inputs
- Daily max temperature (`tmax_c`) from gridded NetCDF files in `data_raw/temperature/*.nc`
- District boundaries from `data_processed/bd_admin_district.geojson`

## Index components
1. Threshold index
- `threshold_36 = 1` if `tmax_c >= 36C`, else 0
- `threshold_38 = 1` if `tmax_c >= 38C`, else 0
- `threshold_40 = 1` if `tmax_c >= 40C`, else 0
- `threshold_level = threshold_36 + threshold_38 + threshold_40`

2. Percentile anomaly index
- For each entity (`grid_id` or `district_code`) and day-of-year (`doy`), compute historical `p90_doy`
- `anomaly_c = tmax_c - p90_doy`
- `anomaly_flag = 1` if `anomaly_c > 0`, else 0

3. Combined intensity score
- `intensity_score = threshold_level + anomaly_flag`
- Categories:
  - `none`: 0
  - `watch`: 1
  - `high`: 2
  - `extreme`: >=3

## Reproducibility
Run the full historical pipeline in order:

```bash
python3 pipelines/generate_demo_temperature.py
python3 pipelines/etl_temperature.py
python3 pipelines/build_heatwave_index.py
python3 pipelines/build_heatwave_layers.py
```

For real public data, replace the demo file with downloaded NetCDF in `data_raw/temperature/` and rerun from `etl_temperature.py` onward.
