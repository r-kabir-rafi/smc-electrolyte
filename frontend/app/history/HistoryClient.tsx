"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import styles from "./history.module.css";

// Basic district information
type DistrictPoint = { id: string; label: string; lat: number; lon: number };

// Data format for daily and monthly
type WeatherRow = {
  time: string;
  tempMean: number;
  tempMax: number;
  humMean: number;
  dewMean: number;
  appTempMax: number;
  windMax: number;
};

// Extracted from bd_districts.geojson
function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function collectCoordinates(node: unknown, out: Array<{ lat: number; lon: number }>) {
  if (isCoordinatePair(node)) {
    out.push({ lon: node[0], lat: node[1] });
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectCoordinates(child, out);
    }
  }
}

function parseDistricts(geoJsonParams: any): DistrictPoint[] {
  const points: DistrictPoint[] = [];
  const features = geoJsonParams?.features;
  if (!Array.isArray(features)) return points;

  const seen = new Set<string>();
  features.forEach((feature) => {
    const coords: Array<{ lat: number; lon: number }> = [];
    collectCoordinates(feature.geometry?.coordinates, coords);
    if (coords.length === 0) return;

    let latSum = 0, lonSum = 0;
    for (const coord of coords) {
      latSum += coord.lat;
      lonSum += coord.lon;
    }
    const lat = latSum / coords.length;
    const lon = lonSum / coords.length;
    
    const label = feature.properties?.NAME_2 || feature.properties?.district || "Unknown";
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
    if (!seen.has(id)) {
      seen.add(id);
      points.push({ id, label, lat, lon });
    }
  });

  return points.sort((a, b) => a.label.localeCompare(b.label));
}

// Fetch historical data
async function fetchOpenMeteoHistory(lat: number, lon: number) {
  const start = "2010-01-01";
  const end = new Date().toISOString().slice(0, 10); // Today

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: start,
    end_date: end,
    daily: "temperature_2m_mean,temperature_2m_max,relative_humidity_2m_mean,dew_point_2m_mean,apparent_temperature_max,wind_speed_10m_max",
    timezone: "auto",
  });

  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params.toString()}`);
  if (!res.ok) throw new Error(`Open-Meteo API Failed (${res.status})`);
  return res.json();
}

function processWeatherData(raw: any) {
  const daily: WeatherRow[] = [];
  const monthlyMap = new Map<string, { time: string; sumT: number; maxT: number; sumH: number; sumDew: number; maxAppT: number; maxWind: number; count: number }>();

  const times = raw?.daily?.time || [];
  const tMeans = raw?.daily?.temperature_2m_mean || [];
  const tMaxs = raw?.daily?.temperature_2m_max || [];
  const hMeans = raw?.daily?.relative_humidity_2m_mean || [];
  const dMeans = raw?.daily?.dew_point_2m_mean || [];
  const aTMaxs = raw?.daily?.apparent_temperature_max || [];
  const wMaxs = raw?.daily?.wind_speed_10m_max || [];

  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    const tempMean = tMeans[i] ?? 0;
    const tempMax = tMaxs[i] ?? 0;
    const humMean = hMeans[i] ?? 0;
    const dewMean = dMeans[i] ?? 0;
    const appTempMax = aTMaxs[i] ?? 0;
    const windMax = wMaxs[i] ?? 0;

    daily.push({ time, tempMean, tempMax, humMean, dewMean, appTempMax, windMax });

    const monthKey = time.substring(0, 7); // YYYY-MM
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { time: monthKey, sumT: 0, maxT: -Infinity, sumH: 0, sumDew: 0, maxAppT: -Infinity, maxWind: -Infinity, count: 0 });
    }
    const m = monthlyMap.get(monthKey)!;
    m.sumT += tempMean;
    if (tempMax > m.maxT) m.maxT = tempMax;
    m.sumH += humMean;
    m.sumDew += dewMean;
    if (appTempMax > m.maxAppT) m.maxAppT = appTempMax;
    if (windMax > m.maxWind) m.maxWind = windMax;
    m.count += 1;
  }

  const monthly: WeatherRow[] = Array.from(monthlyMap.values()).map((m) => ({
    time: m.time,
    tempMean: m.sumT / m.count,
    tempMax: m.maxT,
    humMean: m.sumH / m.count,
    dewMean: m.sumDew / m.count,
    appTempMax: m.maxAppT,
    windMax: m.maxWind,
  }));

  return { daily, monthly };
}

function IndicatorRow({ label, value, unit, limit, condition, desc }: any) {
  const isTriggered = condition === ">" ? value > limit : value < limit;
  const color = isTriggered ? "#ef4444" : "#10b981"; // red if triggered, green if safe
  
  return (
    <div className={styles.indicatorRow}>
      <div className={styles.indicatorContext}>
        <span className={styles.indicatorLabel}>{label}</span>
        <span className={styles.indicatorDesc}>{desc}</span>
      </div>
      <div className={styles.indicatorStatus}>
        <span className={styles.indicatorValue}>{value?.toFixed(1) ?? "-"} {unit}</span>
        <span className={styles.statusDot} style={{ background: color }}></span>
      </div>
    </div>
  );
}

export default function HistoryClient() {
  const [districts, setDistricts] = useState<DistrictPoint[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>("");
  const [dataMode, setDataMode] = useState<"daily" | "monthly">("monthly");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Cache of fetched data per district
  const [cache, setCache] = useState<Record<string, { daily: WeatherRow[]; monthly: WeatherRow[] }>>({});
  
  // Timeline controls
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initial load: parse geojson to get districts
  useEffect(() => {
    async function initDistricts() {
      try {
        const res = await fetch("/data/bd_districts.geojson", { cache: "force-cache" });
        if (!res.ok) throw new Error("Could not load district geometry");
        const geodata = await res.json();
        const dList = parseDistricts(geodata);
        setDistricts(dList);
        if (dList.length > 0) {
          // Default to Dhaka if present
          const dhaka = dList.find(d => d.label.toLowerCase() === "dhaka");
          setSelectedDistrictId(dhaka ? dhaka.id : dList[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse districts.");
      } finally {
        setLoading(false);
      }
    }
    initDistricts();
  }, []);

  // Fetch weather when district changes
  useEffect(() => {
    if (!selectedDistrictId) return;

    if (cache[selectedDistrictId]) {
      // Already cached
      setCurrentIndex(0);
      return;
    }

    const dist = districts.find(d => d.id === selectedDistrictId);
    if (!dist) return;

    let cancelled = false;
    setLoading(true);
    
    async function fetchWeather() {
      try {
        const raw = await fetchOpenMeteoHistory(dist!.lat, dist!.lon);
        if (cancelled) return;
        
        const processed = processWeatherData(raw);
        setCache(prev => ({ ...prev, [selectedDistrictId]: processed }));
        setCurrentIndex(0);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load weather history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, [selectedDistrictId, districts, cache]);

  const activeDataList = useMemo(() => {
    const dCache = cache[selectedDistrictId];
    if (!dCache) return [];
    return dataMode === "daily" ? dCache.daily : dCache.monthly;
  }, [cache, selectedDistrictId, dataMode]);

  // Handle Play/Pause timer
  useEffect(() => {
    if (isPlaying && activeDataList.length > 0) {
      const speedMs = dataMode === "monthly" ? 150 : 30; // 150ms per month, 30ms per day
      const step = dataMode === "monthly" ? 1 : Math.max(1, Math.floor(activeDataList.length / 500)); // Advance days faster

      playIntervalRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev + step >= activeDataList.length - 1) {
            setIsPlaying(false);
            return activeDataList.length - 1;
          }
          return prev + step;
        });
      }, speedMs);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, activeDataList, dataMode]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentIndex(Number(e.target.value));
  };

  const togglePlay = () => {
    if (!isPlaying && currentIndex >= activeDataList.length - 1) {
      setCurrentIndex(0); // restart if at the end
    }
    setIsPlaying(!isPlaying);
  };

  const currentSnapshot = activeDataList[currentIndex];

  if (activeDataList.length === 0 && !loading && !error) {
    return <div className={styles.placeholder}>Waiting for data...</div>;
  }

  return (
    <div className={styles.dashboard}>
      {/* Sidebar: Controls & Live Summaries */}
      <aside className={styles.sidebar}>
        
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Configuration</h2>
          {error && <div className={styles.error}>{error}</div>}
          
          <label className={styles.label} htmlFor="districtSelect">District</label>
          <select 
            id="districtSelect"
            className={styles.select}
            value={selectedDistrictId}
            onChange={(e) => {
              setIsPlaying(false);
              setSelectedDistrictId(e.target.value);
            }}
            disabled={loading}
          >
            {districts.map(d => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>

          <div style={{ marginTop: '1.25rem' }}>
            <span className={styles.label}>Aggregation</span>
            <div className={styles.toggleGroup}>
              <button
                className={`${styles.toggleBtn} ${dataMode === "daily" ? styles.toggleBtnActive : ""}`}
                onClick={() => { setIsPlaying(false); setDataMode("daily"); setCurrentIndex(0); }}
                disabled={loading}
              >
                Daily
              </button>
              <button
                className={`${styles.toggleBtn} ${dataMode === "monthly" ? styles.toggleBtnActive : ""}`}
                onClick={() => { setIsPlaying(false); setDataMode("monthly"); setCurrentIndex(0); }}
                disabled={loading}
              >
                Monthly
              </button>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Risk Indicators</h2>
          {loading && !currentSnapshot ? (
            <div style={{ color: "var(--text-muted)" }}>Loading metrics...</div>
          ) : currentSnapshot ? (
            <div className={styles.metricGrid}>
              <div className={styles.metricDate}>
                {dataMode === "monthly" 
                  ? new Date(currentSnapshot.time + "-01").toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : new Date(currentSnapshot.time).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              
              <IndicatorRow 
                label="Max Temperature" 
                value={currentSnapshot.tempMax} 
                unit="°C" 
                limit={29.4} 
                condition=">" 
                desc="> 85°F" 
              />
              <IndicatorRow 
                label="Feels Like" 
                value={currentSnapshot.appTempMax} 
                unit="°C" 
                limit={32.2} 
                condition=">" 
                desc="> 90°F" 
              />
              <IndicatorRow 
                label="Dew Point" 
                value={currentSnapshot.dewMean} 
                unit="°C" 
                limit={18.3} 
                condition=">" 
                desc="> 65°F" 
              />
              <IndicatorRow 
                label="Low Wind" 
                value={currentSnapshot.windMax} 
                unit="km/h" 
                limit={11.3} 
                condition="<" 
                desc="< 7 mph" 
              />
              <div className={styles.indicatorRow}>
                <div className={styles.indicatorContext}>
                  <span className={styles.indicatorLabel}>UV Index</span>
                  <span className={styles.indicatorDesc}>7+</span>
                </div>
                <div className={styles.indicatorStatus}>
                  <span className={styles.indicatorValue}>N/A</span>
                  <span className={styles.statusDot} style={{ background: '#94a3b8' }}></span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

      </aside>

      {/* Main Area: Timeline & Charts */}
      <section className={styles.mainArea}>
        
        {/* Timeline Tool */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Timeline Control</h2>
          <div className={styles.timeControlPanel}>
            <button className={styles.playButton} onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? (
                // Pause Icon
                <svg className={styles.playIcon} viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                // Play Icon
                <svg className={styles.playIcon} viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <div className={styles.sliderWrap}>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={Math.max(0, activeDataList.length - 1)}
                value={currentIndex}
                onChange={handleSliderChange}
                disabled={activeDataList.length === 0}
              />
              <div className={styles.sliderDates}>
                <span>2010-01</span>
                <span>Today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Temperature History</h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeDataList} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} minTickGap={50} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ fontSize: 14 }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="tempMax" name="Max Temp (°C)" stroke="#f87171" strokeWidth={1} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="tempMean" name="Mean Temp (°C)" stroke="#fbbf24" strokeWidth={1} dot={false} isAnimationActive={false} />
                {currentSnapshot && (
                  <ReferenceLine x={currentSnapshot.time} stroke="var(--text-active)" strokeWidth={2} strokeDasharray="3 3" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Humidity History</h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeDataList} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} minTickGap={50} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ fontSize: 14 }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="humMean" name="Mean Humidity (%)" stroke="#60a5fa" strokeWidth={1} dot={false} isAnimationActive={false} />
                {currentSnapshot && (
                  <ReferenceLine x={currentSnapshot.time} stroke="var(--text-active)" strokeWidth={2} strokeDasharray="3 3" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Dew Point History</h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeDataList} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} minTickGap={50} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ fontSize: 14 }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="dewMean" name="Dew Point (°C)" stroke="#a78bfa" strokeWidth={1} dot={false} isAnimationActive={false} />
                {currentSnapshot && (
                  <ReferenceLine x={currentSnapshot.time} stroke="var(--text-active)" strokeWidth={2} strokeDasharray="3 3" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Apparent Temp (Feels Like) History</h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeDataList} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} minTickGap={50} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ fontSize: 14 }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="appTempMax" name="Max Apparent Temp (°C)" stroke="#f43f5e" strokeWidth={1} dot={false} isAnimationActive={false} />
                {currentSnapshot && (
                  <ReferenceLine x={currentSnapshot.time} stroke="var(--text-active)" strokeWidth={2} strokeDasharray="3 3" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Wind Speed History</h2>
          <div className={styles.chartContainer}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeDataList} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} minTickGap={50} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{fill: 'rgba(255,255,255,0.5)', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ fontSize: 14 }}
                  labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="windMax" name="Max Wind Speed (km/h)" stroke="#2dd4bf" strokeWidth={1} dot={false} isAnimationActive={false} />
                {currentSnapshot && (
                  <ReferenceLine x={currentSnapshot.time} stroke="var(--text-active)" strokeWidth={2} strokeDasharray="3 3" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </section>
    </div>
  );
}
