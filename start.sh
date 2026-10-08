#!/usr/bin/env bash
# macOS/Linux one-click start: builds the frontend if needed and runs DOC.
# Usage: ./start.sh [port]   (default 8000)
set -e
cd "$(dirname "$0")"
PORT="${1:-8000}"

if curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "DOC is already running -> http://127.0.0.1:$PORT"; exit 0
fi
while (echo > "/dev/tcp/127.0.0.1/$PORT") >/dev/null 2>&1; do
  echo "Port $PORT is in use, trying $((PORT + 1))..."; PORT=$((PORT + 1))
done

[ -x backend/.venv/bin/python ] || python3 -m venv backend/.venv
backend/.venv/bin/pip install -q --disable-pip-version-check -r backend/requirements.txt
[ -f frontend/dist/index.html ] || (cd frontend && npm install && npm run build)
echo "DOC starting -> http://127.0.0.1:$PORT  (Ctrl+C to stop)"
exec backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "$PORT"
