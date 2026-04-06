"use client";

import { useMemo, useState } from "react";

import type { DistrictWithHeat } from "../lib/populationMapData";
import { calculateDistrictDemand } from "../lib/demandCalculation";
import { Card, CardBody, CardHeader, CardHeaderMeta, CardTitle, CardCaption } from "./ui/Card";
import { Input } from "./ui/Field";
import { TierBadge } from "./ui/TierBadge";

type ResultRow = DistrictWithHeat & ReturnType<typeof calculateDistrictDemand>;

export function DemandCalculatorPanel({
  districts,
  selectedPcode,
  onSelectDistrict,
}: {
  districts: DistrictWithHeat[];
  selectedPcode?: string;
  onSelectDistrict?: (pcode: string) => void;
}) {
  const [baseRate, setBaseRate] = useState(0.05);
  const [packSize, setPackSize] = useState(24);

  const results = useMemo<ResultRow[]>(() => {
    return districts
      .map((district) => ({
        ...district,
        ...calculateDistrictDemand({
          population: district.population,
          density_normalized: district.density_normalized,
          heat_tier: district.heat_tier,
          heat_index_p50: district.heat_index_p50,
          anom_hi: district.anom_hi,
          per_capita_base_rate: baseRate,
          sku_pack_size: packSize,
        }),
      }))
      .sort((left, right) => right.adjusted_demand_units - left.adjusted_demand_units);
  }, [baseRate, districts, packSize]);

  const selectedDistrict = results.find((district) => district.pcode === selectedPcode) ?? results[0] ?? null;
  const totalUnits = results.reduce((sum, district) => sum + district.adjusted_demand_units, 0);
  const totalCases = results.reduce((sum, district) => sum + district.demand_cases, 0);
  const surgeDistricts = results.filter(
    (district) => district.demand_tier === "surge" || district.demand_tier === "critical"
  ).length;

  return (
    <div className="stack">
      <Card variant="default">
        <CardHeader>
          <CardHeaderMeta>
            <CardTitle>Demand Calculator</CardTitle>
            <CardCaption>Estimated heat-driven product demand by district using density and heat uplift assumptions.</CardCaption>
          </CardHeaderMeta>
        </CardHeader>
        <CardBody>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", alignItems: "start" }}>
            <CalculatorField label="Base rate (units/person/day)">
              <Input
                type="number"
                min="0.01"
                max="0.5"
                step="0.005"
                value={String(baseRate)}
                onChange={(event) => setBaseRate(Number.parseFloat(event.target.value) || 0.05)}
              />
            </CalculatorField>
            <CalculatorField label="Pack size (units/case)">
              <Input
                type="number"
                min="1"
                step="1"
                value={String(packSize)}
                onChange={(event) => setPackSize(Number.parseInt(event.target.value, 10) || 24)}
              />
            </CalculatorField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem" }}>
            <SummaryStat label="Total Units" value={totalUnits.toLocaleString()} />
            <SummaryStat label="Total Cases" value={totalCases.toLocaleString()} />
            <SummaryStat label="Surge Districts" value={String(surgeDistricts)} accent />
          </div>
        </CardBody>
      </Card>

      {selectedDistrict ? (
        <Card variant="accent">
          <CardHeader>
            <CardHeaderMeta>
              <CardTitle>{selectedDistrict.district}</CardTitle>
              <CardCaption>{selectedDistrict.division} Division · selected district scenario</CardCaption>
            </CardHeaderMeta>
            <TierBadge tier={selectedDistrict.heat_tier} size="sm" />
          </CardHeader>
          <CardBody>
            <SelectedDistrictRows district={selectedDistrict} />
          </CardBody>
        </Card>
      ) : null}

      <Card variant="default">
        <CardHeader>
          <CardHeaderMeta>
            <CardTitle>District Demand Breakdown</CardTitle>
            <CardCaption>Higher density and higher heat tiers lift the estimated demand ranking.</CardCaption>
          </CardHeaderMeta>
        </CardHeader>
        <CardBody>
          <div className="table-scroll" style={{ maxHeight: "26rem" }}>
            {results.map((district) => (
              <button
                key={district.pcode}
                type="button"
                onClick={() => onSelectDistrict?.(district.pcode)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.85rem",
                  padding: "0.8rem 0.2rem",
                  border: "none",
                  borderBottom: "1px solid var(--border-subtle)",
                  background: district.pcode === selectedDistrict?.pcode ? "rgba(214, 160, 75, 0.08)" : "transparent",
                  color: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ color: "var(--text-primary)", fontSize: "0.84rem", fontWeight: 500 }}>
                    {district.district}
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: "0.72rem" }}>
                    ×{district.heat_multiplier} heat · ×{district.density_weight} density · ×
                    {district.anomaly_factor} anomaly
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ color: "var(--text-primary)", fontSize: "0.82rem" }}>
                    {district.adjusted_demand_units.toLocaleString()}
                  </div>
                  <DemandTierBadge tier={district.demand_tier} />
                </div>
              </button>
            ))}
          </div>

          <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
            Demand estimates are informational projections based on density, heat, and configurable planning assumptions.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CalculatorField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.45rem",
      }}
    >
      <span
        style={{
          color: "var(--text-tertiary)",
          fontSize: "0.72rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          lineHeight: 1.35,
          minHeight: "1.95rem",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "0.8rem 0.9rem",
        borderRadius: "var(--radius-md)",
        border: accent ? "1px solid rgba(214, 160, 75, 0.32)" : "1px solid var(--border-subtle)",
        background: "rgba(243, 239, 232, 0.03)",
      }}
    >
      <div style={{ color: "var(--text-tertiary)", fontSize: "0.64rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="mono" style={{ marginTop: "0.3rem", color: accent ? "var(--accent-primary)" : "var(--text-primary)", fontSize: "1rem", fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

function SelectedDistrictRows({ district }: { district: ResultRow }) {
  return (
    <div className="stack-sm">
      {[
        ["Population", district.population.toLocaleString()],
        ["Density", `${district.density.toLocaleString()} /km²`],
        ["HI p50", `${district.heat_index_p50.toFixed(1)} °C`],
        ["HI anomaly", `${district.anom_hi >= 0 ? "+" : ""}${district.anom_hi.toFixed(1)} °C`],
        ["Daily demand", district.adjusted_demand_units.toLocaleString()],
        ["Demand cases", district.demand_cases.toLocaleString()],
      ].map(([label, value]) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            paddingBottom: "0.55rem",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.74rem" }}>{label}</span>
          <span className="mono" style={{ color: "var(--text-primary)", fontSize: "0.78rem" }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DemandTierBadge({
  tier,
}: {
  tier: "standard" | "elevated" | "surge" | "critical";
}) {
  const config = {
    standard: { color: "#8f8a81", background: "rgba(143, 138, 129, 0.12)" },
    elevated: { color: "#d4b052", background: "rgba(212, 176, 82, 0.12)" },
    surge: { color: "#d68a46", background: "rgba(214, 138, 70, 0.12)" },
    critical: { color: "#d66c69", background: "rgba(214, 108, 105, 0.12)" },
  }[tier];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.14rem 0.45rem",
        marginTop: "0.2rem",
        borderRadius: "999px",
        background: config.background,
        color: config.color,
        fontSize: "0.62rem",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontWeight: 600,
      }}
    >
      {tier}
    </span>
  );
}
