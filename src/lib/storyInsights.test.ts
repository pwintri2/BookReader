import { describe, expect, it } from "vitest";
import { buildCoverPrompt, buildIllustrationPrompt, detectCharacterPortraits, extractKeywords, summarizeChapter } from "./storyInsights";
import { splitIntoChapters } from "./chapters";

describe("story insights", () => {
  it("builds a compact illustration prompt from a chapter", () => {
    const chapter = splitIntoChapters(
      [
        "Hoofdstuk 1",
        "Mira stond op de brug terwijl de stad onder haar langzaam wakker werd.",
        "In de mist zag zij een zilveren deur die gisteren nog niet bestond.",
        "Achter haar klonk het zachte tikken van een oude klok.",
      ].join("\n"),
    ).chapters[0];

    const prompt = buildIllustrationPrompt("De Zilveren Stad", chapter, "storybook");
    expect(prompt).toContain("De Zilveren Stad");
    expect(prompt).toContain("Mira stond op de brug");
    expect(prompt.length).toBeLessThan(1100);
    expect(prompt).toContain("No readable text");
  });

  it("extracts repeated content words without common stopwords", () => {
    const keywords = extractKeywords("De maan en de stad. De maan boven de rivier. Rivier maan stad.", 3);
    expect(keywords).toContain("maan");
    expect(keywords).not.toContain("de");
  });

  it("keeps chapter summaries short", () => {
    const summary = summarizeChapter(`${"Een lange zin met genoeg woorden om gekozen te worden. ".repeat(40)}`);
    expect(summary.length).toBeLessThanOrEqual(620);
  });

  it("detects repeated character names and builds portrait prompts", () => {
    const portraits = detectCharacterPortraits(
      "Mira droeg een rode jas. Jonas wachtte bij de poort. Mira keek naar Jonas. Mira glimlachte voorzichtig.",
      "storybook",
    );
    expect(portraits[0].name).toBe("Mira");
    expect(portraits[0].prompt).toContain("character portrait");
  });

  it("does not treat UI words or pronouns as character names", () => {
    const portraits = detectCharacterPortraits(
      [
        "She waited there. She did not click the button.",
        "There was no person called Click or Not in the story.",
        "Mira opened the door. Jonas saw Mira. Jonas helped Mira.",
      ].join(" "),
      "storybook",
    );
    const names = portraits.map((portrait) => portrait.name);
    expect(names).toContain("Mira");
    expect(names).toContain("Jonas");
    expect(names).not.toContain("She");
    expect(names).not.toContain("There");
    expect(names).not.toContain("Click");
    expect(names).not.toContain("Not");
  });

  it("does not treat recurring objects or places as character portraits", () => {
    const portraits = detectCharacterPortraits(
      [
        "Door opened slowly. Door glowed under the Moon. Moon hung above Bridge.",
        "Mira opened the door. Mira looked at Jonas. Jonas waited beside Mira.",
        "Bridge was old and Bridge was silent.",
      ].join(" "),
      "storybook",
    );
    const names = portraits.map((portrait) => portrait.name);
    expect(names).toContain("Mira");
    expect(names).toContain("Jonas");
    expect(names).not.toContain("Door");
    expect(names).not.toContain("Moon");
    expect(names).not.toContain("Bridge");
  });

  it("builds a book cover prompt from multiple chapters", () => {
    const chapters = splitIntoChapters("Hoofdstuk 1\nMira loopt door de zilveren stad. ".repeat(4)).chapters;
    const prompt = buildCoverPrompt("De Zilveren Stad", chapters, "cinematic");
    expect(prompt).toContain("book cover");
    expect(prompt).toContain("De Zilveren Stad");
    expect(prompt).toContain("no readable text");
  });
});
