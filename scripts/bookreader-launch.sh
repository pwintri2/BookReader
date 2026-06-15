#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/pwintri2/BookReader"
API_HOST="${BOOKREADER_API_HOST:-127.0.0.1}"
API_PORT="${BOOKREADER_API_PORT:-1433}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/bookreader"
API_LOG="$STATE_DIR/api.log"
APP_BIN="$APP_DIR/src-tauri/target/release/bookreader"

mkdir -p "$STATE_DIR"

api_is_ready() {
  python3 - "$API_HOST" "$API_PORT" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
sock = socket.socket()
sock.settimeout(0.4)
try:
    sock.connect((host, port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
}

api_supports_projects() {
  python3 - "$API_HOST" "$API_PORT" <<'PY'
import http.client
import json
import sys

host = sys.argv[1]
port = int(sys.argv[2])
try:
    conn = http.client.HTTPConnection(host, port, timeout=1.0)
    conn.request("GET", "/api/projects/list")
    response = conn.getresponse()
    payload = json.loads(response.read().decode("utf-8") or "{}")
except Exception:
    sys.exit(1)
finally:
    try:
        conn.close()
    except Exception:
        pass

sys.exit(0 if response.status == 200 and isinstance(payload.get("projects"), list) else 1)
PY
}

if api_is_ready && ! api_supports_projects; then
  pkill -f "node server/bookreader-api.mjs" || true
  pkill -f "npm run api" || true
  for _ in {1..20}; do
    api_is_ready || break
    sleep 0.15
  done
fi

if ! api_is_ready; then
  (
    cd "$APP_DIR"
    nohup npm run api >> "$API_LOG" 2>&1 &
  )
  for _ in {1..40}; do
    api_is_ready && break
    sleep 0.25
  done
fi

if [[ -x "$APP_BIN" ]]; then
  exec "$APP_BIN"
fi

cd "$APP_DIR"
exec npm run tauri -- dev
