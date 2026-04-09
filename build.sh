#!/bin/bash
set -e

echo "=== Installing Python dependencies ==="
pip install -r backend/requirements.txt

echo "=== Installing Node.js dependencies ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Copying database to /tmp ==="
if [ -f backend/inventory.db ]; then
  cp backend/inventory.db /tmp/inventory.db
  echo "Database copied to /tmp/inventory.db"
fi

echo "=== Build complete ==="
