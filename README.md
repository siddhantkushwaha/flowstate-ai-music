# Flowstate

Flowstate is an AI-powered music curation player and Progressive Web App (PWA). It translates natural language prompts and vibe descriptions into curated music sessions streamed directly through Spotify Web Playback SDK.

## Key Features

- **Natural Language Vibe Curation**: Describe any vibe, setting, mood, or language requirement (for example: "late night drive with 90s indie rock" or "rainy day nostalgic acoustic hindi"). The LLM generates seed queries matched to real tracks.
- **Dynamic Queue Management**: Browse upcoming tracks, jump to any track, remove unwanted items, and skip back/forward.
- **Mid-Session Vibe Steering**: Steer the active queue on the fly using either contextual AI-generated suggestion chips or custom text inputs (for example: "more acoustic", "increase energy"). Steered tracks are appended to the active queue without disrupting current playback.
- **Spotify Integration**: Stream full tracks directly in the browser via Spotify Web Playback SDK with PKCE OAuth.
- **Spotify Library & Playlist Sync**: Like tracks directly into your Spotify "Liked Songs" library and export/save the current session queue as a named Spotify playlist (with overwrite support for existing playlists).
- **Mobile & Lock Screen Support**: Full MediaSession API integration for iOS and Android lock screen controls and background playback.

## Prerequisites

1. **Spotify Account**: Spotify Premium is required by Spotify for the Web Playback SDK.
2. **Spotify Developer Application**: Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) to obtain a `Client ID`.
   - Add your redirect URI in the dashboard (for local development: `http://localhost:3000/` and `http://127.0.0.1:3000/`).
   - If your Spotify app is in Development Mode, add your Spotify email under "Users and Access".
3. **LLM API Key (Optional)**: Google Gemini API key (from Google AI Studio). The app automatically falls back to an offline mock client if an API key is not supplied.

## Environment Configuration (`.env`)

Copy the `.env.example` template to `.env` at the project root:

```env
# Spotify Developer Client ID (from developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=your_spotify_client_id_here

# LLM Provider Configuration ('gemini', 'ollama', or 'mock')
LLM_PROVIDER=gemini

# Google Gemini API Key (from aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemma-2-27b-it

# Ollama Local LLM Configuration (if LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

## Running Locally

### Development Mode

1. **Backend**:
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   python run.py
   ```
   Backend runs on `http://localhost:5050`.

2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend runs on `http://localhost:3000`.

3. **Or run both with helper script**:
   ```bash
   ./start.sh
   ```

## Running with Docker

Flowstate is packaged as a multi-stage Docker build that bundles the React frontend and Flask backend into a single container served via Gunicorn.

### Docker Compose

```bash
docker compose up --build -d
```

The application will be available at `http://localhost:3000`.

### Docker CLI

```bash
# Build
docker build -t flowstate-ai-music:latest .

# Run
docker run -d \
  --name flowstate_app \
  -p 3000:3000 \
  --env-file backend/.env \
  flowstate-ai-music:latest
```

## Project Structure

```
ai_music/
├── Dockerfile               # Multi-stage container definition
├── docker-compose.yml       # Docker Compose service definition
├── start.sh                 # Local development launcher
├── backend/
│   ├── app/
│   │   ├── config.py        # Configuration and environment loader
│   │   ├── llm/             # LLM provider classes (Gemini, Ollama, Mock)
│   │   ├── routes/          # Flask blueprints (/curate, /steer, /suggestions, /profile)
│   │   └── services/        # Catalog query preparation
│   ├── requirements.txt     # Python dependencies
│   └── run.py               # Entrypoint script
└── frontend/
    ├── src/
    │   ├── components/      # Player, QueueView, VibeControls, Header, PromptInput
    │   ├── hooks/           # useSpotifyPlayer, useMediaSession
    │   └── services/        # API calls and Spotify PKCE authentication
    ├── package.json         # Frontend dependencies
    └── vite.config.js       # Vite configuration with PWA support
```
