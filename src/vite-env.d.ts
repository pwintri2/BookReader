/// <reference types="vite/client" />

declare module "mammoth/mammoth.browser" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages?: unknown[] }>;
}

declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const url: string;
  export default url;
}
