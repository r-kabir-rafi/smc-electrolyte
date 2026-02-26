from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_districts_collection() -> None:
    response = client.get("/api/v1/admin/districts")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert len(payload["features"]) > 0


def test_district_by_code() -> None:
    response = client.get("/api/v1/admin/districts/BD-13")
    assert response.status_code == 200
    payload = response.json()
    assert payload["properties"]["district_code"] == "BD-13"


def test_missing_district_code() -> None:
    response = client.get("/api/v1/admin/districts/BD-XX")
    assert response.status_code == 404


def test_upazila_by_code() -> None:
    response = client.get("/api/v1/admin/upazilas/BD-10-41")
    assert response.status_code == 200
    payload = response.json()
    assert payload["properties"]["upazila_code"] == "BD-10-41"
