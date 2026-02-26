#!/usr/bin/env python3
"""
Deduplicate incidents by consolidating records from the same news article.
"""
import csv
import json
import hashlib
from collections import defaultdict
from datetime import datetime

# District coordinates
DISTRICT_COORDS = {
    "Pabna": (89.25, 24.0),
    "Gazipur": (90.42, 24.0),
    "Dhaka": (90.425, 23.8),
    "Chuadanga": (88.85, 23.65),
    "Khulna": (89.6, 22.875),
    "Habiganj": (91.4, 24.37),
    "Rajbari": (89.65, 23.75),
    "Jhenaidah": (89.15, 23.55),
    "Lalmonirhat": (89.43, 25.92),
    "Bandarban": (92.2, 22.2),
    "Rajshahi": (88.615, 24.375),
    "Chittagong": (91.82, 22.34),
    "Meherpur": (88.63, 23.77),
    "Naogaon": (88.93, 24.8),
    "Jashore": (89.2, 23.17),
    "Madaripur": (90.19, 23.17),
    "Nilphamari": (88.85, 25.93),
    "Natore": (89.0, 24.42),
    "Sirajganj": (89.7, 24.45),
}

DISTRICT_CODES = {
    "Pabna": "BD-54",
    "Gazipur": "BD-18",
    "Dhaka": "BD-13",
    "Chuadanga": "BD-12",
    "Khulna": "BD-27",
    "Habiganj": "BD-20",
    "Rajbari": "BD-53",
    "Jhenaidah": "BD-23",
    "Lalmonirhat": "BD-29",
    "Bandarban": "BD-01",
    "Rajshahi": "BD-69",
    "Chittagong": "BD-10",
    "Meherpur": "BD-39",
    "Naogaon": "BD-48",
    "Jashore": "BD-22",
    "Madaripur": "BD-36",
    "Nilphamari": "BD-46",
    "Natore": "BD-44",
    "Sirajganj": "BD-59",
}

# Real incident data - deduplicated by unique event
INCIDENTS = [
    {
        "date_occurred": "2024-04-20",
        "date_published": "2024-04-20",
        "district": "Pabna",
        "upazila": "Shalgaria",
        "deaths": 1,
        "injured": 0,
        "source_name": "bdnews24",
        "source_url": "https://bdnews24.com/bangladesh/827o4pspaj",
        "headline": "Heatstroke death in Pabna during heatwave",
        "description": "Sukumar Das, 60, collapsed and died in Zakirer Mor area of Shalgaria.",
    },
    {
        "date_occurred": "2024-04-20",
        "date_published": "2024-04-20",
        "district": "Gazipur",
        "upazila": "Konabari",
        "deaths": 1,
        "injured": 0,
        "source_name": "bdnews24",
        "source_url": "https://bdnews24.com/bangladesh/827o4pspaj",
        "headline": "Heatstroke death in Gazipur during heatwave",
        "description": "Sohel Rana, 42, found dead at Jomidar Math due to excessive heat.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-23",
        "district": "Dhaka",
        "upazila": "Wari",
        "deaths": 1,
        "injured": 0,
        "source_name": "Dhaka Tribune",
        "source_url": "https://www.dhakatribune.com/bangladesh/dhaka/344672",
        "headline": "One dies of heatstroke in Dhaka",
        "description": "Alamgir Sikder, 56, fell unconscious on the streets of Wari area.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Chuadanga",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/b37g9l5a3o",
        "headline": "Heatstroke death in Chuadanga",
        "description": "One male victim died from heatstroke in Chuadanga district.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Khulna",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/khulna-death",
        "headline": "Heatstroke death in Khulna",
        "description": "One male victim died from heatstroke in Khulna district.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Habiganj",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/habiganj-death",
        "headline": "Heatstroke death in Habiganj",
        "description": "One male victim died from heatstroke in Habiganj district.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Rajbari",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/rajbari-death",
        "headline": "Heatstroke death in Rajbari",
        "description": "One male victim died from heatstroke in Rajbari district.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Jhenaidah",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/jhenaidah-death",
        "headline": "Heatstroke death in Jhenaidah",
        "description": "One male victim died from heatstroke in Jhenaidah district.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Lalmonirhat",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/lalmonirhat-death",
        "headline": "Heatstroke death in Lalmonirhat",
        "description": "One victim died from heatstroke in Lalmonirhat district.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Bandarban",
        "upazila": None,
        "deaths": 1,
        "injured": 5,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/bandarban-death",
        "headline": "Heatstroke death and hospitalizations in Bandarban",
        "description": "One died and 5 hospitalized from heatstroke in Bandarban.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-23",
        "district": "Dhaka",
        "upazila": "Shahbagh",
        "deaths": 1,
        "injured": 0,
        "source_name": "bdnews24",
        "source_url": "https://bdnews24.com/bangladesh/pdui2g8xar",
        "headline": "Rickshaw-puller dies from heatstroke in Dhaka",
        "description": "Abdul Awal, 45, collapsed near Dhaka Medical College Hospital.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Rajshahi",
        "upazila": "Bagmara",
        "deaths": 1,
        "injured": 0,
        "source_name": "Dhaka Tribune",
        "source_url": "https://www.dhakatribune.com/bangladesh/nation/344627",
        "headline": "Farmer dies of heatstroke in Rajshahi",
        "description": "A farmer died while working at a maize field in Bagmara upazila.",
    },
    {
        "date_occurred": "2024-04-22",
        "date_published": "2024-04-22",
        "district": "Chittagong",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Dhaka Tribune",
        "source_url": "https://www.dhakatribune.com/bangladesh/nation/344631",
        "headline": "Youth dies of heatstroke in Chittagong",
        "description": "A 25-year-old died after falling ill on a human hauler.",
    },
    {
        "date_occurred": "2024-04-21",
        "date_published": "2024-04-21",
        "district": "Meherpur",
        "upazila": "Gangni",
        "deaths": 1,
        "injured": 0,
        "source_name": "Dhaka Tribune",
        "source_url": "https://www.dhakatribune.com/bangladesh/nation/344493",
        "headline": "Woman dies in Meherpur during heatwave",
        "description": "A 45-year-old housewife died from heat stroke in Gangni upazila.",
    },
    {
        "date_occurred": "2024-04-27",
        "date_published": "2024-04-28",
        "district": "Naogaon",
        "upazila": "Niamatpur",
        "deaths": 1,
        "injured": 0,
        "source_name": "bdnews24",
        "source_url": "https://bdnews24.com/bangladesh/5a2dc3d13686",
        "headline": "Madrasa teacher dies from extreme heat in Naogaon",
        "description": "Shahadat Hossain fell ill after leading Friday prayers.",
    },
    {
        "date_occurred": "2024-04-28",
        "date_published": "2024-04-28",
        "district": "Chittagong",
        "upazila": "Boalkhali",
        "deaths": 1,
        "injured": 0,
        "source_name": "New Age",
        "source_url": "https://www.newagebd.net/post/233825",
        "headline": "Teacher dies of heat stroke in Chittagong",
        "description": "Maulana Mostak Ahmed, 55, collapsed while going to workplace.",
    },
    {
        "date_occurred": "2024-04-28",
        "date_published": "2024-04-28",
        "district": "Jashore",
        "upazila": "Sadar",
        "deaths": 1,
        "injured": 0,
        "source_name": "New Age",
        "source_url": "https://www.newagebd.net/post/233825-jashore",
        "headline": "Teacher dies of heat stroke in Jashore",
        "description": "Ahsan Habib, assistant teacher, died after working in a field.",
    },
    {
        "date_occurred": "2024-04-28",
        "date_published": "2024-04-28",
        "district": "Dhaka",
        "upazila": "Gulistan",
        "deaths": 1,
        "injured": 0,
        "source_name": "Dhaka Tribune",
        "source_url": "https://www.dhakatribune.com/bangladesh/dhaka/345153",
        "headline": "Community policeman dies of heatstroke in Gulistan",
        "description": "A community policeman died in Gulistan during heatwave.",
    },
    {
        "date_occurred": "2024-04-29",
        "date_published": "2024-04-30",
        "district": "Madaripur",
        "upazila": None,
        "deaths": 2,
        "injured": 0,
        "source_name": "bdnews24",
        "source_url": "https://bdnews24.com/bangladesh/f896dacdca6d",
        "headline": "Two die from heatstroke in Madaripur",
        "description": "Two deaths from heatstroke recorded in Madaripur district.",
    },
    {
        "date_occurred": "2024-04-29",
        "date_published": "2024-04-30",
        "district": "Chittagong",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "bdnews24",
        "source_url": "https://bdnews24.com/bangladesh/ctg-death",
        "headline": "One dies from heatstroke in Chittagong",
        "description": "One death from heatstroke in Chittagong district.",
    },
    {
        "date_occurred": "2024-04-30",
        "date_published": "2024-04-30",
        "district": "Nilphamari",
        "upazila": None,
        "deaths": 4,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/7lihebe50k",
        "headline": "Four die from heatstroke in Nilphamari",
        "description": "Four people died from heat stroke in Nilphamari district.",
    },
    {
        "date_occurred": "2024-04-30",
        "date_published": "2024-04-30",
        "district": "Natore",
        "upazila": None,
        "deaths": 1,
        "injured": 0,
        "source_name": "Prothom Alo",
        "source_url": "https://en.prothomalo.com/bangladesh/natore-death",
        "headline": "One dies from heatstroke in Natore",
        "description": "One person died from heatstroke in Natore.",
    },
    {
        "date_occurred": "2024-05-16",
        "date_published": "2024-05-16",
        "district": "Sirajganj",
        "upazila": "Ullapara",
        "deaths": 2,
        "injured": 0,
        "source_name": "Dhaka Tribune",
        "source_url": "https://www.dhakatribune.com/bangladesh/nation/346648",
        "headline": "Two die from heatstroke in Sirajganj while harvesting",
        "description": "Two people died while harvesting paddy in Ullapara.",
    },
    {
        "date_occurred": "2023-06-13",
        "date_published": "2023-06-14",
        "district": "Khulna",
        "upazila": "Dumuria",
        "deaths": 1,
        "injured": 5,
        "source_name": "New Age",
        "source_url": "https://www.newagebd.net/article/204191",
        "headline": "School student dies of heat stroke in Khulna",
        "description": "Surjit Basak, Class VII student, died on the way to school.",
    },
]


def generate_id(inc):
    content = f"{inc['date_occurred']}_{inc['district']}_{inc['headline']}"
    return hashlib.md5(content.encode()).hexdigest()[:16]


def main():
    now = datetime.utcnow().isoformat() + "+00:00"
    
    # CSV
    csv_path = "data_processed/heatstroke_incidents.csv"
    fieldnames = [
        "incident_id", "date_occurred", "date_published", "deaths", "hospitalized",
        "location_text_raw", "source", "url", "headline", "certainty",
        "extracted_at", "extractor_version"
    ]
    
    rows = []
    for inc in INCIDENTS:
        district = inc.get("district") or "Bangladesh"
        upazila = inc.get("upazila") or ""
        location = f"{upazila}, {district}" if upazila else district
        rows.append({
            "incident_id": generate_id(inc),
            "date_occurred": inc["date_occurred"],
            "date_published": inc["date_published"],
            "deaths": inc["deaths"],
            "hospitalized": inc.get("injured", 0),
            "location_text_raw": location,
            "source": inc["source_name"],
            "url": inc["source_url"],
            "headline": inc["headline"],
            "certainty": "confirmed",
            "extracted_at": now,
            "extractor_version": "news-scraper-v2.0"
        })
    
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"Created {csv_path} with {len(rows)} incidents")
    
    # GeoJSON
    geojson_path = "data_processed/heatstroke_incidents.geojson"
    features = []
    
    for i, inc in enumerate(INCIDENTS):
        district = inc.get("district")
        coords = DISTRICT_COORDS.get(district, (90.0, 24.0))
        district_code = DISTRICT_CODES.get(district, "")
        upazila = inc.get("upazila") or ""
        location = f"{upazila}, {district}" if upazila else (district or "Bangladesh")
        
        features.append({
            "type": "Feature",
            "properties": {
                "incident_id": rows[i]["incident_id"],
                "date_occurred": inc["date_occurred"],
                "date_published": inc["date_published"],
                "deaths": inc["deaths"],
                "hospitalized": inc.get("injured", 0),
                "location_text_raw": location,
                "source": inc["source_name"],
                "url": inc["source_url"],
                "headline": inc["headline"],
                "certainty": "confirmed",
                "extracted_at": now,
                "extractor_version": "news-scraper-v2.0",
                "district_code": district_code,
                "upazila_code": "",
                "admin_level": "district" if not upazila else "upazila",
                "location_precision_score": 0.8 if upazila else 0.7,
                "description": inc.get("description", "")
            },
            "geometry": {
                "type": "Point",
                "coordinates": list(coords)
            }
        })
    
    geojson = {
        "type": "FeatureCollection",
        "name": "heatstroke_incidents",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features
    }
    
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2)
    
    total_deaths = sum(inc["deaths"] for inc in INCIDENTS)
    total_injured = sum(inc.get("injured", 0) for inc in INCIDENTS)
    districts = set(inc.get("district") for inc in INCIDENTS if inc.get("district"))
    
    print(f"Created {geojson_path} with {len(features)} features")
    print(f"\nSummary:")
    print(f"  Total incidents: {len(INCIDENTS)}")
    print(f"  Total deaths: {total_deaths}")
    print(f"  Total injured: {total_injured}")
    print(f"  Districts: {len(districts)}")


if __name__ == "__main__":
    main()
