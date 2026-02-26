import json
from pathlib import Path

import pandas as pd


def test_model_training_dataset_exists() -> None:
    path = Path("data_processed/model_training.parquet")
    assert path.exists()
    df = pd.read_parquet(path)
    assert len(df) > 1000
    for col in ["target_h1", "target_h3", "target_h7", "recent_tmax_trend_7d"]:
        assert col in df.columns


def test_model_beats_baseline() -> None:
    metrics = json.loads(Path("models/heatwave_predictor_metrics.json").read_text(encoding="utf-8"))
    assert any(v.get("beats_baseline") for v in metrics["horizons"].values())


def test_hotspot_outputs_exist() -> None:
    assert Path("data_processed/hotspots_next7days.geojson").exists()
    assert Path("data_processed/top_20_upazilas.csv").exists()
