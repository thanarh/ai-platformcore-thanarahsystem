#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export NODE_ENV="production"
export API_PORT="${API_PORT:-3001}"
export AI_ENGINE_PORT="${AI_ENGINE_PORT:-8000}"
export AI_ENGINE_URL="${AI_ENGINE_URL:-http://127.0.0.1:${AI_ENGINE_PORT}}"
export NEXT_API_URL="${NEXT_API_URL:-http://127.0.0.1:${API_PORT}}"
export LOCAL_AI_ENABLED="${LOCAL_AI_ENABLED:-false}"
export FREE_PROVIDER_ONLY="${FREE_PROVIDER_ONLY:-true}"
export FREE_PROVIDERS_ENABLED="${FREE_PROVIDERS_ENABLED:-false}"
export PYTHONPATH="${ROOT_DIR}/.pythonlibs:${ROOT_DIR}/.pythonlibs/lib/python3.12/site-packages:${ROOT_DIR}/services/ai-engine:${PYTHONPATH:-}"

cleanup() {
  kill "${AI_PID:-}" "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

( cd services/ai-engine && python3 -m uvicorn main:app --host 127.0.0.1 --port "$AI_ENGINE_PORT" ) > /tmp/thanarah-ai.log 2>&1 &
AI_PID=$!

( cd apps/api && node dist/main.js ) > /tmp/thanarah-api.log 2>&1 &
API_PID=$!

# Render routes traffic to $PORT. Next.js is the public process.
( cd apps/web && ./node_modules/.bin/next start -p "${PORT:-10000}" ) > /tmp/thanarah-web.log 2>&1 &
WEB_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-10000}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

wait -n "$AI_PID" "$API_PID" "$WEB_PID"
