# Incident vs Heatwave Analysis Summary

Generated at: 2026-02-26T11:00:37.989648+00:00
Panel rows: 520
District-day rows: 216

## Lag Correlation (heatwave at day t vs incidents at t+lag)
- Lag 0 day(s): correlation=0.0023 (n=216)
- Lag 1 day(s): correlation=0.0024 (n=210)
- Lag 2 day(s): correlation=-0.0369 (n=204)
- Lag 3 day(s): correlation=0.0068 (n=198)

## Count Models
- Poisson AIC: 638.96
- Negative Binomial AIC: 910.87
- Negative Binomial key effects (coef, p-value):
  - intensity_score: coef=0.0122, p=0.9222
  - intensity_lag_1: coef=-0.003, p=0.9824
  - intensity_lag_2: coef=-0.0252, p=0.8539
  - intensity_lag_3: coef=0.0134, p=0.9138

## Interpretation
- Strongest lag association observed at +3 day(s) with correlation 0.0068; incidents tend to not show a clear rise as intensity increases in this dataset.