# BookReader API

De companion API draait naast de Vite/Tauri frontend en regelt alles wat niet puur in de browser hoort: SQLite-opslag, Piper TTS, modelcatalogi, AI-generatie, ComfyUI/Grok-beeldgeneratie en lokale media.

```bash
npm run api
```

Standaard luistert de API op:

```text
http://127.0.0.1:1433
```

## Opslag En SQLite

Runtime-output staat standaard onder:

```text
out/bookreader/
```

Belangrijke paden:

```text
out/bookreader/bookreader.sqlite
out/bookreader/audio/
out/bookreader/images/
out/bookreader/projects/
out/bookreader/voices/
```

SQLite loopt via `scripts/bookreader_sqlite.py`, zodat er geen native Node SQLite dependency nodig is. De API gebruikt deze routes:

```text
GET    /api/library/list
GET    /api/library/open/:id
POST   /api/library/save
DELETE /api/library/delete/:id
POST   /api/library/import-json
GET    /api/library/categories
POST   /api/library/categories
POST   /api/library/categories/assign
```

`/api/projects/list` en `/api/projects/open/:id` blijven bestaan voor losse `.bookreader.json` projectbestanden. `/api/library/import-json` importeert die bestanden naar SQLite.

## AI En Modellen

De API ondersteunt drie tekstbronnen:

- lokale Ollama via `BOOKREADER_OLLAMA_URL`;
- DeepSeek API via `BOOKREADER_DEEPSEEK_API_KEY`;
- Grok/xAI API via `BOOKREADER_XAI_API_KEY`.

`GET /api/models` haalt modelopties op bij Ollama, DeepSeek en xAI. Als een API-key ontbreekt of de remote lijst faalt, geeft de API fallbackmodellen terug uit de serverconfig.

Belangrijke routes:

```text
POST /api/story/generate
POST /api/story/rechapter
POST /api/context/analyze
POST /api/film/plan
```

Grok gebruikt xAI `/v1/chat/completions`; DeepSeek gebruikt `/chat/completions`; Ollama gebruikt `/api/generate`.

## Verhaalprompt

De frontend bewaart de gebruikersprompt als `storyPrompt`. De server voegt daar de echte schrijfinstructies aan toe in `buildStoryGenerationPrompt(...)`:

- Markdown H1 titel plus specifieke paginakoppen;
- taal, pagina's, woorden per pagina, genre, toon en doelgroep;
- optionele `Veel details + lange intro` regels;
- compacte referentie-verhaalbijbel;
- optionele sequel-context uit `sequelOfTitle` en `sequelOfText`;
- kwaliteits- en veiligheidsregels;
- geen analyse, JSON, code fences of verborgen redenering in de output.

Na generatie valideert de API onder meer paginamarkers, woordenaantal, volledig einde, herhaling, pseudo-taal en ongepaste beschrijvingen.

## Vervolg En Referenties

Voor een vervolg stuurt de frontend:

```json
{
  "sequelOfTitle": "...",
  "sequelOfText": "..."
}
```

De server bouwt hieruit een sequel-guide. De prompt vraagt het model om het geselecteerde verhaal voort te zetten zonder het oude verhaal opnieuw te vertellen.

Referenties komen binnen als `referenceTitle` en `referenceText`. De API maakt daar een compacte guide van met samenvatting, bevestigde personages, relaties, geschiedenis en motieven.

## TTS

Installeer Piper en de standaard BookReader-stemmen:

```bash
scripts/install_piper_voices.sh
```

Dit maakt `.venv_piper/` en downloadt stemmodellen naar `out/bookreader/voices/`. Server-TTS detecteert die paden automatisch. Overschrijven kan zo:

```bash
BOOKREADER_PIPER_BIN=/usr/local/bin/piper \
BOOKREADER_PIPER_VOICES_DIR=/opt/bookreader/voices \
BOOKREADER_PIPER_MODEL=nl_NL-ronnie-medium \
npm run api
```

De API geeft een eerlijke `503` terug wanneer Piper of stemmodellen ontbreken.

## Beeldgeneratie

BookReader heeft twee beeldproviders.

ComfyUI:

```bash
BOOKREADER_COMFY_URL=http://127.0.0.1:8188 \
BOOKREADER_COMFY_WORKFLOW=/opt/bookreader/comfy/bookreader-workflow-api.json \
npm run api
```

De bridge injecteert de prompt in `CLIPTextEncode` nodes, vult seedvelden, queue't via `/prompt`, pollt `/history/{prompt_id}` en proxyt `/view` beelden terug.

Grok Imagine:

```bash
BOOKREADER_XAI_API_KEY=xai-... \
BOOKREADER_XAI_API_IMAGE_MODEL=grok-imagine-image-quality \
npm run api
```

De API stuurt beeldprompts naar xAI `/v1/images/generations`, slaat het resultaat lokaal op in `out/bookreader/images/` en geeft een `/api/media/images/...` URL terug.

## Keys En Settings

De settingsroutes schrijven server-side naar `.env.local`:

```text
POST /api/settings/deepseek-key
POST /api/settings/xai-key
```

De frontend krijgt alleen `configured: true/false` terug via `/api/health`. Zet API keys nooit in `VITE_*` variabelen.

## Mobile/VPS

Voor lokale telefoon-tests:

```bash
npm run dev:mobile
npm run api
```

Voor VPS deployment: bouw de frontend met `npm run build`, serveer `dist/` over HTTPS en draai de API achter dezelfde origin, of bouw met:

```bash
VITE_BOOKREADER_API_BASE=https://your-api-origin.example npm run build
```

Zet bij publieke deployment `BOOKREADER_CORS_ORIGIN` op de exacte frontend-origin.
