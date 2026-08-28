import time
from app.services.db_service import CurationCache, CurationHistoryStore, TasteProfileStore


def test_cache_miss_then_hit(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
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
    db_path = str(tmp_path / "flowstate.sqlite3")
    cache = CurationCache(db_path, retention_seconds=1)
    cache.set("old vibe", {"curator_summary": "s", "seeds": []})
    assert cache.get("old vibe") is not None
    time.sleep(1.2)
    assert cache.get("old vibe") is None


def test_cache_set_overwrites_existing_entry(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    cache = CurationCache(db_path, retention_seconds=3600)
    cache.set("some vibe", {"curator_summary": "first", "seeds": []})
    cache.set("some vibe", {"curator_summary": "second", "seeds": []})
    assert cache.get("some vibe")["curator_summary"] == "second"


def test_taste_profile_get_defaults_to_empty_string(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = TasteProfileStore(db_path)
    assert store.get("user1") == ""


def test_taste_profile_set_then_get(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = TasteProfileStore(db_path)
    store.set("user1", "Loves ambient and lo-fi.")
    assert store.get("user1") == "Loves ambient and lo-fi."


def test_taste_profile_set_overwrites_and_is_scoped_per_user(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = TasteProfileStore(db_path)
    store.set("user1", "first")
    store.set("user1", "second")
    store.set("user2", "other user's profile")
    assert store.get("user1") == "second"
    assert store.get("user2") == "other user's profile"


def test_history_upsert_and_list(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = CurationHistoryStore(db_path, retention_seconds=3600)
    session_id = store.upsert("user1", "chill study vibes", "Chill mix", [{"id": "t1"}], [])

    entries = store.list("user1")
    assert len(entries) == 1
    assert entries[0]["id"] == session_id
    assert entries[0]["prompt"] == "chill study vibes"
    assert entries[0]["tracks"] == [{"id": "t1"}]
    assert entries[0]["steer_history"] == []


def test_history_list_is_scoped_per_user(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = CurationHistoryStore(db_path, retention_seconds=3600)
    store.upsert("user1", "prompt A", "summary", [{"id": "t1"}], [])
    store.upsert("user2", "prompt B", "summary", [{"id": "t2"}], [])

    assert len(store.list("user1")) == 1
    assert store.list("user1")[0]["prompt"] == "prompt A"
    assert len(store.list("user2")) == 1
    assert store.list("user2")[0]["prompt"] == "prompt B"


def test_history_respects_retention(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = CurationHistoryStore(db_path, retention_seconds=1)
    store.upsert("user1", "old prompt", "summary", [{"id": "t1"}], [])
    assert len(store.list("user1")) == 1
    time.sleep(1.2)
    assert store.list("user1") == []


def test_history_upsert_same_prompt_updates_existing_row_in_place(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = CurationHistoryStore(db_path, retention_seconds=3600)
    session_id = store.upsert("user1", "prompt", "summary", [{"id": "t1"}], [])

    # A later queue modification (steer, Infinite Flow addition, etc.) for the
    # same prompt should update the same row, not create a second one.
    same_id = store.upsert("user1", "prompt", "summary", [{"id": "t1"}, {"id": "t2"}], ["more energy"])
    assert same_id == session_id

    entries = store.list("user1")
    assert len(entries) == 1
    assert entries[0]["tracks"] == [{"id": "t1"}, {"id": "t2"}]
    assert entries[0]["steer_history"] == ["more energy"]


def test_history_upsert_normalizes_prompt_for_matching(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = CurationHistoryStore(db_path, retention_seconds=3600)
    session_id = store.upsert("user1", "Chill Vibes", "summary", [{"id": "t1"}], [])
    same_id = store.upsert("user1", "  chill   vibes ", "summary", [{"id": "t1"}, {"id": "t2"}], [])

    assert same_id == session_id
    assert len(store.list("user1")) == 1


def test_history_delete_is_scoped_per_user(tmp_path):
    db_path = str(tmp_path / "flowstate.sqlite3")
    store = CurationHistoryStore(db_path, retention_seconds=3600)
    session_id = store.upsert("user1", "prompt", "summary", [{"id": "t1"}], [])

    assert store.delete(session_id, "user2") is False
    assert store.delete(session_id, "user1") is True
    assert store.list("user1") == []
