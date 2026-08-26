import logging
from flask import Blueprint, request, jsonify
from app.llm import get_llm_client
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

    try:
        llm_client = get_llm_client()
        steer_result = llm_client.steer_queue(
            current_track=current_track,
            feedback=feedback_text,
            recent_skips=recent_skips,
            user_profile=user_profile,
        )
        search_queries = music_service.prepare_catalog_search_queries(
            steer_result.added_seeds
        )

        return (
            jsonify(
                {
                    "feedback": steer_result.feedback,
                    "explanation": steer_result.explanation,
                    "added_seeds": [
                        seed.model_dump() for seed in steer_result.added_seeds
                    ],
                    "tracks_to_remove": steer_result.tracks_to_remove,
                    "catalog_queries": search_queries,
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"LLM steer error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to steer queue: {str(e)}"}), 500


@feedback_bp.route("/profile", methods=["POST"])
def update_profile():
    data = request.get_json() or {}
    current_profile = data.get("current_profile", "")
    liked_track = data.get("liked_track", "").strip()

    if not liked_track:
        return jsonify({"error": "liked_track is required"}), 400

    try:
        llm_client = get_llm_client()
        updated_profile = llm_client.update_user_profile(current_profile, liked_track)
        return jsonify({"updated_profile": updated_profile}), 200
    except Exception as e:
        logger.error(f"LLM profile error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to update profile: {str(e)}"}), 500


@feedback_bp.route("/suggestions", methods=["POST"])
def get_suggestions():
    data = request.get_json() or {}
    prompt = data.get("prompt", "")
    current_track = data.get("current_track", "")
    queue_tracks = data.get("queue_tracks", [])
    user_profile = data.get("user_profile")

    try:
        llm_client = get_llm_client()
        suggestions = llm_client.generate_steer_suggestions(
            prompt=prompt,
            current_track=current_track,
            queue_tracks=queue_tracks,
            user_profile=user_profile,
        )
        return jsonify({"suggestions": suggestions}), 200
    except Exception as e:
        logger.error(f"LLM suggestions error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate suggestions: {str(e)}"}), 500
