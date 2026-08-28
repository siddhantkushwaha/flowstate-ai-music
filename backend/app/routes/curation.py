import logging
from flask import Blueprint, request, jsonify
from app.config import Config
from app.llm import get_llm_client
from app.services.music_service import MusicService
from app.services.db_service import CurationCache

logger = logging.getLogger(__name__)
curation_bp = Blueprint("curation", __name__)
music_service = MusicService()


def _get_curation_cache() -> CurationCache:
    return CurationCache(Config.DB_PATH, Config.CACHE_RETENTION_SECONDS)


@curation_bp.route("/curate", methods=["POST"])
def curate():
    """
    POST /api/curate
    Body: { "prompt": "natural language description", "user_profile": "optional profile context" }

    Lazy-refresh cache: check the SQLite cache for this prompt first. On a hit
    (and still within retention), skip the LLM entirely. On a miss, call the LLM
    and cache the result for next time.
    """
    data = request.get_json() or {}
    prompt = data.get("prompt", "").strip()
    user_profile = data.get("user_profile")

    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    cache = _get_curation_cache()

    try:
        cached = cache.get(prompt)
        if cached:
            search_queries = music_service.prepare_catalog_search_queries_from_dicts(
                cached["seeds"]
            )
            return (
                jsonify(
                    {
                        "prompt": prompt,
                        "curator_summary": cached["curator_summary"],
                        "seeds": cached["seeds"],
                        "catalog_queries": search_queries,
                        "cached": True,
                    }
                ),
                200,
            )

        llm_client = get_llm_client()
        curation_result = llm_client.generate_seed_tracks(
            prompt=prompt, user_profile=user_profile
        )
        search_queries = music_service.prepare_catalog_search_queries(
            curation_result.seeds
        )
        seeds_payload = [seed.model_dump() for seed in curation_result.seeds]

        cache.set(
            prompt,
            {
                "curator_summary": curation_result.curator_summary,
                "seeds": seeds_payload,
            },
        )

        return (
            jsonify(
                {
                    "prompt": curation_result.prompt,
                    "curator_summary": curation_result.curator_summary,
                    "seeds": seeds_payload,
                    "catalog_queries": search_queries,
                    "cached": False,
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"LLM curation provider error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to curate music: {str(e)}"}), 500


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

    try:
        llm_client = get_llm_client()
        curation_result = llm_client.extend_infinite_queue(
            initial_prompt=initial_prompt,
            steer_history=steer_history,
            played_tracks=played_tracks,
            current_track=current_track,
            user_profile=user_profile,
        )
        search_queries = music_service.prepare_catalog_search_queries(
            curation_result.seeds
        )

        return (
            jsonify(
                {
                    "prompt": curation_result.prompt,
                    "curator_summary": curation_result.curator_summary,
                    "seeds": [seed.model_dump() for seed in curation_result.seeds],
                    "catalog_queries": search_queries,
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"LLM infinite flow error: {e}", exc_info=True)
        return jsonify({"error": f"Failed to extend infinite flow: {str(e)}"}), 500
