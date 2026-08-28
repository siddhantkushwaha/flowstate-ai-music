# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Flowstate is an AI-native music streaming player (PWA): natural language prompts are translated by an LLM into seed tracks, which are resolved against Spotify's catalog and streamed via the Spotify Web Playback SDK. There is no local/mock audio path — every playback path is real Spotify streaming.

## Commands

### Backend (`/backend`, Python 3.11+, Flask)
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python run.py                      # runs on http://localhost:5050, reads root ../.env
```
Run tests:
```bash
cd backend
pytest                             # all tests
pytest tests/test_llm.py           # single file
pytest tests/test_routes.py::test_curate_route   # single test
```

### Frontend (`/frontend`, React 18 + Vite + Tailwind)
```bash
cd frontend
npm install
npm run dev        # dev server on http://localhost:3000
npm run build      # production build to frontend/dist
npm run preview    # preview a production build
```
There is no lint script configured in `package.json`.

### Run both at once
```bash
./start.sh
```
Copies `.env.example` to `.env` if missing, then starts backend and frontend concurrently.

### Docker
```bash
docker compose up --build -d       # single container serving both, on :3000
```
Multi-stage build: stage 1 builds the Vite PWA into `/app/frontend/dist`; stage 2 copies it to `static_dist` and serves it via Gunicorn from Flask. `create_app()` in `backend/app/__init__.py` serves the SPA at `/` (with client-side routing fallback to `index.html`) whenever a `static_dist` directory exists, and always mounts the API under `/api/*`.

### Environment
Single root `.env` (see `.env.example`) is loaded by `backend/app/config.py`, which walks up to `../../.env` relative to itself. Key vars: `SPOTIFY_CLIENT_ID`, `LLM_PROVIDER` (`gemini` or `ollama` — no mock fallback exists), `GEMINI_API_KEY`, `GEMINI_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.

## Architecture

### LLM provider layer (`backend/app/llm/`)
- `base.py` defines `BaseLLMClient` (abstract) and the Pydantic schemas (`SeedTrack`, `CurationResult`, `SteerResult`) shared by every provider.
- `get_llm_client()` (`llm/__init__.py`) is a factory that reads `Config.LLM_PROVIDER` and instantiates `GeminiLLMClient` or `OllamaLLMClient`. It raises `ValueError` immediately if the provider is unsupported or `GEMINI_API_KEY` is missing for the `gemini` provider — there is intentionally no silent fallback.
- Every `BaseLLMClient` implementation must provide: `generate_seed_tracks`, `steer_queue`, `update_user_profile`, `generate_steer_suggestions`, and `extend_infinite_queue`.
- `GeminiLLMClient` retries LLM calls with sleep backoff (`_call_with_retry`); tests assert exact retry/backoff behavior, so preserve that method's signature and semantics when touching it.

### API surface (`backend/app/routes/`)
Four blueprints, all mounted at `/api`:
- `curation.py`: `POST /curate` (natural-language prompt → seed tracks + catalog search queries), `POST /infinite-flow` (seamless queue continuation given the initial prompt, steer history, and already-played tracks, avoiding repeats).
- `feedback.py`: `POST /steer` (mid-session feedback → added seeds + tracks to prune), `GET/POST /profile` (rolling taste-profile fetch/update, persisted per Spotify user), `POST /suggestions` (4 short context-aware steering chips).
- `auth.py`: `POST /auth/session` — verifies a Spotify access token and mints a signed app session token. **This is the one deliberate, scoped exception to "the backend never calls Spotify"** (see below) — every other route still never calls Spotify.
- `history.py`: `GET/POST /history`, `PATCH /history/<id>`, `DELETE /history/<id>` — per-user history of played curated sessions, 7-day lazy retention (`Config.HISTORY_RETENTION_SECONDS`).
- Every route (except `auth.py`) calls `get_llm_client()` per-request (not cached at import time) and converts LLM output through `MusicService.prepare_catalog_search_queries()` before returning `catalog_queries` — the frontend resolves these against Spotify's search API itself; the backend never calls Spotify for track resolution.

### App identity and persistence (`backend/app/auth.py`, `backend/app/services/db_service.py`)
- There is no separate app-level login — Spotify login **is** the app login. `POST /api/auth/session` verifies a Spotify access token once via `GET /v1/me`, then mints a signed (not encrypted) token via `itsdangerous` encoding `{spotify_user_id, display_name}`, verified with no `max_age` — the app session itself never expires on a clock; it only ends via explicit logout (which clears it client-side) or Spotify revoking the underlying access.
- Routes needing identity use the `@require_session` decorator (`app/auth.py`), which reads `Authorization: Bearer <session_token>` and resolves `g.spotify_user_id`, returning 401 if missing/invalid.
- `db_service.py` (not "cache_service" — it now holds real persistent user data, not just a lookup cache) is a single SQLite file (`Config.DB_PATH`, default `backend/data/flowstate.sqlite3`) with three tables: `curation_cache` (`CurationCache`, unchanged TTL-cache semantics for `/curate` results), `taste_profiles` (`TasteProfileStore`, one row per user, no retention), `curated_sessions` (`CurationHistoryStore`, 7-day lazy retention like the curation cache — rows are filtered out at read time, not proactively deleted).

### Frontend state machine (`frontend/src/hooks/useSpotifyPlayer.js`)
This hook is the center of the app: Spotify SDK init, PKCE token exchange, device registration/resolution, the queue+index model, and playback controls all live here. Key invariants (violating these breaks playback or queue state):
- **Queue is index-based**: `queue = []` plus `currentIndex`; `currentTrack = queue[currentIndex]`. Every queue item has a unique `uid` (e.g. `track-${id}-${timestamp}-${random}`) for React keys, since duplicate songs can appear.
- **Steer vs. new prompt**: steering appends to the existing queue (session continuity); a new top-level prompt resets the queue.
- **Never mutate resolved queue item metadata** (title/artist/id) from inside the `player_state_changed` handler — only `currentIndex`/playback position are synced there.
- **Device IDs go stale** on reconnect; always resolve the live device via `getLiveValidDeviceId()` before issuing playback commands to the Spotify REST API.
- **`activatePlayerElement()`** (which calls `player.activateElement()`) must be invoked from a user-gesture handler (prompt submit, play click, track select) — browsers block audio without it.
- Skip-previous restarts the current track from 0 if more than ~3s in; otherwise it moves to the previous index.

### Frontend structure
- `hooks/useMediaSession.js`: wires `navigator.mediaSession` for lock-screen/background controls.
- `services/spotifyAuth.js`: PKCE OAuth flow against Spotify (no client secret in the frontend). Uses `show_dialog: true` so new scopes force re-consent instead of silently reusing a stale token. Also stores the Spotify refresh token and silently refreshes the access token on expiry (`refreshSpotifyToken()`) instead of forcing re-login, and stores/clears the signed app session token (`getStoredAppSession()`/`storeAppSession()`) that `logoutSpotify()` clears alongside the Spotify tokens.
- `services/api.js`: talks to the Flask backend; every call has a same-origin `/api/...` fallback in case the computed `API_BASE` (env override → HTTPS same-origin → `http://<hostname>:5050`) is unreachable. `establishAppSession()`, profile GET/POST, and all `/history*` calls attach `Authorization: Bearer <app session token>` via a shared `apiRequest()` helper.
- `components/`: `Player` (now-playing card), `QueueView` (queue list + save-as-playlist), `HistoryPanel` (7-day curated-session history: resume/delete), `VibeControls` (steering chips + freeform input), `PromptInput`, `TasteProfileModal`, `Header` (includes the logout action), `MiniPlayer`.
- `App.jsx` saves a curated session to history once its first track has played continuously for 30s (`HISTORY_SAVE_THRESHOLD_MS`) - filters out prompts that were typed but never actually listened to. Steering an already-saved session patches the same history entry rather than creating a new one.

### Spotify REST integration points
- Playlists: create via `POST /v1/me/playlists`; add tracks via `POST /v1/playlists/{id}/tracks`; overwrite via `PUT /v1/playlists/{id}/tracks`.
- All URIs sent to Spotify must match `spotify:track:<22_char_alphanumeric_id>` — filter out anything else before calling the API.

## Conventions

- No em dashes in docs or user-facing text — use hyphens, colons, or parentheses instead.
- Dark-mode glassmorphism UI (`bg-[#060911]`, slate tones, emerald accents); keep borders subtle.
- Log detailed errors from external APIs (Spotify, Gemini) to the console for debugging; surface user-friendly messages via toast notifications in the UI.
