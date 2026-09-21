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
PIP_USER=0 python -m pip install --disable-pip-version-check --break-system-packages \
  --target .pythonlibs/lib/python3.12/site-packages \
  -r services/ai-engine/requirements.txt

# faster-whisper is intentionally isolated in Python 3.13. Resolve its Nix
# dependency closure once in the shell; never recursively scan /nix/store in
# the AI process itself.
VOICE_STT_PYTHONPATH=""
VOICE_STT_PACKAGE="$(nix path-info nixpkgs#python313Packages.faster-whisper)"
while IFS= read -r voice_path; do
  voice_site="${voice_path}/lib/python3.13/site-packages"
  if [[ -d "$voice_site" ]]; then
    VOICE_STT_PYTHONPATH="${VOICE_STT_PYTHONPATH:+${VOICE_STT_PYTHONPATH}:}${voice_site}"
  fi
done < <(nix-store -qR "${VOICE_STT_PACKAGE}")
export VOICE_STT_PYTHONPATH

OLLAMA_PID=""
APP_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$APP_PID" ]]; then
    kill -TERM -- "-$APP_PID" 2>/dev/null || true
  fi
  if [[ -n "$OLLAMA_PID" ]]; then
    kill -TERM -- "-$OLLAMA_PID" 2>/dev/null || true
  fi
  wait "$APP_PID" 2>/dev/null || true
  wait "$OLLAMA_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

setsid bash start-ollama.sh > >(sed -u 's/^/[OLLAMA] /') 2>&1 &
OLLAMA_PID=$!

echo "Waiting for the local model warm-up..."
for _ in $(seq 1 90); do
  [[ -f /tmp/thanarah-ollama-ready ]] && break
  sleep 1
done
if [[ ! -f /tmp/thanarah-ollama-ready ]]; then
  echo "Local model did not become ready within 90 seconds." >&2
  exit 1
fi

setsid npx concurrently \
  --names "WEB,API,AI" \
  --prefix-colors "green,blue,yellow" \
  --kill-others-on-fail \
  "cd apps/web && npm run dev" \
  "cd apps/api && npm run start:dev" \
  "cd services/ai-engine && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" &
APP_PID=$!

set +e
wait "$APP_PID"
STATUS=$?
set -e
exit "$STATUS"