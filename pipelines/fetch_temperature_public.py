"""Fetch public historical temperature data (template).

This script documents the expected fetch flow for real data ingestion.
In restricted environments, use generate_demo_temperature.py.
"""

from __future__ import annotations


def main() -> None:
    print("Primary source: ERA5-Land daily Tmax via Copernicus CDS API")
    print("Backup source: NASA POWER / Berkeley Earth")
    print("Implement provider credentials and download logic for production runs.")
    print("For local/demo execution: python3 pipelines/generate_demo_temperature.py")


if __name__ == "__main__":
    main()
