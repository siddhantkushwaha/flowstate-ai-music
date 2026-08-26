import json
import logging
import urllib.request
import urllib.error
from typing import List, Optional
from app.llm.base import BaseLLMClient, CurationResult, SeedTrack, SteerResult

logger = logging.getLogger(__name__)

class OllamaLLMClient(BaseLLMClient):
    """
    Local Ollama implementation for open-source offline LLM curation.
    Connects to Ollama REST API (http://localhost:11434).
    """

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def _generate(self, prompt: str, system_instruction: str) -> str:
        url = f"{self.base_url}/api/generate"
        full_prompt = f"System: {system_instruction}\n\nUser: {prompt}"

        payload = {
            "model": self.model,
            "prompt": full_prompt,
            "stream": False,
            "format": "json"
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result.get("response", "")
        except Exception as e:
            logger.error(f"Ollama API request failed ({e}) for model '{self.model}' at {url}")
            raise e

    def generate_seed_tracks(
        self, prompt: str, user_profile: Optional[str] = None
    ) -> CurationResult:
        system_instruction = (
            "You are an expert music curator. Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "curator_summary": "Brief 1-sentence summary",\n'
            '  "seeds": [\n'
            '    {\n'
            '      "artist": "Artist Name",\n'
            '      "track_name": "Song Title",\n'
            '      "reasoning": "1-sentence reason",\n'
            '      "vibe_tags": ["tag1", "tag2"]\n'
            '    }\n'
            '  ]\n'
            "}\n"
            "Respect language and genre constraints specified by user."
        )

        user_content = f"Prompt: {prompt}"
        if user_profile:
            user_content += f"\nUser profile: {user_profile}"

        raw_response = self._generate(user_content, system_instruction)

        clean_json = raw_response.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        data = json.loads(clean_json or "{}")
        seeds = [SeedTrack(**s) for s in data.get("seeds", [])]
        summary = data.get("curator_summary", f"Ollama mix for: {prompt}")

        return CurationResult(prompt=prompt, seeds=seeds, curator_summary=summary)

    def steer_queue(
        self,
        current_track: str,
        feedback: str,
        recent_skips: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> SteerResult:
        system_instruction = (
            "You are an AI queue steering assistant. Return ONLY valid JSON:\n"
            "{\n"
            '  "explanation": "Why changes were made",\n'
            '  "added_seeds": [{"artist": "...", "track_name": "...", "reasoning": "...", "vibe_tags": []}],\n'
            '  "tracks_to_remove": []\n'
            "}\n"
        )
        user_content = f"Currently playing: {current_track}\nUser feedback: {feedback}\n"
        if recent_skips:
            user_content += f"Skips: {', '.join(recent_skips)}\n"

        raw_response = self._generate(user_content, system_instruction)

        clean_json = raw_response.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        data = json.loads(clean_json or "{}")
        added = [SeedTrack(**s) for s in data.get("added_seeds", [])]
        return SteerResult(
            feedback=feedback,
            added_seeds=added,
            tracks_to_remove=data.get("tracks_to_remove", []),
            explanation=data.get("explanation", "Queue steered via Ollama."),
        )

    def update_user_profile(
        self, current_profile: str, positive_signal: str
    ) -> str:
        prompt = (
            f"Current profile: '{current_profile}'\nLiked: '{positive_signal}'\n"
            "Synthesize an updated music profile in 1 concise sentence."
        )
        system_instruction = "Concise summary assistant."
        return self._generate(prompt, system_instruction).strip()

    def generate_steer_suggestions(
        self,
        prompt: Optional[str] = None,
        current_track: Optional[str] = None,
        queue_tracks: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> List[str]:
        system_instruction = "Return JSON with 4 short music vibe shift suggestions: {\"suggestions\": [\"opt1\", \"opt2\", \"opt3\", \"opt4\"]}"
        user_content = f"Prompt: {prompt}\nTrack: {current_track}\nQueue: {queue_tracks}"
        try:
            raw = self._generate(user_content, system_instruction)
            clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            data = json.loads(clean or "{}")
            suggestions = data.get("suggestions", [])
            if isinstance(suggestions, list) and len(suggestions) >= 2:
                return suggestions[:4]
        except Exception:
            pass
        return [
            "Increase Energy & BPM",
            "Soften & Go Acoustic",
            "Shift Era / Nostalgic",
            "More Heavy Bass & Beats"
        ]

    def extend_infinite_queue(
        self,
        initial_prompt: str,
        steer_history: Optional[List[str]] = None,
        played_tracks: Optional[List[str]] = None,
        current_track: Optional[str] = None,
        user_profile: Optional[str] = None,
    ) -> CurationResult:
        system_instruction = (
            "You are an expert music curator in Infinite Flow mode. Curate 3 to 5 real tracks continuing the vibe.\n"
            "STRICT DEDUPLICATION: DO NOT suggest any track from the played list.\n"
            "Return ONLY valid JSON matching:\n"
            "{\n"
            '  "curator_summary": "1-sentence summary",\n'
            '  "seeds": [{"artist": "...", "track_name": "...", "reasoning": "...", "vibe_tags": []}]\n'
            "}\n"
        )
        user_content = f"Initial Prompt: {initial_prompt}\n"
        if current_track:
            user_content += f"Currently Playing: {current_track}\n"
        if steer_history:
            user_content += f"Steers: {', '.join(steer_history)}\n"
        if played_tracks:
            user_content += f"Played Tracks (DO NOT REPEAT): {', '.join(played_tracks[-25:])}\n"
        if user_profile:
            user_content += f"User Profile: {user_profile}\n"

        try:
            raw_response = self._generate(user_content, system_instruction)
            clean_json = raw_response.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            data = json.loads(clean_json or "{}")
            seeds = [SeedTrack(**s) for s in data.get("seeds", [])]
            summary = data.get("curator_summary", f"Infinite flow extension for '{initial_prompt}'")
            return CurationResult(prompt=initial_prompt, seeds=seeds, curator_summary=summary)
        except Exception as e:
            logger.error(f"Ollama infinite queue extension error: {e}")
            fallback_mock = MockLLMClient()
            return fallback_mock.extend_infinite_queue(
                initial_prompt=initial_prompt,
                steer_history=steer_history,
                played_tracks=played_tracks,
                current_track=current_track,
                user_profile=user_profile
            )

