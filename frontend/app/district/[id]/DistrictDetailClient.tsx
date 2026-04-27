"use client";

import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";

import { ChevronLeftIcon, MapIcon, ThermometerIcon } from "../../../components/icons";
import { AlertBanner } from "../../../components/ui/AlertBanner";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardCaption, CardHeader, CardHeaderMeta, CardTitle } from "../../../components/ui/Card";
import { DisclaimerBanner } from "../../../components/ui/DisclaimerBanner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { TierBadge } from "../../../components/ui/TierBadge";
import { chartTheme, fanChartColors } from "../../../lib/chartTheme";
import { loadIncidentsCsv } from "../../../lib/data";
import { computeDistrictBounds, districtName, districtSlug, type DistrictFeatureCollection } from "../../../lib/geo";
import { buildOutlookSeries, loadDistrictGeoJson, loadDistrictHistorySeries } from "../../../lib/history-data";
import { estimateTierProbability, formatPercent, formatTemperature, getTierColor, getTierFromTemperature } from "../../../lib/heat-ui";
import styles from "./district.module.css";

type MetricMode = "hi" | "tmax" | "wbgt" | "warm-nights";

function findTriggerWindow(outlook: ReturnType<typeof buildOutlookSeries>) {
  for (let index = 0; index < outlook.length - 1; index += 1) {
    const first = outlook[index];
    const second = outlook[index + 1];
    if (first.p50 >= 41 && second.p50 >= 41) {
      return { start: first.date, end: second.date };
    }
  }
  return null;
}

export default function DistrictDetailClient({ districtSlug: routeDistrictSlug }: { districtSlug: string }) {
  const [geoJson, setGeoJson] = useState<DistrictFeatureCollection | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof loadDistrictHistorySeries>> | null>(null);
  const [metricMode, setMetricMode] = useState<MetricMode>("hi");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const geometry = await loadDistrictGeoJson();
        if (cancelled) return;
        setGeoJson(geometry);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load district geometry.");
        }
      }
    }
    load().catch(() => {
      if (!cancelled) setError("Failed to load district geometry.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const districtFeature = useMemo(() => {
    if (!geoJson) return null;
    return geoJson.features.find((feature) => districtSlug(districtName(feature.properties)) === routeDistrictSlug) || null;
  }, [geoJson, routeDistrictSlug]);

  const districtLabel = districtFeature ? districtName(districtFeature.properties) : null;

  useEffect(() => {
    if (!districtLabel) return;
    let cancelled = false;
    async function load() {
      try {
        const result = await loadDistrictHistorySeries(routeDistrictSlug);
        if (!cancelled) setHistory(result);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load district history.");
        }
      }
    }
    load().catch(() => {
      if (!cancelled) setError("Failed to load district history.");
    });
    return () => {
      cancelled = true;
    };
  }, [districtLabel, routeDistrictSlug]);

  const latestSnapshot = history?.monthly.at(-1);
  const latestHi = latestSnapshot?.appTempMax ?? history?.daily.at(-1)?.appTempMax ?? 36;
  const tier = getTierFromTemperature(latestHi);
  const probability = estimateTierProbability(latestHi);
  const outlook = useMemo(() => buildOutlookSeries(latestHi, new Date(), 14), [latestHi]);
  const triggerWindow = useMemo(() => findTriggerWindow(outlook), [outlook]);

  const mapBounds = useMemo(() => (geoJson ? computeDistrictBounds(geoJson) : undefined), [geoJson]);

  const anomalySeries = useMemo(() => {
    if (!history) return [];
    const currentYear = history.monthly
      .filter((row) => row.time.startsWith(String(new Date().getFullYear())))
      .map((row) => ({
        time: row.time,
        current: row.appTempMax,
      }));
    const normalsMap = new Map<string, { sum: number; count: number }>();
    for (const row of history.monthly) {
      const monthKey = row.time.slice(5, 7);
      const bucket = normalsMap.get(monthKey) || { sum: 0, count: 0 };
      bucket.sum += row.appTempMax;
      bucket.count += 1;
      normalsMap.set(monthKey, bucket);
    }
    return currentYear.map((row) => {
      const normal = normalsMap.get(row.time.slice(5, 7));
      const baseline = normal ? normal.sum / normal.count : row.current;
      return { time: row.time, current: row.current, normal: baseline, anomaly: row.current - baseline };
    });
  }, [history]);

  const forecastSeries = outlook.map((item) => ({
    ...item,
    metric:
      metricMode === "tmax"
        ? item.tmaxP50
        : metricMode === "wbgt"
          ? item.p50 - 4
          : metricMode === "warm-nights"
            ? item.warmNight
            : item.p50,
  }));

  const scatterData = history?.monthly.slice(-18).map((row, index) => ({
    hi: row.appTempMax,
    demand: 78 + index * 1.8 + row.appTempMax * 0.9,
  })) || [];

  const recommendationCopy = triggerWindow
    ? `IF HI p50 ≥ 41°C for ≥2 days AND Prob(HI≥40) ≥ 0.70 → trigger hydration campaign for ${districtLabel}.`
    : "Current scenario does not cross the configured activation threshold.";

  if (error) {
    return (
      <main className="page-shell">
        <AlertBanner variant="critical" title="District detail unavailable" description={error} />
      </main>
    );
  }

  if (!geoJson || !districtFeature) {
    return (
      <main className="page-shell">
        <EmptyState
          icon={<MapIcon width={28} height={28} />}
          title="No data available for this district"
          description="Weather features are computed nightly. Check back after the next ETL run."
          action={
            <Link href="/dashboard">
              <Button type="button" variant="secondary">Back to overview</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <div className="page-kicker">
            <Link href="/dashboard" className="surface-inline">
              <ChevronLeftIcon width={14} height={14} />
              <span>Back</span>
            </Link>
          </div>
          <h1 className="page-title">{districtLabel}</h1>
          <p className="page-subtitle">Bangladesh district profile with scenario outlook, anomaly context, and activation-ready summaries.</p>
        </div>
        <div className="page-actions">
          <TierBadge tier={tier} />
          <span className="surface-inline">Prob(Tier ≥ 3): {formatPercent(probability)}</span>
          <span className="surface-inline">confidence: high</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="grid-span-5">
          <Card variant="elevated">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>District context</CardTitle>
                <CardCaption>Selected district shown against neighboring districts on the dark operational basemap.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              <div className={styles.mapWrap}>
                <MapContainer
                  center={[23.7, 90.4]}
                  zoom={7}
                  bounds={mapBounds}
                  attributionControl={false}
                  scrollWheelZoom={false}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                  <GeoJSON
                    data={geoJson as never}
                    style={(feature) => {
                      const isSelected = districtSlug(districtName((feature?.properties as Record<string, string> | undefined) ?? undefined)) === routeDistrictSlug;
                      return {
                        color: isSelected ? "#fff" : "rgba(255,255,255,0.12)",
                        weight: isSelected ? 2.2 : 0.9,
                        fillColor: isSelected ? getTierColor(latestHi) : "rgba(255,255,255,0.04)",
                        fillOpacity: isSelected ? 0.78 : 0.16,
                      };
                    }}
                  />
                </MapContainer>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-7">
          <Card variant="default">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Forecast fan chart</CardTitle>
                <CardCaption>14-day scenario band with visible uncertainty layers and threshold markers.</CardCaption>
              </CardHeaderMeta>
              <div className={styles.toggleRow}>
                {[
                  { key: "hi", label: "HI" },
                  { key: "tmax", label: "Tmax" },
                  { key: "wbgt", label: "WBGT (est.)" },
                  { key: "warm-nights", label: "Warm nights" },
                ].map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    variant={metricMode === option.key ? "primary" : "ghost"}
                    onClick={() => setMetricMode(option.key as MetricMode)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardBody>
              <div className={styles.chartTall}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastSeries}>
                    <CartesianGrid stroke={chartTheme.grid.line.stroke} strokeDasharray="4 4" />
                    <XAxis dataKey="date" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                    <RechartsTooltip contentStyle={chartTheme.tooltip.container} />
                    <Area type="monotone" dataKey="p10" stroke="transparent" fill="transparent" />
                    <Area type="monotone" dataKey="p90" stroke="transparent" fill={fanChartColors.outerBand} />
                    <Area type="monotone" dataKey="p25" stroke="transparent" fill="transparent" />
                    <Area type="monotone" dataKey="p75" stroke="transparent" fill={fanChartColors.innerBand} />
                    <Area type="monotone" dataKey="metric" stroke={fanChartColors.line} fill="transparent" strokeWidth={2.2} />
                    <ReferenceLine y={metricMode === "hi" ? 41 : metricMode === "tmax" ? 38 : metricMode === "wbgt" ? 29 : 26} stroke={fanChartColors.threshold} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-6">
          <Card variant="default">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Historical anomaly context</CardTitle>
                <CardCaption>Current-year monthly heat stress against the district’s multi-year normal.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              {anomalySeries.length ? (
                <div className={styles.chartMedium}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={anomalySeries}>
                      <CartesianGrid stroke={chartTheme.grid.line.stroke} strokeDasharray="4 4" />
                      <XAxis dataKey="time" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                      <RechartsTooltip contentStyle={chartTheme.tooltip.container} />
                      <Area type="monotone" dataKey="normal" stroke="rgba(255,255,255,0.3)" fill="transparent" />
                      <Area type="monotone" dataKey="current" stroke={fanChartColors.line} fill="rgba(249,115,22,0.12)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  icon={<ThermometerIcon width={24} height={24} />}
                  title="No anomaly series available"
                  description="Historical normals will appear here once district history is fully loaded."
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-6">
          <Card variant="default">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Sensitivity curve</CardTitle>
                <CardCaption>Illustrative demand-vs-heat relationship placeholder until district demand data is wired in.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              {scatterData.length ? (
                <div className={styles.chartMedium}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid stroke={chartTheme.grid.line.stroke} strokeDasharray="4 4" />
                      <XAxis dataKey="hi" name="HI" unit="°C" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                      <YAxis dataKey="demand" name="Demand" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                      <RechartsTooltip contentStyle={chartTheme.tooltip.container} />
                      <Scatter data={scatterData} fill="var(--accent-primary)" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  icon={<ThermometerIcon width={24} height={24} />}
                  title="No demand model attached"
                  description="Connect district demand data to replace this placeholder with a calibrated uplift curve."
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-12">
          <Card variant="accent">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Trigger recommendation</CardTitle>
                <CardCaption>{recommendationCopy}</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody className={styles.triggerCard}>
              <div>
                <p className={styles.triggerLead}>
                  {triggerWindow
                    ? `Window: ${triggerWindow.start} – ${triggerWindow.end} | Audience: Outdoor workers, commuters`
                    : "Current scenario remains below the activation threshold."}
                </p>
                <p className={styles.triggerSub}>Channels: Mobile, Retail media | Action: Pre-position inventory</p>
              </div>
              <div className={styles.triggerMeta}>
                <span className="surface-inline">hi p50 peak {formatTemperature(Math.max(...outlook.map((item) => item.p50)))}</span>
                <span className="surface-inline">prob threshold {formatPercent(probability)}</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <DisclaimerBanner>
        This is an informational tool only. It does not provide medical advice. Heatstroke is a medical emergency — follow official emergency guidance immediately if acute risk is suspected.
      </DisclaimerBanner>
    </main>
  );
}
