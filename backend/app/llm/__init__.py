import logging
from app.config import Config
from app.llm.base import BaseLLMClient
from app.llm.mock_client import MockLLMClient

logger = logging.getLogger(__name__)

def get_llm_client() -> BaseLLMClient:
    """
    Factory function returning the configured LLM client instance.
    Supported providers: 'gemini', 'ollama', 'mock'.
    Defaults to MockLLMClient if API keys/servers are unavailable.
    """
    provider = Config.LLM_PROVIDER

    if provider == "gemini":
        key = Config.GEMINI_API_KEY
        if not key or key.startswith("AIzaSy...") or len(key) < 10:
            logger.warning("GEMINI_API_KEY is missing or invalid placeholder. Falling back to MockLLMClient.")
            return MockLLMClient()
        try:
            from app.llm.gemini_client import GeminiLLMClient
            return GeminiLLMClient(api_key=key, model=Config.GEMINI_MODEL)
        except Exception as e:
            logger.warning(f"Failed to initialize GeminiLLMClient ({e}). Falling back to MockLLMClient.")
            return MockLLMClient()

    elif provider == "ollama":
        try:
            from app.llm.ollama_client import OllamaLLMClient
            return OllamaLLMClient(base_url=Config.OLLAMA_BASE_URL, model=Config.OLLAMA_MODEL)
        except Exception as e:
            logger.warning(f"Failed to initialize OllamaLLMClient ({e}). Falling back to MockLLMClient.")
            return MockLLMClient()

    else:
        return MockLLMClient()
