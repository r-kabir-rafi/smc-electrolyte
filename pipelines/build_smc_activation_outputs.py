"""Generate business-ready SMC market activation outputs from priority index."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

PRIORITY_CSV = Path("data_processed/smc_priority_index.csv")
OUT_PRIORITY = Path("docs/smc_activation/priority_areas.md")
OUT_THEMES = Path("docs/smc_activation/messaging_themes.md")
OUT_CALENDAR = Path("docs/smc_activation/timing_calendar.md")
ONEPAGER_DIR = Path("docs/smc_activation/one_pagers")


def _distribution_points() -> list[str]:
    return [
        "Wholesale medicine market nodes",
        "Bus terminals and launch/rail stations",
        "High-footfall marketplaces and bazaars",
        "Factory-gate kiosks near industrial clusters",
        "School/college canteen partnerships",
        "Community clinics and pharmacy counters",
    ]


def _district_action_pack(district: str, rank: int, score: float, why: str) -> str:
    return "\n".join(
        [
            f"# {district} — SMC Heatwave Activation One-Pager",
            "",
            f"Priority rank: **{rank}**",
            f"Priority score: **{score:.3f}**",
            "",
            "## Why this district",
            f"- {why}",
            "- Combined high values in heatwave forecast, population exposure, and movement proxy.",
            "",
            "## Suggested distribution actions",
            "- Pre-position electrolyte stock at district wholesale depots.",
            "- Activate bus terminal and marketplace micro-distribution stalls.",
            "- Coordinate with pharmacies for visible counter placement.",
            "",
            "## Suggested messaging",
            "- Outdoor workers: Hydrate every 20–30 minutes; carry sachets during shift.",
            "- Students: Add electrolyte to school commute and sports routines.",
            "- Transport hubs: Rapid rehydration reminder for drivers/helpers.",
            "- Market vendors: Midday heat protection + hydration bundle promotions.",
            "",
            "## KPIs to track (weekly)",
            "- Outlet activation count",
            "- Stockout rate",
            "- Unit sales uplift vs non-priority districts",
            "- Message recall at point-of-sale",
        ]
    )


def main() -> None:
    df = pd.read_csv(PRIORITY_CSV)

    districts = (
        df[df["area_type"] == "district"]
        .sort_values("smc_priority_score", ascending=False)
        .head(20)
        .copy()
    )
    upazilas = (
        df[df["area_type"] == "upazila"]
        .sort_values("smc_priority_score", ascending=False)
        .head(20)
        .copy()
    )

    lines = [
        "# SMC Priority Areas",
        "",
        "## Top Districts",
    ]
    for _, r in districts.iterrows():
        lines.append(
            f"- {r['district_name']} (rank {int(r['smc_priority_rank'])}, score {r['smc_priority_score']:.3f})"
        )

    lines.extend(["", "## Top Upazilas", ""]) 
    for _, r in upazilas.iterrows():
        lines.append(
            f"- {r['upazila_name']} — {r['district_name']} (rank {int(r['smc_priority_rank'])}, score {r['smc_priority_score']:.3f})"
        )

    lines.extend(["", "## Recommended Distribution Points", ""]) 
    for p in _distribution_points():
        lines.append(f"- {p}")

    OUT_PRIORITY.parent.mkdir(parents=True, exist_ok=True)
    OUT_PRIORITY.write_text("\n".join(lines), encoding="utf-8")

    themes = "\n".join(
        [
            "# Messaging Themes by Segment",
            "",
            "- Outdoor workers: \"Prevent heat exhaustion on shift; hydrate early and often.\"",
            "- Students: \"Carry electrolyte for commute, classes, and sports.\"",
            "- Transport hubs: \"Drivers/helpers need rapid rehydration during long routes.\"",
            "- Marketplaces: \"Midday hydration keeps productivity and safety up.\"",
            "",
            "Channel suggestions: bus terminal kiosks, POS posters, pharmacy shelf-talkers, school canteen displays.",
        ]
    )
    OUT_THEMES.write_text(themes, encoding="utf-8")

    calendar = "\n".join(
        [
            "# Heatwave Activation Timing Calendar",
            "",
            "## Pre-heatwave (D-7 to D-1)",
            "- Increase depot inventory and field stock coverage.",
            "- Push awareness messaging in schools, transport nodes, and labor clusters.",
            "",
            "## During heatwave (D0 to D+7)",
            "- Daily replenishment to high-throughput outlets.",
            "- Intensify midday communication bursts (11am-4pm).",
            "- Run bundled offers near terminals/markets.",
            "",
            "## Post-heatwave review (D+8 onward)",
            "- Measure sell-through and stockout trends.",
            "- Update next-cycle district rank tuning.",
        ]
    )
    OUT_CALENDAR.write_text(calendar, encoding="utf-8")

    ONEPAGER_DIR.mkdir(parents=True, exist_ok=True)
    for _, r in districts.iterrows():
        district = str(r["district_name"])
        rank = int(r["smc_priority_rank"])
        score = float(r["smc_priority_score"])
        why = str(r["explainability_note"])
        content = _district_action_pack(district=district, rank=rank, score=score, why=why)
        fname = district.lower().replace(" ", "_") + ".md"
        (ONEPAGER_DIR / fname).write_text(content, encoding="utf-8")

    print(f"Wrote {OUT_PRIORITY}")
    print(f"Wrote {OUT_THEMES}")
    print(f"Wrote {OUT_CALENDAR}")
    print(f"Wrote district one-pagers in {ONEPAGER_DIR}")


if __name__ == "__main__":
    main()
