import json
import os
import sqlite3
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

_write_lock = threading.Lock()


def _connect(db_path: str) -> sqlite3.Connection:
    return sqlite3.connect(db_path, timeout=10)


def init_db(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    with _write_lock, _connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS curation_cache (
                prompt_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS taste_profiles (
                spotify_user_id TEXT PRIMARY KEY,
                profile TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS curated_sessions (
                id TEXT PRIMARY KEY,
                spotify_user_id TEXT NOT NULL,
                prompt_key TEXT NOT NULL,
                prompt TEXT NOT NULL,
                curator_summary TEXT,
                tracks TEXT NOT NULL,
                steer_history TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        # One row per (user, prompt): re-curating or steering the same prompt
        # updates the existing session in place instead of piling up rows.
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_curated_sessions_user_prompt ON curated_sessions(spotify_user_id, prompt_key)"
        )


class CurationCache:
    """
    Lazy-refresh cache for /curate results, keyed by normalized prompt text.
    On read: return the cached payload if present and younger than retention_seconds.
    On write: upsert the payload with the current timestamp.
    Callers are responsible for treating a miss (None) as a signal to call the LLM
    and then populate the cache via set().
    """

    def __init__(self, db_path: str, retention_seconds: int):
        self.db_path = db_path
        self.retention_seconds = retention_seconds
        init_db(db_path)

    @staticmethod
    def _normalize(prompt: str) -> str:
        return " ".join(prompt.strip().lower().split())

    def get(self, prompt: str) -> Optional[Dict[str, Any]]:
        key = self._normalize(prompt)
        with _connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT payload, updated_at FROM curation_cache WHERE prompt_key = ?",
                (key,),
            ).fetchone()
        if not row:
            return None
        payload, updated_at = row
        if time.time() - updated_at > self.retention_seconds:
            return None
        return json.loads(payload)

    def set(self, prompt: str, data: Dict[str, Any]) -> None:
        key = self._normalize(prompt)
        payload = json.dumps(data)
        with _write_lock, _connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO curation_cache (prompt_key, payload, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(prompt_key) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (key, payload, time.time()),
            )


class TasteProfileStore:
    """Rolling per-user taste profile text. No retention - it's a live profile, not history."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        init_db(db_path)

    def get(self, spotify_user_id: str) -> str:
        with _connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT profile FROM taste_profiles WHERE spotify_user_id = ?",
                (spotify_user_id,),
            ).fetchone()
        return row[0] if row else ""

    def set(self, spotify_user_id: str, profile: str) -> None:
        with _write_lock, _connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO taste_profiles (spotify_user_id, profile, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(spotify_user_id) DO UPDATE SET
                    profile = excluded.profile,
                    updated_at = excluded.updated_at
                """,
                (spotify_user_id, profile, time.time()),
            )


class CurationHistoryStore:
    """
    Per-user history of curated sessions the user actually played, with lazy
    retention: rows older than retention_seconds are excluded at read time
    (same style as CurationCache) rather than proactively deleted.

    Keyed by (user, normalized prompt) rather than an opaque session id the
    caller must track: the caller always sends the session's current full
    state (tracks, steer_history), so any queue modification - steering,
    Infinite Flow additions, track removal - is just another upsert of the
    same row, and re-curating an identical prompt later updates it in place
    instead of piling up duplicate rows.

    Known tradeoff: if the same account runs two parallel listening sessions
    (e.g. phone and laptop) that curate the *same* prompt at the same time,
    they'll upsert into the same row and the later write wins. Accepted as
    fine since it's the same user's own data either way - not worth the
    complexity of a per-device session id to avoid.
    """

    def __init__(self, db_path: str, retention_seconds: int):
        self.db_path = db_path
        self.retention_seconds = retention_seconds
        init_db(db_path)

    @staticmethod
    def _normalize(prompt: str) -> str:
        return " ".join(prompt.strip().lower().split())

    def upsert(
        self,
        spotify_user_id: str,
        prompt: str,
        curator_summary: Optional[str],
        tracks: List[Dict[str, Any]],
        steer_history: List[str],
    ) -> str:
        prompt_key = self._normalize(prompt)
        now = time.time()
        with _write_lock, _connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT id FROM curated_sessions WHERE spotify_user_id = ? AND prompt_key = ?",
                (spotify_user_id, prompt_key),
            ).fetchone()
            session_id = row[0] if row else uuid.uuid4().hex
            if row:
                conn.execute(
                    """
                    UPDATE curated_sessions
                    SET prompt = ?, curator_summary = ?, tracks = ?, steer_history = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (prompt, curator_summary, json.dumps(tracks), json.dumps(steer_history), now, session_id),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO curated_sessions
                        (id, spotify_user_id, prompt_key, prompt, curator_summary, tracks, steer_history, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session_id,
                        spotify_user_id,
                        prompt_key,
                        prompt,
                        curator_summary,
                        json.dumps(tracks),
                        json.dumps(steer_history),
                        now,
                        now,
                    ),
                )
        return session_id

    def list(self, spotify_user_id: str) -> List[Dict[str, Any]]:
        cutoff = time.time() - self.retention_seconds
        with _connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT id, prompt, curator_summary, tracks, steer_history, created_at, updated_at
                FROM curated_sessions
                WHERE spotify_user_id = ? AND updated_at >= ?
                ORDER BY updated_at DESC
                """,
                (spotify_user_id, cutoff),
            ).fetchall()
        return [
            {
                "id": row[0],
                "prompt": row[1],
                "curator_summary": row[2],
                "tracks": json.loads(row[3]),
                "steer_history": json.loads(row[4]),
                "created_at": row[5],
                "updated_at": row[6],
            }
            for row in rows
        ]

    def delete(self, session_id: str, spotify_user_id: str) -> bool:
        with _write_lock, _connect(self.db_path) as conn:
            cur = conn.execute(
                "DELETE FROM curated_sessions WHERE id = ? AND spotify_user_id = ?",
                (session_id, spotify_user_id),
            )
        return cur.rowcount > 0
