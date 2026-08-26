import pytest
from unittest.mock import MagicMock, patch
from app.config import Config
from app.llm import get_llm_client
from app.llm.base import BaseLLMClient, CurationResult, SteerResult
from app.llm.gemini_client import GeminiLLMClient
from app.llm.ollama_client import OllamaLLMClient


def test_get_llm_client_gemini():
    with patch.object(Config, "LLM_PROVIDER", "gemini"), patch.object(
        Config, "GEMINI_API_KEY", "test-api-key-12345"
    ), patch.object(Config, "GEMINI_MODEL", "gemini-2.5-flash"), patch(
        "google.genai.Client"
    ):
        client = get_llm_client()
        assert isinstance(client, GeminiLLMClient)
        assert client.model_name == "gemini-2.5-flash"


def test_get_llm_client_gemini_missing_key():
    with patch.object(Config, "LLM_PROVIDER", "gemini"), patch.object(
        Config, "GEMINI_API_KEY", ""
    ):
        with pytest.raises(ValueError, match="GEMINI_API_KEY is not set"):
            get_llm_client()


def test_get_llm_client_ollama():
    with patch.object(Config, "LLM_PROVIDER", "ollama"), patch.object(
        Config, "OLLAMA_BASE_URL", "http://localhost:11434"
    ), patch.object(Config, "OLLAMA_MODEL", "llama3"):
        client = get_llm_client()
        assert isinstance(client, OllamaLLMClient)
        assert client.model == "llama3"


def test_get_llm_client_unsupported_provider():
    with patch.object(Config, "LLM_PROVIDER", "invalid_provider"):
        with pytest.raises(ValueError, match="Unsupported LLM_PROVIDER"):
            get_llm_client()


def test_gemini_llm_client_uses_specified_model():
    with patch("google.genai.Client") as mock_client_cls:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_response = MagicMock()
        mock_response.text = '{"curator_summary": "Test", "seeds": [{"artist": "Artist A", "track_name": "Song A", "reasoning": "Good", "vibe_tags": ["chill"]}]}'
        mock_client.models.generate_content.return_value = mock_response

        client = GeminiLLMClient(api_key="fake-key-12345", model="gemini-2.5-flash")
        res = client.generate_seed_tracks("chill acoustic")

        assert isinstance(res, CurationResult)
        assert len(res.seeds) == 1
        assert res.seeds[0].artist == "Artist A"
        mock_client.models.generate_content.assert_called_once()
        call_kwargs = mock_client.models.generate_content.call_args.kwargs
        assert call_kwargs["model"] == "gemini-2.5-flash"


def test_gemini_llm_client_retries_with_sleep():
    from unittest.mock import MagicMock, patch
    from app.llm.gemini_client import GeminiLLMClient

    with patch("google.genai.Client") as mock_client_cls, patch(
        "time.sleep"
    ) as mock_sleep:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client
        mock_response = MagicMock()
        mock_response.text = '{"curator_summary": "Test", "seeds": []}'

        mock_client.models.generate_content.side_effect = [
            Exception("Rate limit 429"),
            Exception("Service unavailable 503"),
            mock_response,
        ]

        client = GeminiLLMClient(api_key="fake-key-12345", model="gemma-2-27b-it")
        res = client._call_with_retry(
            "test prompt", is_json=True, max_retries=3, initial_delay=1.0
        )

        assert res == '{"curator_summary": "Test", "seeds": []}'
        assert mock_client.models.generate_content.call_count == 3
        for call in mock_client.models.generate_content.call_args_list:
            assert call.kwargs["model"] == "gemma-2-27b-it"
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)


def test_gemini_llm_client_fails_after_max_retries():
    from unittest.mock import MagicMock, patch
    from app.llm.gemini_client import GeminiLLMClient

    with patch("google.genai.Client") as mock_client_cls, patch(
        "time.sleep"
    ) as mock_sleep:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client

        mock_client.models.generate_content.side_effect = Exception(
            "Persistent 500 error"
        )

        client = GeminiLLMClient(api_key="fake-key-12345", model="custom-model")
        with pytest.raises(Exception, match="Persistent 500 error"):
            client._call_with_retry(
                "test prompt", is_json=True, max_retries=2, initial_delay=0.5
            )

        assert mock_client.models.generate_content.call_count == 3
        for call in mock_client.models.generate_content.call_args_list:
            assert call.kwargs["model"] == "custom-model"
        assert mock_sleep.call_count == 2
