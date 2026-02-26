"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import styles from "./home.module.css";

type DistrictFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: string;
    properties?: Record<string, string>;
    geometry: unknown;
  }>;
};

function districtName(properties?: Record<string, string>): string {
  return (
    properties?.NAME_2 ||
    properties?.district ||
    properties?.name ||
    "Unknown District"
  );
}

function FitToDistrictBounds({ bounds }: { bounds?: L.LatLngBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds.pad(0.05));
  }, [map, bounds]);

  return null;
}

export default function HomeMapClient() {
  const [districts, setDistricts] = useState<DistrictFeatureCollection | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("None selected");
  const [error, setError] = useState<string>("");

  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/data/bd_districts.geojson", { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`Failed to load district boundaries (${response.status})`);
        }
        const data = (await response.json()) as DistrictFeatureCollection;
        setDistricts(data);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load map data.");
      }
    };

    load().catch(() => {
      setError("Failed to load map data.");
    });
  }, []);

  const mapBounds = useMemo(() => {
    if (!districts) return undefined;
    const layer = L.geoJSON(districts as any);
    const bounds = layer.getBounds();
    return bounds.isValid() ? bounds : undefined;
  }, [districts]);

  const defaultStyle = useMemo(
    () => ({
      color: "#1e40af",
      weight: 1,
      fillColor: "#93c5fd",
      fillOpacity: 0.35,
    }),
    []
  );

  const onEachFeature = (feature: { properties?: Record<string, string> }, layer: L.Layer) => {
    const name = districtName(feature.properties);
    layer.bindTooltip(name, { sticky: true });

    layer.on({
      mouseover: (event) => {
        const target = event.target as L.Path;
        target.setStyle({
          weight: 2,
          color: "#0f172a",
          fillOpacity: 0.55,
        });
      },
      mouseout: (event) => {
        geoJsonRef.current?.resetStyle(event.target);
      },
      click: () => {
        setSelectedDistrict(name);
      },
    });
  };

  return (
    <section>
      <div className={styles.mapShell}>
        <div className={styles.mapContainer}>
          <MapContainer
            center={[23.7, 90.4]}
            zoom={7}
            style={{ height: "100%", width: "100%" }}
            bounds={mapBounds}
          >
            <FitToDistrictBounds bounds={mapBounds} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {districts && (
              <GeoJSON
                data={districts as any}
                style={defaultStyle}
                onEachFeature={onEachFeature}
                ref={(value) => {
                  geoJsonRef.current = (value as L.GeoJSON | null) ?? null;
                }}
              />
            )}
          </MapContainer>
        </div>

        <aside className={styles.sidePanel}>
          <h2 className={styles.sideTitle}>Selected District</h2>
          <p className={styles.sideText}>{selectedDistrict}</p>
          <p className={styles.sideText} style={{ marginTop: "0.75rem", color: "#475569" }}>
            Hover polygons to see district tooltips.
          </p>
        </aside>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
