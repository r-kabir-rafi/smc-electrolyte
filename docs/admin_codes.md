# Bangladesh Admin Code Mapping Rules

## Canonical keys
- District: `district_code`, `district_name`
- Upazila: `upazila_code`, `upazila_name`, `district_code`, `district_name`

## Normalization rules used in ETL
The pipeline maps alternate source field names into canonical keys:

- District code candidates: `district_code`, `DIST_CODE`, `ADM2_PCODE`, `id`
- District name candidates: `district_name`, `DIST_NAME`, `ADM2_EN`, `name`, `shapeName`
- Upazila code candidates: `upazila_code`, `UPA_CODE`, `ADM3_PCODE`, `id`
- Upazila name candidates: `upazila_name`, `UPA_NAME`, `ADM3_EN`, `name`, `shapeName`
- Parent district code candidates: `district_code`, `DIST_CODE`, `ADM2_PCODE`

## Current processed outputs
- `data_processed/bd_admin_district.geojson`
- `data_processed/bd_admin_upazila.geojson`

## Demo mapping included in this repo
- `BD-13` -> Dhaka
- `BD-10` -> Chattogram
- `BD-13-18` -> Dhamrai (Dhaka)
- `BD-10-41` -> Patiya (Chattogram)

When public boundary source files are added under `data_raw/`, rerun:

```bash
python3 pipelines/etl_admin_boundaries.py
```
