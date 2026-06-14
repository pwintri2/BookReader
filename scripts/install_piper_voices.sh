#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv_piper"
VOICES_DIR="$ROOT/out/bookreader/voices"

mkdir -p "$VOICES_DIR"

if [[ ! -x "$VENV/bin/piper" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install --upgrade pip
  "$VENV/bin/python" -m pip install "piper-tts==1.4.2"
fi

download() {
  local file="$1"
  local url="$2"
  if [[ -f "$VOICES_DIR/$file" ]]; then
    echo "Already present: $file"
    return
  fi
  echo "Downloading $file"
  curl -L --fail --output "$VOICES_DIR/$file" "$url"
}

BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"

download "nl_NL-ronnie-medium.onnx" "$BASE/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx"
download "nl_NL-ronnie-medium.onnx.json" "$BASE/nl/nl_NL/ronnie/medium/nl_NL-ronnie-medium.onnx.json"
download "nl_NL-alex-medium.onnx" "$BASE/nl/nl_NL/alex/medium/nl_NL-alex-medium.onnx"
download "nl_NL-alex-medium.onnx.json" "$BASE/nl/nl_NL/alex/medium/nl_NL-alex-medium.onnx.json"
download "en_US-lessac-medium.onnx" "$BASE/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
download "en_US-lessac-medium.onnx.json" "$BASE/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

echo "Piper binary: $VENV/bin/piper"
echo "Voice models: $VOICES_DIR"
