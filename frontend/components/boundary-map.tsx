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
type ViewMode = "realtime" | "historical" | "forecast" | "exposure";
type ForecastBand = "low" | "watch" | "high" | "extreme";
type ExposureMetric = "population" | "mobility";
type HistoricalMetric = "intensity" | "tmax";
type RiskCategory = "extreme" | "high" | "moderate" | "low" | "minimal";

const riskColors: Record<RiskCategory, string> = {
  extreme: "#7f1d1d",
  high: "#dc2626",
  moderate: "#f97316",
  low: "#facc15",
  minimal: "#86efac",
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BD_BOUNDS: [[number, number], [number, number]] = [[20.2, 87.5], [26.9, 93.2]];

const fillByCategory: Record<Intensity, string> = {
  none: "#f3f4f6",
  watch: "#fde68a",
  high: "#fb923c",
  extreme: "#dc2626",
};

export default function BoundaryMap() {
  const [viewMode, setViewMode] = useState<ViewMode>("historical");
  const [historicalMetric, setHistoricalMetric] = useState<HistoricalMetric>("intensity");
  const [isPlaying, setIsPlaying] = useState(false);
  const [exposureMetric, setExposureMetric] = useState<ExposureMetric>("population");
  const [districts, setDistricts] = useState<GeoJsonFeatureCollection | null>(null);
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

  // Real-time data state
  const [realtimeLayer, setRealtimeLayer] = useState<GeoJsonFeatureCollection | null>(null);
  const [realtimeDates, setRealtimeDates] = useState<string[]>([]);
  const [realtimeDate, setRealtimeDate] = useState("");
  const [realtimeForecast, setRealtimeForecast] = useState<GeoJsonFeatureCollection | null>(null);
  const [electrolyteSummary, setElectrolyteSummary] = useState<any>(null);
  const [realtimeMode, setRealtimeMode] = useState<"current" | "forecast">("current");

  const selectedDate = dates[selectedIndex] ?? "";

  useEffect(() => {
    const loadStatic = async () => {
      const districtRes = await fetch(`${API_BASE}/api/v1/admin/districts`);
      if (districtRes.ok) {
        setDistricts((await districtRes.json()) as GeoJsonFeatureCollection);
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

  // Load realtime data
  useEffect(() => {
    const loadRealtime = async () => {
      const [datesRes, currentRes, forecastRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/realtime/dates`),
        fetch(`${API_BASE}/api/v1/realtime/current`),
        fetch(`${API_BASE}/api/v1/realtime/forecast`),
        fetch(`${API_BASE}/api/v1/realtime/electrolyte-risk`),
      ]);
      if (datesRes.ok) {
        const data = await datesRes.json();
        setRealtimeDates(data.historical ?? []);
        if (data.historical?.length > 0) {
          setRealtimeDate(data.historical[data.historical.length - 1]);
        }
      }
      if (currentRes.ok) {
        setRealtimeLayer((await currentRes.json()) as GeoJsonFeatureCollection);
      }
      if (forecastRes.ok) {
        setRealtimeForecast((await forecastRes.json()) as GeoJsonFeatureCollection);
      }
      if (summaryRes.ok) {
        setElectrolyteSummary(await summaryRes.json());
      }
    };
    loadRealtime().catch(() => null);
  }, []);

  // Load realtime choropleth for selected date
  useEffect(() => {
    if (viewMode !== "realtime" || realtimeMode !== "current" || !realtimeDate) return;
    const loadRealtimeDate = async () => {
      const res = await fetch(`${API_BASE}/api/v1/realtime/choropleth?date=${realtimeDate}`);
      if (res.ok) {
        setRealtimeLayer((await res.json()) as GeoJsonFeatureCollection);
      }
    };
    loadRealtimeDate().catch(() => null);
  }, [viewMode, realtimeMode, realtimeDate]);

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

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    if (viewMode === "exposure") {
      setIsPlaying(false);
      return;
    }

    const activeDates = viewMode === "historical" ? dates : forecastDates;
    if (activeDates.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      if (viewMode === "historical") {
        setSelectedIndex((prev) => (prev + 1) % activeDates.length);
      } else {
        setForecastDate((prev) => {
          const idx = activeDates.findIndex((d) => d === prev);
          const next = idx >= 0 ? (idx + 1) % activeDates.length : 0;
          return activeDates[next];
        });
      }
    }, 900);

    return () => window.clearInterval(timer);
  }, [isPlaying, viewMode, dates, forecastDates]);

  const center = useMemo<[number, number]>(() => [23.685, 90.3563], []);

  // Force GeoJSON layer to remount when data or view changes (react-leaflet limitation)
  const layerKey = useMemo(
    () => `${viewMode}-${level}-${selectedDate}-${forecastDate}-${exposureMetric}-${realtimeDate}-${realtimeMode}`,
    [viewMode, level, selectedDate, forecastDate, exposureMetric, realtimeDate, realtimeMode],
  );

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
    if (viewMode === "realtime") {
      if (realtimeMode === "forecast") {
        return realtimeForecast;
      }
      return realtimeLayer;
    }

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
    if (historicalMetric === "tmax") {
      return layer;
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
    historicalMetric,
  ]);

  const tmaxStats = useMemo(() => {
    if (viewMode !== "historical" || !filteredLayer?.features?.length) {
      return null;
    }
    const vals = filteredLayer.features
      .map((f) => Number(f?.properties?.tmax_c))
      .filter((v) => Number.isFinite(v));
    if (!vals.length) {
      return null;
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { min, max, avg };
  }, [viewMode, filteredLayer]);

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
            <option value="realtime">Real-time (Electrolyte Risk)</option>
            <option value="historical">Historical</option>
            <option value="forecast">Forecast (next 7 days)</option>
            <option value="exposure">Exposure</option>
          </select>
        </label>

        {viewMode === "realtime" && (
          <label>
            View{" "}
            <select value={realtimeMode} onChange={(e) => setRealtimeMode(e.target.value as "current" | "forecast")}>
              <option value="current">Current/Historical</option>
              <option value="forecast">7-Day Forecast</option>
            </select>
          </label>
        )}

        {viewMode === "realtime" && realtimeMode === "current" && realtimeDates.length > 0 && (
          <label style={{ minWidth: "200px" }}>
            Date: <strong>{realtimeDate || "N/A"}</strong>
            <input
              type="range"
              min={0}
              max={realtimeDates.length - 1}
              value={Math.max(0, realtimeDates.indexOf(realtimeDate))}
              onChange={(e) => setRealtimeDate(realtimeDates[Number(e.target.value)] ?? "")}
              style={{ width: "100%", display: "block" }}
            />
          </label>
        )}

        {viewMode !== "exposure" && viewMode !== "realtime" && (
          <label>
            Time level{" "}
            <select value={level} onChange={(e) => setLevel(e.target.value as TimeLevel)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        )}

        {viewMode === "historical" && (
          <label>
            Historical metric{" "}
            <select
              value={historicalMetric}
              onChange={(e) => setHistoricalMetric(e.target.value as HistoricalMetric)}
            >
              <option value="intensity">Intensity class</option>
              <option value="tmax">Tmax (°C)</option>
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

        {viewMode !== "exposure" && (
          <button
            type="button"
            onClick={() => setIsPlaying((v) => !v)}
            disabled={(viewMode === "historical" ? dates : forecastDates).length < 2}
            style={{
              border: "1px solid #d1d5db",
              background: "#ffffff",
              borderRadius: "0.4rem",
              padding: "0.3rem 0.7rem",
              cursor: "pointer",
            }}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        {viewMode === "historical" && historicalMetric === "intensity" &&
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

      <div style={{ borderRadius: "0.75rem", overflow: "hidden", border: "2px solid #1e293b" }}>
        <MapContainer
          center={center}
          zoom={7}
          style={{ height: "520px", width: "100%" }}
          maxBounds={BD_BOUNDS as any}
          maxBoundsViscosity={0.85}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            opacity={0.75}
          />
          {/* District boundaries - prominent */}
          {districts && (
            <GeoJSON
              data={districts as any}
              onEachFeature={(feature, leafletLayer) => {
                const p = feature?.properties ?? {};
                const districtName = p.NAME_2 ?? p.district_name ?? "District";
                const divisionName = p.NAME_1 ?? "";
                const label = divisionName 
                  ? `<b>${districtName}</b><br/><span style="color:#64748b">${divisionName} Division</span>`
                  : `<b>${districtName}</b>`;
                leafletLayer.bindTooltip(label, { sticky: true });
              }}
              style={{
                color: "#0f172a",
                weight: 2,
                fillOpacity: 0,
              }}
            />
          )}
          {filteredLayer && (
            <GeoJSON
              key={layerKey}
              data={filteredLayer as any}
              onEachFeature={(feature, leafletLayer) => {
                const p = feature?.properties ?? {};
                let label = "";
                if (viewMode === "realtime") {
                  const name = p.district_name ?? "Unknown";
                  const tmax = p.tmax_c !== undefined ? `${Number(p.tmax_c).toFixed(1)}°C` : "N/A";
                  const hi = p.heat_index_c !== undefined ? `${Number(p.heat_index_c).toFixed(1)}°C` : "N/A";
                  const humidity = p.humidity_pct !== undefined ? `${Number(p.humidity_pct).toFixed(0)}%` : "N/A";
                  const risk = p.risk_category ?? "N/A";
                  const score = p.risk_score !== undefined ? `${(Number(p.risk_score) * 100).toFixed(0)}%` : "N/A";
                  const water = p.recommended_water_liters ?? "N/A";
                  const packs = p.recommended_electrolyte_packs ?? 0;
                  label = `<b>${name}</b><br/>
                    <span style="color:#dc2626">Temp: ${tmax}</span> · Heat Index: ${hi}<br/>
                    Humidity: ${humidity}<br/>
                    <b style="color:${riskColors[risk as RiskCategory] ?? '#666'}">Risk: ${risk} (${score})</b><br/>
                    💧 Water: ${water}L · ⚡ Electrolyte: ${packs} packs`;
                } else if (viewMode === "historical") {
                  const name = p.district_name ?? p.district_name_x ?? "Unknown";
                  const tmax = p.tmax_c !== undefined ? `${Number(p.tmax_c).toFixed(1)}°C` : "N/A";
                  const cat = p.intensity_category ?? "N/A";
                  label = `<b>${name}</b><br/>Tmax: ${tmax}<br/>Intensity: <b>${cat}</b>`;
                } else if (viewMode === "forecast") {
                  const name = p.upazila_name ?? p.district_name ?? "Unknown";
                  const band = p.risk_band ?? "N/A";
                  const prob = p.risk_probability !== undefined ? `${(Number(p.risk_probability) * 100).toFixed(0)}%` : "N/A";
                  label = `<b>${name}</b><br/>Risk band: <b>${band}</b><br/>Probability: ${prob}`;
                } else {
                  const name = p.district_name ?? "Unknown";
                  if (exposureMetric === "population") {
                    const val = p.mean_pop_density !== undefined ? `${Number(p.mean_pop_density).toFixed(0)} /km²` : "N/A";
                    label = `<b>${name}</b><br/>Pop density: ${val}`;
                  } else {
                    const val = p.movement_intensity_proxy !== undefined ? Number(p.movement_intensity_proxy).toFixed(3) : "N/A";
                    label = `<b>${name}</b><br/>Movement proxy: ${val}`;
                  }
                }
                leafletLayer.bindTooltip(label, { sticky: true });
              }}
              style={(feature) => {
                if (viewMode === "realtime") {
                  const riskCat = (feature?.properties?.risk_category ?? "minimal") as RiskCategory;
                  return {
                    color: "#1f2937",
                    weight: 1.4,
                    fillColor: riskColors[riskCat] ?? "#86efac",
                    fillOpacity: 0.75,
                  };
                }
                if (viewMode === "exposure") {
                  const p = feature?.properties ?? {};
                  const value =
                    exposureMetric === "population"
                      ? Number(p.mean_pop_density ?? 0)
                      : Number(p.movement_intensity_proxy ?? 0);
                  return {
                    color: "#1f2937",
                    weight: 1.4,
                    fillColor: exposureColor(value, exposureMetric),
                    fillOpacity: 0.7,
                  };
                }
                const category = (viewMode === "historical"
                  ? feature?.properties?.intensity_category ?? "none"
                  : feature?.properties?.risk_band ?? "low") as string;
                if (viewMode === "historical" && historicalMetric === "tmax") {
                  const t = Number(feature?.properties?.tmax_c ?? 0);
                  const c =
                    t >= 40 ? "#7f1d1d" :
                    t >= 38 ? "#b45309" :
                    t >= 36 ? "#ea580c" :
                    t >= 34 ? "#f59e0b" : "#fde68a";
                  return {
                    color: "#334155",
                    weight: 1.4,
                    fillColor: c,
                    fillOpacity: 0.75,
                  };
                }
                return {
                  color: "#334155",
                  weight: 1.4,
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
        </MapContainer>
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem", alignItems: "center", fontSize: "0.82rem", color: "#374151" }}>
        <span style={{ fontWeight: 600 }}>Legend:</span>
        {viewMode === "historical" && historicalMetric === "intensity" &&
          (["none", "watch", "high", "extreme"] as Intensity[]).map((cat) => (
            <span key={cat} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ width: 14, height: 14, background: fillByCategory[cat], border: "1px solid #9ca3af", borderRadius: 2, display: "inline-block" }} />
              {cat}
            </span>
          ))}
        {viewMode === "historical" && historicalMetric === "tmax" &&
          ([["<34°C", "#fde68a"], ["34–36°C", "#f59e0b"], ["36–38°C", "#ea580c"], ["38–40°C", "#b45309"], [">40°C", "#7f1d1d"]] as [string, string][]).map(([l, c]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ width: 14, height: 14, background: c, border: "1px solid #9ca3af", borderRadius: 2, display: "inline-block" }} />
              {l}
            </span>
          ))}
        {viewMode === "forecast" &&
          (["low", "watch", "high", "extreme"] as ForecastBand[]).map((b) => {
            const color = b === "low" ? "#94a3b8" : b === "watch" ? "#fde68a" : b === "high" ? "#fb923c" : "#dc2626";
            return (
              <span key={b} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span style={{ width: 14, height: 14, background: color, border: "1px solid #9ca3af", borderRadius: 2, display: "inline-block" }} />
                {b}
              </span>
            );
          })}
        {viewMode === "exposure" && exposureMetric === "population" &&
          ([["<700", "#fef3c7"], ["700–1.5k", "#f59e0b"], ["1.5k–3k", "#ea580c"], ["3k–5k", "#b45309"], [">5k /km²", "#7f1d1d"]] as [string, string][]).map(([l, c]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ width: 14, height: 14, background: c, border: "1px solid #9ca3af", borderRadius: 2, display: "inline-block" }} />
              {l}
            </span>
          ))}
        {viewMode === "exposure" && exposureMetric === "mobility" &&
          ([["<0.2", "#dcfce7"], ["0.2–0.4", "#4ade80"], ["0.4–0.6", "#16a34a"], ["0.6–0.8", "#166534"], [">0.8", "#14532d"]] as [string, string][]).map(([l, c]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ width: 14, height: 14, background: c, border: "1px solid #9ca3af", borderRadius: 2, display: "inline-block" }} />
              {l}
            </span>
          ))}
        {viewMode === "realtime" &&
          (["minimal", "low", "moderate", "high", "extreme"] as RiskCategory[]).map((cat) => (
            <span key={cat} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span style={{ width: 14, height: 14, background: riskColors[cat], border: "1px solid #9ca3af", borderRadius: 2, display: "inline-block" }} />
              {cat}
            </span>
          ))}
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginLeft: "0.5rem" }}>
          <span style={{ width: 20, height: 0, borderTop: "2.5px solid #0f172a", display: "inline-block" }} />
          District
        </span>
        <span style={{ marginLeft: "0.5rem", color: "#6b7280" }}>· Hover for details</span>
      </div>
      {viewMode === "historical" && tmaxStats && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.88rem", color: "#374151" }}>
          <strong>{selectedDate}</strong> · Min Tmax: {tmaxStats.min.toFixed(1)}°C · Avg Tmax: {tmaxStats.avg.toFixed(1)}°C · Max Tmax: {tmaxStats.max.toFixed(1)}°C
        </div>
      )}

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

      {/* Electrolyte Risk Summary Panel */}
      {viewMode === "realtime" && electrolyteSummary && (
        <div style={{
          marginTop: "1rem",
          padding: "1rem",
          background: "linear-gradient(135deg, #fef2f2 0%, #fff7ed 100%)",
          borderRadius: "0.75rem",
          border: "1px solid #fecaca",
        }}>
          <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "1.1rem", color: "#7f1d1d" }}>
            ⚡ Electrolyte Risk Summary — {electrolyteSummary.as_of_date}
          </h3>
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 600, textTransform: "uppercase" }}>Districts at Risk</div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
                {electrolyteSummary.risk_distribution?.extreme > 0 && (
                  <span style={{ background: "#7f1d1d", color: "#fff", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem" }}>
                    {electrolyteSummary.risk_distribution.extreme} Extreme
                  </span>
                )}
                {electrolyteSummary.risk_distribution?.high > 0 && (
                  <span style={{ background: "#dc2626", color: "#fff", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem" }}>
                    {electrolyteSummary.risk_distribution.high} High
                  </span>
                )}
                {electrolyteSummary.risk_distribution?.moderate > 0 && (
                  <span style={{ background: "#f97316", color: "#fff", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem" }}>
                    {electrolyteSummary.risk_distribution.moderate} Moderate
                  </span>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 600, textTransform: "uppercase" }}>Avg Hydration Need</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
                💧 {electrolyteSummary.estimated_water_liters_per_person?.toFixed(1)}L water
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 600, textTransform: "uppercase" }}>Electrolyte Packs</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
                ⚡ {electrolyteSummary.estimated_electrolyte_packs_per_person?.toFixed(1)} packs/person
              </div>
            </div>
          </div>
          {electrolyteSummary.top_risk_districts?.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.3rem" }}>
                Top Risk Districts
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {electrolyteSummary.top_risk_districts.slice(0, 5).map((d: any, i: number) => (
                  <span key={i} style={{
                    background: riskColors[d.risk_category as RiskCategory] ?? "#888",
                    color: "#fff",
                    padding: "0.25rem 0.6rem",
                    borderRadius: "999px",
                    fontSize: "0.8rem",
                  }}>
                    {d.district}: {d.tmax_c?.toFixed(1)}°C ({d.risk_category})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
