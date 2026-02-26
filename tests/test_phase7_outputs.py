from pathlib import Path

import pandas as pd
import tifffile


def test_population_outputs_exist() -> None:
    assert Path("data_processed/pop_density.tif").exists()
    assert Path("data_processed/pop_density_admin.parquet").exists()


def test_population_admin_has_district_metrics() -> None:
    df = pd.read_parquet("data_processed/pop_density_admin.parquet")
    assert len(df) > 0
    for col in ["district_code", "mean_pop_density", "population_exposed_proxy"]:
        assert col in df.columns


def test_mobility_proxy_ranking() -> None:
    df = pd.read_parquet("data_processed/mobility_proxy.parquet")
    assert len(df) > 0
    assert "movement_intensity_proxy" in df.columns
    assert "movement_rank" in df.columns
    assert df["movement_rank"].min() == 1


def test_pop_tif_readable() -> None:
    arr = tifffile.imread("data_processed/pop_density.tif")
    assert arr.ndim == 2
    assert arr.shape[0] > 0 and arr.shape[1] > 0
