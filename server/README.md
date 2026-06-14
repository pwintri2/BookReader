# BookReader API

Optional companion server for mobile/PWA use, server-side TTS and ComfyUI.

```bash
npm run api
```

## TTS

Install Piper and the default BookReader voices:

```bash
scripts/install_piper_voices.sh
```

This creates `.venv_piper/` and downloads voice models into `out/bookreader/voices/`.
Server-TTS auto-detects those paths. You can override them on a VPS:

```bash
BOOKREADER_PIPER_BIN=/usr/local/bin/piper \
BOOKREADER_PIPER_VOICES_DIR=/opt/bookreader/voices \
BOOKREADER_PIPER_MODEL=nl_NL-ronnie-medium \
npm run api
```

The API returns honest `503` responses when Piper or voice models are not configured.

## ComfyUI

ComfyUI generation is disabled until an API workflow JSON is configured:

```bash
BOOKREADER_COMFY_URL=http://127.0.0.1:8188 \
BOOKREADER_COMFY_WORKFLOW=/opt/bookreader/comfy/bookreader-workflow-api.json \
npm run api
```

The bridge injects the chapter prompt into `CLIPTextEncode` nodes and a seed into seed fields. It queues the job through `/prompt`, polls `/history/{prompt_id}`, and proxies `/view` images back to the app.

## Mobile/VPS

For local phone testing:

```bash
npm run dev:mobile
npm run api
```

For VPS deployment, build the frontend with `npm run build`, serve `dist/` over HTTPS, and run this API behind the same domain or set `VITE_BOOKREADER_API_BASE` during the frontend build.
