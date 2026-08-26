# AGENTS.md: Developer and Agent Guidelines

This document provides system architecture, integration rules, and implementation constraints for AI agents and engineers working on the Flowstate codebase.

## 1. System Mission and Principles

Flowstate is an AI-native music streaming player that connects LLM semantic reasoning with real Spotify streaming playback.

Key invariants:
- Spotify-Only Playback: Never introduce dummy audio files, mock audio elements, or HTML5 MP3 fallbacks. The app is strictly designed for native Spotify Web Playback SDK streaming with full user authorization.
- Queue Preservation: The queue represents an active listening session. Steer actions must append to the existing queue. New main prompts reset and start a fresh queue.
- No Mutation of Queue Metadata: Queue items retain their original resolved catalog metadata and unique IDs. Player state updates synchronize current playback position and active track index without overwriting queue items.

## 2. Architecture Overview

### Frontend Architecture (`/frontend`)
- Framework: React 18, Vite, Tailwind CSS, Lucide React icons.
- Progressive Web App: Configured via `vite-plugin-pwa` with service worker precaching.
- Core State & Hooks:
  - `useSpotifyPlayer.js`: Central state machine for Spotify SDK initialization, device registration, PKCE OAuth token exchange, queue indexing, playback controls, and playlist/library operations.
  - `useMediaSession.js`: Interacts with standard `navigator.mediaSession` to provide lock screen metadata, artwork, and background controls for mobile and desktop browsers.
- Key Components:
  - `Player.jsx`: Now Playing card displaying album artwork, song title, artist, live seek bar, like toggle, skip back/forward, and play/pause controls.
  - `QueueView.jsx`: Interactive queue listing, active track indicator (animated equalizer), remove track button per row, and Save Playlist input/action.
  - `VibeControls.jsx`: Context-aware dynamic vibe steering chips and custom freeform steering input.
  - `PromptInput.jsx`: Primary prompt submission box with curated inspiration chips.
  - `TasteProfileModal.jsx`: Displays user taste profile synthesized by the LLM.
  - `Header.jsx`: Spotify connection status and taste profile trigger.

### Backend Architecture (`/backend`)
- Framework: Python 3.11+, Flask, Gunicorn.
- LLM Provider Hierarchy:
  - `BaseLLMClient` (`app/llm/base.py`): Abstract base class defining `generate_seed_tracks`, `steer_queue`, `update_user_profile`, and `generate_steer_suggestions`.
  - `GeminiLLMClient` (`app/llm/gemini_client.py`): Primary cloud provider utilizing `google-genai` SDK with automatic retry logic and fallback models (`gemma-2-27b-it` -> `gemini-2.5-flash` -> `gemini-1.5-flash`).
  - `MockLLMClient` (`app/llm/mock_client.py`): Deterministic fallback provider supporting Hindi, workout, chill, and pop music queries for offline operation or sandboxed environments.
  - `OllamaLLMClient` (`app/llm/ollama_client.py`): Local open-source model provider connecting to Ollama REST API.
- Endpoints:
  - `POST /api/curate`: Translates natural language prompt into structured seed tracks and catalog search queries.
  - `POST /api/steer`: Processes mid-session feedback to produce additional seed tracks and tracks to prune.
  - `POST /api/suggestions`: Generates 4 concise, context-aware vibe steering suggestion chips based on prompt, current track, and queue.
  - `POST /api/profile`: Incrementally updates user taste profile when tracks are liked.
  - `GET /api/health`: Health status and active LLM provider name.

## 3. Spotify SDK Integration Rules

### Web Playback SDK Initialization
- The Spotify Web Playback SDK is loaded via `<script src="https://sdk.scdn.co/spotify-player.js">` in `index.html`.
- Initialization hook `window.onSpotifyWebPlaybackSDKReady` creates `window.Spotify.Player`.
- Browser Autoplay Policy: Browser security requires user interaction before audio can play. The `activatePlayerElement()` method calls `player.activateElement()` and must be invoked on user click handlers (such as prompt submission, play button click, or track selection).

### PKCE OAuth Authorization Flow
- Flow: Authorization Code Flow with PKCE (Proof Key for Code Exchange), requiring no client secret in the frontend.
- Scopes Required:
  - `streaming`: Web Playback SDK playback.
  - `user-read-email`, `user-read-private`: Profile access.
  - `user-modify-playback-state`, `user-read-playback-state`, `user-read-currently-playing`: Playback control.
  - `user-library-modify`, `user-library-read`: Liking songs into user Spotify library.
  - `playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`: Creating and updating playlists.
- Force Consent: `redirectToSpotifyOAuth` includes `show_dialog: 'true'` so that updated scope requests prompt the user to approve new permissions rather than silently returning a stale token.

### Device ID Resolution
- Spotify Web Playback SDK emits a `ready` event with `device_id`.
- The device ID can become stale across reconnects. Always resolve the live active device using `getLiveValidDeviceId()` before issuing playback commands to Spotify REST API (`https://api.spotify.com/v1/me/player/play?device_id=...`).

### Playlist and Library API Endpoints
- Playlist Creation: Use `POST https://api.spotify.com/v1/me/playlists` with body `{"name": playlistName, "description": "..."}`.
- Adding Tracks: Use `POST https://api.spotify.com/v1/playlists/{playlist_id}/tracks` with body `{"uris": [...]}`.
- Replacing Tracks (Overwrite): Use `PUT https://api.spotify.com/v1/playlists/{playlist_id}/tracks` with body `{"uris": [...]}`.
- URI Validation: All URIs passed to Spotify must be strictly formatted as `spotify:track:<22_char_alphanumeric_id>`. Filter out non-Spotify or temporary IDs.

## 4. State Management and Queue Model

### Index-Based Queue
- The queue is maintained as a single ordered list of tracks (`queue = []`) alongside an integer index (`currentIndex = 0`).
- `currentTrack` is derived as `queue[currentIndex]`.
- Each queue item must contain a unique `uid` (for example `track-${id}-${timestamp}-${random}`) to guarantee distinct React keys even if duplicate songs exist.

### Handling `player_state_changed`
- The `player_state_changed` event from the SDK reports the current playback state.
- When `state.track_window.current_track` advances, locate the matching track in `queue` and update `currentIndex`.
- Never mutate or overwrite track titles or artist names of existing queue items inside `player_state_changed`.

### Previous and Next Logic
- Skip Next (`skipNext`): Advances `currentIndex` by 1 and sends remaining URIs (`queue.slice(nextIndex)`) to Spotify play API.
- Skip Previous (`skipPrevious`): If current track playback is past 3 seconds, seeks to 0. Otherwise decrements `currentIndex` by 1 and resumes playback from that position.

## 5. Dockerization and Serving

### Multi-Stage Build
- Stage 1: Builds the React Vite PWA into static assets in `/app/frontend/dist`.
- Stage 2: Copies the static assets to `/app/static_dist` and packages the Flask application with Gunicorn.
- Static Hosting: `create_app()` in `backend/app/__init__.py` checks for `STATIC_DIR` or `../static_dist`. If present, Flask serves the compiled SPA at `/` and handles HTML5 client-side routing while mounting API blueprints at `/api/*`.

## 6. Coding and Styling Rules

- No Em Dashes: Do not use em dashes in documentation or user-facing text. Use standard hyphens, colons, or parentheses.
- Clean Styling: Maintain dark mode glassmorphism UI with Tailwind CSS (`bg-[#060911]`, slate tones, emerald accents). Keep borders subtle and opaque where appropriate.
- Error Handling: Always log detailed error responses from external APIs (Spotify, Gemini) to the console to simplify troubleshooting. Display user-friendly feedback via toast notifications.
