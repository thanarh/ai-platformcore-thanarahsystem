#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export NODE_ENV="production"
export API_PORT="${API_PORT:-3001}"
export AI_ENGINE_PORT="${AI_ENGINE_PORT:-8000}"
export AI_ENGINE_URL="${AI_ENGINE_URL:-http://127.0.0.1:${AI_ENGINE_PORT}}"
export NEXT_API_URL="${NEXT_API_URL:-http://127.0.0.1:${API_PORT}}"
export FREE_PROVIDER_ONLY="${FREE_PROVIDER_ONLY:-true}"
export FREE_PROVIDERS_ENABLED="${FREE_PROVIDERS_ENABLED:-false}"
export WEB_CONCURRENCY=1
export PYTHONUNBUFFERED=1
export PYTHONPATH="${ROOT_DIR}/.pythonlibs:${ROOT_DIR}/.pythonlibs/lib/python3.12/site-packages:${ROOT_DIR}/services/ai-engine:${PYTHONPATH:-}"

memory_limit_gb() {
  local bytes=""
  if [[ -r /sys/fs/cgroup/memory.max ]]; then
    bytes="$(cat /sys/fs/cgroup/memory.max)"
  fi
  if [[ "$bytes" =~ ^[0-9]+$ ]] && (( bytes > 0 && bytes < 1152921504606846976 )); then
    echo $((bytes / 1024 / 1024 / 1024))
    return
  fi
  awk '/MemTotal/ {print int($2 / 1024 / 1024)}' /proc/meminfo
}

LOCAL_AI_MODE="${LOCAL_AI_MODE:-auto}"
AVAILABLE_MEMORY_GB="$(memory_limit_gb)"
case "$LOCAL_AI_MODE" in
  enabled|true|on)
    export LOCAL_AI_ENABLED=true
    ;;
  disabled|false|off)
    export LOCAL_AI_ENABLED=false
    ;;
  auto)
    if (( AVAILABLE_MEMORY_GB >= ${LOCAL_AI_MIN_MEMORY_GB:-12} )); then
      export LOCAL_AI_ENABLED=true
    else
      export LOCAL_AI_ENABLED=false
    fi
    ;;
  *)
    echo "[START] Invalid LOCAL_AI_MODE=$LOCAL_AI_MODE; expected auto, enabled, or disabled" >&2
    exit 1
    ;;
esac

echo "[START] Memory limit: ${AVAILABLE_MEMORY_GB}GB; local generation: ${LOCAL_AI_ENABLED}"

cleanup() {
  kill "${MODEL_PID:-}" "${OLLAMA_PID:-}" "${AI_PID:-}" "${API_PID:-}" "${WEB_PID:-}" 2>/dev/null || true
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

start_local_model() {
  export LOCAL_AI_ENGINE="ollama"
  export LOCAL_AI_BASE_URL="${LOCAL_AI_BASE_URL:-http://127.0.0.1:11434}"
  export LOCAL_AI_MODEL="${LOCAL_AI_MODEL:-qwen2.5:7b}"
  export LOCAL_AI_KEEP_ALIVE="${LOCAL_AI_KEEP_ALIVE:--1}"
  export LOCAL_AI_NUM_CTX="${LOCAL_AI_NUM_CTX:-4096}"
  export LOCAL_AI_NUM_THREAD="${LOCAL_AI_NUM_THREAD:-6}"
  export LOCAL_AI_NUM_BATCH="${LOCAL_AI_NUM_BATCH:-128}"
  export LOCAL_AI_MAX_TOKENS_FAST="${LOCAL_AI_MAX_TOKENS_FAST:-128}"
  export LOCAL_AI_MAX_TOKENS_BALANCED="${LOCAL_AI_MAX_TOKENS_BALANCED:-384}"
  export LOCAL_AI_MAX_TOKENS_DEEP="${LOCAL_AI_MAX_TOKENS_DEEP:-768}"

  export OLLAMA_HOME="${OLLAMA_HOME:-${ROOT_DIR}/.ollama}"
  if [[ -z "${OLLAMA_MODELS:-}" ]]; then
    if [[ -d /var/data && -w /var/data ]]; then
      export OLLAMA_MODELS="/var/data/ollama/models"
    else
      export OLLAMA_MODELS="${OLLAMA_HOME}/models"
    fi
  fi
  export OLLAMA_HOST="127.0.0.1:11434"
  export OLLAMA_KEEP_ALIVE="-1"
  export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-1}"
  export OLLAMA_MAX_LOADED_MODELS="1"
  export OLLAMA_MAX_QUEUE="${OLLAMA_MAX_QUEUE:-128}"
  export OLLAMA_FLASH_ATTENTION="1"
  export OLLAMA_KV_CACHE_TYPE="${OLLAMA_KV_CACHE_TYPE:-q8_0}"
  export OLLAMA_NO_CLOUD="1"
  export OLLAMA_LIBRARY_PATH="${ROOT_DIR}/.ollama-lib/lib/ollama"
  export LD_LIBRARY_PATH="${OLLAMA_LIBRARY_PATH}:${LD_LIBRARY_PATH:-}"
  mkdir -p "$OLLAMA_MODELS"

  local ollama_bin="${OLLAMA_BIN:-${ROOT_DIR}/.ollama-lib/bin/ollama}"
  if [[ ! -x "$ollama_bin" ]]; then
    echo "[START] Local model runtime is missing: $ollama_bin" >&2
    exit 1
  fi

  echo "[START] Launching Thanarah generation runtime"
  "$ollama_bin" serve > >(sed -u 's/^/[MODEL] /') 2>&1 &
  OLLAMA_PID=$!
  wait_for_url "Thanarah generation runtime" "http://127.0.0.1:11434/api/tags" 60

  provision_model() {
    while true; do
      if "$ollama_bin" show "$LOCAL_AI_MODEL" >/dev/null 2>&1 || "$ollama_bin" pull "$LOCAL_AI_MODEL"; then
        echo "[MODEL] Model available: $LOCAL_AI_MODEL"
        printf '{"model":"%s","messages":[],"stream":false,"keep_alive":-1,"think":false,"options":{"num_predict":1,"num_ctx":%s}}' \
          "$LOCAL_AI_MODEL" "$LOCAL_AI_NUM_CTX" \
          | curl -fsS --max-time 600 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:11434/api/chat >/dev/null \
          && echo "[MODEL] Model warmed and ready: $LOCAL_AI_MODEL" \
          || echo "[MODEL] Warmup will retry on first request"
        return 0
      fi
      echo "[MODEL] Model provisioning failed; retrying in 30 seconds" >&2
      sleep 30
    done
  }
  if [[ "${LOCAL_AI_REQUIRED:-false}" == "true" ]]; then
    provision_model
  else
    provision_model &
    MODEL_PID=$!
  fi
}

if [[ "$LOCAL_AI_ENABLED" == "true" ]]; then
  start_local_model
fi

echo "[START] Launching Thanarah Intelligence service"
(
  cd services/ai-engine
  python3 -m uvicorn main:app --host 127.0.0.1 --port "$AI_ENGINE_PORT" --workers 1
) > >(sed -u 's/^/[AI] /') 2>&1 &
AI_PID=$!
wait_for_url "Thanarah Intelligence" "http://127.0.0.1:${AI_ENGINE_PORT}/health" 75

if [[ "$LOCAL_AI_ENABLED" == "true" && "${LOCAL_AI_REQUIRED:-false}" == "true" ]]; then
  echo "[START] Verifying advanced generation readiness"
  for _ in $(seq 1 60); do
    capabilities="$(curl -fsS --max-time 5 "http://127.0.0.1:${AI_ENGINE_PORT}/backends/capabilities" 2>/dev/null || true)"
    if grep -Fq '"advanced":true' <<<"$capabilities"; then
      echo "[START] Thanarah advanced generation is ready"
      break
    fi
    sleep 2
  done
  if ! grep -Fq '"advanced":true' <<<"${capabilities:-}"; then
    echo "[START] Advanced generation did not become ready" >&2
    exit 1
  fi
fi

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
  services=("AI:$AI_PID" "API:$API_PID" "WEB:$WEB_PID")
  if [[ "$LOCAL_AI_ENABLED" == "true" ]]; then
    services+=("MODEL:$OLLAMA_PID")
  fi
  for service in "${services[@]}"; do
    name="${service%%:*}"
    pid="${service##*:}"
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[START] ${name} service exited unexpectedly" >&2
      exit 1
    fi
  done
  sleep 5
done
