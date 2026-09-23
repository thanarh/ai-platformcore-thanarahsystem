#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

export NEXT_API_URL="${NEXT_API_URL:-http://127.0.0.1:3001}"

# Production only needs the two app manifests; the root package is a dev orchestrator.
# Avoiding a root install also prevents unrelated npm resolver failures on Render.
# Replit's package firewall writes an internal tarball host into lockfiles. That
# host is not resolvable from Render, so normalize the cloned build workspace
# before installing and make the public registry explicit.
node scripts/prepare-public-npm-locks.mjs
npm ci --registry=https://registry.npmjs.org/ --prefix apps/web --include=dev --no-audit --no-fund
npm ci --registry=https://registry.npmjs.org/ --prefix apps/api --include=dev --no-audit --no-fund

npm run build --prefix apps/api
npm run build --prefix apps/web

mkdir -p .pythonlibs
PIP_NO_CACHE_DIR=1 python3 -m pip install \
  --disable-pip-version-check \
  --break-system-packages \
  --target .pythonlibs \
  -r services/ai-engine/requirements-render.txt

echo "Render build complete: web, API, and lightweight AI engine are ready."
