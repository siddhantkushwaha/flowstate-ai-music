import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, Optional

_write_lock = threading.Lock()


class CurationCache:
    """
    Lazy-refresh SQLite cache for /curate results, keyed by normalized prompt text.
    On read: return the cached payload if present and younger than retention_seconds.
    On write: upsert the payload with the current timestamp.
    Callers are responsible for treating a miss (None) as a signal to call the LLM
    and then populate the cache via set().
    """

    def __init__(self, db_path: str, retention_seconds: int):
        self.db_path = db_path
        self.retention_seconds = retention_seconds
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path, timeout=10)

    def _init_db(self) -> None:
        with _write_lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS curation_cache (
                    prompt_key TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )

    @staticmethod
    def _normalize(prompt: str) -> str:
        return " ".join(prompt.strip().lower().split())

    def get(self, prompt: str) -> Optional[Dict[str, Any]]:
        key = self._normalize(prompt)
        with self._connect() as conn:
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
        with _write_lock, self._connect() as conn:
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
