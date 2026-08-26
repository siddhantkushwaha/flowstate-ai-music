from typing import List, Optional
from app.llm.base import BaseLLMClient, CurationResult, SeedTrack, SteerResult

class MockLLMClient(BaseLLMClient):
    """
    Mock LLM client for offline development and fallback.
    Supports Hindi, workout, chill, and general prompts.
    """

    def generate_seed_tracks(
        self, prompt: str, user_profile: Optional[str] = None
    ) -> CurationResult:
        prompt_lower = prompt.lower()

        if "hindi" in prompt_lower or "bollywood" in prompt_lower or "rain" in prompt_lower:
            seeds = [
                SeedTrack(
                    artist="Kishore Kumar",
                    track_name="Rimjhim Gire Sawan",
                    reasoning="The definitive classic Hindi monsoon song, capturing nostalgic rain-soaked bus journeys through Mumbai.",
                    vibe_tags=["hindi", "monsoon", "nostalgia", "classic"]
                ),
                SeedTrack(
                    artist="Mohit Chauhan",
                    track_name="Phir Se Ud Chala",
                    reasoning="Soulful acoustic rhythms and reflective lyrics perfect for window-seat bus rides.",
                    vibe_tags=["hindi", "travel", "acoustic", "reflective"]
                ),
                SeedTrack(
                    artist="Lucky Ali",
                    track_name="O Sanam",
                    reasoning="Iconic 90s Indi-pop melody bringing pure nostalgia and travel feelings.",
                    vibe_tags=["hindi", "90s", "nostalgia", "indipop"]
                ),
                SeedTrack(
                    artist="Kishore Kumar & Lata Mangeshkar",
                    track_name="Bheegi Bheegi Raaton Mein",
                    reasoning="Classic romantic rain song filled with warmth and timeless melodies.",
                    vibe_tags=["hindi", "rain", "duet", "retro"]
                )
            ]
            summary = "Nostalgic Hindi monsoon and travel selection tailored for a rainy bus ride."
        elif "workout" in prompt_lower or "energetic" in prompt_lower or "leg day" in prompt_lower:
            seeds = [
                SeedTrack(
                    artist="Eminem",
                    track_name="Till I Collapse",
                    reasoning="Iconic high-energy lyrics driving motivation and physical endurance.",
                    vibe_tags=["workout", "hip-hop", "high-bpm"]
                ),
                SeedTrack(
                    artist="Kanye West",
                    track_name="POWER",
                    reasoning="Driving rhythms and empowering lyrics perfect for intense sessions.",
                    vibe_tags=["hip-hop", "pumping", "bold"]
                ),
                SeedTrack(
                    artist="Metallica",
                    track_name="Master of Puppets",
                    reasoning="Relentless heavy guitar riffs and aggressive vocal pacing.",
                    vibe_tags=["metal", "rock", "intense"]
                ),
            ]
            summary = "High-octane energetic mix designed to push your workout limits."
        else:
            seeds = [
                SeedTrack(
                    artist="Daft Punk",
                    track_name="One More Time",
                    reasoning="Uplifting disco-house grooves with universal dance appeal.",
                    vibe_tags=["electronic", "upbeat", "dance"]
                ),
                SeedTrack(
                    artist="The Weeknd",
                    track_name="Blinding Lights",
                    reasoning="Retro 80s synth-wave drive with infectious energy.",
                    vibe_tags=["pop", "synthwave", "energetic"]
                ),
            ]
            summary = f"Custom curated vibe built around '{prompt}'."

        return CurationResult(
            prompt=prompt,
            seeds=seeds,
            curator_summary=summary
        )

    def steer_queue(
        self,
        current_track: str,
        feedback: str,
        recent_skips: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> SteerResult:
        added = [
            SeedTrack(
                artist="Arijit Singh",
                track_name="Tum Hi Ho",
                reasoning=f"Pivoting queue based on feedback: '{feedback}'",
                vibe_tags=["hindi", "romantic"]
            ),
            SeedTrack(
                artist="KK",
                track_name="Yaaron",
                reasoning="Injecting nostalgic Hindi melodies to match user request.",
                vibe_tags=["hindi", "nostalgia"]
            ),
        ]
        return SteerResult(
            feedback=feedback,
            added_seeds=added,
            tracks_to_remove=recent_skips or [],
            explanation=f"Queue updated with 2 new tracks following feedback '{feedback}'."
        )

    def update_user_profile(
        self, current_profile: str, positive_signal: str
    ) -> str:
        if not current_profile:
            return f"User enjoys Hindi nostalgic songs like '{positive_signal}'."
        return f"{current_profile} Also prefers track '{positive_signal}'."

    def generate_steer_suggestions(
        self,
        prompt: Optional[str] = None,
        current_track: Optional[str] = None,
        queue_tracks: Optional[List[str]] = None,
        user_profile: Optional[str] = None,
    ) -> List[str]:
        p = (prompt or "").lower()
        if "hindi" in p or "bollywood" in p or "rain" in p:
            return [
                "More 90s Nostalgia",
                "Shift to Upbeat Dance",
                "Pure Acoustic & Unplugged",
                "Add Sufi & Ghazal Flavors"
            ]
        elif "workout" in p or "gym" in p or "pump" in p or "energetic" in p:
            return [
                "Increase BPM / Heavy Bass",
                "Switch to Hard Rock / Metal",
                "Mid-Tempo Hip-Hop Pump",
                "High Energy Electronic Drop"
            ]
        elif "chill" in p or "lofi" in p or "study" in p or "focus" in p:
            return [
                "More Instrumental / No Vocals",
                "Add Soft Piano Melodies",
                "Warm Vinyl & Rainy Lofi",
                "Slightly More Upbeat Groove"
            ]
        else:
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
        p = (initial_prompt or "").lower()
        played = [t.lower() for t in (played_tracks or [])]

        candidate_seeds = []
        if "hindi" in p or "bollywood" in p or "rain" in p:
            candidate_seeds = [
                SeedTrack(artist="A.R. Rahman", track_name="Dil Se Re", reasoning="Rich layered orchestral rhythms expanding the Indian melody space.", vibe_tags=["hindi", "classic", "experimental"]),
                SeedTrack(artist="Sonu Nigam", track_name="Kal Ho Naa Ho", reasoning="Heartfelt melody continuing the reflective, emotional thread.", vibe_tags=["hindi", "emotional", "ballad"]),
                SeedTrack(artist="Shafqat Amanat Ali", track_name="Mitwa", reasoning="High-energy soulful vocal delivery.", vibe_tags=["hindi", "sufi", "energetic"]),
                SeedTrack(artist="Atif Aslam", track_name="Aadat", reasoning="Iconic unplugged rock-ballad feel.", vibe_tags=["hindi", "rock", "nostalgic"]),
                SeedTrack(artist="Amit Trivedi", track_name="Namo Namo", reasoning="Spiritual and uplifting acoustic progression.", vibe_tags=["hindi", "acoustic", "uplifting"]),
            ]
        elif "workout" in p or "gym" in p or "energetic" in p:
            candidate_seeds = [
                SeedTrack(artist="Survivor", track_name="Eye of the Tiger", reasoning="Timeless relentless drive and adrenaline pump.", vibe_tags=["rock", "classic", "workout"]),
                SeedTrack(artist="Skrillex", track_name="Bangarang", reasoning="Explosive electronic bass drops for peak output.", vibe_tags=["electronic", "dubstep", "high-bpm"]),
                SeedTrack(artist="AC/DC", track_name="Thunderstruck", reasoning="High voltage guitar anthems maintaining workout intensity.", vibe_tags=["rock", "energetic", "driving"]),
                SeedTrack(artist="The Prodigy", track_name="Firestarter", reasoning="Relentless breakbeat energy keeping tempo elevated.", vibe_tags=["electronic", "breakbeat", "intense"]),
            ]
        else:
            candidate_seeds = [
                SeedTrack(artist="Daft Punk", track_name="Get Lucky", reasoning="Groovy disco-funk continuing the uplifting electronic atmosphere.", vibe_tags=["funk", "disco", "upbeat"]),
                SeedTrack(artist="M83", track_name="Midnight City", reasoning="Cinematic synthwave energy creating expansive flow.", vibe_tags=["synthwave", "electronic", "dreamy"]),
                SeedTrack(artist="Empire of the Sun", track_name="Walking On A Dream", reasoning="Bright euphoric electro-pop vibe.", vibe_tags=["indie-pop", "uplifting", "electronic"]),
                SeedTrack(artist="Kavinsky", track_name="Nightcall", reasoning="Moody retro synth drive with distinctive basslines.", vibe_tags=["synthwave", "retro", "night-drive"]),
            ]

        # Filter out tracks whose name or artist is already in played_tracks
        filtered_seeds = [
            s for s in candidate_seeds
            if not any(s.track_name.lower() in t for t in played)
        ]

        # If all were played, fallback to first 2
        selected = filtered_seeds[:3] if len(filtered_seeds) >= 2 else candidate_seeds[:2]

        return CurationResult(
            prompt=initial_prompt,
            seeds=selected,
            curator_summary=f"Infinite Flow: seamlessly extending vibe from '{initial_prompt}'."
        )
