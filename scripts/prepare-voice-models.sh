#!/usr/bin/env bash
set -euo pipefail

# Explicit, bounded provisioning for the Phase 6 local voice assets.
# This is intentionally not called from the normal application startup path.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="${ROOT}/services/ai-engine/models"
WHISPER_DIR="${MODEL_DIR}/faster-whisper-tiny"
mkdir -p "${WHISPER_DIR}"

download() {
  local url="$1"
  local destination="$2"
  if [[ ! -s "${destination}" ]]; then
    curl --fail --location --silent --show-error "${url}" --output "${destination}"
  fi
}

download "https://huggingface.co/Systran/faster-whisper-tiny/resolve/main/config.json" \
  "${WHISPER_DIR}/config.json"
download "https://huggingface.co/Systran/faster-whisper-tiny/resolve/main/vocabulary.txt" \
  "${WHISPER_DIR}/vocabulary.txt"
download "https://huggingface.co/Systran/faster-whisper-tiny/resolve/main/tokenizer.json" \
  "${WHISPER_DIR}/tokenizer.json"
download "https://huggingface.co/Systran/faster-whisper-tiny/resolve/main/model.bin" \
  "${WHISPER_DIR}/model.bin"

download "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx" \
  "${MODEL_DIR}/ar_JO-kareem-low.onnx"
download "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx.json" \
  "${MODEL_DIR}/ar_JO-kareem-low.onnx.json"
download "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx" \
  "${MODEL_DIR}/en_US-lessac-low.onnx"
download "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/low/en_US-lessac-low.onnx.json" \
  "${MODEL_DIR}/en_US-lessac-low.onnx.json"

echo "Local voice models are ready in ${MODEL_DIR}"