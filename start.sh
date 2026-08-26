#!/bin/bash

echo "🚀 Starting AI Music Application..."

# Create default .env files from .env.example if they don't exist
if [ ! -f backend/.env ]; then
  echo "📄 Creating default backend/.env from .env.example..."
  cp backend/.env.example backend/.env
fi

if [ ! -f frontend/.env ]; then
  echo "📄 Creating default frontend/.env from .env.example..."
  cp frontend/.env.example frontend/.env
fi

# Function to kill background tasks on exit
cleanup() {
  echo "Stopping backend and frontend servers..."
  kill $(jobs -p) 2>/dev/null
  exit
}
trap cleanup EXIT INT TERM

echo "🐍 Starting Flask Backend on http://localhost:5050..."
(cd backend && ./venv/bin/python run.py) &

echo "⚡ Starting Vite Frontend on http://localhost:3000..."
(cd frontend && npm run dev) &

wait
