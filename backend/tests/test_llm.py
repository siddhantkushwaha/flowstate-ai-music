import pytest
from app.llm import get_llm_client
from app.llm.base import BaseLLMClient, CurationResult, SteerResult
from app.llm.mock_client import MockLLMClient

def test_mock_llm_client_derivation():
    client = MockLLMClient()
    assert isinstance(client, BaseLLMClient)

    # Test seed track generation
    res = client.generate_seed_tracks("Leg day workout pump")
    assert isinstance(res, CurationResult)
    assert len(res.seeds) > 0
    assert res.seeds[0].artist != ""
    assert res.seeds[0].track_name != ""

def test_mock_llm_steer_queue():
    client = MockLLMClient()
    res = client.steer_queue("Eminem - Till I Collapse", "Make it more rock")
    assert isinstance(res, SteerResult)
    assert len(res.added_seeds) > 0
    assert res.feedback == "Make it more rock"

def test_mock_llm_user_profile():
    client = MockLLMClient()
    profile = client.update_user_profile("", "Dreams - Fleetwood Mac")
    assert "Dreams - Fleetwood Mac" in profile

def test_mock_llm_extend_infinite_queue():
    client = MockLLMClient()
    res = client.extend_infinite_queue(
        initial_prompt="Workout energetic",
        steer_history=["more rock"],
        played_tracks=["Survivor - Eye of the Tiger"],
        current_track="Survivor - Eye of the Tiger",
    )
    assert isinstance(res, CurationResult)
    assert len(res.seeds) > 0
    # Ensure excluded track is not returned
    assert not any(s.track_name == "Eye of the Tiger" for s in res.seeds)

