import geopandas as gpd

from pipelines.geocode_incidents import _match_admin


def test_match_admin_district() -> None:
    district_df = gpd.GeoDataFrame(
        [
            {"district_code": "BD-13", "district_name": "Dhaka"},
            {"district_code": "BD-10", "district_name": "Chattogram"},
        ]
    )
    upazila_df = gpd.GeoDataFrame(
        [
            {
                "upazila_code": "BD-10-41",
                "upazila_name": "Patiya",
                "district_code": "BD-10",
                "district_name": "Chattogram",
            }
        ]
    )

    district_code, upazila_code, level, score = _match_admin(
        "Chattogram",
        upazila_df,
        district_df,
    )

    assert district_code == "BD-10"
    assert upazila_code == ""
    assert level == "district"
    assert score > 0.0
