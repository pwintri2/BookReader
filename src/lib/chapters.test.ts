import { describe, expect, it } from "vitest";
import { countWords, limitWords, MAX_WORDS, splitIntoChapters } from "./chapters";

describe("chapter splitting", () => {
  it("splits by explicit headings", () => {
    const text = [
      "Hoofdstuk 1",
      "Een ".repeat(120),
      "Hoofdstuk 2",
      "Twee ".repeat(140),
    ].join("\n");
    const result = splitIntoChapters(text);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe("Hoofdstuk 1");
    expect(result.chapters[1].title).toBe("Hoofdstuk 2");
  });

  it("splits generated Markdown page markers across languages", () => {
    const text = [
      "# The Silver Door",
      "## Page 1",
      "One ".repeat(120),
      "## Page 2",
      "Two ".repeat(120),
    ].join("\n");
    const result = splitIntoChapters(text);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe("Page 1");
    expect(result.chapters[1].title).toBe("Page 2");
  });

  it("falls back to word windows when there are no headings", () => {
    const text = "woord ".repeat(6100);
    const result = splitIntoChapters(text);
    expect(result.chapters.length).toBeGreaterThan(1);
    expect(result.stats.totalWords).toBe(6100);
  });

  it("limits input to 500000 words", () => {
    const text = "x ".repeat(MAX_WORDS + 50);
    const limited = limitWords(text);
    expect(limited.limited).toBe(true);
    expect(countWords(limited.text)).toBe(MAX_WORDS);
  });
});
