from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_population_exposure_endpoint() -> None:
    response = client.get("/api/v1/exposure/population-districts")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"


def test_mobility_ranking_endpoint() -> None:
    response = client.get("/api/v1/exposure/mobility-ranking?limit=5")
    assert response.status_code == 200
    assert len(response.json()) > 0
