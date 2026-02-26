import pandas as pd


def test_incident_heatwave_panel_lags_present() -> None:
    panel = pd.read_parquet("data_processed/incident_heatwave_panel.parquet")
    assert len(panel) > 0
    for lag in range(8):
        assert f"lag_{lag}_intensity_score" in panel.columns
        assert f"lag_{lag}_match_strategy" in panel.columns


def test_incident_heatwave_panel_no_missing_lag_links() -> None:
    panel = pd.read_parquet("data_processed/incident_heatwave_panel.parquet")
    for lag in range(8):
        assert (panel[f"lag_{lag}_match_strategy"] == "missing").sum() == 0
