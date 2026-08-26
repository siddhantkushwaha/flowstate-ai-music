import pytest
from unittest.mock import MagicMock, patch
from app import create_app
from app.llm.base import CurationResult, SeedTrack, SteerResult


@pytest.fixture
def mock_llm():
    client = MagicMock()
    client.generate_seed_tracks.return_value = CurationResult(
        prompt="Late night chill study vibes",
        curator_summary="Chill mix",
        seeds=[
            SeedTrack(
                artist="Tycho",
                track_name="A Walk",
                reasoning="Chill beat",
                vibe_tags=["ambient"],
            )
        ],
    )
    client.steer_queue.return_value = SteerResult(
        feedback="Faster",
        explanation="Added faster tracks",
        added_seeds=[
            SeedTrack(
                artist="Justice",
                track_name="Genesis",
                reasoning="High energy",
                vibe_tags=["electro"],
            )
        ],
        tracks_to_remove=[],
    )
    client.update_user_profile.return_value = "Updated profile preference."
    client.generate_steer_suggestions.return_value = [
        "More Acoustic",
        "Faster BPM",
        "Retro 80s",
        "Deep Bass",
    ]
    client.extend_infinite_queue.return_value = CurationResult(
        prompt="Late night chill study vibes",
        curator_summary="Continuation mix",
        seeds=[
            SeedTrack(
                artist="Bonobo",
                track_name="Cirrus",
                reasoning="Deep groove",
                vibe_tags=["chill"],
            )
        ],
    )
    return client


@pytest.fixture
def client(mock_llm):
    app = create_app()
    app.config["TESTING"] = True
    with patch("app.routes.curation.get_llm_client", return_value=mock_llm), patch(
        "app.routes.feedback.get_llm_client", return_value=mock_llm
    ):
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
    assert json_data["seeds"][0]["artist"] == "Tycho"


def test_curate_route_error():
    app = create_app()
    app.config["TESTING"] = True
    with patch("app.routes.curation.get_llm_client") as mock_get:
        mock_client = MagicMock()
        mock_client.generate_seed_tracks.side_effect = RuntimeError(
            "API failure after retries"
        )
        mock_get.return_value = mock_client
        with app.test_client() as c:
            rv = c.post("/api/curate", json={"prompt": "Some vibe"})
            assert rv.status_code == 500
            assert "Failed to curate music" in rv.get_json()["error"]


def test_steer_route(client):
    rv = client.post(
        "/api/steer", json={"current_track": "Test Track", "feedback": "Faster"}
    )
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "added_seeds" in json_data
    assert "catalog_queries" in json_data


def test_suggestions_route(client):
    rv = client.post(
        "/api/suggestions",
        json={
            "prompt": "Synthwave night drive",
            "current_track": "Daft Punk - One More Time",
        },
    )
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "suggestions" in json_data
    assert len(json_data["suggestions"]) > 0


def test_infinite_flow_route(client):
    rv = client.post(
        "/api/infinite-flow",
        json={
            "initial_prompt": "Late night chill study vibes",
            "steer_history": ["softer piano"],
            "played_tracks": ["Daft Punk - One More Time"],
            "current_track": "Daft Punk - One More Time",
        },
    )
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "seeds" in json_data
    assert "catalog_queries" in json_data
    assert len(json_data["seeds"]) > 0
