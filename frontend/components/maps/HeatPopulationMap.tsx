"use client";

import DeckGL from "@deck.gl/react";
import { ColumnLayer, GeoJsonLayer } from "@deck.gl/layers";
import { useMemo, useState } from "react";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";

import type { DistrictWithHeat } from "../../lib/populationMapData";
import { Button } from "../ui/Button";
import styles from "./population-map.module.css";

const INITIAL_VIEW_STATE = {
  longitude: 90.4,
  latitude: 23.7,
  zoom: 6.2,
  pitch: 46,
  bearing: 0,
  minZoom: 5.2,
  maxZoom: 12,
};

const MAP_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
  },
  layers: [{ id: "carto-base", type: "raster", source: "carto" }],
} as const;

function blendHeatDensityColor(
  densityNormalized: number,
  heatTier: number
): [number, number, number, number] {
  const tierColors: Record<number, [number, number, number]> = {
    0: [92, 141, 255],
    1: [73, 176, 123],
    2: [212, 176, 82],
    3: [214, 138, 70],
    4: [214, 108, 105],
  };
  const base = tierColors[heatTier] ?? tierColors[2];
  return [...base, Math.round(130 + densityNormalized * 120)] as [number, number, number, number];
}

function choroplethColor(heatTier: number): [number, number, number, number] {
  const tiers: Record<number, [number, number, number, number]> = {
    0: [92, 141, 255, 92],
    1: [73, 176, 123, 96],
    2: [212, 176, 82, 110],
    3: [214, 138, 70, 122],
    4: [214, 108, 105, 136],
  };
  return tiers[heatTier] ?? [163, 170, 182, 88];
}

type HoverState = {
  district: DistrictWithHeat;
  x: number;
  y: number;
} | null;

export function HeatPopulationMap({
  data,
  geojson,
  selectedPcode,
  onDistrictClick,
}: {
  data: DistrictWithHeat[];
  geojson: GeoJSON.FeatureCollection;
  selectedPcode?: string;
  onDistrictClick?: (district: DistrictWithHeat) => void;
}) {
  const [hoverState, setHoverState] = useState<HoverState>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

  const heatByPcode = useMemo(() => {
    const mapped = new globalThis.Map<string, DistrictWithHeat>();
    data.forEach((district) => mapped.set(district.pcode, district));
    return mapped;
  }, [data]);

  const layers = useMemo(
    () => [
      new GeoJsonLayer({
        id: "heat-population-base",
        data: geojson,
        stroked: true,
        filled: true,
        pickable: false,
        getFillColor: (feature: any) => {
          const pcode = String(
            feature.properties?.pcode ??
              feature.properties?.ADM2_PCODE ??
              feature.properties?.adm2_pcode ??
              ""
          );
          const match = heatByPcode.get(pcode);
          return choroplethColor(match?.heat_tier ?? 0);
        },
        getLineColor: (feature: any) => {
          const pcode = String(feature.properties?.pcode ?? feature.properties?.ADM2_PCODE ?? "");
          return pcode === selectedPcode ? [255, 255, 255, 100] : [57, 73, 98, 70];
        },
        lineWidthMinPixels: 0.8,
        updateTriggers: {
          getFillColor: [data],
          getLineColor: [selectedPcode],
        },
      }),
      new ColumnLayer<DistrictWithHeat>({
        id: "heat-population-columns",
        data,
        radius: 7400,
        diskResolution: 12,
        extruded: true,
        pickable: true,
        material: {
          ambient: 0.48,
          diffuse: 0.74,
          shininess: 18,
          specularColor: [255, 255, 255],
        },
        getPosition: (district) => [district.longitude, district.latitude],
        getElevation: (district) => district.density_normalized * 98000,
        getFillColor: (district) => blendHeatDensityColor(district.density_normalized, district.heat_tier),
        getLineColor: (district) =>
          district.pcode === selectedPcode ? [255, 255, 255, 130] : [255, 255, 255, 35],
        lineWidthMinPixels: 0.6,
        onHover: (info) => {
          if (!info.object) {
            setHoverState(null);
            return;
          }
          setHoverState({ district: info.object, x: info.x, y: info.y });
        },
        onClick: (info) => {
          if (info.object) onDistrictClick?.(info.object);
        },
        updateTriggers: {
          getFillColor: [data],
          getLineColor: [selectedPcode],
          getElevation: [data],
        },
      }),
    ],
    [data, geojson, heatByPcode, onDistrictClick, selectedPcode]
  );

  return (
    <div className={styles.mapShell}>
      <DeckGL
        controller={{ dragRotate: true, touchRotate: true }}
        layers={layers}
        viewState={viewState}
        onViewStateChange={(event) => setViewState(event.viewState as typeof INITIAL_VIEW_STATE)}
        style={{ position: "absolute", top: "0", right: "0", bottom: "0", left: "0" }}
      >
        <Map mapLib={maplibregl} mapStyle={MAP_STYLE as never} reuseMaps attributionControl={false} />
      </DeckGL>

      <div className={styles.controlStack}>
        <span className={styles.overlayPill}>Choropleth = heat tier</span>
        <Button type="button" variant="secondary" onClick={() => setViewState(INITIAL_VIEW_STATE)}>
          Reset View
        </Button>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendTitle}>Heat × Population</div>
        <div className={styles.legendList}>
          {[
            { label: "Tier 0 · Minimal", color: "var(--tier-0)" },
            { label: "Tier 1 · Low", color: "var(--tier-1)" },
            { label: "Tier 2 · Moderate", color: "var(--tier-2)" },
            { label: "Tier 3 · High", color: "var(--tier-3)" },
            { label: "Tier 4 · Extreme", color: "var(--tier-4)" },
          ].map((item) => (
            <div key={item.label} className={styles.legendItem}>
              <span className={styles.legendItemName} style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
                <span
                  style={{
                    width: "0.75rem",
                    height: "0.75rem",
                    borderRadius: "0.2rem",
                    background: item.color,
                  }}
                />
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {hoverState ? (
        <div
          className={styles.tooltip}
          style={{ left: `${hoverState.x + 12}px`, top: `${hoverState.y - 124}px` }}
        >
          <div className={styles.tooltipTitle}>{hoverState.district.district}</div>
          <div className={styles.tooltipRows}>
            <TooltipRow label="Heat tier" value={`T${hoverState.district.heat_tier}`} mono />
            <TooltipRow label="HI p50" value={`${hoverState.district.heat_index_p50.toFixed(1)} °C`} mono />
            <TooltipRow label="HI anomaly" value={`${hoverState.district.anom_hi >= 0 ? "+" : ""}${hoverState.district.anom_hi.toFixed(1)} °C`} mono />
            <TooltipRow label="Density" value={`${hoverState.district.density.toLocaleString()} /km²`} mono />
            <TooltipRow label="Population" value={hoverState.district.population.toLocaleString()} mono />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TooltipRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={styles.tooltipRow}>
      <span className={styles.tooltipLabel}>{label}</span>
      <span className={`${styles.tooltipValue} ${mono ? styles.mono : ""}`.trim()}>{value}</span>
    </div>
  );
}
