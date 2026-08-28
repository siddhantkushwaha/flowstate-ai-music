import logging

import requests
from flask import Blueprint, jsonify, request

from app.auth import create_session_token

logger = logging.getLogger(__name__)
auth_bp = Blueprint("auth", __name__)

SPOTIFY_ME_URL = "https://api.spotify.com/v1/me"


@auth_bp.route("/auth/session", methods=["POST"])
def create_session():
    """
    POST /api/auth/session
    Body: { "access_token": "<spotify access token>" }

    Deliberate, scoped exception to "the backend never calls Spotify": this is
    the one place the backend verifies a Spotify access token, by calling
    /v1/me once, to mint a signed app session token tying our per-user
    storage to the verified Spotify identity.
    """
    data = request.get_json() or {}
    access_token = data.get("access_token", "").strip()
    if not access_token:
        return jsonify({"error": "access_token is required"}), 400

    try:
        resp = requests.get(
            SPOTIFY_ME_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
    except requests.RequestException as e:
        logger.error(f"Spotify /me verification request failed: {e}", exc_info=True)
        return jsonify({"error": "Failed to reach Spotify to verify session"}), 502

    if resp.status_code != 200:
        logger.warning(f"Spotify /me verification failed with status {resp.status_code}")
        return jsonify({"error": "Invalid or expired Spotify access token"}), 401

    profile = resp.json()
    spotify_user_id = profile.get("id")
    if not spotify_user_id:
        return jsonify({"error": "Spotify profile response missing user id"}), 502

    display_name = profile.get("display_name")
    session_token = create_session_token(spotify_user_id, display_name)

    return (
        jsonify(
            {
                "session_token": session_token,
                "user": {"id": spotify_user_id, "display_name": display_name},
            }
        ),
        200,
    )
