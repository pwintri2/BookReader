import { Chapter, normalizeWhitespace } from "./chapters";

export type IllustrationStyleId = "storybook" | "watercolor" | "graphic" | "cinematic";

export type CharacterPortrait = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  count: number;
};

export type IllustrationStyle = {
  id: IllustrationStyleId;
  label: string;
  promptSuffix: string;
};

export const ILLUSTRATION_STYLES: IllustrationStyle[] = [
  {
    id: "storybook",
    label: "Verhaalgetrouw",
    promptSuffix:
      "literal narrative book illustration, concrete story scene, consistent characters, grounded setting, readable composition, not abstract, not nostalgic Dutch village painting",
  },
  {
    id: "watercolor",
    label: "Aquarel",
    promptSuffix:
      "controlled watercolor book illustration, concrete story details, consistent characters, restrained atmosphere, no loose abstract washes, no unrelated scenery",
  },
  {
    id: "graphic",
    label: "Graphic novel",
    promptSuffix: "polished graphic novel panel, exact story beat, strong silhouettes, dynamic framing, clean linework, no generic concept art",
  },
  {
    id: "cinematic",
    label: "Cinematisch",
    promptSuffix: "cinematic key art, exact story moment, dramatic but tasteful lighting, depth of field, emotionally grounded scene, no unrelated fantasy poster",
  },
];

const STOPWORDS = new Set([
  "aan",
  "als",
  "bij",
  "dat",
  "de",
  "den",
  "der",
  "die",
  "dit",
  "een",
  "en",
  "er",
  "had",
  "heb",
  "het",
  "hij",
  "hun",
  "ik",
  "in",
  "is",
  "je",
  "met",
  "niet",
  "nog",
  "om",
  "op",
  "te",
  "tot",
  "van",
  "voor",
  "was",
  "we",
  "wel",
  "werd",
  "ze",
  "zijn",
  "the",
  "and",
  "for",
  "that",
  "this",
  "with",
  "you",
]);

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

export function buildIllustrationPrompt(title: string, chapter: Chapter, styleId: IllustrationStyleId): string {
  const style = ILLUSTRATION_STYLES.find((item) => item.id === styleId) || ILLUSTRATION_STYLES[0];
  const summary = summarizeChapter(chapter.text);
  const keywords = extractKeywords(chapter.text, 8);
  const context = [title, chapter.title].map((item) => item.trim()).filter(Boolean).join(" - ");

  return [
    `Literal illustration of the core story moment from "${context || "this chapter"}".`,
    summary ? `Scene: ${summary}.` : "",
    keywords.length ? `Important motifs: ${keywords.join(", ")}.` : "",
    "Preserve the actual characters, location, objects and action from the chapter; do not replace them with generic decorative art.",
    style.promptSuffix,
    "No readable text, no watermark, no abstract modern-art interpretation, no Anton Pieck/Piek-like nostalgic village styling unless explicitly described.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildCoverPrompt(title: string, chapters: Chapter[], styleId: IllustrationStyleId): string {
  const style = ILLUSTRATION_STYLES.find((item) => item.id === styleId) || ILLUSTRATION_STYLES[0];
  const summaries = chapters
    .slice(0, 6)
    .map((chapter) => summarizeChapter(chapter.text))
    .filter(Boolean)
    .join(" ");
  const motifs = extractKeywords(chapters.map((chapter) => chapter.text).join(" "), 12);
  return [
    `Create a finished book cover illustration for "${title || "Untitled Book"}".`,
    summaries ? `Story essence: ${summaries.slice(0, 900)}.` : "",
    motifs.length ? `Recurring motifs: ${motifs.join(", ")}.` : "",
    "Use the story's actual cast, motifs and setting; do not make an unrelated decorative poster.",
    style.promptSuffix,
    "Book-cover composition, strong focal image, no readable text, no watermark, leave clean space for title typography, no abstract modern art.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function detectCharacterPortraits(text: string, styleId: IllustrationStyleId, limit = 8): CharacterPortrait[] {
  const normalized = normalizeWhitespace(text);
  const candidates = collectCharacterCandidates(normalized);
  const style = ILLUSTRATION_STYLES.find((item) => item.id === styleId) || ILLUSTRATION_STYLES[0];

  return candidates.slice(0, limit).map((candidate, index) => {
    const description = describeCharacter(normalized, candidate.name);
    return {
      id: `character-${index + 1}-${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: candidate.name,
      description,
      count: candidate.count,
      prompt: [
        `Create a consistent character portrait of ${candidate.name}.`,
        description ? `Character description from the story: ${description}.` : "Use the surrounding story context for a grounded portrait.",
        "Portrait framing, expressive face, readable silhouette, suitable for a book character sheet, do not invent period costume or fantasy styling unless the text supports it.",
        style.promptSuffix,
        "No readable text, no watermark.",
      ].join(" "),
    };
  });
}

function collectCharacterCandidates(text: string): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
  const matches = text.match(/\b[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s+[A-ZÀ-Ý][a-zà-ÿ]{2,})?\b/g) || [];
  for (const match of matches) {
    const name = match.trim();
    if (!isLikelyCharacterName(name)) continue;
    if (!hasCharacterEvidence(sentences, name)) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function isLikelyCharacterName(name: string): boolean {
  const trimmed = normalizeWhitespace(name).replace(/[“”"'.:,;!?()[\]{}]+$/g, "").replace(/^[“”"'.:,;!?()[\]{}]+/g, "");
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (/\d/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 2) return false;
  if (words.some(isBlockedNameToken)) return false;
  return words.every((word) => /[\p{L}]/u.test(word));
}

function isBlockedNameToken(value: string): boolean {
  const token = value
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .toLowerCase();
  return !token || NAME_FALSE_POSITIVES.has(token);
}

function hasCharacterEvidence(sentences: string[], name: string): boolean {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function describeCharacter(text: string, name: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const lowerName = name.toLowerCase();
  const relevant = sentences
    .filter((sentence) => sentence.toLowerCase().includes(lowerName))
    .slice(0, 5)
    .join(" ");
  return relevant.length > 700 ? `${relevant.slice(0, 697).trim()}...` : relevant;
}

export function summarizeChapter(text: string): string {
  const normalized = normalizeWhitespace(text);
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 28);
  const selected = sentences.slice(0, 3).join(" ");
  return selected.length > 620 ? `${selected.slice(0, 617).trim()}...` : selected;
}

export function extractKeywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  const words = normalizeWhitespace(text)
    .toLowerCase()
    .match(/[\p{L}\p{N}]{4,}/gu) || [];

  for (const word of words) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}
