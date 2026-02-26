"use client";

import "leaflet/dist/leaflet.css";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: any[];
};

type TimeLevel = "daily" | "weekly";
type Intensity = "none" | "watch" | "high" | "extreme";
type ViewMode = "historical" | "forecast" | "exposure";
type ForecastBand = "low" | "watch" | "high" | "extreme";
type ExposureMetric = "population" | "mobility";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const fillByCategory: Record<Intensity, string> = {
  none: "#f3f4f6",
  watch: "#fde68a",
  high: "#fb923c",
  extreme: "#dc2626",
};

export default function BoundaryMap() {
  const [viewMode, setViewMode] = useState<ViewMode>("historical");
  const [exposureMetric, setExposureMetric] = useState<ExposureMetric>("population");
  const [upazilas, setUpazilas] = useState<GeoJsonFeatureCollection | null>(null);
  const [showUpazila, setShowUpazila] = useState(false);
  const [level, setLevel] = useState<TimeLevel>("daily");
  const [dates, setDates] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [layer, setLayer] = useState<GeoJsonFeatureCollection | null>(null);
  const [forecastAll, setForecastAll] = useState<GeoJsonFeatureCollection | null>(null);
  const [populationLayer, setPopulationLayer] = useState<GeoJsonFeatureCollection | null>(null);
  const [mobilityLayer, setMobilityLayer] = useState<GeoJsonFeatureCollection | null>(null);
  const [mobilityRanking, setMobilityRanking] = useState<any[]>([]);
  const [forecastDates, setForecastDates] = useState<string[]>([]);
  const [forecastDate, setForecastDate] = useState("");
  const [topUpazilas, setTopUpazilas] = useState<any[]>([]);
  const [enabled, setEnabled] = useState<Record<Intensity, boolean>>({
    none: true,
    watch: true,
    high: true,
    extreme: true,
  });
  const [enabledForecast, setEnabledForecast] = useState<Record<ForecastBand, boolean>>({
    low: true,
    watch: true,
    high: true,
    extreme: true,
  });

  const selectedDate = dates[selectedIndex] ?? "";

  useEffect(() => {
    const loadStatic = async () => {
      const res = await fetch(`${API_BASE}/api/v1/admin/upazilas`);
      if (res.ok) {
        setUpazilas((await res.json()) as GeoJsonFeatureCollection);
      }
    };
    loadStatic().catch(() => null);
  }, []);

  useEffect(() => {
    const loadDates = async () => {
      const res = await fetch(`${API_BASE}/api/v1/heatwave/dates?level=${level}`);
      if (!res.ok) {
        setDates([]);
        return;
      }
      const payload = (await res.json()) as { dates: string[] };
      const list = payload.dates ?? [];
      setDates(list);
      setSelectedIndex(Math.max(0, list.length - 1));
    };
    loadDates().catch(() => {
      setDates([]);
    });
  }, [level]);

  useEffect(() => {
    const loadForecast = async () => {
      const [datesRes, layerRes, topRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/forecast/dates`),
        fetch(`${API_BASE}/api/v1/forecast/next7`),
        fetch(`${API_BASE}/api/v1/forecast/top-upazilas?limit=20`),
      ]);
      if (datesRes.ok) {
        const payload = (await datesRes.json()) as { dates: string[] };
        setForecastDates(payload.dates ?? []);
        setForecastDate((payload.dates ?? [])[0] ?? "");
      }
      if (layerRes.ok) {
        setForecastAll((await layerRes.json()) as GeoJsonFeatureCollection);
      }
      if (topRes.ok) {
        setTopUpazilas((await topRes.json()) as any[]);
      }
    };
    loadForecast().catch(() => null);
  }, []);

  useEffect(() => {
    const loadExposure = async () => {
      const [popRes, mobRes, rankRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/exposure/population-districts`),
        fetch(`${API_BASE}/api/v1/exposure/mobility-districts`),
        fetch(`${API_BASE}/api/v1/exposure/mobility-ranking?limit=20`),
      ]);
      if (popRes.ok) {
        setPopulationLayer((await popRes.json()) as GeoJsonFeatureCollection);
      }
      if (mobRes.ok) {
        setMobilityLayer((await mobRes.json()) as GeoJsonFeatureCollection);
      }
      if (rankRes.ok) {
        setMobilityRanking((await rankRes.json()) as any[]);
      }
    };
    loadExposure().catch(() => null);
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setLayer(null);
      return;
    }
    const loadLayer = async () => {
      const res = await fetch(
        `${API_BASE}/api/v1/heatwave/choropleth?level=${level}&date=${selectedDate}`,
      );
      if (!res.ok) {
        setLayer(null);
        return;
      }
      setLayer((await res.json()) as GeoJsonFeatureCollection);
    };
    loadLayer().catch(() => {
      setLayer(null);
    });
  }, [level, selectedDate]);

  const center = useMemo<[number, number]>(() => [23.685, 90.3563], []);

  const exposureColor = (value: number, metric: ExposureMetric): string => {
    const v = Number.isFinite(value) ? value : 0;
    if (metric === "population") {
      if (v >= 5000) return "#7f1d1d";
      if (v >= 3000) return "#b45309";
      if (v >= 1500) return "#ea580c";
      if (v >= 700) return "#f59e0b";
      return "#fef3c7";
    }
    if (v >= 0.8) return "#14532d";
    if (v >= 0.6) return "#166534";
    if (v >= 0.4) return "#16a34a";
    if (v >= 0.2) return "#4ade80";
    return "#dcfce7";
  };

  const filteredLayer = useMemo(() => {
    if (viewMode === "exposure") {
      return exposureMetric === "population" ? populationLayer : mobilityLayer;
    }

    if (viewMode === "forecast") {
      if (!forecastAll || !forecastDate) {
        return null;
      }
      return {
        ...forecastAll,
        features: forecastAll.features.filter((feature) => {
          const date = String(feature?.properties?.forecast_date ?? "");
          const band = (feature?.properties?.risk_band ?? "low") as ForecastBand;
          return date === forecastDate && (enabledForecast[band] ?? false);
        }),
      } as GeoJsonFeatureCollection;
    }

    if (!layer) {
      return null;
    }
    return {
      ...layer,
      features: layer.features.filter((feature) => {
        const c = (feature?.properties?.intensity_category ?? "none") as Intensity;
        return enabled[c] ?? false;
      }),
    } as GeoJsonFeatureCollection;
  }, [
    layer,
    enabled,
    viewMode,
    forecastAll,
    forecastDate,
    enabledForecast,
    populationLayer,
    mobilityLayer,
    exposureMetric,
  ]);

  const toggleCategory = (category: Intensity) => {
    setEnabled((prev) => ({ ...prev, [category]: !prev[category] }));
  };
  const toggleForecastCategory = (category: ForecastBand) => {
    setEnabledForecast((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <label>
          Mode{" "}
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}>
            <option value="historical">Historical</option>
            <option value="forecast">Forecast (next 7 days)</option>
            <option value="exposure">Exposure</option>
          </select>
        </label>

        {viewMode !== "exposure" && (
          <label>
            Time level{" "}
            <select value={level} onChange={(e) => setLevel(e.target.value as TimeLevel)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        )}

        {viewMode === "exposure" && (
          <label>
            Exposure metric{" "}
            <select
              value={exposureMetric}
              onChange={(e) => setExposureMetric(e.target.value as ExposureMetric)}
            >
              <option value="population">Population density</option>
              <option value="mobility">Movement proxy</option>
            </select>
          </label>
        )}

        {viewMode !== "exposure" && (
          <label style={{ minWidth: "220px" }}>
            Date: <strong>{viewMode === "historical" ? selectedDate || "N/A" : forecastDate || "N/A"}</strong>
            <input
              type="range"
              min={0}
              max={Math.max(0, (viewMode === "historical" ? dates : forecastDates).length - 1)}
              value={
                viewMode === "historical"
                  ? selectedIndex
                  : Math.max(0, forecastDates.findIndex((d) => d === forecastDate))
              }
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (viewMode === "historical") {
                  setSelectedIndex(idx);
                } else {
                  setForecastDate(forecastDates[idx] ?? "");
                }
              }}
              style={{ width: "100%", display: "block" }}
              disabled={(viewMode === "historical" ? dates : forecastDates).length === 0}
            />
          </label>
        )}

        <label style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}>
          <input type="checkbox" checked={showUpazila} onChange={() => setShowUpazila((v) => !v)} />
          Show upazila outlines
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        {viewMode === "historical" &&
          (["none", "watch", "high", "extreme"] as Intensity[]).map((category) => (
            <label key={category} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={enabled[category]}
                onChange={() => toggleCategory(category)}
              />
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "2px",
                  background: fillByCategory[category],
                  display: "inline-block",
                }}
              />
              {category}
            </label>
          ))}
        {viewMode === "forecast" &&
          (["low", "watch", "high", "extreme"] as ForecastBand[]).map((category) => (
            <label key={category} style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={enabledForecast[category]}
                onChange={() => toggleForecastCategory(category)}
              />
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "2px",
                  background:
                    category === "low" ? "#94a3b8" : category === "watch" ? "#fde68a" : category === "high" ? "#fb923c" : "#dc2626",
                  display: "inline-block",
                }}
              />
              {category}
            </label>
          ))}
      </div>

      <div style={{ borderRadius: "0.75rem", overflow: "hidden" }}>
        <MapContainer center={center} zoom={7} style={{ height: "520px", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filteredLayer && (
            <GeoJSON
              data={filteredLayer as any}
              style={(feature) => {
                if (viewMode === "exposure") {
                  const p = feature?.properties ?? {};
                  const value =
                    exposureMetric === "population"
                      ? Number(p.mean_pop_density ?? 0)
                      : Number(p.movement_intensity_proxy ?? 0);
                  return {
                    color: "#1f2937",
                    weight: 1,
                    fillColor: exposureColor(value, exposureMetric),
                    fillOpacity: 0.7,
                  };
                }
                const category = (viewMode === "historical"
                  ? feature?.properties?.intensity_category ?? "none"
                  : feature?.properties?.risk_band ?? "low") as string;
                return {
                  color: "#334155",
                  weight: 1,
                  fillColor:
                    viewMode === "historical"
                      ? fillByCategory[category as Intensity]
                      : category === "low"
                        ? "#94a3b8"
                        : category === "watch"
                          ? "#fde68a"
                          : category === "high"
                            ? "#fb923c"
                            : "#dc2626",
                  fillOpacity: 0.7,
                };
              }}
            />
          )}
          {showUpazila && upazilas && (
            <GeoJSON
              data={upazilas as any}
              style={{ color: "#0f766e", weight: 0.7, fillOpacity: 0 }}
            />
          )}
        </MapContainer>
      </div>
      {viewMode === "forecast" && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
          <strong>Top upazila hotspots:</strong>{" "}
          {topUpazilas.slice(0, 5).map((r) => `${r.upazila_name} (${r.risk_band})`).join(", ")}
        </div>
      )}
      {viewMode === "exposure" && exposureMetric === "mobility" && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
          <strong>Top movement-intensity districts:</strong>{" "}
          {mobilityRanking.slice(0, 5).map((r) => `${r.district_name} (#${r.movement_rank})`).join(", ")}
        </div>
      )}
    </div>
  );
}
