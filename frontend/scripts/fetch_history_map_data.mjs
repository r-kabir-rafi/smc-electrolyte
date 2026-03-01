import fs from 'fs/promises';
import path from 'path';

// Helper to delay requests to respect Open-Meteo's API limit
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchForDistrict(lat, lon, start, end) {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    start_date: start,
    end_date: end,
    daily: "temperature_2m_max,relative_humidity_2m_mean,wind_speed_10m_max",
    timezone: "auto",
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 429) {
      console.log(`Rate limit hit fetching. Retrying in 1 minute...`);
      await delay(60000);
      return fetchForDistrict(lat, lon, start, end);
    }
    throw new Error(`API failed with status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Extracted from bd_districts.geojson
function isCoordinatePair(value) {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number";
}

function collectCoordinates(node, out) {
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

async function getDistricts() {
  const raw = await fs.readFile(path.join(process.cwd(), 'public', 'data', 'bd_districts.geojson'), 'utf8');
  const geojson = JSON.parse(raw);
  const points = [];
  const seen = new Set();
  
  geojson.features.forEach((feature) => {
    const coords = [];
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

async function main() {
  const startYear = 2010;
  const endYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  
  const outputDir = path.join(process.cwd(), 'public', 'data', 'history');
  await fs.mkdir(outputDir, { recursive: true });

  console.log('Loading districts...');
  const districts = await getDistricts();
  console.log(`Found ${districts.length} districts.`);

  // In memory store of yearly data: yearlyData[year][date][districtId] = {t, h, w}
  const yearlyData = {};

  for (let y = startYear; y <= endYear; y++) {
    yearlyData[y] = {};
  }

  for (let i = 0; i < districts.length; i++) {
    const d = districts[i];
    console.log(`[${i+1}/${districts.length}] Fetching data for ${d.label}...`);
    
    // We fetch in chunks of 5 years to be safe with URL lengths
    const chunks = [];
    for (let currentStart = startYear; currentStart <= endYear; currentStart += 5) {
      const currentEnd = Math.min(endYear, currentStart + 4);
      chunks.push({
        s: `${currentStart}-01-01`,
        e: currentEnd === endYear ? today : `${currentEnd}-12-31`
      });
    }

    for (const chunk of chunks) {
      console.log(`  -> Fetching ${chunk.s} to ${chunk.e}`);
      const weather = await fetchForDistrict(d.lat, d.lon, chunk.s, chunk.e);
      await delay(500); // Respect open meteo rate limit (max 10,000 requests per day)
      
      const times = weather?.daily?.time || [];
      const tMaxs = weather?.daily?.temperature_2m_max || [];
      const hMeans = weather?.daily?.relative_humidity_2m_mean || [];
      const wMaxs = weather?.daily?.wind_speed_10m_max || [];

      for (let j = 0; j < times.length; j++) {
        const time = times[j];
        if (!time) continue;
        
        const year = time.substring(0, 4);
        if (!yearlyData[year]) yearlyData[year] = {};
        if (!yearlyData[year][time]) yearlyData[year][time] = {};
        
        yearlyData[year][time][d.id] = {
           // Encode keys to 1 letter and values to 1 decimal to save huge amounts of space
          t: Number((tMaxs[j] ?? 0).toFixed(1)),
          h: Math.round(hMeans[j] ?? 0),
          w: Number((wMaxs[j] ?? 0).toFixed(1))
        };
      }
    }
  }

  console.log('\nWriting yearly files...');
  for (const year of Object.keys(yearlyData)) {
    const p = path.join(outputDir, `${year}.json`);
    await fs.writeFile(p, JSON.stringify(yearlyData[year]));
    console.log(`Wrote -> ${p}`);
  }
  
  console.log('\nSuccess! Pre-fetching complete.');
}

main().catch(console.error);
