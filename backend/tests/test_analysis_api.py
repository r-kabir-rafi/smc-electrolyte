from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_analysis_metrics_endpoint() -> None:
    response = client.get("/api/v1/analysis/metrics")
    assert response.status_code == 200
    payload = response.json()
    assert "lag_correlations" in payload
    assert "count_models" in payload


def test_analysis_heatmap_endpoint() -> None:
    response = client.get("/api/v1/analysis/heatmap")
    assert response.status_code == 200
    payload = response.json()
    assert "matrix" in payload
