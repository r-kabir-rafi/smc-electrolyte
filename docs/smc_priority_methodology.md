# SMC Priority Index Methodology (Phase 8)

## Composite score
Base weighting (tunable):

`risk = 0.5*heatwave_forecast + 0.3*pop_exposure + 0.2*mobility_proxy`

Where:
- `heatwave_forecast`: district/upazila next-7-day risk probability score
- `pop_exposure`: normalized exposed population proxy score
- `mobility_proxy`: normalized movement intensity proxy score

## Explainability
Each row in `data_processed/smc_priority_index.csv` includes:
- component scores (`heatwave_forecast_score`, `pop_exposure_score`, `mobility_proxy_score`)
- final `smc_priority_score`
- `explainability_note` showing weighted contribution equation

## Stability
- Ranking is deterministic for a fixed data snapshot and weight set.
- Top area snapshots are exported in `data_processed/smc_priority_meta.json`.
- Weight tuning can be done later without changing the data pipeline structure.
