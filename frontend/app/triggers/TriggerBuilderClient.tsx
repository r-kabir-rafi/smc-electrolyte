"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

import { AlertTriangleIcon, DownloadIcon, MapIcon, ZapIcon } from "../../components/icons";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { Button } from "../../components/ui/Button";
import { Card, CardActions, CardBody, CardCaption, CardHeader, CardHeaderMeta, CardTitle } from "../../components/ui/Card";
import { DisclaimerBanner } from "../../components/ui/DisclaimerBanner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field, Input, Select } from "../../components/ui/Field";
import { TierBadge } from "../../components/ui/TierBadge";
import { Tooltip } from "../../components/ui/Tooltip";
import { computeDistrictBounds, districtName, districtSlug, type DistrictFeatureCollection } from "../../lib/geo";
import { buildOutlookSeries, loadDistrictGeoJson } from "../../lib/history-data";
import { estimateTierProbability, formatPercent, formatTemperature, getTierColor, getTierFromTemperature } from "../../lib/heat-ui";
import { fetchCurrentTemperatures, findNearestPointId, TEMPERATURE_POINTS, type TemperatureMap } from "../page-home/temperature";
import styles from "./triggers.module.css";

type TriggerPreviewRow = {
  label: string;
  slug: string;
  temperature: number;
  outlook: ReturnType<typeof buildOutlookSeries>;
  triggered: boolean;
  tier: number;
  probability: number;
};

function FitToBounds({ bounds }: { bounds?: L.LatLngBounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds.pad(0.05));
  }, [bounds, map]);
  return null;
}

export default function TriggerBuilderClient() {
  const [geoJson, setGeoJson] = useState<DistrictFeatureCollection | null>(null);
  const [temperatureMap, setTemperatureMap] = useState<TemperatureMap>({});
  const [selectedScenario, setSelectedScenario] = useState<"p50" | "p90">("p50");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [hiThreshold, setHiThreshold] = useState("40");
  const [minDays, setMinDays] = useState("2");
  const [probThreshold, setProbThreshold] = useState("0.7");
  const [useAnomaly, setUseAnomaly] = useState("yes");
  const [anomThreshold, setAnomThreshold] = useState("3.0");
  const [error, setError] = useState("");
  const geoRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const geometry = await loadDistrictGeoJson();
        const values = await fetchCurrentTemperatures(TEMPERATURE_POINTS);
        if (cancelled) return;
        setGeoJson(geometry);
        setTemperatureMap(values);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load trigger builder data.");
      }
    }
    load().catch(() => {
      if (!cancelled) setError("Failed to load trigger builder data.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mapBounds = useMemo(() => (geoJson ? computeDistrictBounds(geoJson) : undefined), [geoJson]);

  const districtRows = useMemo<TriggerPreviewRow[]>(() => {
    if (!geoJson) return [];
    const centroids = new Map<string, L.LatLng>();
    for (const feature of geoJson.features) {
      const label = districtName(feature.properties);
      const layer = L.geoJSON(feature as never);
      const bounds = layer.getBounds();
      if (bounds.isValid()) centroids.set(districtSlug(label), bounds.getCenter());
    }

    const availablePoints = TEMPERATURE_POINTS.filter((point) => Number.isFinite(temperatureMap[point.id]));
    const rows = geoJson.features.map((feature) => {
      const label = districtName(feature.properties);
      const slug = districtSlug(label);
      const center = centroids.get(slug);
      const nearest = center ? findNearestPointId(center.lat, center.lng, availablePoints) : null;
      const temperature = nearest ? temperatureMap[nearest] ?? 33 : 33;
      const outlook = buildOutlookSeries(temperature, new Date(), 14);
      const threshold = Number.parseFloat(hiThreshold);
      const consecutiveDays = Number.parseInt(minDays, 10);
      const probabilityCutoff = Number.parseFloat(probThreshold);

      let triggered = false;
      for (let index = 0; index <= outlook.length - consecutiveDays; index += 1) {
        const window = outlook.slice(index, index + consecutiveDays);
        const scenarioKey = selectedScenario;
        const meetsHeat = window.every((item) => item[scenarioKey] >= threshold);
        const meetsProbability = estimateTierProbability(temperature) >= probabilityCutoff;
        const meetsAnomaly =
          useAnomaly === "yes" ? window.some((item) => item.anomaly >= Number.parseFloat(anomThreshold)) : true;
        if (meetsHeat && meetsProbability && meetsAnomaly) {
          triggered = true;
          break;
        }
      }

      return {
        label,
        slug,
        temperature,
        outlook,
        triggered,
        tier: getTierFromTemperature(temperature),
        probability: estimateTierProbability(temperature),
      };
    });
    return rows.sort((a, b) => Number(b.triggered) - Number(a.triggered) || (b.temperature - a.temperature));
  }, [anomThreshold, geoJson, hiThreshold, minDays, probThreshold, selectedScenario, temperatureMap, useAnomaly]);

  useEffect(() => {
    if (!selectedDistrict && districtRows[0]) {
      setSelectedDistrict(districtRows[0].slug);
    }
  }, [districtRows, selectedDistrict]);

  const selectedRow = districtRows.find((row) => row.slug === selectedDistrict) || districtRows[0] || null;
  const affectedCount = districtRows.filter((row) => row.triggered).length;
  const ruleSummary = `Trigger when HI ${selectedScenario.toUpperCase()} ≥ ${hiThreshold}°C for ${minDays}+ days with probability ≥ ${formatPercent(Number.parseFloat(probThreshold))}${useAnomaly === "yes" ? ` and anomaly ≥ ${anomThreshold}°C` : ""}.`;

  const recommendation = selectedRow?.triggered
    ? {
        audience: selectedRow.tier >= 4 ? "outdoor workers, commuters" : "high-exposure shoppers",
        confidence: selectedRow.probability >= 0.8 ? "High" : "Moderate",
        channels: selectedRow.tier >= 4 ? "Mobile, retail proximity, OOH" : "Mobile, retail media",
      }
    : null;

  return (
    <main className="page-shell">
      {error ? <AlertBanner variant="critical" title="Trigger builder unavailable" description={error} /> : null}

      <div className="page-header">
        <div>
          <div className="page-kicker">Rule Studio</div>
          <h1 className="page-title">Trigger builder</h1>
          <p className="page-subtitle">Compose rule conditions visually, inspect district coverage, and preview informational campaign recommendations.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="grid-span-4">
          <Card variant="elevated">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Rule editor</CardTitle>
                <CardCaption>Each line expresses a condition row instead of raw JSON.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              <div className={styles.formGrid}>
                <Field label="Metric">
                  <Select defaultValue="heat-index">
                    <option value="heat-index">Heat Index</option>
                    <option value="tmax">Temperature max</option>
                    <option value="warm-nights">Warm nights</option>
                  </Select>
                </Field>
                <Field label="Comparator">
                  <Select defaultValue="gte">
                    <option value="gte">≥ threshold</option>
                    <option value="gt">&gt; threshold</option>
                  </Select>
                </Field>
                <Field label="HI threshold">
                  <Input value={hiThreshold} onChange={(event) => setHiThreshold(event.target.value)} />
                </Field>
                <Field label="Min consecutive days">
                  <Input value={minDays} onChange={(event) => setMinDays(event.target.value)} />
                </Field>
                <Field label="Probability cutoff">
                  <Input value={probThreshold} onChange={(event) => setProbThreshold(event.target.value)} />
                </Field>
                <Field label="Use anomaly">
                  <Select value={useAnomaly} onChange={(event) => setUseAnomaly(event.target.value)}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                </Field>
                <Field label="Anomaly threshold">
                  <Input value={anomThreshold} onChange={(event) => setAnomThreshold(event.target.value)} />
                </Field>
                <Field label="Scenario">
                  <Select value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value as "p50" | "p90")}>
                    <option value="p50">p50</option>
                    <option value="p90">p90</option>
                  </Select>
                </Field>
              </div>

              <AlertBanner
                variant="info"
                title="Readable rule summary"
                description={ruleSummary}
              />

              <div className={styles.editorFooter}>
                <TierBadge tier={selectedRow?.tier ?? 0} />
                <Button type="button" variant="primary">Save new version</Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-4">
          <Card variant="default">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Live preview</CardTitle>
                <CardCaption>{affectedCount} of {districtRows.length} districts would activate under the current rule.</CardCaption>
              </CardHeaderMeta>
              <CardActions>
                <Tooltip content="Districts inherit their trigger preview from the current scenario and baseline temperature feed.">
                  <Button aria-label="Preview information" type="button" variant="ghost" iconOnly>
                    <AlertTriangleIcon width={14} height={14} />
                  </Button>
                </Tooltip>
              </CardActions>
            </CardHeader>
            <CardBody>
              {geoJson ? (
                <div className={styles.mapPreview}>
                  <MapContainer
                    center={[23.7, 90.4]}
                    zoom={7}
                    bounds={mapBounds}
                    scrollWheelZoom={false}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <FitToBounds bounds={mapBounds} />
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                    <GeoJSON
                      data={geoJson as never}
                      ref={(value) => {
                        geoRef.current = (value as L.GeoJSON | null) ?? null;
                      }}
                      style={(feature) => {
                        const row = districtRows.find((item) => item.slug === districtSlug(districtName((feature?.properties as Record<string, string> | undefined) ?? undefined)));
                        const isSelected = row?.slug === selectedDistrict;
                        return {
                          color: isSelected ? "#fff" : "rgba(255,255,255,0.12)",
                          weight: isSelected ? 2 : 1,
                          fillColor: row?.triggered ? getTierColor(row.temperature) : "rgba(255,255,255,0.04)",
                          fillOpacity: row?.triggered ? 0.8 : 0.2,
                        };
                      }}
                      onEachFeature={(feature, layer) => {
                        const label = districtName(feature.properties as Record<string, string> | undefined);
                        const row = districtRows.find((item) => item.slug === districtSlug(label));
                        layer.on("click", () => setSelectedDistrict(districtSlug(label)));
                        layer.bindTooltip(`${label}<br/>${row?.triggered ? "Trigger candidate" : "No trigger"} · ${formatTemperature(row?.temperature)}`);
                      }}
                    />
                  </MapContainer>
                </div>
              ) : (
                <EmptyState
                  icon={<MapIcon width={28} height={28} />}
                  title="No preview map yet"
                  description="Preview coverage appears once district geometry and temperature feeds resolve."
                />
              )}

              <div className={styles.affectedList}>
                {districtRows.slice(0, 6).map((row) => (
                  <button key={row.slug} type="button" className={styles.affectedRow} onClick={() => setSelectedDistrict(row.slug)}>
                    <span>{row.label}</span>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
                      {row.triggered ? <TierBadge tier={row.tier} size="sm" /> : <span className={styles.quietLabel}>Standby</span>}
                      <span className="mono">{formatPercent(row.probability)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-4">
          <Card variant="accent">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Recommendations preview</CardTitle>
                <CardCaption>Auto-generated informational campaign brief from the current rule and selected district.</CardCaption>
              </CardHeaderMeta>
              <CardActions>
                <Button type="button" variant="ghost" iconOnly aria-label="Export recommendation brief">
                  <DownloadIcon width={14} height={14} />
                </Button>
              </CardActions>
            </CardHeader>
            <CardBody>
              {selectedRow ? (
                <div className={styles.recommendationStack}>
                  <div className={styles.recommendationHero}>
                    <div>
                      <strong>{selectedRow.label}</strong>
                      <p>{selectedRow.triggered ? "TRIGGER" : "NO_TRIGGER"}</p>
                    </div>
                    <TierBadge tier={selectedRow.tier} />
                  </div>

                  <AlertBanner
                    variant={selectedRow.triggered ? "warning" : "success"}
                    title={selectedRow.triggered ? "Campaign brief ready" : "No trigger recommended"}
                    description={
                      selectedRow.triggered
                        ? `Audience: ${recommendation?.audience}. Channels: ${recommendation?.channels}.`
                        : "Current rule set does not open a qualifying window in the active scenario."
                    }
                  />

                  <div className={styles.recommendationMeta}>
                    <span className="surface-inline">Confidence {recommendation?.confidence || "Low"}</span>
                    <span className="surface-inline">hi p50 {formatTemperature(Math.max(...selectedRow.outlook.map((item) => item.p50)))}</span>
                    <span className="surface-inline">Prob(Tier ≥ 3) {formatPercent(selectedRow.probability)}</span>
                  </div>

                  <div className={styles.recommendationList}>
                    <div>
                      <span className={styles.recommendationLabel}>Audience</span>
                      <strong>{recommendation?.audience || "Commuters"}</strong>
                    </div>
                    <div>
                      <span className={styles.recommendationLabel}>Message themes</span>
                      <strong>Hydrate before exposure · Replace electrolytes after sweating</strong>
                    </div>
                    <div>
                      <span className={styles.recommendationLabel}>Measurement</span>
                      <strong>Geo holdout 10% · Pre-register rule version</strong>
                    </div>
                  </div>

                  <Button type="button" variant="primary">Export PDF brief</Button>
                </div>
              ) : (
                <EmptyState
                  icon={<ZapIcon width={28} height={28} />}
                  title="No recommendation preview"
                  description="Select a district or wait for live preview data to load."
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <DisclaimerBanner>
        This is an informational tool only. It does not provide medical advice. Trigger previews are intended for operational planning and campaign coordination.
      </DisclaimerBanner>
    </main>
  );
}
