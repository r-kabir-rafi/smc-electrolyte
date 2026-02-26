"use client";

import { useEffect, useState } from "react";

type LagRow = { lag_days: number; n_obs: number; correlation: number | null };
type Effect = { coef: number; p_value: number };

type Metrics = {
  generated_at?: string;
  panel_rows?: number;
  district_day_rows?: number;
  lag_correlations?: LagRow[];
  count_models?: {
    poisson?: { aic?: number };
    negative_binomial?: { aic?: number; effects?: Record<string, Effect> };
  };
  heatmap?: {
    intensity_categories: string[];
    incident_bins: string[];
    matrix: number[][];
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function corrWidth(value: number | null): number {
  if (value === null) return 0;
  return Math.min(100, Math.round(Math.abs(value) * 100));
}

function heatColor(value: number, max: number): string {
  if (max <= 0) return "#f3f4f6";
  const alpha = Math.max(0.08, value / max);
  return `rgba(216, 81, 29, ${alpha.toFixed(2)})`;
}

export default function AnalysisDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${API_BASE}/api/v1/analysis/metrics`);
      if (!res.ok) return;
      setMetrics((await res.json()) as Metrics);
    };
    load().catch(() => null);
  }, []);

  const lags = metrics?.lag_correlations ?? [];
  const heatmap = metrics?.heatmap;
  const flatHeat = heatmap?.matrix?.flat() ?? [];
  const maxHeat = flatHeat.length ? Math.max(...flatHeat) : 0;

  return (
    <section className="card" style={{ marginTop: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Incident Correlation Dashboard</h2>
      <p style={{ marginBottom: "0.75rem" }}>
        Lag effects and count-model signals between heatwave intensity and casualty incidents.
      </p>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: "320px" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Lag Correlation (t vs t+lag)</h3>
          {lags.map((row) => {
            const positive = (row.correlation ?? 0) >= 0;
            return (
              <div key={row.lag_days} style={{ marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                  <span>Lag {row.lag_days}d</span>
                  <span>{row.correlation ?? "n/a"}</span>
                </div>
                <div style={{ background: "#e5e7eb", height: "10px", borderRadius: "4px" }}>
                  <div
                    style={{
                      width: `${corrWidth(row.correlation)}%`,
                      height: "10px",
                      borderRadius: "4px",
                      background: positive ? "#2f855a" : "#c53030",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ flex: "1 1 320px", minWidth: "320px" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Count Models</h3>
          <div style={{ fontSize: "0.92rem", lineHeight: 1.45 }}>
            <div>Poisson AIC: {metrics?.count_models?.poisson?.aic ?? "n/a"}</div>
            <div>NegBin AIC: {metrics?.count_models?.negative_binomial?.aic ?? "n/a"}</div>
            <div style={{ marginTop: "0.4rem" }}>NegBin key effects:</div>
            {Object.entries(metrics?.count_models?.negative_binomial?.effects ?? {}).map(([k, v]) => (
              <div key={k}>
                {k}: coef={v.coef}, p={v.p_value}
              </div>
            ))}
          </div>
        </div>
      </div>

      {heatmap && (
        <div style={{ marginTop: "1rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Heatmap: intensity bins vs incident counts</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.4rem", borderBottom: "1px solid #d1d5db" }}>
                    Intensity
                  </th>
                  {heatmap.incident_bins.map((b) => (
                    <th key={b} style={{ padding: "0.4rem", borderBottom: "1px solid #d1d5db" }}>
                      incidents={b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.intensity_categories.map((cat, i) => (
                  <tr key={cat}>
                    <td style={{ padding: "0.4rem", borderBottom: "1px solid #e5e7eb" }}>{cat}</td>
                    {heatmap.matrix[i].map((value, j) => (
                      <td
                        key={`${cat}-${j}`}
                        style={{
                          padding: "0.4rem",
                          textAlign: "center",
                          borderBottom: "1px solid #e5e7eb",
                          background: heatColor(value, maxHeat),
                        }}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
