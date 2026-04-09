#!/bin/bash
set -e

echo "=== Installing Python dependencies ==="
pip install -r backend/requirements.txt

echo "=== Checking pre-built frontend ==="
if [ -d frontend/build ]; then
  echo "Frontend build found, skipping npm build"
  ls -lh frontend/build/index.html
else
  echo "No pre-built frontend, building now..."
  cd frontend
  npm install
  npm run build
  cd ..
fi

echo "=== Build complete ==="

echo "=== Build complete ==="
