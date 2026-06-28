# BookReader

![BookReader reading desk with a digital book, local library, and illustration panels](docs/assets/bookreader-readme-hero.png)

BookReader is a local-first reading desk, story machine and tiny illustration studio in one app.

Drop in a long text, DOCX, PDF or saved BookReader project, and it turns the material into readable chapters. From there you can read aloud, generate new stories, keep a local shelf of saved projects, reuse reference documents as story continuity, and create illustrations through a local ComfyUI workflow.

It is built for the good kind of quiet: your text stays local by default, generated files live in inspectable folders, and optional AI services are wired through a small companion API you control.

## What It Does

- Imports `TXT`, `MD`, `DOCX`, `PDF` and `.bookreader.json` project files.
- Splits documents up to 500,000 words into navigable chapters.
- Reads chapters aloud with browser voices or server-side Piper voices.
- Generates multi-page stories from prompts in `Auto`, Dutch, English, German, French or Spanish.
- Supports a **Veel details + lange intro** preset for slower openings with richer sensory detail.
- Accepts separate reference files, including DOCX, so characters, history and continuity can carry into new stories.
- Shows saved stories at a glance in the **Verhalen** panel.
- Scans existing `.bookreader.json` files from local project and Downloads folders.
- Generates chapter illustrations, character portraits and book covers with ComfyUI.
- Saves complete BookReader projects with text, prompts and embedded generated images.

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

The repository includes `scripts/bookreader-launch.sh` for local desktop use. It starts or refreshes the BookReader API when needed and then opens the Tauri app.

A Linux `.desktop` entry can point to:

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
npm run tauri -- build
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
BOOKREADER_PROJECT_SCAN_DIRS=/some/folder:/another/folder
```

Optional DeepSeek API key:

```env
BOOKREADER_DEEPSEEK_API_KEY=sk-...
BOOKREADER_DEEPSEEK_API_BASE_URL=https://api.deepseek.com
BOOKREADER_DEEPSEEK_API_CONTEXT_MODEL=deepseek-v4-flash
BOOKREADER_DEEPSEEK_API_STORY_MODEL=deepseek-v4-flash
```

You can also paste the key in the app under `Serverlaag -> DeepSeek API key`. The frontend only receives whether a key is configured; it never receives the key itself.

Model selection is available in the app. The API exposes `GET /api/models`, which reads local Ollama models from `BOOKREADER_OLLAMA_URL /api/tags` and offers DeepSeek API choices. The environment variables above remain the defaults; the selected model from the UI can override them for story generation, context analysis and film planning. DeepSeek falls back to the currently documented API model names `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-chat` and `deepseek-reasoner`, and tries the live DeepSeek `/models` endpoint when a key is configured.

## Story Generation

The story panel can create a complete multi-page story from a prompt. It supports:

- page count and words-per-page controls;
- automatic language detection;
- local Ollama models or the DeepSeek API;
- a DOCX/TXT/MD/PDF reference document for character history and continuity;
- concrete chapter titles such as `Page 1 - The Door Under the Bridge`;
- quality checks for unfinished output, excessive repetition and formulaic contrast phrasing.

Reference files are read separately from the active book. They are used as a compact story bible for names, relationships, backstory and recurring motifs.

## Saved Stories

Use `Opslaan` to download a `.bookreader.json` project and add it to the local story shelf.

The **Verhalen** panel shows saved stories with title, date, word count, chapter count and preview. `Scan JSON` looks for existing BookReader project files in:

```text
out/bookreader/projects
out/bookreader
~/Downloads
```

Set `BOOKREADER_PROJECT_SCAN_DIRS` to add more scan roots.

## Illustrations

ComfyUI generation works when `BOOKREADER_COMFY_URL` points to a running ComfyUI server and `BOOKREADER_COMFY_WORKFLOW` points to an API workflow JSON.

The default workflow lives at:

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

## Piper Voices

Install the default Piper voices with:

```bash
scripts/install_piper_voices.sh
```

The script creates `.venv_piper/` and downloads Dutch `ronnie`/`alex` plus English `lessac` voice models into `out/bookreader/voices/`.

## Project Files

A `.bookreader.json` project can include:

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
