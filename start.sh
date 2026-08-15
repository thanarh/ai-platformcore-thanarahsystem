#!/bin/bash
# Thanarah AI — Start all services

set -e

echo "🌿 Starting Thanarah AI platform..."

# Install root dependencies (concurrently) if missing in dev
if [ ! -d "node_modules" ]; then
  echo "📦 Installing root dependencies..."
  npm install
fi

# Use virtualenv Python if available (production), else system Python (dev)
if [ -f ".venv/bin/python" ]; then
  AI_PYTHON=".venv/bin/python"
else
  AI_PYTHON="python"
fi

echo "🐍 Using Python: $AI_PYTHON"

# Use production servers if built, else dev servers
if [ -f "apps/web/.next/BUILD_ID" ]; then
  WEB_CMD="cd apps/web && npm run start"
else
  WEB_CMD="cd apps/web && npm run dev"
fi

if [ -f "apps/api/dist/main.js" ]; then
  API_CMD="cd apps/api && npm run start:prod"
else
  API_CMD="cd apps/api && npm run start:dev"
fi

exec npx concurrently \
  --names "WEB,API,AI,OLLAMA" \
  --prefix-colors "green,blue,yellow,magenta" \
  --kill-others-on-fail \
  "$WEB_CMD" \
  "$API_CMD" \
  "cd services/ai-engine && $AI_PYTHON -m uvicorn main:app --host 0.0.0.0 --port 8000" \
  "OLLAMA_HOME=/home/runner/workspace/.ollama OLLAMA_MODELS=/home/runner/workspace/.ollama/models OLLAMA_LIBRARY_PATH=/home/runner/workspace/.ollama-lib/lib/ollama OLLAMA_KEEP_ALIVE=-1 /home/runner/workspace/.ollama-lib/bin/ollama serve"
