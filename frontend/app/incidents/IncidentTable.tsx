"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { exportIncidentsCsv, loadIncidentsCsv, type IncidentRecord } from "../../lib/data";
import styles from "./incidents.module.css";

type SortKey = "reporting_date" | "casualties" | "district";
type SortDirection = "asc" | "desc";

function parseDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? Number.NEGATIVE_INFINITY : ts;
}

function sortIndicator(active: boolean, direction: SortDirection): string {
  if (!active) return "";
  return direction === "asc" ? " ▲" : " ▼";
}

export default function IncidentTable() {
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [district, setDistrict] = useState("");
  const [query, setQuery] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("reporting_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const districtFromQuery = searchParams.get("district")?.trim() || "";
    setDistrict(districtFromQuery);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await loadIncidentsCsv();
        setRows(data);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load incidents.");
      } finally {
        setLoading(false);
      }
    };

    load().catch(() => {
      setError("Failed to load incidents.");
      setLoading(false);
    });
  }, []);

  const districtOptions = useMemo(
    () => [...new Set(rows.map((row) => row.district).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const start = startDate ? parseDate(startDate) : null;
    const end = endDate ? parseDate(endDate) + 24 * 60 * 60 * 1000 - 1 : null;

    const filtered = rows.filter((row) => {
      if (district && row.district !== district) return false;

      if (start !== null || end !== null) {
        const rowDate = parseDate(row.reporting_date);
        if (rowDate === Number.NEGATIVE_INFINITY) return false;
        if (start !== null && rowDate < start) return false;
        if (end !== null && rowDate > end) return false;
      }

      if (!q) return true;
      const text = `${row.district} ${row.place} ${row.description} ${row.source_name}`.toLowerCase();
      return text.includes(q);
    });

    return filtered.sort((a, b) => {
      let result = 0;
      if (sortKey === "reporting_date") {
        result = parseDate(a.reporting_date) - parseDate(b.reporting_date);
      } else if (sortKey === "casualties") {
        result = a.casualties - b.casualties;
      } else {
        result = a.district.localeCompare(b.district);
      }

      if (result === 0) {
        result = a.id.localeCompare(b.id);
      }

      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, startDate, endDate, district, query, sortKey, sortDirection]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, district, query, sortKey, sortDirection, pageSize]);

  const totalResults = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const from = (currentPage - 1) * pageSize;
    return filteredSorted.slice(from, from + pageSize);
  }, [filteredSorted, currentPage, pageSize]);

  const setSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "district" ? "asc" : "desc");
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setDistrict("");
    setQuery("");
  };

  const exportCurrentRows = () => {
    const csv = exportIncidentsCsv(filteredSorted);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "incidents_filtered_sorted.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <div className={styles.filters}>
        <label className={styles.filterGroup}>
          Reporting Date Start
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>

        <label className={styles.filterGroup}>
          Reporting Date End
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>

        <label className={styles.filterGroup}>
          District
          <select value={district} onChange={(event) => setDistrict(event.target.value)}>
            <option value="">All districts</option>
            {districtOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterGroup}>
          Search
          <input
            type="text"
            placeholder="district / place / description / source"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.actions}>
        <div className={styles.meta}>
          Total results: <strong>{totalResults}</strong>
        </div>
        <div className={styles.buttonRow}>
          <button type="button" className={styles.button} onClick={clearFilters}>
            Clear filters
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={exportCurrentRows}
            disabled={filteredSorted.length === 0 || loading}
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading && <div className={`${styles.message} ${styles.loading}`}>Loading incidents...</div>}
      {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>
                <button type="button" className={styles.sortButton} onClick={() => setSort("reporting_date")}>
                  Reporting Date{sortIndicator(sortKey === "reporting_date", sortDirection)}
                </button>
              </th>
              <th>Incident Date</th>
              <th>
                <button type="button" className={styles.sortButton} onClick={() => setSort("district")}>
                  District{sortIndicator(sortKey === "district", sortDirection)}
                </button>
              </th>
              <th>
                <button type="button" className={styles.sortButton} onClick={() => setSort("casualties")}>
                  Dead / Sick{sortIndicator(sortKey === "casualties", sortDirection)}
                </button>
              </th>
              <th>Place</th>
              <th>Description</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {!loading && pagedRows.length === 0 && (
              <tr>
                <td colSpan={8}>No incidents found.</td>
              </tr>
            )}

            {pagedRows.map((row, index) => {
              const serial = (currentPage - 1) * pageSize + index + 1;
              return (
                <tr key={`${row.id}-${serial}`}>
                  <td>{serial}</td>
                  <td>{row.reporting_date || "-"}</td>
                  <td>{row.incident_date || "-"}</td>
                  <td>{row.district || "-"}</td>
                  <td>{row.dead} / {row.sick}</td>
                  <td>{row.place || "-"}</td>
                  <td className={styles.description}>{row.description || "-"}</td>
                  <td>
                    {row.source_url ? (
                      <a href={row.source_url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                        {row.source_name || "Source"}
                      </a>
                    ) : (
                      row.source_name || "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <div className={styles.paginationControls}>
          <label htmlFor="page-size">Page size</label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className={styles.paginationControls}>
          <button
            type="button"
            className={styles.button}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </button>
          <span>
            Page {totalResults === 0 ? 0 : currentPage} of {totalResults === 0 ? 0 : totalPages}
          </span>
          <button
            type="button"
            className={styles.button}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages || totalResults === 0}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
