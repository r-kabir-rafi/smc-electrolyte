# Heatstroke News NLP Pipeline (Phase 4)

## Collection inputs
Keywords:
- `heatstroke`
- `heat wave`
- `তাপদাহ`
- `হিটস্ট্রোক`
- `গরমে মৃত্যু`
- `অতিরিক্ত গরম`

Curated domains:
- `thedailystar.net`
- `dhakatribune.com`
- `bdnews24.com`
- `newagebd.net`
- `prothomalo.com`
- `jugantor.com`
- `daily-sun.com`

## Pipeline steps
1. Search result collection (GDELT Doc API) and URL filtering.
2. Article scraping and parsing (`headline`, `date_published`, `body`).
3. Raw + parsed storage:
- `data_raw/news/articles.jsonl`
- `data_intermediate/news_parsed.parquet`
4. Rule-based casualty extraction to structured incidents.
5. Admin-level geocoding using district/upazila gazetteer.

## Commands
```bash
python3 pipelines/news_collect.py --demo --demo-count 520
python3 pipelines/extract_heatstroke_incidents.py
python3 pipelines/geocode_incidents.py
python3 pipelines/audit_incident_extraction.py --sample-size 80
```

Live web mode (network required):
```bash
python3 pipelines/news_collect.py --max-per-keyword 120 --max-articles 1200
```

## Quality targets
- Extraction precision target: >=80% for deaths and district location
- Mapping target: >=70% incidents at district level or better

Use audit workflow:
1. Generate sample CSV.
2. Fill manual labels (`manual_deaths`, `manual_district`).
3. Score with `--score`.
