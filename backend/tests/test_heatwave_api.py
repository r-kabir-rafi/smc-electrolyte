from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_heatwave_dates_daily() -> None:
    response = client.get("/api/v1/heatwave/dates?level=daily")
    assert response.status_code == 200
    payload = response.json()
    assert payload["level"] == "daily"
    assert len(payload["dates"]) > 0


def test_heatwave_choropleth_daily() -> None:
    dates = client.get("/api/v1/heatwave/dates?level=daily").json()["dates"]
    response = client.get(f"/api/v1/heatwave/choropleth?level=daily&date={dates[0]}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert len(payload["features"]) > 0


def test_heatwave_summary() -> None:
    response = client.get("/api/v1/heatwave/summary")
    assert response.status_code == 200
    payload = response.json()
    assert payload["country"] == "Bangladesh"
    assert "district_hotspots" in payload
