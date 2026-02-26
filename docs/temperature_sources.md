# Historical Temperature Sources

## Primary source
- ERA5-Land daily aggregated reanalysis (Copernicus CDS)
- Variable: daily maximum 2m air temperature (`tasmax` equivalent)
- Format: NetCDF (`.nc`)
- Coverage: gridded, consistent national coverage

## Backup source
- NASA POWER Daily API (point/grid extracted series), or Berkeley Earth gridded temperature products
- Variable: daily max temperature (`T2M_MAX` / equivalent)
- Format: CSV/NetCDF; convert to pipeline schema and save under `data_raw/temperature/`

## Local run mode in this repo
Network-restricted environments use:
- `python3 pipelines/generate_demo_temperature.py`

This produces `data_raw/temperature/demo_tmax_2025.nc` so ETL and map layers remain fully runnable.
