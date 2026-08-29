#!/bin/bash
# Start the development services with secrets derived from SESSION_SECRET.

set -e

source "$(dirname "$0")/scripts/prepare-secrets.sh"

echo "Installing locked Node.js dependencies..."
npm ci --no-audit --no-fund
npm ci --prefix apps/web --no-audit --no-fund
npm ci --prefix apps/api --no-audit --no-fund

echo "Installing Python dependencies..."
mkdir -p .pythonlibs/lib/python3.12/site-packages
python -m pip install --disable-pip-version-check --break-system-packages \
  --target .pythonlibs/lib/python3.12/site-packages \
  -r services/ai-engine/requirements.txt

exec npx concurrently \
  --names "WEB,API,AI,OLLAMA" \
  --prefix-colors "green,blue,yellow,magenta" \
  --kill-others-on-fail \
  "cd apps/web && npm run dev" \
  "cd apps/api && npm run start:dev" \
  "cd services/ai-engine && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" \
  "OLLAMA_HOME=/home/runner/workspace/.ollama OLLAMA_MODELS=/home/runner/workspace/.ollama/models OLLAMA_LIBRARY_PATH=/home/runner/workspace/.ollama-lib/lib/ollama OLLAMA_KEEP_ALIVE=-1 /home/runner/workspace/.ollama-lib/bin/ollama serve"