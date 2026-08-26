import logging
from flask import Blueprint, request, jsonify
from app.llm import get_llm_client
from app.llm.mock_client import MockLLMClient
from app.services.music_service import MusicService

logger = logging.getLogger(__name__)
feedback_bp = Blueprint("feedback", __name__)
music_service = MusicService()

@feedback_bp.route("/steer", methods=["POST"])
def steer():
    data = request.get_json() or {}
    current_track = data.get("current_track", "Unknown Track")
    feedback_text = data.get("feedback", "").strip()
    recent_skips = data.get("recent_skips", [])
    user_profile = data.get("user_profile")

    if not feedback_text:
        return jsonify({"error": "Feedback text is required"}), 400

    llm_client = get_llm_client()
    try:
        steer_result = llm_client.steer_queue(
            current_track=current_track,
            feedback=feedback_text,
            recent_skips=recent_skips,
            user_profile=user_profile
        )
    except Exception as e:
        logger.error(f"LLM steer error ({e}). Falling back to Mock client.", exc_info=True)
        fallback_client = MockLLMClient()
        steer_result = fallback_client.steer_queue(
            current_track=current_track,
            feedback=feedback_text,
            recent_skips=recent_skips,
            user_profile=user_profile
        )

    search_queries = music_service.prepare_catalog_search_queries(steer_result.added_seeds)

    return jsonify({
        "feedback": steer_result.feedback,
        "explanation": steer_result.explanation,
        "added_seeds": [seed.model_dump() for seed in steer_result.added_seeds],
        "tracks_to_remove": steer_result.tracks_to_remove,
        "catalog_queries": search_queries
    }), 200

@feedback_bp.route("/profile", methods=["POST"])
def update_profile():
    data = request.get_json() or {}
    current_profile = data.get("current_profile", "")
    liked_track = data.get("liked_track", "").strip()

    if not liked_track:
        return jsonify({"error": "liked_track is required"}), 400

    llm_client = get_llm_client()
    try:
        updated_profile = llm_client.update_user_profile(current_profile, liked_track)
    except Exception as e:
        logger.error(f"LLM profile error ({e}). Falling back to Mock client.", exc_info=True)
        fallback_client = MockLLMClient()
        updated_profile = fallback_client.update_user_profile(current_profile, liked_track)

    return jsonify({"updated_profile": updated_profile}), 200

@feedback_bp.route("/suggestions", methods=["POST"])
def get_suggestions():
    data = request.get_json() or {}
    prompt = data.get("prompt", "")
    current_track = data.get("current_track", "")
    queue_tracks = data.get("queue_tracks", [])
    user_profile = data.get("user_profile")

    llm_client = get_llm_client()
    try:
        suggestions = llm_client.generate_steer_suggestions(
            prompt=prompt,
            current_track=current_track,
            queue_tracks=queue_tracks,
            user_profile=user_profile
        )
    except Exception as e:
        logger.error(f"LLM suggestions error ({e}). Falling back to Mock client.", exc_info=True)
        fallback_client = MockLLMClient()
        suggestions = fallback_client.generate_steer_suggestions(
            prompt=prompt,
            current_track=current_track,
            queue_tracks=queue_tracks,
            user_profile=user_profile
        )

    return jsonify({"suggestions": suggestions}), 200
