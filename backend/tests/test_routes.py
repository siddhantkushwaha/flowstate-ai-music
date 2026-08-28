import pytest
from unittest.mock import MagicMock, patch
from app import create_app
from app.config import Config
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


def test_curate_route_uses_lazy_cache(tmp_path):
    app = create_app()
    app.config["TESTING"] = True

    mock_llm = MagicMock()
    mock_llm.generate_seed_tracks.return_value = CurationResult(
        prompt="Cached prompt test",
        curator_summary="Cached mix",
        seeds=[
            SeedTrack(artist="A", track_name="T", reasoning="r", vibe_tags=[])
        ],
    )

    with patch("app.routes.curation.get_llm_client", return_value=mock_llm), patch.object(
        Config, "DB_PATH", str(tmp_path / "flowstate.sqlite3")
    ):
        with app.test_client() as c:
            rv1 = c.post("/api/curate", json={"prompt": "Cached prompt test"})
            assert rv1.status_code == 200
            assert rv1.get_json()["cached"] is False

            rv2 = c.post("/api/curate", json={"prompt": "Cached prompt test"})
            assert rv2.status_code == 200
            body2 = rv2.get_json()
            assert body2["cached"] is True
            assert body2["curator_summary"] == "Cached mix"
            assert body2["catalog_queries"][0]["artist"] == "A"

    # LLM should only be called once - the second request was served from cache.
    assert mock_llm.generate_seed_tracks.call_count == 1


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


def _mock_spotify_me_response(status_code=200, spotify_id="user123", display_name="Test User"):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = {"id": spotify_id, "display_name": display_name}
    return resp


def test_auth_session_route_valid_token(client):
    with patch("app.routes.auth.requests.get", return_value=_mock_spotify_me_response()):
        rv = client.post("/api/auth/session", json={"access_token": "valid-spotify-token"})
    assert rv.status_code == 200
    json_data = rv.get_json()
    assert "session_token" in json_data
    assert json_data["user"]["id"] == "user123"
    assert json_data["user"]["display_name"] == "Test User"


def test_auth_session_route_invalid_token(client):
    with patch("app.routes.auth.requests.get", return_value=_mock_spotify_me_response(status_code=401)):
        rv = client.post("/api/auth/session", json={"access_token": "bad-token"})
    assert rv.status_code == 401


def test_auth_session_route_missing_access_token(client):
    rv = client.post("/api/auth/session", json={})
    assert rv.status_code == 400


def _get_session_token(client):
    with patch("app.routes.auth.requests.get", return_value=_mock_spotify_me_response()):
        rv = client.post("/api/auth/session", json={"access_token": "valid-spotify-token"})
    return rv.get_json()["session_token"]


def test_history_and_profile_routes_require_session(client):
    assert client.get("/api/history").status_code == 401
    assert client.post("/api/history", json={"prompt": "x", "tracks": [{"id": "t1"}]}).status_code == 401
    assert client.get("/api/profile").status_code == 401
    assert client.post("/api/profile", json={"liked_track": "x"}).status_code == 401


def test_history_crud_roundtrip(client, tmp_path):
    with patch.object(Config, "DB_PATH", str(tmp_path / "flowstate.sqlite3")):
        token = _get_session_token(client)
        headers = {"Authorization": f"Bearer {token}"}

        rv = client.get("/api/history", headers=headers)
        assert rv.status_code == 200
        assert rv.get_json()["history"] == []

        rv = client.post(
            "/api/history",
            json={"prompt": "chill vibes", "curator_summary": "Chill mix", "tracks": [{"id": "t1"}]},
            headers=headers,
        )
        assert rv.status_code == 201
        session_id = rv.get_json()["id"]

        rv = client.get("/api/history", headers=headers)
        entries = rv.get_json()["history"]
        assert len(entries) == 1
        assert entries[0]["id"] == session_id
        assert entries[0]["tracks"] == [{"id": "t1"}]

        rv = client.patch(
            f"/api/history/{session_id}",
            json={"steer_text": "faster", "added_tracks": [{"id": "t2"}]},
            headers=headers,
        )
        assert rv.status_code == 200

        entries = client.get("/api/history", headers=headers).get_json()["history"]
        assert entries[0]["tracks"] == [{"id": "t1"}, {"id": "t2"}]
        assert entries[0]["steer_history"] == ["faster"]

        rv = client.delete(f"/api/history/{session_id}", headers=headers)
        assert rv.status_code == 200
        assert client.get("/api/history", headers=headers).get_json()["history"] == []


def test_history_patch_missing_entry_returns_404(client, tmp_path):
    with patch.object(Config, "DB_PATH", str(tmp_path / "flowstate.sqlite3")):
        token = _get_session_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        rv = client.patch("/api/history/does-not-exist", json={"steer_text": "x"}, headers=headers)
        assert rv.status_code == 404


def test_history_is_scoped_per_user(client, tmp_path):
    with patch.object(Config, "DB_PATH", str(tmp_path / "flowstate.sqlite3")):
        token_a = _get_session_token(client)

        with patch(
            "app.routes.auth.requests.get",
            return_value=_mock_spotify_me_response(spotify_id="other-user", display_name="Other"),
        ):
            rv = client.post("/api/auth/session", json={"access_token": "other-token"})
        token_b = rv.get_json()["session_token"]

        client.post(
            "/api/history",
            json={"prompt": "user A prompt", "tracks": [{"id": "t1"}]},
            headers={"Authorization": f"Bearer {token_a}"},
        )

        rv = client.get("/api/history", headers={"Authorization": f"Bearer {token_b}"})
        assert rv.get_json()["history"] == []


def test_profile_get_and_post_roundtrip(client, tmp_path):
    with patch.object(Config, "DB_PATH", str(tmp_path / "flowstate.sqlite3")):
        token = _get_session_token(client)
        headers = {"Authorization": f"Bearer {token}"}

        rv = client.get("/api/profile", headers=headers)
        assert rv.status_code == 200
        assert rv.get_json()["profile"] == ""

        rv = client.post(
            "/api/profile",
            json={"current_profile": "", "liked_track": "Tycho - A Walk"},
            headers=headers,
        )
        assert rv.status_code == 200
        assert rv.get_json()["updated_profile"] == "Updated profile preference."

        rv = client.get("/api/profile", headers=headers)
        assert rv.get_json()["profile"] == "Updated profile preference."
