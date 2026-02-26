export type TemperaturePoint = {
  id: string;
  label: string;
  lat: number;
  lon: number;
};

export type TemperatureMap = Record<string, number>;

export const TEMPERATURE_POINTS: TemperaturePoint[] = [
  { id: "dhaka", label: "Dhaka", lat: 23.8103, lon: 90.4125 },
  { id: "chattogram", label: "Chattogram", lat: 22.3569, lon: 91.7832 },
  { id: "khulna", label: "Khulna", lat: 22.8456, lon: 89.5403 },
  { id: "rajshahi", label: "Rajshahi", lat: 24.3745, lon: 88.6042 },
  { id: "barishal", label: "Barishal", lat: 22.701, lon: 90.3535 },
  { id: "sylhet", label: "Sylhet", lat: 24.8949, lon: 91.8687 },
  { id: "rangpur", label: "Rangpur", lat: 25.7439, lon: 89.2752 },
  { id: "mymensingh", label: "Mymensingh", lat: 24.7471, lon: 90.4203 },
  { id: "cumilla", label: "Cumilla", lat: 23.4607, lon: 91.1809 },
  { id: "bogura", label: "Bogura", lat: 24.851, lon: 89.3697 },
  { id: "jashore", label: "Jashore", lat: 23.1664, lon: 89.2081 },
  { id: "naogaon", label: "Naogaon", lat: 24.7936, lon: 88.9318 },
  { id: "dinajpur", label: "Dinajpur", lat: 25.6279, lon: 88.6332 },
  { id: "kushtia", label: "Kushtia", lat: 23.9013, lon: 89.1205 },
  { id: "pabna", label: "Pabna", lat: 24.0064, lon: 89.2372 },
  { id: "noakhali", label: "Noakhali", lat: 22.8696, lon: 91.0995 },
  { id: "coxsbazar", label: "Cox's Bazar", lat: 21.4272, lon: 92.0058 },
  { id: "bandarban", label: "Bandarban", lat: 22.1953, lon: 92.2184 },
  { id: "sunamganj", label: "Sunamganj", lat: 25.0658, lon: 91.395 },
  { id: "faridpur", label: "Faridpur", lat: 23.6071, lon: 89.8429 },
];

function parseTemperature(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchSinglePointTemperature(point: TemperaturePoint): Promise<number | undefined> {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    current: "temperature_2m",
    timezone: "auto",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) return undefined;

  const payload = (await response.json()) as { current?: { temperature_2m?: unknown } };
  return parseTemperature(payload?.current?.temperature_2m);
}

export async function fetchCurrentTemperatures(
  points: TemperaturePoint[] = TEMPERATURE_POINTS
): Promise<TemperatureMap> {
  const result: TemperatureMap = {};
  if (points.length === 0) return result;

  const params = new URLSearchParams({
    latitude: points.map((point) => point.lat).join(","),
    longitude: points.map((point) => point.lon).join(","),
    current: "temperature_2m",
    timezone: "auto",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

  if (response.ok) {
    const payload = await response.json();

    if (Array.isArray(payload)) {
      payload.forEach((entry, index) => {
        const point = points[index];
        if (!point) return;
        const temp = parseTemperature(entry?.current?.temperature_2m);
        if (temp !== undefined) {
          result[point.id] = temp;
        }
      });
    } else {
      const maybeTemps = payload?.current?.temperature_2m;
      if (Array.isArray(maybeTemps)) {
        maybeTemps.forEach((value, index) => {
          const point = points[index];
          if (!point) return;
          const temp = parseTemperature(value);
          if (temp !== undefined) {
            result[point.id] = temp;
          }
        });
      }
    }
  }

  const missingPoints = points.filter((point) => result[point.id] === undefined);
  if (missingPoints.length > 0) {
    const fallbackValues = await Promise.all(
      missingPoints.map(async (point) => ({
        id: point.id,
        temperature: await fetchSinglePointTemperature(point),
      }))
    );

    fallbackValues.forEach((value) => {
      if (value.temperature !== undefined) {
        result[value.id] = value.temperature;
      }
    });
  }

  return result;
}

export function findNearestPointId(
  lat: number,
  lon: number,
  points: TemperaturePoint[] = TEMPERATURE_POINTS
): string | null {
  let bestPoint: TemperaturePoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const dLat = point.lat - lat;
    const dLon = point.lon - lon;
    const distance = dLat * dLat + dLon * dLon;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = point;
    }
  }

  return bestPoint?.id ?? null;
}
