import logging

from flask import Blueprint, g, jsonify, request

from app.auth import require_session
from app.config import Config
from app.services.db_service import CurationHistoryStore

logger = logging.getLogger(__name__)
history_bp = Blueprint("history", __name__)


def _get_history_store() -> CurationHistoryStore:
    return CurationHistoryStore(Config.DB_PATH, Config.HISTORY_RETENTION_SECONDS)


@history_bp.route("/history", methods=["GET"])
@require_session
def list_history():
    store = _get_history_store()
    return jsonify({"history": store.list(g.spotify_user_id)}), 200


@history_bp.route("/history", methods=["POST"])
@require_session
def create_history():
    """
    POST /api/history
    Body: { "prompt": "...", "curator_summary": "...", "tracks": [resolved track objects] }

    Called once per curated session, the moment the frontend's 30s played
    threshold is crossed - tracks are already-resolved playable items, not
    LLM seeds, so a later resume needs no LLM call or catalog search.
    """
    data = request.get_json() or {}
    prompt = data.get("prompt", "").strip()
    curator_summary = data.get("curator_summary")
    tracks = data.get("tracks", [])

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if not isinstance(tracks, list) or len(tracks) == 0:
        return jsonify({"error": "tracks must be a non-empty list"}), 400

    store = _get_history_store()
    session_id = store.create(g.spotify_user_id, prompt, curator_summary, tracks)
    return jsonify({"id": session_id}), 201


@history_bp.route("/history/<session_id>", methods=["PATCH"])
@require_session
def patch_history(session_id):
    """
    PATCH /api/history/<id>
    Body: { "steer_text": "...", "added_tracks": [resolved track objects] }

    Appends a steer's feedback text and newly added tracks to an already-saved
    session, matching the app's "steering extends the same queue" model.
    """
    data = request.get_json() or {}
    steer_text = data.get("steer_text")
    added_tracks = data.get("added_tracks", [])

    store = _get_history_store()
    found = store.patch(session_id, g.spotify_user_id, steer_text, added_tracks)
    if not found:
        return jsonify({"error": "History entry not found"}), 404
    return jsonify({"ok": True}), 200


@history_bp.route("/history/<session_id>", methods=["DELETE"])
@require_session
def delete_history(session_id):
    store = _get_history_store()
    deleted = store.delete(session_id, g.spotify_user_id)
    if not deleted:
        return jsonify({"error": "History entry not found"}), 404
    return jsonify({"ok": True}), 200
