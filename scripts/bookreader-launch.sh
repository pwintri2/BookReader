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

api_supports_current_features() {
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
    projects_payload = json.loads(response.read().decode("utf-8") or "{}")
    projects_ok = response.status == 200 and isinstance(projects_payload.get("projects"), list)
    conn.close()

    conn = http.client.HTTPConnection(host, port, timeout=1.0)
    conn.request("GET", "/api/library/list")
    response = conn.getresponse()
    library_payload = json.loads(response.read().decode("utf-8") or "{}")
    library_ok = response.status == 200 and isinstance(library_payload.get("projects"), list)
    conn.close()

    conn = http.client.HTTPConnection(host, port, timeout=1.0)
    conn.request("GET", "/api/library/categories")
    response = conn.getresponse()
    categories_payload = json.loads(response.read().decode("utf-8") or "{}")
    categories_ok = response.status == 200 and isinstance(categories_payload.get("categories"), list)
    conn.close()

    conn = http.client.HTTPConnection(host, port, timeout=1.0)
    conn.request("GET", "/api/health")
    response = conn.getresponse()
    health_payload = json.loads(response.read().decode("utf-8") or "{}")
    film_ok = response.status == 200 and isinstance(health_payload.get("film"), dict)
    conn.close()

    conn = http.client.HTTPConnection(host, port, timeout=1.0)
    conn.request("GET", "/api/models")
    response = conn.getresponse()
    models_payload = json.loads(response.read().decode("utf-8") or "{}")
    models_ok = (
        response.status == 200
        and isinstance(models_payload.get("ollama", {}).get("models"), list)
        and isinstance(models_payload.get("deepseekApi", {}).get("models"), list)
    )
except Exception:
    sys.exit(1)
finally:
    try:
        conn.close()
    except Exception:
        pass

sys.exit(0 if projects_ok and library_ok and categories_ok and film_ok and models_ok else 1)
PY
}

if api_is_ready && ! api_supports_current_features; then
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
    nohup node server/bookreader-api.mjs >> "$API_LOG" 2>&1 &
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
