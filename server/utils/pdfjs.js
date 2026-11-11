import path from "node:path";
import { createRequire } from "node:module";
import { createCanvas } from "./canvas.js";
import { HttpError } from "./errors.js";
import { MAX_RENDER_PIXELS } from "../config.js";

const require = createRequire(import.meta.url);
let pdfjsPromise;

/** pdf.js legacy build: the one meant for Node (lazy-loaded so the server starts fast). */
export function getPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

function assetDir(name) {
  const pkgDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  return path.join(pkgDir, name) + path.sep;
}

/** Open a PDF buffer with pdf.js. Caller must `await doc.destroy()` when finished. */
export async function openPdf(buffer, { password } = {}) {
  const pdfjs = await getPdfjs();
  try {
    return await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      password,
      verbosity: 0,
      isEvalSupported: false,
      standardFontDataUrl: assetDir("standard_fonts"),
      cMapUrl: assetDir("cmaps"),
      cMapPacked: true,
    }).promise;
  } catch (error) {
    if (error?.name === "PasswordException") {
      throw new HttpError(422, "This PDF is password protected. Unlock it first with the Unlock PDF tool.");
    }
    throw new HttpError(400, "This PDF could not be read. It may be corrupted. Try the Repair PDF tool first.");
  }
}

/** Render one page (1-based) to an encoded image buffer. */
export async function renderPage(doc, pageNumber, { scale = 2, format = "png", quality = 85 } = {}) {
  const page = await doc.getPage(pageNumber);
  try {
    let viewport = page.getViewport({ scale });
    const pixels = viewport.width * viewport.height;
    if (pixels > MAX_RENDER_PIXELS) {
      viewport = page.getViewport({ scale: scale * Math.sqrt(MAX_RENDER_PIXELS / pixels) });
    }
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const buffer =
      format === "jpg" ? canvas.toBuffer("image/jpeg", quality) : canvas.toBuffer("image/png");
    return { buffer, width: canvas.width, height: canvas.height };
  } finally {
    page.cleanup();
  }
}

/**
 * Extract text as positioned lines (top-to-bottom). Coordinates are in PDF points with the
 * origin at the top-left of the page as displayed.
 */
export async function extractLines(doc, { maxPages = Infinity } = {}) {
  const pdfjs = await getPdfjs();
  const pages = [];
  const total = Math.min(doc.numPages, maxPages);

  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];

    for (const item of content.items) {
      if (!("str" in item) || !item.str || !item.str.trim()) continue;
      const t = pdfjs.Util.transform(viewport.transform, item.transform);
      const fontSize = Math.hypot(t[2], t[3]) || item.height || 10;
      items.push({ str: item.str, x: t[4], y: t[5], width: item.width, fontSize });
    }

    items.sort((a, b) => a.y - b.y || a.x - b.x);

    const lines = [];
    for (const item of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - item.y) <= Math.max(2, item.fontSize * 0.45)) {
        last.items.push(item);
      } else {
        lines.push({ y: item.y, items: [item] });
      }
    }

    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      let text = "";
      let prevEnd = null;
      for (const it of line.items) {
        if (prevEnd !== null && it.x - prevEnd > it.fontSize * 0.2 && !text.endsWith(" ") && !it.str.startsWith(" ")) {
          text += " ";
        }
        text += it.str;
        prevEnd = it.x + it.width;
      }
      line.text = text.replace(/\s+/g, " ").trim();
      line.x = line.items[0].x;
      line.width = line.items[line.items.length - 1].x + line.items[line.items.length - 1].width - line.x;
      line.fontSize = Math.max(...line.items.map((i) => i.fontSize));
    }

    pages.push({
      number: n,
      width: viewport.width,
      height: viewport.height,
      lines: lines.filter((l) => l.text),
    });
    page.cleanup();
  }
  return pages;
}

export const hasText = (pages) =>
  pages.reduce((sum, p) => sum + p.lines.reduce((s, l) => s + l.text.length, 0), 0) >= 15;
