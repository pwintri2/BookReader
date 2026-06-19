import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BookImage,
  Clipboard,
  Clock,
  Film,
  FileText,
  FolderOpen,
  Image,
  ListTree,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Save,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Upload,
  Users,
  Volume2,
  Wand2,
} from "lucide-react";
import {
  AiProvider,
  ApiHealth,
  analyzeContext,
  BookMakerMessage,
  cacheImage,
  ContextAnalysis,
  continueBookMakerInterview,
  FilmPlan,
  assignLibraryCategory,
  deleteLibraryProject,
  finalizeBookMakerPrompt,
  generateIllustration,
  generateStory,
  getHealth,
  getIllustrationStatus,
  getModelCatalog,
  createLibraryCategory,
  importJsonProjectsToLibrary,
  ImageProvider,
  LibraryCategory,
  LibraryProjectSummary,
  listLibraryCategories,
  listLibraryProjects,
  listProjectFiles,
  mediaUrl,
  ModelCatalogResponse,
  ModelOption,
  openLibraryProject,
  openProjectFile,
  planFilm,
  ProjectFileSummary,
  rechapterStory,
  saveDeepSeekApiKey,
  saveLibraryProject,
  saveXaiApiKey,
  synthesizeSpeech,
} from "./lib/bookreaderApi";
import {
  BookProject,
  downloadBookProject,
  imageToDataUrl,
  isBookProject,
  SavedBookCover,
  SavedChapterIllustration,
  SavedCharacterPortrait,
  StoryPromptMeta,
} from "./lib/bookProject";
import { Chapter, ChapterStats, MAX_WORDS, splitIntoChapters } from "./lib/chapters";
import { parseFile } from "./lib/documentParser";
import {
  buildCoverPrompt,
  buildIllustrationPrompt,
  CharacterPortrait,
  detectCharacterPortraits,
  ILLUSTRATION_STYLES,
  IllustrationStyleId,
} from "./lib/storyInsights";

type SpeechState = "idle" | "speaking" | "paused";
type TtsProvider = "browser" | "server";
type WorkspaceTab = "reader" | "bookMaker";
type VoiceStyleId = "neutral" | "story" | "lively" | "calm";
type StoryLanguage = "Auto" | "Nederlands" | "English" | "Deutsch" | "Français" | "Español";
type StoryNarrativePreset = "balanced" | "rich_intro";
type ChapterIllustrationMap = Record<string, SavedChapterIllustration>;
type CharacterPortraitRecord = CharacterPortrait & { imageUrl?: string };
type ReferenceStoryProject = {
  title: string;
  rawText: string;
};
type SavedStoryEntry = {
  id: string;
  title: string;
  savedAt: string;
  wordCount: number;
  chapterCount: number;
  preview: string;
  project: BookProject;
};

type VoiceStyle = {
  id: VoiceStyleId;
  label: string;
  rate: number;
  pitch: number;
  chunkSize: number;
  description: string;
};

const WORD_LIMIT_LABEL = MAX_WORDS.toLocaleString("nl-NL");
const DEFAULT_API_BASE = defaultApiBase();
const SAVED_STORIES_KEY = "bookreader.savedStories.v1";
const MAX_SAVED_STORIES = 30;
const DOCUMENT_ACCEPT = [
  ".txt",
  ".md",
  ".docx",
  ".pdf",
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");
const PROJECT_ACCEPT = `${DOCUMENT_ACCEPT},.bookreader.json,application/json`;
const DEFAULT_NEGATIVE_PROMPT = [
  "low quality",
  "blurry",
  "readable text",
  "watermark",
  "logo",
  "distorted hands",
  "abstract art",
  "modern art",
  "surreal unrelated composition",
  "Jan Steen style",
  "Dutch Golden Age painting",
  "old master oil painting",
  "tavern scene",
  "caricature faces",
  "Anton Pieck style",
  "Anton Piek style",
  "nostalgic Dutch village painting",
  "generic fantasy village",
  "unrelated scenery",
  "extra main characters",
  "missing main character",
  "wrong character identity",
  "deformed face",
  "melted face",
  "mutated eyes",
  "bad anatomy",
].join(", ");

const VOICE_STYLES: VoiceStyle[] = [
  {
    id: "neutral",
    label: "Neutraal",
    rate: 1,
    pitch: 1,
    chunkSize: 1200,
    description: "Normale cadans voor zakelijke tekst en langere stukken.",
  },
  {
    id: "story",
    label: "Warm verhaal",
    rate: 0.92,
    pitch: 1.08,
    chunkSize: 850,
    description: "Rustiger tempo, iets meer warmte en kortere zinnen per spreekbeurt.",
  },
  {
    id: "lively",
    label: "Levendig",
    rate: 1.08,
    pitch: 1.16,
    chunkSize: 650,
    description: "Energieker voorlezen met kortere spreekbeurten en meer expressie.",
  },
  {
    id: "calm",
    label: "Rustig",
    rate: 0.86,
    pitch: 0.94,
    chunkSize: 1000,
    description: "Langzamer en lager voor ontspannen luisteren.",
  },
];

const sampleText = [
  "Hoofdstuk 1",
  "BookReader is klaar voor lange teksten. Plak tekst, of importeer een bestand, en de hoofdstukken verschijnen direct.",
  "",
  "Hoofdstuk 2",
  "Per hoofdstuk kan een lokale stem worden gekozen. De app bewaart geen tekst buiten deze sessie.",
].join("\n");

const INITIAL_TALLE_MESSAGE: BookMakerMessage = {
  role: "talle",
  content:
    "Lieve John, kom, laten we niet meteen naar de betekenis springen. Neem me eerst mee naar het eerste beeld. Waar zijn we, en wat zie jij als het begin van deze reis?",
};

export function App() {
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("reader");
  const [documentTitle, setDocumentTitle] = useState("Nieuw document");
  const [rawText, setRawText] = useState(sampleText);
  const [chapters, setChapters] = useState<Chapter[]>(() => splitIntoChapters(sampleText).chapters);
  const [stats, setStats] = useState<ChapterStats>(() => splitIntoChapters(sampleText).stats);
  const [selectedChapterId, setSelectedChapterId] = useState(chapters[0]?.id || "");
  const [activeChapterId, setActiveChapterId] = useState("");
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>("browser");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [serverVoiceId, setServerVoiceId] = useState("");
  const [voiceStyleId, setVoiceStyleId] = useState<VoiceStyleId>("neutral");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [apiStatus, setApiStatus] = useState("niet gecontroleerd");
  const [apiBusy, setApiBusy] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResponse | null>(null);
  const [modelCatalogStatus, setModelCatalogStatus] = useState("modellen nog niet geladen");
  const [modelCatalogBusy, setModelCatalogBusy] = useState(false);
  const [selectedLocalModel, setSelectedLocalModel] = useState("");
  const [selectedApiModel, setSelectedApiModel] = useState("");
  const [selectedGrokModel, setSelectedGrokModel] = useState("");
  const [imageProvider, setImageProvider] = useState<ImageProvider>("comfy");
  const [selectedGrokImageModel, setSelectedGrokImageModel] = useState("");
  const [deepSeekApiKeyInput, setDeepSeekApiKeyInput] = useState("");
  const [deepSeekKeyBusy, setDeepSeekKeyBusy] = useState(false);
  const [xaiApiKeyInput, setXaiApiKeyInput] = useState("");
  const [xaiKeyBusy, setXaiKeyBusy] = useState(false);
  const [illustrationStyleId, setIllustrationStyleId] = useState<IllustrationStyleId>("storybook");
  const [illustrationPrompt, setIllustrationPrompt] = useState("");
  const [illustrationStatus, setIllustrationStatus] = useState("geen illustratie");
  const [illustrationUrl, setIllustrationUrl] = useState("");
  const [illustrationJobId, setIllustrationJobId] = useState("");
  const [illustrationBusy, setIllustrationBusy] = useState(false);
  const [chapterIllustrations, setChapterIllustrations] = useState<ChapterIllustrationMap>({});
  const [bookCover, setBookCover] = useState<SavedBookCover>(() => ({
    prompt: buildCoverPrompt("Nieuw document", splitIntoChapters(sampleText).chapters, "storybook"),
  }));
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverStatus, setCoverStatus] = useState("klaar voor cover");
  const [characterPortraits, setCharacterPortraits] = useState<CharacterPortraitRecord[]>([]);
  const [portraitBusyId, setPortraitBusyId] = useState("");
  const [contextAnalysis, setContextAnalysis] = useState<ContextAnalysis | null>(null);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextStatus, setContextStatus] = useState("nog niet geanalyseerd");
  const initialStoryPromptMeta = useMemo(() => {
    const characters = "Luna / 17 / girl";
    const plot = "Luna finds a silver door under an old bridge. The door only opens in moonlight and leads to a hidden place connected to her family history.";
    const mainEvent = "Focus on the moment Luna opens the silver door for the first time and chooses whether to step through.";
    return buildGuidedStoryPrompt(characters, plot, mainEvent);
  }, []);
  const [storyPrompt, setStoryPrompt] = useState(initialStoryPromptMeta.prompt);
  const [storyPromptMeta, setStoryPromptMeta] = useState<StoryPromptMeta>(initialStoryPromptMeta);
  const [promptBuilderOpen, setPromptBuilderOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState(initialStoryPromptMeta.prompt);
  const [promptCharacters, setPromptCharacters] = useState(initialStoryPromptMeta.characters);
  const [promptPlot, setPromptPlot] = useState(initialStoryPromptMeta.plot);
  const [promptMainEvent, setPromptMainEvent] = useState(initialStoryPromptMeta.mainEvent);
  const [storyPages, setStoryPages] = useState(4);
  const [storyWordsPerPage, setStoryWordsPerPage] = useState(550);
  const [storyLanguage, setStoryLanguage] = useState<StoryLanguage>("Auto");
  const [storyMode, setStoryMode] = useState<"fast" | "deep">("deep");
  const [storyNarrativePreset, setStoryNarrativePreset] = useState<StoryNarrativePreset>("balanced");
  const [aiProvider, setAiProvider] = useState<AiProvider>("local");
  const [chapterTargetCount, setChapterTargetCount] = useState(8);
  const [chapteringBusy, setChapteringBusy] = useState(false);
  const [chapteringStatus, setChapteringStatus] = useState("AI-hoofdstukken klaar");
  const [storyGenre, setStoryGenre] = useState("avontuurlijk mysterie");
  const [storyTone, setStoryTone] = useState("beeldend, warm en spannend");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [referenceStatus, setReferenceStatus] = useState("geen referentie");
  const [referenceStoryIds, setReferenceStoryIds] = useState<string[]>([]);
  const [referenceStoryProjects, setReferenceStoryProjects] = useState<Record<string, ReferenceStoryProject>>({});
  const [sequelSourceId, setSequelSourceId] = useState("");
  const [sequelSourceTitle, setSequelSourceTitle] = useState("");
  const [sequelSourceText, setSequelSourceText] = useState("");
  const [sequelSourceCategoryIds, setSequelSourceCategoryIds] = useState<string[]>([]);
  const [sequelStatus, setSequelStatus] = useState("geen vervolgbron");
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyStatus, setStoryStatus] = useState("DeepSeek chatmodel schrijft betere verhalen dan R1");
  const [filmTargetMinutes, setFilmTargetMinutes] = useState(7);
  const [filmSceneCount, setFilmSceneCount] = useState(12);
  const [filmMode, setFilmMode] = useState<"fast" | "deep">("deep");
  const [filmPlan, setFilmPlan] = useState<FilmPlan | null>(null);
  const [filmBusy, setFilmBusy] = useState(false);
  const [filmStatus, setFilmStatus] = useState("klaar voor adaptatie");
  const [assetStorageStatus, setAssetStorageStatus] = useState("beeldenmap: /home/pwintri2/BookReader/out/bookreader/images");
  const [projectBusy, setProjectBusy] = useState(false);
  const [currentLibraryProjectId, setCurrentLibraryProjectId] = useState("");
  const [savedStories, setSavedStories] = useState<SavedStoryEntry[]>([]);
  const [libraryStories, setLibraryStories] = useState<LibraryProjectSummary[]>([]);
  const [libraryCategories, setLibraryCategories] = useState<LibraryCategory[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState("SQL-bibliotheek nog niet geladen");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [assignCategoryId, setAssignCategoryId] = useState("");
  const [draggedLibraryStoryId, setDraggedLibraryStoryId] = useState("");
  const [projectFiles, setProjectFiles] = useState<ProjectFileSummary[]>([]);
  const [projectScanBusy, setProjectScanBusy] = useState(false);
  const [projectScanStatus, setProjectScanStatus] = useState("JSON-bestanden nog niet gescand");
  const [bookMakerMessages, setBookMakerMessages] = useState<BookMakerMessage[]>([INITIAL_TALLE_MESSAGE]);
  const [bookMakerInput, setBookMakerInput] = useState("");
  const [bookMakerBusy, setBookMakerBusy] = useState(false);
  const [bookMakerStatus, setBookMakerStatus] = useState("Talle wacht op de eerste scène.");
  const [bookMakerPromptPreview, setBookMakerPromptPreview] = useState("");
  const [query, setQuery] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [notice, setNotice] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<string[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) || chapters[0];
  const filteredChapters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((chapter) => `${chapter.title} ${chapter.text}`.toLowerCase().includes(q));
  }, [chapters, query]);
  const libraryStoryKeys = useMemo(() => new Set(libraryStories.map((entry) => storyIdentityKey(entry.title, entry.savedAt))), [libraryStories]);
  const localStoryEntries = useMemo(
    () => savedStories.filter((entry) => !libraryStoryKeys.has(storyIdentityKey(entry.title, entry.savedAt))),
    [libraryStoryKeys, savedStories],
  );
  const scannedStoryFiles = useMemo(() => {
    const knownKeys = new Set([
      ...savedStories.map((entry) => storyIdentityKey(entry.title, entry.savedAt)),
      ...libraryStories.map((entry) => storyIdentityKey(entry.title, entry.savedAt)),
    ]);
    return projectFiles.filter((entry) => !knownKeys.has(storyIdentityKey(entry.title, entry.savedAt)));
  }, [libraryStories, projectFiles, savedStories]);
  const visibleLibraryStories = useMemo(
    () => (selectedCategoryId ? libraryStories.filter((entry) => entry.categoryIds.includes(selectedCategoryId)) : libraryStories),
    [libraryStories, selectedCategoryId],
  );
  const activeStoryCategoryNames = useMemo(() => {
    const active = libraryStories.find((entry) => entry.id === currentLibraryProjectId);
    return active?.categories.map((category) => category.name).join(", ") || "";
  }, [currentLibraryProjectId, libraryStories]);

  const selectedVoice = voices.find((voice) => voice.voiceURI === voiceURI) || voices[0];
  const selectedVoiceStyle = VOICE_STYLES.find((style) => style.id === voiceStyleId) || VOICE_STYLES[0];
  const apiOnline = apiHealth?.ok === true;
  const normalizedAiProvider = normalizeAiProvider(aiProvider);
  const localModelOptions = useMemo(
    () => withSelectedModel(modelCatalog?.ollama.models || [], selectedLocalModel),
    [modelCatalog?.ollama.models, selectedLocalModel],
  );
  const deepseekModelOptions = useMemo(
    () => withSelectedModel(modelCatalog?.deepseekApi.models || [], selectedApiModel),
    [modelCatalog?.deepseekApi.models, selectedApiModel],
  );
  const grokModelOptions = useMemo(
    () => withSelectedModel(modelCatalog?.xaiApi.models || [], selectedGrokModel),
    [modelCatalog?.xaiApi.models, selectedGrokModel],
  );
  const grokImageModelOptions = useMemo(
    () => withSelectedModel(modelCatalog?.xaiImageApi.models || [], selectedGrokImageModel),
    [modelCatalog?.xaiImageApi.models, selectedGrokImageModel],
  );
  const activeModelOptions =
    normalizedAiProvider === "deepseek" ? deepseekModelOptions : normalizedAiProvider === "grok" ? grokModelOptions : localModelOptions;
  const selectedAiModel =
    normalizedAiProvider === "deepseek" ? selectedApiModel : normalizedAiProvider === "grok" ? selectedGrokModel : selectedLocalModel;
  const activeModelLabel = modelOptionLabel(activeModelOptions, selectedAiModel) || selectedAiModel || "standaardmodel";

  useEffect(() => {
    const loadVoices = () => {
      const nextVoices = window.speechSynthesis?.getVoices?.() || [];
      setVoices(nextVoices);
      if (!voiceURI && nextVoices.length) {
        const dutch = nextVoices.find((voice) => voice.lang.toLowerCase().startsWith("nl"));
        setVoiceURI((dutch || nextVoices[0]).voiceURI);
      }
    };

    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () => {
      stopSpeech();
      window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
    };
  }, []);

  useEffect(() => {
    if (!selectedChapter) {
      setIllustrationPrompt("");
      setIllustrationUrl("");
      setIllustrationJobId("");
      return;
    }
    const savedIllustration = chapterIllustrations[selectedChapter.id];
    setIllustrationPrompt(savedIllustration?.prompt || buildIllustrationPrompt(documentTitle, selectedChapter, illustrationStyleId));
    setIllustrationUrl(savedIllustration?.imageUrl || "");
    setIllustrationJobId(savedIllustration?.jobId || "");
    setIllustrationStatus("klaar voor ComfyUI");
  }, [chapterIllustrations, documentTitle, illustrationStyleId, selectedChapter?.id]);

  useEffect(() => {
    setBookCover((previous) => ({
      ...previous,
      prompt: previous.imageUrl ? previous.prompt : buildCoverPrompt(documentTitle, chapters, illustrationStyleId),
    }));
  }, [chapters, documentTitle, illustrationStyleId]);

  useEffect(() => {
    void refreshApiHealth(false);
    void refreshModelCatalog(false);
  }, []);

  useEffect(() => {
    setSavedStories(readSavedStories());
  }, []);

  useEffect(() => {
    void refreshProjectFiles(false);
  }, []);

  useEffect(() => {
    void refreshLibrary(false);
    void refreshCategories(false);
  }, []);

  function processText(title: string, text: string) {
    const result = splitIntoChapters(text);
    setCurrentLibraryProjectId("");
    setDocumentTitle(title || "Nieuw document");
    setRawText(text);
    setChapters(result.chapters);
    setStats(result.stats);
    setSelectedChapterId(result.chapters[0]?.id || "");
    setChapterIllustrations({});
    setIllustrationUrl("");
    setIllustrationJobId("");
    setCharacterPortraits([]);
    setContextAnalysis(null);
    setContextStatus("nog niet geanalyseerd");
    setFilmPlan(null);
    setFilmStatus("klaar voor adaptatie");
    setBookCover({ prompt: buildCoverPrompt(title || "Nieuw document", result.chapters, illustrationStyleId) });
    setCoverStatus("klaar voor cover");
    setNotice(result.stats.limited ? `Beperkt tot ${WORD_LIMIT_LABEL} woorden; origineel bevatte ${result.stats.originalWords}.` : "");
    stopSpeech();
  }

  async function handleFile(file: File) {
    setIsParsing(true);
    setNotice("");
    try {
      if (file.name.toLowerCase().endsWith(".bookreader.json")) {
        const payload = JSON.parse(await file.text());
        if (!isBookProject(payload)) {
          throw new Error("Dit is geen geldig BookReader-projectbestand.");
        }
        loadBookProject(payload);
        saveStoryToLibrary(payload);
        setNotice(`${file.name} geopend met opgeslagen beelden.`);
        return;
      }
      const parsed = await parseFile(file);
      processText(parsed.title, parsed.text);
      setNotice(`${file.name} geladen als ${parsed.kind.toUpperCase()}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Bestand kon niet worden gelezen.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleReferenceFile(file: File) {
    setReferenceStatus("referentie wordt gelezen...");
    try {
      const parsed = await parseFile(file);
      setReferenceTitle(parsed.title);
      setReferenceText(parsed.text);
      const wordCount = parsed.text.match(/\S+/g)?.length || 0;
      setReferenceStatus(`${parsed.title} geladen als referentie (${wordCount.toLocaleString("nl-NL")} woorden)`);
      setNotice("Referentie geladen; verhaalprompt gebruikt nu extra personage- en geschiedeniscontext.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Referentiebestand kon niet worden gelezen.";
      setReferenceStatus(message);
      setNotice(message);
    }
  }

  function loadBookProject(project: BookProject, libraryProjectId = "") {
    const result = splitIntoChapters(project.rawText);
    const chapterIllustrationList = Array.isArray(project.chapterIllustrations) ? project.chapterIllustrations : [];
    const portraitList = Array.isArray(project.characterPortraits) ? project.characterPortraits : [];
    const chapterMap = Object.fromEntries(chapterIllustrationList.map((item) => [item.chapterId, item]));
    setCurrentLibraryProjectId(libraryProjectId);
    setDocumentTitle(project.title || "Nieuw document");
    setRawText(project.rawText);
    setChapters(result.chapters);
    setStats(result.stats);
    setSelectedChapterId(result.chapters[0]?.id || "");
    setIllustrationStyleId((project.illustrationStyleId as IllustrationStyleId) || "storybook");
    setChapterIllustrations(chapterMap);
    setCharacterPortraits(portraitList.map((portrait) => ({ ...portrait, count: 0 })));
    setContextAnalysis((project.contextAnalysis as ContextAnalysis) || null);
    setContextStatus("project geladen");
    setFilmPlan((project.filmPlan as FilmPlan) || null);
    setFilmStatus(project.filmPlan ? "filmplan geladen" : "klaar voor adaptatie");
    setBookCover(project.bookCover || { prompt: buildCoverPrompt(project.title, result.chapters, "storybook") });
    setCoverStatus(project.bookCover?.imageUrl ? "cover geladen" : "klaar voor cover");
    if (project.storyPrompt?.prompt) {
      setStoryPrompt(project.storyPrompt.prompt);
      setStoryPromptMeta(project.storyPrompt);
      setPromptDraft(project.storyPrompt.prompt);
      setPromptCharacters(project.storyPrompt.characters || "");
      setPromptPlot(project.storyPrompt.plot || "");
      setPromptMainEvent(project.storyPrompt.mainEvent || "");
    } else {
      const emptyPrompt = buildGuidedStoryPrompt("", "", "");
      setStoryPrompt("");
      setStoryPromptMeta(emptyPrompt);
      setPromptDraft("");
      setPromptCharacters("");
      setPromptPlot("");
      setPromptMainEvent("");
    }
    stopSpeech();
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) {
      void handleFile(file);
    }
    event.currentTarget.value = "";
  }

  function handleReferenceInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) {
      void handleReferenceFile(file);
    }
    event.currentTarget.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  function refreshFromText() {
    processText(documentTitle, rawText);
  }

  function openPromptBuilder() {
    setPromptDraft(storyPrompt || storyPromptMeta.prompt || "");
    setPromptBuilderOpen(true);
  }

  function updatePromptDraftFromAnswers() {
    const nextPrompt = buildGuidedStoryPrompt(promptCharacters, promptPlot, promptMainEvent);
    if (!nextPrompt.characters.trim() || !nextPrompt.plot.trim() || !nextPrompt.mainEvent.trim()) {
      setNotice("Vul alle drie de promptvragen in.");
      return;
    }
    setPromptDraft(nextPrompt.prompt);
    setNotice("Prompt bijgewerkt vanuit de antwoorden.");
  }

  function saveGuidedPrompt() {
    const nextPrompt = buildGuidedStoryPrompt(promptCharacters, promptPlot, promptMainEvent);
    const hasCompleteAnswers = Boolean(nextPrompt.characters.trim() && nextPrompt.plot.trim() && nextPrompt.mainEvent.trim());
    const finalPrompt = promptDraft.trim();
    if (!finalPrompt && !hasCompleteAnswers) {
      setNotice("Vul de prompt in of beantwoord alle drie de promptvragen.");
      return;
    }
    const savedPrompt = finalPrompt || nextPrompt.prompt;
    const savedPromptMeta = { ...nextPrompt, prompt: savedPrompt, updatedAt: new Date().toISOString() };
    setStoryPrompt(savedPrompt);
    setStoryPromptMeta(savedPromptMeta);
    setPromptDraft(savedPrompt);
    setPromptBuilderOpen(false);
    setNotice("Prompt gemaakt en bewaard bij dit verhaal.");
  }

  async function repartitionStoryWithAi() {
    if (!rawText.trim()) {
      setNotice("Geen verhaaltekst om te herverdelen.");
      return;
    }
    setChapteringBusy(true);
    const providerLabel = aiProviderLabel(aiProvider);
    setChapteringStatus(`${providerLabel} ${activeModelLabel} herverdeelt het verhaal in hoofdstukken...`);
    setNotice("");
    try {
      const response = await rechapterStory(apiBase, {
        title: documentTitle,
        rawText,
        targetChapters: chapterTargetCount,
        language: storyLanguage,
        mode: storyMode,
        provider: aiProvider,
        model: selectedAiModel || undefined,
      });
      processText(response.title, response.story);
      const responseProvider = responseProviderLabel(response.provider);
      setChapteringStatus(
        `${responseProvider} ${response.model}: ${response.chapterCount} hoofdstukken, ${response.wordCount.toLocaleString("nl-NL")} woorden`,
      );
      setNotice(response.warning || `Verhaal opnieuw verdeeld in ${response.chapterCount} hoofdstukken.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI-hoofdstukken konden niet worden gemaakt.";
      setChapteringStatus(message);
      setNotice(message);
    } finally {
      setChapteringBusy(false);
    }
  }

  function combinedReferencePayload() {
    const databaseReferences = referenceStoryIds
      .map((id) => referenceStoryProjects[id])
      .filter((project): project is ReferenceStoryProject => Boolean(project?.rawText?.trim()));
    const title = [
      referenceTitle,
      ...databaseReferences.map((project) => project.title),
    ].filter(Boolean).join(" + ");
    const text = [
      referenceText.trim() ? `# ${referenceTitle || "Geupload referentiebestand"}\n${referenceText}` : "",
      ...databaseReferences.map((project) => `# ${project.title}\n${project.rawText}`),
    ].filter(Boolean).join("\n\n---\n\n");
    return { title, text };
  }

  async function saveUploadedReferenceToDatabase() {
    if (!referenceText.trim()) {
      setNotice("Laad eerst een referentiebestand.");
      return;
    }
    setLibraryBusy(true);
    try {
      const savedAt = new Date().toISOString();
      const title = referenceTitle.trim() || `Referentie ${formatSavedAt(savedAt)}`;
      const parsedReference = splitIntoChapters(referenceText);
      const project = {
        schema: "bookreader.project.v1",
        savedAt,
        title,
        rawText: referenceText,
        illustrationStyleId,
        chapterIllustrations: [],
        characterPortraits: [],
        bookCover: { prompt: buildCoverPrompt(title, parsedReference.chapters, illustrationStyleId) },
      } satisfies BookProject;
      const category = await createLibraryCategory(apiBase, "Referenties");
      const saved = await saveLibraryProject(apiBase, project, [category.category.id]);
      saveStoryToLibrary(project);
      setReferenceStoryProjects((current) => ({
        ...current,
        [saved.project.id]: {
          title: saved.project.title,
          rawText: referenceText,
        },
      }));
      setReferenceStoryIds((current) => (current.includes(saved.project.id) ? current : [...current, saved.project.id]));
      await refreshLibrary(false);
      await refreshCategories(false);
      setAssignCategoryId(category.category.id);
      setReferenceStatus(`${saved.project.title} opgeslagen in SQL en aangevinkt als referentie`);
      setNotice(`${saved.project.title} staat in SQL onder Referenties.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Referentie kon niet in SQL worden opgeslagen.";
      setReferenceStatus(message);
      setNotice(message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function createStoryFromPrompt() {
    if (!storyPrompt.trim()) {
      setNotice("Geef eerst een verhaalprompt.");
      return;
    }
    setStoryBusy(true);
    const providerLabel = aiProviderLabel(aiProvider);
    const presetLabel = storyNarrativePreset === "rich_intro" ? " met veel detail en lange intro" : "";
    const sequelLabel = sequelSourceText ? ` als vervolg op ${sequelSourceTitle || "het gekozen verhaal"}` : "";
    setStoryStatus(
      storyMode === "deep"
        ? `${providerLabel} ${activeModelLabel} schrijft uitgebreid${presetLabel}${sequelLabel}...`
        : `${providerLabel} ${activeModelLabel} schrijft kort${presetLabel}${sequelLabel}...`,
    );
    setNotice("");
    try {
      const references = combinedReferencePayload();
      const response = await generateStory(apiBase, {
        prompt: storyPrompt,
        pages: storyPages,
        wordsPerPage: storyWordsPerPage,
        genre: storyGenre,
        tone: storyTone,
        audience: "lezers die een duidelijk verhaal met scènes en personages willen",
        language: storyLanguage,
        mode: storyMode,
        provider: aiProvider,
        model: selectedAiModel || undefined,
        narrativePreset: storyNarrativePreset,
        referenceTitle: references.title,
        referenceText: references.text,
        sequelOfTitle: sequelSourceTitle,
        sequelOfText: sequelSourceText,
      });
      processText(response.title, response.story);
      const savedAt = new Date().toISOString();
      const generatedChapters = splitIntoChapters(response.story).chapters;
      const generatedProject = {
        schema: "bookreader.project.v1",
        savedAt,
        title: response.title,
        rawText: response.story,
        illustrationStyleId,
        chapterIllustrations: [],
        characterPortraits: [],
        bookCover: { prompt: buildCoverPrompt(response.title, generatedChapters, illustrationStyleId) },
        storyPrompt: storyPromptMeta,
      } satisfies BookProject;
      saveStoryToLibrary(generatedProject);
      let libraryNote = "";
      try {
        const inheritedCategoryIds = sequelSourceCategoryIds.length ? sequelSourceCategoryIds : selectedCategoryId ? [selectedCategoryId] : [];
        const saved = await saveLibraryProject(apiBase, generatedProject, inheritedCategoryIds);
        setCurrentLibraryProjectId(saved.project.id);
        await refreshLibrary(false);
        await refreshCategories(false);
        libraryNote = " en in SQL opgeslagen";
      } catch {
        libraryNote = "";
      }
      const responseProvider = responseProviderLabel(response.provider);
      const languageNote = response.language ? `, ${response.language}` : "";
      setStoryStatus(`${responseProvider} ${response.model}: ${response.wordCount.toLocaleString("nl-NL")} woorden gemaakt${languageNote}`);
      setNotice(`Verhaal geladen: ${response.title}${libraryNote}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verhaal kon niet worden gemaakt.";
      setStoryStatus(message);
      setNotice(message);
    } finally {
      setStoryBusy(false);
    }
  }

  async function sendBookMakerAnswer() {
    const answer = bookMakerInput.trim();
    if (!answer) {
      setNotice("Schrijf eerst een antwoord voor Talle.");
      return;
    }
    const johnMessage: BookMakerMessage = { role: "john", content: answer, createdAt: new Date().toISOString() };
    const nextMessages = [...bookMakerMessages, johnMessage];
    setBookMakerMessages(nextMessages);
    setBookMakerInput("");
    setBookMakerBusy(true);
    setBookMakerStatus(`${aiProviderLabel(aiProvider)} ${activeModelLabel} laat Talle doorvragen...`);
    setNotice("");
    try {
      const response = await continueBookMakerInterview(apiBase, {
        messages: nextMessages,
        provider: aiProvider,
        model: selectedAiModel || undefined,
        mode: storyMode,
      });
      const talMessage: BookMakerMessage = { role: "talle", content: response.reply, createdAt: new Date().toISOString() };
      setBookMakerMessages([...nextMessages, talMessage]);
      const fallbackNote = response.fallbackUsed ? " met lokale fallback" : "";
      setBookMakerStatus(`Talle luistert verder (${responseProviderLabel(response.provider)} ${response.model}${fallbackNote}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Talle kon nu niet antwoorden.";
      setBookMakerStatus(message);
      setNotice(message);
    } finally {
      setBookMakerBusy(false);
    }
  }

  function resetBookMakerSession() {
    setBookMakerMessages([INITIAL_TALLE_MESSAGE]);
    setBookMakerInput("");
    setBookMakerPromptPreview("");
    setBookMakerStatus("Nieuwe Boek-maker-sessie gestart.");
  }

  async function finishBookMakerSession() {
    if (!bookMakerMessages.some((message) => message.role === "john" && message.content.trim())) {
      setNotice("Beantwoord eerst minstens een vraag van Talle.");
      return;
    }
    setBookMakerBusy(true);
    setStoryBusy(true);
    setImageProvider("grok");
    const targetLanguage = storyLanguage === "Auto" ? "Nederlands" : storyLanguage;
    setBookMakerStatus(`${aiProviderLabel(aiProvider)} ${activeModelLabel} vormt het interview om tot prompt...`);
    setStoryStatus("Boek-maker maakt een verhaal van 6 hoofdstukken...");
    setNotice("");
    try {
      const promptResponse = await finalizeBookMakerPrompt(apiBase, {
        messages: bookMakerMessages,
        provider: aiProvider,
        model: selectedAiModel || undefined,
        mode: storyMode,
        language: targetLanguage,
      });
      const nextPromptMeta: StoryPromptMeta = {
        characters: promptResponse.characters,
        plot: promptResponse.plot,
        mainEvent: promptResponse.mainEvent,
        prompt: promptResponse.prompt,
        updatedAt: new Date().toISOString(),
      };
      setStoryPrompt(promptResponse.prompt);
      setStoryPromptMeta(nextPromptMeta);
      setPromptDraft(promptResponse.prompt);
      setPromptCharacters(promptResponse.characters);
      setPromptPlot(promptResponse.plot);
      setPromptMainEvent(promptResponse.mainEvent);
      setStoryPages(6);
      setStoryWordsPerPage(750);
      setStoryMode("deep");
      setStoryNarrativePreset("rich_intro");
      setStoryLanguage(targetLanguage as StoryLanguage);
      setBookMakerPromptPreview(promptResponse.prompt);
      setBookMakerStatus("Prompt klaar; Talle laat het verhaal schrijven...");

      const response = await generateStory(apiBase, {
        prompt: promptResponse.prompt,
        pages: 6,
        wordsPerPage: 750,
        genre: "persoonlijke spirituele fictieroman",
        tone: "warm, concreet, literair, invoelend en licht ironisch",
        audience: "lezers van persoonlijke spirituele fictie met concrete scènes en innerlijke betekenis",
        language: targetLanguage,
        mode: "deep",
        provider: aiProvider,
        model: selectedAiModel || undefined,
        narrativePreset: "rich_intro",
      });

      processText(response.title, response.story);
      const generatedChapters = splitIntoChapters(response.story).chapters;
      const cover = { prompt: buildCoverPrompt(response.title, generatedChapters, illustrationStyleId) };
      setBookCover(cover);
      setChapterIllustrations({});
      setIllustrationUrl("");
      setIllustrationJobId("");
      setBookMakerStatus("Verhaal klaar; Grok maakt illustraties per hoofdstuk...");
      const illustrationMap = await createBookMakerChapterIllustrations(response.title, generatedChapters);
      const savedAt = new Date().toISOString();
      const generatedProject = {
        schema: "bookreader.project.v1",
        savedAt,
        title: response.title,
        rawText: response.story,
        illustrationStyleId,
        chapterIllustrations: Object.values(illustrationMap),
        characterPortraits: [],
        bookCover: cover,
        storyPrompt: nextPromptMeta,
      } satisfies BookProject;
      saveStoryToLibrary(generatedProject);
      let libraryNote = "";
      try {
        const saved = await saveLibraryProject(apiBase, generatedProject, selectedCategoryId ? [selectedCategoryId] : []);
        setCurrentLibraryProjectId(saved.project.id);
        await refreshLibrary(false);
        await refreshCategories(false);
        libraryNote = " en in SQL opgeslagen";
      } catch {
        libraryNote = "";
      }
      const imageCount = Object.keys(illustrationMap).length;
      const promptNote = promptResponse.fallbackUsed ? " Promptfallback gebruikt." : "";
      setBookMakerStatus(`Boek-maker klaar: ${generatedChapters.length} hoofdstukken, ${imageCount} Grok-illustraties.${promptNote}`);
      setStoryStatus(`${responseProviderLabel(response.provider)} ${response.model}: ${response.wordCount.toLocaleString("nl-NL")} woorden gemaakt`);
      setNotice(`Boek-maker verhaal geladen: ${response.title}${libraryNote}.`);
      setWorkspaceTab("reader");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Boek-maker kon de sessie niet afronden.";
      setBookMakerStatus(message);
      setStoryStatus(message);
      setNotice(message);
    } finally {
      setStoryBusy(false);
      setBookMakerBusy(false);
    }
  }

  async function createBookMakerChapterIllustrations(title: string, chapterList: Chapter[]): Promise<ChapterIllustrationMap> {
    const nextMap: ChapterIllustrationMap = {};
    setIllustrationBusy(true);
    setIllustrationStatus("Grok maakt boekillustraties...");
    try {
      for (const chapter of chapterList) {
        const prompt = buildIllustrationPrompt(title, chapter, illustrationStyleId);
        setIllustrationStatus(`Grok illustreert ${chapter.title}...`);
        setBookMakerStatus(`Grok illustreert ${chapter.index + 1}/${chapterList.length}: ${chapter.title}`);
        const job = await generateIllustration(apiBase, {
          prompt,
          negativePrompt: DEFAULT_NEGATIVE_PROMPT,
          provider: "grok",
          model: selectedGrokImageModel || modelCatalog?.defaults.xai.image,
          kind: "chapter",
          label: chapter.title,
          aspectRatio: "4:3",
        });
        const resolved = await resolveImageJob(job, "chapter", chapter.title);
        if (!resolved.imageUrl) continue;
        const record = {
          chapterId: chapter.id,
          prompt,
          imageUrl: resolved.imageUrl,
          jobId: resolved.jobId,
        };
        nextMap[chapter.id] = record;
        setChapterIllustrations((previous) => ({ ...previous, [chapter.id]: record }));
        if (!illustrationUrl || chapter.index === 0) {
          setIllustrationUrl(resolved.imageUrl);
          setIllustrationJobId(resolved.jobId);
        }
      }
      setIllustrationStatus(`${Object.keys(nextMap).length} Grok-illustraties klaar`);
      return nextMap;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Grok-illustraties konden niet allemaal worden gemaakt.";
      setIllustrationStatus(message);
      setNotice(message);
      return nextMap;
    } finally {
      setIllustrationBusy(false);
    }
  }

  async function createFilmPlan() {
    if (!rawText.trim()) {
      setNotice("Geen verhaaltekst om te verfilmen.");
      return;
    }
    setFilmBusy(true);
    const providerLabel = aiProviderLabel(aiProvider);
    setFilmStatus(`${providerLabel} ${activeModelLabel} maakt een scene breakdown...`);
    setNotice("");
    try {
      const response = await planFilm(apiBase, {
        title: documentTitle,
        rawText,
        targetMinutes: filmTargetMinutes,
        sceneCount: filmSceneCount,
        style: illustrationStyleId,
        mode: filmMode,
        provider: aiProvider,
        model: selectedAiModel || undefined,
      });
      setFilmPlan(response.plan);
      const responseProvider = responseProviderLabel(response.provider);
      const fallbackNote = response.fallbackUsed ? " + lokale fallback" : "";
      setFilmStatus(
        `${responseProvider} ${response.model} (${response.mode})${fallbackNote}: ${response.plan.scenes.length} scènes, ${formatDuration(
          response.plan.totalDurationSeconds,
        )}`,
      );
      setNotice(response.warning || `Filmplan klaar: ${response.plan.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Filmplan kon niet worden gemaakt.";
      setFilmStatus(message);
      setNotice(message);
    } finally {
      setFilmBusy(false);
    }
  }

  async function copyFilmPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice("Videoprompt gekopieerd.");
    } catch {
      setNotice("Kopiëren is niet gelukt.");
    }
  }

  function applyRichIntroPreset() {
    setStoryNarrativePreset("rich_intro");
    setStoryMode("deep");
    setStoryPages((current) => Math.max(current, 6));
    setStoryWordsPerPage((current) => Math.max(current, 750));
    setStoryTone("rijk gedetailleerd, langzaam opbouwend, zintuiglijk, met een lange introductie");
    setNotice("Preset actief: veel details, rustige opbouw en een lange introductie.");
  }

  function applyVoiceStyle(nextStyleId: string) {
    const style = VOICE_STYLES.find((item) => item.id === nextStyleId) || VOICE_STYLES[0];
    setVoiceStyleId(style.id);
    setRate(style.rate);
    setPitch(style.pitch);
  }

  function readChapter(chapter: Chapter) {
    if (ttsProvider === "server") {
      void readChapterWithServerTts(chapter);
      return;
    }
    if (!("speechSynthesis" in window)) {
      setNotice("Lokale spraak is niet beschikbaar in deze webview.");
      return;
    }
    stopSpeech();
    setSelectedChapterId(chapter.id);
    setActiveChapterId(chapter.id);
    queueRef.current = chunkForSpeech(chapter.text, selectedVoiceStyle.chunkSize);
    setSpeechState("speaking");
    speakNext();
  }

  async function readChapterWithServerTts(chapter: Chapter) {
    stopSpeech();
    setSelectedChapterId(chapter.id);
    setActiveChapterId(chapter.id);
    queueRef.current = chunkForSpeech(chapter.text, 4200);
    setSpeechState("speaking");
    setNotice(`Server-TTS maakt audio in ${queueRef.current.length} stuk(ken)...`);
    await speakNextServerChunk();
  }

  async function speakNextServerChunk() {
    const next = queueRef.current.shift();
    if (!next) {
      setSpeechState("idle");
      setActiveChapterId("");
      audioRef.current = null;
      setNotice("Server-TTS klaar.");
      return;
    }
    try {
      const response = await synthesizeSpeech(apiBase, {
        text: next,
        voice: serverVoiceId || selectedVoice?.name || "",
        style: voiceStyleId,
      });
      if (!response.audioUrl) {
        throw new Error(response.message || "Server-TTS gaf geen audio terug.");
      }
      const audio = new Audio(mediaUrl(apiBase, response.audioUrl));
      audioRef.current = audio;
      audio.onended = () => {
        void speakNextServerChunk();
      };
      audio.onerror = () => {
        setSpeechState("idle");
        setActiveChapterId("");
        setNotice("Audio kon niet worden afgespeeld.");
      };
      await audio.play();
      setNotice(`Server-TTS speelt af (${queueRef.current.length} stuk(ken) over).`);
    } catch (error) {
      setSpeechState("idle");
      setActiveChapterId("");
      setNotice(error instanceof Error ? error.message : "Server-TTS kon niet starten.");
    }
  }

  function speakNext() {
    const next = queueRef.current.shift();
    if (!next) {
      utteranceRef.current = null;
      setSpeechState("idle");
      setActiveChapterId("");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(next);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onend = speakNext;
    utterance.onerror = () => {
      setSpeechState("idle");
      setNotice("Voorlezen is gestopt door de spraakengine.");
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function pauseSpeech() {
    if (audioRef.current) {
      audioRef.current.pause();
    } else {
      window.speechSynthesis?.pause();
    }
    setSpeechState("paused");
  }

  function resumeSpeech() {
    if (audioRef.current) {
      void audioRef.current.play();
    } else {
      window.speechSynthesis?.resume();
    }
    setSpeechState("speaking");
  }

  function stopSpeech() {
    queueRef.current = [];
    utteranceRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setSpeechState("idle");
    setActiveChapterId("");
  }

  async function refreshApiHealth(showNotice = true) {
    setApiBusy(true);
    try {
      const health = await getHealth(apiBase);
      setApiHealth(health);
      if (!serverVoiceId && health.tts?.voices?.length) {
        setServerVoiceId(health.tts.voices[0].id);
      }
      const ttsLabel = health.tts?.configured ? "TTS aan" : "TTS uit";
      const comfyLabel = health.comfy?.workflowConfigured ? "Comfy workflow aan" : "Comfy workflow uit";
      const deepseekLabel = health.deepseekApi?.configured ? "DeepSeek API aan" : "DeepSeek key ontbreekt";
      const grokLabel = health.xaiApi?.configured ? "Grok API aan" : "Grok key ontbreekt";
      setApiStatus(`${ttsLabel}, ${comfyLabel}, ${deepseekLabel}, ${grokLabel}`);
      if (showNotice) setNotice("Serverlaag bereikt.");
    } catch (error) {
      setApiHealth(null);
      setApiStatus("offline");
      if (showNotice) setNotice(error instanceof Error ? error.message : "Serverlaag niet bereikbaar.");
    } finally {
      setApiBusy(false);
    }
  }

  async function refreshModelCatalog(showNotice = true) {
    setModelCatalogBusy(true);
    try {
      const catalog = await getModelCatalog(apiBase);
      setModelCatalog(catalog);
      setSelectedLocalModel((current) =>
        chooseCatalogModel(current, catalog.ollama.models, [
          catalog.defaults.local.deepStory,
          catalog.defaults.local.story,
          catalog.defaults.local.deepContext,
          catalog.defaults.local.fastContext,
        ]),
      );
      setSelectedApiModel((current) => chooseCatalogModel(current, catalog.deepseekApi.models, [catalog.defaults.api.story, catalog.defaults.api.context]));
      setSelectedGrokModel((current) => chooseCatalogModel(current, catalog.xaiApi.models, [catalog.defaults.xai.film, catalog.defaults.xai.story, catalog.defaults.xai.context]));
      setSelectedGrokImageModel((current) => chooseCatalogModel(current, catalog.xaiImageApi.models, [catalog.defaults.xai.image]));
      const ollamaLabel = catalog.ollama.models.length ? `${catalog.ollama.models.length} Ollama` : "geen Ollama";
      const deepseekLabel = catalog.deepseekApi.models.length ? `${catalog.deepseekApi.models.length} DeepSeek API` : "geen DeepSeek API";
      const grokLabel = catalog.xaiApi.models.length ? `${catalog.xaiApi.models.length} Grok API` : "geen Grok API";
      const grokImageLabel = catalog.xaiImageApi.models.length ? `${catalog.xaiImageApi.models.length} Grok beeld` : "geen Grok beeld";
      const warning = [
        catalog.ollama.error ? "Ollama lijst niet live" : "",
        catalog.deepseekApi.error ? "DeepSeek lijst fallback" : "",
        catalog.xaiApi.error ? "Grok lijst fallback" : "",
        catalog.xaiImageApi.error ? "Grok beeldlijst fallback" : "",
      ]
        .filter(Boolean)
        .join(", ");
      setModelCatalogStatus(
        warning
          ? `${ollamaLabel}, ${deepseekLabel}, ${grokLabel}, ${grokImageLabel} (${warning})`
          : `${ollamaLabel}, ${deepseekLabel}, ${grokLabel}, ${grokImageLabel}`,
      );
      if (showNotice) setNotice("Modellenlijst bijgewerkt.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Modellenlijst kon niet worden geladen.";
      setModelCatalogStatus(message);
      if (showNotice) setNotice(message);
    } finally {
      setModelCatalogBusy(false);
    }
  }

  async function saveDeepSeekKey() {
    const apiKey = deepSeekApiKeyInput.trim();
    if (!apiKey) {
      setNotice("Plak eerst een DeepSeek API key.");
      return;
    }
    setDeepSeekKeyBusy(true);
    try {
      const response = await saveDeepSeekApiKey(apiBase, apiKey);
      setDeepSeekApiKeyInput("");
      setNotice(response.message || "DeepSeek API key is opgeslagen.");
      await refreshApiHealth(false);
      await refreshModelCatalog(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "DeepSeek API key kon niet worden opgeslagen.";
      setNotice(message);
    } finally {
      setDeepSeekKeyBusy(false);
    }
  }

  async function clearDeepSeekKey() {
    setDeepSeekKeyBusy(true);
    try {
      const response = await saveDeepSeekApiKey(apiBase, "", true);
      setDeepSeekApiKeyInput("");
      if (normalizeAiProvider(aiProvider) === "deepseek") setAiProvider("local");
      setNotice(response.message || "DeepSeek API key is gewist.");
      await refreshApiHealth(false);
      await refreshModelCatalog(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "DeepSeek API key kon niet worden gewist.";
      setNotice(message);
    } finally {
      setDeepSeekKeyBusy(false);
    }
  }

  async function saveXaiKey() {
    const apiKey = xaiApiKeyInput.trim();
    if (!apiKey) {
      setNotice("Plak eerst een Grok/xAI API key.");
      return;
    }
    setXaiKeyBusy(true);
    try {
      const response = await saveXaiApiKey(apiBase, apiKey);
      setXaiApiKeyInput("");
      setNotice(response.message || "Grok API key is opgeslagen.");
      await refreshApiHealth(false);
      await refreshModelCatalog(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Grok API key kon niet worden opgeslagen.";
      setNotice(message);
    } finally {
      setXaiKeyBusy(false);
    }
  }

  async function clearXaiKey() {
    setXaiKeyBusy(true);
    try {
      const response = await saveXaiApiKey(apiBase, "", true);
      setXaiApiKeyInput("");
      if (normalizeAiProvider(aiProvider) === "grok") setAiProvider("local");
      setNotice(response.message || "Grok API key is gewist.");
      await refreshApiHealth(false);
      await refreshModelCatalog(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Grok API key kon niet worden gewist.";
      setNotice(message);
    } finally {
      setXaiKeyBusy(false);
    }
  }

  async function cacheGeneratedImage(imageUrl: string, kind: string, label?: string): Promise<string> {
    const cached = await cacheImage(apiBase, imageUrl, kind, label);
    if (cached.filePath) {
      setAssetStorageStatus(`Laatste beeld opgeslagen: ${cached.filePath}`);
    }
    return mediaUrl(apiBase, cached.imageUrl);
  }

  async function resolveImageJob(job: Awaited<ReturnType<typeof generateIllustration>>, kind: "chapter" | "cover" | "portrait", label: string) {
    if (job.imageUrl) {
      if (job.filePath) {
        setAssetStorageStatus(`Laatste beeld opgeslagen: ${job.filePath}`);
      }
      return {
        imageUrl: mediaUrl(apiBase, job.imageUrl),
        jobId: job.promptId || "",
      };
    }
    if (!job.promptId) {
      throw new Error(job.message || `${imageProviderLabel(imageProvider)} gaf geen beeldjob terug.`);
    }
    const status = await pollIllustration(job.promptId);
    const firstImage = status.images[0];
    if (!firstImage) {
      return {
        imageUrl: "",
        jobId: job.promptId,
      };
    }
    return {
      imageUrl: await cacheGeneratedImage(mediaUrl(apiBase, firstImage.url), kind, label),
      jobId: job.promptId,
    };
  }

  function selectedImageModel(): string | undefined {
    return imageProvider === "grok" ? selectedGrokImageModel || modelCatalog?.defaults.xai.image : undefined;
  }

  async function createIllustration() {
    if (!selectedChapter) return;
    setIllustrationBusy(true);
    setIllustrationStatus(`${imageProviderLabel(imageProvider)} job starten...`);
    setNotice("");
    try {
      const job = await generateIllustration(apiBase, {
        prompt: illustrationPrompt || buildIllustrationPrompt(documentTitle, selectedChapter, illustrationStyleId),
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        provider: imageProvider,
        model: selectedImageModel(),
        kind: "chapter",
        label: selectedChapter.title,
        aspectRatio: "4:3",
      });
      setIllustrationJobId(job.promptId || "");
      setIllustrationStatus(`${imageProviderLabel(imageProvider)} rendert...`);
      const resolved = await resolveImageJob(job, "chapter", selectedChapter.title);
      if (!resolved.imageUrl) {
        setIllustrationStatus("Nog geen afbeelding terug.");
        return;
      }
      setIllustrationUrl(resolved.imageUrl);
      setChapterIllustrations((previous) => ({
        ...previous,
        [selectedChapter.id]: {
          chapterId: selectedChapter.id,
          prompt: illustrationPrompt,
          imageUrl: resolved.imageUrl,
          jobId: resolved.jobId,
          },
      }));
      setIllustrationStatus("illustratie klaar en lokaal opgeslagen");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Illustratie kon niet worden gemaakt.";
      setIllustrationStatus(message);
      setNotice(message);
    } finally {
      setIllustrationBusy(false);
    }
  }

  function detectCharacters() {
    void runDeepSeekContextAnalysis();
  }

  function detectCharactersHeuristic() {
    const detected = detectCharacterPortraits(rawText, illustrationStyleId, 10);
    setCharacterPortraits(detected);
    setContextStatus("snelle lokale scan gebruikt");
    setNotice(detected.length ? `${detected.length} karakter(s) gevonden met snelle scan.` : "Geen duidelijke terugkerende karakternamen gevonden.");
  }

  async function runDeepSeekContextAnalysis(mode: "fast" | "deep" = "fast") {
    if (!rawText.trim() && !selectedChapter?.text.trim()) {
      setNotice("Geen tekst om te analyseren.");
      return;
    }
    setContextBusy(true);
    const providerLabel = aiProviderLabel(aiProvider);
    setContextStatus(
      mode === "deep"
        ? `${providerLabel} ${activeModelLabel} doet diepe verhaalcontext...`
        : `${providerLabel} ${activeModelLabel} analyseert verhaalcontext...`,
    );
    try {
      const response = await analyzeContext(apiBase, {
        title: documentTitle,
        rawText,
        chapterTitle: selectedChapter?.title,
        chapterText: selectedChapter?.text,
        style: illustrationStyleId,
        mode,
        provider: aiProvider,
        model: selectedAiModel || undefined,
      });
      const analysis = response.analysis;
      setContextAnalysis(analysis);
      if (analysis.chapterPrompt) setIllustrationPrompt(analysis.chapterPrompt);
      if (analysis.coverPrompt) {
        setBookCover((previous) => ({ ...previous, prompt: analysis.coverPrompt }));
      }
      if (analysis.characters.length) {
        setCharacterPortraits(analysis.characters);
      }
      const fallbackNote = response.fallbackUsed ? " + lokale kwaliteitsfallback" : "";
      const modeLabel = response.mode === "deep" ? "diep" : "snel";
      const responseProvider = responseProviderLabel(response.provider);
      setContextStatus(`${responseProvider} ${response.model} (${modeLabel})${fallbackNote}: ${analysis.characters.length} karakter(s), context toegepast`);
      setNotice(response.warning || "AI-context toegepast op prompts, cover en portretten.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "DeepSeek-contextanalyse is mislukt.";
      setContextStatus(message);
      setNotice(message);
    } finally {
      setContextBusy(false);
    }
  }

  async function createBookCover() {
    setCoverBusy(true);
    setCoverStatus(`${imageProviderLabel(imageProvider)} coverjob starten...`);
    try {
      const job = await generateIllustration(apiBase, {
        prompt: bookCover.prompt || buildCoverPrompt(documentTitle, chapters, illustrationStyleId),
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        provider: imageProvider,
        model: selectedImageModel(),
        kind: "cover",
        label: documentTitle,
        aspectRatio: "2:3",
      });
      setCoverStatus("cover rendert...");
      const resolved = await resolveImageJob(job, "cover", documentTitle);
      if (!resolved.imageUrl) {
        setCoverStatus("Nog geen cover terug.");
        return;
      }
      setBookCover((previous) => ({
        ...previous,
        imageUrl: resolved.imageUrl,
        jobId: resolved.jobId,
      }));
      setCoverStatus("cover klaar en lokaal opgeslagen");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cover kon niet worden gemaakt.";
      setCoverStatus(message);
      setNotice(message);
    } finally {
      setCoverBusy(false);
    }
  }

  async function createCharacterPortrait(character: CharacterPortraitRecord) {
    setPortraitBusyId(character.id);
    try {
      const job = await generateIllustration(apiBase, {
        prompt: character.prompt,
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
        provider: imageProvider,
        model: selectedImageModel(),
        kind: "portrait",
        label: character.name,
        aspectRatio: "3:4",
      });
      const resolved = await resolveImageJob(job, "portrait", character.name);
      if (!resolved.imageUrl) {
        setNotice(`Nog geen portret terug voor ${character.name}.`);
        return;
      }
      setCharacterPortraits((previous) =>
        previous.map((item) => (item.id === character.id ? { ...item, imageUrl: resolved.imageUrl } : item)),
      );
      setNotice(`Portret klaar en lokaal opgeslagen voor ${character.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Portret kon niet worden gemaakt voor ${character.name}.`);
    } finally {
      setPortraitBusyId("");
    }
  }

  function updateCharacterPortrait(id: string, patch: Partial<CharacterPortraitRecord>) {
    setCharacterPortraits((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function saveProject() {
    setProjectBusy(true);
    setNotice("Projectbestand wordt gemaakt...");
    try {
      const savedAt = new Date().toISOString();
      const libraryProject = currentBookProject(savedAt);
      const savedChapterIllustrations = await Promise.all(
        Object.values(chapterIllustrations).map(async (item) => ({
          ...item,
          imageUrl: item.imageUrl ? await imageToDataUrl(item.imageUrl) : undefined,
        })),
      );
      const savedPortraits: SavedCharacterPortrait[] = await Promise.all(
        characterPortraits.map(async (portrait) => ({
          id: portrait.id,
          name: portrait.name,
          description: portrait.description,
          prompt: portrait.prompt,
          imageUrl: portrait.imageUrl ? await imageToDataUrl(portrait.imageUrl) : undefined,
        })),
      );
      const savedCover: SavedBookCover = {
        ...bookCover,
        imageUrl: bookCover.imageUrl ? await imageToDataUrl(bookCover.imageUrl) : undefined,
      };
      const project = {
        schema: "bookreader.project.v1",
        savedAt,
        title: documentTitle,
        rawText,
        illustrationStyleId,
        chapterIllustrations: savedChapterIllustrations,
        characterPortraits: savedPortraits,
        bookCover: savedCover,
        contextAnalysis,
        filmPlan,
        storyPrompt: storyPromptMeta,
      } satisfies BookProject;
      let librarySaved = false;
      let libraryError = "";
      try {
        const currentCategoryIds = libraryStories.find((entry) => entry.id === currentLibraryProjectId)?.categoryIds || [];
        const saved = await saveLibraryProject(apiBase, libraryProject, currentCategoryIds.length ? currentCategoryIds : selectedCategoryId ? [selectedCategoryId] : []);
        setCurrentLibraryProjectId(saved.project.id);
        await refreshLibrary(false);
        await refreshCategories(false);
        librarySaved = true;
      } catch (error) {
        libraryError = error instanceof Error ? error.message : "SQL-bibliotheek niet bereikbaar";
      }
      downloadBookProject(project);
      saveStoryToLibrary(libraryProject);
      setNotice(librarySaved ? "Project opgeslagen in SQL en als JSON gedownload." : `Project als JSON opgeslagen. SQL niet bijgewerkt: ${libraryError}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Project kon niet worden opgeslagen.");
    } finally {
      setProjectBusy(false);
    }
  }

  async function pollIllustration(promptId: string) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const status = await getIllustrationStatus(apiBase, promptId);
      if (status.complete && status.images.length) return status;
      await delay(1500);
    }
    return getIllustrationStatus(apiBase, promptId);
  }

  function clearDocument() {
    setCurrentLibraryProjectId("");
    processText("Nieuw document", "");
    setRawText("");
    setChapters([]);
    setStats({ totalWords: 0, limited: false, originalWords: 0 });
    setChapterIllustrations({});
    setCharacterPortraits([]);
    setBookCover({ prompt: "" });
    setCoverStatus("klaar voor cover");
    setStoryPrompt(initialStoryPromptMeta.prompt);
    setStoryPromptMeta(initialStoryPromptMeta);
    setPromptDraft(initialStoryPromptMeta.prompt);
    setPromptCharacters(initialStoryPromptMeta.characters);
    setPromptPlot(initialStoryPromptMeta.plot);
    setPromptMainEvent(initialStoryPromptMeta.mainEvent);
    setPromptBuilderOpen(false);
    setNotice("");
  }

  function currentBookProject(savedAt = new Date().toISOString()): BookProject {
    return {
      schema: "bookreader.project.v1",
      savedAt,
      title: documentTitle,
      rawText,
      illustrationStyleId,
      chapterIllustrations: Object.values(chapterIllustrations),
      characterPortraits: characterPortraits.map((portrait) => ({
        id: portrait.id,
        name: portrait.name,
        description: portrait.description,
        prompt: portrait.prompt,
        imageUrl: portrait.imageUrl,
      })),
      bookCover,
      contextAnalysis,
      filmPlan,
      storyPrompt: storyPromptMeta,
    };
  }

  function saveStoryToLibrary(project: BookProject) {
    const entry = savedStoryEntryFromProject(project);
    const nextStories = [entry, ...savedStories.filter((item) => item.id !== entry.id)].slice(0, MAX_SAVED_STORIES);
    try {
      writeSavedStories(nextStories);
      setSavedStories(nextStories);
    } catch {
      setNotice("Projectbestand opgeslagen, maar de lokale verhalenlijst is vol.");
    }
  }

  function openSavedStory(entry: SavedStoryEntry) {
    loadBookProject(entry.project);
    setNotice(`${entry.title} uit lokale bibliotheek geopend.`);
  }

  function deleteSavedStory(entryId: string) {
    const nextStories = savedStories.filter((entry) => entry.id !== entryId);
    writeSavedStories(nextStories);
    setSavedStories(nextStories);
  }

  async function refreshProjectFiles(showNotice = true) {
    setProjectScanBusy(true);
    try {
      const response = await listProjectFiles(apiBase);
      setProjectFiles(response.projects);
      const message = `${response.projects.length} JSON-verhalen gevonden`;
      setProjectScanStatus(message);
      if (showNotice) setNotice(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "JSON-verhalen konden niet worden gescand.";
      setProjectScanStatus("scan niet beschikbaar");
      if (showNotice) setNotice(message);
    } finally {
      setProjectScanBusy(false);
    }
  }

  async function refreshLibrary(showNotice = true) {
    setLibraryBusy(true);
    try {
      const response = await listLibraryProjects(apiBase);
      setLibraryStories(response.projects);
      const message = `${response.projects.length} SQL-verhalen beschikbaar`;
      setLibraryStatus(message);
      if (showNotice) setNotice(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SQL-bibliotheek kon niet worden geladen.";
      setLibraryStatus("SQL-bibliotheek niet beschikbaar");
      if (showNotice) setNotice(message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function refreshCategories(showNotice = true) {
    try {
      const response = await listLibraryCategories(apiBase);
      setLibraryCategories(response.categories);
      setAssignCategoryId((current) => current || response.categories[0]?.id || "");
      if (showNotice) setNotice(`${response.categories.length} categorieën beschikbaar`);
    } catch (error) {
      if (showNotice) setNotice(error instanceof Error ? error.message : "Categorieën konden niet worden geladen.");
    }
  }

  async function createCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setNotice("Geef eerst een categorienaam.");
      return;
    }
    setLibraryBusy(true);
    try {
      const response = await createLibraryCategory(apiBase, name);
      setNewCategoryName("");
      setAssignCategoryId(response.category.id);
      setSelectedCategoryId(response.category.id);
      await refreshCategories(false);
      await refreshLibrary(false);
      setNotice(`Categorie gemaakt: ${response.category.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Categorie kon niet worden gemaakt.");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function assignCurrentStoryToCategory() {
    const categoryId = assignCategoryId || selectedCategoryId;
    if (!categoryId) {
      setNotice("Maak of kies eerst een categorie.");
      return;
    }
    if (!rawText.trim()) {
      setNotice("Er is geen huidig verhaal om in een categorie te plaatsen.");
      return;
    }
    setLibraryBusy(true);
    try {
      let projectId = currentLibraryProjectId;
      if (!projectId) {
        const saved = await saveLibraryProject(apiBase, currentBookProject(new Date().toISOString()), [categoryId]);
        projectId = saved.project.id;
        setCurrentLibraryProjectId(projectId);
      } else {
        await assignLibraryCategory(apiBase, projectId, categoryId);
      }
      await refreshLibrary(false);
      await refreshCategories(false);
      const categoryName = libraryCategories.find((category) => category.id === categoryId)?.name || "categorie";
      setNotice(`${documentTitle} staat nu in ${categoryName}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verhaal kon niet in de categorie worden geplaatst.");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function assignLibraryStoryToCategory(projectId: string, categoryId: string) {
    if (!projectId || !categoryId) return;
    setLibraryBusy(true);
    try {
      const response = await assignLibraryCategory(apiBase, projectId, categoryId);
      await refreshLibrary(false);
      await refreshCategories(false);
      const categoryName = response.project.categories.find((category) => category.id === categoryId)?.name || "categorie";
      setNotice(`${response.project.title} staat nu in ${categoryName}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verhaal kon niet in de categorie worden geplaatst.");
    } finally {
      setDraggedLibraryStoryId("");
      setLibraryBusy(false);
    }
  }

  async function dropStoryOnCategory(categoryId: string) {
    if (!draggedLibraryStoryId) return;
    await assignLibraryStoryToCategory(draggedLibraryStoryId, categoryId);
  }

  async function deleteLibraryStory(entry: LibraryProjectSummary) {
    const ok = window.confirm(`Verhaal "${entry.title}" uit de SQL-bibliotheek verwijderen? Het JSON-bestand op schijf blijft staan.`);
    if (!ok) return;
    setLibraryBusy(true);
    try {
      await deleteLibraryProject(apiBase, entry.id);
      if (currentLibraryProjectId === entry.id) {
        setCurrentLibraryProjectId("");
      }
      if (sequelSourceId === entry.id) {
        clearSequelSource();
      }
      setReferenceStoryIds((current) => current.filter((id) => id !== entry.id));
      setReferenceStoryProjects((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      await refreshLibrary(false);
      await refreshCategories(false);
      setNotice(`${entry.title} is verwijderd uit SQL.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "SQL-verhaal kon niet worden verwijderd.");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function toggleReferenceStory(entry: LibraryProjectSummary) {
    if (referenceStoryIds.includes(entry.id)) {
      setReferenceStoryIds((current) => current.filter((id) => id !== entry.id));
      setReferenceStoryProjects((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      setNotice(`${entry.title} is geen referentie meer.`);
      return;
    }

    setLibraryBusy(true);
    try {
      const response = await openLibraryProject(apiBase, entry.id);
      if (!isBookProject(response.project)) {
        throw new Error("Dit SQL-record is geen geldig BookReader-project.");
      }
      setReferenceStoryProjects((current) => ({
        ...current,
        [entry.id]: {
          title: response.project.title || entry.title,
          rawText: response.project.rawText || "",
        },
      }));
      setReferenceStoryIds((current) => (current.includes(entry.id) ? current : [...current, entry.id]));
      setNotice(`${entry.title} toegevoegd als referentie.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Referentieverhaal kon niet worden geladen.");
    } finally {
      setLibraryBusy(false);
    }
  }

  function clearDatabaseReferences() {
    setReferenceStoryIds([]);
    setReferenceStoryProjects({});
    setNotice("Database-referenties gewist.");
  }

  async function importJsonToLibrary() {
    setLibraryBusy(true);
    try {
      const response = await importJsonProjectsToLibrary(apiBase);
      await refreshLibrary(false);
      await refreshCategories(false);
      const message = `${response.imported} JSON-verhalen in SQL gezet`;
      setLibraryStatus(message);
      setNotice(message);
      await refreshProjectFiles(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "JSON-verhalen konden niet naar SQL worden geïmporteerd.";
      setLibraryStatus("import mislukt");
      setNotice(message);
    } finally {
      setLibraryBusy(false);
    }
  }

  async function openLibraryStory(entry: LibraryProjectSummary) {
    setProjectBusy(true);
    try {
      const response = await openLibraryProject(apiBase, entry.id);
      if (!isBookProject(response.project)) {
        throw new Error("Dit SQL-record is geen geldig BookReader-project.");
      }
      loadBookProject(response.project, entry.id);
      setNotice(`${entry.title} geopend uit SQL-bibliotheek.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "SQL-verhaal kon niet worden geopend.");
    } finally {
      setProjectBusy(false);
    }
  }

  async function chooseSequelSource(projectId: string) {
    if (!projectId) {
      clearSequelSource();
      return;
    }
    setLibraryBusy(true);
    setSequelStatus("vervolgbron wordt geladen...");
    try {
      const response = await openLibraryProject(apiBase, projectId);
      if (!isBookProject(response.project)) {
        throw new Error("Dit SQL-record is geen geldig BookReader-project.");
      }
      const summary = response.summary || libraryStories.find((entry) => entry.id === projectId);
      setSequelSourceId(projectId);
      setSequelSourceTitle(response.project.title || summary?.title || "Gekozen verhaal");
      setSequelSourceText(response.project.rawText || "");
      setSequelSourceCategoryIds(summary?.categoryIds || []);
      setSequelStatus(`vervolg op: ${response.project.title || summary?.title || "gekozen verhaal"}`);
      setNotice(`Vervolgbron gekozen: ${response.project.title || summary?.title || "gekozen verhaal"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vervolgbron kon niet worden geladen.";
      setSequelStatus(message);
      setNotice(message);
    } finally {
      setLibraryBusy(false);
    }
  }

  function chooseCurrentStoryAsSequelSource() {
    if (!rawText.trim()) {
      setNotice("Er is geen huidig verhaal om als vervolgbron te gebruiken.");
      return;
    }
    const active = libraryStories.find((entry) => entry.id === currentLibraryProjectId);
    setSequelSourceId(currentLibraryProjectId);
    setSequelSourceTitle(documentTitle || "Huidig verhaal");
    setSequelSourceText(rawText);
    setSequelSourceCategoryIds(active?.categoryIds || []);
    setSequelStatus(`vervolg op huidig verhaal: ${documentTitle || "Huidig verhaal"}`);
    setNotice("Het huidige verhaal is ingesteld als vervolgbron.");
  }

  function clearSequelSource() {
    setSequelSourceId("");
    setSequelSourceTitle("");
    setSequelSourceText("");
    setSequelSourceCategoryIds([]);
    setSequelStatus("geen vervolgbron");
  }

  async function openProjectFileEntry(entry: ProjectFileSummary) {
    setProjectBusy(true);
    try {
      const response = await openProjectFile(apiBase, entry.id);
      if (!isBookProject(response.project)) {
        throw new Error("Dit JSON-bestand is geen geldig BookReader-project.");
      }
      loadBookProject(response.project);
      saveStoryToLibrary(response.project);
      setNotice(`${entry.fileName} geopend uit JSON-bestand.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "JSON-verhaal kon niet worden geopend.");
    } finally {
      setProjectBusy(false);
    }
  }

  return (
    <main className={`app-shell ${workspaceTab === "bookMaker" ? "book-maker-app" : ""}`}>
      <div className="workspace-switcher" aria-label="Werkruimte">
        <button
          type="button"
          className={workspaceTab === "reader" ? "" : "quiet"}
          onClick={() => setWorkspaceTab("reader")}
        >
          <BookOpen size={16} />
          <span>Lezer</span>
        </button>
        <button
          type="button"
          className={workspaceTab === "bookMaker" ? "" : "quiet"}
          onClick={() => setWorkspaceTab("bookMaker")}
        >
          <BookImage size={16} />
          <span>Boek maker</span>
        </button>
      </div>
      {workspaceTab === "bookMaker" ? (
        <section className="book-maker-shell">
          <header className="book-maker-header">
            <div>
              <span className="eyebrow">Talle Wintrip</span>
              <h2>Boek maker</h2>
            </div>
            <div className="book-maker-controls">
              <label className="field compact-field">
                <span>AI-bron</span>
                <select value={aiProvider} onChange={(event) => setAiProvider(event.target.value as AiProvider)}>
                  <option value="local">Lokale Ollama</option>
                  <option value="deepseek">DeepSeek API</option>
                  <option value="grok">Grok API</option>
                </select>
              </label>
              <label className="field compact-field model-field">
                <span>{aiProviderModelLabel(aiProvider)}</span>
                <select
                  value={selectedAiModel}
                  onChange={(event) => {
                    if (normalizedAiProvider === "deepseek") {
                      setSelectedApiModel(event.target.value);
                    } else if (normalizedAiProvider === "grok") {
                      setSelectedGrokModel(event.target.value);
                    } else {
                      setSelectedLocalModel(event.target.value);
                    }
                  }}
                  disabled={!activeModelOptions.length && !selectedAiModel}
                >
                  {activeModelOptions.length ? (
                    activeModelOptions.map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Geen modellen gevonden</option>
                  )}
                </select>
              </label>
              <button
                type="button"
                className="quiet icon-button model-refresh-button"
                onClick={() => void refreshModelCatalog(true)}
                disabled={modelCatalogBusy}
                title="Modellen vernieuwen"
                aria-label="Modellen vernieuwen"
              >
                {modelCatalogBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
              </button>
            </div>
          </header>

          {notice ? <div className="notice">{notice}</div> : null}

          <div className="book-maker-grid">
            <section className="tool-panel book-maker-interview">
              <div className="panel-title">
                <Sparkles size={17} />
                <span>Interview</span>
              </div>
              <figure className="talle-portrait">
                <img src="/assets/talle-wintrip.jpeg" alt="Talle Wintrip" />
                <figcaption>Talle Wintrip</figcaption>
              </figure>
              <div className="talle-transcript">
                {bookMakerMessages.map((message, index) => (
                  <article className={`talle-message ${message.role}`} key={`${message.role}-${index}`}>
                    <small>{message.role === "talle" ? "Talle" : "John"}</small>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>
              <label className="field">
                <span>Antwoord</span>
                <textarea
                  value={bookMakerInput}
                  onChange={(event) => setBookMakerInput(event.target.value)}
                  rows={6}
                  placeholder="Vertel Talle wat je ziet, wie erbij is, wat er gebeurt..."
                />
              </label>
              <div className="button-row">
                <button type="button" onClick={() => void sendBookMakerAnswer()} disabled={bookMakerBusy || !bookMakerInput.trim()}>
                  {bookMakerBusy ? <Loader2 size={16} /> : <Sparkles size={16} />}
                  <span>{bookMakerBusy ? "Luistert..." : "Stuur naar Talle"}</span>
                </button>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => void finishBookMakerSession()}
                  disabled={bookMakerBusy || storyBusy || !bookMakerMessages.some((message) => message.role === "john")}
                >
                  {bookMakerBusy || storyBusy ? <Loader2 size={16} /> : <Wand2 size={16} />}
                  <span>Afronden</span>
                </button>
                <button type="button" className="quiet" onClick={resetBookMakerSession} disabled={bookMakerBusy || storyBusy}>
                  <Trash2 size={16} />
                  <span>Nieuw</span>
                </button>
              </div>
              <p className="voice-style-note">{bookMakerStatus}</p>
            </section>

            <aside className="tool-panel book-maker-brief">
              <div className="panel-title">
                <FileText size={17} />
                <span>Prompt</span>
              </div>
              <div className="button-row">
                <label className="field compact-field">
                  <span>Hoofdstukken</span>
                  <select value={6} disabled>
                    <option value={6}>6</option>
                  </select>
                </label>
                <label className="field compact-field">
                  <span>Beeldmaker</span>
                  <select value="grok" disabled>
                    <option value="grok">Grok Imagine</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Grok beeldmodel</span>
                <select
                  value={selectedGrokImageModel}
                  onChange={(event) => setSelectedGrokImageModel(event.target.value)}
                  disabled={!grokImageModelOptions.length && !selectedGrokImageModel}
                >
                  {grokImageModelOptions.length ? (
                    grokImageModelOptions.map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Geen beeldmodellen gevonden</option>
                  )}
                </select>
              </label>
              <label className="field">
                <span>Laatste sessieprompt</span>
                <textarea value={bookMakerPromptPreview || storyPrompt} onChange={(event) => setBookMakerPromptPreview(event.target.value)} rows={14} />
              </label>
              <div className="context-brief">
                <small>AI</small>
                <p>
                  {aiProviderLabel(aiProvider)} · {activeModelLabel}
                </p>
                <small>Illustraties</small>
                <p>{apiHealth?.xaiApi?.configured ? "Grok key opgeslagen" : "Grok key ontbreekt"}</p>
              </div>
            </aside>
          </div>
        </section>
      ) : (
      <>
      <aside className="reader-sidebar">
        <div className="brand-block">
          <BookOpen size={28} />
          <div>
            <h1>BookReader</h1>
            <span>{stats.totalWords.toLocaleString("nl-NL")} woorden</span>
          </div>
        </div>

        <section className="tool-panel saved-stories-panel">
          <div className="panel-title">
            <Clock size={17} />
            <span>Verhalen</span>
          </div>
          <button type="button" className="quiet" onClick={() => void refreshLibrary(true)} disabled={libraryBusy}>
            {libraryBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>Scan SQL</span>
          </button>
          <button type="button" className="quiet" onClick={() => void importJsonToLibrary()} disabled={libraryBusy}>
            {libraryBusy ? <Loader2 size={16} /> : <Save size={16} />}
            <span>JSON naar SQL</span>
          </button>
          <button type="button" className="quiet" onClick={() => void refreshProjectFiles(true)} disabled={projectScanBusy}>
            {projectScanBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>Scan JSON</span>
          </button>
          <div className="button-row">
            <label className="field compact-field">
              <span>Categorie</span>
              <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
                <option value="">Alle SQL-verhalen</option>
                {libraryCategories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name} ({category.projectCount})
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Nieuwe categorie</span>
              <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
            </label>
            <button
              type="button"
              className="quiet icon-button model-refresh-button"
              onClick={() => void createCategory()}
              disabled={libraryBusy || !newCategoryName.trim()}
              title="Categorie maken"
              aria-label="Categorie maken"
            >
              <Plus size={16} />
            </button>
          </div>
          {libraryCategories.length ? (
            <div className="category-drop-list">
              {libraryCategories.map((category) => (
                <button
                  type="button"
                  className={`quiet category-drop-zone ${draggedLibraryStoryId ? "drop-ready" : ""}`}
                  key={category.id}
                  onClick={() => setSelectedCategoryId(category.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void dropStoryOnCategory(category.id);
                  }}
                  title="Sleep een SQL-verhaal hierheen om het in deze categorie te plaatsen"
                >
                  <Tag size={14} />
                  <span>{category.name}</span>
                  <small>{category.projectCount}</small>
                </button>
              ))}
            </div>
          ) : null}
          <div className="button-row">
            <label className="field compact-field">
              <span>Plaats huidig in</span>
              <select value={assignCategoryId} onChange={(event) => setAssignCategoryId(event.target.value)} disabled={!libraryCategories.length}>
                {libraryCategories.length ? (
                  libraryCategories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))
                ) : (
                  <option value="">Geen categorieën</option>
                )}
              </select>
            </label>
            <button type="button" className="quiet" onClick={() => void assignCurrentStoryToCategory()} disabled={libraryBusy || !assignCategoryId || !rawText.trim()}>
              {libraryBusy ? <Loader2 size={16} /> : <Tag size={16} />}
              <span>Plaats</span>
            </button>
          </div>
          {activeStoryCategoryNames ? <p className="voice-style-note">Huidig verhaal: {activeStoryCategoryNames}</p> : null}
          {referenceStoryIds.length ? (
            <div className="button-row">
              <p className="voice-style-note reference-count">{referenceStoryIds.length} databaseverhaal als referentie</p>
              <button type="button" className="quiet" onClick={clearDatabaseReferences}>
                <Trash2 size={16} />
                <span>Wis refs</span>
              </button>
            </div>
          ) : null}
          {visibleLibraryStories.length || (!selectedCategoryId && (localStoryEntries.length || scannedStoryFiles.length)) ? (
            <div className="saved-story-list">
              {visibleLibraryStories.map((entry) => (
                <article
                  className="saved-story-item library-story-item"
                  draggable
                  key={entry.id}
                  onDragStart={() => setDraggedLibraryStoryId(entry.id)}
                  onDragEnd={() => setDraggedLibraryStoryId("")}
                >
                  <label className="reference-toggle" title="Gebruik dit verhaal als referentie">
                    <input
                      type="checkbox"
                      checked={referenceStoryIds.includes(entry.id)}
                      onChange={() => void toggleReferenceStory(entry)}
                    />
                    <span>Ref</span>
                  </label>
                  <button type="button" className="saved-story-open quiet" onClick={() => void openLibraryStory(entry)} title={entry.sourcePath || entry.title}>
                    <strong>{entry.title}</strong>
                    <small>
                      SQL · {formatSavedAt(entry.savedAt)} · {entry.wordCount.toLocaleString("nl-NL")} woorden · {entry.chapterCount} hoofdstukken
                    </small>
                    <span>{entry.categories.length ? `${entry.categories.map((category) => category.name).join(", ")} · ${entry.preview}` : entry.preview}</span>
                  </button>
                  <button type="button" className="quiet icon-button" onClick={() => void chooseSequelSource(entry.id)} title="Maak vervolg op dit verhaal">
                    <ArrowRight size={15} />
                  </button>
                  <button type="button" className="quiet icon-button" onClick={() => void deleteLibraryStory(entry)} disabled={libraryBusy} title="Verwijder uit SQL">
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
              {!selectedCategoryId ? localStoryEntries.map((entry) => (
                <article className="saved-story-item" key={entry.id}>
                  <button type="button" className="saved-story-open quiet" onClick={() => openSavedStory(entry)} title={entry.title}>
                    <strong>{entry.title}</strong>
                    <small>
                      Browser · {formatSavedAt(entry.savedAt)} · {entry.wordCount.toLocaleString("nl-NL")} woorden · {entry.chapterCount} hoofdstukken
                    </small>
                    <span>{entry.preview}</span>
                  </button>
                  <button type="button" className="quiet icon-button" onClick={() => deleteSavedStory(entry.id)} title="Verwijder uit lijst">
                    <Trash2 size={15} />
                  </button>
                </article>
              )) : null}
              {!selectedCategoryId ? scannedStoryFiles.map((entry) => (
                <article className="saved-story-item file-story-item" key={entry.id}>
                  <button type="button" className="saved-story-open quiet" onClick={() => void openProjectFileEntry(entry)} title={entry.filePath}>
                    <strong>{entry.title}</strong>
                    <small>
                      JSON · {formatSavedAt(entry.savedAt)} · {entry.wordCount.toLocaleString("nl-NL")} woorden · {entry.chapterCount} hoofdstukken
                    </small>
                    <span>{entry.fileName}</span>
                  </button>
                </article>
              )) : null}
            </div>
          ) : (
            <p className="voice-style-note">Nog geen opgeslagen verhalen. {libraryStatus}; {projectScanStatus}</p>
          )}
          {visibleLibraryStories.length || (!selectedCategoryId && (localStoryEntries.length || scannedStoryFiles.length)) ? (
            <p className="voice-style-note">
              {libraryStatus}; {projectScanStatus}
            </p>
          ) : null}
        </section>

        <section className="tool-panel">
          <label className="field">
            <span>Titel</span>
            <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} />
          </label>

          <div
            className="drop-zone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
          >
            {isParsing ? <Loader2 size={22} /> : <Upload size={22} />}
            <strong>TXT / DOCX / PDF / Project</strong>
            <span>max. {WORD_LIMIT_LABEL} woorden</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={PROJECT_ACCEPT}
            onChange={handleFileInput}
            hidden
          />

          <label className="field">
            <span>Tekst</span>
            <textarea value={rawText} onChange={(event) => setRawText(event.target.value)} rows={8} />
          </label>

          <div className="button-row">
            <label className="field compact-field">
              <span>Hoofdstukken</span>
              <select value={chapterTargetCount} onChange={(event) => setChapterTargetCount(Number(event.target.value))}>
                {[4, 6, 8, 10, 12, 16, 20, 24, 32].map((count) => (
                  <option value={count} key={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={refreshFromText}>
              <Clipboard size={16} />
              <span>Verdeel</span>
            </button>
            <button type="button" className="quiet" onClick={() => void repartitionStoryWithAi()} disabled={chapteringBusy || !rawText.trim()}>
              {chapteringBusy ? <Loader2 size={16} /> : <Wand2 size={16} />}
              <span>{chapteringBusy ? "Verdeelt..." : "AI hoofdstukken"}</span>
            </button>
            <button type="button" className="quiet" onClick={() => fileInputRef.current?.click()}>
              <FolderOpen size={16} />
              <span>Open</span>
            </button>
            <button type="button" className="quiet" onClick={() => void saveProject()} disabled={projectBusy}>
              {projectBusy ? <Loader2 size={16} /> : <Save size={16} />}
              <span>Opslaan</span>
            </button>
            <button type="button" className="quiet" onClick={clearDocument}>
              <Trash2 size={16} />
              <span>Wis</span>
            </button>
          </div>
          <p className="voice-style-note">{chapteringStatus}</p>
        </section>

        <section className="tool-panel">
          <div className="panel-title">
            <FileText size={17} />
            <span>Verhaal maken</span>
          </div>
          <button type="button" className="quiet" onClick={promptBuilderOpen ? () => setPromptBuilderOpen(false) : openPromptBuilder}>
            <Sparkles size={16} />
            <span>{promptBuilderOpen ? "Prompt sluiten" : storyPrompt.trim() ? "Prompt bekijken / aanpassen" : "Prompt maken"}</span>
          </button>
          {promptBuilderOpen ? (
            <div className="context-brief">
              <label className="field">
                <span>What are the characters? (name / age / gender)</span>
                <textarea value={promptCharacters} onChange={(event) => setPromptCharacters(event.target.value)} rows={3} />
              </label>
              <label className="field">
                <span>What is the plot?</span>
                <textarea value={promptPlot} onChange={(event) => setPromptPlot(event.target.value)} rows={4} />
              </label>
              <label className="field">
                <span>What is the main event to be focused on?</span>
                <textarea value={promptMainEvent} onChange={(event) => setPromptMainEvent(event.target.value)} rows={3} />
              </label>
              <div className="button-row">
                <button type="button" className="quiet" onClick={updatePromptDraftFromAnswers}>
                  <RefreshCw size={16} />
                  <span>Update prompt from answers</span>
                </button>
              </div>
              <label className="field">
                <span>Editable generated prompt</span>
                <textarea value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} rows={8} />
              </label>
              <div className="button-row">
                <button type="button" onClick={saveGuidedPrompt}>
                  <Save size={16} />
                  <span>Save prompt</span>
                </button>
                <button type="button" className="quiet" onClick={() => setPromptBuilderOpen(false)}>
                  <Trash2 size={16} />
                  <span>Close</span>
                </button>
              </div>
            </div>
          ) : null}
          {storyPrompt.trim() && !promptBuilderOpen ? (
            <div className="context-brief">
              <small>Saved prompt</small>
              <p>{storyPrompt}</p>
            </div>
          ) : null}
          <label className="field">
            <span>Vervolg op</span>
            <select value={sequelSourceId} onChange={(event) => void chooseSequelSource(event.target.value)} disabled={libraryBusy || !libraryStories.length}>
              <option value="">Geen vervolgbron</option>
              {libraryStories.map((entry) => (
                <option value={entry.id} key={entry.id}>
                  {entry.title} · {formatSavedAt(entry.savedAt)}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button type="button" className="quiet" onClick={chooseCurrentStoryAsSequelSource} disabled={!rawText.trim()}>
              <ArrowRight size={16} />
              <span>Vervolg huidig</span>
            </button>
            <button type="button" className="quiet" onClick={clearSequelSource} disabled={!sequelSourceText}>
              <Trash2 size={16} />
              <span>Wis vervolg</span>
            </button>
          </div>
          <p className="voice-style-note">{sequelStatus}</p>
          <label className="field">
            <span>Genre</span>
            <input value={storyGenre} onChange={(event) => setStoryGenre(event.target.value)} />
          </label>
          <label className="field">
            <span>Verteltoon</span>
            <input value={storyTone} onChange={(event) => setStoryTone(event.target.value)} />
          </label>
          <button
            type="button"
            className={`quiet preset-button ${storyNarrativePreset === "rich_intro" ? "active" : ""}`}
            onClick={applyRichIntroPreset}
            aria-pressed={storyNarrativePreset === "rich_intro"}
            title="Zet de verhaalinstellingen op meer detail, meer woorden en een langere introductie"
          >
            <Sparkles size={16} />
            <span>Veel details + lange intro</span>
          </button>
          <div className="button-row">
            <button type="button" className="quiet" onClick={() => referenceInputRef.current?.click()}>
              <FolderOpen size={16} />
              <span>Referentie</span>
            </button>
            <button type="button" className="quiet" onClick={() => void saveUploadedReferenceToDatabase()} disabled={libraryBusy || !referenceText.trim()}>
              {libraryBusy ? <Loader2 size={16} /> : <Save size={16} />}
              <span>Bewaar ref</span>
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setReferenceTitle("");
                setReferenceText("");
                setReferenceStatus("geen referentie");
              }}
              disabled={!referenceText}
            >
              <Trash2 size={16} />
              <span>Wis ref</span>
            </button>
          </div>
          <input
            ref={referenceInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={handleReferenceInput}
            hidden
          />
          <p className="voice-style-note">{referenceStatus}</p>
          {referenceStoryIds.length ? (
            <p className="voice-style-note">
              {referenceStoryIds.length} databaseverhaal geselecteerd als referentie:{" "}
              {referenceStoryIds.map((id) => referenceStoryProjects[id]?.title).filter(Boolean).join(", ")}
            </p>
          ) : null}
          <div className="button-row">
            <label className="field compact-field">
              <span>Pagina's</span>
              <select value={storyPages} onChange={(event) => setStoryPages(Number(event.target.value))}>
                {[2, 4, 6, 8, 12, 16, 24].map((pages) => (
                  <option value={pages} key={pages}>
                    {pages}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Woorden</span>
              <select value={storyWordsPerPage} onChange={(event) => setStoryWordsPerPage(Number(event.target.value))}>
                {[350, 550, 750, 1000].map((words) => (
                  <option value={words} key={words}>
                    {words}/pagina
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Taal</span>
              <select value={storyLanguage} onChange={(event) => setStoryLanguage(event.target.value as StoryLanguage)}>
                {(["Auto", "Nederlands", "English", "Deutsch", "Français", "Español"] as StoryLanguage[]).map((language) => (
                  <option value={language} key={language}>
                    {language}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Werkstand</span>
              <select value={storyMode} onChange={(event) => setStoryMode(event.target.value as "fast" | "deep")}>
                <option value="fast">Kort</option>
                <option value="deep">Uitgebreid</option>
              </select>
            </label>
            <label className="field compact-field">
              <span>AI-bron</span>
              <select value={aiProvider} onChange={(event) => setAiProvider(event.target.value as AiProvider)}>
                <option value="local">Lokale Ollama</option>
                <option value="deepseek">DeepSeek API</option>
                <option value="grok">Grok API</option>
              </select>
            </label>
            <label className="field compact-field model-field">
              <span>{aiProviderModelLabel(aiProvider)}</span>
              <select
                value={selectedAiModel}
                onChange={(event) => {
                  if (normalizedAiProvider === "deepseek") {
                    setSelectedApiModel(event.target.value);
                  } else if (normalizedAiProvider === "grok") {
                    setSelectedGrokModel(event.target.value);
                  } else {
                    setSelectedLocalModel(event.target.value);
                  }
                }}
                disabled={!activeModelOptions.length && !selectedAiModel}
              >
                {activeModelOptions.length ? (
                  activeModelOptions.map((model) => (
                    <option value={model.id} key={model.id}>
                      {model.label}
                    </option>
                  ))
                ) : (
                  <option value="">Geen modellen gevonden</option>
                )}
              </select>
            </label>
            <button
              type="button"
              className="quiet icon-button model-refresh-button"
              onClick={() => void refreshModelCatalog(true)}
              disabled={modelCatalogBusy}
              title="Modellen vernieuwen"
              aria-label="Modellen vernieuwen"
            >
              {modelCatalogBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            </button>
          </div>
          <button type="button" onClick={() => void createStoryFromPrompt()} disabled={storyBusy || !storyPrompt.trim()}>
            {storyBusy ? <Loader2 size={16} /> : <Wand2 size={16} />}
            <span>{storyBusy ? "Schrijft..." : "Maak verhaal"}</span>
          </button>
          <p className="voice-style-note">{storyStatus}</p>
        </section>

        <section className="tool-panel film-panel">
          <div className="panel-title">
            <Film size={17} />
            <span>Filmstudio</span>
          </div>
          <div className="button-row">
            <label className="field compact-field">
              <span>Lengte</span>
              <select value={filmTargetMinutes} onChange={(event) => setFilmTargetMinutes(Number(event.target.value))}>
                {[5, 7, 10].map((minutes) => (
                  <option value={minutes} key={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Scènes</span>
              <select value={filmSceneCount} onChange={(event) => setFilmSceneCount(Number(event.target.value))}>
                {[8, 10, 12, 16, 20, 24].map((count) => (
                  <option value={count} key={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact-field">
              <span>Werkstand</span>
              <select value={filmMode} onChange={(event) => setFilmMode(event.target.value as "fast" | "deep")}>
                <option value="fast">Snel</option>
                <option value="deep">Diep</option>
              </select>
            </label>
          </div>
          <p className="voice-style-note">
            AI: {aiProviderLabel(aiProvider)} · {activeModelLabel}
          </p>
          <button type="button" onClick={() => void createFilmPlan()} disabled={filmBusy || !rawText.trim()}>
            {filmBusy ? <Loader2 size={16} /> : <Film size={16} />}
            <span>{filmBusy ? "Regisseert..." : "Maak filmplan"}</span>
          </button>
          <p className="voice-style-note">{filmStatus}</p>
          {filmPlan ? (
            <div className="film-plan">
              <div className="film-plan-summary">
                <strong>{filmPlan.title}</strong>
                <span>
                  {formatDuration(filmPlan.totalDurationSeconds)} · {filmPlan.scenes.length} scènes
                </span>
                <p>{filmPlan.logline}</p>
              </div>
              {filmPlan.continuityBible?.summary ? (
                <div className="context-brief">
                  <p>{filmPlan.continuityBible.summary}</p>
                </div>
              ) : null}
              <div className="film-scene-list">
                {filmPlan.scenes.map((scene, index) => (
                  <article className="film-scene-card" key={scene.id || index}>
                    <header>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{scene.title}</strong>
                        <small>
                          {formatDuration(scene.durationSeconds)} · {scene.location || "locatie onbekend"}
                        </small>
                      </div>
                    </header>
                    <p>{scene.action}</p>
                    {scene.voiceOver ? <small>Voice-over: {scene.voiceOver}</small> : null}
                    {scene.camera ? <small>Camera: {scene.camera}</small> : null}
                    {scene.visualPrompt ? (
                      <button type="button" className="quiet" onClick={() => void copyFilmPrompt(scene.visualPrompt)}>
                        <Clipboard size={15} />
                        <span>Kopieer videoprompt</span>
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="tool-panel">
          <div className="panel-title">
            <Server size={17} />
            <span>Serverlaag</span>
          </div>
          <label className="field">
            <span>API-basis</span>
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="http://127.0.0.1:1433" />
          </label>
          <label className="field">
            <span>DeepSeek API key</span>
            <input
              type="password"
              value={deepSeekApiKeyInput}
              onChange={(event) => setDeepSeekApiKeyInput(event.target.value)}
              placeholder={apiHealth?.deepseekApi?.configured ? "opgeslagen" : "sk-..."}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="button-row">
            <button type="button" className="quiet" onClick={() => void saveDeepSeekKey()} disabled={deepSeekKeyBusy || !deepSeekApiKeyInput.trim()}>
              {deepSeekKeyBusy ? <Loader2 size={16} /> : <Save size={16} />}
              <span>Key opslaan</span>
            </button>
            <button type="button" className="quiet" onClick={() => void clearDeepSeekKey()} disabled={deepSeekKeyBusy || !apiHealth?.deepseekApi?.configured}>
              <Trash2 size={16} />
              <span>Wis key</span>
            </button>
          </div>
          <label className="field">
            <span>Grok API key</span>
            <input
              type="password"
              value={xaiApiKeyInput}
              onChange={(event) => setXaiApiKeyInput(event.target.value)}
              placeholder={apiHealth?.xaiApi?.configured ? "opgeslagen" : "xai-..."}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="button-row">
            <button type="button" className="quiet" onClick={() => void saveXaiKey()} disabled={xaiKeyBusy || !xaiApiKeyInput.trim()}>
              {xaiKeyBusy ? <Loader2 size={16} /> : <Save size={16} />}
              <span>Grok key opslaan</span>
            </button>
            <button type="button" className="quiet" onClick={() => void clearXaiKey()} disabled={xaiKeyBusy || !apiHealth?.xaiApi?.configured}>
              <Trash2 size={16} />
              <span>Wis Grok key</span>
            </button>
          </div>
          <button type="button" className="quiet" onClick={() => void refreshApiHealth(true)} disabled={apiBusy}>
            {apiBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>Status</span>
          </button>
          <div className={`server-status ${apiOnline ? "online" : "offline"}`}>
            <span>{apiStatus}</span>
            <small>
              {apiHealth?.tts?.voices?.length ?? 0} Piper-stemmen, snel {apiHealth?.context?.model || "onbekend"}, diep{" "}
              {apiHealth?.context?.deepModel || "onbekend"}, DeepSeek {apiHealth?.deepseekApi?.configured ? apiHealth.deepseekApi.storyModel : "geen key"}, Grok{" "}
              {apiHealth?.xaiApi?.configured ? apiHealth.xaiApi.filmModel : "geen key"}, Grok beeld{" "}
              {apiHealth?.xaiApi?.configured ? apiHealth.xaiApi.imageModel || "standaard" : "geen key"},{" "}
              {apiHealth?.storage?.audioFiles ?? 0} audiofiles, {apiHealth?.storage?.imageFiles ?? 0} beelden
            </small>
            <small>{modelCatalogStatus}</small>
          </div>
        </section>

        <section className="tool-panel">
          <div className="panel-title">
            <Volume2 size={17} />
            <span>Stem</span>
          </div>
          <label className="field">
            <span>Voorleeslaag</span>
            <select value={ttsProvider} onChange={(event) => setTtsProvider(event.target.value as TtsProvider)}>
              <option value="browser">Lokale stem</option>
              <option value="server">Server TTS</option>
            </select>
          </label>
          <label className="field">
            <span>Voice</span>
            <select value={voiceURI} onChange={(event) => setVoiceURI(event.target.value)}>
              {voices.length ? (
                voices.map((voice) => (
                  <option value={voice.voiceURI} key={voice.voiceURI}>
                    {voice.name} ({voice.lang})
                  </option>
                ))
              ) : (
                <option value="">Geen lokale stemmen gevonden</option>
              )}
            </select>
          </label>
          {ttsProvider === "server" ? (
            <label className="field">
              <span>Piper stem</span>
              <select value={serverVoiceId} onChange={(event) => setServerVoiceId(event.target.value)}>
                {apiHealth?.tts?.voices?.length ? (
                  apiHealth.tts.voices.map((voice) => (
                    <option value={voice.id} key={voice.id}>
                      {voice.label}
                    </option>
                  ))
                ) : (
                  <option value="">Geen Piper-modellen gevonden</option>
                )}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Vertelstijl</span>
            <select value={voiceStyleId} onChange={(event) => applyVoiceStyle(event.target.value)}>
              {VOICE_STYLES.map((style) => (
                <option value={style.id} key={style.id}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <p className="voice-style-note">{selectedVoiceStyle.description}</p>
          <label className="range-field">
            <span>Snelheid {rate.toFixed(1)}</span>
            <input type="range" min="0.6" max="1.6" step="0.1" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
          </label>
          <label className="range-field">
            <span>Toonhoogte {pitch.toFixed(1)}</span>
            <input type="range" min="0.7" max="1.4" step="0.1" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} />
          </label>
          <p className="voice-style-note">Extra stemmen komen uit de lokale stemmen van je systeem of browserwebview.</p>
        </section>

        <section className="tool-panel">
          <div className="panel-title">
            <Image size={17} />
            <span>Illustratie</span>
          </div>
          <label className="field">
            <span>Stijl</span>
            <select value={illustrationStyleId} onChange={(event) => setIllustrationStyleId(event.target.value as IllustrationStyleId)}>
              {ILLUSTRATION_STYLES.map((style) => (
                <option value={style.id} key={style.id}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <label className="field compact-field">
              <span>Beeldmaker</span>
              <select value={imageProvider} onChange={(event) => setImageProvider(event.target.value as ImageProvider)}>
                <option value="comfy">ComfyUI lokaal</option>
                <option value="grok">Grok Imagine</option>
              </select>
            </label>
            {imageProvider === "grok" ? (
              <label className="field compact-field model-field">
                <span>Grok beeldmodel</span>
                <select
                  value={selectedGrokImageModel}
                  onChange={(event) => setSelectedGrokImageModel(event.target.value)}
                  disabled={!grokImageModelOptions.length && !selectedGrokImageModel}
                >
                  {grokImageModelOptions.length ? (
                    grokImageModelOptions.map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Geen beeldmodellen gevonden</option>
                  )}
                </select>
              </label>
            ) : null}
          </div>
          <button type="button" className="quiet" onClick={() => void runDeepSeekContextAnalysis("fast")} disabled={contextBusy || !rawText.trim()}>
            {contextBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>{contextBusy ? "Analyseert..." : "Snelle context"}</span>
          </button>
          <button type="button" className="quiet" onClick={() => void runDeepSeekContextAnalysis("deep")} disabled={contextBusy || !rawText.trim()}>
            {contextBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>{normalizeAiProvider(aiProvider) === "local" ? "Diepe context" : "Diepe context API"}</span>
          </button>
          <p className="voice-style-note">{contextStatus}</p>
          <label className="field">
            <span>Prompt</span>
            <textarea value={illustrationPrompt} onChange={(event) => setIllustrationPrompt(event.target.value)} rows={5} />
          </label>
          <button type="button" onClick={() => void createIllustration()} disabled={!selectedChapter || illustrationBusy}>
            {illustrationBusy ? <Loader2 size={16} /> : <Wand2 size={16} />}
            <span>{illustrationBusy ? "Rendert..." : "Maak illustratie"}</span>
          </button>
          <p className="voice-style-note">{illustrationStatus}</p>
          <p className="voice-style-note">{assetStorageStatus}</p>
        </section>

        <section className="tool-panel">
          <div className="panel-title">
            <BookImage size={17} />
            <span>Boekcover</span>
          </div>
          {bookCover.imageUrl ? (
            <figure className="asset-preview cover-preview">
              <img src={bookCover.imageUrl} alt={`Cover voor ${documentTitle}`} />
            </figure>
          ) : null}
          <label className="field">
            <span>Coverprompt</span>
            <textarea value={bookCover.prompt} onChange={(event) => setBookCover((previous) => ({ ...previous, prompt: event.target.value }))} rows={5} />
          </label>
          <button type="button" onClick={() => void createBookCover()} disabled={!chapters.length || coverBusy}>
            {coverBusy ? <Loader2 size={16} /> : <Wand2 size={16} />}
            <span>{coverBusy ? "Rendert..." : "Maak cover"}</span>
          </button>
          <p className="voice-style-note">{coverStatus}</p>
        </section>

        <section className="tool-panel">
          <div className="panel-title">
            <Users size={17} />
            <span>Karakters</span>
          </div>
          <button type="button" className="quiet" onClick={detectCharacters} disabled={!rawText.trim()}>
            <RefreshCw size={16} />
            <span>DeepSeek karakters</span>
          </button>
          <button type="button" className="quiet" onClick={detectCharactersHeuristic} disabled={!rawText.trim()}>
            <Search size={16} />
            <span>Snelle scan</span>
          </button>
          {contextAnalysis?.storySummary || contextAnalysis?.world ? (
            <div className="context-brief">
              {contextAnalysis.storySummary ? <p>{contextAnalysis.storySummary}</p> : null}
              {contextAnalysis.world ? <small>{contextAnalysis.world}</small> : null}
              {contextAnalysis.sceneBrief?.moment ? <small>Scene: {contextAnalysis.sceneBrief.moment}</small> : null}
              {contextAnalysis.sceneBrief?.location ? <small>Locatie: {contextAnalysis.sceneBrief.location}</small> : null}
              {contextAnalysis.sceneBrief?.mustShow?.length ? <small>Moet zichtbaar zijn: {contextAnalysis.sceneBrief.mustShow.join(", ")}</small> : null}
            </div>
          ) : null}
          <div className="portrait-list">
            {characterPortraits.length ? (
              characterPortraits.map((character) => (
                <article className="portrait-card" key={character.id}>
                  {character.imageUrl ? <img src={character.imageUrl} alt={`Portret van ${character.name}`} /> : null}
                  <label className="field">
                    <span>Naam</span>
                    <input value={character.name} onChange={(event) => updateCharacterPortrait(character.id, { name: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Beschrijving</span>
                    <textarea
                      value={character.description}
                      onChange={(event) => updateCharacterPortrait(character.id, { description: event.target.value })}
                      rows={3}
                    />
                  </label>
                  <label className="field">
                    <span>Portretprompt</span>
                    <textarea value={character.prompt} onChange={(event) => updateCharacterPortrait(character.id, { prompt: event.target.value })} rows={4} />
                  </label>
                  <button type="button" onClick={() => void createCharacterPortrait(character)} disabled={portraitBusyId === character.id}>
                    {portraitBusyId === character.id ? <Loader2 size={16} /> : <Wand2 size={16} />}
                    <span>{portraitBusyId === character.id ? "Rendert..." : "Maak portret"}</span>
                  </button>
                </article>
              ))
            ) : (
              <p className="voice-style-note">Nog geen karakters gevonden.</p>
            )}
          </div>
        </section>
      </aside>

      <section className="reader-main">
        <header className="reader-header">
          <div>
            <span className="eyebrow">Document</span>
            <h2>{documentTitle || "Nieuw document"}</h2>
          </div>
          <div className="stats-strip">
            <span>
              <ListTree size={15} />
              {chapters.length} hoofdstukken
            </span>
            <span>
              <FileText size={15} />
              {stats.totalWords.toLocaleString("nl-NL")} woorden
            </span>
            <span>
              <Clock size={15} />
              {Math.max(1, Math.round(stats.totalWords / 155))} min
            </span>
          </div>
        </header>

        {notice ? <div className="notice">{notice}</div> : null}

        <article className="reading-surface">
          {selectedChapter ? (
            <>
              <div className="chapter-heading">
                <div>
                  <span>Hoofdstuk {selectedChapter.index + 1}</span>
                  <h3>{selectedChapter.title}</h3>
                </div>
                <div className="play-controls">
                  {speechState === "speaking" && activeChapterId === selectedChapter.id ? (
                    <button type="button" onClick={pauseSpeech}>
                      <Pause size={16} />
                      <span>Pauze</span>
                    </button>
                  ) : speechState === "paused" && activeChapterId === selectedChapter.id ? (
                    <button type="button" onClick={resumeSpeech}>
                      <Play size={16} />
                      <span>Verder</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => readChapter(selectedChapter)}>
                      <Play size={16} />
                      <span>Lees</span>
                    </button>
                  )}
                  <button type="button" className="quiet icon-button" onClick={stopSpeech} title="Stop">
                    <Square size={16} />
                  </button>
                </div>
              </div>
              <div className="chapter-meta">
                <span>{selectedChapter.wordCount.toLocaleString("nl-NL")} woorden</span>
                <span>
                  woord {selectedChapter.startWord.toLocaleString("nl-NL")}-
                  {selectedChapter.endWord.toLocaleString("nl-NL")}
                </span>
                {illustrationJobId ? <span>Comfy {illustrationJobId.slice(0, 8)}</span> : null}
              </div>
              {illustrationUrl ? (
                <figure className="chapter-illustration">
                  <img src={illustrationUrl} alt={`Illustratie bij ${selectedChapter.title}`} />
                  <figcaption>{selectedChapter.title}</figcaption>
                </figure>
              ) : null}
              <p className="chapter-text">{selectedChapter.text}</p>
            </>
          ) : (
            <div className="empty-state">
              <BookOpen size={34} />
              <strong>Geen hoofdstukken</strong>
            </div>
          )}
        </article>
      </section>

      <aside className="chapter-rail">
        <label className="search-field">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek" />
        </label>
        <div className="chapter-list">
          {filteredChapters.map((chapter) => (
            <button
              type="button"
              className={`chapter-card ${chapter.id === selectedChapter?.id ? "selected" : ""} ${chapter.id === activeChapterId ? "active" : ""}`}
              onClick={() => setSelectedChapterId(chapter.id)}
              key={chapter.id}
            >
              <span>{chapter.index + 1}</span>
              <strong>{chapter.title}</strong>
              <small>{chapter.wordCount.toLocaleString("nl-NL")} woorden</small>
            </button>
          ))}
        </div>
      </aside>
      </>
      )}
    </main>
  );
}

function normalizeAiProvider(provider: AiProvider): "local" | "deepseek" | "grok" {
  if (provider === "api" || provider === "deepseek") return "deepseek";
  if (provider === "grok") return "grok";
  return "local";
}

function aiProviderLabel(provider: AiProvider): string {
  const normalized = normalizeAiProvider(provider);
  if (normalized === "deepseek") return "DeepSeek API";
  if (normalized === "grok") return "Grok API";
  return "Lokale Ollama";
}

function aiProviderModelLabel(provider: AiProvider): string {
  const normalized = normalizeAiProvider(provider);
  if (normalized === "deepseek") return "DeepSeek model";
  if (normalized === "grok") return "Grok model";
  return "Ollama model";
}

function responseProviderLabel(provider: string): string {
  if (provider === "deepseek-api") return "DeepSeek API";
  if (provider === "xai-api") return "Grok API";
  if (provider === "ollama") return "lokaal";
  return "fallback";
}

function imageProviderLabel(provider: ImageProvider): string {
  return provider === "grok" ? "Grok Imagine" : "ComfyUI";
}

function buildGuidedStoryPrompt(characters: string, plot: string, mainEvent: string): StoryPromptMeta {
  const cleanCharacters = characters.trim();
  const cleanPlot = plot.trim();
  const cleanMainEvent = mainEvent.trim();
  const prompt = [
    "Write a complete, emotionally coherent personal story based on this brief.",
    `Characters (name / age / gender): ${cleanCharacters || "not specified"}.`,
    `Plot: ${cleanPlot || "not specified"}.`,
    `Main event to focus on: ${cleanMainEvent || "not specified"}.`,
    "Keep the characters consistent, make the scenes concrete, and build the story around the main event without rushing past it.",
  ].join("\n");
  return {
    characters: cleanCharacters,
    plot: cleanPlot,
    mainEvent: cleanMainEvent,
    prompt,
    updatedAt: new Date().toISOString(),
  };
}

function withSelectedModel(options: ModelOption[], selectedId: string): ModelOption[] {
  const normalized = options.filter((model) => model.id);
  if (!selectedId || normalized.some((model) => model.id === selectedId)) {
    return normalized;
  }
  return [{ id: selectedId, label: selectedId }, ...normalized];
}

function modelOptionLabel(options: ModelOption[], selectedId: string): string {
  return options.find((model) => model.id === selectedId)?.label || "";
}

function chooseCatalogModel(current: string, options: ModelOption[], preferredIds: string[]): string {
  const ids = new Set(options.map((model) => model.id));
  if (current && (!options.length || ids.has(current))) return current;
  return preferredIds.find((id) => id && (!options.length || ids.has(id))) || options[0]?.id || current || "";
}

function chunkForSpeech(text: string, maxChunkLength = 1200): string[] {
  const safeMaxChunkLength = Math.max(360, maxChunkLength);
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  sentences.forEach((sentence) => {
    if ((current + " " + sentence).trim().length > safeMaxChunkLength) {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  });

  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, safeMaxChunkLength)];
}

function defaultApiBase(): string {
  const envBase = import.meta.env.VITE_BOOKREADER_API_BASE;
  if (envBase) return String(envBase);
  if (window.location.port === "1432") {
    return `${window.location.protocol}//${window.location.hostname}:1433`;
  }
  if (window.location.protocol === "tauri:") {
    return "http://127.0.0.1:1433";
  }
  return "";
}

function readSavedStories(): SavedStoryEntry[] {
  try {
    const payload = JSON.parse(window.localStorage.getItem(SAVED_STORIES_KEY) || "[]");
    if (!Array.isArray(payload)) return [];
    return payload
      .filter(isSavedStoryEntry)
      .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
      .slice(0, MAX_SAVED_STORIES);
  } catch {
    return [];
  }
}

function writeSavedStories(entries: SavedStoryEntry[]): void {
  window.localStorage.setItem(SAVED_STORIES_KEY, JSON.stringify(entries.slice(0, MAX_SAVED_STORIES)));
}

function isSavedStoryEntry(value: unknown): value is SavedStoryEntry {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.savedAt === "string" &&
    typeof record.wordCount === "number" &&
    typeof record.chapterCount === "number" &&
    typeof record.preview === "string" &&
    isBookProject(record.project)
  );
}

function savedStoryEntryFromProject(project: BookProject): SavedStoryEntry {
  const rawText = String(project.rawText || "");
  const chapters = splitIntoChapters(rawText).chapters;
  const savedAt = project.savedAt || new Date().toISOString();
  const title = project.title || "Nieuw verhaal";
  return {
    id: storyEntryId(title, savedAt),
    title,
    savedAt,
    wordCount: countStoryWords(rawText),
    chapterCount: chapters.length,
    preview: storyPreview(rawText),
    project: lightweightProject(project, savedAt),
  };
}

function lightweightProject(project: BookProject, savedAt: string): BookProject {
  const chapterIllustrations = Array.isArray(project.chapterIllustrations) ? project.chapterIllustrations : [];
  const characterPortraits = Array.isArray(project.characterPortraits) ? project.characterPortraits : [];
  return {
    schema: "bookreader.project.v1",
    savedAt,
    title: project.title || "Nieuw verhaal",
    rawText: String(project.rawText || ""),
    illustrationStyleId: project.illustrationStyleId || "storybook",
    chapterIllustrations: chapterIllustrations.map((item) => ({
      ...item,
      imageUrl: compactImageUrl(item.imageUrl),
    })),
    characterPortraits: characterPortraits.map((portrait) => ({
      ...portrait,
      imageUrl: compactImageUrl(portrait.imageUrl),
    })),
    bookCover: project.bookCover
      ? {
          ...project.bookCover,
          imageUrl: compactImageUrl(project.bookCover.imageUrl),
        }
      : undefined,
    contextAnalysis: project.contextAnalysis,
    filmPlan: project.filmPlan,
    storyPrompt: project.storyPrompt,
  };
}

function compactImageUrl(value?: string): string | undefined {
  if (!value || value.startsWith("data:")) return undefined;
  return value;
}

function storyEntryId(title: string, savedAt: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "verhaal"}-${savedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
}

function storyIdentityKey(title: string, savedAt: string): string {
  return `${title.trim().toLowerCase()}|${savedAt}`;
}

function storyPreview(text: string): string {
  const clean = String(text || "")
    .replace(/^#{1,3}\s+.+$/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 150) || "Leeg verhaal";
}

function countStoryWords(text: string): number {
  return String(text || "").match(/\S+/g)?.length || 0;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekende datum";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
