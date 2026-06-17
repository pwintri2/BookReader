import type { BookProject } from "./bookProject";

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
  film?: {
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
    sqliteDb?: string;
    sqliteAvailable?: boolean;
    audioFiles: number;
    imageFiles?: number;
  };
};

export type AiProvider = "local" | "api";

export type ModelOption = {
  id: string;
  label: string;
  size?: number;
  modifiedAt?: string;
};

export type ModelCatalogResponse = {
  ok: boolean;
  ollama: {
    url: string;
    configured: boolean;
    models: ModelOption[];
    error?: string;
  };
  deepseekApi: {
    configured: boolean;
    baseUrl: string;
    models: ModelOption[];
    error?: string;
  };
  defaults: {
    local: {
      fastContext: string;
      deepContext: string;
      story: string;
      deepStory: string;
    };
    api: {
      context: string;
      story: string;
    };
  };
};

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
  model?: string;
  narrativePreset?: "balanced" | "rich_intro";
  referenceTitle?: string;
  referenceText?: string;
  sequelOfTitle?: string;
  sequelOfText?: string;
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

export type FilmPlanScene = {
  id: string;
  title: string;
  durationSeconds: number;
  sourceRange: string;
  purpose: string;
  location: string;
  timeOfDay: string;
  characters: string[];
  action: string;
  dialogue: string[];
  voiceOver: string;
  camera: string;
  visualPrompt: string;
  audioPrompt: string;
  transition: string;
};

export type FilmPlan = {
  title: string;
  logline: string;
  targetMinutes: number;
  totalDurationSeconds: number;
  format: string;
  visualStyle: string;
  continuityBible: {
    summary: string;
    characters: string[];
    locations: string[];
    visualRules: string[];
    audioRules: string[];
  };
  scenes: FilmPlanScene[];
};

export type FilmPlanRequest = {
  title: string;
  rawText: string;
  targetMinutes: number;
  sceneCount: number;
  style?: string;
  mode?: "fast" | "deep";
  provider?: AiProvider;
  model?: string;
};

export type FilmPlanResponse = {
  ok: boolean;
  provider: string;
  model: string;
  mode: "fast" | "deep";
  fallbackUsed?: boolean;
  warning?: string;
  plan: FilmPlan;
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
  model?: string;
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

export type ProjectFileSummary = {
  id: string;
  title: string;
  savedAt: string;
  wordCount: number;
  chapterCount: number;
  preview: string;
  fileName: string;
  filePath: string;
};

export type ProjectFileListResponse = {
  ok: boolean;
  scannedDirs: string[];
  projects: ProjectFileSummary[];
};

export type ProjectFileOpenResponse = {
  ok: boolean;
  fileName: string;
  filePath: string;
  project: BookProject;
};

export type LibraryProjectSummary = {
  id: string;
  title: string;
  savedAt: string;
  wordCount: number;
  chapterCount: number;
  preview: string;
  fileName: string;
  sourcePath: string;
  updatedAt: string;
  categories: LibraryCategory[];
  categoryIds: string[];
};

export type LibraryCategory = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectCount: number;
};

export type LibraryListResponse = {
  ok: boolean;
  dbPath: string;
  projects: LibraryProjectSummary[];
};

export type LibraryOpenResponse = {
  ok: boolean;
  project: BookProject;
  summary: LibraryProjectSummary;
};

export type LibrarySaveResponse = {
  ok: boolean;
  dbPath: string;
  project: LibraryProjectSummary;
};

export type LibraryImportResponse = {
  ok: boolean;
  dbPath: string;
  imported: number;
  skipped: number;
  scannedDirs: string[];
  projects: LibraryProjectSummary[];
};

export type LibraryCategoryListResponse = {
  ok: boolean;
  dbPath: string;
  categories: LibraryCategory[];
};

export type LibraryCategoryCreateResponse = {
  ok: boolean;
  dbPath: string;
  category: LibraryCategory;
};

export type LibraryCategoryAssignResponse = {
  ok: boolean;
  dbPath: string;
  project: LibraryProjectSummary;
  categories: LibraryCategory[];
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

export async function getModelCatalog(apiBase: string): Promise<ModelCatalogResponse> {
  return requestJson<ModelCatalogResponse>(apiBase, "/api/models");
}

export async function listProjectFiles(apiBase: string): Promise<ProjectFileListResponse> {
  return requestJson<ProjectFileListResponse>(apiBase, "/api/projects/list");
}

export async function openProjectFile(apiBase: string, id: string): Promise<ProjectFileOpenResponse> {
  return requestJson<ProjectFileOpenResponse>(apiBase, `/api/projects/open/${encodeURIComponent(id)}`);
}

export async function listLibraryProjects(apiBase: string): Promise<LibraryListResponse> {
  return requestJson<LibraryListResponse>(apiBase, "/api/library/list");
}

export async function openLibraryProject(apiBase: string, id: string): Promise<LibraryOpenResponse> {
  return requestJson<LibraryOpenResponse>(apiBase, `/api/library/open/${encodeURIComponent(id)}`);
}

export async function saveLibraryProject(apiBase: string, project: BookProject, categoryIds: string[] = []): Promise<LibrarySaveResponse> {
  return requestJson<LibrarySaveResponse>(apiBase, "/api/library/save", {
    method: "POST",
    body: JSON.stringify({ project, categoryIds }),
  });
}

export async function importJsonProjectsToLibrary(apiBase: string): Promise<LibraryImportResponse> {
  return requestJson<LibraryImportResponse>(apiBase, "/api/library/import-json", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listLibraryCategories(apiBase: string): Promise<LibraryCategoryListResponse> {
  return requestJson<LibraryCategoryListResponse>(apiBase, "/api/library/categories");
}

export async function createLibraryCategory(apiBase: string, name: string): Promise<LibraryCategoryCreateResponse> {
  return requestJson<LibraryCategoryCreateResponse>(apiBase, "/api/library/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function assignLibraryCategory(apiBase: string, projectId: string, categoryId: string): Promise<LibraryCategoryAssignResponse> {
  return requestJson<LibraryCategoryAssignResponse>(apiBase, "/api/library/categories/assign", {
    method: "POST",
    body: JSON.stringify({ projectId, categoryId }),
  });
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

export async function planFilm(apiBase: string, payload: FilmPlanRequest): Promise<FilmPlanResponse> {
  return requestJson<FilmPlanResponse>(apiBase, "/api/film/plan", {
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
  if (!base) {
    throw new Error("Serverlaag niet ingesteld. Gebruik de BookReader launcher of vul de API-basis in, bijvoorbeeld http://127.0.0.1:1433.");
  }

  const url = `${base}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    const details = error instanceof Error && error.message ? ` Details: ${error.message}` : "";
    throw new Error(`Serverlaag niet bereikbaar via ${base}. Controleer of de BookReader API draait.${details}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : `API request failed: HTTP ${response.status}`;
    throw Object.assign(new Error(message), { payload, status: response.status });
  }
  return payload as T;
}
