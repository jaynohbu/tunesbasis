#!/bin/bash
set -e

echo "========================================="
echo "🛑 Stopping TunesBasis Local Frontend"
echo "========================================="
echo ""

# Port to check
PORT=4200

# Kill process using the port
echo "🔍 Finding and stopping processes..."
PID=$(lsof -ti:$PORT 2>/dev/null || echo "")

if [ -n "$PID" ]; then
  echo "   ⏸️  Killing process on port $PORT (PID $PID)..."
  kill -9 $PID 2>/dev/null || true
  sleep 1
  echo ""
  echo "✅ Frontend stopped successfully!"
else
  echo "   ℹ️  No frontend processes found running"
fi

echo ""
echo "========================================="
