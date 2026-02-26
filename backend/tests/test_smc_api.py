from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_priority_index_endpoint() -> None:
    response = client.get("/api/v1/smc/priority-index?area_type=district&limit=5")
    assert response.status_code == 200
    assert len(response.json()) > 0


def test_priority_map_endpoint() -> None:
    response = client.get("/api/v1/smc/priority-map")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("type") == "FeatureCollection"
