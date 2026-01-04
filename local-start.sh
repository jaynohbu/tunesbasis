#!/bin/bash
set -e

echo "========================================="
echo "🚀 Starting TunesBasis Local Frontend"
echo "========================================="
echo ""

# Port to check
PORT=4200

# Kill process using the port
echo "🔍 Checking for processes using port $PORT..."
PID=$(lsof -ti:$PORT 2>/dev/null || echo "")

if [ -n "$PID" ]; then
  echo "   ⚠️  Port $PORT is in use by PID $PID - killing process..."
  kill -9 $PID 2>/dev/null || true
  sleep 1
else
  echo "   ✓ Port $PORT is available"
fi

echo ""
echo "📦 Installing dependencies (if needed)..."
npm install --silent

echo ""
echo "🎬 Starting Angular development server..."
echo "   - Frontend: http://localhost:4200"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================="
echo ""

# Start the Angular dev server
npm start
