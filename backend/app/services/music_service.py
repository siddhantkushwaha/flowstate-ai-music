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
        return self.prepare_catalog_search_queries_from_dicts(
            [seed.model_dump() for seed in seeds]
        )

    def prepare_catalog_search_queries_from_dicts(
        self, seeds: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Same as prepare_catalog_search_queries, but accepts plain dicts (e.g. seeds
        deserialized from the SQLite curation cache) instead of SeedTrack instances.
        """
        search_items = []
        for seed in seeds:
            query_term = f"{seed['track_name']} {seed['artist']}"
            search_items.append(
                {
                    "artist": seed["artist"],
                    "track_name": seed["track_name"],
                    "query_term": query_term,
                    "reasoning": seed.get("reasoning", ""),
                    "vibe_tags": seed.get("vibe_tags", []),
                }
            )
        return search_items
