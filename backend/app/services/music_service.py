from typing import List, Dict, Any
from app.llm.base import SeedTrack


class MusicService:
    """
    Service layer to handle catalog queries and track metadata mapping for frontend Spotify player lookup.
    """

    def prepare_catalog_search_queries(
        self, seeds: List[SeedTrack]
    ) -> List[Dict[str, Any]]:
        """
        Formats seed tracks into standardized search queries for frontend Spotify Web API lookup.
        """
        search_items = []
        for seed in seeds:
            query_term = f"{seed.track_name} {seed.artist}"
            search_items.append(
                {
                    "artist": seed.artist,
                    "track_name": seed.track_name,
                    "query_term": query_term,
                    "reasoning": seed.reasoning,
                    "vibe_tags": seed.vibe_tags,
                }
            )
        return search_items
