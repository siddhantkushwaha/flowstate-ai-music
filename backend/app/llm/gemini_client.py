import json
import logging
from typing import List, Optional
from tenacity import retry, stop_after_attempt, wait_random_exponential, retry_if_exception
from app.llm.base import BaseLLMClient, CurationResult, SeedTrack, SteerResult

logger = logging.getLogger(__name__)

def is_transient_error(exception: Exception) -> bool:
    """
    Checks if an exception is a transient API/network error worth retrying.
    """
    err_str = str(exception).lower()
    transient_keywords = [
        "rate limit", "429", "resource_exhausted", "quota",
        "500", "503", "unavailable", "overloaded", "timeout", "connection"
    ]
    return any(kw in err_str for kw in transient_keywords)

class GeminiLLMClient(BaseLLMClient):
    """
    Google Gemini & Gemma implementation for LLM curation using official google-genai SDK.
    Includes exponential backoff retry logic and multi-tier model fallback.
    """

    def __init__(self, api_key: str, model: str = "gemma-2-27b-it"):
        self.api_key = api_key
        self.model_name = model
        from google import genai
        self.client = genai.Client(api_key=api_key)

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_random_exponential(min=1, max=5),
        retry=retry_if_exception(is_transient_error)
    )
    def _execute_model_call(self, model_name: str, contents: str, is_json: bool = True):
        from google.genai import types

        config_args = {}
        if is_json and "gemma" not in model_name.lower():
            # Standard Gemini models support native JSON mode
            config_args["response_mime_type"] = "application/json"
            config_args["temperature"] = 0.85
        else:
            config_args["temperature"] = 0.85

        config = types.GenerateContentConfig(**config_args)
        return self.client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config
        )

    def _call_with_fallback(self, contents: str, is_json: bool = True) -> str:
        """
        Executes call with primary model, falling back to secondary models if primary fails under load.
        """
        fallback_models = [self.model_name, "gemini-2.5-flash", "gemini-1.5-flash"]

        # Deduplicate while preserving order
        seen = set()
        models_to_try = [m for m in fallback_models if not (m in seen or seen.add(m))]

        last_exception = None
        for m_name in models_to_try:
            try:
                logger.info(f"Attempting LLM call with model: {m_name}")
                response = self._execute_model_call(m_name, contents, is_json)
                if response and response.text:
                    return response.text
            except Exception as e:
                logger.warning(f"LLM model '{m_name}' failed after retries: {e}. Trying fallback model...")
                last_exception = e

        if last_exception:
            raise last_exception
        raise RuntimeError("All LLM fallback models failed to respond.")

    def generate_seed_tracks(
        self, prompt: str, user_profile: Optional[str] = None
    ) -> CurationResult:
        system_instruction = (
            "You are an expert global music curator and metadata extraction engine.\n"
            "The user will describe a mood, activity, lyrical theme, and optionally language/genre requirements.\n"
            "Your job is to curate 4 to 6 REAL songs that perfectly match this request. Provide a diverse, creative blend of well-known favorites, beloved tracks, and hidden gems across different artists rather than repeating only the most obvious chart-toppers.\n\n"
            "CRITICAL RULES:\n"
            "1. STRICTLY RESPECT LANGUAGE & REGIONAL RESTRICTIONS: If the user requests 'Hindi only', 'Bollywood', 'Spanish', etc., ALL suggested tracks MUST be in that specified language/genre. NEVER include English or other languages if a specific language is requested.\n"
            "2. DO NOT hallucinate. Only suggest real songs that exist on major streaming platforms (Spotify/Apple Music).\n"
            "3. Ensure artist diversity: Do not pick multiple songs from the same artist in a single curation unless requested. Explore varied albums, eras, and subgenres fitting the vibe.\n"
            "4. Ensure the lyrics, mood, and vibe match the prompt.\n"
            "5. Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "curator_summary": "Brief 1-sentence summary of the vibe and language theme",\n'
            '  "seeds": [\n'
            '    {\n'
            '      "artist": "Exact Artist/Singer Name",\n'
            '      "track_name": "Exact Song Title",\n'
            '      "reasoning": "1-sentence explanation of why lyrics/mood match the user request",\n'
            '      "vibe_tags": ["tag1", "tag2"]\n'
            '    }\n'
            '  ]\n'
            "}\n"
        )

        user_content = f"{system_instruction}\nPrompt: {prompt}"
        if user_profile:
            user_content += f"\nUser profile context: {user_profile}"

        raw_text = self._call_with_fallback(user_content, is_json=True)

        # Parse JSON output (strip markdown codeblocks if model wraps output)
        clean_json = raw_text.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        data = json.loads(clean_json or "{}")
        seeds = [SeedTrack(**s) for s in data.get("seeds", [])]
        summary = data.get("curator_summary", f"Curated mix for: {prompt}")

        return CurationResult(prompt=prompt, seeds=seeds, curator_summary=summary)

    def steer_queue(
        self,
        current_track: str,
        feedback: str,
        recent_skips: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> SteerResult:
        system_instruction = (
            "You are an AI queue steering assistant for a music app.\n"
            "The user is listening to a track and provided feedback to shift the current vibe.\n"
            "Maintain language consistency if previously specified.\n"
            "Return JSON matching:\n"
            "{\n"
            '  "explanation": "Why these changes were made",\n'
            '  "added_seeds": [{"artist": "...", "track_name": "...", "reasoning": "...", "vibe_tags": []}],\n'
            '  "tracks_to_remove": ["track_id or title"]\n'
            "}\n"
        )
        user_content = f"{system_instruction}\nCurrently playing: {current_track}\nUser feedback: {feedback}\n"
        if recent_skips:
            user_content += f"Recently skipped tracks: {', '.join(recent_skips)}\n"

        raw_text = self._call_with_fallback(user_content, is_json=True)

        clean_json = raw_text.strip()
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
            explanation=data.get("explanation", "Queue steered successfully."),
        )

    def update_user_profile(
        self, current_profile: str, positive_signal: str
    ) -> str:
        prompt = (
            f"Current user music preference summary: '{current_profile}'\n"
            f"User just saved/liked track: '{positive_signal}'.\n"
            "Update the summary concisely in 1-2 sentences capturing their evolving taste and preferred languages."
        )
        raw_text = self._call_with_fallback(prompt, is_json=False)
        return raw_text.strip()

    def generate_steer_suggestions(
        self,
        prompt: Optional[str] = None,
        current_track: Optional[str] = None,
        queue_tracks: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> List[str]:
        system_instruction = (
            "You are an AI music assistant generating quick contextual vibe-steering chips for the user.\n"
            "Given the user's initial prompt and current playlist/track, provide exactly 4 concise steering options (2 to 5 words each) that make creative musical sense.\n"
            "Example options: 'More Acoustic Rhythms', 'Increase BPM / Energy', 'Add 90s Retro Vibe', 'Darker Hip-Hop Beats'.\n"
            "Return JSON matching:\n"
            "{\n"
            '  "suggestions": ["Option 1", "Option 2", "Option 3", "Option 4"]\n'
            "}\n"
        )
        user_content = f"{system_instruction}\nInitial Prompt: {prompt or 'None'}\nCurrently Playing: {current_track or 'None'}\n"
        if queue_tracks:
            user_content += f"Queue Tracks: {', '.join(queue_tracks[:6])}\n"
        if user_profile:
            user_content += f"User Profile: {user_profile}\n"

        raw_text = self._call_with_fallback(user_content, is_json=True)
        clean_json = raw_text.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        data = json.loads(clean_json or "{}")
        suggestions = data.get("suggestions", [])
        if isinstance(suggestions, list) and len(suggestions) >= 2:
            return suggestions[:4]
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
            "You are an expert global music curator providing seamless continuous playback in 'Infinite Flow' mode.\n"
            "The user is listening to an active session. Your goal is to curate 3 to 5 NEW, high-quality songs that flow naturally from the current vibe.\n\n"
            "CRITICAL RULES:\n"
            "1. STRICT DEDUPLICATION: NEVER suggest any track that has already been queued or played in this session (see 'Played/Queued tracks' list below).\n"
            "2. LANGUAGE & GENRE CONSISTENCY: Respect any language/genre constraints established in the initial prompt and steer history.\n"
            "3. VIBE EVOLUTION: Take into account the initial vibe and all subsequent steers to understand how the session has evolved.\n"
            "4. DIVERSITY: Explore varied artists, eras, and gems matching the vibe. Avoid repetitive artist selections.\n"
            "5. REAL TRACKS ONLY: Only suggest real tracks available on Spotify.\n"
            "6. Return ONLY valid JSON matching this exact schema:\n"
            "{\n"
            '  "curator_summary": "Brief 1-sentence description of this queue extension",\n'
            '  "seeds": [\n'
            '    {\n'
            '      "artist": "Exact Artist Name",\n'
            '      "track_name": "Exact Song Title",\n'
            '      "reasoning": "1-sentence explanation of how this naturally continues the session flow",\n'
            '      "vibe_tags": ["tag1", "tag2"]\n'
            '    }\n'
            '  ]\n'
            "}\n"
        )

        user_content = f"{system_instruction}\nInitial Session Prompt: {initial_prompt or 'Music mix'}"
        if current_track:
            user_content += f"\nCurrently Playing: {current_track}"
        if steer_history:
            user_content += f"\nSteers/Vibe Adjustments Applied: {', '.join(steer_history)}"
        if played_tracks:
            user_content += f"\nPlayed/Queued Tracks (DO NOT REPEAT): {', '.join(played_tracks[-30:])}"
        if user_profile:
            user_content += f"\nUser Profile Context: {user_profile}"

        raw_text = self._call_with_fallback(user_content, is_json=True)

        clean_json = raw_text.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json[7:]
        if clean_json.startswith("```"):
            clean_json = clean_json[3:]
        if clean_json.endswith("```"):
            clean_json = clean_json[:-3]
        clean_json = clean_json.strip()

        data = json.loads(clean_json or "{}")
        seeds = [SeedTrack(**s) for s in data.get("seeds", [])]
        summary = data.get("curator_summary", f"Infinite flow continuation for '{initial_prompt}'")

        return CurationResult(prompt=initial_prompt, seeds=seeds, curator_summary=summary)

