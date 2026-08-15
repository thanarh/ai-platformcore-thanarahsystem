#!/bin/bash
# Thanarah AI — Production build script
set -e

echo "🐍 Setting up Python virtual environment..."
python -m venv .venv
.venv/bin/pip install -r services/ai-engine/requirements.txt --quiet
echo "✅ Python environment ready"

echo "📦 Installing Node.js dependencies..."
cd apps/web && npm install --silent && npm run build && cd ../..
echo "✅ Next.js built"

cd apps/api && npm install --silent && npm run build && cd ../..
echo "✅ NestJS built"

echo "🚀 Build complete!"
