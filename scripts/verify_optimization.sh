#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
PYTHONPATH="$PWD/.pythonlibs/lib/python3.12/site-packages:$PWD/services/ai-engine" python3 -m compileall -q services/ai-engine
( cd apps/api && npm run build )
( cd apps/web && npm run build )
printf '%s\n' 'OPTIMIZATION_VERIFY_OK'
