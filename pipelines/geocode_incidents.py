"""Map extracted incidents to Bangladesh district/upazila admin units."""

from __future__ import annotations

import argparse
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

INCIDENTS_IN = Path("data_processed/heatstroke_incidents.csv")
DISTRICT_GEOJSON = Path("data_processed/bd_admin_district.geojson")
UPAZILA_GEOJSON = Path("data_processed/bd_admin_upazila.geojson")
OUT_GEOJSON = Path("data_processed/heatstroke_incidents.geojson")


def _match_admin(text: str, upazila_df: pd.DataFrame, district_df: pd.DataFrame) -> tuple[str, str, str, float]:
    lookup = text.lower().strip()
    if not lookup:
        return "", "", "unknown", 0.0

    for _, row in upazila_df.iterrows():
        name = str(row["upazila_name"]).lower()
        if lookup in name or name in lookup:
            return str(row["district_code"]), str(row["upazila_code"]), "upazila", 0.9
    for _, row in district_df.iterrows():
        name = str(row["district_name"]).lower()
        if lookup in name or name in lookup:
            return str(row["district_code"]), "", "district", 0.7

    return "", "", "unknown", 0.0


def _geometry_for_match(
    district_code: str,
    upazila_code: str,
    level: str,
    district_gdf: gpd.GeoDataFrame,
    upazila_gdf: gpd.GeoDataFrame,
) -> Point | None:
    if level == "upazila" and upazila_code:
        matched = upazila_gdf[upazila_gdf["upazila_code"] == upazila_code]
        if not matched.empty:
            return matched.iloc[0].geometry.centroid
    if level == "district" and district_code:
        matched = district_gdf[district_gdf["district_code"] == district_code]
        if not matched.empty:
            return matched.iloc[0].geometry.centroid
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(INCIDENTS_IN))
    parser.add_argument("--output", default=str(OUT_GEOJSON))
    args = parser.parse_args()

    incidents = pd.read_csv(args.input)
    district_gdf = gpd.read_file(DISTRICT_GEOJSON)
    upazila_gdf = gpd.read_file(UPAZILA_GEOJSON)

    district_df = district_gdf[["district_code", "district_name"]].copy()
    upazila_df = upazila_gdf[["upazila_code", "upazila_name", "district_code", "district_name"]].copy()

    out_rows = []
    geometries = []

    for _, row in incidents.iterrows():
        text = str(row.get("location_text_raw", ""))
        district_code, upazila_code, admin_level, score = _match_admin(text, upazila_df, district_df)

        geom = _geometry_for_match(
            district_code=district_code,
            upazila_code=upazila_code,
            level=admin_level,
            district_gdf=district_gdf,
            upazila_gdf=upazila_gdf,
        )

        out = row.to_dict()
        out["district_code"] = district_code
        out["upazila_code"] = upazila_code
        out["admin_level"] = admin_level
        out["location_precision_score"] = score

        out_rows.append(out)
        geometries.append(geom)

    gdf = gpd.GeoDataFrame(out_rows, geometry=geometries, crs="EPSG:4326")
    gdf = gdf[~gdf.geometry.isna()].copy()

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(out_path, driver="GeoJSON")

    mapped_rate = (len(gdf) / max(1, len(incidents))) * 100
    print(f"Wrote {out_path} ({len(gdf)} mapped incidents)")
    print(f"Mapped to district/upazila: {mapped_rate:.1f}%")


if __name__ == "__main__":
    main()
