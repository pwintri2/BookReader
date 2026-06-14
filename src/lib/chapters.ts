export type Chapter = {
  id: string;
  title: string;
  index: number;
  text: string;
  wordCount: number;
  startWord: number;
  endWord: number;
};

export type ChapterStats = {
  totalWords: number;
  limited: boolean;
  originalWords: number;
};

export const MAX_WORDS = 500000;
const TARGET_CHAPTER_WORDS = 2600;
const MIN_HEADING_CHAPTER_WORDS = 80;

const headingPattern =
  /^#{1,3}\s*(chapter|hoofdstuk|deel|part|section|page|pagina|seite|página)\s+([0-9ivxlcdm]+|\w+)?[\s:.-]*(.*)$|^(chapter|hoofdstuk|deel|part|section|page|pagina|seite|página)\s+([0-9ivxlcdm]+|\w+)?[\s:.-]*(.*)$|^([0-9]{1,3})[.)]\s+([A-ZÀ-ÝA-Z0-9][^\n]{2,80})$/i;

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(value: string): number {
  const matches = normalizeWhitespace(value).match(/\S+/g);
  return matches ? matches.length : 0;
}

export function limitWords(value: string, maxWords = MAX_WORDS): { text: string; totalWords: number; limited: boolean; originalWords: number } {
  const normalized = normalizeWhitespace(value);
  const words = normalized.match(/\S+/g) || [];
  if (words.length <= maxWords) {
    return { text: normalized, totalWords: words.length, originalWords: words.length, limited: false };
  }
  return {
    text: words.slice(0, maxWords).join(" "),
    totalWords: maxWords,
    originalWords: words.length,
    limited: true,
  };
}

export function splitIntoChapters(rawText: string, maxWords = MAX_WORDS): { chapters: Chapter[]; stats: ChapterStats } {
  const limited = limitWords(rawText, maxWords);
  if (!limited.text) {
    return {
      chapters: [],
      stats: { totalWords: 0, limited: false, originalWords: 0 },
    };
  }

  const headingChapters = chaptersFromHeadings(limited.text);
  const chapters = headingChapters.length >= 2 ? headingChapters : chaptersFromWordWindows(limited.text);
  return {
    chapters,
    stats: {
      totalWords: limited.totalWords,
      limited: limited.limited,
      originalWords: limited.originalWords,
    },
  };
}

function chaptersFromHeadings(text: string): Chapter[] {
  const lines = text.split("\n");
  const chunks: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = trimmed.length <= 90 && headingPattern.test(trimmed);
    if (isHeading) {
      if (current && countWords(current.lines.join("\n")) >= MIN_HEADING_CHAPTER_WORDS) {
        chunks.push(current);
      } else if (current) {
        current.lines.push(trimmed);
      }
      current = { title: cleanHeading(trimmed), lines: [] };
      continue;
    }
    if (!current) {
      current = { title: "Start", lines: [] };
    }
    current.lines.push(line);
  }

  if (current && countWords(current.lines.join("\n")) > 0) {
    chunks.push(current);
  }

  return chunks
    .filter((chunk) => countWords(chunk.lines.join("\n")) > 0)
    .map((chunk, index) => chapterFromText(chunk.title || `Hoofdstuk ${index + 1}`, chunk.lines.join("\n"), index, runningStart(chunks, index)));
}

function chaptersFromWordWindows(text: string): Chapter[] {
  const words = text.match(/\S+/g) || [];
  const chapters: Chapter[] = [];
  let cursor = 0;
  while (cursor < words.length) {
    const end = Math.min(words.length, cursor + TARGET_CHAPTER_WORDS);
    const body = words.slice(cursor, end).join(" ");
    chapters.push(chapterFromText(`Hoofdstuk ${chapters.length + 1}`, body, chapters.length, cursor + 1));
    cursor = end;
  }
  return chapters;
}

function chapterFromText(title: string, text: string, index: number, startWord: number): Chapter {
  const normalized = normalizeWhitespace(text);
  const wordCount = countWords(normalized);
  return {
    id: `chapter-${index + 1}`,
    title: title || `Hoofdstuk ${index + 1}`,
    index,
    text: normalized,
    wordCount,
    startWord,
    endWord: startWord + Math.max(0, wordCount - 1),
  };
}

function runningStart(chunks: Array<{ lines: string[] }>, index: number): number {
  if (index <= 0) return 1;
  return chunks.slice(0, index).reduce((total, chunk) => total + countWords(chunk.lines.join("\n")), 1);
}

function cleanHeading(value: string): string {
  return value.replace(/^#{1,3}\s*/, "").replace(/\s+/g, " ").replace(/[:.-]+$/g, "").trim();
}
