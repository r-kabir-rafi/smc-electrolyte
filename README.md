# Bangladesh Heatwave / Heatstroke Monitor

Simple and stable 2-page website built with Next.js 14 (App Router + TypeScript).

## Pages
1. Home (`/`): interactive Bangladesh district map (GADM Level 2) with temperature overlay
2. Incidents (`/incidents`): filterable/sortable heatstroke incident table from CSV

## Team Quickstart (Recommended)
From repo root:

```bash
bash scripts/setup_frontend.sh
bash scripts/dev_frontend.sh
```

`dev_frontend.sh` auto-picks a free port starting from `3000` and prints the URL.

## Manual Run
```bash
cd frontend
npm ci
bash ../scripts/fetch_gadm_districts.sh
npm run dev -- -p 3000
```

## Requirements
- Node.js 20 LTS (see `.nvmrc`)
- npm
- curl + unzip (for district data download)

## Common Issues
- Port already in use:
  - `bash scripts/dev_frontend.sh` (auto-picks a free port), or
  - `npm run dev -- -p 3002`
- Python venv activation errors are unrelated to this frontend app.

## Data Files
- District boundaries: `frontend/public/data/bd_districts.geojson`
- Incidents CSV: `frontend/public/data/heatstroke_incidents.csv`

## Scripts
- `scripts/setup_frontend.sh`: install deps + fetch district boundaries
- `scripts/dev_frontend.sh [port]`: start dev server on first free port
- `scripts/fetch_gadm_districts.sh`: download/unzip GADM dataset

## Data Sources
- GADM download page: https://gadm.org/download_country.html
- GADM direct file used: https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_BGD_2.json.zip
- Weather history is fetched from [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5/ERA5-Land reanalysis-based).

District boundaries from GADM (Global Administrative Areas). License: free for non-commercial use; for commercial use obtain license from gadm.org.
