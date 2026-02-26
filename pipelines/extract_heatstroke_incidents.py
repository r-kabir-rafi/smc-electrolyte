"""Rule-based extraction of heatstroke casualty incidents from parsed news."""

from __future__ import annotations

import argparse
import hashlib
import re
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

PARSED_IN = Path("data_intermediate/news_parsed.parquet")
OUT_CSV = Path("data_processed/heatstroke_incidents.csv")

BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

DEATH_PATTERNS = [
    r"(\d+)\s+(?:people|persons|workers|children|residents)?\s*(?:died|dead|deaths|killed)",
    r"(?:died|deaths|dead|killed)\s*(?:at|in|of)?\s*(\d+)",
    r"(\d+)\s*(?:জন)?\s*(?:মৃত্যু|মারা গেছে|নিহত)",
]

HOSPITAL_PATTERNS = [
    r"(\d+)\s+(?:people|persons|patients|workers)?\s*(?:hospitalized|admitted)",
    r"hospital(?:ised|ized)\s*(\d+)",
    r"(\d+)\s*(?:জন)?\s*(?:হাসপাতালে|হাসপাতালে ভর্তি)",
]

DATE_PATTERNS = [
    r"\b(20\d{2}-\d{2}-\d{2})\b",
    r"\b(\d{1,2}/\d{1,2}/20\d{2})\b",
]

SUSPECTED_TERMS = [
    "suspected",
    "possible",
    "unconfirmed",
    "reportedly",
    "প্রাথমিক",
    "সন্দেহ",
]


def _norm_digits(text: str) -> str:
    return text.translate(BANGLA_DIGITS)


def _extract_first_int(text: str, patterns: list[str]) -> int | None:
    for pattern in patterns:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m:
            try:
                return int(m.group(1))
            except ValueError:
                continue
    return None


def _extract_date_occurred(text: str) -> str | None:
    for pattern in DATE_PATTERNS:
        m = re.search(pattern, text)
        if m:
            token = m.group(1)
            if "/" in token:
                dt = pd.to_datetime(token, dayfirst=True, errors="coerce")
            else:
                dt = pd.to_datetime(token, errors="coerce")
            if pd.notna(dt):
                return str(dt.date())
    return None


def _extract_location_text(text: str) -> str:
    patterns = [
        r"in\s+([A-Z][A-Za-z\-\s]{2,40})",
        r"at\s+([A-Z][A-Za-z\-\s]{2,40})",
        r"(?:জেলায়|জেলা)\s*([\u0980-\u09FFA-Za-z\-\s]{2,40})",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            value = re.sub(r"\s+", " ", m.group(1)).strip(" .,")
            if len(value) >= 2:
                return value
    return ""


def _certainty(text: str) -> str:
    t = text.lower()
    for term in SUSPECTED_TERMS:
        if term in t:
            return "suspected"
    return "confirmed"


def _incident_id(url: str, headline: str) -> str:
    key = f"{url}|{headline}".encode("utf-8")
    return hashlib.sha1(key).hexdigest()[:16]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(PARSED_IN))
    parser.add_argument("--output", default=str(OUT_CSV))
    args = parser.parse_args()

    df = pd.read_parquet(args.input)
    rows = []

    for _, row in df.iterrows():
        headline = str(row.get("headline", ""))
        body = str(row.get("body", ""))
        url = str(row.get("url", ""))
        source = str(row.get("domain", ""))
        date_published = str(row.get("date_published", ""))

        text = _norm_digits(f"{headline}. {body}")
        deaths = _extract_first_int(text, DEATH_PATTERNS)
        hospitalized = _extract_first_int(text, HOSPITAL_PATTERNS)

        if deaths is None and hospitalized is None:
            continue

        date_occurred = _extract_date_occurred(text)
        location_text_raw = _extract_location_text(text)

        rows.append(
            {
                "incident_id": _incident_id(url, headline),
                "date_occurred": date_occurred,
                "date_published": date_published,
                "deaths": deaths if deaths is not None else 0,
                "hospitalized": hospitalized if hospitalized is not None else 0,
                "location_text_raw": location_text_raw,
                "source": source,
                "url": url,
                "headline": headline,
                "certainty": _certainty(text),
                "extracted_at": datetime.now(UTC).isoformat(),
                "extractor_version": "rulebased-v1.0",
            }
        )

    out_df = pd.DataFrame(rows)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(out_path, index=False)
    print(f"Wrote {out_path} ({len(out_df)} rows)")


if __name__ == "__main__":
    main()
