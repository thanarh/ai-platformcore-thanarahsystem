#!/bin/bash
# Thanarah AI — Ollama Local Model Server
# Starts Ollama and ensures the default model is loaded.
# Models are stored in the workspace so they persist across restarts.

export OLLAMA_HOME=/home/runner/workspace/.ollama
export OLLAMA_MODELS=/home/runner/workspace/.ollama/models
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_LIBRARY_PATH=/home/runner/workspace/.ollama-lib/lib/ollama
export OLLAMA_KEEP_ALIVE=-1

mkdir -p "$OLLAMA_MODELS"

OLLAMA_BIN=/home/runner/workspace/.ollama-lib/bin/ollama
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
