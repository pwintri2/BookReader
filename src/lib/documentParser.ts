import { normalizeWhitespace } from "./chapters";

export type ParsedDocument = {
  title: string;
  text: string;
  kind: "text" | "docx" | "pdf";
};

export async function parseFile(file: File): Promise<ParsedDocument> {
  const lowerName = file.name.toLowerCase();
  if (isDocxFile(file, lowerName)) {
    return {
      title: stripExtension(file.name),
      text: normalizeWhitespace(await parseDocx(file)),
      kind: "docx",
    };
  }
  if (lowerName.endsWith(".pdf")) {
    return {
      title: stripExtension(file.name),
      text: normalizeWhitespace(await parsePdf(file)),
      kind: "pdf",
    };
  }
  return {
    title: stripExtension(file.name),
    text: normalizeWhitespace(await file.text()),
    kind: "text",
  };
}

function isDocxFile(file: File, lowerName = file.name.toLowerCase()): boolean {
  return lowerName.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

async function parseDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

async function parsePdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n");
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "Document";
}
