#!/usr/bin/env bash
set -euo pipefail

APP_HOME="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_HOME"

APP_NAME="token-gateway-admin"
JAR_FILE="${APP_HOME}/${APP_NAME}.jar"
PID_FILE="${APP_HOME}/${APP_NAME}.pid"
LOG_DIR="${APP_HOME}/logs"
CONFIG_DIR="${APP_HOME}/config"
OUT_FILE="${LOG_DIR}/startup.out"

JAVA_OPTS="${JAVA_OPTS:--Xms256m -Xmx512m -XX:+HeapDumpOnOutOfMemoryError}"

if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
  JAVA_BIN="${JAVA_HOME}/bin/java"
else
  JAVA_BIN="java"
fi

if [[ ! -f "$JAR_FILE" ]]; then
  echo "ERROR: jar not found: $JAR_FILE" >&2
  exit 1
fi

if ! command -v "$JAVA_BIN" >/dev/null 2>&1 && [[ ! -x "$JAVA_BIN" ]]; then
  echo "ERROR: java not found. Set JAVA_HOME or ensure java is on PATH." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "ERROR: ${APP_NAME} already running (pid=${OLD_PID}). Use ./stop.sh first." >&2
    exit 1
  fi
  rm -f "$PID_FILE"
fi

export LOGGING_FILE_PATH="${LOGGING_FILE_PATH:-$LOG_DIR}"

nohup "$JAVA_BIN" ${JAVA_OPTS} \
  -jar "$JAR_FILE" \
  --spring.config.additional-location="optional:file:${CONFIG_DIR}/" \
  >> "$OUT_FILE" 2>&1 &

echo $! > "$PID_FILE"
echo "Started ${APP_NAME} (pid=$(cat "$PID_FILE"))."
echo "Config : ${CONFIG_DIR}"
echo "Logs   : ${LOGGING_FILE_PATH} (startup: ${OUT_FILE})"
echo "Health : http://127.0.0.1:${SERVER_PORT:-8089}/admin/v1/health"
