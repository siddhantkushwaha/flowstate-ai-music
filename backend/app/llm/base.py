from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel, Field

class SeedTrack(BaseModel):
    artist: str = Field(..., description="Exact artist name")
    track_name: str = Field(..., description="Exact song title")
    reasoning: str = Field(..., description="1-sentence explanation of why lyrics/vibes match")
    vibe_tags: List[str] = Field(default_factory=list, description="Tags like energetic, melancholic, acoustic")

class CurationResult(BaseModel):
    prompt: str
    seeds: List[SeedTrack]
    curator_summary: str = Field(..., description="Brief commentary on the theme of this session")

class SteerResult(BaseModel):
    feedback: str
    added_seeds: List[SeedTrack]
    tracks_to_remove: List[str] = Field(default_factory=list)
    explanation: str

class BaseLLMClient(ABC):
    """
    Abstract Base Class for LLM providers.
    All LLM clients (OpenAI, Anthropic, Mock, etc.) must implement these methods.
    """

    @abstractmethod
    def generate_seed_tracks(
        self, prompt: str, user_profile: Optional[str] = None
    ) -> CurationResult:
        """
        Translates a natural language user prompt into seed tracks matching lyrical and thematic content.
        """
        pass

    @abstractmethod
    def steer_queue(
        self,
        current_track: str,
        feedback: str,
        recent_skips: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> SteerResult:
        """
        Adjusts the active queue based on mid-session explicit or implicit feedback.
        """
        pass

    @abstractmethod
    def update_user_profile(
        self, current_profile: str, positive_signal: str
    ) -> str:
        """
        Updates the concise rolling text profile summarizing user tastes.
        """
        pass

    @abstractmethod
    def generate_steer_suggestions(
        self,
        prompt: Optional[str] = None,
        current_track: Optional[str] = None,
        queue_tracks: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> List[str]:
        """
        Generates 4 dynamic short vibe steering suggestions based on current prompt and queue.
        """
        pass

    @abstractmethod
    def extend_infinite_queue(
        self,
        initial_prompt: str,
        steer_history: Optional[List[str]] = None,
        played_tracks: Optional[List[str]] = None,
        current_track: Optional[str] = None,
        user_profile: Optional[str] = None,
    ) -> CurationResult:
        """
        Seamlessly generates continuation tracks matching initial prompt, steer history, and evolved tastes,
        strictly avoiding duplicate songs from played_tracks.
        """
        pass

