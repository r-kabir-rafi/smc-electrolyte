from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_forecast_dates_endpoint() -> None:
    response = client.get("/api/v1/forecast/dates")
    assert response.status_code == 200
    assert len(response.json().get("dates", [])) > 0


def test_forecast_top_upazilas_endpoint() -> None:
    response = client.get("/api/v1/forecast/top-upazilas?limit=5")
    assert response.status_code == 200
    assert len(response.json()) > 0
