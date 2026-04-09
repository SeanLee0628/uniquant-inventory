#!/bin/bash
set -e

echo "=== Installing Python dependencies ==="
pip install -r backend/requirements.txt

echo "=== Installing Node.js dependencies ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Checking database ==="
ls -lh backend/inventory.db || echo "WARNING: inventory.db not found!"
echo "=== Build complete ==="
echo "DB will be copied to /tmp at start time"

echo "=== Build complete ==="
