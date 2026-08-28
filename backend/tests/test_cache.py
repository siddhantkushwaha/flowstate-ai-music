import time
from app.services.cache_service import CurationCache


def test_cache_miss_then_hit(tmp_path):
    db_path = str(tmp_path / "cache.sqlite3")
    cache = CurationCache(db_path, retention_seconds=3600)

    assert cache.get("chill lofi beats") is None

    cache.set(
        "Chill Lofi Beats",
        {
            "curator_summary": "s",
            "seeds": [
                {"artist": "A", "track_name": "T", "reasoning": "r", "vibe_tags": []}
            ],
        },
    )

    # Normalization (case/whitespace) should still hit the same entry.
    cached = cache.get("  chill   lofi beats ")
    assert cached is not None
    assert cached["curator_summary"] == "s"


def test_cache_respects_retention(tmp_path):
    db_path = str(tmp_path / "cache.sqlite3")
    cache = CurationCache(db_path, retention_seconds=1)
    cache.set("old vibe", {"curator_summary": "s", "seeds": []})
    assert cache.get("old vibe") is not None
    time.sleep(1.2)
    assert cache.get("old vibe") is None


def test_cache_set_overwrites_existing_entry(tmp_path):
    db_path = str(tmp_path / "cache.sqlite3")
    cache = CurationCache(db_path, retention_seconds=3600)
    cache.set("some vibe", {"curator_summary": "first", "seeds": []})
    cache.set("some vibe", {"curator_summary": "second", "seeds": []})
    assert cache.get("some vibe")["curator_summary"] == "second"
