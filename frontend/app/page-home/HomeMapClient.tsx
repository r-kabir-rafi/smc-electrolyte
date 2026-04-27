"use client";

import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

import { AlertTriangleIcon, DownloadIcon, ExpandIcon, InfoIcon, MapIcon, ThermometerIcon } from "../../components/icons";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { Button } from "../../components/ui/Button";
import { Card, CardActions, CardBody, CardCaption, CardFooter, CardHeader, CardHeaderMeta, CardTitle } from "../../components/ui/Card";
import { DisclaimerBanner } from "../../components/ui/DisclaimerBanner";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatCard } from "../../components/ui/StatCard";
import { TierBadge } from "../../components/ui/TierBadge";
import { Tooltip } from "../../components/ui/Tooltip";
import { chartTheme, fanChartColors } from "../../lib/chartTheme";
import { loadIncidentsCsv, type IncidentRecord } from "../../lib/data";
import {
  canonicalDistrictName,
  computeDistrictBounds,
  computeDistrictCentroids,
  districtName,
  districtSlug,
  type DistrictFeatureCollection,
} from "../../lib/geo";
import { buildOutlookSeries } from "../../lib/history-data";
import { estimateTierProbability, formatPercent, formatTemperature, getTierColor, getTierFromTemperature, trendDirection } from "../../lib/heat-ui";
import {
  fetchCurrentTemperatures,
  findNearestPointId,
  TEMPERATURE_POINTS,
  type TemperatureMap,
} from "./temperature";
import styles from "./home.module.css";

type DistrictStats = {
  incidentCount: number;
  totalCasualties: number;
  latestReportingDate: string;
};

type TemperatureCache = {
  values: TemperatureMap;
  fetchedAt: number;
};

const TEMPERATURE_CACHE_MS = 10 * 60 * 1000;

function formatFetchedTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function FitToDistrictBounds({ bounds }: { bounds?: L.LatLngBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds.pad(0.05));
  }, [map, bounds]);

  return null;
}

function buildDistrictStats(rows: IncidentRecord[]): Map<string, DistrictStats> {
  const stats = new Map<string, DistrictStats>();

  for (const row of rows) {
    const key = canonicalDistrictName(row.district || "");
    if (!key) continue;
    const existing = stats.get(key) || {
      incidentCount: 0,
      totalCasualties: 0,
      latestReportingDate: "",
    };
    existing.incidentCount += 1;
    existing.totalCasualties += row.casualties || 0;
    if (row.reporting_date && row.reporting_date > existing.latestReportingDate) {
      existing.latestReportingDate = row.reporting_date;
    }
    stats.set(key, existing);
  }

  return stats;
}

export default function HomeMapClient() {
  const [districts, setDistricts] = useState<DistrictFeatureCollection | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [error, setError] = useState("");
  const [showConfidence, setShowConfidence] = useState(true);

  const [temperatureCache, setTemperatureCache] = useState<TemperatureCache | null>(null);
  const [temperatureLoading, setTemperatureLoading] = useState(false);
  const [temperatureError, setTemperatureError] = useState("");
  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [districtResponse, incidentRows] = await Promise.all([
          fetch("/data/bd_districts.geojson", { cache: "force-cache" }),
          loadIncidentsCsv(),
        ]);
        if (!districtResponse.ok) {
          throw new Error(`Failed to load district boundaries (${districtResponse.status})`);
        }

        const data = (await districtResponse.json()) as DistrictFeatureCollection;
        setDistricts(data);
        setIncidents(incidentRows);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load map data.");
      }
    };

    load().catch(() => {
      setError("Failed to load map data.");
    });
  }, []);

  useEffect(() => {
    const isFresh =
      temperatureCache !== null && Date.now() - temperatureCache.fetchedAt < TEMPERATURE_CACHE_MS;
    if (isFresh) return;

    let cancelled = false;
    const loadTemperatures = async () => {
      try {
        setTemperatureLoading(true);
        const values = await fetchCurrentTemperatures(TEMPERATURE_POINTS);
        if (cancelled) return;
        setTemperatureCache({ values, fetchedAt: Date.now() });
        setTemperatureError("");
      } catch (loadError) {
        if (cancelled) return;
        setTemperatureError(loadError instanceof Error ? loadError.message : "Failed to load current temperature.");
      } finally {
        if (!cancelled) {
          setTemperatureLoading(false);
        }
      }
    };

    loadTemperatures().catch(() => {
      if (!cancelled) {
        setTemperatureError("Failed to load current temperature.");
        setTemperatureLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [temperatureCache]);

  const mapBounds = useMemo(() => (districts ? computeDistrictBounds(districts) : undefined), [districts]);
  const districtCentroids = useMemo(() => (districts ? computeDistrictCentroids(districts) : new Map()), [districts]);
  const districtStats = useMemo(() => buildDistrictStats(incidents), [incidents]);

  const districtTemperatureByKey = useMemo(() => {
    const out = new Map<string, number>();
    if (!temperatureCache) return out;
    const availablePoints = TEMPERATURE_POINTS.filter((point) => Number.isFinite(temperatureCache.values[point.id]));
    for (const [districtKey, center] of districtCentroids.entries()) {
      const nearestPointId = findNearestPointId(center.lat, center.lng, availablePoints);
      if (!nearestPointId) continue;
      const temp = temperatureCache.values[nearestPointId];
      if (Number.isFinite(temp)) {
        out.set(districtKey, temp);
      }
    }
    return out;
  }, [districtCentroids, temperatureCache]);

  const districtRows = useMemo(() => {
    if (!districts) return [];
    const averageTemperature =
      Array.from(districtTemperatureByKey.values()).reduce((sum, value) => sum + value, 0) /
        Math.max(districtTemperatureByKey.size, 1) || 0;

    return districts.features.map((feature) => {
      const label = districtName(feature.properties);
      const slug = districtSlug(label);
      const temp = districtTemperatureByKey.get(slug);
      const tier = getTierFromTemperature(temp);
      const probability = estimateTierProbability(temp);
      const anomaly = Number.isFinite(temp) ? temp! - averageTemperature : 0;
      const stats = districtStats.get(slug) || {
        incidentCount: 0,
        totalCasualties: 0,
        latestReportingDate: "-",
      };
      return {
        label,
        slug,
        temp,
        tier,
        probability,
        anomaly,
        stats,
        confidence: stats.incidentCount > 0 ? "high" : probability > 0.65 ? "medium" : "low",
      };
    }).sort((a, b) => (b.temp ?? 0) - (a.temp ?? 0));
  }, [districts, districtStats, districtTemperatureByKey]);

  const selectedDistrictRow = useMemo(() => {
    if (!districtRows.length) return null;
    if (selectedDistrict) {
      return districtRows.find((row) => row.slug === districtSlug(selectedDistrict)) || districtRows[0];
    }
    return districtRows[0];
  }, [districtRows, selectedDistrict]);

  useEffect(() => {
    if (!selectedDistrict && districtRows[0]) {
      setSelectedDistrict(districtRows[0].label);
    }
  }, [districtRows, selectedDistrict]);

  const tierThreeCount = districtRows.filter((row) => row.tier >= 3).length;
  const triggerCount = districtRows.filter((row) => row.probability >= 0.7).length;
  const incidentDistrictCount = districtRows.filter((row) => row.stats.incidentCount > 0).length;
  const exposureShare = districtRows.length ? `${Math.round((tierThreeCount / districtRows.length) * 100)}%` : "0%";

  const outlookData = useMemo(
    () => buildOutlookSeries(selectedDistrictRow?.temp ?? 33.5, new Date(), 15),
    [selectedDistrictRow?.temp]
  );

  const incidentWatchlist = useMemo(() => {
    return districtRows
      .filter((row) => row.stats.incidentCount > 0)
      .sort((a, b) => {
        return (
          b.stats.incidentCount - a.stats.incidentCount ||
          b.stats.totalCasualties - a.stats.totalCasualties ||
          (b.temp ?? 0) - (a.temp ?? 0)
        );
      })
      .slice(0, 5);
  }, [districtRows]);

  const actionQueue = useMemo(() => {
    return districtRows.slice(0, 4).map((row, index) => ({
      id: row.slug,
      label: row.label,
      action: row.tier >= 4 ? "Escalate retail readiness" : row.tier >= 3 ? "Prime mobile + retail media" : "Monitor only",
      owner: index % 2 === 0 ? "Field ops" : "Growth ops",
      status: row.probability >= 0.8 ? "Priority" : "Watch",
    }));
  }, [districtRows]);

  const styleForFeature = useMemo<L.StyleFunction<any>>(
    () => (feature): L.PathOptions => {
      const label = districtName((feature?.properties as Record<string, string> | undefined) ?? undefined);
      const slug = districtSlug(label);
      const row = districtRows.find((item) => item.slug === slug);
      const lowConfidence = row?.confidence === "low";

      return {
        color: lowConfidence && showConfidence ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)",
        weight: selectedDistrictRow?.slug === slug ? 2 : 1,
        fillColor: getTierColor(row?.temp),
        fillOpacity: selectedDistrictRow?.slug === slug ? 0.88 : 0.7,
        dashArray: lowConfidence && showConfidence ? "4 4" : undefined,
      };
    },
    [districtRows, selectedDistrictRow?.slug, showConfidence]
  );

  const onEachFeature = (feature: { properties?: Record<string, string> }, layer: L.Layer) => {
    const label = districtName(feature.properties);
    const slug = districtSlug(label);
    const row = districtRows.find((item) => item.slug === slug);
    layer.bindTooltip(
      `<strong>${label}</strong><br/>Tier ${row?.tier ?? 0} · ${formatTemperature(row?.temp)}<br/>Prob(Tier ≥ 3): ${formatPercent(row?.probability)}`,
      { sticky: true }
    );

    layer.on({
      mouseover: (event) => {
        const target = event.target as L.Path;
        target.setStyle({ weight: 2, color: "#fff", fillOpacity: 0.9 });
      },
      mouseout: (event) => geoJsonRef.current?.resetStyle(event.target),
      click: () => setSelectedDistrict(label),
    });
  };

  if (!districts && !error) {
    return (
      <main className="page-shell">
        <div className="dashboard-grid">
          <div className="grid-span-12">
            <div className={styles.statGrid}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="skeleton" style={{ height: "7.2rem", borderRadius: "var(--radius-lg)" }} />
              ))}
            </div>
          </div>
          <div className="grid-span-7 skeleton" style={{ height: "34rem" }} />
          <div className="grid-span-5 skeleton" style={{ height: "34rem" }} />
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">District heat intelligence built for campaign operations</h1>
          <p className="page-subtitle">
            Premium overview of district-level heat pressure, incident signals, and trigger-ready activation cues.
          </p>
        </div>
        <div className="page-actions">
          <Button type="button" variant="secondary" onClick={() => setShowConfidence((value) => !value)}>
            {showConfidence ? "Hide confidence overlay" : "Show confidence overlay"}
          </Button>
          <Link href="/triggers">
            <Button type="button" variant="primary">
              Open trigger builder
            </Button>
          </Link>
        </div>
      </div>

      {districtRows.length > 0 && tierThreeCount > 0 ? (
        <AlertBanner
          variant={districtRows.some((row) => row.tier >= 4) ? "critical" : "warning"}
          leading={
            <span className="surface-inline">
              <span className={temperatureLoading ? "animate-pulse-glow" : ""}>●</span>
              <span>{temperatureLoading ? "Refreshing now" : `Live snapshot · ${temperatureCache ? formatFetchedTime(temperatureCache.fetchedAt) : "pending"}`}</span>
            </span>
          }
          title={`Tier ${districtRows.some((row) => row.tier >= 4) ? "4" : "3"} alert active in ${tierThreeCount} districts`}
          description={`${districtRows.slice(0, 3).map((row) => row.label).join(", ")} exceeds the current heat surveillance threshold.`}
          action={
            selectedDistrictRow ? (
              <Link href={`/district/${selectedDistrictRow.slug}`}>
                <Button type="button" variant="secondary">View district detail</Button>
              </Link>
            ) : null
          }
        />
      ) : null}

      <div className="dashboard-grid">
        <div className="grid-span-12">
          <div className={styles.statGrid}>
            <StatCard
              label="Districts Tier ≥ 3"
              value={`${tierThreeCount}`}
              trend={`${Math.round((tierThreeCount / Math.max(districtRows.length, 1)) * 100)}% of monitored map`}
              trendDirection={tierThreeCount > 8 ? "up" : "neutral"}
              trendSentiment="bad"
              icon={<ThermometerIcon width={20} height={20} />}
              accentColor="var(--tier-3)"
              className={`${styles.compactStat} animate-fade-up`}
            />
            <StatCard
              label="Heat Exposure Footprint"
              value={exposureShare}
              trend="district share in elevated heat"
              trendDirection="up"
              trendSentiment="bad"
              icon={<AlertTriangleIcon width={20} height={20} />}
              accentColor="var(--tier-4)"
              className={`${styles.compactStat} animate-fade-up`}
            />
            <StatCard
              label="Active Trigger Campaigns"
              value={`${triggerCount}`}
              trend={`${incidentDistrictCount} districts with verified incident signals`}
              trendDirection={triggerCount > 0 ? "up" : "neutral"}
              trendSentiment={triggerCount > 0 ? "bad" : "neutral"}
              icon={<ExpandIcon width={20} height={20} />}
              accentColor="var(--accent-primary)"
              className={`${styles.compactStat} animate-fade-up`}
            />
            <StatCard
              label="Data Freshness"
              value={temperatureCache ? "Live" : "Syncing"}
              trend={temperatureCache ? `updated ${formatFetchedTime(temperatureCache.fetchedAt)}` : "acquiring weather feed"}
              trendDirection="neutral"
              trendSentiment="neutral"
              icon={<InfoIcon width={20} height={20} />}
              accentColor="var(--tier-1)"
              className={`${styles.compactStat} animate-fade-up`}
            />
          </div>
        </div>

        <div className="grid-span-7">
          <Card variant="elevated" className={styles.mapCard}>
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>District heat choropleth</CardTitle>
                <CardCaption>Dark basemap with tier-coded district overlays, confidence styling, and click-through district drawers.</CardCaption>
              </CardHeaderMeta>
              <CardActions>
                <Tooltip content="Low-confidence districts are shown with a dashed edge treatment when the overlay is enabled.">
                  <Button aria-label="More information" iconOnly variant="ghost" type="button">
                    <InfoIcon width={14} height={14} />
                  </Button>
                </Tooltip>
                <Button aria-label="Download snapshot" iconOnly variant="ghost" type="button">
                  <DownloadIcon width={14} height={14} />
                </Button>
              </CardActions>
            </CardHeader>
            <CardBody className={styles.mapBody}>
              {districts ? (
                <>
                  <div className={styles.mapFrame}>
                    <MapContainer
                      center={[23.7, 90.4]}
                      zoom={7}
                      bounds={mapBounds}
                      attributionControl={false}
                      scrollWheelZoom={false}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <FitToDistrictBounds bounds={mapBounds} />
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      />
                      <GeoJSON
                        key={`${selectedDistrictRow?.slug ?? "none"}-${showConfidence ? "confidence" : "plain"}`}
                        data={districts as never}
                        style={styleForFeature}
                        onEachFeature={onEachFeature}
                        ref={(value) => {
                          geoJsonRef.current = (value as L.GeoJSON | null) ?? null;
                        }}
                      />
                    </MapContainer>
                    <div className={styles.mapLegend}>
                      {[0, 1, 2, 3, 4].map((tier) => (
                        <div key={tier} className={styles.legendRow}>
                          <span className={styles.legendSwatch} style={{ background: `var(--tier-${tier})` }} />
                          <span>Tier {tier}</span>
                        </div>
                      ))}
                    </div>
                    {selectedDistrictRow ? (
                      <div className={styles.detailDrawer}>
                        <div className={styles.drawerHeader}>
                          <div>
                            <h3>{selectedDistrictRow.label}</h3>
                            <p>{selectedDistrictRow.confidence} confidence surveillance</p>
                          </div>
                          <TierBadge tier={selectedDistrictRow.tier} />
                        </div>
                        <div className={styles.drawerStats}>
                          <div>
                            <span>HI snapshot</span>
                            <strong>{formatTemperature(selectedDistrictRow.temp)}</strong>
                          </div>
                          <div>
                            <span>Prob(Tier ≥ 3)</span>
                            <strong>{formatPercent(selectedDistrictRow.probability)}</strong>
                          </div>
                          <div>
                            <span>Latest incident</span>
                            <strong>{selectedDistrictRow.stats.latestReportingDate || "-"}</strong>
                          </div>
                        </div>
                        <div className={styles.drawerActions}>
                          <Link href={`/district/${selectedDistrictRow.slug}`}>
                            <Button type="button" variant="primary">View detail</Button>
                          </Link>
                          <Link href={`/incidents?district=${encodeURIComponent(selectedDistrictRow.label)}`}>
                            <Button type="button" variant="secondary">Incident list</Button>
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<MapIcon width={28} height={28} />}
                  title="No district map loaded"
                  description="Weather features are computed nightly. Check back after the next ETL run."
                />
              )}
            </CardBody>
            <CardFooter>
              <span>Source: Open-Meteo current conditions + district boundary lookup</span>
              <span>{temperatureError || "Confidence overlay available"}</span>
            </CardFooter>
          </Card>
        </div>

        <div className="grid-span-5">
          <Card variant="default" className={styles.tableCard}>
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Top districts</CardTitle>
                <CardCaption>Sorted by current heat intensity, with trigger probability and anomaly proxy.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              {districtRows.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>District</th>
                        <th>Tier</th>
                        <th>HI p50</th>
                        <th>Prob(T3)</th>
                        <th>Anomaly</th>
                        <th>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {districtRows.slice(0, 8).map((row) => (
                        <tr key={row.slug}>
                          <td>
                            <Link href={`/district/${row.slug}`} className={styles.tableDistrictLink}>
                              {row.label}
                            </Link>
                          </td>
                          <td><TierBadge tier={row.tier} size="sm" showLabel={false} /></td>
                          <td className="mono">{formatTemperature(row.temp)}</td>
                          <td className="mono">{formatPercent(row.probability)}</td>
                          <td className="mono">{row.anomaly >= 0 ? "+" : ""}{row.anomaly.toFixed(1)}°</td>
                          <td>
                            <span className={styles.trendPill} data-direction={trendDirection(row.anomaly)}>
                              {trendDirection(row.anomaly)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<ThermometerIcon width={28} height={28} />}
                  title="No districts available"
                  description="District rows appear here once the geometry and temperature feeds resolve."
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-4">
          <Card variant="default">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>15-day forecast summary</CardTitle>
                <CardCaption>15-day scenario band for the selected district using the current heat trajectory as the baseline.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={outlookData}>
                    <CartesianGrid stroke={chartTheme.grid.line.stroke} strokeDasharray="4 4" />
                    <XAxis dataKey="date" tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "var(--text-tertiary)", fontSize: 11 }} />
                    <RechartsTooltip
                      contentStyle={chartTheme.tooltip.container}
                      labelStyle={{ color: "var(--text-tertiary)" }}
                    />
                    <Area type="monotone" dataKey="p10" stackId="1" stroke="transparent" fill="transparent" />
                    <Area type="monotone" dataKey="p90" stackId="2" stroke="transparent" fill={fanChartColors.outerBand} />
                    <Area type="monotone" dataKey="p25" stackId="3" stroke="transparent" fill="transparent" />
                    <Area type="monotone" dataKey="p75" stackId="4" stroke="transparent" fill={fanChartColors.innerBand} />
                    <Area type="monotone" dataKey="p50" stroke={fanChartColors.line} fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
            <CardFooter>
              <span>{selectedDistrictRow?.label || "District"} scenario</span>
              <span>Median HI peaks at {formatTemperature(Math.max(...outlookData.map((row) => row.p50)))}</span>
            </CardFooter>
          </Card>
        </div>

        <div className="grid-span-4">
          <Card variant="default">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Incident watchlist</CardTitle>
                <CardCaption>Districts with verified incident signals, ranked for analyst review alongside current heat pressure.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              {incidentWatchlist.length ? (
                <div className={styles.signalList}>
                  {incidentWatchlist.map((row) => (
                    <div key={row.slug} className={styles.signalRow}>
                      <div>
                        <strong>{row.label}</strong>
                        <div className={styles.signalMeta}>
                          <span>{row.stats.incidentCount} verified reports</span>
                          <span>latest {row.stats.latestReportingDate || "-"}</span>
                        </div>
                      </div>
                      <div style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center" }}>
                        <TierBadge tier={row.tier} size="sm" />
                        <span className="mono">{formatTemperature(row.temp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<AlertTriangleIcon width={24} height={24} />}
                  title="No verified district signals"
                  description="District-linked incident watchlist entries appear here once verified reports are available."
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-4">
          <Card variant="accent">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Recommended action queue</CardTitle>
                <CardCaption>Trigger suggestions prioritised for campaign operators.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              <div className={styles.actionQueue}>
                {actionQueue.map((item) => (
                  <div key={item.id} className={styles.actionItem}>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.action}</p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                      <span className={styles.actionStatus}>{item.status}</span>
                      <span className={styles.actionOwner}>{item.owner}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <DisclaimerBanner>
        This is an informational tool only. It does not provide medical advice. Heatstroke is a medical emergency. Refer to official public-health guidance for response protocols.
      </DisclaimerBanner>

      {error ? (
        <AlertBanner
          variant="critical"
          title="Data load issue"
          description={error}
        />
      ) : null}
      {temperatureError ? (
        <AlertBanner
          variant="warning"
          title="Temperature feed delayed"
          description={temperatureError}
        />
      ) : null}
    </main>
  );
}
