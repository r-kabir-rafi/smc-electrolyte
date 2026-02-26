from pathlib import Path

import geopandas as gpd
import pandas as pd


def test_priority_outputs_exist() -> None:
    assert Path("data_processed/smc_priority_index.csv").exists()
    assert Path("data_processed/smc_priority_map.geojson").exists()


def test_priority_index_explainable() -> None:
    df = pd.read_csv("data_processed/smc_priority_index.csv")
    assert len(df) > 0
    for col in ["heatwave_forecast_score", "pop_exposure_score", "mobility_proxy_score", "smc_priority_score", "explainability_note"]:
        assert col in df.columns


def test_priority_map_readable() -> None:
    gdf = gpd.read_file("data_processed/smc_priority_map.geojson")
    assert len(gdf) > 0


def test_activation_onepagers_exist() -> None:
    d = Path("docs/smc_activation/one_pagers")
    assert d.exists()
    assert len(list(d.glob("*.md"))) > 0
