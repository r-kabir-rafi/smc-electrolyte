"""Collect and parse public heatwave/heatstroke news articles.

Outputs:
- data_raw/news/articles.jsonl (raw html + parsed fields)
- data_intermediate/news_parsed.parquet

Modes:
- live collection from public search APIs + article pages
- offline demo generation for reproducible local development
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import pandas as pd
import requests
from bs4 import BeautifulSoup

RAW_OUT = Path("data_raw/news/articles.jsonl")
PARSED_OUT = Path("data_intermediate/news_parsed.parquet")

KEYWORDS = [
    "heatstroke",
    "heat wave",
    "তাপদাহ",
    "হিটস্ট্রোক",
    "গরমে মৃত্যু",
    "অতিরিক্ত গরম",
]

DOMAINS = [
    "thedailystar.net",
    "dhakatribune.com",
    "bdnews24.com",
    "newagebd.net",
    "prothomalo.com",
    "jugantor.com",
    "daily-sun.com",
]


def _request_json(url: str, timeout: int = 20) -> dict[str, Any] | None:
    try:
        response = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
        return response.json()
    except Exception:
        return None


def _gdelt_query(keyword: str, max_records: int) -> list[dict[str, Any]]:
    query = quote(f'("{keyword}") AND (Bangladesh OR Dhaka)')
    url = (
        "https://api.gdeltproject.org/api/v2/doc/doc?"
        f"query={query}&mode=ArtList&maxrecords={max_records}&format=json&sort=DateDesc"
    )
    payload = _request_json(url)
    if not payload:
        return []
    return payload.get("articles", [])


def _extract_domain(url: str) -> str:
    m = re.match(r"https?://([^/]+)", url)
    return (m.group(1).lower() if m else "").replace("www.", "")


def _parse_article_html(html: str) -> tuple[str, str, str]:
    soup = BeautifulSoup(html, "lxml")

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        og = soup.find("meta", attrs={"property": "og:title"})
        if og and og.get("content"):
            title = og["content"].strip()

    pub_date = ""
    date_meta = soup.find("meta", attrs={"property": "article:published_time"})
    if date_meta and date_meta.get("content"):
        pub_date = date_meta["content"].strip()
    if not pub_date:
        date_meta = soup.find("meta", attrs={"name": "pubdate"})
        if date_meta and date_meta.get("content"):
            pub_date = date_meta["content"].strip()

    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    body = "\n".join([p for p in paragraphs if len(p) > 20])

    return title, pub_date, body


def _fetch_article(url: str) -> tuple[str, str, str, str] | None:
    try:
        response = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
    except Exception:
        return None

    html = response.text
    title, pub_date, body = _parse_article_html(html)
    if not body:
        return None
    return title, pub_date, body, html


def _article_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _write_jsonl(rows: list[dict[str, Any]]) -> None:
    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    with RAW_OUT.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def _demo_rows(n_rows: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    districts = ["Dhaka", "Chattogram", "Rajshahi", "Khulna", "Barishal", "Sylhet"]
    years = list(range(2018, 2026))
    for idx in range(n_rows):
        district = districts[idx % len(districts)]
        year = years[idx % len(years)]
        day = (idx % 27) + 1
        month = (idx % 4) + 4
        published = f"{year}-{month:02d}-{day:02d}"
        deaths = (idx % 5) + 1
        hospitalized = (idx % 7) + 2
        url = f"https://demo.news.local/article-{idx:04d}"
        headline = f"Heatstroke claims {deaths} lives in {district} during severe heat wave"
        body = (
            f"Authorities reported {deaths} deaths and {hospitalized} hospitalized cases in {district} "
            f"after a prolonged heat wave. Health officials warned residents about heatstroke risks."
        )
        html = f"<html><head><title>{headline}</title></head><body><p>{body}</p></body></html>"
        rows.append(
            {
                "article_id": _article_id(url),
                "url": url,
                "domain": "demo.news.local",
                "search_keyword": "heatstroke",
                "date_published": published,
                "headline": headline,
                "body": body,
                "html_raw": html,
                "collected_at": datetime.now(UTC).isoformat(),
            }
        )
    return rows


def collect_live(max_per_keyword: int, max_articles: int) -> list[dict[str, Any]]:
    candidates: list[tuple[str, str]] = []
    seen_urls: set[str] = set()

    for keyword in KEYWORDS:
        articles = _gdelt_query(keyword, max_per_keyword)
        for entry in articles:
            url = str(entry.get("url", "")).strip()
            if not url or url in seen_urls:
                continue
            domain = _extract_domain(url)
            if domain and domain not in DOMAINS:
                continue
            seen_urls.add(url)
            candidates.append((keyword, url))
            if len(candidates) >= max_articles:
                break
        if len(candidates) >= max_articles:
            break

    rows: list[dict[str, Any]] = []
    for keyword, url in candidates:
        parsed = _fetch_article(url)
        if not parsed:
            continue
        title, pub_date, body, html = parsed
        rows.append(
            {
                "article_id": _article_id(url),
                "url": url,
                "domain": _extract_domain(url),
                "search_keyword": keyword,
                "date_published": pub_date,
                "headline": title,
                "body": body,
                "html_raw": html,
                "collected_at": datetime.now(UTC).isoformat(),
            }
        )

    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-per-keyword", type=int, default=120)
    parser.add_argument("--max-articles", type=int, default=1200)
    parser.add_argument("--demo", action="store_true", help="Generate demo corpus instead of live scraping")
    parser.add_argument("--demo-count", type=int, default=520)
    args = parser.parse_args()

    if args.demo:
        rows = _demo_rows(args.demo_count)
    else:
        rows = collect_live(max_per_keyword=args.max_per_keyword, max_articles=args.max_articles)
        if not rows:
            raise RuntimeError("No live articles collected. Try --demo in offline environments.")

    _write_jsonl(rows)

    parsed_df = pd.DataFrame(rows)
    parsed_df["headline"] = parsed_df["headline"].fillna("")
    parsed_df["body"] = parsed_df["body"].fillna("")
    parsed_df["is_relevant"] = (
        parsed_df["headline"].str.contains("heat|তাপ|হিট", case=False, regex=True)
        | parsed_df["body"].str.contains("heat|তাপ|হিট", case=False, regex=True)
    )
    PARSED_OUT.parent.mkdir(parents=True, exist_ok=True)
    parsed_df.to_parquet(PARSED_OUT, index=False)

    print(f"Wrote {RAW_OUT} ({len(rows)} rows)")
    print(f"Wrote {PARSED_OUT} ({len(parsed_df)} rows)")


if __name__ == "__main__":
    main()
