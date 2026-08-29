#!/bin/bash
# Start the development services with secrets derived from SESSION_SECRET.

set -e

if [ -z "${SESSION_SECRET:-}" ]; then
  echo "SESSION_SECRET is required. Add it to Replit Secrets before starting."
  exit 1
fi

derive_secret() {
  printf '%s' "${SESSION_SECRET}:$1" | sha256sum | cut -d' ' -f1
}

export JWT_SECRET="${JWT_SECRET:-$(derive_secret jwt)}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(derive_secret refresh)}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(derive_secret encryption)}"

exec npx concurrently \
  --names "WEB,API,AI,OLLAMA" \
  --prefix-colors "green,blue,yellow,magenta" \
  --kill-others-on-fail \
  "cd apps/web && npm run dev" \
  "cd apps/api && npm run start:dev" \
  "cd services/ai-engine && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" \
  "OLLAMA_HOME=/home/runner/workspace/.ollama OLLAMA_MODELS=/home/runner/workspace/.ollama/models OLLAMA_LIBRARY_PATH=/home/runner/workspace/.ollama-lib/lib/ollama OLLAMA_KEEP_ALIVE=-1 /home/runner/workspace/.ollama-lib/bin/ollama serve"