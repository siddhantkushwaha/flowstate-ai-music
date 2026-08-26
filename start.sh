#!/bin/bash

echo "Starting Flowstate application..."

# Create default .env from .env.example if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating default .env from .env.example..."
  cp .env.example .env
fi

# Function to kill background tasks on exit
cleanup() {
  echo "Stopping backend and frontend servers..."
  kill $(jobs -p) 2>/dev/null
  exit
}
trap cleanup EXIT INT TERM

echo "Starting Flask Backend on http://localhost:5050..."
(cd backend && ./venv/bin/python run.py) &

echo "Starting Vite Frontend on http://localhost:3000..."
(cd frontend && npm run dev) &

wait
