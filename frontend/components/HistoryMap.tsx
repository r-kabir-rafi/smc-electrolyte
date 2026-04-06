import { useEffect, useRef, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, Geometry, Feature } from "geojson";
import styles from "../app/history/history.module.css";
import type { IncidentRecord } from "../lib/data";

const DISTRICT_ALIAS: Record<string, string> = {
  barisal: "barishal",
  bogra: "bogura",
  chapainawabganj: "nawabganj",
  chittagong: "chattogram",
  comilla: "cumilla",
  jessore: "jashore",
};

// Helper color scale: from Blue (cool) -> Yellow (warm) -> Red (hot)
function getTemperatureColor(temp: number) {
  if (temp < 15) return "#3b82f6"; // Blue
  if (temp < 25) return "#10b981"; // Green
  if (temp < 30) return "#fbbf24"; // Yellow
  if (temp < 35) return "#f97316"; // Orange
  return "#ef4444"; // Red
}

function getHumidityColor(hum: number) {
  if (hum < 30) return "#fef08a"; // Dry/Yellow
  if (hum < 50) return "#93c5fd"; // Comfort
  if (hum < 70) return "#3b82f6"; // Humid
  if (hum < 85) return "#6366f1"; // Very Humid
  return "#4c1d95"; // Extreme
}

function getWindColor(wind: number) {
  if (wind < 5) return "#10b981"; // Calm/Green
  if (wind < 15) return "#fbbf24"; // Breezy/Yellow
  if (wind < 25) return "#f97316"; // Windy/Orange
  return "#ef4444"; // Stormy/Red
}

function canonicalDistrictName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  return DISTRICT_ALIAS[normalized] || normalized;
}

function hasCoordinates(incident: IncidentRecord): incident is IncidentRecord & { latitude: number; longitude: number } {
  return Number.isFinite(incident.latitude) && Number.isFinite(incident.longitude);
}

function jitterPoint(lat: number, lon: number, order: number) {
  if (order === 0) return { lat, lon };

  const ring = Math.floor((order - 1) / 6) + 1;
  const spoke = (order - 1) % 6;
  const angle = (spoke / 6) * Math.PI * 2;
  const distance = 0.04 * ring;

  const jLat = lat + Math.sin(angle) * distance;
  const jLon = lon + (Math.cos(angle) * distance) / Math.max(Math.cos((lat * Math.PI) / 180), 0.25);
  return { lat: jLat, lon: jLon };
}

type MapProps = {
  currentDate: string;   // YYYY-MM-DD
  activeMode: "temperature" | "humidity" | "wind";
  dataMode?: "daily" | "monthly";
  incidents?: IncidentRecord[];
};

export default function HistoryMap({ currentDate, activeMode, dataMode = "monthly", incidents = [] }: MapProps) {
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [metricData, setMetricData] = useState<Record<string, any>>({});
  const [centroids, setCentroids] = useState<Record<string, {lat: number, lon: number}>>({});
  const mapRef = useRef<any>(null);

  // Load standard geojson boundaries
  useEffect(() => {
    fetch("/data/bd_districts.geojson")
      .then(res => res.json())
      .then(data => {
        setGeoData(data);
        
        // Pre-calculate centroids for incident placing
        const cmap: Record<string, {lat: number, lon: number}> = {};
        for (const feature of data.features) {
          const rawName = feature.properties?.NAME_2 || feature.properties?.district || "";
          const id = canonicalDistrictName(rawName);
          
          let coords: any[] = [];
          const collect = (node: any) => {
             if (Array.isArray(node) && node.length >= 2 && typeof node[0] === "number") {
                coords.push({lon: node[0], lat: node[1]});
                return;
             }
             if (Array.isArray(node)) {
                for (const child of node) collect(child);
             }
          }
          if (feature.geometry?.coordinates) collect(feature.geometry.coordinates);
          
          if (coords.length > 0) {
             const lat = coords.reduce((acc, c) => acc + c.lat, 0) / coords.length;
             const lon = coords.reduce((acc, c) => acc + c.lon, 0) / coords.length;
             cmap[id] = { lat, lon };
          }
        }
        setCentroids(cmap);
      })
      .catch(console.error);
  }, []);

  // Fetch the active year's chunk of historical data explicitly needed for the active slice
  useEffect(() => {
    if (!currentDate) return;
    const year = currentDate.substring(0, 4);
    
    // We only fetch if we don't have this year's data or we changed years 
    // Usually cacheing this is better, but browser will cache the JSON fetch automatically
    fetch(`/data/history/${year}.json`)
      .then(res => {
        if (!res.ok) throw new Error("Year data not available yet");
        return res.json();
      })
      .then(data => {
        if (data[currentDate]) {
           setMetricData(data[currentDate]);
        } else {
           setMetricData({});
        }
      })
      .catch(() => setMetricData({})); // fallback to empty if data chunk isn't downlaoded yet
  }, [currentDate]);

  const activeIncidents = useMemo(() => {
    if (!incidents || incidents.length === 0 || !currentDate) return [];
    return incidents.filter(inc => {
      if (dataMode === "daily") {
         return inc.incident_date === currentDate;
      } else {
         return inc.incident_date.startsWith(currentDate.slice(0, 7));
      }
    });
  }, [incidents, currentDate, dataMode]);

  const activeIncidentMarkers = useMemo(() => {
    const counters: Record<string, number> = {};

    return activeIncidents.map((inc) => {
      const districtId = canonicalDistrictName(inc.district || "");
      const fallback = centroids[districtId] || { lat: 23.685, lon: 90.356 };
      const base = hasCoordinates(inc)
        ? { lat: inc.latitude, lon: inc.longitude }
        : fallback;

      const pointKey = `${base.lat.toFixed(5)}:${base.lon.toFixed(5)}`;
      const order = counters[pointKey] ?? 0;
      counters[pointKey] = order + 1;

      const pos = inc.location_precision === "place" ? base : jitterPoint(base.lat, base.lon, order);
      return { inc, pos };
    });
  }, [activeIncidents, centroids]);

  const styleFeature = (feature?: Feature<Geometry, any>) => {
    if (!feature) return {};
    const rawName = feature.properties?.NAME_2 || feature.properties?.district || "";
    const id = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
    
    const districtMetrics = metricData[id];
    let fillColor = "#1e293b"; // Default dark gray
    let fillOpacity = 0.4;

    if (districtMetrics) {
      fillOpacity = 0.7;
      if (activeMode === "temperature") fillColor = getTemperatureColor(districtMetrics.t);
      if (activeMode === "humidity") fillColor = getHumidityColor(districtMetrics.h);
      if (activeMode === "wind") fillColor = getWindColor(districtMetrics.w);
    }

    return {
      fillColor,
      weight: 1,
      opacity: 1,
      color: "rgba(255,255,255,0.2)",
      fillOpacity,
    };
  };

  const onEachFeature = (feature: Feature<Geometry, any>, layer: any) => {
    if (!feature) return;
    const rawName = feature.properties?.NAME_2 || feature.properties?.district || "";
    const id = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
    
    // In monthly mode, currentDate is just "YYYY-MM", but static data uses "YYYY-MM-01"
    const searchDate = dataMode === "monthly" && currentDate.length === 7 ? `${currentDate}-01` : currentDate;
    
    const metrics = metricData[id];
    
    let popupContent = `<strong>${rawName}</strong><br/>`;
    if (metrics) {
       popupContent += `Temperature: ${metrics.t}°C<br/>`;
       popupContent += `Humidity: ${metrics.h}%<br/>`;
       popupContent += `Wind: ${metrics.w} km/h`;
    } else {
       popupContent += `<span style="color:red;">Data Unavailable</span>`;
    }

    layer.bindTooltip(popupContent, {
      className: "dark-tooltip",
      sticky: true,
      direction: "top",
    });
  };

  if (!geoData) {
    return <div className={styles.mapLoading}>Loading Map Borders...</div>;
  }

  return (
    <div className={styles.mapContainer}>
      <MapContainer
        center={[23.685, 90.356]}
        zoom={6.5}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%", background: "transparent" }}
        ref={mapRef}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        <GeoJSON 
          data={geoData} 
          style={styleFeature} 
          onEachFeature={onEachFeature}
          // The key ensures GeoJSON fully re-renders its styles when metrics shift during playback
          key={`${currentDate}-${activeMode}`} 
        />
        
        {/* Render correlated incidents dynamically based on timeline */}
        {activeIncidentMarkers.map(({ inc, pos }) => {
          return (
            <CircleMarker 
              key={inc.id}
              center={[pos.lat, pos.lon]}
              radius={8}
              pathOptions={{ fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 0.9 }}
            >
              <LeafletTooltip className="dark-tooltip" direction="top">
                <strong>{inc.place}</strong><br/>
                <span style={{color: '#f87171'}}>Dead: {inc.dead}</span> | <span style={{color: '#fbbf24'}}>Sick: {inc.sick}</span><br/>
                <small style={{color: '#94a3b8'}}>{inc.incident_date}</small>
              </LeafletTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      
      {/* Visual Legend */}
      <div className={styles.mapLegend}>
        <span className={styles.legendTitle}>
          {activeMode === 'temperature' ? 'Temperature (°C)' : activeMode === 'humidity' ? 'Humidity (%)' : 'Wind (km/h)'}
        </span>
        <div className={styles.legendBar} data-mode={activeMode}></div>
        <div className={styles.legendLabels}>
          <span className={styles.legendMin}>Min</span>
          <span className={styles.legendMax}>Max</span>
        </div>
      </div>
    </div>
  );
}
