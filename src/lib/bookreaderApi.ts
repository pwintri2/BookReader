export type ApiHealth = {
  ok: boolean;
  tts?: {
    provider: string;
    configured: boolean;
    maxChars: number;
    binary?: string;
    voicesDir?: string;
    activeModel?: string;
    voices?: Array<{
      id: string;
      label: string;
      path: string;
      configPath?: string;
    }>;
  };
  comfy?: {
    url: string;
    workflowConfigured: boolean;
  };
  context?: {
    provider: string;
    url: string;
    model: string;
    deepModel?: string;
    maxChars: number;
    timeoutMs?: number;
    deepTimeoutMs?: number;
  };
  story?: {
    provider: string;
    model: string;
    deepModel?: string;
    timeoutMs?: number;
    deepTimeoutMs?: number;
  };
  deepseekApi?: {
    configured: boolean;
    baseUrl: string;
    contextModel: string;
    storyModel: string;
  };
  storage?: {
    outputDir: string;
    audioFiles: number;
    imageFiles?: number;
  };
};

export type AiProvider = "local" | "api";

export type StoryGenerateRequest = {
  prompt: string;
  pages: number;
  wordsPerPage?: number;
  genre?: string;
  audience?: string;
  tone?: string;
  language?: string;
  mode?: "fast" | "deep";
  provider?: AiProvider;
  referenceTitle?: string;
  referenceText?: string;
};

export type StoryGenerateResponse = {
  ok: boolean;
  provider: string;
  model: string;
  mode: "fast" | "deep";
  title: string;
  story: string;
  requestedPages: number;
  requestedWords: number;
  language?: string;
  wordCount: number;
};

export type TtsRequest = {
  text: string;
  voice?: string;
  style?: string;
};

export type TtsResponse = {
  ok: boolean;
  audioUrl?: string;
  provider?: string;
  chars?: number;
  error?: string;
  message?: string;
  maxChars?: number;
};

export type IllustrationRequest = {
  prompt: string;
  negativePrompt: string;
  seed?: number;
};

export type IllustrationJob = {
  ok: boolean;
  promptId?: string;
  status?: string;
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  error?: string;
  message?: string;
};

export type IllustrationImage = {
  filename: string;
  subfolder: string;
  type: string;
  url: string;
};

export type IllustrationStatus = {
  ok: boolean;
  promptId: string;
  complete: boolean;
  images: IllustrationImage[];
  error?: string;
};

export type CachedImageResponse = {
  ok: boolean;
  imageUrl: string;
  filePath?: string;
  bytes?: number;
  contentType?: string;
};

export type ContextAnalysis = {
  storySummary: string;
  world: string;
  sceneBrief?: {
    moment: string;
    location: string;
    charactersPresent: string[];
    mustShow: string[];
    objects: string[];
    mood: string;
    forbidden: string[];
  };
  visualContinuity: string[];
  characters: Array<{
    id: string;
    name: string;
    role: string;
    description: string;
    relationships: string;
    prompt: string;
    count: number;
  }>;
  chapterPrompt: string;
  coverPrompt: string;
};

export type ContextAnalyzeRequest = {
  title: string;
  rawText: string;
  chapterTitle?: string;
  chapterText?: string;
  style?: string;
  mode?: "fast" | "deep";
  provider?: AiProvider;
};

export type ContextAnalyzeResponse = {
  ok: boolean;
  provider: string;
  model: string;
  mode?: "fast" | "deep";
  fallbackUsed?: boolean;
  fallbackReasons?: string[];
  warning?: string;
  analysis: ContextAnalysis;
};

export type DeepSeekKeySaveResponse = {
  ok: boolean;
  configured: boolean;
  message?: string;
};

export function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function mediaUrl(apiBase: string, path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const base = normalizeApiBase(apiBase);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function getHealth(apiBase: string): Promise<ApiHealth> {
  return requestJson<ApiHealth>(apiBase, "/api/health");
}

export async function synthesizeSpeech(apiBase: string, payload: TtsRequest): Promise<TtsResponse> {
  return requestJson<TtsResponse>(apiBase, "/api/tts/synthesize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateIllustration(apiBase: string, payload: IllustrationRequest): Promise<IllustrationJob> {
  return requestJson<IllustrationJob>(apiBase, "/api/illustrations/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getIllustrationStatus(apiBase: string, promptId: string): Promise<IllustrationStatus> {
  return requestJson<IllustrationStatus>(apiBase, `/api/illustrations/status/${encodeURIComponent(promptId)}`);
}

export async function analyzeContext(apiBase: string, payload: ContextAnalyzeRequest): Promise<ContextAnalyzeResponse> {
  return requestJson<ContextAnalyzeResponse>(apiBase, "/api/context/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateStory(apiBase: string, payload: StoryGenerateRequest): Promise<StoryGenerateResponse> {
  return requestJson<StoryGenerateResponse>(apiBase, "/api/story/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cacheImage(apiBase: string, imageUrl: string, kind: string, label?: string): Promise<CachedImageResponse> {
  return requestJson<CachedImageResponse>(apiBase, "/api/media/cache-image", {
    method: "POST",
    body: JSON.stringify({ imageUrl, kind, label }),
  });
}

export async function saveDeepSeekApiKey(apiBase: string, apiKey: string, clear = false): Promise<DeepSeekKeySaveResponse> {
  return requestJson<DeepSeekKeySaveResponse>(apiBase, "/api/settings/deepseek-key", {
    method: "POST",
    body: JSON.stringify({ apiKey, clear }),
  });
}

async function requestJson<T>(apiBase: string, path: string, init: RequestInit = {}): Promise<T> {
  const base = normalizeApiBase(apiBase);
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : `API request failed: HTTP ${response.status}`;
    throw Object.assign(new Error(message), { payload, status: response.status });
  }
  return payload as T;
}
