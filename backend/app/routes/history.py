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
def upsert_history():
    """
    POST /api/history
    Body: { "prompt": "...", "curator_summary": "...", "tracks": [...], "steer_history": [...] }

    Upserts by (user, normalized prompt): the frontend sends the session's
    current full state - tracks are already-resolved playable items, not LLM
    seeds, so a later resume needs no LLM call or catalog search. Called once
    the frontend's 30s played threshold is first crossed, and again on every
    subsequent queue modification (steering, Infinite Flow additions, track
    removal) so the saved entry always reflects what's actually in the queue.
    """
    data = request.get_json() or {}
    prompt = data.get("prompt", "").strip()
    curator_summary = data.get("curator_summary")
    tracks = data.get("tracks", [])
    steer_history = data.get("steer_history", [])

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if not isinstance(tracks, list) or len(tracks) == 0:
        return jsonify({"error": "tracks must be a non-empty list"}), 400

    store = _get_history_store()
    session_id = store.upsert(g.spotify_user_id, prompt, curator_summary, tracks, steer_history)
    return jsonify({"id": session_id}), 200


@history_bp.route("/history/<session_id>", methods=["DELETE"])
@require_session
def delete_history(session_id):
    store = _get_history_store()
    deleted = store.delete(session_id, g.spotify_user_id)
    if not deleted:
        return jsonify({"error": "History entry not found"}), 404
    return jsonify({"ok": True}), 200
