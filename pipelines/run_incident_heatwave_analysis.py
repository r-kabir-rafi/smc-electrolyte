"""Run lag correlation and count-model analytics for incident-heatwave panel."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
import statsmodels.api as sm

PANEL_IN = Path("data_processed/incident_heatwave_panel.parquet")
METRICS_OUT = Path("data_processed/analysis_metrics.json")
SUMMARY_OUT = Path("docs/analysis_summary.md")


CATEGORY_ORDER = ["none", "watch", "high", "extreme"]
INCIDENT_BINS = ["0", "1", "2", "3+"]


def _mode_or_unknown(series: pd.Series) -> str:
    s = series.dropna()
    if s.empty:
        return "unknown"
    m = s.mode()
    return str(m.iloc[0]) if not m.empty else "unknown"


def _build_district_day_panel(panel: pd.DataFrame) -> pd.DataFrame:
    df = panel.copy()
    df["event_date"] = pd.to_datetime(df["event_date"])

    daily = (
        df.groupby(["district_code", "event_date"], as_index=False)
        .agg(
            incident_count=("incident_id", "count"),
            deaths_total=("deaths", "sum"),
            hospitalized_total=("hospitalized", "sum"),
            intensity_score=("lag_0_intensity_score", "mean"),
            intensity_category=("lag_0_intensity_category", _mode_or_unknown),
        )
        .sort_values(["district_code", "event_date"])
    )

    # Add lagged intensity predictors for count models.
    for lag in [1, 2, 3]:
        daily[f"intensity_lag_{lag}"] = daily.groupby("district_code")["intensity_score"].shift(lag)

    return daily


def _lag_correlations(daily: pd.DataFrame) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for lag in [0, 1, 2, 3]:
        tmp = daily.copy()
        tmp["future_incidents"] = tmp.groupby("district_code")["incident_count"].shift(-lag)
        valid = tmp.dropna(subset=["intensity_score", "future_incidents"])
        corr = float(valid["intensity_score"].corr(valid["future_incidents"])) if len(valid) > 2 else float("nan")
        out.append(
            {
                "lag_days": lag,
                "n_obs": int(len(valid)),
                "correlation": None if np.isnan(corr) else round(corr, 4),
            }
        )
    return out


def _fit_models(daily: pd.DataFrame) -> dict[str, Any]:
    model_df = daily.dropna(subset=["incident_count", "intensity_score"]).copy()
    if model_df.empty:
        return {"poisson": {}, "negative_binomial": {}}

    formula = "incident_count ~ intensity_score + intensity_lag_1 + intensity_lag_2 + intensity_lag_3 + C(district_code)"
    for col in ["intensity_lag_1", "intensity_lag_2", "intensity_lag_3"]:
        model_df[col] = model_df[col].fillna(0)
    model_df["district_code"] = model_df["district_code"].astype("category")

    poisson = smf.glm(formula=formula, data=model_df, family=sm.families.Poisson()).fit()
    nb = smf.glm(formula=formula, data=model_df, family=sm.families.NegativeBinomial()).fit()

    def pack(result: Any) -> dict[str, Any]:
        coeff = result.params.to_dict()
        pvals = result.pvalues.to_dict()
        core = {
            k: {"coef": round(float(coeff.get(k, 0.0)), 4), "p_value": round(float(pvals.get(k, 1.0)), 4)}
            for k in ["intensity_score", "intensity_lag_1", "intensity_lag_2", "intensity_lag_3"]
        }
        return {
            "aic": round(float(result.aic), 2),
            "pseudo_r2": round(float(1 - (result.deviance / result.null_deviance)), 4) if result.null_deviance else None,
            "effects": core,
        }

    return {"poisson": pack(poisson), "negative_binomial": pack(nb)}


def _build_heatmap(daily: pd.DataFrame) -> dict[str, Any]:
    temp = daily.copy()
    temp["inc_bin"] = pd.cut(
        temp["incident_count"],
        bins=[-1, 0, 1, 2, 10_000],
        labels=INCIDENT_BINS,
    )

    matrix = (
        temp.pivot_table(
            index="intensity_category",
            columns="inc_bin",
            values="incident_count",
            aggfunc="count",
            fill_value=0,
        )
        .reindex(CATEGORY_ORDER)
        .reindex(columns=INCIDENT_BINS)
        .fillna(0)
        .astype(int)
    )

    return {
        "intensity_categories": CATEGORY_ORDER,
        "incident_bins": INCIDENT_BINS,
        "matrix": matrix.values.tolist(),
    }


def _write_summary(metrics: dict[str, Any]) -> None:
    lags = metrics["lag_correlations"]
    best = max([x for x in lags if x["correlation"] is not None], key=lambda x: x["correlation"], default=None)

    nb = metrics["count_models"].get("negative_binomial", {})
    eff = nb.get("effects", {})

    lines = [
        "# Incident vs Heatwave Analysis Summary",
        "",
        f"Generated at: {metrics['generated_at']}",
        f"Panel rows: {metrics['panel_rows']}",
        f"District-day rows: {metrics['district_day_rows']}",
        "",
        "## Lag Correlation (heatwave at day t vs incidents at t+lag)",
    ]

    for row in lags:
        lines.append(f"- Lag {row['lag_days']} day(s): correlation={row['correlation']} (n={row['n_obs']})")

    lines.extend([
        "",
        "## Count Models",
        f"- Poisson AIC: {metrics['count_models'].get('poisson', {}).get('aic')}",
        f"- Negative Binomial AIC: {nb.get('aic')}",
        "- Negative Binomial key effects (coef, p-value):",
    ])

    for key in ["intensity_score", "intensity_lag_1", "intensity_lag_2", "intensity_lag_3"]:
        obj = eff.get(key, {"coef": None, "p_value": None})
        lines.append(f"  - {key}: coef={obj['coef']}, p={obj['p_value']}")

    lines.extend([
        "",
        "## Interpretation",
    ])

    if best:
        corr_val = best["correlation"] or 0
        if corr_val >= 0.1:
            direction = "rise"
        elif corr_val <= -0.1:
            direction = "fall"
        else:
            direction = "not show a clear rise"
        lines.append(
            f"- Strongest lag association observed at +{best['lag_days']} day(s) with correlation {best['correlation']}; incidents tend to {direction} as intensity increases in this dataset."
        )
    else:
        lines.append("- No valid lag correlation could be estimated.")

    SUMMARY_OUT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    panel = pd.read_parquet(PANEL_IN)
    daily = _build_district_day_panel(panel)

    metrics: dict[str, Any] = {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "panel_rows": int(len(panel)),
        "district_day_rows": int(len(daily)),
        "lag_correlations": _lag_correlations(daily),
        "count_models": _fit_models(daily),
        "heatmap": _build_heatmap(daily),
    }

    METRICS_OUT.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    _write_summary(metrics)
    print(f"Wrote {METRICS_OUT}")
    print(f"Wrote {SUMMARY_OUT}")


if __name__ == "__main__":
    main()
