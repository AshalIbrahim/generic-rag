import pytest
from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)


# ---- Home & Health ----
def test_home():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Zameen API is running"}


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ---- Listings ----
def test_get_listings():
    response = client.get("/listings?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) <= 5
    if data:
        for item in data:
            assert "prop_type" in item
            assert "location" in item
            assert "price" in item


def test_get_locations():
    response = client.get("/locations")
    assert response.status_code == 200
    data = response.json()
    assert "locations" in data
    assert isinstance(data["locations"], list)


def test_get_prop_type():
    response = client.get("/prop_type")
    assert response.status_code == 200
    data = response.json()
    assert "prop_type" in data
    assert isinstance(data["prop_type"], list)
