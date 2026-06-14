import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { URL } from "node:url";

const PROJECT_ROOT = resolve(new URL("..", import.meta.url).pathname);
loadProjectEnv(PROJECT_ROOT);

const HOST = process.env.BOOKREADER_API_HOST || "127.0.0.1";
const PORT = Number(process.env.BOOKREADER_API_PORT || 1433);
const OUTPUT_DIR = resolve(process.env.BOOKREADER_OUTPUT_DIR || join(PROJECT_ROOT, "out/bookreader"));
const AUDIO_DIR = join(OUTPUT_DIR, "audio");
const IMAGES_DIR = join(OUTPUT_DIR, "images");
const VOICES_DIR = resolve(process.env.BOOKREADER_PIPER_VOICES_DIR || join(OUTPUT_DIR, "voices"));
const PIPER_BIN = process.env.BOOKREADER_PIPER_BIN || autoPiperBinary();
const PIPER_MODEL = process.env.BOOKREADER_PIPER_MODEL || "";
const MAX_TTS_CHARS = Number(process.env.BOOKREADER_TTS_MAX_CHARS || 24000);
const COMFY_URL = normalizeBaseUrl(process.env.BOOKREADER_COMFY_URL || "http://127.0.0.1:8188");
const COMFY_WORKFLOW = process.env.BOOKREADER_COMFY_WORKFLOW || join(PROJECT_ROOT, "server/comfy/bookreader-workflow-api.json");
const OLLAMA_URL = normalizeBaseUrl(process.env.BOOKREADER_OLLAMA_URL || "http://127.0.0.1:11434");
const CONTEXT_MODEL = process.env.BOOKREADER_CONTEXT_MODEL || "deepseek-r1:1.5b";
const DEEP_CONTEXT_MODEL = process.env.BOOKREADER_DEEP_CONTEXT_MODEL || "deepseek-r1:7b";
const STORY_MODEL = process.env.BOOKREADER_STORY_MODEL || "deepseek-llm:7b-chat";
const DEEP_STORY_MODEL = process.env.BOOKREADER_DEEP_STORY_MODEL || STORY_MODEL;
let DEEPSEEK_API_KEY = process.env.BOOKREADER_DEEPSEEK_API_KEY || "";
const DEEPSEEK_API_BASE_URL = normalizeBaseUrl(process.env.BOOKREADER_DEEPSEEK_API_BASE_URL || "https://api.deepseek.com");
const DEEPSEEK_API_CONTEXT_MODEL = process.env.BOOKREADER_DEEPSEEK_API_CONTEXT_MODEL || "deepseek-v4-flash";
const DEEPSEEK_API_STORY_MODEL = process.env.BOOKREADER_DEEPSEEK_API_STORY_MODEL || "deepseek-v4-flash";
const MAX_CONTEXT_CHARS = Number(process.env.BOOKREADER_CONTEXT_MAX_CHARS || 18000);
const REFERENCE_MAX_CHARS = Number(process.env.BOOKREADER_REFERENCE_MAX_CHARS || 60000);
const CONTEXT_TIMEOUT_MS = Number(process.env.BOOKREADER_CONTEXT_TIMEOUT_MS || 35000);
const DEEP_CONTEXT_TIMEOUT_MS = Number(process.env.BOOKREADER_DEEP_CONTEXT_TIMEOUT_MS || 120000);
const STORY_TIMEOUT_MS = Number(process.env.BOOKREADER_STORY_TIMEOUT_MS || 180000);
const DEEP_STORY_TIMEOUT_MS = Number(process.env.BOOKREADER_DEEP_STORY_TIMEOUT_MS || 360000);

const NAME_FALSE_POSITIVES = new Set([
  "a",
  "aan",
  "afbeelding",
  "als",
  "and",
  "api",
  "app",
  "because",
  "bij",
  "bookreader",
  "browser",
  "but",
  "button",
  "chapter",
  "chapterprompt",
  "character",
  "characters",
  "click",
  "clicked",
  "close",
  "comfy",
  "comfyui",
  "context",
  "cover",
  "coverprompt",
  "daar",
  "dan",
  "dat",
  "de",
  "deel",
  "deepseek",
  "deze",
  "die",
  "diep",
  "dit",
  "document",
  "door",
  "dropdown",
  "een",
  "en",
  "fast",
  "field",
  "geen",
  "generate",
  "generated",
  "gemaakt",
  "haar",
  "he",
  "hem",
  "hen",
  "her",
  "here",
  "het",
  "hij",
  "hier",
  "his",
  "hoofdstuk",
  "hun",
  "i",
  "illustratie",
  "illustration",
  "image",
  "in",
  "into",
  "it",
  "its",
  "je",
  "json",
  "jij",
  "karakter",
  "karakters",
  "klik",
  "knop",
  "komt",
  "laad",
  "lees",
  "load",
  "local",
  "lokaal",
  "maak",
  "maken",
  "maar",
  "me",
  "menu",
  "met",
  "model",
  "my",
  "naar",
  "new",
  "next",
  "niet",
  "nieuw",
  "no",
  "nobody",
  "none",
  "not",
  "of",
  "omdat",
  "on",
  "onder",
  "onbekend",
  "open",
  "op",
  "our",
  "page",
  "pagina",
  "part",
  "pause",
  "piper",
  "play",
  "portrait",
  "portraitprompt",
  "portret",
  "previous",
  "prompt",
  "read",
  "regel",
  "regels",
  "save",
  "scene",
  "search",
  "section",
  "select",
  "selecteer",
  "server",
  "she",
  "slow",
  "sluit",
  "snel",
  "samen",
  "start",
  "status",
  "stem",
  "stop",
  "story",
  "tauri",
  "tekst",
  "text",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "title",
  "titel",
  "toen",
  "untitled",
  "unknown",
  "url",
  "us",
  "van",
  "veld",
  "voice",
  "voor",
  "vorige",
  "we",
  "wel",
  "where",
  "when",
  "wij",
  "yes",
  "you",
  "ze",
  "zij",
  "zoek",
]);

for (const token of [
  "bag",
  "boek",
  "book",
  "bos",
  "bridge",
  "brief",
  "brug",
  "castle",
  "city",
  "clock",
  "coat",
  "compass",
  "deur",
  "dress",
  "forest",
  "gate",
  "garden",
  "house",
  "jas",
  "kamer",
  "kaart",
  "kasteel",
  "key",
  "klok",
  "kompas",
  "lamp",
  "letter",
  "maan",
  "moon",
  "poort",
  "river",
  "rivier",
  "room",
  "schip",
  "school",
  "ship",
  "sleutel",
  "spiegel",
  "stad",
  "station",
  "street",
  "straat",
  "tas",
  "tuin",
  "veld",
  "window",
  "zwaard",
]) {
  NAME_FALSE_POSITIVES.add(token);
}

mkdirSync(AUDIO_DIR, { recursive: true });
mkdirSync(IMAGES_DIR, { recursive: true });
mkdirSync(VOICES_DIR, { recursive: true });

const server = createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      await sendJson(res, 200, healthPayload());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/synthesize") {
      await handleTts(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/illustrations/generate") {
      await handleIllustrationGenerate(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/context/analyze") {
      await handleContextAnalyze(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/story/generate") {
      await handleStoryGenerate(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings/deepseek-key") {
      await handleDeepSeekKeySave(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/media/cache-image") {
      await handleCacheImage(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/media/images/")) {
      await handleCachedImage(url, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/illustrations/status/")) {
      await handleIllustrationStatus(url, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/comfy/view") {
      await handleComfyView(url, res);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/media/audio/")) {
      await handleAudio(url, res);
      return;
    }

    await sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    await sendJson(res, 500, {
      ok: false,
      error: "server_error",
      message: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BookReader API listening on http://${HOST}:${PORT}`);
});

function healthPayload() {
  const voices = availablePiperVoices();
  const activeModel = selectPiperVoice(PIPER_MODEL || "nl_NL-ronnie-medium", voices)?.path || "";
  return {
    ok: true,
    tts: {
      provider: "piper",
      configured: Boolean(PIPER_BIN && existsSync(PIPER_BIN) && activeModel && existsSync(activeModel)),
      maxChars: MAX_TTS_CHARS,
      binary: PIPER_BIN,
      voicesDir: VOICES_DIR,
      activeModel,
      voices,
    },
    comfy: {
      url: COMFY_URL,
      workflowConfigured: Boolean(COMFY_WORKFLOW && existsSync(COMFY_WORKFLOW)),
    },
    context: {
      provider: "ollama",
      url: OLLAMA_URL,
      model: CONTEXT_MODEL,
      deepModel: DEEP_CONTEXT_MODEL,
      maxChars: MAX_CONTEXT_CHARS,
      timeoutMs: CONTEXT_TIMEOUT_MS,
      deepTimeoutMs: DEEP_CONTEXT_TIMEOUT_MS,
    },
    story: {
      provider: "ollama",
      model: STORY_MODEL,
      deepModel: DEEP_STORY_MODEL,
      timeoutMs: STORY_TIMEOUT_MS,
      deepTimeoutMs: DEEP_STORY_TIMEOUT_MS,
    },
    deepseekApi: {
      configured: Boolean(DEEPSEEK_API_KEY),
      baseUrl: DEEPSEEK_API_BASE_URL,
      contextModel: DEEPSEEK_API_CONTEXT_MODEL,
      storyModel: DEEPSEEK_API_STORY_MODEL,
    },
    storage: {
      outputDir: OUTPUT_DIR,
      audioFiles: safeAudioCount(),
      imageFiles: safeImageCount(),
    },
  };
}

async function handleContextAnalyze(req, res) {
  const body = await readJson(req);
  const title = String(body.title || "Untitled").slice(0, 220);
  const rawText = String(body.rawText || "");
  const chapterTitle = String(body.chapterTitle || "");
  const chapterText = String(body.chapterText || "");
  const style = String(body.style || "storybook");
  const mode = body.mode === "deep" ? "deep" : "fast";
  const provider = body.provider === "api" ? "api" : "local";
  const localModel = mode === "deep" ? DEEP_CONTEXT_MODEL : CONTEXT_MODEL;
  const model = provider === "api" ? DEEPSEEK_API_CONTEXT_MODEL : localModel;
  const timeoutMs = mode === "deep" ? DEEP_CONTEXT_TIMEOUT_MS : CONTEXT_TIMEOUT_MS;
  const maxContextChars = mode === "deep" ? Math.max(MAX_CONTEXT_CHARS, 36000) : MAX_CONTEXT_CHARS;

  if (!rawText.trim() && !chapterText.trim()) {
    await sendJson(res, 400, { ok: false, error: "empty_text" });
    return;
  }

  const fallbackAnalysis = buildHeuristicContextAnalysis({
    title,
    rawText: rawText.slice(0, maxContextChars),
    chapterTitle,
    chapterText,
    style,
  });
  const prompt = buildContextPrompt({
    title,
    rawText: rawText.slice(0, maxContextChars),
    chapterTitle,
    chapterText: chapterText.slice(0, 22000),
    style,
    fallbackAnalysis,
  });

  if (provider === "api") {
    const apiResult = await runDeepSeekApiChat({
      res,
      model,
      messages: [
        {
          role: "system",
          content: "You are BookReader's story-continuity director. Return only compact valid JSON. Do not include markdown, notes, or hidden reasoning.",
        },
        { role: "user", content: prompt },
      ],
      temperature: mode === "deep" ? 0.08 : 0.12,
      maxTokens: mode === "deep" ? 2600 : 1800,
      responseFormat: { type: "json_object" },
      timeoutMs,
      timeoutError: "context_model_timeout",
      timeoutMessage: `DeepSeek API-contextanalyse duurde langer dan ${timeoutMs} ms. Probeer een korter hoofdstuk of het snelle model.`,
      unreachableError: "context_model_unreachable",
      unreachableMessage: "DeepSeek API kon niet worden bereikt voor contextanalyse.",
      failureError: "context_model_failed",
    });
    if (apiResult.clientClosed) return;
    if (!apiResult.ok) {
      await sendJson(res, apiResult.status, apiResult.payload);
      return;
    }

    const parsed = parseModelJson(apiResult.content);
    if (!parsed) {
      await sendJson(res, 200, {
        ok: true,
        provider: "deepseek-api",
        model,
        mode,
        fallbackUsed: true,
        fallbackReasons: ["context_json_parse_failed"],
        warning: "DeepSeek API gaf geen geldige JSON terug; lokale contextfallback gebruikt.",
        analysis: fallbackAnalysis,
        preview: String(apiResult.content || "").slice(0, 1200),
      });
      return;
    }

    const merged = mergeContextAnalysis(normalizeContextAnalysis(parsed), fallbackAnalysis);
    await sendJson(res, 200, {
      ok: true,
      provider: "deepseek-api",
      model,
      mode,
      fallbackUsed: merged.fallbackUsed,
      fallbackReasons: merged.fallbackReasons,
      analysis: merged.analysis,
    });
    return;
  }

  const available = await isOllamaModelAvailable(model);
  if (!available) {
    await sendJson(res, 503, {
      ok: false,
      error: "context_model_not_available",
      message: `Ollama model ${model} is niet beschikbaar. Run: ollama pull ${model}`,
      model,
    });
    return;
  }

  let response;
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(new Error("context_timeout")), timeoutMs);
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort(new Error("client_closed"));
  });
  try {
    response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
        options: {
          temperature: mode === "deep" ? 0.1 : 0.15,
          num_ctx: mode === "deep" ? 8192 : 4096,
          num_predict: mode === "deep" ? 1600 : 1200,
        },
        keep_alive: "10m",
      }),
      signal: abortController.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "client_closed") return;
    const timedOut = message === "context_timeout" || (error instanceof Error && error.name === "TimeoutError");
    await sendJson(res, timedOut ? 504 : 502, {
      ok: false,
      error: timedOut ? "context_model_timeout" : "context_model_unreachable",
      message: timedOut
        ? `DeepSeek-contextanalyse duurde langer dan ${timeoutMs} ms. Probeer een korter hoofdstuk of het snelle model.`
        : "Ollama kon niet worden bereikt voor DeepSeek-contextanalyse.",
      model,
    });
    return;
  } finally {
    clearTimeout(timeoutHandle);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await sendJson(res, response.status, { ok: false, error: "context_model_failed", details: payload });
    return;
  }

  const parsed = parseModelJson(String(payload.response || ""));
  if (!parsed) {
    await sendJson(res, 200, {
      ok: true,
      provider: "ollama",
      model,
      mode,
      fallbackUsed: true,
      fallbackReasons: ["context_json_parse_failed"],
      warning: "DeepSeek gaf geen geldige JSON terug; lokale contextfallback gebruikt.",
      analysis: fallbackAnalysis,
      preview: String(payload.response || "").slice(0, 1200),
    });
    return;
  }

  const merged = mergeContextAnalysis(normalizeContextAnalysis(parsed), fallbackAnalysis);
  await sendJson(res, 200, {
    ok: true,
    provider: "ollama",
    model,
    mode,
    fallbackUsed: merged.fallbackUsed,
    fallbackReasons: merged.fallbackReasons,
    analysis: merged.analysis,
  });
}

async function handleStoryGenerate(req, res) {
  const body = await readJson(req);
  const prompt = String(body.prompt || "").trim();
  const mode = body.mode === "deep" ? "deep" : "fast";
  const provider = body.provider === "api" ? "api" : "local";
  const localModel = mode === "deep" ? DEEP_STORY_MODEL : STORY_MODEL;
  const model = provider === "api" ? DEEPSEEK_API_STORY_MODEL : localModel;
  const timeoutMs = mode === "deep" ? DEEP_STORY_TIMEOUT_MS : STORY_TIMEOUT_MS;
  const pages = clampNumber(Number(body.pages || 4), 1, mode === "deep" ? 24 : 12);
  const wordsPerPage = clampNumber(Number(body.wordsPerPage || 550), 180, 1000);
  const genre = String(body.genre || "avontuurlijk verhaal").slice(0, 160);
  const audience = String(body.audience || "algemeen publiek").slice(0, 160);
  const tone = String(body.tone || "beeldend, helder en menselijk").slice(0, 180);
  const requestedLanguage = String(body.language || "Auto").slice(0, 80);
  const language = resolveStoryLanguage(requestedLanguage, prompt);
  const pageLabel = storyPageLabel(language);
  const referenceTitle = String(body.referenceTitle || "").slice(0, 220);
  const referenceText = normalizeText(body.referenceText || "").slice(0, REFERENCE_MAX_CHARS);
  const referenceGuide = buildReferenceGuide({ referenceTitle, referenceText, language });

  if (!prompt) {
    await sendJson(res, 400, { ok: false, error: "empty_prompt" });
    return;
  }

  const targetWords = pages * wordsPerPage;
  const generationPrompt = buildStoryGenerationPrompt({
    prompt,
    pages,
    wordsPerPage,
    targetWords,
    genre,
    audience,
    tone,
    language,
    pageLabel,
    referenceGuide,
    referenceText,
  });

  if (provider === "api") {
    const apiResult = await runDeepSeekApiChat({
      res,
      model,
      messages: [
        {
          role: "system",
          content: "You are BookReader's story writer. Return only the requested story text. Do not include analysis, notes, JSON, or hidden reasoning.",
        },
        { role: "user", content: generationPrompt },
      ],
      temperature: mode === "deep" ? 0.72 : 0.68,
      maxTokens: Math.min(64000, Math.max(mode === "deep" ? 2800 : 1400, Math.round(targetWords * 2.25))),
      timeoutMs,
      timeoutError: "story_model_timeout",
      timeoutMessage: `DeepSeek API-verhaalgeneratie duurde langer dan ${timeoutMs} ms. Probeer minder pagina's of het snelle model.`,
      unreachableError: "story_model_unreachable",
      unreachableMessage: "DeepSeek API kon niet worden bereikt voor verhaalgeneratie.",
      failureError: "story_model_failed",
    });
    if (apiResult.clientClosed) return;
    if (!apiResult.ok) {
      await sendJson(res, apiResult.status, apiResult.payload);
      return;
    }

    const rawStory = cleanGeneratedStory(apiResult.content);
    const extractedTitle = extractStoryTitle(rawStory);
    const title = extractedTitle && !isGenericStoryTitle(extractedTitle) ? extractedTitle : fallbackStoryTitle(prompt, language);
    const story = enrichPageHeadings(ensureStoryShape(rawStory, title, pages, pageLabel), pageLabel);
    const quality = assessStoryQuality(story, {
      title,
      pages,
      requestedWords: targetWords,
      language,
      pageLabel,
    });
    if (!quality.ok) {
      await sendJson(res, 422, {
        ok: false,
        error: "story_quality_failed",
        message: quality.message,
        model,
        mode,
        provider: "deepseek-api",
        quality,
        preview: story.slice(0, 1400),
      });
      return;
    }
    await sendJson(res, 200, {
      ok: true,
      provider: "deepseek-api",
      model,
      mode,
      title,
      story,
      requestedPages: pages,
      requestedWords: targetWords,
      language,
      wordCount: countWords(story),
    });
    return;
  }

  const available = await isOllamaModelAvailable(model);
  if (!available) {
    await sendJson(res, 503, {
      ok: false,
      error: "story_model_not_available",
      message: `Ollama model ${model} is niet beschikbaar. Run: ollama pull ${model}`,
      model,
    });
    return;
  }
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(new Error("story_timeout")), timeoutMs);
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort(new Error("client_closed"));
  });

  let response;
  try {
    response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: generationPrompt,
        stream: false,
        options: {
          temperature: mode === "deep" ? 0.72 : 0.68,
          top_p: 0.92,
          num_ctx: mode === "deep" ? 8192 : 4096,
          num_predict: Math.min(mode === "deep" ? 12000 : 6000, Math.max(mode === "deep" ? 2200 : 1200, Math.round(targetWords * 2.2))),
        },
        keep_alive: "10m",
      }),
      signal: abortController.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "client_closed") return;
    const timedOut = message === "story_timeout" || (error instanceof Error && error.name === "TimeoutError");
    await sendJson(res, timedOut ? 504 : 502, {
      ok: false,
      error: timedOut ? "story_model_timeout" : "story_model_unreachable",
      message: timedOut
        ? `DeepSeek-verhaalgeneratie duurde langer dan ${timeoutMs} ms. Probeer minder pagina's of het snelle model.`
        : "Ollama kon niet worden bereikt voor verhaalgeneratie.",
      model,
    });
    return;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await sendJson(res, response.status, { ok: false, error: "story_model_failed", details: payload });
    return;
  }

  const rawStory = cleanGeneratedStory(String(payload.response || ""));
  const extractedTitle = extractStoryTitle(rawStory);
  const title = extractedTitle && !isGenericStoryTitle(extractedTitle) ? extractedTitle : fallbackStoryTitle(prompt, language);
  const story = enrichPageHeadings(ensureStoryShape(rawStory, title, pages, pageLabel), pageLabel);
  const quality = assessStoryQuality(story, {
    title,
    pages,
    requestedWords: targetWords,
    language,
    pageLabel,
  });
  if (!quality.ok) {
    await sendJson(res, 422, {
      ok: false,
      error: "story_quality_failed",
      message: quality.message,
      model,
      mode,
      quality,
      preview: story.slice(0, 1400),
    });
    return;
  }
  await sendJson(res, 200, {
    ok: true,
    provider: "ollama",
    model,
    mode,
    title,
    story,
    requestedPages: pages,
    requestedWords: targetWords,
    language,
    wordCount: countWords(story),
  });
}

async function handleDeepSeekKeySave(req, res) {
  const body = await readJson(req);
  const clear = body.clear === true;
  const apiKey = String(body.apiKey || "").trim();

  if (clear || !apiKey) {
    writeProjectEnvValue("BOOKREADER_DEEPSEEK_API_KEY", "");
    delete process.env.BOOKREADER_DEEPSEEK_API_KEY;
    DEEPSEEK_API_KEY = "";
    await sendJson(res, 200, {
      ok: true,
      configured: false,
      message: "DeepSeek API key is gewist.",
    });
    return;
  }

  if (!/^sk-[A-Za-z0-9_-]{8,}$/.test(apiKey) || apiKey.length > 500) {
    await sendJson(res, 400, {
      ok: false,
      error: "invalid_deepseek_api_key",
      message: "DeepSeek API keys beginnen normaal met sk-. Controleer de sleutel en probeer opnieuw.",
    });
    return;
  }

  writeProjectEnvValue("BOOKREADER_DEEPSEEK_API_KEY", apiKey);
  process.env.BOOKREADER_DEEPSEEK_API_KEY = apiKey;
  DEEPSEEK_API_KEY = apiKey;

  await sendJson(res, 200, {
    ok: true,
    configured: true,
    message: "DeepSeek API key is opgeslagen.",
  });
}

async function handleCacheImage(req, res) {
  const body = await readJson(req);
  const sourceUrl = String(body.imageUrl || "").trim();
  const kind = slug(String(body.kind || "image")).slice(0, 40) || "image";
  const label = slug(String(body.label || "")).slice(0, 50);

  if (!sourceUrl) {
    await sendJson(res, 400, { ok: false, error: "empty_image_url" });
    return;
  }

  let buffer;
  let contentType = "image/png";
  try {
    if (sourceUrl.startsWith("data:")) {
      const parsed = parseDataImage(sourceUrl);
      buffer = parsed.buffer;
      contentType = parsed.contentType;
    } else {
      const absoluteUrl = sourceUrl.startsWith("/")
        ? `http://${HOST}:${PORT}${sourceUrl}`
        : sourceUrl;
      const response = await fetch(absoluteUrl);
      if (!response.ok) {
        await sendJson(res, response.status, {
          ok: false,
          error: "image_fetch_failed",
          message: `Afbeelding kon niet worden opgehaald: HTTP ${response.status}`,
        });
        return;
      }
      contentType = String(response.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) {
        await sendJson(res, 415, {
          ok: false,
          error: "not_an_image",
          message: "De opgehaalde URL is geen afbeelding.",
        });
        return;
      }
      buffer = Buffer.from(await response.arrayBuffer());
    }
  } catch (error) {
    await sendJson(res, 502, {
      ok: false,
      error: "image_cache_failed",
      message: error instanceof Error ? error.message : "Afbeelding kon niet lokaal worden opgeslagen.",
    });
    return;
  }

  if (!buffer?.length) {
    await sendJson(res, 400, { ok: false, error: "empty_image_payload" });
    return;
  }

  const extension = imageExtension(contentType);
  const fileName = `${Date.now()}-${kind}${label ? `-${label}` : ""}-${randomUUID()}.${extension}`;
  const filePath = join(IMAGES_DIR, fileName);
  writeFileSync(filePath, buffer);

  await sendJson(res, 200, {
    ok: true,
    imageUrl: `/api/media/images/${encodeURIComponent(fileName)}`,
    filePath,
    bytes: buffer.length,
    contentType,
  });
}

async function handleCachedImage(url, res) {
  const fileName = basename(decodeURIComponent(url.pathname.replace("/api/media/images/", "")));
  const filePath = join(IMAGES_DIR, fileName);
  if (!fileName || !existsSync(filePath)) {
    await sendJson(res, 404, { ok: false, error: "image_not_found" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentTypeForImage(fileName),
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(res);
}

async function handleTts(req, res) {
  const body = await readJson(req);
  const voices = availablePiperVoices();
  const selectedVoice = selectPiperVoice(String(body.voice || PIPER_MODEL || "nl_NL-ronnie-medium"), voices);

  if (!PIPER_BIN || !existsSync(PIPER_BIN) || !selectedVoice || !existsSync(selectedVoice.path)) {
    await sendJson(res, 503, {
      ok: false,
      error: "piper_not_configured",
      message: "Server-TTS is beschikbaar zodra Piper en minimaal een .onnx voice-model in de BookReader voices-map staan.",
      binary: PIPER_BIN,
      voicesDir: VOICES_DIR,
      voices,
    });
    return;
  }

  const text = String(body.text || "").trim();
  if (!text) {
    await sendJson(res, 400, { ok: false, error: "empty_text" });
    return;
  }
  if (text.length > MAX_TTS_CHARS) {
    await sendJson(res, 413, {
      ok: false,
      error: "text_too_long",
      maxChars: MAX_TTS_CHARS,
      message: `Dit TTS-verzoek is ${text.length} tekens; limiet is ${MAX_TTS_CHARS}.`,
    });
    return;
  }

  const id = `${Date.now()}-${randomUUID()}.wav`;
  const outputPath = join(AUDIO_DIR, id);
  const result = await runPiper(text, outputPath, selectedVoice.path, String(body.style || "neutral"));
  if (!result.ok) {
    await sendJson(res, 500, result);
    return;
  }

  await sendJson(res, 200, {
    ok: true,
    audioUrl: `/api/media/audio/${id}`,
    chars: text.length,
    provider: "piper",
    voice: selectedVoice,
  });
}

async function handleIllustrationGenerate(req, res) {
  const body = await readJson(req);
  const prompt = String(body.prompt || "").trim();
  const negativePrompt = String(body.negativePrompt || "low quality, blurry, text, watermark").trim();
  const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : Math.floor(Math.random() * 1_000_000_000);

  if (!prompt) {
    await sendJson(res, 400, { ok: false, error: "empty_prompt" });
    return;
  }
  if (!COMFY_WORKFLOW || !existsSync(COMFY_WORKFLOW)) {
    await sendJson(res, 503, {
      ok: false,
      error: "comfy_workflow_not_configured",
      message: "ComfyUI is pas actief zodra BOOKREADER_COMFY_WORKFLOW naar een API workflow JSON wijst.",
      prompt,
      negativePrompt,
    });
    return;
  }

  const workflow = JSON.parse(readFileSync(COMFY_WORKFLOW, "utf8"));
  const injected = injectComfyWorkflow(workflow, prompt, negativePrompt, seed);
  const response = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: injected.workflow, client_id: `bookreader-${randomUUID()}` }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await sendJson(res, response.status, { ok: false, error: "comfy_prompt_failed", details: payload });
    return;
  }

  await sendJson(res, 200, {
    ok: true,
    promptId: payload.prompt_id,
    prompt,
    negativePrompt,
    seed,
    injectedNodes: injected.injectedNodes,
    status: "queued",
  });
}

async function handleIllustrationStatus(url, res) {
  const promptId = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!promptId) {
    await sendJson(res, 400, { ok: false, error: "missing_prompt_id" });
    return;
  }
  const response = await fetch(`${COMFY_URL}/history/${encodeURIComponent(promptId)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await sendJson(res, response.status, { ok: false, error: "comfy_history_failed", details: payload });
    return;
  }

  const entry = payload[promptId] || {};
  const images = collectComfyImages(entry).map((image) => ({
    ...image,
    url: `/api/comfy/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=${encodeURIComponent(image.type || "output")}`,
  }));

  await sendJson(res, 200, {
    ok: true,
    promptId,
    complete: images.length > 0,
    images,
  });
}

async function handleComfyView(url, res) {
  const filename = url.searchParams.get("filename") || "";
  const subfolder = url.searchParams.get("subfolder") || "";
  const type = url.searchParams.get("type") || "output";
  if (!filename) {
    await sendJson(res, 400, { ok: false, error: "missing_filename" });
    return;
  }
  const upstream = new URL(`${COMFY_URL}/view`);
  upstream.searchParams.set("filename", filename);
  upstream.searchParams.set("subfolder", subfolder);
  upstream.searchParams.set("type", type);
  const response = await fetch(upstream);
  if (!response.ok || !response.body) {
    await sendJson(res, response.status, { ok: false, error: "comfy_view_failed" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": response.headers.get("content-type") || "image/png",
    "Cache-Control": "no-store",
  });
  Readable.fromWeb(response.body).pipe(res);
}

async function handleAudio(url, res) {
  const file = basename(decodeURIComponent(url.pathname.split("/").pop() || ""));
  if (!file || extname(file).toLowerCase() !== ".wav") {
    await sendJson(res, 400, { ok: false, error: "invalid_audio_file" });
    return;
  }
  const path = join(AUDIO_DIR, file);
  if (!existsSync(path)) {
    await sendJson(res, 404, { ok: false, error: "audio_not_found" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "audio/wav",
    "Cache-Control": "no-store",
  });
  createReadStream(path).pipe(res);
}

function runPiper(text, outputPath, modelPath, style) {
  const tuning = piperTuningForStyle(style);
  return new Promise((resolveDone) => {
    const child = spawn(PIPER_BIN, [
      "--model",
      modelPath,
      "--output_file",
      outputPath,
      "--length-scale",
      String(tuning.lengthScale),
      "--noise-scale",
      String(tuning.noiseScale),
      "--noise-w-scale",
      String(tuning.noiseWScale),
      "--sentence-silence",
      String(tuning.sentenceSilence),
      "--volume",
      String(tuning.volume),
    ], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk).toString("utf8")));
    child.on("error", (error) => {
      resolveDone({ ok: false, error: "piper_launch_failed", message: error.message });
    });
    child.on("close", (code) => {
      if (code === 0 && existsSync(outputPath)) {
        resolveDone({ ok: true });
      } else {
        resolveDone({
          ok: false,
          error: "piper_failed",
          exitCode: code,
          message: stderr.join("").slice(-2000),
        });
      }
    });
    child.stdin.end(text);
  });
}

function availablePiperVoices() {
  try {
    return readdirSync(VOICES_DIR)
      .filter((file) => file.endsWith(".onnx"))
      .sort((a, b) => a.localeCompare(b))
      .map((file) => {
        const id = file.replace(/\.onnx$/, "");
        return {
          id,
          label: voiceLabel(id),
          path: join(VOICES_DIR, file),
          configPath: join(VOICES_DIR, `${file}.json`),
        };
      });
  } catch {
    return [];
  }
}

function selectPiperVoice(requested, voices) {
  if (!voices.length) return null;
  const normalized = String(requested || "").toLowerCase();
  return (
    voices.find((voice) => voice.id.toLowerCase() === normalized) ||
    voices.find((voice) => voice.id.toLowerCase().includes(normalized)) ||
    voices.find((voice) => voice.id === "nl_NL-ronnie-medium") ||
    voices[0]
  );
}

function voiceLabel(id) {
  return id
    .replace(/^([a-z]{2}_[A-Z]{2})-/, "$1 ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function autoPiperBinary() {
  const local = join(PROJECT_ROOT, ".venv_piper/bin/piper");
  if (existsSync(local)) return local;
  const sibling = "/home/pwintri2/AnimePersonaWorld/.venv/bin/piper";
  if (existsSync(sibling)) return sibling;
  return "piper";
}

function piperTuningForStyle(style) {
  if (style === "lively") {
    return { lengthScale: 0.92, noiseScale: 0.72, noiseWScale: 0.82, sentenceSilence: 0.08, volume: 1.0 };
  }
  if (style === "story") {
    return { lengthScale: 1.08, noiseScale: 0.64, noiseWScale: 0.74, sentenceSilence: 0.18, volume: 0.96 };
  }
  if (style === "calm") {
    return { lengthScale: 1.16, noiseScale: 0.56, noiseWScale: 0.66, sentenceSilence: 0.22, volume: 0.94 };
  }
  return { lengthScale: 1.0, noiseScale: 0.66, noiseWScale: 0.76, sentenceSilence: 0.12, volume: 0.98 };
}

async function isOllamaModelAvailable(model) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    const payload = await response.json();
    return Array.isArray(payload.models) && payload.models.some((item) => item.name === model || item.model === model);
  } catch {
    return false;
  }
}

async function runDeepSeekApiChat({
  res,
  model,
  messages,
  temperature,
  maxTokens,
  responseFormat,
  timeoutMs,
  timeoutError,
  timeoutMessage,
  unreachableError,
  unreachableMessage,
  failureError,
}) {
  if (!DEEPSEEK_API_KEY) {
    return {
      ok: false,
      status: 503,
      payload: {
        ok: false,
        error: "deepseek_api_key_missing",
        message: "DeepSeek API is gekozen, maar BOOKREADER_DEEPSEEK_API_KEY staat niet op de server.",
        model,
      },
    };
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(new Error(timeoutError)), timeoutMs);
  const onClose = () => {
    if (!res.writableEnded) abortController.abort(new Error("client_closed"));
  };
  res.on("close", onClose);

  const requestBody = {
    model,
    messages,
    stream: false,
    temperature,
    max_tokens: maxTokens,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };
  if (/^deepseek-v4/i.test(model)) {
    requestBody.thinking = { type: "disabled" };
  }

  let response;
  try {
    response = await fetch(`${DEEPSEEK_API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "client_closed") return { ok: false, clientClosed: true };
    const timedOut = message === timeoutError || (error instanceof Error && error.name === "TimeoutError");
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      payload: {
        ok: false,
        error: timedOut ? timeoutError : unreachableError,
        message: timedOut ? timeoutMessage : unreachableMessage,
        model,
      },
    };
  } finally {
    clearTimeout(timeoutHandle);
    if (typeof res.off === "function") res.off("close", onClose);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      payload: {
        ok: false,
        error: failureError,
        message: "DeepSeek API gaf een fout terug.",
        model,
        details: sanitizeDeepSeekApiError(payload),
      },
    };
  }

  return {
    ok: true,
    content: String(payload?.choices?.[0]?.message?.content || ""),
  };
}

function sanitizeDeepSeekApiError(payload) {
  const error = payload?.error && typeof payload.error === "object" ? payload.error : payload;
  return {
    message: String(error?.message || "").slice(0, 600),
    type: String(error?.type || "").slice(0, 160),
    code: String(error?.code || "").slice(0, 160),
  };
}

function buildReferenceGuide({ referenceTitle, referenceText, language }) {
  const text = normalizeText(referenceText);
  if (!text) return "";
  const sentences = splitSentences(text);
  const characters = collectCharacterDescriptions(text, "storybook").slice(0, 12);
  const history = extractReferenceHistory(sentences, characters.map((character) => character.name));
  const motifs = extractVisualObjects(text, 12);
  const guide = [
    referenceTitle ? `Reference title: ${referenceTitle}.` : "",
    `Reference language/context: ${language}.`,
    summarizeReferenceForGuide(sentences) ? `Reference summary: ${summarizeReferenceForGuide(sentences)}` : "",
    characters.length
      ? `Confirmed characters and evidence: ${characters
          .map((character) => `${character.name}: ${truncate(character.description, 280)} Relationships: ${truncate(character.relationships, 180)}`)
          .join(" | ")}`
      : "No confirmed recurring named characters found in the reference.",
    history.length ? `Important backstory/history cues: ${history.join(" | ")}` : "",
    motifs.length ? `Recurring visual/story motifs: ${motifs.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  return truncate(guide, 6000);
}

function summarizeReferenceForGuide(sentences) {
  return truncate(sentences.slice(0, 6).join(" "), 900);
}

function extractReferenceHistory(sentences, characterNames) {
  const historyPattern =
    /\b(vroeger|ooit|jaren geleden|herinner|verleden|beloofde|verloor|ontmoette|kende|familie|vader|moeder|broer|zus|vriend|vriendin|once|years ago|remembered|past|promised|lost|met|knew|family|father|mother|brother|sister|friend)\b/i;
  const characterPattern = characterNames.length ? new RegExp(`\\b(${characterNames.map(escapeRegExp).join("|")})\\b`, "i") : null;
  return sentences
    .filter((sentence) => historyPattern.test(sentence) || (characterPattern && characterPattern.test(sentence) && sentence.length < 260))
    .slice(0, 10)
    .map((sentence) => truncate(sentence, 260));
}

function buildStoryGenerationPrompt({ prompt, pages, wordsPerPage, targetWords, genre, audience, tone, language, pageLabel, referenceGuide, referenceText }) {
  const referenceBlock = referenceGuide
    ? `\nReference story bible:\n${referenceGuide}\n\nReference excerpt for continuity, character history and voice. Use it as background; do not copy passages verbatim unless the user explicitly asks for a rewrite:\n${truncate(referenceText, 9000)}\n`
    : "";
  return `You are BookReader's story writer.
Write a complete multi-page story from the user's idea.

Output rules:
- Write in ${language}.
- Start immediately with a Markdown H1 title in ${language}: "# <story title>".
- Then use page markers with real relevant chapter names in this language: "## ${pageLabel} 1 - <specific chapter title>", "## ${pageLabel} 2 - <specific chapter title>", up to "## ${pageLabel} ${pages} - <specific chapter title>".
- Chapter names must describe what actually happens in that chapter. Avoid generic names like "The Beginning", "A New Day", "The Journey", "Start", or only "${pageLabel} 1".
- Write about ${wordsPerPage} words per page, about ${targetWords} words total.
- Do not include analysis, planning, notes, comments, JSON, code fences, or model-thinking.
- Do not mention that you are an AI.
- Make it a real story, not an outline.
- Finish the story. The final page must resolve or deliberately close the central situation.
- Do not stop mid-sentence, mid-scene, or with an unfinished cliffhanger unless the user explicitly asks for a cliffhanger.
- Genre, audience and tone may be UI hints written in another language. They must not override the required output language: ${language}.
- Write with more concrete sensory detail, character memory, small actions, and cause-and-effect. Avoid vague summary paragraphs.
- Minimize formulaic contrast sentences such as "het is niet X, maar Y", "niet alleen X maar ook Y", "it is not X but Y", and "not only X but also Y". Use direct description instead.

Story quality rules:
- Build a coherent beginning, middle and ending.
- Keep characters, names, locations, objects and motivations consistent.
- Use concrete scenes and actions, not vague summaries.
- If a reference file is provided, preserve confirmed character names, relationships, past events, and emotional history from that reference unless the user explicitly asks for a different version.
- Include enough visual detail that later illustration prompts can infer characters, setting and objects.
- Avoid random genre switches, unrelated twists, decorative filler, and abstract symbolism unless requested.
- Do not sexualize characters. If the idea mentions a child, girl, boy, teenager or young person, keep body descriptions neutral and age-appropriate.
- Do not add intimate body details, fetish clothing, or strange clothing words when the user did not ask for them.
- Do not invent a completely different village, mountains, war, royal court, monsters, or other large setting unless the user asks for it.
- Keep chapters/pages readable aloud.

Genre: ${genre}
Audience: ${audience}
Tone: ${tone}
${referenceBlock}

User idea:
${prompt}
`;
}

function cleanGeneratedStory(value) {
  return String(value || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```[a-zA-Z]*\s*/g, "")
    .replace(/```$/g, "")
    .replace(/^\s*(hier is|here is|natuurlijk,? hier is)[^\n]*\n+/i, "")
    .trim();
}

function extractStoryTitle(story) {
  const h1 = story.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return normalizeText(h1[1]).slice(0, 120);
  const firstLine = story.split(/\n+/).map((line) => line.trim()).find(Boolean) || "";
  if (firstLine && !/^#{1,3}\s*(pagina|page|seite|página)\b/i.test(firstLine) && firstLine.length <= 120) {
    return firstLine.replace(/^#+\s*/, "").trim();
  }
  return "";
}

function fallbackStoryTitle(prompt, language = "Nederlands") {
  const words = normalizeText(prompt)
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .join(" ");
  const lower = normalizeText(language).toLowerCase();
  if (lower.includes("english")) return words ? `Story about ${words}` : "New Story";
  if (lower.includes("deutsch") || lower.includes("german")) return words ? `Geschichte über ${words}` : "Neue Geschichte";
  if (lower.includes("français") || lower.includes("french")) return words ? `Histoire de ${words}` : "Nouvelle histoire";
  if (lower.includes("español") || lower.includes("spanish")) return words ? `Historia sobre ${words}` : "Nueva historia";
  return words ? `Verhaal over ${words}` : "Nieuw verhaal";
}

function isGenericStoryTitle(title) {
  return /^(titel|verhaal|nieuw verhaal|untitled|title)$/i.test(normalizeText(title));
}

function ensureStoryShape(rawStory, title, pages, pageLabel = "Pagina") {
  let story = cleanGeneratedStory(rawStory);
  const hasTitle = /^#\s+.+$/m.test(story);
  if (hasTitle) {
    story = story.replace(/^#\s+.+$/m, `# ${title}`);
  } else {
    story = `# ${title}\n\n${story}`;
  }

  if (pageMarkerRegex().test(story)) return story.trim();

  const body = story.replace(/^#\s+.+\n*/, "").trim();
  if (!body) return `# ${title}\n\n## ${pageLabel} 1\n\n`;

  const paragraphs = body.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const pageCount = Math.max(1, Math.min(pages, Math.max(1, paragraphs.length)));
  const perPage = Math.ceil(paragraphs.length / pageCount);
  const chunks = [];
  for (let index = 0; index < pageCount; index += 1) {
    const part = paragraphs.slice(index * perPage, (index + 1) * perPage).join("\n\n");
    if (part) chunks.push(`## ${pageLabel} ${index + 1}\n\n${part}`);
  }
  return [`# ${title}`, ...chunks].join("\n\n").trim();
}

function enrichPageHeadings(story, pageLabel) {
  const sections = String(story || "").split(/(?=^##\s*(?:pagina|page|seite|página)\s+\d+\b.*$)/gim);
  if (sections.length <= 1) return story;
  return sections
    .map((section) => {
      const heading = section.match(/^##\s*(pagina|page|seite|página)\s+(\d+)\b([^\n]*)/im);
      if (!heading) return section;
      const existingTitle = normalizeText(String(heading[3] || "").replace(/^[-:]\s*/, ""));
      if (isUsefulChapterTitle(existingTitle)) return section;
      const body = section.replace(/^##[^\n]*\n?/, "");
      const derived = deriveChapterTitle(body, heading[1], Number(heading[2]) || 1);
      return section.replace(/^##[^\n]*/m, `## ${pageLabel} ${heading[2]} - ${derived}`);
    })
    .join("")
    .trim();
}

function isUsefulChapterTitle(title) {
  const lower = normalizeText(title).toLowerCase();
  if (lower.length < 6) return false;
  if (/^(start|begin|beginning|the beginning|new day|a new day|journey|the journey|hoofdstuk|chapter|pagina|page|seite|página)$/i.test(lower)) {
    return false;
  }
  return true;
}

function deriveChapterTitle(body, markerLanguage, index) {
  const sentences = splitSentences(body);
  const source = sentences[0] || normalizeText(body).slice(0, 220);
  const words = (source.match(/[\p{L}\p{N}]{4,}/gu) || [])
    .map((word) => word.toLowerCase())
    .filter((word) => !CHAPTER_TITLE_STOPWORDS.has(word))
    .slice(0, 6);
  const title = words.length ? toTitleCase(words.join(" ")) : `${markerLanguage} ${index}`;
  return truncate(title, 80);
}

const CHAPTER_TITLE_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "because",
  "before",
  "daar",
  "de",
  "deze",
  "door",
  "een",
  "from",
  "haar",
  "have",
  "heeft",
  "het",
  "hij",
  "into",
  "maar",
  "met",
  "niet",
  "onder",
  "over",
  "that",
  "the",
  "then",
  "there",
  "this",
  "toen",
  "voor",
  "waar",
  "were",
  "with",
  "zijn",
]);

function toTitleCase(value) {
  return normalizeText(value).replace(/\b[\p{L}\p{N}]/gu, (match) => match.toUpperCase());
}

function assessStoryQuality(story, { title, pages, requestedWords, language }) {
  const wordCount = countWords(story);
  const words = (String(story || "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const uniqueRatio = words.length ? new Set(words).size / words.length : 0;
  const pageMarkers = (story.match(pageMarkerRegex()) || []).length;
  const suspiciousTerms = story.match(
    /\b(maalige|vandaagste|geenzaamde|zwaartekamp|schotvaren|negale|houwijk|uitgegrield|teveld|zorgd|waardes van vrouwen|silver mirror door|zonneetjes|grotig|occurent|llijahs|silvertjeur|langzamerling|recently|hadn'?t|kledingstok|halscors)\b/gi,
  ) || [];
  const longDigitRuns = story.match(/\d{8,}/g) || [];
  const sexualizedMinorTerms = /\b(meisje|jongen|tiener|dertien|veertien|vijftien|zestien|kind)\b[\s\S]{0,220}\b(borst|borsten|heupen|billen|sexy|sensueel)\b/i.test(story);
  const repeatedSentenceRatio = sentenceRepeatRatio(story);
  const completeEnding = hasCompleteStoryEnding(story);
  const contrastTics = countContrastTics(story);
  const reasons = [];

  if (isGenericStoryTitle(title)) reasons.push("generieke titel");
  if (pageMarkers < Math.min(2, pages)) reasons.push("ontbrekende paginamarkers");
  if (wordCount < Math.max(160, Math.round(requestedWords * 0.72))) reasons.push("te weinig tekst");
  if (!completeEnding) reasons.push("onaf einde");
  if (/nederlands/i.test(language) && suspiciousTerms.length >= 1) reasons.push("onleesbaar pseudo-Nederlands");
  if (sexualizedMinorTerms) reasons.push("ongepaste lichaamsbeschrijving bij jong personage");
  if (longDigitRuns.length) reasons.push("cijferbrij in verhaaltekst");
  if (words.length > 120 && uniqueRatio < 0.24) reasons.push("te veel woordherhaling");
  if (repeatedSentenceRatio > 0.28) reasons.push("te veel herhaalde zinnen");
  if (contrastTics > Math.max(2, Math.floor(pages / 2))) reasons.push("te veel niet-dit-maar-dat formuleringen");

  return {
    ok: reasons.length === 0,
    message: reasons.length
      ? `DeepSeek leverde geen bruikbaar verhaal (${reasons.join(", ")}). Probeer 'Diep 7B traag' of minder pagina's.`
      : "verhaalkwaliteit voldoende",
    reasons,
    wordCount,
    pageMarkers,
    uniqueRatio: Number(uniqueRatio.toFixed(3)),
    repeatedSentenceRatio: Number(repeatedSentenceRatio.toFixed(3)),
    longDigitRuns: longDigitRuns.length,
    completeEnding,
    contrastTics,
  };
}

function countContrastTics(story) {
  const patterns = [
    /\bhet\s+(?:is|was)\s+niet\b[^.!?]{0,100}\bmaar\b/gi,
    /\bniet\s+alleen\b[^.!?]{0,100}\bmaar\s+ook\b/gi,
    /\bit\s+(?:is|was)\s+not\b[^.!?]{0,100}\bbut\b/gi,
    /\bnot\s+only\b[^.!?]{0,100}\bbut\s+also\b/gi,
  ];
  return patterns.reduce((total, pattern) => total + (String(story || "").match(pattern) || []).length, 0);
}

function resolveStoryLanguage(requestedLanguage, prompt) {
  const normalized = normalizeText(requestedLanguage);
  if (normalized && !/^auto(matisch)?$/i.test(normalized)) return normalized;
  return detectStoryLanguage(prompt);
}

function detectStoryLanguage(prompt) {
  const lower = normalizeText(prompt).toLowerCase();
  const scores = [
    ["English", /\b(the|and|with|for|from|story|girl|boy|door|moon|finds|opens|goes|there|their|while|because)\b/g],
    ["Nederlands", /\b(de|het|een|en|met|voor|van|verhaal|meisje|jongen|deur|maan|vindt|opent|gaat|daar|terwijl|omdat)\b/g],
    ["Deutsch", /\b(der|die|das|und|mit|für|von|geschichte|mädchen|junge|tür|mond|findet|öffnet|geht|weil)\b/g],
    ["Français", /\b(le|la|les|une|un|et|avec|pour|histoire|fille|garçon|porte|lune|trouve|ouvre|parce)\b/g],
    ["Español", /\b(el|la|los|las|una|un|y|con|para|historia|niña|niño|puerta|luna|encuentra|abre|porque)\b/g],
  ].map(([language, pattern]) => [language, (lower.match(pattern) || []).length]);
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "Nederlands";
}

function storyPageLabel(language) {
  const lower = normalizeText(language).toLowerCase();
  if (lower.includes("english")) return "Page";
  if (lower.includes("deutsch") || lower.includes("german")) return "Seite";
  if (lower.includes("español") || lower.includes("spanish")) return "Página";
  if (lower.includes("français") || lower.includes("french")) return "Page";
  return "Pagina";
}

function pageMarkerRegex() {
  return /^##\s*(pagina|page|seite|página)\s+\d+\b/gim;
}

function hasCompleteStoryEnding(story) {
  const text = normalizeText(story.replace(/^#+\s+.+$/gm, ""));
  if (!/[.!?…]"?$/.test(text)) return false;
  const tail = text.slice(-260).toLowerCase();
  if (/\b(en toen|maar toen|terwijl|because|and then|but then|while|although|omdat|terwijl)\s*$/i.test(tail)) return false;
  if (/(wordt vervolgd|to be continued|continued|vervolg)$/i.test(tail)) return false;
  return true;
}

function sentenceRepeatRatio(text) {
  const sentences = String(text || "")
    .replace(/^#+\s+.+$/gm, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeText(sentence).toLowerCase())
    .filter((sentence) => sentence.length > 28);
  if (sentences.length < 4) return 0;
  const seen = new Set();
  let repeated = 0;
  for (const sentence of sentences) {
    const key = sentence.replace(/\b(de|het|een|en|of|maar|want|naar|met|van|voor)\b/g, "").replace(/\s+/g, " ").slice(0, 120);
    if (seen.has(key)) repeated += 1;
    seen.add(key);
  }
  return repeated / sentences.length;
}

function countWords(value) {
  return (String(value || "").match(/[\p{L}\p{N}]+/gu) || []).length;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function buildContextPrompt({ title, rawText, chapterTitle, chapterText, style, fallbackAnalysis }) {
  const deterministicBible = JSON.stringify({
    storySummary: fallbackAnalysis.storySummary,
    world: fallbackAnalysis.world,
    sceneBrief: fallbackAnalysis.sceneBrief,
    characters: fallbackAnalysis.characters.map((character) => ({
      name: character.name,
      role: character.role,
      description: character.description,
      relationships: character.relationships,
      count: character.count,
    })),
    continuity: fallbackAnalysis.visualContinuity,
  }, null, 2);

  return `You are the story-continuity director for BookReader.
Return ONLY valid JSON. No markdown, no commentary, no placeholders.

The story may be Dutch. Understand the text literally. Do not invent a different genre, town, era, costume, object, or art concept when the text does not support it.

Use this deterministic story bible as grounded evidence. You may improve it, but do not contradict it:
${deterministicBible}

Required JSON shape:
{
  "storySummary": "",
  "world": "",
  "sceneBrief": {
    "moment": "",
    "location": "",
    "charactersPresent": [],
    "mustShow": [],
    "objects": [],
    "mood": "",
    "forbidden": []
  },
  "visualContinuity": [],
  "characters": [
    {
      "name": "",
      "role": "",
      "description": "",
      "relationships": "",
      "portraitPrompt": ""
    }
  ],
  "chapterPrompt": "",
  "coverPrompt": ""
}

Rules:
- Use empty strings or empty arrays for unknown fields; never output schema labels like "kort", "regel 1", "name", or "English prompt".
- Character descriptions must be supported by the story text. If appearance is unknown, say that it is unknown and keep the portrait neutral.
- chapterPrompt and coverPrompt must be in English for ComfyUI.
- chapterPrompt must include a concrete scene, the exact characters present, location, important objects, and what should NOT be added.
- Do not request abstract art, modern art, nostalgic Dutch-village painting, Anton Pieck/Piek-like scenery, unrelated fantasy villages, or extra people unless the story says so.
- No readable text, no watermark.
- Keep every field compact. Do not repeat whole chapters inside descriptions or prompts.

Book title: ${title}
Requested visual style: ${style}
Selected chapter: ${chapterTitle || "not specified"}

Full story/excerpt:
${rawText}

Selected chapter text:
${chapterText || rawText.slice(0, 12000)}
`;
}

function parseModelJson(value) {
  const withoutThink = value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const candidates = [
    withoutThink,
    withoutThink.slice(withoutThink.indexOf("{"), withoutThink.lastIndexOf("}") + 1),
  ].filter((item) => item && item.startsWith("{") && item.endsWith("}"));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeContextAnalysis(value) {
  const record = value && typeof value === "object" ? value : {};
  const characters = Array.isArray(record.characters) ? record.characters : [];
  return {
    storySummary: String(record.storySummary || "").slice(0, 1600),
    world: String(record.world || "").slice(0, 1600),
    visualContinuity: Array.isArray(record.visualContinuity)
      ? record.visualContinuity.map((item) => String(item).slice(0, 400)).slice(0, 12)
      : [],
    characters: characters
      .map((item, index) => ({
        id: `deepseek-character-${index + 1}-${String(item?.name || "character").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: String(item?.name || `Character ${index + 1}`).slice(0, 120),
        role: String(item?.role || "").slice(0, 400),
        description: String(item?.description || "").slice(0, 1200),
        relationships: String(item?.relationships || "").slice(0, 1000),
        prompt: String(item?.portraitPrompt || item?.prompt || "").slice(0, 2200),
        count: 0,
      }))
      .filter((item) => item.name && item.prompt && isLikelyCharacterName(item.name))
      .slice(0, 14),
    sceneBrief: normalizeSceneBrief(record.sceneBrief || record.scene || {}),
    chapterPrompt: String(record.chapterPrompt || "").slice(0, 2600),
    coverPrompt: String(record.coverPrompt || "").slice(0, 2600),
  };
}

function mergeContextAnalysis(modelAnalysis, fallbackAnalysis) {
  const fallbackReasons = [];
  const modelCharacters = Array.isArray(modelAnalysis.characters) ? modelAnalysis.characters : [];
  const fallbackByName = new Map(
    fallbackAnalysis.characters.map((character) => [normalizeNameKey(character.name), character]),
  );

  const characters = modelCharacters.length
    ? modelCharacters.map((character) => {
        const fallback = fallbackByName.get(normalizeNameKey(character.name));
        const prompt = fallback?.prompt || (isUsefulPrompt(character.prompt) ? character.prompt : character.prompt);
        if (fallback || !isUsefulPrompt(character.prompt)) fallbackReasons.push(`character_prompt:${character.name}`);
        return {
          ...character,
          role: isUsefulText(character.role, 12) && !looksLikePlaceholder(character.role) ? character.role : fallback?.role || character.role,
          description: fallback?.description || (isUsefulText(character.description, 16) ? character.description : character.description),
          relationships: fallback?.relationships || character.relationships,
          prompt: prompt || fallback?.prompt || character.prompt,
          count: fallback?.count || character.count || 0,
        };
      })
    : fallbackAnalysis.characters;

  if (!modelCharacters.length && fallbackAnalysis.characters.length) fallbackReasons.push("characters");
  const characterKeys = new Set(characters.map((character) => normalizeNameKey(character.name)));
  for (const fallback of fallbackAnalysis.characters) {
    if (!characterKeys.has(normalizeNameKey(fallback.name))) {
      characters.push(fallback);
      fallbackReasons.push(`character_missing:${fallback.name}`);
    }
  }

  const storySummary = isUsefulText(modelAnalysis.storySummary, 24)
    ? modelAnalysis.storySummary
    : fallbackAnalysis.storySummary;
  if (storySummary === fallbackAnalysis.storySummary) fallbackReasons.push("storySummary");

  const world = isUsefulText(modelAnalysis.world, 20) ? modelAnalysis.world : fallbackAnalysis.world;
  if (world === fallbackAnalysis.world) fallbackReasons.push("world");

  const visualContinuity = modelAnalysis.visualContinuity.filter((item) => isUsefulText(item, 16));
  if (!visualContinuity.length && fallbackAnalysis.visualContinuity.length) fallbackReasons.push("visualContinuity");

  const sceneBrief = mergeSceneBrief(modelAnalysis.sceneBrief, fallbackAnalysis.sceneBrief);
  if (sceneBrief === fallbackAnalysis.sceneBrief) fallbackReasons.push("sceneBrief");

  const chapterPrompt = isUsefulPrompt(modelAnalysis.chapterPrompt)
    ? modelAnalysis.chapterPrompt
    : fallbackAnalysis.chapterPrompt;
  if (chapterPrompt === fallbackAnalysis.chapterPrompt) fallbackReasons.push("chapterPrompt");

  const coverPrompt = isUsefulPrompt(modelAnalysis.coverPrompt) ? modelAnalysis.coverPrompt : fallbackAnalysis.coverPrompt;
  if (coverPrompt === fallbackAnalysis.coverPrompt) fallbackReasons.push("coverPrompt");

  const anchored = anchorPrompts({
    chapterPrompt,
    coverPrompt,
    sceneBrief,
    characters,
    fallbackAnalysis,
  });

  return {
    fallbackUsed: fallbackReasons.length > 0,
    fallbackReasons: Array.from(new Set(fallbackReasons)),
    analysis: {
      storySummary,
      world,
      sceneBrief,
      visualContinuity: visualContinuity.length ? visualContinuity : fallbackAnalysis.visualContinuity,
      characters: characters.slice(0, 14),
      chapterPrompt: anchored.chapterPrompt,
      coverPrompt: anchored.coverPrompt,
    },
  };
}

function buildHeuristicContextAnalysis({ title, rawText, chapterTitle, chapterText, style }) {
  const fullText = normalizeText(rawText || chapterText || "");
  const selectedText = normalizeText(chapterText || rawText || "");
  const sentences = splitSentences(fullText);
  const chapterSentences = splitSentences(selectedText);
  const characters = collectCharacterDescriptions(fullText, style);
  const charactersPresent = characters
    .filter((character) => selectedText.toLowerCase().includes(character.name.toLowerCase()))
    .map((character) => character.name);
  const centralSentences = selectCentralSceneSentences(chapterSentences, charactersPresent);
  const objects = extractVisualObjects(selectedText || fullText, 10);
  const location = extractLocation(chapterSentences) || extractLocation(sentences);
  const moment = centralSentences.join(" ") || chapterSentences.slice(0, 2).join(" ") || selectedText.slice(0, 700);
  const sceneBrief = {
    moment: truncate(moment, 900),
    location: location || "location unclear from text",
    charactersPresent,
    mustShow: buildMustShow({ charactersPresent, location, objects, moment }),
    objects,
    mood: inferMood(selectedText || fullText),
    forbidden: [
      "do not turn this into abstract modern art",
      "do not use nostalgic Dutch village, Anton Pieck-like or Anton Piek-like scenery unless the story explicitly describes it",
      "do not add unrelated castles, towns, forests, crowds, costumes, animals, weapons, or fantasy elements",
      "do not change the number or identity of visible main characters",
    ],
  };
  const characterLine = characters.length
    ? characters.map((character) => `${character.name}: ${toVisualEnglish(character.description)}`).join("; ")
    : "No confirmed named characters; focus on the described scene.";
  const storySummary = summarizeForUi(sentences, characters);
  const world = summarizeWorld(sentences);
  const stylePrompt = stylePromptSuffix(style);
  const chapterScene = toVisualEnglish(sceneBrief.moment);
  const coverScene = toVisualEnglish(sentences.slice(0, 8).join(" ") || fullText.slice(0, 1000));

  return {
    storySummary,
    world,
    sceneBrief,
    visualContinuity: [
      ...characters.slice(0, 8).map((character) => `${character.name}: ${character.description}`),
      `Selected scene: ${sceneBrief.moment}`,
      sceneBrief.location ? `Selected location: ${sceneBrief.location}` : "",
      "Keep clothing, hair, age impression, relationships, objects and setting consistent between chapter images, portraits and cover.",
    ].filter(Boolean).slice(0, 12),
    characters,
    chapterPrompt: [
      `Literal narrative illustration of the selected scene from "${chapterTitle || title || "this chapter"}".`,
      buildStoryLock(sceneBrief),
      chapterScene ? `Scene: ${chapterScene}.` : "",
      `Main visual continuity: ${characterLine}.`,
      stylePrompt,
      "Coherent composition, grounded in the provided story text, no readable text, no watermark, no abstract interpretation.",
    ]
      .filter(Boolean)
      .join(" "),
    coverPrompt: [
      `Finished book cover illustration for "${title || "Untitled Book"}".`,
      buildCoverLock(characters, sceneBrief),
      coverScene ? `Story essence: ${coverScene.slice(0, 1100)}.` : "",
      `Main characters and continuity: ${characterLine}.`,
      stylePrompt,
      "Strong focal image, clean space for later typography, no readable text, no watermark, not abstract, not unrelated decorative scenery.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function normalizeSceneBrief(value) {
  const record = value && typeof value === "object" ? value : {};
  return {
    moment: String(record.moment || "").slice(0, 900),
    location: String(record.location || "").slice(0, 300),
    charactersPresent: normalizeStringArray(record.charactersPresent).filter(isLikelyCharacterName).slice(0, 10),
    mustShow: normalizeStringArray(record.mustShow).slice(0, 14),
    objects: normalizeStringArray(record.objects).slice(0, 14),
    mood: String(record.mood || "").slice(0, 240),
    forbidden: normalizeStringArray(record.forbidden).slice(0, 12),
  };
}

function mergeSceneBrief(modelScene, fallbackScene) {
  const scene = normalizeSceneBrief(modelScene);
  const fallback = normalizeSceneBrief(fallbackScene);
  const useful =
    isUsefulText(scene.moment, 36) &&
    (scene.charactersPresent.length || fallback.charactersPresent.length === 0) &&
    scene.mustShow.length >= Math.min(2, fallback.mustShow.length || 2);
  if (!useful) return fallbackScene;
  return {
    moment: scene.moment,
    location: isUsefulText(scene.location, 8) ? scene.location : fallback.location,
    charactersPresent: scene.charactersPresent.length ? scene.charactersPresent : fallback.charactersPresent,
    mustShow: scene.mustShow.length ? scene.mustShow : fallback.mustShow,
    objects: scene.objects.length ? scene.objects : fallback.objects,
    mood: isUsefulText(scene.mood, 8) ? scene.mood : fallback.mood,
    forbidden: scene.forbidden.length ? scene.forbidden : fallback.forbidden,
  };
}

function anchorPrompts({ chapterPrompt, coverPrompt, sceneBrief, characters, fallbackAnalysis }) {
  const brief = normalizeSceneBrief(sceneBrief);
  const lockedCharacters = brief.charactersPresent.length
    ? brief.charactersPresent
    : characters.map((character) => character.name).slice(0, 4);
  const characterDetails = characters
    .filter((character) => lockedCharacters.includes(character.name))
    .map((character) => `${character.name}: ${toVisualEnglish(character.description)}`)
    .join("; ");
  const lock = [
    "STRICT STORY LOCK.",
    lockedCharacters.length ? `Visible named characters: ${lockedCharacters.join(", ")}.` : "Use only the characters clearly present in the selected scene.",
    brief.location ? `Location: ${toVisualEnglish(brief.location)}.` : "",
    brief.mustShow.length ? `Must show: ${brief.mustShow.map(toVisualEnglish).join("; ")}.` : "",
    brief.objects.length ? `Important objects: ${brief.objects.map(toVisualEnglish).join(", ")}.` : "",
    characterDetails ? `Character continuity: ${characterDetails}.` : "",
    "Do not add unrelated scenery, extra named characters, generic fantasy villages, abstract modern art, or nostalgic Anton Pieck/Piek-like Dutch village styling.",
  ].filter(Boolean).join(" ");

  const baseChapterPrompt = chapterPrompt || fallbackAnalysis.chapterPrompt;
  const baseCoverPrompt = coverPrompt || fallbackAnalysis.coverPrompt;
  const chapterHasLock = /STRICT STORY LOCK|Story lock:/i.test(baseChapterPrompt);
  const coverHasLock = /STRICT STORY LOCK|Cover lock:/i.test(baseCoverPrompt);

  return {
    chapterPrompt: truncate(chapterHasLock ? baseChapterPrompt : `${lock} ${baseChapterPrompt}`, 3200),
    coverPrompt: truncate(coverHasLock ? baseCoverPrompt : `${lock} ${baseCoverPrompt}`, 3200),
  };
}

function selectCentralSceneSentences(sentences, charactersPresent) {
  if (!sentences.length) return [];
  const visualWords = /(zag|zagen|stond|liep|liepen|droeg|vond|vonden|opende|keek|hield|zocht|zochten|verborg|licht|deur|kamer|brug|straat|bos|stad|huis|poort|water|nacht|mist|saw|stood|walked|wore|found|opened|looked|held|searched|hid|light|door|room|bridge|street|forest|city|house|gate|water|night|fog)/i;
  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const characterScore = charactersPresent.filter((name) => lower.includes(name.toLowerCase())).length * 5;
    const visualScore = visualWords.test(sentence) ? 4 : 0;
    const lengthScore = sentence.length > 35 && sentence.length < 280 ? 2 : 0;
    const earlyScore = Math.max(0, 3 - index * 0.25);
    return { sentence, score: characterScore + visualScore + lengthScore + earlyScore, index };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

function extractVisualObjects(text, limit = 10) {
  const normalized = normalizeText(text);
  const explicit = [
    "kompas",
    "deur",
    "tas",
    "jas",
    "brug",
    "kamer",
    "licht",
    "klok",
    "boek",
    "brief",
    "sleutel",
    "zwaard",
    "ring",
    "kaart",
    "lamp",
    "spiegel",
    "poort",
    "schip",
    "rivier",
    "bos",
    "stad",
  ];
  const found = [];
  for (const word of explicit) {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    if (pattern.test(normalized)) found.push(word);
  }
  return found.slice(0, limit);
}

function extractLocation(sentences) {
  const locationPattern = /(op|bij|in|onder|achter|voor|naast|naar)\s+(de|het|een)\s+([^.!?,;]{3,60})/i;
  const locationWords = /(brug|kamer|stad|bos|huis|poort|straat|rivier|zee|schip|school|kasteel|station|deur|kelder|zolder|plein|tuin|veld|berg|vallei|bridge|room|city|forest|house|gate|street|river|sea|ship|school|castle|station|cellar|garden|field|mountain|valley)/i;
  for (const sentence of sentences) {
    if (!locationWords.test(sentence)) continue;
    const match = sentence.match(locationPattern);
    if (match?.[3]) return truncate(`${match[1]} ${match[2]} ${match[3]}`.trim(), 220);
    return truncate(sentence, 220);
  }
  return "";
}

function inferMood(text) {
  const lower = normalizeText(text).toLowerCase();
  if (/(gevaar|bang|donker|dreig|vlucht|schaduw|storm|danger|afraid|dark|threat|shadow|storm)/.test(lower)) {
    return "tense and suspenseful";
  }
  if (/(warm|glimlach|veilig|zacht|licht|vriend|vertrouw|warm|smile|safe|soft|friend|trust)/.test(lower)) {
    return "warm but story-grounded";
  }
  if (/(mysterie|geheim|verborg|zilveren deur|kompas|mist|mystery|secret|hidden|silver door|compass|fog)/.test(lower)) {
    return "mysterious and expectant";
  }
  return "grounded narrative mood";
}

function buildMustShow({ charactersPresent, location, objects, moment }) {
  const items = [];
  if (charactersPresent.length) items.push(`the visible characters ${charactersPresent.join(" and ")}`);
  if (location) items.push(`the specific location: ${location}`);
  for (const object of objects.slice(0, 5)) items.push(object);
  const shortMoment = truncate(moment, 220);
  if (shortMoment) items.push(`the action from the selected text: ${shortMoment}`);
  return items.slice(0, 10);
}

function buildStoryLock(sceneBrief) {
  const brief = normalizeSceneBrief(sceneBrief);
  return [
    "Story lock:",
    brief.charactersPresent.length ? `show these characters, no substitutions: ${brief.charactersPresent.join(", ")}.` : "",
    brief.location ? `Use this location, not a generic backdrop: ${toVisualEnglish(brief.location)}.` : "",
    brief.mustShow.length ? `Must include: ${brief.mustShow.map(toVisualEnglish).join("; ")}.` : "",
    brief.forbidden.length ? `Avoid: ${brief.forbidden.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

function buildCoverLock(characters, sceneBrief) {
  const names = characters.map((character) => character.name).slice(0, 5);
  const brief = normalizeSceneBrief(sceneBrief);
  return [
    "Cover lock:",
    names.length ? `main cast: ${names.join(", ")}.` : "",
    brief.location ? `story location cue: ${toVisualEnglish(brief.location)}.` : "",
    brief.objects.length ? `recognizable motifs: ${brief.objects.map(toVisualEnglish).join(", ")}.` : "",
    "Do not replace the story with generic decorative art.",
  ].filter(Boolean).join(" ");
}

function collectCharacterDescriptions(text, style) {
  const normalized = normalizeText(text);
  const sentences = splitSentences(normalized);
  const counts = new Map();
  const matches = normalized.match(/\b[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s+[A-ZÀ-Ý][a-zà-ÿ]{2,})?\b/g) || [];

  for (const match of matches) {
    const name = match.trim();
    if (!isLikelyCharacterName(name)) continue;
    if (!hasCharacterEvidence(sentences, name)) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const stylePrompt = stylePromptSuffix(style);
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count], index) => {
      const description = describeFromSentences(sentences, name);
      return {
        id: `deepseek-character-${index + 1}-${slug(name)}`,
        name,
        role: "personage uit het verhaal",
        description,
        relationships: describeRelationships(sentences, name),
        prompt: [
          `Consistent character portrait of ${name}.`,
          description ? `Story-supported details: ${toVisualEnglish(description)}.` : "Use only neutral visual details; unknown traits stay understated.",
          "Expressive face, readable silhouette, portrait framing, suitable for a reusable book character sheet.",
          stylePrompt,
          "No readable text, no watermark.",
        ].join(" "),
        count,
      };
    });
}

function isLikelyCharacterName(name) {
  const trimmed = normalizeText(name).replace(/[“”"'.:,;!?()[\]{}]+$/g, "").replace(/^[“”"'.:,;!?()[\]{}]+/g, "");
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (/\d/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 2) return false;
  if (words.some(isBlockedNameToken)) return false;
  return words.every((word) => /[\p{L}]/u.test(word));
}

function isBlockedNameToken(value) {
  const token = String(value || "")
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .toLowerCase();
  return !token || NAME_FALSE_POSITIVES.has(token);
}

function hasCharacterEvidence(sentences, name) {
  const escaped = escapeRegExp(name);
  const namePattern = new RegExp(`\\b${escaped}\\b`, "i");
  const subjectActionPattern = new RegExp(
    `\\b${escaped}\\b\\s+(zei|vroeg|antwoordde|fluisterde|riep|dacht|voelde|keek|zag|liep|rende|wachtte|hielp|glimlachte|huilde|droeg|vond|opende|zocht|vertelde|beloofde|said|asked|answered|whispered|called|thought|felt|looked|saw|walked|ran|waited|helped|smiled|cried|wore|found|opened|searched|told|promised)\\b`,
    "i",
  );
  const humanContext = /\b(hij|zij|haar|hem|zijn|vriend|vriendin|vader|moeder|zoon|dochter|broer|zus|man|vrouw|meisje|jongen|kind|persoon|personage|he|she|her|him|his|friend|father|mother|son|daughter|brother|sister|man|woman|girl|boy|child|person|character)\b/i;
  const relevant = sentences.filter((sentence) => namePattern.test(sentence)).slice(0, 8);
  if (!relevant.length) return false;
  if (relevant.some((sentence) => subjectActionPattern.test(sentence))) return true;
  if (relevant.some((sentence) => humanContext.test(sentence))) return true;
  return relevant.length >= 3;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function describeFromSentences(sentences, name) {
  const lowerName = name.toLowerCase();
  const relevant = sentences
    .filter((sentence) => sentence.toLowerCase().includes(lowerName))
    .slice(0, 5)
    .join(" ");
  if (!relevant) return "onbekend uiterlijk; gebruik neutrale, consistente interpretatie";
  return relevant.length > 900 ? `${relevant.slice(0, 897).trim()}...` : relevant;
}

function describeRelationships(sentences, name) {
  const lowerName = name.toLowerCase();
  const otherNames = new Set();
  for (const sentence of sentences.filter((item) => item.toLowerCase().includes(lowerName)).slice(0, 8)) {
    const matches = sentence.match(/\b[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s+[A-ZÀ-Ý][a-zà-ÿ]{2,})?\b/g) || [];
    for (const match of matches) {
      const other = match.trim();
      if (other.toLowerCase() !== lowerName && isLikelyCharacterName(other)) otherNames.add(other);
    }
  }
  return otherNames.size ? `Komt in scenes voor met ${Array.from(otherNames).join(", ")}.` : "Relaties niet duidelijk uit tekst.";
}

function summarizeForUi(sentences, characters) {
  const intro = sentences.slice(0, 4).join(" ");
  const names = characters.map((character) => character.name).slice(0, 5).join(", ");
  const prefix = names ? `Verhaal met ${names}. ` : "";
  const summary = `${prefix}${intro || "Samenvatting niet afleidbaar uit de beschikbare tekst."}`;
  return summary.length > 1200 ? `${summary.slice(0, 1197).trim()}...` : summary;
}

function summarizeWorld(sentences) {
  const settingWords = /(stad|brug|bos|kamer|huis|kasteel|school|zee|schip|straat|dorp|planeet|station|deur|licht|nacht|ochtend|winter|zomer|city|bridge|forest|room|house|castle|school|sea|ship|street|village|planet|station|door|light|night|morning)/i;
  const settingSentences = sentences.filter((sentence) => settingWords.test(sentence)).slice(0, 4);
  const world = settingSentences.join(" ") || sentences.slice(0, 3).join(" ");
  return world.length > 1000 ? `${world.slice(0, 997).trim()}...` : world || "Wereld en sfeer niet duidelijk uit tekst.";
}

function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
}

function truncate(value, maxLength) {
  const text = normalizeText(value);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...` : text;
}

function toVisualEnglish(text) {
  const replacements = [
    [/\bHoofdstuk\b/gi, "Chapter"],
    [/\been\b/gi, "a"],
    [/\bde\b/gi, "the"],
    [/\bhet\b/gi, "the"],
    [/\bzij\b/gi, "they"],
    [/\bvol\b/gi, "filled with"],
    [/\bvonden\b/gi, "found"],
    [/\bvertrouwde\b/gi, "trusted"],
    [/\bmaar\b/gi, "but"],
    [/\bklein\b/gi, "small"],
    [/\bkompas\b/gi, "compass"],
    [/\blang\b/gi, "tall"],
    [/\bsamen\b/gi, "together"],
    [/\brode?\b/gi, "red"],
    [/\bblauwe?\b/gi, "blue"],
    [/\bzilveren?\b/gi, "silver"],
    [/\bgouden?\b/gi, "golden"],
    [/\bdonker haar\b/gi, "dark hair"],
    [/\blichte? haar\b/gi, "light hair"],
    [/\bjas\b/gi, "coat"],
    [/\bjurk\b/gi, "dress"],
    [/\btas\b/gi, "bag"],
    [/\bleren\b/gi, "leather"],
    [/\boude?\b/gi, "old"],
    [/\bbrug\b/gi, "bridge"],
    [/\bdeur\b/gi, "door"],
    [/\bstad\b/gi, "city"],
    [/\bkamer\b/gi, "room"],
    [/\blicht\b/gi, "light"],
    [/\bdroeg\b/gi, "wearing"],
    [/\bliep\b/gi, "walking"],
    [/\bzocht(en)?\b/gi, "searching"],
    [/\bverborg\b/gi, "hiding"],
    [/\bonder\b/gi, "under"],
    [/\bmet\b/gi, "with"],
    [/\bnaar\b/gi, "toward"],
    [/\ben\b/gi, "and"],
  ];
  return replacements.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), normalizeText(text));
}

function stylePromptSuffix(style) {
  const styles = {
    storybook:
      "Literal narrative book illustration, concrete story scene, consistent characters, grounded setting, readable composition, not abstract, not nostalgic Dutch village painting.",
    watercolor:
      "Controlled watercolor book illustration, concrete story details, consistent characters, restrained atmosphere, no loose abstract washes, no unrelated scenery.",
    graphic: "Polished graphic novel panel, exact story beat, strong silhouettes, dynamic framing, clean linework, no generic concept art.",
    cinematic: "Cinematic key art, exact story moment, dramatic but tasteful lighting, depth of field, emotionally grounded scene, no unrelated fantasy poster.",
  };
  return styles[style] || styles.storybook;
}

function isUsefulText(value, minLength = 12) {
  const text = normalizeText(value);
  if (text.length < minLength) return false;
  if (looksLikePlaceholder(text)) return false;
  return true;
}

function isUsefulPrompt(value) {
  const text = normalizeText(value);
  if (!isUsefulText(text, 36)) return false;
  const lower = text.toLowerCase();
  if (lower.includes("portraitprompt") || lower.includes("chapterprompt") || lower.includes("coverprompt")) return false;
  if (looksMostlyDutch(text)) return false;
  return true;
}

function looksLikePlaceholder(value) {
  const lower = normalizeText(value).toLowerCase();
  const placeholders = new Set([
    "kort",
    "tijd/periode/omgeving/sfeer",
    "regel 1",
    "regel 2",
    "naam",
    "rol",
    "relaties",
    "english portrait prompt",
  ]);
  return placeholders.has(lower) || lower.includes("json schema") || lower.includes("antwoord uitsluitend");
}

function looksMostlyDutch(text) {
  const matches = text.match(/\b(de|het|een|en|naar|met|droeg|had|was|waren|onder|oude|verhaal|hoofdstuk|vertrouwde|verborg)\b/gi);
  return (matches || []).length >= 3;
}

function normalizeNameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function slug(value) {
  return String(value || "character").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "character";
}

function injectComfyWorkflow(workflow, prompt, negativePrompt, seed) {
  const clone = structuredClone(workflow);
  const injectedNodes = [];

  for (const [id, node] of Object.entries(clone)) {
    if (!node || typeof node !== "object" || !node.inputs) continue;
    const classType = String(node.class_type || "").toLowerCase();
    const title = String(node._meta?.title || "").toLowerCase();

    if (classType.includes("cliptextencode") && typeof node.inputs.text === "string") {
      const isNegative = title.includes("negative") || node.inputs.text.toLowerCase().includes("negative");
      node.inputs.text = isNegative ? negativePrompt : prompt;
      injectedNodes.push(`${id}:text:${isNegative ? "negative" : "positive"}`);
    }

    if (typeof node.inputs.seed === "number") {
      node.inputs.seed = seed;
      injectedNodes.push(`${id}:seed`);
    }
  }

  return { workflow: clone, injectedNodes };
}

function collectComfyImages(entry) {
  const images = [];
  const outputs = entry?.outputs && typeof entry.outputs === "object" ? entry.outputs : {};
  for (const output of Object.values(outputs)) {
    if (!output || typeof output !== "object" || !Array.isArray(output.images)) continue;
    for (const image of output.images) {
      if (image?.filename) {
        images.push({
          filename: String(image.filename),
          subfolder: String(image.subfolder || ""),
          type: String(image.type || "output"),
        });
      }
    }
  }
  return images;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function sendJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.BOOKREADER_CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function loadProjectEnv(projectRoot) {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(projectRoot, fileName);
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "").trim();
      }
      process.env[match[1]] = value;
    }
  }
}

function writeProjectEnvValue(key, value) {
  const filePath = join(PROJECT_ROOT, ".env.local");
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const nextLines = [];
  let replaced = false;

  for (const line of existing) {
    if (line.trim() === "") continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1] === key) {
      replaced = true;
      if (value) nextLines.push(`${key}=${value}`);
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced && value) nextLines.push(`${key}=${value}`);
  const output = nextLines.length ? `${nextLines.join("\n")}\n` : "";
  writeFileSync(filePath, output, { encoding: "utf8", mode: 0o600 });
}

function parseDataImage(value) {
  const match = String(value || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error("Ongeldige data-url voor afbeelding.");
  return {
    contentType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2].replace(/\s+/g, ""), "base64"),
  };
}

function imageExtension(contentType) {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "png";
}

function contentTypeForImage(fileName) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

function safeAudioCount() {
  try {
    return readdirSync(AUDIO_DIR).filter((item) => item.endsWith(".wav")).length;
  } catch {
    return 0;
  }
}

function safeImageCount() {
  try {
    return readdirSync(IMAGES_DIR).filter((item) => /\.(png|jpe?g|webp|gif)$/i.test(item)).length;
  } catch {
    return 0;
  }
}
