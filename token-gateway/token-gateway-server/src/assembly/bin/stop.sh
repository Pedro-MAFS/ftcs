#!/usr/bin/env bash
set -euo pipefail

APP_HOME="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_HOME"

APP_NAME="token-gateway-server"
PID_FILE="${APP_HOME}/${APP_NAME}.pid"
STOP_TIMEOUT="${STOP_TIMEOUT:-30}"

if [[ ! -f "$PID_FILE" ]]; then
  echo "WARN: pid file not found (${PID_FILE}); process may not be running."
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [[ -z "${PID}" ]]; then
  echo "WARN: empty pid file; removing."
  rm -f "$PID_FILE"
  exit 0
fi

if ! kill -0 "$PID" 2>/dev/null; then
  echo "WARN: process pid=${PID} not running; removing stale pid file."
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping ${APP_NAME} (pid=${PID})..."
kill "$PID" 2>/dev/null || true

for ((i = 1; i <= STOP_TIMEOUT; i++)); do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Stopped ${APP_NAME}."
    exit 0
  fi
  sleep 1
done

echo "WARN: graceful stop timed out after ${STOP_TIMEOUT}s; sending SIGKILL."
kill -9 "$PID" 2>/dev/null || true
rm -f "$PID_FILE"
echo "Stopped ${APP_NAME} (forced)."
