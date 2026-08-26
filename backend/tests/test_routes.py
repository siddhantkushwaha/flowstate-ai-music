import pytest
from app import create_app

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_health_check(client):
    rv = client.get("/api/health")
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert json_data["status"] == "healthy"

def test_curate_route(client):
    rv = client.post("/api/curate", json={"prompt": "Late night chill study vibes"})
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "seeds" in json_data
    assert "catalog_queries" in json_data
    assert len(json_data["seeds"]) > 0

def test_steer_route(client):
    rv = client.post("/api/steer", json={"current_track": "Test Track", "feedback": "Faster"})
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "added_seeds" in json_data
    assert "catalog_queries" in json_data

def test_suggestions_route(client):
    rv = client.post("/api/suggestions", json={"prompt": "Synthwave night drive", "current_track": "Daft Punk - One More Time"})
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "suggestions" in json_data
    assert len(json_data["suggestions"]) > 0

def test_infinite_flow_route(client):
    rv = client.post("/api/infinite-flow", json={
        "initial_prompt": "Late night chill study vibes",
        "steer_history": ["softer piano"],
        "played_tracks": ["Daft Punk - One More Time"],
        "current_track": "Daft Punk - One More Time"
    })
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "seeds" in json_data
    assert "catalog_queries" in json_data
    assert len(json_data["seeds"]) > 0

