import L from "leaflet";

export type DistrictFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: string;
    properties?: Record<string, string>;
    geometry: unknown;
  }>;
};

export type DistrictPoint = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  admin1?: string;
};

const DISTRICT_ALIAS: Record<string, string> = {
  barisal: "barishal",
  bogra: "bogura",
  chittagong: "chattogram",
  comilla: "cumilla",
  jessore: "jashore",
  coxsbazar: "coxsbazar",
};

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

export function collectCoordinates(node: unknown, out: Array<{ lat: number; lon: number }>) {
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

export function normalizeDistrictName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function canonicalDistrictName(value: string): string {
  const normalized = normalizeDistrictName(value);
  return DISTRICT_ALIAS[normalized] || normalized;
}

export function districtName(properties?: Record<string, string>): string {
  return properties?.NAME_2 || properties?.district || properties?.name || "Unknown District";
}

export function districtSlug(value: string): string {
  return canonicalDistrictName(value);
}

export function parseDistrictPoints(geoJson: DistrictFeatureCollection): DistrictPoint[] {
  const points: DistrictPoint[] = [];
  const seen = new Set<string>();

  for (const feature of geoJson.features) {
    const coords: Array<{ lat: number; lon: number }> = [];
    collectCoordinates((feature.geometry as { coordinates?: unknown } | undefined)?.coordinates, coords);
    if (coords.length === 0) continue;

    const lat = coords.reduce((sum, point) => sum + point.lat, 0) / coords.length;
    const lon = coords.reduce((sum, point) => sum + point.lon, 0) / coords.length;
    const label = districtName(feature.properties);
    const id = districtSlug(label);
    if (seen.has(id)) continue;
    seen.add(id);
    points.push({ id, label, lat, lon });
  }

  return points.sort((a, b) => a.label.localeCompare(b.label));
}

export function computeDistrictBounds(geoJson: DistrictFeatureCollection): L.LatLngBounds | undefined {
  const layer = L.geoJSON(geoJson as never);
  const bounds = layer.getBounds();
  return bounds.isValid() ? bounds : undefined;
}

export function computeDistrictCentroids(geoJson: DistrictFeatureCollection): Map<string, L.LatLng> {
  const centroids = new Map<string, L.LatLng>();

  for (const feature of geoJson.features) {
    const label = districtName(feature.properties);
    const layer = L.geoJSON(feature as never);
    const bounds = layer.getBounds();
    if (!bounds.isValid()) continue;
    centroids.set(districtSlug(label), bounds.getCenter());
  }

  return centroids;
}
