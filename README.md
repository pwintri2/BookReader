# BookReader

BookReader is a standalone Tauri/PWA reading and story-building app. It imports long text, DOCX and PDF files, splits them into readable chapters, reads them aloud, generates stories from prompts, and creates chapter illustrations, character portraits and book covers through a local ComfyUI workflow.

The app is built to stay useful offline first: browser speech and document parsing work locally, while the optional server layer adds Piper TTS, Ollama/DeepSeek analysis, DeepSeek API support and ComfyUI image generation.

## Highlights

- Import `TXT`, `MD`, `DOCX`, `PDF` and `.bookreader.json` project files.
- Split documents up to 500,000 words into chapters.
- Read chapters aloud with browser voices or server-side Piper voices.
- Generate multi-page stories from prompts in `Auto`, Dutch, English, German, French or Spanish.
- Add a separate reference file so the writer can reuse character history, relationships and continuity cues.
- Generate chapter illustrations, character portraits and book covers with ComfyUI.
- Save BookReader projects with text, prompts and embedded generated images.
- Store generated images locally under `out/bookreader/images/`.

## Quick Start

```bash
npm install
npm run api
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://127.0.0.1:1432
```

For the desktop app:

```bash
npm run tauri -- dev
```

## Desktop Launcher

The repository includes `scripts/bookreader-launch.sh` for local desktop use. It starts the BookReader API when needed and then opens the Tauri app. A Linux `.desktop` entry can point to this script:

```text
Exec=/home/pwintri2/BookReader/scripts/bookreader-launch.sh
Icon=/home/pwintri2/BookReader/public/icons/bookreader.svg
```

The launcher writes API logs to:

```text
~/.local/state/bookreader/api.log
```

## Useful Commands

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
scripts/install_piper_voices.sh
npm run dev:mobile
```

## Server Layer

`npm run api` starts the companion API on:

```text
http://127.0.0.1:1433
```

The server reads `.env` and `.env.local` from the project root, in addition to shell environment variables. Secrets belong in `.env.local`, which is ignored by git.

## Configuration

Copy `.env.example` to `.env.local` when you want local configuration:

```bash
cp .env.example .env.local
```

Common settings:

```env
BOOKREADER_API_HOST=127.0.0.1
BOOKREADER_API_PORT=1433
BOOKREADER_OUTPUT_DIR=out/bookreader

BOOKREADER_OLLAMA_URL=http://127.0.0.1:11434
BOOKREADER_CONTEXT_MODEL=deepseek-r1:1.5b
BOOKREADER_DEEP_CONTEXT_MODEL=deepseek-r1:7b
BOOKREADER_STORY_MODEL=deepseek-llm:7b-chat
BOOKREADER_DEEP_STORY_MODEL=deepseek-llm:7b-chat

BOOKREADER_COMFY_URL=http://127.0.0.1:8188
```

Optional DeepSeek API key:

```env
BOOKREADER_DEEPSEEK_API_KEY=sk-...
BOOKREADER_DEEPSEEK_API_BASE_URL=https://api.deepseek.com
BOOKREADER_DEEPSEEK_API_CONTEXT_MODEL=deepseek-v4-flash
BOOKREADER_DEEPSEEK_API_STORY_MODEL=deepseek-v4-flash
```

You can also paste the key in the app under `Serverlaag -> DeepSeek API key`. The frontend only receives whether a key is configured; it never receives the key itself.

## Story Generation

The story panel can create a complete multi-page story from a prompt. It supports:

- page count and words-per-page controls;
- `Auto` language detection, so an English prompt produces an English story unless overridden;
- local Ollama models or the DeepSeek API;
- a reference document for character history and continuity;
- concrete chapter titles such as `Page 1 - The Door Under the Bridge`;
- quality checks for unfinished output, excessive repetition and formulaic contrast phrasing.

Reference files are read separately from the active book. They are used as a compact story bible for names, relationships, backstory and recurring motifs.

## Illustrations

ComfyUI generation works when `BOOKREADER_COMFY_URL` points to a running ComfyUI server and `BOOKREADER_COMFY_WORKFLOW` points to an API workflow JSON. The default workflow lives at:

```text
server/comfy/bookreader-workflow-api.json
```

Generated chapter images, portraits and covers are copied into:

```text
out/bookreader/images/
```

They are served back through:

```text
/api/media/images/...
```

The UI shows the last saved image path in the illustration panel.

## Piper Voices

Install the default Piper voices with:

```bash
scripts/install_piper_voices.sh
```

The script creates `.venv_piper/` and downloads Dutch `ronnie`/`alex` plus English `lessac` voice models into `out/bookreader/voices/`.

## BookReader Projects

Use `Opslaan` to download a `.bookreader.json` project. The project file includes:

- raw story text;
- chapter illustration prompts;
- generated chapter images where available;
- character portraits;
- book cover data;
- context analysis metadata.

Opening the same file restores the project in the app.

## Mobile And VPS Notes

The PWA/mobile build can later be served from a VPS by hosting `dist/` over HTTPS and running the API behind the same origin, or by setting:

```env
VITE_BOOKREADER_API_BASE=https://your-api-origin.example
```

For a public deployment, set a strict CORS origin:

```env
BOOKREADER_CORS_ORIGIN=https://your-bookreader-origin.example
```

## Safety

- Do not commit `.env`, `.env.local`, API keys or generated runtime data.
- `node_modules/`, `.venv_piper/`, `dist/`, `out/` and `src-tauri/target/` are ignored.
- DeepSeek API keys are stored server-side only.
- Generated images and audio are runtime artifacts, not source files.
