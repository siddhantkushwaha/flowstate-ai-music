# syntax=docker/dockerfile:1.7

# ==========================================
# Stage 1: Build Frontend React PWA
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY frontend ./
ARG VITE_SPOTIFY_CLIENT_ID=""
ARG VITE_API_BASE_URL=""
ENV VITE_SPOTIFY_CLIENT_ID=$VITE_SPOTIFY_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN --mount=type=cache,target=/app/frontend/node_modules/.vite \
    npm run build

# ==========================================
# Stage 2: Production Python Backend + Static Host
# ==========================================
FROM python:3.11-slim
WORKDIR /app

# Install dependencies (pip cache mount persists across builds, even when
# requirements.txt changes, without bloating the final image layer)
COPY backend/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

# Copy Backend Source
COPY backend ./backend

# Copy built frontend assets to static_dist
COPY --from=frontend-builder /app/frontend/dist ./static_dist

ENV STATIC_DIR=/app/static_dist
ENV PORT=3000
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
# Single SQLite db (curation cache, taste profiles, curated session history)
# - point at a mounted volume so it survives container restarts/rebuilds
# (see docker-compose.yml).
ENV DB_PATH=/app/data/flowstate.sqlite3
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "2", "--timeout", "120", "--chdir", "backend", "run:app"]
