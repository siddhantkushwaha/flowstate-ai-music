import os
from dotenv import load_dotenv

# Load root .env first, fallback to standard locations
root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.env"))
if os.path.exists(root_env):
    load_dotenv(root_env)
else:
    load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()  # 'gemini', 'ollama'

    # Google Gemini Configuration
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemma-2-27b-it")

    # Spotify Configuration for frontend client discovery
    SPOTIFY_CLIENT_ID = os.getenv(
        "SPOTIFY_CLIENT_ID", os.getenv("VITE_SPOTIFY_CLIENT_ID", "")
    )

    # Ollama Local LLM Configuration
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

    # Lazy-refresh SQLite cache for /curate results (see app/services/cache_service.py).
    # Point this at a persistent volume in containerized deployments.
    CACHE_DB_PATH = os.getenv(
        "CACHE_DB_PATH",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/cache.sqlite3")),
    )
    CACHE_RETENTION_SECONDS = int(os.getenv("CACHE_RETENTION_SECONDS", str(7 * 24 * 3600)))
