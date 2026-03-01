import { useEffect, useRef, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { FeatureCollection, Geometry, Feature } from "geojson";
import styles from "../app/history/history.module.css";

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

type MapProps = {
  currentDate: string;   // YYYY-MM-DD
  activeMode: "temperature" | "humidity" | "wind";
};

export default function HistoryMap({ currentDate, activeMode }: MapProps) {
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [metricData, setMetricData] = useState<Record<string, any>>({});
  const mapRef = useRef<any>(null);

  // Load standard geojson boundaries
  useEffect(() => {
    fetch("/data/bd_districts.geojson")
      .then(res => res.json())
      .then(data => setGeoData(data))
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
