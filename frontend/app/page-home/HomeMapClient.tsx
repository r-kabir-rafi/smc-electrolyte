"use client";

import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { loadIncidentsCsv, type IncidentRecord } from "../../lib/data";
import {
  fetchCurrentTemperatures,
  findNearestPointId,
  TEMPERATURE_POINTS,
  type TemperatureMap,
} from "./temperature";
import styles from "./home.module.css";

type DistrictFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: string;
    properties?: Record<string, string>;
    geometry: unknown;
  }>;
};

type DistrictStats = {
  incidentCount: number;
  totalCasualties: number;
  latestReportingDate: string;
};

type TemperatureCache = {
  values: TemperatureMap;
  fetchedAt: number;
};

const DISTRICT_ALIAS: Record<string, string> = {
  barisal: "barishal",
  bogra: "bogura",
  chittagong: "chattogram",
  comilla: "cumilla",
  jessore: "jashore",
};

const TEMPERATURE_CACHE_MS = 10 * 60 * 1000;

const TEMPERATURE_BUCKETS = [
  { label: "< 30 C", min: Number.NEGATIVE_INFINITY, max: 30, color: "#bfdbfe" },
  { label: "30-32 C", min: 30, max: 32, color: "#93c5fd" },
  { label: "32-34 C", min: 32, max: 34, color: "#60a5fa" },
  { label: "34-36 C", min: 34, max: 36, color: "#fb923c" },
  { label: "> 36 C", min: 36, max: Number.POSITIVE_INFINITY, color: "#ef4444" },
];

function normalizeDistrictName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalDistrictName(value: string): string {
  const normalized = normalizeDistrictName(value);
  return DISTRICT_ALIAS[normalized] || normalized;
}

function districtName(properties?: Record<string, string>): string {
  return properties?.NAME_2 || properties?.district || properties?.name || "Unknown District";
}

function formatTemperature(value?: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `${value!.toFixed(1)} C`;
}

function getTemperatureColor(value?: number): string {
  if (!Number.isFinite(value)) return "#93c5fd";
  const bucket = TEMPERATURE_BUCKETS.find((item) => value! >= item.min && value! < item.max);
  return bucket?.color || "#93c5fd";
}

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

    if (row.reporting_date && (!existing.latestReportingDate || row.reporting_date > existing.latestReportingDate)) {
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
  const [error, setError] = useState<string>("");

  const [showTemperature, setShowTemperature] = useState(true);
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
    if (!showTemperature) return;

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
      } catch (tempError) {
        if (cancelled) return;
        setTemperatureError(
          tempError instanceof Error ? tempError.message : "Failed to load current temperature."
        );
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
  }, [showTemperature, temperatureCache]);

  const mapBounds = useMemo(() => {
    if (!districts) return undefined;
    const layer = L.geoJSON(districts as any);
    const bounds = layer.getBounds();
    return bounds.isValid() ? bounds : undefined;
  }, [districts]);

  const districtStats = useMemo(() => buildDistrictStats(incidents), [incidents]);

  const districtCentroids = useMemo(() => {
    const out = new Map<string, L.LatLng>();
    if (!districts) return out;

    for (const feature of districts.features) {
      const name = districtName(feature.properties);
      if (!name) continue;
      const layer = L.geoJSON(feature as any);
      const bounds = layer.getBounds();
      if (!bounds.isValid()) continue;
      out.set(canonicalDistrictName(name), bounds.getCenter());
    }

    return out;
  }, [districts]);

  const districtTemperatureByKey = useMemo(() => {
    const out = new Map<string, number>();
    if (!showTemperature || !temperatureCache) return out;

    const availablePoints = TEMPERATURE_POINTS.filter(
      (point) => Number.isFinite(temperatureCache.values[point.id])
    );

    if (availablePoints.length === 0) return out;

    for (const [districtKey, center] of districtCentroids.entries()) {
      const nearestPointId = findNearestPointId(center.lat, center.lng, availablePoints);
      if (!nearestPointId) continue;
      const temp = temperatureCache.values[nearestPointId];
      if (Number.isFinite(temp)) {
        out.set(districtKey, temp);
      }
    }

    return out;
  }, [showTemperature, temperatureCache, districtCentroids]);

  const selectedStats = useMemo(() => {
    if (!selectedDistrict) {
      return {
        incidentCount: 0,
        totalCasualties: 0,
        latestReportingDate: "-",
      };
    }

    const key = canonicalDistrictName(selectedDistrict);
    const stats = districtStats.get(key);
    if (!stats) {
      return {
        incidentCount: 0,
        totalCasualties: 0,
        latestReportingDate: "-",
      };
    }

    return {
      incidentCount: stats.incidentCount,
      totalCasualties: stats.totalCasualties,
      latestReportingDate: stats.latestReportingDate || "-",
    };
  }, [districtStats, selectedDistrict]);

  const selectedDistrictTemperature = useMemo(() => {
    if (!selectedDistrict || !showTemperature) return undefined;
    const key = canonicalDistrictName(selectedDistrict);
    return districtTemperatureByKey.get(key);
  }, [selectedDistrict, showTemperature, districtTemperatureByKey]);

  const styleForFeature = useMemo<L.StyleFunction<any>>(() => {
    return (feature): L.PathOptions => {
      const properties = (feature?.properties as Record<string, string> | undefined) ?? undefined;
      const name = districtName(properties);
      const key = canonicalDistrictName(name);
      const temp = districtTemperatureByKey.get(key);

      return {
        color: "#1e40af",
        weight: 1,
        fillColor: showTemperature ? getTemperatureColor(temp) : "#93c5fd",
        fillOpacity: showTemperature ? 0.55 : 0.35,
      };
    };
  }, [showTemperature, districtTemperatureByKey]);

  const onEachFeature = (feature: { properties?: Record<string, string> }, layer: L.Layer) => {
    const name = districtName(feature.properties);
    const key = canonicalDistrictName(name);
    const temp = districtTemperatureByKey.get(key);

    layer.bindTooltip(
      showTemperature ? `${name}: ${formatTemperature(temp)}` : name,
      { sticky: true }
    );

    layer.on("add", () => {
      const path = (layer as L.Path).getElement?.();
      if (path) {
        path.setAttribute("tabindex", "-1");
      }
    });

    layer.on({
      mouseover: (event) => {
        const target = event.target as L.Path;
        target.setStyle({
          weight: 2,
          color: "#0f172a",
          fillOpacity: showTemperature ? 0.75 : 0.55,
        });
      },
      mouseout: (event) => {
        geoJsonRef.current?.resetStyle(event.target);
      },
      click: () => {
        setSelectedDistrict(name);
      },
    });
  };

  const lastUpdateText =
    showTemperature && temperatureCache
      ? `Last update: ${formatFetchedTime(temperatureCache.fetchedAt)}`
      : "";

  return (
    <section>
      <div className={styles.toolbar}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={showTemperature}
            onChange={(event) => setShowTemperature(event.target.checked)}
            className={styles.toggleInput}
          />
          Show Temperature
        </label>
        {showTemperature && (
          <span className={styles.tempMeta}>
            {temperatureLoading ? "Updating temperature..." : lastUpdateText || "Temperature ready"}
          </span>
        )}
      </div>

      <div className={styles.mapShell}>
        <div className={styles.mapContainer}>
          <MapContainer
            center={[23.7, 90.4]}
            zoom={7}
            style={{ height: "100%", width: "100%" }}
            bounds={mapBounds}
          >
            <FitToDistrictBounds bounds={mapBounds} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {districts && (
              <GeoJSON
                key={`districts-${showTemperature ? "temp" : "base"}-${temperatureCache?.fetchedAt ?? 0}`}
                data={districts as any}
                style={styleForFeature}
                onEachFeature={onEachFeature}
                ref={(value) => {
                  geoJsonRef.current = (value as L.GeoJSON | null) ?? null;
                }}
              />
            )}
          </MapContainer>

          {showTemperature && (
            <div className={styles.legend}>
              <strong className={styles.legendTitle}>Temperature (Now)</strong>
              {TEMPERATURE_BUCKETS.map((bucket) => (
                <div key={bucket.label} className={styles.legendRow}>
                  <span
                    className={styles.legendSwatch}
                    style={{ backgroundColor: bucket.color }}
                    aria-hidden
                  />
                  <span>{bucket.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className={styles.sidePanel}>
          <h2 className={styles.sideTitle}>Selected District</h2>
          <p className={styles.sideText}>{selectedDistrict || "None selected"}</p>

          <dl className={styles.statsList}>
            <div className={styles.statsRow}>
              <dt>Incident count</dt>
              <dd>{selectedStats.incidentCount}</dd>
            </div>
            <div className={styles.statsRow}>
              <dt>Total casualties</dt>
              <dd>{selectedStats.totalCasualties}</dd>
            </div>
            <div className={styles.statsRow}>
              <dt>Latest reporting date</dt>
              <dd>{selectedStats.latestReportingDate}</dd>
            </div>
            {showTemperature && (
              <div className={styles.statsRow}>
                <dt>Temperature (now)</dt>
                <dd>{formatTemperature(selectedDistrictTemperature)}</dd>
              </div>
            )}
          </dl>

          {selectedDistrict && (
            <Link
              href={`/incidents?district=${encodeURIComponent(selectedDistrict)}`}
              className={styles.districtLink}
            >
              View incidents in this district
            </Link>
          )}

          <p className={styles.hintText}>Hover polygons to see district tooltips.</p>
        </aside>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {showTemperature && temperatureError && <p className={styles.error}>{temperatureError}</p>}
    </section>
  );
}
