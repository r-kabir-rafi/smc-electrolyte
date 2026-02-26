"""Create audit sample and score precision after manual review.

Step 1: generate sample CSV
Step 2: fill `manual_deaths` and `manual_district` columns
Step 3: run with --score to compute precision
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

INCIDENTS_CSV = Path("data_processed/heatstroke_incidents.csv")
SAMPLE_CSV = Path("data_intermediate/incident_audit_sample.csv")


def build_sample(sample_size: int, seed: int) -> None:
    df = pd.read_csv(INCIDENTS_CSV)
    if df.empty:
        raise ValueError("No incidents to sample")

    sample = df.sample(n=min(sample_size, len(df)), random_state=seed).copy()
    sample["manual_deaths"] = ""
    sample["manual_district"] = ""
    SAMPLE_CSV.parent.mkdir(parents=True, exist_ok=True)
    sample.to_csv(SAMPLE_CSV, index=False)
    print(f"Wrote {SAMPLE_CSV} ({len(sample)} rows)")


def score_sample(path: Path) -> None:
    df = pd.read_csv(path)
    reviewed = df[(df["manual_deaths"].astype(str) != "") & (df["manual_district"].astype(str) != "")].copy()
    if reviewed.empty:
        raise ValueError("No reviewed rows with manual labels")

    reviewed["manual_deaths"] = reviewed["manual_deaths"].astype(int)
    deaths_precision = (reviewed["deaths"].astype(int) == reviewed["manual_deaths"]).mean()

    pred_district = reviewed.get("location_text_raw", "").astype(str).str.lower()
    true_district = reviewed["manual_district"].astype(str).str.lower()
    district_precision = (pred_district.str.contains(true_district, regex=False)).mean()

    print(f"Reviewed rows: {len(reviewed)}")
    print(f"Deaths precision: {deaths_precision * 100:.1f}%")
    print(f"District precision proxy: {district_precision * 100:.1f}%")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-size", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--score", action="store_true")
    parser.add_argument("--sample-path", default=str(SAMPLE_CSV))
    args = parser.parse_args()

    if args.score:
        score_sample(Path(args.sample_path))
    else:
        build_sample(sample_size=args.sample_size, seed=args.seed)


if __name__ == "__main__":
    main()
