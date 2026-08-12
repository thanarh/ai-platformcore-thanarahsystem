#!/bin/bash
# Thanarah AI — Start all services

set -e

echo "🌿 Starting Thanarah AI platform..."

# Install root dependencies (concurrently)
if [ ! -d "node_modules" ]; then
  echo "📦 Installing root dependencies..."
  npm install
fi

# Start all services concurrently
exec npx concurrently \
  --names "WEB,API,AI" \
  --prefix-colors "green,blue,yellow" \
  --kill-others-on-fail \
  "cd apps/web && npm run dev" \
  "cd apps/api && npm run start:dev" \
  "cd services/ai-engine && python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
