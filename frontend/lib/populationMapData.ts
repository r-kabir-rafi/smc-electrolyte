import centroid from "@turf/centroid";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

import { findNearestPointId, TEMPERATURE_POINTS, type TemperatureMap } from "../app/page-home/temperature";
import { BANGLADESH_DISTRICT_POPULATION_2022, type BangladeshDistrictPopulation2022 } from "./bangladesh_population_2022";
import { canonicalDistrictName, collectCoordinates, districtName, type DistrictFeatureCollection } from "./geo";
import { estimateTierProbability, getTierFromTemperature } from "./heat-ui";

export interface DistrictSpikeData extends BangladeshDistrictPopulation2022 {
  longitude: number;
  latitude: number;
  density_normalized: number;
  density_visual_score: number;
  feature: Feature<Geometry, GeoJsonProperties> | null;
  district_slug: string;
}

export interface PopulationSpikePoint {
  id: string;
  pcode: string;
  district: string;
  division: string;
  longitude: number;
  latitude: number;
  intensity: number;
  height_m: number;
  density: number;
  population: number;
  district_longitude: number;
  district_latitude: number;
}

export interface DistrictWithHeat extends DistrictSpikeData {
  heat_index_p50: number;
  heat_tier: number;
  anom_hi: number;
  probability_tier3: number;
}

const BANGLADESH_FALLBACK_COORDS = { longitude: 90.3563, latitude: 23.685 };
const MIN_SPIKES_PER_DISTRICT = 20;
const MAX_SPIKES_PER_DISTRICT = 110;

type BBox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

type CoordinatePair = [number, number];
type PolygonRings = CoordinatePair[][];
type PolygonSet = PolygonRings[];

function asFeature(
  value: DistrictFeatureCollection["features"][number]
): Feature<Geometry, GeoJsonProperties> {
  return value as Feature<Geometry, GeoJsonProperties>;
}

function getFeaturePcode(feature: DistrictFeatureCollection["features"][number]): string {
  const properties = feature.properties ?? {};
  return String(
    properties.ADM2_PCODE ??
      properties.adm2_pcode ??
      properties.PCODE ??
      properties.pcode ??
      properties.district_id ??
      ""
  );
}

function getFeatureCentroid(feature: DistrictFeatureCollection["features"][number]): {
  longitude: number;
  latitude: number;
} {
  try {
    const result = centroid(asFeature(feature));
    const [longitude, latitude] = result.geometry.coordinates;
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      return { longitude, latitude };
    }
  } catch {
    // Fall back to coordinate averaging below.
  }

  const coords: Array<{ lat: number; lon: number }> = [];
  collectCoordinates((feature.geometry as { coordinates?: unknown } | undefined)?.coordinates, coords);
  if (coords.length === 0) return BANGLADESH_FALLBACK_COORDS;

  return {
    longitude: coords.reduce((sum, item) => sum + item.lon, 0) / coords.length,
    latitude: coords.reduce((sum, item) => sum + item.lat, 0) / coords.length,
  };
}

function findFeature(
  geojson: DistrictFeatureCollection,
  district: BangladeshDistrictPopulation2022
): DistrictFeatureCollection["features"][number] | undefined {
  const districtKey = canonicalDistrictName(district.district);

  return geojson.features.find((feature) => {
    const featureName = canonicalDistrictName(districtName(feature.properties));
    const featurePcode = getFeaturePcode(feature);
    return featureName === districtKey || (featurePcode && featurePcode === district.pcode);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function toPolygonSet(geometry: Geometry): PolygonSet {
  if (geometry.type === "Polygon") {
    return [(geometry.coordinates as CoordinatePair[][]).map((ring) => ring.map((point) => [point[0], point[1]]))];
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as CoordinatePair[][][]).map((polygon) =>
      polygon.map((ring) => ring.map((point) => [point[0], point[1]]))
    );
  }

  return [];
}

function bboxForPolygonSet(polygons: PolygonSet): BBox | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  polygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        minLat = Math.min(minLat, lat);
        maxLon = Math.max(maxLon, lon);
        maxLat = Math.max(maxLat, lat);
      });
    });
  });

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) {
    return null;
  }

  return { minLon, minLat, maxLon, maxLat };
}

function pointInRing(lon: number, lat: number, ring: CoordinatePair[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi === 0 ? Number.EPSILON : yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonSet(lon: number, lat: number, polygons: PolygonSet): boolean {
  return polygons.some((polygon) => {
    const [outerRing, ...holes] = polygon;
    if (!outerRing || !pointInRing(lon, lat, outerRing)) {
      return false;
    }
    return !holes.some((hole) => pointInRing(lon, lat, hole));
  });
}

function samplePointInPolygonSet(
  polygons: PolygonSet,
  random: () => number,
  fallback: { longitude: number; latitude: number }
): { longitude: number; latitude: number } {
  const bbox = bboxForPolygonSet(polygons);
  if (!bbox) return fallback;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const longitude = bbox.minLon + random() * (bbox.maxLon - bbox.minLon);
    const latitude = bbox.minLat + random() * (bbox.maxLat - bbox.minLat);
    if (pointInPolygonSet(longitude, latitude, polygons)) {
      return { longitude, latitude };
    }
  }

  return {
    longitude: fallback.longitude + (random() - 0.5) * 0.08,
    latitude: fallback.latitude + (random() - 0.5) * 0.08,
  };
}

export async function loadBangladeshDistrictGeoJson(): Promise<DistrictFeatureCollection> {
  const primary = await fetch("/data/bangladesh-districts.geojson", { cache: "force-cache" });
  if (primary.ok) {
    return (await primary.json()) as DistrictFeatureCollection;
  }

  const fallback = await fetch("/data/bd_districts.geojson", { cache: "force-cache" });
  if (!fallback.ok) {
    throw new Error(`Failed to load Bangladesh district GeoJSON (${fallback.status})`);
  }

  return (await fallback.json()) as DistrictFeatureCollection;
}

export function buildSpikeData(geojson: DistrictFeatureCollection): DistrictSpikeData[] {
  const maxDensity = Math.max(...BANGLADESH_DISTRICT_POPULATION_2022.map((item) => item.density));
  const maxPopulation = Math.max(...BANGLADESH_DISTRICT_POPULATION_2022.map((item) => item.population));

  return BANGLADESH_DISTRICT_POPULATION_2022.map((district) => {
    const feature = findFeature(geojson, district) ?? null;
    const coords = feature ? getFeatureCentroid(feature) : BANGLADESH_FALLBACK_COORDS;
    const densityNormalized = district.density / maxDensity;
    const densityVisualScore = clamp(
      (Math.log1p(district.density) / Math.log1p(maxDensity)) * 0.58 +
        Math.sqrt(district.population / maxPopulation) * 0.42,
      0,
      1
    );

    return {
      ...district,
      longitude: coords.longitude,
      latitude: coords.latitude,
      density_normalized: densityNormalized,
      density_visual_score: densityVisualScore,
      feature: feature ? asFeature(feature) : null,
      district_slug: canonicalDistrictName(district.district),
    };
  });
}

export function buildPopulationSpikeField(districts: DistrictSpikeData[]): PopulationSpikePoint[] {
  return districts.flatMap((district) => {
    const random = createSeededRandom(hashString(`${district.pcode}:${district.density}`));
    const polygons = district.feature ? toPolygonSet(district.feature.geometry) : [];
    const areaWeight = clamp(district.area_km2 / 82, 6, 40);
    const populationWeight = Math.sqrt(district.population / 10278882) * 24;
    const spikeCount = Math.round(
      clamp(10 + areaWeight + populationWeight + district.density_visual_score * 34, MIN_SPIKES_PER_DISTRICT, MAX_SPIKES_PER_DISTRICT)
    );
    const baseHeight = 1800 + district.density_visual_score ** 1.25 * 42000;

    return Array.from({ length: spikeCount }, (_, index) => {
      const sampledPoint =
        polygons.length > 0
          ? samplePointInPolygonSet(polygons, random, {
              longitude: district.longitude,
              latitude: district.latitude,
            })
          : {
              longitude: district.longitude + (random() - 0.5) * 0.04,
              latitude: district.latitude + (random() - 0.5) * 0.04,
            };

      const intensity = clamp(0.18 + district.density_visual_score * 0.42 + random() * 0.16, 0.12, 0.78);
      const heightVariance = 0.52 + random() * 0.48;

      return {
        id: `${district.pcode}-${index}`,
        pcode: district.pcode,
        district: district.district,
        division: district.division,
        longitude: sampledPoint.longitude,
        latitude: sampledPoint.latitude,
        intensity,
        height_m: Math.round(baseHeight * intensity * heightVariance),
        density: district.density,
        population: district.population,
        district_longitude: district.longitude,
        district_latitude: district.latitude,
      };
    });
  });
}

export function attachHeatMetrics(
  spikes: DistrictSpikeData[],
  temperatureMap: TemperatureMap
): DistrictWithHeat[] {
  const nationalMean =
    spikes.reduce((sum, district) => {
      const nearestId = findNearestPointId(district.latitude, district.longitude, TEMPERATURE_POINTS);
      const temperature = nearestId ? temperatureMap[nearestId] : undefined;
      const heatIndex = Number.isFinite(temperature) ? (temperature as number) + 2.4 : 33.5;
      return sum + heatIndex;
    }, 0) / Math.max(spikes.length, 1);

  return spikes.map((district) => {
    const nearestId = findNearestPointId(district.latitude, district.longitude, TEMPERATURE_POINTS);
    const temperature = nearestId ? temperatureMap[nearestId] : undefined;
    const heatIndex = Number.isFinite(temperature) ? (temperature as number) + 2.4 : 33.5;
    const heatTier = getTierFromTemperature(heatIndex);
    const anomaly = heatIndex - nationalMean;

    return {
      ...district,
      heat_index_p50: Number(heatIndex.toFixed(1)),
      heat_tier: heatTier,
      anom_hi: Number(anomaly.toFixed(1)),
      probability_tier3: estimateTierProbability(heatIndex),
    };
  });
}

export function buildGeoJsonForDeck(data: DistrictWithHeat[] | DistrictSpikeData[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data
      .filter((item) => item.feature !== null)
      .map((item) => ({
        ...(item.feature as Feature<Geometry, GeoJsonProperties>),
        properties: {
          ...(item.feature?.properties ?? {}),
          district: item.district,
          pcode: item.pcode,
          density: item.density,
          population: item.population,
          heat_index_p50: "heat_index_p50" in item ? item.heat_index_p50 : undefined,
          heat_tier: "heat_tier" in item ? item.heat_tier : undefined,
          anom_hi: "anom_hi" in item ? item.anom_hi : undefined,
        },
      })),
  };
}
