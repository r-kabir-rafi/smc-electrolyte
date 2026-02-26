# Heatwave Predictor Model Card

Model version: `heatwave-forecast-v1.0`

## Objective
Predict district-level high heatwave class for horizons +1, +3, +7 days.

## Data
- Training file: `data_processed/model_training.parquet`
- Feature groups: recent temperature trend, seasonal indicators, reanalysis-derived intensity features
- Split: year-based (latest year held out)

## Baseline vs Improved
- Horizon +1d: baseline F1=0.6134, improved F1=0.7778, improved AUC=0.9704
- Horizon +3d: baseline F1=0.5966, improved F1=0.794, improved AUC=0.9728
- Horizon +7d: baseline F1=0.5378, improved F1=0.7609, improved AUC=0.9695

## Conclusion
- Improved model beats baseline on at least one horizon metric.

## Caveats
- Current demo run uses climatology-expanded historical coverage for reproducibility.
- Replace with real multi-year reanalysis inputs for production forecasting.