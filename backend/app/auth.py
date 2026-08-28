from functools import wraps
from typing import Optional

from flask import current_app, g, jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer

_SESSION_SALT = "flowstate-app-session"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SESSION_SALT)


def create_session_token(spotify_user_id: str, display_name: Optional[str]) -> str:
    return _serializer().dumps({"spotify_user_id": spotify_user_id, "display_name": display_name})


def decode_session_token(token: str) -> Optional[dict]:
    """Verifies the signature only - no max_age, so a session never expires on its own."""
    try:
        return _serializer().loads(token)
    except BadSignature:
        return None


def require_session(fn):
    """Resolves the authenticated spotify_user_id from the Authorization header
    into flask.g.spotify_user_id, or short-circuits with 401 if missing/invalid."""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header[7:] if auth_header.startswith("Bearer ") else None
        payload = decode_session_token(token) if token else None
        if not payload or not payload.get("spotify_user_id"):
            return jsonify({"error": "Missing or invalid session"}), 401
        g.spotify_user_id = payload["spotify_user_id"]
        return fn(*args, **kwargs)

    return wrapper
