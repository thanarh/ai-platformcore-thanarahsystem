#!/bin/bash
# Thanarah AI — Ollama Local Model Server
# Starts Ollama and ensures the default model is loaded.
# Models are stored in the workspace so they persist across restarts.

export OLLAMA_HOME=/home/runner/workspace/.ollama
export OLLAMA_MODELS=/home/runner/workspace/.ollama/models
export OLLAMA_HOST=127.0.0.1:11434

mkdir -p "$OLLAMA_MODELS"

OLLAMA_BIN=/home/runner/.local/bin/ollama
DEFAULT_MODEL="${LOCAL_AI_MODEL:-qwen2.5:0.5b}"

echo "🤖 Starting Ollama (model: $DEFAULT_MODEL)..."

# Start the server
exec "$OLLAMA_BIN" serve
