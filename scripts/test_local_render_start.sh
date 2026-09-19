#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export PORT="${PORT:-11000}"
export API_PORT="${API_PORT:-3101}"
export AI_ENGINE_PORT="${AI_ENGINE_PORT:-8100}"
export LOCAL_AI_MODE=enabled
export LOCAL_AI_REQUIRED=true
export LOCAL_AI_MODEL="${LOCAL_AI_MODEL:-qwen2.5:7b}"
export LOCAL_AI_KEEP_ALIVE=-1
export LOCAL_AI_NUM_CTX=4096
export LOCAL_AI_NUM_THREAD=6
export LOCAL_AI_NUM_BATCH=128
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MODELS="${OLLAMA_MODELS:-$ROOT_DIR/.ollama/models}"
export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27099/thanarah_ai}"
export JWT_SECRET="${JWT_SECRET:-local-render-smoke-jwt-secret-32-characters}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-local-render-smoke-refresh-secret-32-chars}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-local-render-smoke-encryption-key-32}"

LOG_FILE="/tmp/thanarah-local-render-start.log"
CAP_FILE="/tmp/thanarah-local-capabilities.json"
CHAT_FILE="/tmp/thanarah-local-chat.json"

cleanup() {
  if [[ -n "${START_PID:-}" ]]; then
    kill "$START_PID" 2>/dev/null || true
    wait "$START_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

bash render-start.sh >"$LOG_FILE" 2>&1 &
START_PID=$!

for _ in $(seq 1 240); do
  if grep -Fq '[START] All Thanarah services are ready' "$LOG_FILE" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$START_PID" 2>/dev/null; then
    cat "$LOG_FILE"
    exit 1
  fi
  sleep 1
done

grep -Fq '[START] All Thanarah services are ready' "$LOG_FILE"
grep -Fq '[START] Thanarah advanced generation is ready' "$LOG_FILE"
curl -fsS "http://127.0.0.1:${AI_ENGINE_PORT}/backends/capabilities" > "$CAP_FILE"
grep -Fq '"advanced":true' "$CAP_FILE"

curl -fsS --max-time 180 \
  -H 'Content-Type: application/json' \
  --data-binary '{"tenantId":"smoke-test","messages":[{"role":"user","content":"من أنت وماذا تقدم؟"}],"tenantConfig":{"responseProfile":"fast","memoryEnabled":false,"ragEnabled":false}}' \
  "http://127.0.0.1:${AI_ENGINE_PORT}/chat" > "$CHAT_FILE"

grep -Fq '"backend":"thanarah-local"' "$CHAT_FILE"
grep -Pq '[\x{0600}-\x{06FF}]' "$CHAT_FILE"
if grep -Fq 'قيد الاستعادة' "$CHAT_FILE"; then
  echo 'Fallback response detected unexpectedly' >&2
  cat "$CHAT_FILE"
  exit 1
fi

printf '%s\n' '--- capabilities ---'
cat "$CAP_FILE"
printf '\n%s\n' '--- real model response ---'
cat "$CHAT_FILE"
printf '\n%s\n' 'LOCAL_RENDER_GENERATION_OK'
