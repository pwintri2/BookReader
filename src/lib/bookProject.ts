export type SavedCharacterPortrait = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  imageUrl?: string;
};

export type SavedChapterIllustration = {
  chapterId: string;
  prompt: string;
  imageUrl?: string;
  jobId?: string;
};

export type SavedBookCover = {
  prompt: string;
  imageUrl?: string;
  jobId?: string;
};

export type BookProject = {
  schema: "bookreader.project.v1";
  savedAt: string;
  title: string;
  rawText: string;
  illustrationStyleId: string;
  chapterIllustrations: SavedChapterIllustration[];
  characterPortraits: SavedCharacterPortrait[];
  bookCover?: SavedBookCover;
  contextAnalysis?: unknown;
  filmPlan?: unknown;
};

export function isBookProject(value: unknown): value is BookProject {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.schema === "bookreader.project.v1" && typeof record.title === "string" && typeof record.rawText === "string";
}

export function projectFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return `${slug || "bookreader-project"}.bookreader.json`;
}

export function downloadBookProject(project: BookProject): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = projectFilename(project.title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function imageToDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Afbeelding kon niet worden opgeslagen: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Afbeelding kon niet als data worden gelezen."));
    reader.readAsDataURL(blob);
  });
}
