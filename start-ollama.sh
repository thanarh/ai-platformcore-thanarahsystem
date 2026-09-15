#!/bin/bash
# Thanarah AI — Ollama Local Model Server
# Starts Ollama and ensures the default model is loaded.
# Models are stored in the workspace so they persist across restarts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export OLLAMA_HOME="${OLLAMA_HOME:-$SCRIPT_DIR/.ollama}"
export OLLAMA_MODELS="${OLLAMA_MODELS:-$OLLAMA_HOME/models}"
export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
export OLLAMA_LIBRARY_PATH="${OLLAMA_LIBRARY_PATH:-$SCRIPT_DIR/.ollama-lib/lib/ollama}"
export OLLAMA_KEEP_ALIVE=-1

mkdir -p "$OLLAMA_MODELS"

OLLAMA_BIN="${OLLAMA_BIN:-$SCRIPT_DIR/.ollama-lib/bin/ollama}"
DEFAULT_MODEL="${LOCAL_AI_MODEL:-qwen2.5:0.5b}"

echo "🤖 Starting Ollama (model: $DEFAULT_MODEL)..."

"$OLLAMA_BIN" serve &
OLLAMA_PID=$!
trap 'kill "$OLLAMA_PID" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:11434/api/tags >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:11434/api/tags | grep -Fq "\"name\":\"$DEFAULT_MODEL\""; then
  echo "📥 Pulling local model $DEFAULT_MODEL..."
  "$OLLAMA_BIN" pull "$DEFAULT_MODEL"
fi

echo "✅ Ollama model ready: $DEFAULT_MODEL"
wait "$OLLAMA_PID"
