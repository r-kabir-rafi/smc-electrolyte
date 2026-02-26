"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import { loadIncidentsCsv, type IncidentRecord } from "../../lib/data";
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

const DISTRICT_ALIAS: Record<string, string> = {
  barisal: "barishal",
  bogra: "bogura",
  chittagong: "chattogram",
  comilla: "cumilla",
  jessore: "jashore",
};

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

  const mapBounds = useMemo(() => {
    if (!districts) return undefined;
    const layer = L.geoJSON(districts as any);
    const bounds = layer.getBounds();
    return bounds.isValid() ? bounds : undefined;
  }, [districts]);

  const districtStats = useMemo(() => buildDistrictStats(incidents), [incidents]);

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

  const defaultStyle = useMemo(
    () => ({
      color: "#1e40af",
      weight: 1,
      fillColor: "#93c5fd",
      fillOpacity: 0.35,
    }),
    []
  );

  const onEachFeature = (feature: { properties?: Record<string, string> }, layer: L.Layer) => {
    const name = districtName(feature.properties);
    layer.bindTooltip(name, { sticky: true });
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
          fillOpacity: 0.55,
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

  return (
    <section>
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
                data={districts as any}
                style={defaultStyle}
                onEachFeature={onEachFeature}
                ref={(value) => {
                  geoJsonRef.current = (value as L.GeoJSON | null) ?? null;
                }}
              />
            )}
          </MapContainer>
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
          </dl>

          {selectedDistrict && (
            <a
              href={`/incidents?district=${encodeURIComponent(selectedDistrict)}`}
              className={styles.districtLink}
            >
              View incidents in this district
            </a>
          )}

          <p className={styles.hintText}>Hover polygons to see district tooltips.</p>
        </aside>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
