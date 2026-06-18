# BookReader

BookReader is een local-first leesdesk, verhalenmachine en kleine illustratiestudio. De app leest lange teksten en projectbestanden, verdeelt ze in hoofdstukken, leest ze voor, maakt nieuwe verhalen, bewaart een SQL-bibliotheek en kan beelden, covers, portretten en filmplannen maken via lokale of API-modellen.

De huidige architectuur bestaat uit:

- een Vite/React frontend op `http://127.0.0.1:1432`;
- een kleine Node companion API op `http://127.0.0.1:1433`;
- lokale runtime-opslag onder `out/bookreader/`;
- een SQLite-bibliotheek via `scripts/bookreader_sqlite.py`;
- optionele AI-bronnen: lokale Ollama, DeepSeek API en Grok/xAI API;
- optionele beeldbronnen: lokale ComfyUI of Grok Imagine.

## Wat De App Nu Doet

- Importeert `TXT`, `MD`, `DOCX`, `PDF` en `.bookreader.json`.
- Verdeelt documenten tot 500.000 woorden in hoofdstukken.
- Kan bestaande tekst lokaal verdelen of met AI opnieuw in nette hoofdstukken zetten.
- Leest hoofdstukken voor met browserstemmen of server-side Piper.
- Maakt verhalen vanuit een begeleide promptbuilder of een handmatig aangepaste prompt.
- Ondersteunt lokale Ollama, DeepSeek API en Grok API voor verhalen, contextanalyse, hoofdstukken en filmplannen.
- Maakt vervolgen op een gekozen SQL-verhaal of op het huidige verhaal.
- Gebruikt losse referentiebestanden en aangevinkte SQL-verhalen als verhaalbijbel.
- Bewaart verhalen in een SQLite-bibliotheek met categorieën, slepen-naar-categorie en verwijderfunctie.
- Importeert oudere `.bookreader.json` projecten naar SQL.
- Downloadt nog steeds complete `.bookreader.json` projectbestanden als draagbare backup.
- Maakt hoofdstukillustraties, boekcovers en karakterportretten met ComfyUI of Grok Imagine.
- Maakt filmplannen met scènes, continuïteitsbijbel, videoprompts en audioprompts.
- Slaat tekst, promptmetadata, contextanalyse, filmplan en beeldmetadata op in projecten.

## Quick Start

```bash
npm install
npm run api
npm run dev
```

Open daarna de Vite URL, meestal:

```text
http://127.0.0.1:1432
```

Voor de desktopapp:

```bash
npm run tauri -- dev
```

## Desktop Launcher

`scripts/bookreader-launch.sh` start of ververst de API en opent daarna de Tauri-app. De launcher controleert onder meer `/api/projects/list`, `/api/library/list`, `/api/library/categories` en `/api/models`.

Een Linux `.desktop` entry kan wijzen naar:

```text
Exec=/home/pwintri2/BookReader/scripts/bookreader-launch.sh
Icon=/home/pwintri2/BookReader/public/icons/bookreader.svg
```

API-logs komen hier terecht:

```text
~/.local/state/bookreader/api.log
```

## Configuratie

De server leest `.env`, `.env.local` en shell-omgeving. Zet echte API keys in `.env.local`; die hoort niet in git. De frontend krijgt alleen te zien of een key geconfigureerd is, niet de key zelf.

Belangrijke instellingen:

```env
BOOKREADER_API_HOST=127.0.0.1
BOOKREADER_API_PORT=1433
BOOKREADER_OUTPUT_DIR=out/bookreader
BOOKREADER_PROJECTS_DIR=out/bookreader/projects
BOOKREADER_SQLITE_DB=out/bookreader/bookreader.sqlite
BOOKREADER_PYTHON_BIN=python3

BOOKREADER_OLLAMA_URL=http://127.0.0.1:11434
BOOKREADER_CONTEXT_MODEL=deepseek-r1:1.5b
BOOKREADER_DEEP_CONTEXT_MODEL=deepseek-r1:7b
BOOKREADER_STORY_MODEL=deepseek-llm:7b-chat
BOOKREADER_DEEP_STORY_MODEL=deepseek-llm:7b-chat

BOOKREADER_DEEPSEEK_API_KEY=sk-...
BOOKREADER_DEEPSEEK_API_BASE_URL=https://api.deepseek.com
BOOKREADER_DEEPSEEK_API_CONTEXT_MODEL=deepseek-v4-flash
BOOKREADER_DEEPSEEK_API_STORY_MODEL=deepseek-v4-flash
BOOKREADER_DEEPSEEK_API_FILM_MODEL=deepseek-v4-flash

BOOKREADER_XAI_API_KEY=xai-...
BOOKREADER_XAI_API_BASE_URL=https://api.x.ai
BOOKREADER_XAI_API_CONTEXT_MODEL=grok-4.3
BOOKREADER_XAI_API_STORY_MODEL=grok-4.3
BOOKREADER_XAI_API_FILM_MODEL=grok-4.3
BOOKREADER_XAI_API_IMAGE_MODEL=grok-imagine-image-quality

BOOKREADER_COMFY_URL=http://127.0.0.1:8188
BOOKREADER_COMFY_WORKFLOW=server/comfy/bookreader-workflow-api.json
BOOKREADER_PROJECT_SCAN_DIRS=/some/folder:/another/folder
BOOKREADER_CORS_ORIGIN=*
```

DeepSeek- en Grok-keys kunnen ook in de app worden geplakt onder `Serverlaag`. De server schrijft ze dan naar `.env.local` via de instellingenroutes. Gebruik nooit `VITE_*` variabelen voor secrets.

`GET /api/models` haalt lokale Ollama-modellen op via `/api/tags`, DeepSeek-modellen via de DeepSeek API en Grok-modellen via xAI. Als een API-key ontbreekt of een modellenlijst faalt, toont de app fallbackmodellen uit de serverconfig.

## SQL-Bibliotheek

BookReader gebruikt SQLite als primaire verhalenbibliotheek. De database staat standaard op:

```text
out/bookreader/bookreader.sqlite
```

De Node API praat met SQLite via:

```text
scripts/bookreader_sqlite.py
```

Die adapter gebruikt alleen de standaard `sqlite3` module van Python. Hij beheert:

- `projects`: volledige genormaliseerde BookReader-projecten plus samenvatting;
- `categories`: namen van categorieën;
- `project_categories`: koppelingen tussen verhalen en categorieën.

In de UI betekent dat:

- `Scan SQL` laadt de SQL-bibliotheek;
- `JSON naar SQL` importeert `.bookreader.json` bestanden uit de scanmappen;
- `Categorie` filtert de SQL-lijst;
- `Nieuwe categorie` maakt een categorie;
- een SQL-verhaal kan naar een categorie worden gesleept;
- `Plaats huidig in` bewaart of koppelt het huidige verhaal aan een categorie;
- het prullenbak-icoon verwijdert alleen het SQL-record, niet het JSON-bestand op schijf.

De oude lagen blijven bestaan:

- de browser bewaart een kleine recente-verhalenlijst in `localStorage`;
- `Scan JSON` toont losse `.bookreader.json` bestanden;
- `Opslaan` downloadt altijd een draagbaar `.bookreader.json` project en probeert daarnaast SQL bij te werken.

## Verhaal Maken En Promptflow

De knop `Prompt maken` opent een begeleide promptbuilder met drie vragen:

1. `What are the characters? (name / age / gender)`
2. `What is the plot?`
3. `What is the main event to be focused on?`

BookReader maakt daarvan een bewerkbare prompt met deze vaste structuur:

```text
Write a complete, emotionally coherent personal story based on this brief.
Characters (name / age / gender): ...
Plot: ...
Main event to focus on: ...
Keep the characters consistent, make the scenes concrete, and build the story around the main event without rushing past it.
```

De gegenereerde prompt is bewust nog editbaar. `Save prompt` bewaart hem bij het project als `storyPrompt` met `characters`, `plot`, `mainEvent`, `prompt` en `updatedAt`.

Bij `Maak verhaal` stuurt de app deze prompt naar `/api/story/generate`. De server wikkelt hem daarna in `buildStoryGenerationPrompt(...)`. Die serverprompt regelt:

- uitvoertaal: `Auto`, Nederlands, English, Deutsch, Français of Español;
- Markdown-uitvoer met `# <titel>` en paginamarkers zoals `## Pagina 1 - <specifieke titel>`;
- pagina-aantal, woorden per pagina, genre, toon en doelgroep;
- de preset `Veel details + lange intro`;
- referentiebestanden en aangevinkte SQL-verhalen als compacte verhaalbijbel;
- sequel-context als er een vervolgbron is gekozen;
- regels voor consistentie, concrete scènes, einde/resolutie, voorleesbaarheid en veilige karakterbeschrijving;
- verbod op analyse, JSON, code fences, modelnotities en verborgen redenering.

Na generatie controleert de server de output op onder meer ontbrekende paginamarkers, te weinig woorden, onaf einde, onleesbaar pseudo-Nederlands, te veel herhaling, cijferbrij, ongepaste lichaamsbeschrijving bij jonge personages en te veel formulezinnen.

## Vervolg Maken

Een vervolg wordt gemaakt vanuit de sectie `Verhaal maken`.

Mogelijkheden:

- kies een SQL-verhaal in de dropdown `Vervolg op`;
- klik op het pijl-icoon bij een verhaal in de SQL-lijst;
- klik `Vervolg huidig` om het huidige geopende verhaal als bron te gebruiken;
- klik `Wis vervolg` om de sequel-context te verwijderen.

Bij generatie stuurt de frontend `sequelOfTitle` en `sequelOfText` mee. De server maakt daar een aparte sequel-guide van. De prompt zegt expliciet dat het nieuwe verhaal een vervolg moet zijn: het moet namen, relaties, setting, losse eindjes, emotionele toestand en eindcondities bewaren, maar het oude verhaal niet opnieuw vertellen.

Als het vervolg uit een SQL-verhaal komt, probeert BookReader de categorieën van de bron mee te geven aan het nieuwe verhaal. Anders gebruikt hij de geselecteerde categorie.

## Referenties

Naast vervolgbronnen zijn er algemene referenties:

- upload een `TXT`, `MD`, `DOCX` of `PDF` via `Referentie`;
- klik `Bewaar ref` om die referentie als SQL-project onder categorie `Referenties` op te slaan;
- vink `Ref` aan bij SQL-verhalen om ze als database-referentie mee te geven;
- `Wis refs` verwijdert alleen de selectie.

De server vat referenties samen tot een compacte guide met titel, taal/context, korte samenvatting, bevestigde personages, relaties, historische cues en terugkerende motieven. De originele referentietekst wordt begrensd meegestuurd als context, met de instructie om geen passages letterlijk te kopiëren tenzij de gebruiker dat expliciet vraagt.

## AI-Bronnen

De app heeft een centrale `AI-bron` selector:

- `Lokale Ollama`;
- `DeepSeek API`;
- `Grok API`.

Deze keuze geldt voor verhalen maken, AI-hoofdstukken, contextanalyse en filmplannen. Per bron kan een model worden gekozen uit de modelcatalogus. `Werkstand` bepaalt of de snelle of diepe timeouts/modellen worden gebruikt.

Grok gebruikt xAI's chat endpoint:

```text
/v1/chat/completions
```

DeepSeek gebruikt:

```text
/chat/completions
```

Lokale Ollama gebruikt:

```text
/api/generate
```

## Hoofdstukken

`Verdeel` gebruikt de lokale hoofdstuksplitter in de frontend.

`AI hoofdstukken` gebruikt `/api/story/rechapter`. Die route bewaart de oorspronkelijke inhoud en volgorde, maar vraagt het gekozen model om duidelijke hoofdstukkoppen te maken. De prompt verbiedt samenvatten, nieuwe scènes, nieuwe personages of stijlrewrites.

## Context, Illustraties En Covers

De illustratiesectie werkt in twee lagen:

- `Snelle context` en `Diepe context` analyseren het verhaal met de gekozen AI-bron en vullen scene brief, coverprompt en karakterprompts aan.
- `Maak illustratie`, `Maak cover` en `Maak portret` sturen prompts naar de gekozen beeldmaker.

Beeldmakers:

- `ComfyUI lokaal`: gebruikt `BOOKREADER_COMFY_WORKFLOW`, injecteert prompts in `CLIPTextEncode` nodes en pollt ComfyUI `/history/{prompt_id}`;
- `Grok Imagine`: gebruikt `BOOKREADER_XAI_API_IMAGE_MODEL` en xAI `/v1/images/generations`.

Gegenereerde beelden worden lokaal opgeslagen onder:

```text
out/bookreader/images/
```

En geserveerd via:

```text
/api/media/images/...
```

## Filmstudio

`Maak filmplan` gebruikt het huidige verhaal en de gekozen AI-bron. De UI ondersteunt 5, 7 of 10 minuten en 8 tot 24 scènes. Het resultaat bevat:

- titel en logline;
- totale duur;
- continuïteitsbijbel met personages, locaties, visuele regels en audioregels;
- scènes met duur, doel, locatie, actie, dialoog, voice-over, camera, transitie;
- visuele videoprompt en audioprompt per scène;
- knop om videoprompts te kopiëren.

Het filmplan wordt opgeslagen in het BookReader-project als `filmPlan`.

## Piper Stemmen

Installeer de standaard Piper-stemmen met:

```bash
scripts/install_piper_voices.sh
```

Het script maakt `.venv_piper/` en downloadt Nederlandse `ronnie`/`alex` en Engelse `lessac` stemmodellen naar:

```text
out/bookreader/voices/
```

Server-TTS geeft een eerlijke `503` terug als Piper of de stemmodellen ontbreken.

## Projectbestanden

Een `.bookreader.json` project bevat, waar beschikbaar:

- `rawText`;
- `storyPrompt`;
- `chapterIllustrations`;
- `characterPortraits`;
- `bookCover`;
- `contextAnalysis`;
- `filmPlan`;
- `illustrationStyleId`;
- datum, titel en schema.

Het schema is:

```text
bookreader.project.v1
```

Openen van hetzelfde bestand herstelt tekst, prompt, beelden, cover, portretten, context en filmplan in de app.

## API-Routes

Belangrijkste companion API-routes:

```text
GET    /api/health
GET    /api/models
GET    /api/projects/list
GET    /api/projects/open/:id
GET    /api/library/list
GET    /api/library/open/:id
POST   /api/library/save
DELETE /api/library/delete/:id
POST   /api/library/import-json
GET    /api/library/categories
POST   /api/library/categories
POST   /api/library/categories/assign
POST   /api/story/generate
POST   /api/story/rechapter
POST   /api/context/analyze
POST   /api/film/plan
POST   /api/illustrations/generate
GET    /api/illustrations/status/:promptId
POST   /api/tts/synthesize
POST   /api/settings/deepseek-key
POST   /api/settings/xai-key
POST   /api/media/cache-image
GET    /api/media/images/:file
GET    /api/media/audio/:file
GET    /api/comfy/view
```

## Useful Commands

```bash
npm test
npm run build
npm run api
npm run dev
npm run dev:mobile
npm run tauri -- dev
npm run tauri -- build
cargo check --manifest-path src-tauri/Cargo.toml
scripts/install_piper_voices.sh
```

SQLite handmatig inspecteren via de adapter:

```bash
python3 scripts/bookreader_sqlite.py list --db out/bookreader/bookreader.sqlite --json
python3 scripts/bookreader_sqlite.py categories --db out/bookreader/bookreader.sqlite --json
python3 scripts/bookreader_sqlite.py import --db out/bookreader/bookreader.sqlite --path out/bookreader/projects --json
```

## Mobile En VPS

Voor lokale telefoon-tests:

```bash
npm run dev:mobile
npm run api
```

Voor VPS/public deployment:

- bouw de frontend met `npm run build`;
- serveer `dist/` over HTTPS;
- draai de companion API achter dezelfde origin of bouw met `VITE_BOOKREADER_API_BASE=https://your-api-origin.example`;
- zet `BOOKREADER_CORS_ORIGIN` op de exacte publieke BookReader-origin;
- zet secrets alleen server-side.

## Veiligheid

- Commit geen `.env`, `.env.local`, API keys of runtime-output.
- Gebruik `BOOKREADER_DEEPSEEK_API_KEY` en `BOOKREADER_XAI_API_KEY` alleen server-side.
- `node_modules/`, `.venv_piper/`, `dist/`, `out/` en `src-tauri/target/` zijn runtime/build-output.
- SQLite, audio, beelden en gegenereerde projecten zijn inspecteerbare runtime-artifacts.
- Verhaal- en beeldgeneratie blijven expliciete gebruikersacties; de app voert geen verborgen externe acties uit.
