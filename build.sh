#!/bin/bash
# Thanarah AI — Production build script
# NOTE: Replit pip.conf forces user=yes globally, so pip installs go to
# .pythonlibs/ automatically. Do NOT use virtualenv here.
set -e

echo "🐍 Installing Python dependencies..."
mkdir -p .pythonlibs/lib/python3.12/site-packages
python -m pip install --disable-pip-version-check --break-system-packages \
  --target .pythonlibs/lib/python3.12/site-packages \
  -r services/ai-engine/requirements.txt
echo "✅ Python dependencies ready"

echo "📦 Building Next.js..."
cd apps/web
npm install --silent
npm run build
cd ../..
echo "✅ Next.js built"

echo "📦 Building NestJS..."
cd apps/api
npm install --silent
npm run build
cd ../..
echo "✅ NestJS built"

echo "🚀 Build complete!"
