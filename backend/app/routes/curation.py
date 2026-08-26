import logging
from flask import Blueprint, request, jsonify
from app.llm import get_llm_client
from app.llm.mock_client import MockLLMClient
from app.services.music_service import MusicService

logger = logging.getLogger(__name__)
curation_bp = Blueprint("curation", __name__)
music_service = MusicService()

@curation_bp.route("/curate", methods=["POST"])
def curate():
    """
    POST /api/curate
    Body: { "prompt": "natural language description", "user_profile": "optional profile context" }
    """
    data = request.get_json() or {}
    prompt = data.get("prompt", "").strip()
    user_profile = data.get("user_profile")

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    llm_client = get_llm_client()

    try:
        curation_result = llm_client.generate_seed_tracks(prompt=prompt, user_profile=user_profile)
    except Exception as e:
        logger.error(f"LLM curation provider error ({e}). Falling back to Mock curation.", exc_info=True)
        fallback_client = MockLLMClient()
        curation_result = fallback_client.generate_seed_tracks(prompt=prompt, user_profile=user_profile)

    search_queries = music_service.prepare_catalog_search_queries(curation_result.seeds)

    return jsonify({
        "prompt": curation_result.prompt,
        "curator_summary": curation_result.curator_summary,
        "seeds": [seed.model_dump() for seed in curation_result.seeds],
        "catalog_queries": search_queries
    }), 200

@curation_bp.route("/infinite-flow", methods=["POST"])
def infinite_flow():
    """
    POST /api/infinite-flow
    Body: {
        "initial_prompt": "original session prompt",
        "steer_history": ["feedback 1", "feedback 2"],
        "played_tracks": ["Artist - Track 1", "Artist - Track 2"],
        "current_track": "Artist - Current Track",
        "user_profile": "optional profile context"
    }
    """
    data = request.get_json() or {}
    initial_prompt = data.get("initial_prompt", "").strip() or "Continuous music flow"
    steer_history = data.get("steer_history", [])
    played_tracks = data.get("played_tracks", [])
    current_track = data.get("current_track")
    user_profile = data.get("user_profile")

    llm_client = get_llm_client()

    try:
        curation_result = llm_client.extend_infinite_queue(
            initial_prompt=initial_prompt,
            steer_history=steer_history,
            played_tracks=played_tracks,
            current_track=current_track,
            user_profile=user_profile
        )
    except Exception as e:
        logger.error(f"LLM infinite flow error ({e}). Falling back to Mock curation.", exc_info=True)
        fallback_client = MockLLMClient()
        curation_result = fallback_client.extend_infinite_queue(
            initial_prompt=initial_prompt,
            steer_history=steer_history,
            played_tracks=played_tracks,
            current_track=current_track,
            user_profile=user_profile
        )

    search_queries = music_service.prepare_catalog_search_queries(curation_result.seeds)

    return jsonify({
        "prompt": curation_result.prompt,
        "curator_summary": curation_result.curator_summary,
        "seeds": [seed.model_dump() for seed in curation_result.seeds],
        "catalog_queries": search_queries
    }), 200

