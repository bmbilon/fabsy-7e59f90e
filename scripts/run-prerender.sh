#!/usr/bin/env bash
set -euo pipefail

# config
PORT=5173
PREVIEW_LOG=/tmp/vite_preview.log
PRERENDER_SCRIPT="scripts/prerender-pages.cjs"
OUT_DIR="${PRERENDER_OUT_DIR:-prerendered}"

echo
echo "== Check for running preview on ports ${PORT} and 8080 =="
if command -v lsof >/dev/null 2>&1; then
  echo -n "Port ${PORT}: "
  if lsof -iTCP:${PORT} -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    PID5173=$(lsof -t -iTCP:${PORT} -sTCP:LISTEN -Pn)
    echo "listening (PID ${PID5173})"
  else
    echo "not listening"
  fi

  echo -n "Port 8080: "
  if lsof -iTCP:8080 -sTCP:LISTEN -Pn >/dev/null 2>&1; then
    PID8080=$(lsof -t -iTCP:8080 -sTCP:LISTEN -Pn)
    echo "listening (PID ${PID8080})"
  else
    echo "not listening"
  fi
else
  echo "lsof not available — skipping port checks"
fi

# If preview is already running on PORT, ask user to kill it or we will reuse it.
if [ -n "${PID5173:-}" ]; then
  echo
  echo "A preview server is already running on port ${PORT} (PID ${PID5173})."
  echo "If you want this script to stop that process and start a fresh preview, run:"
  echo "  kill ${PID5173} && $0"
  echo "Or press Ctrl+C and handle manually."
  exit 0
fi

echo
echo "== Building site (this may take a moment) =="
npm run build

echo
echo "== Starting vite preview on port ${PORT} (logs -> ${PREVIEW_LOG}) =="
# start preview in background and capture PID
# use nohup style redir so it stays backgrounded in Warp
npx vite preview --port ${PORT} > "${PREVIEW_LOG}" 2>&1 & 
PREVIEW_PID=$!
echo "Preview started (PID ${PREVIEW_PID}). Waiting for server to respond..."

# wait up to 30s for server to respond
READY=0
for i in $(seq 1 30); do
  if curl -sSf "http://localhost:${PORT}/" >/dev/null 2>&1; then
    READY=1
    echo "✔ Preview responding on http://localhost:${PORT}/ (after ${i}s)"
    break
  fi
  sleep 1
done

if [ "${READY}" -ne 1 ]; then
  echo "❌ Preview did not respond within 30s. Tail the log for diagnostics:"
  echo "→ tail -n 200 ${PREVIEW_LOG}"
  echo "You can stop the preview with: kill ${PREVIEW_PID}"
  exit 2
fi

# show a short snippet of the head to verify JSON-LD presence quickly
echo
echo "== Quick HEAD sanity (first 200 chars of /) =="
curl -s "http://localhost:${PORT}/" | sed -n '1,40p' | head -c 200 || true
echo
echo

# Run prerender script
if [ ! -f "${PRERENDER_SCRIPT}" ]; then
  echo "❌ Prerender script not found at ${PRERENDER_SCRIPT}. Create scripts/prerender-pages.cjs first."
  echo "Stopping preview (PID ${PREVIEW_PID})..."
  kill ${PREVIEW_PID} || true
  exit 3
fi

echo "== Running prerender script against local preview =="
PRERENDER_BASE_URL="http://localhost:${PORT}" node "${PRERENDER_SCRIPT}"

echo
echo "== Prerender complete =="
echo "Check output: ./${OUT_DIR}/<slug>/index.html"
echo "Example:"
ls -l "${OUT_DIR}" | sed -n '1,50p' || true

# stop preview server
echo
echo "== Stopping preview server (PID ${PREVIEW_PID}) =="
kill ${PREVIEW_PID} || true
wait ${PREVIEW_PID} 2>/dev/null || true
echo "Stopped."

echo
echo "Done. If anything hung, inspect the preview log:"
echo "  tail -n 200 ${PREVIEW_LOG}"
