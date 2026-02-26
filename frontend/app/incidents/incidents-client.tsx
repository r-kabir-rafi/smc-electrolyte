"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { apiUrl } from "../../lib/api";

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const GeoJSON = dynamic(() => import("react-leaflet").then((m) => m.GeoJSON), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then((m) => m.Tooltip), { ssr: false });

const BD_CENTER: [number, number] = [23.8, 90.4];
const BD_BOUNDS: [[number, number], [number, number]] = [[20.2, 87.5], [26.9, 93.2]];

type Incident = {
  id: string;
  date_occurred: string | null;
  date_published: string | null;
  district: string | null;
  district_code: string | null;
  place: string | null;
  upazila: string | null;
  deaths: number | null;
  injured: number | null;
  source_name: string | null;
  source_url: string | null;
  headline: string | null;
  lat: number | null;
  lon: number | null;
};

type IncidentResponse = {
  items: Incident[];
  total: number;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: any[];
};

function incidentDate(item: Incident): string {
  return item.date_occurred || item.date_published || "N/A";
}

const DISTRICT_BY_CODE: Record<string, string> = {
  "BD-01": "Bandarban",
  "BD-10": "Chattogram",
  "BD-12": "Chuadanga",
  "BD-13": "Dhaka",
  "BD-18": "Gazipur",
  "BD-20": "Habiganj",
  "BD-22": "Jashore",
  "BD-23": "Jhenaidah",
  "BD-27": "Khulna",
  "BD-29": "Lalmonirhat",
  "BD-36": "Madaripur",
  "BD-39": "Meherpur",
  "BD-44": "Natore",
  "BD-46": "Nilphamari",
  "BD-48": "Naogaon",
  "BD-53": "Rajbari",
  "BD-54": "Pabna",
  "BD-59": "Sirajganj",
  "BD-69": "Rajshahi",
};

const DISTRICT_NAME_NORMALIZATION: Record<string, string> = {
  chittagong: "Chattogram",
  comilla: "Cumilla",
  jessore: "Jashore",
  bogra: "Bogura",
  barisal: "Barishal",
};

function normalizeDistrictName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const normalized = DISTRICT_NAME_NORMALIZATION[trimmed.toLowerCase()];
  return normalized || trimmed;
}

function districtLabel(item: Incident): string {
  if (item.district) {
    const n = normalizeDistrictName(item.district);
    if (n) return n;
  }
  if (item.place) {
    const parts = item.place.split(",").map((p) => p.trim()).filter(Boolean);
    const fromPlace = parts.length > 0 ? parts[parts.length - 1] : item.place.trim();
    const n = normalizeDistrictName(fromPlace);
    if (n) return n;
  }
  if (item.district_code) {
    return DISTRICT_BY_CODE[item.district_code] || item.district_code;
  }
  return "Unknown district";
}

export default function IncidentsClient() {
  const [items, setItems] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [bdBoundary, setBdBoundary] = useState<GeoJsonFeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [incidentsRes, boundaryRes] = await Promise.all([
          fetch(apiUrl("/api/v1/incidents?page=1&page_size=5000&sort=date_desc"), { cache: "no-store" }),
          fetch(apiUrl("/api/v1/admin/districts"), { cache: "no-store" }),
        ]);

        if (!incidentsRes.ok) {
          let detail = "";
          try {
            const payload = (await incidentsRes.json()) as { detail?: string };
            detail = payload.detail ?? "";
          } catch {
            detail = "";
          }
          throw new Error(detail || `Failed to load incidents (${incidentsRes.status})`);
        }

        const incidentsPayload = (await incidentsRes.json()) as IncidentResponse;
        setItems(incidentsPayload.items ?? []);
        setTotal(incidentsPayload.total ?? 0);

        if (boundaryRes.ok) {
          setBdBoundary((await boundaryRes.json()) as GeoJsonFeatureCollection);
        }
      } catch (err) {
        setItems([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : "Failed to load incidents.");
      } finally {
        setLoading(false);
      }
    };

    load().catch(() => {
      setLoading(false);
      setError("Failed to load incidents.");
    });
  }, []);

  return (
    <section className="card incidents-shell">
      <div className="incidents-header">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Bangladesh Heatstroke Incidents</h1>
          <p style={{ margin: 0, color: "#64748b" }}>District boundary map with plotted incidents</p>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 0.9rem",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: "0.5rem",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ height: "460px", width: "100%", marginBottom: "1rem", borderRadius: "0.5rem", overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <MapContainer
          center={BD_CENTER}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          maxBounds={BD_BOUNDS}
          minZoom={5}
          maxZoom={10}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {bdBoundary && (
            <GeoJSON
              data={bdBoundary as any}
              style={{ color: "#334155", weight: 1.3, fillColor: "#f8fafc", fillOpacity: 0.24 }}
            />
          )}
          {items.map((item) => {
            if (item.lat === null || item.lon === null) return null;
            const hasDeaths = (item.deaths ?? 0) > 0;
            return (
              <CircleMarker
                key={item.id}
                center={[item.lat, item.lon]}
                radius={hasDeaths ? 8 : 6}
                pathOptions={{
                  color: hasDeaths ? "#dc2626" : "#f97316",
                  fillColor: hasDeaths ? "#dc2626" : "#f97316",
                  fillOpacity: 0.75,
                  weight: 2,
                }}
              >
                <Tooltip>
                  <strong>{districtLabel(item)}</strong>
                  <br />
                  {incidentDate(item)}
                  <br />
                  Deaths: {item.deaths ?? 0} | Injured: {item.injured ?? 0}
                  <br />
                  {item.headline || "Heat-related incident"}
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#64748b", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />
          Fatal incident
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />
          Injury-only incident
        </span>
        <span>
          Total incidents: <strong>{total}</strong>
          {loading ? " (loading...)" : ""}
        </span>
      </div>

      <div className="table-wrap">
        <table className="incidents-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>District</th>
              <th>Deaths</th>
              <th>Injured</th>
              <th>Source</th>
              <th>Headline</th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#64748b", padding: "1rem" }}>
                  No incidents available.
                </td>
              </tr>
            )}
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td>{idx + 1}</td>
                <td>
                  <Link href={`/incidents/${item.id}`}>{incidentDate(item)}</Link>
                </td>
                <td>{districtLabel(item)}</td>
                <td>{item.deaths ?? "-"}</td>
                <td>{item.injured ?? "-"}</td>
                <td>
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="noreferrer">
                      {item.source_name || "Source"}
                    </a>
                  ) : (
                    item.source_name || "-"
                  )}
                </td>
                <td>{item.headline || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
