"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

export default function IncidentsClient() {
  const [items, setItems] = useState<Incident[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [district, setDistrict] = useState("");
  const [type, setType] = useState<"all" | "death" | "injury">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"date_desc" | "date_asc">("date_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showAll, setShowAll] = useState(true);

  const effectivePageSize = showAll ? 5000 : pageSize;
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (district) params.set("district", district);
    params.set("type", type);
    if (q) params.set("q", q);
    params.set("sort", sort);
    params.set("page", String(showAll ? 1 : page));
    params.set("page_size", String(effectivePageSize));
    return params.toString();
  }, [startDate, endDate, district, type, q, sort, page, effectivePageSize, showAll]);

  useEffect(() => {
    const loadDistricts = async () => {
      const res = await fetch(`${API_BASE}/api/v1/incidents/districts`, { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as { districts?: string[] };
      setDistricts(payload.districts ?? []);
    };
    loadDistricts().catch(() => null);
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

  const onExport = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
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

      <div className="filters-grid">
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPage(1);
              setStartDate(e.target.value);
            }}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPage(1);
              setEndDate(e.target.value);
            }}
          />
        </label>
        <label>
          District
          <select
            value={district}
            onChange={(e) => {
              setPage(1);
              setDistrict(e.target.value);
            }}
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            value={type}
            onChange={(e) => {
              setPage(1);
              setType(e.target.value as "all" | "death" | "injury");
            }}
          >
            <option value="all">All</option>
            <option value="death">Deaths</option>
            <option value="injury">Injuries</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as "date_desc" | "date_asc") }>
            <option value="date_desc">Date (newest first)</option>
            <option value="date_asc">Date (oldest first)</option>
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            placeholder="Place or headline"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </label>
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
