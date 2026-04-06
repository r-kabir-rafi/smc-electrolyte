import { districtSlug, type DistrictFeatureCollection, parseDistrictPoints } from "./geo";

export type WeatherRow = {
  time: string;
  tempMean: number;
  tempMax: number;
  humMean: number;
  dewMean: number;
  appTempMax: number;
  windMax: number;
};

export async function loadDistrictGeoJson(): Promise<DistrictFeatureCollection> {
  const response = await fetch("/data/bd_districts.geojson", { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load district geometry (${response.status})`);
  }
  return (await response.json()) as DistrictFeatureCollection;
}

export async function fetchStaticHistory(districtId: string): Promise<{
  daily: { time: string[]; temperature_2m_mean: number[]; temperature_2m_max: number[]; relative_humidity_2m_mean: number[]; dew_point_2m_mean: number[]; apparent_temperature_max: number[]; wind_speed_10m_max: number[] };
}> {
  const startYear = 2010;
  const endYear = new Date().getFullYear();
  const yearlyDataPromises = [];

  for (let year = startYear; year <= endYear; year += 1) {
    yearlyDataPromises.push(
      fetch(`/data/history/${year}.json`)
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => ({}))
    );
  }

  const yearlyChunks = await Promise.all(yearlyDataPromises);
  const raw = {
    daily: {
      time: [] as string[],
      temperature_2m_mean: [] as number[],
      temperature_2m_max: [] as number[],
      relative_humidity_2m_mean: [] as number[],
      dew_point_2m_mean: [] as number[],
      apparent_temperature_max: [] as number[],
      wind_speed_10m_max: [] as number[],
    },
  };

  for (const chunk of yearlyChunks as Array<Record<string, Record<string, { t: number; h: number; w: number }>>>) {
    const dates = Object.keys(chunk).sort();
    for (const date of dates) {
      const item = chunk[date]?.[districtId];
      if (!item) continue;
      raw.daily.time.push(date);
      raw.daily.temperature_2m_mean.push(item.t - 2);
      raw.daily.temperature_2m_max.push(item.t);
      raw.daily.relative_humidity_2m_mean.push(item.h);
      raw.daily.dew_point_2m_mean.push(item.t - (100 - item.h) / 5);
      raw.daily.apparent_temperature_max.push(item.t + 2);
      raw.daily.wind_speed_10m_max.push(item.w);
    }
  }

  return raw;
}

export function processWeatherData(raw: Awaited<ReturnType<typeof fetchStaticHistory>>) {
  const daily: WeatherRow[] = [];
  const monthlyMap = new Map<
    string,
    {
      time: string;
      sumT: number;
      maxT: number;
      sumH: number;
      sumDew: number;
      maxAppT: number;
      maxWind: number;
      count: number;
    }
  >();

  const times = raw.daily.time || [];
  for (let index = 0; index < times.length; index += 1) {
    const row: WeatherRow = {
      time: times[index],
      tempMean: raw.daily.temperature_2m_mean[index] ?? 0,
      tempMax: raw.daily.temperature_2m_max[index] ?? 0,
      humMean: raw.daily.relative_humidity_2m_mean[index] ?? 0,
      dewMean: raw.daily.dew_point_2m_mean[index] ?? 0,
      appTempMax: raw.daily.apparent_temperature_max[index] ?? 0,
      windMax: raw.daily.wind_speed_10m_max[index] ?? 0,
    };
    daily.push(row);

    const monthKey = row.time.slice(0, 7);
    const month = monthlyMap.get(monthKey) ?? {
      time: monthKey,
      sumT: 0,
      maxT: Number.NEGATIVE_INFINITY,
      sumH: 0,
      sumDew: 0,
      maxAppT: Number.NEGATIVE_INFINITY,
      maxWind: Number.NEGATIVE_INFINITY,
      count: 0,
    };
    month.sumT += row.tempMean;
    month.maxT = Math.max(month.maxT, row.tempMax);
    month.sumH += row.humMean;
    month.sumDew += row.dewMean;
    month.maxAppT = Math.max(month.maxAppT, row.appTempMax);
    month.maxWind = Math.max(month.maxWind, row.windMax);
    month.count += 1;
    monthlyMap.set(monthKey, month);
  }

  const monthly = Array.from(monthlyMap.values()).map((row) => ({
    time: row.time,
    tempMean: row.sumT / row.count,
    tempMax: row.maxT,
    humMean: row.sumH / row.count,
    dewMean: row.sumDew / row.count,
    appTempMax: row.maxAppT,
    windMax: row.maxWind,
  }));

  return { daily, monthly };
}

export async function loadDistrictHistorySeries(districtId: string) {
  const raw = await fetchStaticHistory(districtId);
  return processWeatherData(raw);
}

export async function loadDistrictPoints() {
  const geoJson = await loadDistrictGeoJson();
  return parseDistrictPoints(geoJson);
}

export function buildOutlookSeries(baseTemperature: number, startDate = new Date(), days = 14) {
  return Array.from({ length: days }, (_, index) => {
    const forecastDate = new Date(startDate);
    forecastDate.setDate(startDate.getDate() + index);
    const drift = Math.sin(index / 2.4) * 1.4 + index * 0.12;
    const hiMedian = baseTemperature + 2.5 + drift;
    const outer = 3.4;
    const inner = 1.8;

    return {
      date: forecastDate.toISOString().slice(0, 10),
      p10: hiMedian - outer,
      p25: hiMedian - inner,
      p50: hiMedian,
      p75: hiMedian + inner,
      p90: hiMedian + outer,
      tmaxP50: hiMedian - 2.1,
      warmNight: hiMedian - 8.7,
      anomaly: hiMedian - 34,
    };
  });
}

export function findDistrictLabelBySlug(geoJson: DistrictFeatureCollection, slug: string): string | null {
  const match = parseDistrictPoints(geoJson).find((district) => district.id === districtSlug(slug));
  return match?.label ?? null;
}
