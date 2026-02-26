"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// Dynamic import for map components to avoid SSR issues
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const GeoJSON = dynamic(
  () => import("react-leaflet").then((m) => m.GeoJSON),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((m) => m.Tooltip),
  { ssr: false }
);

const BD_CENTER: [number, number] = [23.8, 90.4];
const BD_BOUNDS: [[number, number], [number, number]] = [[20.2, 87.5], [26.9, 93.2]];

type Incident = {
  id: string;
  date_occurred: string | null;
  date_published: string | null;
  district: string | null;
  upazila: string | null;
  deaths: number | null;
  injured: number | null;
  source_name: string | null;
  source_url: string | null;
  headline: string | null;
  place: string | null;
  district_code: string | null;
  lat: number | null;
  lon: number | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: any[];
};

// District code to name mapping
const DISTRICT_NAMES: Record<string, string> = {
  "BD-01": "Bandarban",
  "BD-10": "Chittagong",
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

function getDistrictName(item: Incident): string {
  // Priority: district field, then mapping from district_code, then parse place
  if (item.district) return item.district;
  if (item.district_code && DISTRICT_NAMES[item.district_code]) {
    return DISTRICT_NAMES[item.district_code];
  }
  // Fallback: extract district from place (format: "Upazila, District")
  if (item.place && item.place.includes(",")) {
    return item.place.split(",").pop()?.trim() || item.place;
  }
  return item.place || "N/A";
}

type IncidentResponse = {
  items: Incident[];
  total: number;
  page: number;
  page_size: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// Division to districts mapping
const DIVISIONS: Record<string, string[]> = {
  "Barishal": ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  "Chattogram": ["Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Comilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
  "Dhaka": ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
  "Khulna": ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  "Mymensingh": ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
  "Rajshahi": ["Bogra", "Chapainawabganj", "Joypurhat", "Naogaon", "Natore", "Nawabganj", "Pabna", "Rajshahi", "Sirajganj"],
  "Rangpur": ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  "Sylhet": ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
};

export default function IncidentsClient() {
  const [items, setItems] = useState<Incident[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [incidentDates, setIncidentDates] = useState<string[]>([]);
  const [bdBoundary, setBdBoundary] = useState<GeoJsonFeatureCollection | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [district, setDistrict] = useState("");
  const [division, setDivision] = useState("");
  const [type, setType] = useState<"all" | "death" | "injury">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date_desc" | "date_asc">("date_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showAll, setShowAll] = useState(true);
  const [activeFilter, setActiveFilter] = useState<"" | "date" | "location">("");
  const dateFilterRef = useRef<HTMLDivElement | null>(null);
  const locationFilterRef = useRef<HTMLDivElement | null>(null);

  const effectivePageSize = showAll ? 5000 : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  // Get districts for selected division
  const divisionDistricts = division ? DIVISIONS[division] || [] : [];

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (division) params.set("division", division);
    if (district) params.set("district", district);
    params.set("type", type);
    if (q) params.set("q", q);
    params.set("sort", sort);
    params.set("page", String(showAll ? 1 : page));
    params.set("page_size", String(effectivePageSize));
    return params.toString();
  }, [startDate, endDate, division, district, type, q, sort, page, effectivePageSize, showAll]);

  useEffect(() => {
    const loadReferenceData = async () => {
      const [districtRes, dateRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/incidents/districts`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/v1/incidents/dates`, { cache: "no-store" }),
      ]);
      if (districtRes.ok) {
        const payload = (await districtRes.json()) as { districts?: string[] };
        setDistricts(payload.districts ?? []);
      }
      if (dateRes.ok) {
        const payload = (await dateRes.json()) as { dates?: string[] };
        setIncidentDates(payload.dates ?? []);
      }
    };
    loadReferenceData().catch(() => null);

    // Load BD boundary for map
    const loadBoundary = async () => {
      const res = await fetch(`${API_BASE}/api/v1/admin/districts`);
      if (res.ok) {
        setBdBoundary((await res.json()) as GeoJsonFeatureCollection);
      }
    };
    loadBoundary().catch(() => null);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/v1/incidents?${query}`, { cache: "no-store" });
      if (!res.ok) {
        setItems([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      const payload = (await res.json()) as IncidentResponse;
      setItems(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setLoading(false);
    };
    load().catch(() => {
      setItems([]);
      setTotal(0);
      setLoading(false);
    });
  }, [query]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!activeFilter) return;
      const target = event.target as Node | null;
      if (!target) return;

      const inDate = dateFilterRef.current?.contains(target) ?? false;
      const inLocation = locationFilterRef.current?.contains(target) ?? false;
      if (!inDate && !inLocation) {
        setActiveFilter("");
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [activeFilter]);

  const onExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (division) params.set("division", division);
    if (district) params.set("district", district);
    params.set("type", type);
    if (q) params.set("q", q);
    params.set("sort", sort);
    window.open(`${API_BASE}/api/v1/incidents/export?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="card incidents-shell">
      <div className="incidents-header">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Heatstroke Incidents</h1>
          <p style={{ margin: 0, color: "#64748b" }}>Bangladesh heat-related injury and death records</p>
        </div>
        <button className="btn btn-accent" onClick={onExport} type="button">
          Export CSV
        </button>
      </div>

      {/* Filter Dropdown */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <div ref={dateFilterRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setActiveFilter(activeFilter === "date" ? "" : "date")}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              background: activeFilter === "date" || startDate || endDate ? "#3b82f6" : "#fff",
              color: activeFilter === "date" || startDate || endDate ? "#fff" : "#374151",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            Date Filter
            {(startDate || endDate) && <span style={{ fontSize: "0.75rem" }}>✓</span>}
          </button>
          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }}
              style={{
                marginLeft: "0.4rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.375rem",
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Clear Date
            </button>
          )}
          {activeFilter === "date" && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: "0.5rem",
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: "0.5rem",
              padding: "1rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 3000,
              minWidth: "280px",
            }}>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#64748b" }}>From incident date</label>
                <select
                  value={startDate}
                  onChange={(e) => { setPage(1); setStartDate(e.target.value); }}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
                >
                  <option value="">Any start</option>
                  {incidentDates.map((d) => (
                    <option key={`start-${d}`} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#64748b" }}>To incident date</label>
                <select
                  value={endDate}
                  onChange={(e) => { setPage(1); setEndDate(e.target.value); }}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
                >
                  <option value="">Any end</option>
                  {incidentDates.map((d) => (
                    <option key={`end-${d}`} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); setPage(1); }}
                  style={{ flex: 1, padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", background: "#f3f4f6", cursor: "pointer" }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("")}
                  style={{ flex: 1, padding: "0.4rem", border: "none", borderRadius: "0.375rem", background: "#3b82f6", color: "#fff", cursor: "pointer" }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <div ref={locationFilterRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setActiveFilter(activeFilter === "location" ? "" : "location")}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              background: activeFilter === "location" || division || district ? "#3b82f6" : "#fff",
              color: activeFilter === "location" || division || district ? "#fff" : "#374151",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            Location Filter
            {(division || district) && <span style={{ fontSize: "0.75rem" }}>✓</span>}
          </button>
          {(division || district) && (
            <button
              type="button"
              onClick={() => { setDivision(""); setDistrict(""); setPage(1); }}
              style={{
                marginLeft: "0.4rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.375rem",
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Clear Location
            </button>
          )}
          {activeFilter === "location" && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: "0.5rem",
              background: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: "0.5rem",
              padding: "1rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 3000,
              minWidth: "280px",
            }}>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#64748b" }}>Division</label>
                <select
                  value={division}
                  onChange={(e) => { setPage(1); setDivision(e.target.value); setDistrict(""); }}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
                >
                  <option value="">All Divisions</option>
                  {Object.keys(DIVISIONS).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#64748b" }}>District</label>
                <select
                  value={district}
                  onChange={(e) => { setPage(1); setDistrict(e.target.value); }}
                  style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
                >
                  <option value="">All Districts</option>
                  {(division ? divisionDistricts : districts).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => { setDivision(""); setDistrict(""); setPage(1); }}
                  style={{ flex: 1, padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", background: "#f3f4f6", cursor: "pointer" }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("")}
                  style={{ flex: 1, padding: "0.4rem", border: "none", borderRadius: "0.375rem", background: "#3b82f6", color: "#fff", cursor: "pointer" }}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active filters display */}
        {(startDate || endDate || division || district) && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            {startDate && (
              <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                From: {startDate}
                <button type="button" onClick={() => { setStartDate(""); setPage(1); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#0369a1" }}>×</button>
              </span>
            )}
            {endDate && (
              <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                To: {endDate}
                <button type="button" onClick={() => { setEndDate(""); setPage(1); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#0369a1" }}>×</button>
              </span>
            )}
            {division && (
              <span style={{ background: "#dcfce7", color: "#166534", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {division}
                <button type="button" onClick={() => { setDivision(""); setDistrict(""); setPage(1); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#166534" }}>×</button>
              </span>
            )}
            {district && (
              <span style={{ background: "#dcfce7", color: "#166534", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {district}
                <button type="button" onClick={() => { setDistrict(""); setPage(1); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#166534" }}>×</button>
              </span>
            )}
            <button
              type="button"
              onClick={() => { setStartDate(""); setEndDate(""); setDivision(""); setDistrict(""); setPage(1); }}
              style={{ border: "none", background: "none", cursor: "pointer", color: "#ef4444", fontSize: "0.85rem" }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Map showing incidents */}
      <div style={{ height: "400px", width: "100%", marginBottom: "1.5rem", borderRadius: "0.5rem", overflow: "hidden", border: "1px solid #e5e7eb" }}>
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
              style={{ color: "#64748b", weight: 1, fillColor: "#f1f5f9", fillOpacity: 0.3 }}
            />
          )}
          {items.map((item) => {
            if (!item.lat || !item.lon) return null;
            const hasDeaths = (item.deaths ?? 0) > 0;
            return (
              <CircleMarker
                key={item.id}
                center={[item.lat, item.lon]}
                radius={hasDeaths ? 8 + Math.min((item.deaths ?? 1) * 2, 12) : 6}
                pathOptions={{
                  color: hasDeaths ? "#dc2626" : "#f97316",
                  fillColor: hasDeaths ? "#dc2626" : "#f97316",
                  fillOpacity: 0.7,
                  weight: 2,
                }}
              >
                <Tooltip>
                  <strong>{getDistrictName(item)}</strong><br />
                  {item.date_occurred || item.date_published}<br />
                  Deaths: {item.deaths ?? 0} · Injured: {item.injured ?? 0}<br />
                  <em style={{ fontSize: "0.85em" }}>{item.headline}</em>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      <div style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#64748b" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", marginRight: "1rem" }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} />
          Fatal incident
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#f97316", display: "inline-block" }} />
          Injury only
        </span>
      </div>

      <div className="table-wrap desktop-only">
        <table className="incidents-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>District</th>
              <th>Deaths</th>
              <th>Injured</th>
              <th>Source</th>
              <th>Published</th>
              <th>Headline</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const serial = showAll ? idx + 1 : (page - 1) * pageSize + idx + 1;
              const eventDate = item.date_occurred || item.date_published || "N/A";
              const place = getDistrictName(item);
              return (
                <tr
                  key={item.id}
                  className="clickable-row"
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    window.location.href = `/incidents/${item.id}`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      window.location.href = `/incidents/${item.id}`;
                    }
                  }}
                >
                  <td>{serial}</td>
                  <td>
                    <Link
                      href={`/incidents/${item.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      {eventDate}
                    </Link>
                  </td>
                  <td>{place}</td>
                  <td>{item.deaths ?? "-"}</td>
                  <td>{item.injured ?? "-"}</td>
                  <td>
                    {item.source_url ? (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        {item.source_name || "Source"}
                      </a>
                    ) : (
                      item.source_name || "-"
                    )}
                  </td>
                  <td>{item.date_published || "-"}</td>
                  <td>{item.headline || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-only incidents-cards">
        {items.map((item, idx) => {
          const serial = showAll ? idx + 1 : (page - 1) * pageSize + idx + 1;
          const eventDate = item.date_occurred || item.date_published || "N/A";
          const place = getDistrictName(item);
          return (
            <article key={item.id} className="incident-card">
              <div className="incident-card-top">
                <span className="badge">#{serial}</span>
                <Link href={`/incidents/${item.id}`}>Open detail</Link>
              </div>
              <h3>{item.headline || "Heat-related incident"}</h3>
              <p><strong>Date:</strong> {eventDate}</p>
              <p><strong>Place:</strong> {place}</p>
              <p><strong>Deaths:</strong> {item.deaths ?? "-"} · <strong>Injured:</strong> {item.injured ?? "-"}</p>
              <p><strong>Published:</strong> {item.date_published || "-"}</p>
              <p>
                <strong>Source:</strong>{" "}
                {item.source_url ? (
                  <a href={item.source_url} target="_blank" rel="noreferrer">
                    {item.source_name || "Source"}
                  </a>
                ) : (
                  item.source_name || "-"
                )}
              </p>
            </article>
          );
        })}
      </div>

      <div className="pager-row">
        <div>
          Showing <strong>{items.length}</strong> of <strong>{total}</strong> incidents
          {loading ? <span style={{ marginLeft: "0.5rem", color: "#64748b" }}>Loading...</span> : null}
        </div>
        <div className="pager-controls">
          <label className="show-all-toggle">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => {
                setShowAll(e.target.checked);
                setPage(1);
              }}
            />
            Show all
          </label>
          {!showAll && (
            <>
              <label>
                Per page
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(Number(e.target.value));
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <button className="btn" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                className="btn"
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
