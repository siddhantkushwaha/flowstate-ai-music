import logging
from app.config import Config
from app.llm.base import BaseLLMClient

logger = logging.getLogger(__name__)


def get_llm_client() -> BaseLLMClient:
    """
    Factory function returning the configured LLM client instance.
    Supported providers: 'gemini', 'ollama'.
    Strictly uses the provider and model specified in the configuration.
    """
    provider = Config.LLM_PROVIDER

    if provider == "gemini":
        key = Config.GEMINI_API_KEY
        if not key:
            raise ValueError(
                "GEMINI_API_KEY is not set. Please provide a valid GEMINI_API_KEY in your .env"
            )
        from app.llm.gemini_client import GeminiLLMClient

        return GeminiLLMClient(api_key=key, model=Config.GEMINI_MODEL)

    elif provider == "ollama":
        from app.llm.ollama_client import OllamaLLMClient

        return OllamaLLMClient(
            base_url=Config.OLLAMA_BASE_URL, model=Config.OLLAMA_MODEL
        )

    else:
        raise ValueError(
            f"Unsupported LLM_PROVIDER '{provider}'. Supported providers: 'gemini', 'ollama'"
        )
