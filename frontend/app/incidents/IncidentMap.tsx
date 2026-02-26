"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { loadIncidentsCsv, type IncidentRecord } from "../../lib/data";
import styles from "./incidents.module.css";

type DistrictFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: string;
    properties?: Record<string, string>;
    geometry: unknown;
  }>;
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

function jitterPoint(center: L.LatLng, order: number): L.LatLng {
  if (order === 0) {
    return center;
  }

  const ring = Math.floor((order - 1) / 6) + 1;
  const spoke = (order - 1) % 6;
  const angle = (spoke / 6) * Math.PI * 2;
  const distance = 0.04 * ring;

  const lat = center.lat + Math.sin(angle) * distance;
  const lng =
    center.lng +
    (Math.cos(angle) * distance) / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.25);

  return L.latLng(lat, lng);
}

export default function IncidentMap() {
  const [districts, setDistricts] = useState<DistrictFeatureCollection | null>(null);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [error, setError] = useState("");
  const districtLayerRef = useRef<L.GeoJSON | null>(null);

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

        const districtData = (await districtResponse.json()) as DistrictFeatureCollection;
        setDistricts(districtData);
        setIncidents(incidentRows);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load incident map.");
      }
    };

    load().catch(() => {
      setError("Failed to load incident map.");
    });
  }, []);

  const mapBounds = useMemo(() => {
    if (!districts) return undefined;
    const layer = L.geoJSON(districts as any);
    const bounds = layer.getBounds();
    return bounds.isValid() ? bounds : undefined;
  }, [districts]);

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

  const incidentPoints = useMemo(() => {
    const counters: Record<string, number> = {};
    return incidents.flatMap((incident, index) => {
      const districtKey = canonicalDistrictName(incident.district || "");
      const center = districtCentroids.get(districtKey);
      if (!center) return [];

      const order = counters[districtKey] ?? 0;
      counters[districtKey] = order + 1;

      const point = jitterPoint(center, order);
      return [
        {
          key: `${incident.id}-${index}`,
          incident,
          point,
        },
      ];
    });
  }, [incidents, districtCentroids]);

  const onEachBoundary = (
    feature: { properties?: Record<string, string> },
    layer: L.Layer
  ) => {
    const name = districtName(feature.properties);
    layer.bindTooltip(name, { sticky: true });
    layer.on({
      mouseover: (event) => {
        const target = event.target as L.Path;
        target.setStyle({
          weight: 2,
          color: "#0f172a",
          fillOpacity: 0.45,
        });
      },
      mouseout: (event) => {
        districtLayerRef.current?.resetStyle(event.target);
      },
    });
  };

  return (
    <section className={styles.mapBlock}>
      <div className={styles.mapMeta}>
        <strong>Incident Map</strong>
        <span>
          Showing {incidentPoints.length} located incidents across{" "}
          {new Set(incidentPoints.map((item) => item.incident.district)).size} districts
        </span>
      </div>

      <div className={styles.mapContainer}>
        <MapContainer
          center={[23.7, 90.4]}
          zoom={7}
          bounds={mapBounds}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {districts && (
            <GeoJSON
              data={districts as any}
              style={{
                color: "#334155",
                weight: 1,
                fillColor: "#cbd5e1",
                fillOpacity: 0.2,
              }}
              onEachFeature={onEachBoundary}
              ref={(instance) => {
                districtLayerRef.current = (instance as L.GeoJSON | null) ?? null;
              }}
            />
          )}
          {incidentPoints.map(({ key, incident, point }) => (
            <CircleMarker
              key={key}
              center={[point.lat, point.lng]}
              radius={6}
              pathOptions={{
                color: "#b91c1c",
                fillColor: "#ef4444",
                fillOpacity: 0.85,
                weight: 1,
              }}
            >
              <Tooltip>
                <strong>{incident.district || "Unknown district"}</strong>
                <br />
                Reporting: {incident.reporting_date || "-"}
                <br />
                Dead: {incident.dead} | Sick: {incident.sick}
                <br />
                Total: {incident.casualties}
                <br />
                {incident.place || "-"}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
    </section>
  );
}
