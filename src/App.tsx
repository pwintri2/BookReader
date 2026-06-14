import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  BookImage,
  Clipboard,
  Clock,
  FileText,
  FolderOpen,
  Image,
  ListTree,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  Save,
  Square,
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
  cacheImage,
  ContextAnalysis,
  generateIllustration,
  generateStory,
  getHealth,
  getIllustrationStatus,
  mediaUrl,
  saveDeepSeekApiKey,
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
type VoiceStyleId = "neutral" | "story" | "lively" | "calm";
type StoryLanguage = "Auto" | "Nederlands" | "English" | "Deutsch" | "Français" | "Español";
type ChapterIllustrationMap = Record<string, SavedChapterIllustration>;
type CharacterPortraitRecord = CharacterPortrait & { imageUrl?: string };

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
  "Anton Pieck style",
  "Anton Piek style",
  "nostalgic Dutch village painting",
  "generic fantasy village",
  "unrelated scenery",
  "extra main characters",
  "missing main character",
  "wrong character identity",
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

export function App() {
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
  const [deepSeekApiKeyInput, setDeepSeekApiKeyInput] = useState("");
  const [deepSeekKeyBusy, setDeepSeekKeyBusy] = useState(false);
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
  const [storyPrompt, setStoryPrompt] = useState("Een meisje vindt onder een oude brug een zilveren deur die alleen bij maanlicht opengaat.");
  const [storyPages, setStoryPages] = useState(4);
  const [storyWordsPerPage, setStoryWordsPerPage] = useState(550);
  const [storyLanguage, setStoryLanguage] = useState<StoryLanguage>("Auto");
  const [storyMode, setStoryMode] = useState<"fast" | "deep">("deep");
  const [aiProvider, setAiProvider] = useState<AiProvider>("local");
  const [storyGenre, setStoryGenre] = useState("avontuurlijk mysterie");
  const [storyTone, setStoryTone] = useState("beeldend, warm en spannend");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [referenceStatus, setReferenceStatus] = useState("geen referentie");
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyStatus, setStoryStatus] = useState("DeepSeek chatmodel schrijft betere verhalen dan R1");
  const [assetStorageStatus, setAssetStorageStatus] = useState("beeldenmap: /home/pwintri2/BookReader/out/bookreader/images");
  const [projectBusy, setProjectBusy] = useState(false);
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

  const selectedVoice = voices.find((voice) => voice.voiceURI === voiceURI) || voices[0];
  const selectedVoiceStyle = VOICE_STYLES.find((style) => style.id === voiceStyleId) || VOICE_STYLES[0];
  const apiOnline = apiHealth?.ok === true;

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
  }, []);

  function processText(title: string, text: string) {
    const result = splitIntoChapters(text);
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

  function loadBookProject(project: BookProject) {
    const result = splitIntoChapters(project.rawText);
    const chapterMap = Object.fromEntries(project.chapterIllustrations.map((item) => [item.chapterId, item]));
    setDocumentTitle(project.title || "Nieuw document");
    setRawText(project.rawText);
    setChapters(result.chapters);
    setStats(result.stats);
    setSelectedChapterId(result.chapters[0]?.id || "");
    setIllustrationStyleId((project.illustrationStyleId as IllustrationStyleId) || "storybook");
    setChapterIllustrations(chapterMap);
    setCharacterPortraits(project.characterPortraits.map((portrait) => ({ ...portrait, count: 0 })));
    setContextAnalysis((project.contextAnalysis as ContextAnalysis) || null);
    setContextStatus("project geladen");
    setBookCover(project.bookCover || { prompt: buildCoverPrompt(project.title, result.chapters, "storybook") });
    setCoverStatus(project.bookCover?.imageUrl ? "cover geladen" : "klaar voor cover");
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

  async function createStoryFromPrompt() {
    if (!storyPrompt.trim()) {
      setNotice("Geef eerst een verhaalprompt.");
      return;
    }
    setStoryBusy(true);
    const providerLabel = aiProvider === "api" ? "DeepSeek API" : "DeepSeek lokaal";
    setStoryStatus(storyMode === "deep" ? `${providerLabel} schrijft uitgebreid...` : `${providerLabel} schrijft kort...`);
    setNotice("");
    try {
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
        referenceTitle,
        referenceText,
      });
      processText(response.title, response.story);
      const responseProvider = response.provider === "deepseek-api" ? "API" : "lokaal";
      const languageNote = response.language ? `, ${response.language}` : "";
      setStoryStatus(`${responseProvider} ${response.model}: ${response.wordCount.toLocaleString("nl-NL")} woorden gemaakt${languageNote}`);
      setNotice(`Verhaal geladen: ${response.title}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verhaal kon niet worden gemaakt.";
      setStoryStatus(message);
      setNotice(message);
    } finally {
      setStoryBusy(false);
    }
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
      const apiLabel = health.deepseekApi?.configured ? "DeepSeek API aan" : "DeepSeek API key ontbreekt";
      setApiStatus(`${ttsLabel}, ${comfyLabel}, ${apiLabel}`);
      if (showNotice) setNotice("Serverlaag bereikt.");
    } catch (error) {
      setApiHealth(null);
      setApiStatus("offline");
      if (showNotice) setNotice(error instanceof Error ? error.message : "Serverlaag niet bereikbaar.");
    } finally {
      setApiBusy(false);
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
      setAiProvider("local");
      setNotice(response.message || "DeepSeek API key is gewist.");
      await refreshApiHealth(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "DeepSeek API key kon niet worden gewist.";
      setNotice(message);
    } finally {
      setDeepSeekKeyBusy(false);
    }
  }

  async function cacheGeneratedImage(imageUrl: string, kind: string, label?: string): Promise<string> {
    const cached = await cacheImage(apiBase, imageUrl, kind, label);
    if (cached.filePath) {
      setAssetStorageStatus(`Laatste beeld opgeslagen: ${cached.filePath}`);
    }
    return mediaUrl(apiBase, cached.imageUrl);
  }

  async function createIllustration() {
    if (!selectedChapter) return;
    setIllustrationBusy(true);
    setIllustrationStatus("ComfyUI job starten...");
    setNotice("");
    try {
      const job = await generateIllustration(apiBase, {
        prompt: illustrationPrompt || buildIllustrationPrompt(documentTitle, selectedChapter, illustrationStyleId),
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      });
      if (!job.promptId) {
        throw new Error(job.message || "ComfyUI gaf geen prompt-id terug.");
      }
      setIllustrationJobId(job.promptId);
      setIllustrationStatus("ComfyUI rendert...");
      const status = await pollIllustration(job.promptId);
      const firstImage = status.images[0];
      if (!firstImage) {
        setIllustrationStatus("Nog geen afbeelding terug.");
        return;
      }
      const imageUrl = await cacheGeneratedImage(mediaUrl(apiBase, firstImage.url), "chapter", selectedChapter.title);
      setIllustrationUrl(imageUrl);
      setChapterIllustrations((previous) => ({
        ...previous,
        [selectedChapter.id]: {
          chapterId: selectedChapter.id,
          prompt: illustrationPrompt,
          imageUrl,
          jobId: job.promptId,
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
    const providerLabel = aiProvider === "api" ? "DeepSeek API" : "DeepSeek lokaal";
    setContextStatus(mode === "deep" ? `${providerLabel} doet diepe verhaalcontext...` : `${providerLabel} analyseert verhaalcontext...`);
    try {
      const response = await analyzeContext(apiBase, {
        title: documentTitle,
        rawText,
        chapterTitle: selectedChapter?.title,
        chapterText: selectedChapter?.text,
        style: illustrationStyleId,
        mode,
        provider: aiProvider,
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
      const responseProvider = response.provider === "deepseek-api" ? "API" : "lokaal";
      setContextStatus(`DeepSeek ${responseProvider} ${response.model} (${modeLabel})${fallbackNote}: ${analysis.characters.length} karakter(s), context toegepast`);
      setNotice(response.warning || "DeepSeek-context toegepast op prompts, cover en portretten.");
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
    setCoverStatus("ComfyUI coverjob starten...");
    try {
      const job = await generateIllustration(apiBase, {
        prompt: bookCover.prompt || buildCoverPrompt(documentTitle, chapters, illustrationStyleId),
        negativePrompt: DEFAULT_NEGATIVE_PROMPT,
      });
      if (!job.promptId) {
        throw new Error(job.message || "ComfyUI gaf geen prompt-id terug.");
      }
      setCoverStatus("cover rendert...");
      const status = await pollIllustration(job.promptId);
      const firstImage = status.images[0];
      if (!firstImage) {
        setCoverStatus("Nog geen cover terug.");
        return;
      }
      const imageUrl = await cacheGeneratedImage(mediaUrl(apiBase, firstImage.url), "cover", documentTitle);
      setBookCover((previous) => ({
        ...previous,
        imageUrl,
        jobId: job.promptId,
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
      });
      if (!job.promptId) {
        throw new Error(job.message || "ComfyUI gaf geen prompt-id terug.");
      }
      const status = await pollIllustration(job.promptId);
      const firstImage = status.images[0];
      if (!firstImage) {
        setNotice(`Nog geen portret terug voor ${character.name}.`);
        return;
      }
      const imageUrl = await cacheGeneratedImage(mediaUrl(apiBase, firstImage.url), "portrait", character.name);
      setCharacterPortraits((previous) =>
        previous.map((item) => (item.id === character.id ? { ...item, imageUrl } : item)),
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
      downloadBookProject({
        schema: "bookreader.project.v1",
        savedAt: new Date().toISOString(),
        title: documentTitle,
        rawText,
        illustrationStyleId,
        chapterIllustrations: savedChapterIllustrations,
        characterPortraits: savedPortraits,
        bookCover: savedCover,
        contextAnalysis,
      });
      setNotice("Project opgeslagen.");
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
    processText("Nieuw document", "");
    setRawText("");
    setChapters([]);
    setStats({ totalWords: 0, limited: false, originalWords: 0 });
    setChapterIllustrations({});
    setCharacterPortraits([]);
    setBookCover({ prompt: "" });
    setCoverStatus("klaar voor cover");
    setNotice("");
  }

  return (
    <main className="app-shell">
      <aside className="reader-sidebar">
        <div className="brand-block">
          <BookOpen size={28} />
          <div>
            <h1>BookReader</h1>
            <span>{stats.totalWords.toLocaleString("nl-NL")} woorden</span>
          </div>
        </div>

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
            accept=".txt,.md,.docx,.pdf,.bookreader.json,text/plain,application/pdf,application/json"
            onChange={handleFileInput}
            hidden
          />

          <label className="field">
            <span>Tekst</span>
            <textarea value={rawText} onChange={(event) => setRawText(event.target.value)} rows={8} />
          </label>

          <div className="button-row">
            <button type="button" onClick={refreshFromText}>
              <Clipboard size={16} />
              <span>Verdeel</span>
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
        </section>

        <section className="tool-panel">
          <div className="panel-title">
            <FileText size={17} />
            <span>Verhaal maken</span>
          </div>
          <label className="field">
            <span>Prompt</span>
            <textarea value={storyPrompt} onChange={(event) => setStoryPrompt(event.target.value)} rows={5} />
          </label>
          <label className="field">
            <span>Genre</span>
            <input value={storyGenre} onChange={(event) => setStoryGenre(event.target.value)} />
          </label>
          <label className="field">
            <span>Verteltoon</span>
            <input value={storyTone} onChange={(event) => setStoryTone(event.target.value)} />
          </label>
          <div className="button-row">
            <button type="button" className="quiet" onClick={() => referenceInputRef.current?.click()}>
              <FolderOpen size={16} />
              <span>Referentie</span>
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
            accept=".txt,.md,.docx,.pdf,text/plain,application/pdf"
            onChange={handleReferenceInput}
            hidden
          />
          <p className="voice-style-note">{referenceStatus}</p>
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
              <span>Model</span>
              <select value={storyMode} onChange={(event) => setStoryMode(event.target.value as "fast" | "deep")}>
                <option value="fast">{aiProvider === "api" ? "Kort API" : "Kort 7B"}</option>
                <option value="deep">{aiProvider === "api" ? "Uitgebreid API" : "Uitgebreid 7B"}</option>
              </select>
            </label>
            <label className="field compact-field">
              <span>AI-bron</span>
              <select value={aiProvider} onChange={(event) => setAiProvider(event.target.value as AiProvider)}>
                <option value="local">Lokale Ollama</option>
                <option value="api">DeepSeek API</option>
              </select>
            </label>
          </div>
          <button type="button" onClick={() => void createStoryFromPrompt()} disabled={storyBusy || !storyPrompt.trim()}>
            {storyBusy ? <Loader2 size={16} /> : <Wand2 size={16} />}
            <span>{storyBusy ? "Schrijft..." : "Maak verhaal"}</span>
          </button>
          <p className="voice-style-note">{storyStatus}</p>
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
          <button type="button" className="quiet" onClick={() => void refreshApiHealth(true)} disabled={apiBusy}>
            {apiBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>Status</span>
          </button>
          <div className={`server-status ${apiOnline ? "online" : "offline"}`}>
            <span>{apiStatus}</span>
            <small>
              {apiHealth?.tts?.voices?.length ?? 0} Piper-stemmen, snel {apiHealth?.context?.model || "onbekend"}, diep{" "}
              {apiHealth?.context?.deepModel || "onbekend"}, API {apiHealth?.deepseekApi?.configured ? apiHealth.deepseekApi.storyModel : "geen key"},{" "}
              {apiHealth?.storage?.audioFiles ?? 0} audiofiles, {apiHealth?.storage?.imageFiles ?? 0} beelden
            </small>
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
          <button type="button" className="quiet" onClick={() => void runDeepSeekContextAnalysis("fast")} disabled={contextBusy || !rawText.trim()}>
            {contextBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>{contextBusy ? "Analyseert..." : "Snelle context"}</span>
          </button>
          <button type="button" className="quiet" onClick={() => void runDeepSeekContextAnalysis("deep")} disabled={contextBusy || !rawText.trim()}>
            {contextBusy ? <Loader2 size={16} /> : <RefreshCw size={16} />}
            <span>{aiProvider === "api" ? "Diepe context API" : "Diepe context 7B traag"}</span>
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
    </main>
  );
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
