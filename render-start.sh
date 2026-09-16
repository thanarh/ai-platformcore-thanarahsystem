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
# Render may inject WEB_CONCURRENCY from CPU count. This service runs three
# application processes in one instance, so the Python engine must stay single-worker.
export WEB_CONCURRENCY=1
export PYTHONUNBUFFERED=1
export PYTHONPATH="${ROOT_DIR}/.pythonlibs:${ROOT_DIR}/.pythonlibs/lib/python3.12/site-packages:${ROOT_DIR}/services/ai-engine:${PYTHONPATH:-}"

cleanup() {
  kill "${AI_PID:-}" "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts="${3:-60}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "[START] ${name} is ready"
      return 0
    fi
    sleep 1
  done
  echo "[START] ${name} did not become ready: ${url}" >&2
  return 1
}

echo "[START] Launching Thanarah Intelligence service"
(
  cd services/ai-engine
  python3 -m uvicorn main:app --host 127.0.0.1 --port "$AI_ENGINE_PORT" --workers 1
) > >(sed -u 's/^/[AI] /') 2>&1 &
AI_PID=$!
wait_for_url "Thanarah Intelligence" "http://127.0.0.1:${AI_ENGINE_PORT}/health" 75

echo "[START] Launching Thanarah API"
(
  cd apps/api
  node dist/main.js
) > >(sed -u 's/^/[API] /') 2>&1 &
API_PID=$!
wait_for_url "Thanarah API" "http://127.0.0.1:${API_PORT}/api/health" 75

echo "[START] Launching Thanarah Web"
(
  cd apps/web
  ./node_modules/.bin/next start -p "${PORT:-10000}"
) > >(sed -u 's/^/[WEB] /') 2>&1 &
WEB_PID=$!
wait_for_url "Thanarah Web" "http://127.0.0.1:${PORT:-10000}/" 75

echo "[START] All Thanarah services are ready"

while true; do
  for service in "AI:$AI_PID" "API:$API_PID" "WEB:$WEB_PID"; do
    name="${service%%:*}"
    pid="${service##*:}"
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[START] ${name} service exited unexpectedly" >&2
      exit 1
    fi
  done
  sleep 5
done
