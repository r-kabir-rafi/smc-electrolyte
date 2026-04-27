"use client";

import DeckGL from "@deck.gl/react";
import { ColumnLayer, GeoJsonLayer } from "@deck.gl/layers";
import { useMemo, useState } from "react";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";

import {
  buildGeoJsonForDeck,
  type DistrictSpikeData,
} from "../../lib/populationMapData";
import { Button } from "../ui/Button";
import styles from "./population-map.module.css";

const INITIAL_VIEW_STATE = {
  longitude: 90.3563,
  latitude: 23.685,
  zoom: 6.35,
  pitch: 50,
  bearing: -12,
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

function densityFillColor(score: number, highlighted: boolean): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, score));
  const low: [number, number, number] = [101, 163, 255];
  const mid: [number, number, number] = [159, 116, 255];
  const high: [number, number, number] = [235, 79, 154];

  const mix = (start: number, end: number, t: number) => Math.round(start + (end - start) * t);
  const base =
    clamped < 0.55
      ? [
          mix(low[0], mid[0], clamped / 0.55),
          mix(low[1], mid[1], clamped / 0.55),
          mix(low[2], mid[2], clamped / 0.55),
        ]
      : [
          mix(mid[0], high[0], (clamped - 0.55) / 0.45),
          mix(mid[1], high[1], (clamped - 0.55) / 0.45),
          mix(mid[2], high[2], (clamped - 0.55) / 0.45),
        ];

  return [base[0], base[1], base[2], highlighted ? 255 : 214];
}

function densityChoroplethColor(score: number): [number, number, number, number] {
  const clamped = Math.max(0, Math.min(1, score));
  return densityFillColor(clamped, false).slice(0, 4).map((value, index) => (index === 3 ? Math.round(58 + clamped * 58) : value)) as [number, number, number, number];
}

type HoverState = {
  district: DistrictSpikeData;
  x: number;
  y: number;
} | null;

export function PopulationSpikeMap({
  data,
  elevationScale = 1,
  selectedPcode,
  onDistrictClick,
}: {
  data: DistrictSpikeData[];
  elevationScale?: number;
  selectedPcode?: string;
  onDistrictClick?: (district: DistrictSpikeData) => void;
}) {
  const [hoverState, setHoverState] = useState<HoverState>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

  const districtGeoJson = useMemo(() => buildGeoJsonForDeck(data), [data]);
  const densityByPcode = useMemo(
    () => new globalThis.Map<string, DistrictSpikeData>(data.map((district) => [district.pcode, district])),
    [data]
  );

  const layers = useMemo(
    () => [
      new GeoJsonLayer({
        id: "population-density-base",
        data: districtGeoJson,
        filled: true,
        stroked: true,
        pickable: false,
        getFillColor: (feature: any) => {
          const pcode = String(
            feature.properties?.pcode ??
              feature.properties?.ADM2_PCODE ??
              feature.properties?.adm2_pcode ??
              ""
          );
          const match = densityByPcode.get(pcode);
          return densityChoroplethColor(match?.density_visual_score ?? 0);
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
      new ColumnLayer<DistrictSpikeData>({
        id: "population-density-columns",
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
        getElevation: (district) => district.density_visual_score * 98000 * elevationScale,
        getFillColor: (district) => densityFillColor(district.density_visual_score, district.pcode === selectedPcode),
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
          getFillColor: [data, selectedPcode],
          getLineColor: [selectedPcode],
          getElevation: [data, elevationScale],
        },
      }),
    ],
    [data, densityByPcode, districtGeoJson, elevationScale, onDistrictClick, selectedPcode]
  );

  const densestDistricts = useMemo(
    () => [...data].sort((a, b) => b.density - a.density).slice(0, 5),
    [data]
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
        <span className={styles.overlayPill}>Columns = district density</span>
        <Button type="button" variant="secondary" onClick={() => setViewState(INITIAL_VIEW_STATE)}>
          Reset View
        </Button>
      </div>

      <div className={styles.legend}>
        <div className={styles.legendTitle}>Population Density</div>
        <div
          className={styles.legendGradient}
          style={{ background: "linear-gradient(to right, #5552eb, #8f63ff, #ef4f9a, #b40f38)" }}
        />
        <div className={styles.legendLabels}>
          <span>Low</span>
          <span>High</span>
        </div>
        <div className={styles.legendTitle}>Top 5 densest</div>
        <div className={styles.legendList}>
          {densestDistricts.map((district) => (
            <div key={district.pcode} className={styles.legendItem}>
              <span className={styles.legendItemName}>{district.district}</span>
              <span className={styles.legendItemValue}>{district.density.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {hoverState ? (
        <div
          className={styles.tooltip}
          style={{ left: `${hoverState.x + 12}px`, top: `${hoverState.y - 104}px` }}
        >
          <div className={styles.tooltipTitle}>{hoverState.district.district}</div>
          <div className={styles.tooltipMeta}>{hoverState.district.division} Division</div>
          <div className={styles.tooltipRows}>
            <TooltipRow label="Population" value={hoverState.district.population.toLocaleString()} />
            <TooltipRow label="Area" value={`${hoverState.district.area_km2.toLocaleString()} km²`} />
            <TooltipRow
              label="Density"
              value={`${hoverState.district.density.toLocaleString()} /km²`}
              mono
            />
            <TooltipRow
              label="Visual balance"
              value={`${Math.round(hoverState.district.density_visual_score * 100)} / 100`}
              mono
            />
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
