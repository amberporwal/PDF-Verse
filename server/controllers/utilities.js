import fs from "node:fs";
import os from "node:os";
import { PDFDocument, StandardFonts } from "../utils/pdflib.js";
import { asyncHandler, HttpError } from "../utils/errors.js";
import { baseName, fileName, sendBuffer, sendZip } from "../utils/http.js";
import { assertPdfFile, num, parsePages, plural, requireFile, requireFiles } from "../utils/pdf.js";
import { extractLines, hasText, openPdf, renderPage } from "../utils/pdfjs.js";
import { OCR_MAX_PAGES, TESSDATA_DIR } from "../config.js";
import { capabilities } from "../utils/office.js";

/* ---------- PDF to ZIP ---------- */

export const pdfToZip = asyncHandler(async (req, res) => {
  const files = requireFiles(req, 1, "PDF files");
  const used = new Set();
  const entries = files.map((file) => {
    assertPdfFile(file);
    const stem = fileName(file).replace(/[\\/:*?"<>|]/g, "_").replace(/\.pdf$/i, "") || "document";
    let name = `${stem}.pdf`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n}).pdf`; // keep duplicates apart
    used.add(name.toLowerCase());
    return { name, data: file.buffer };
  });
  await sendZip(res, entries, {
    filename: "pdfs.zip",
    meta: { note: `Packed ${plural(entries.length, "PDF")} into one ZIP file.` },
  });
});

/* ---------- Page counter / PDF info ---------- */

const SIZE_NAMES = [
  ["A4", 595.28, 841.89],
  ["A3", 841.89, 1190.55],
  ["A5", 419.53, 595.28],
  ["Letter", 612, 792],
  ["Legal", 612, 1008],
];
function sizeName(w, h) {
  const [a, b] = w < h ? [w, h] : [h, w];
  const hit = SIZE_NAMES.find(([, sw, sh]) => Math.abs(sw - a) < 3 && Math.abs(sh - b) < 3);
  return hit ? hit[0] : null;
}

async function describe(file) {
  assertPdfFile(file);
  const info = { name: fileName(file), size: file.buffer.length };
  const header = file.buffer.subarray(0, 1024).toString("latin1").match(/%PDF-(\d\.\d)/);
  info.version = header?.[1] || null;

  let doc;
  try {
    doc = await PDFDocument.load(file.buffer, { updateMetadata: false });
  } catch (error) {
    if (/encrypted/i.test(error?.message || "")) {
      return { ...info, encrypted: true, error: "Password protected: unlock it to read its details." };
    }
    return { ...info, error: "This file could not be read. It may be corrupted." };
  }

  const sizes = new Map();
  doc.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const rotated = page.getRotation().angle % 180 !== 0;
    const [w, h] = rotated ? [height, width] : [width, height];
    const key = `${Math.round(w)}x${Math.round(h)}`;
    const entry = sizes.get(key) || { width: Math.round(w), height: Math.round(h), name: sizeName(w, h), pages: 0 };
    entry.pages++;
    sizes.set(key, entry);
  });

  const date = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);
  let formFields = 0;
  try {
    formFields = doc.getForm().getFields().length;
  } catch {
    /* no form */
  }

  return {
    ...info,
    encrypted: false,
    pages: doc.getPageCount(),
    title: doc.getTitle() || "",
    author: doc.getAuthor() || "",
    subject: doc.getSubject() || "",
    keywords: doc.getKeywords() || "",
    creator: doc.getCreator() || "",
    producer: doc.getProducer() || "",
    created: date(doc.getCreationDate()),
    modified: date(doc.getModificationDate()),
    pageSizes: [...sizes.values()],
    formFields,
  };
}

export const pageCount = asyncHandler(async (req, res) => {
  const files = requireFiles(req, 1, "PDF files");
  const results = [];
  for (const file of files) {
    const d = await describe(file);
    results.push({ name: d.name, size: d.size, pages: d.pages ?? null, error: d.error || null });
  }
  const total = results.reduce((s, r) => s + (r.pages || 0), 0);
  res.json({ ok: true, files: results, totalPages: total });
});

export const pdfInfo = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const info = await describe(file);

  // Does it contain selectable text, or is it probably a scan?
  if (!info.error) {
    try {
      const doc = await openPdf(file.buffer);
      try {
        info.hasText = hasText(await extractLines(doc, { maxPages: 3 }));
      } finally {
        await doc.destroy();
      }
    } catch {
      info.hasText = null;
    }
  }
  res.json({ ok: true, ...info });
});

/* ---------- Compare ---------- */

async function pageTexts(file) {
  assertPdfFile(file);
  const doc = await openPdf(file.buffer);
  try {
    const pages = await extractLines(doc);
    return { pages: pages.map((p) => p.lines.map((l) => l.text.trim()).filter(Boolean)), selectable: hasText(pages) };
  } finally {
    await doc.destroy();
  }
}

export const comparePdfs = asyncHandler(async (req, res) => {
  const files = requireFiles(req, 2, "PDF files (original and revised)");
  if (files.length !== 2) throw new HttpError(400, "Please upload exactly two PDF files to compare.");
  const { diffArrays } = await import("diff");

  const [a, b] = await Promise.all([pageTexts(files[0]), pageTexts(files[1])]);
  if (!a.selectable && !b.selectable) {
    throw new HttpError(422, "Neither PDF contains selectable text, so their text cannot be compared. Run OCR PDF on them first.");
  }

  const LIMIT = 150;
  const max = Math.max(a.pages.length, b.pages.length);
  const pages = [];
  let changed = 0;
  let identical = 0;
  for (let i = 0; i < max; i++) {
    const left = a.pages[i];
    const right = b.pages[i];
    if (!left) {
      pages.push({ page: i + 1, status: "only-in-revised", added: right.slice(0, LIMIT), removed: [] });
      changed++;
    } else if (!right) {
      pages.push({ page: i + 1, status: "only-in-original", added: [], removed: left.slice(0, LIMIT) });
      changed++;
    } else {
      const parts = diffArrays(left, right);
      const removed = parts.filter((p) => p.removed).flatMap((p) => p.value);
      const added = parts.filter((p) => p.added).flatMap((p) => p.value);
      if (!removed.length && !added.length) {
        identical++;
        pages.push({ page: i + 1, status: "identical", added: [], removed: [] });
      } else {
        changed++;
        pages.push({ page: i + 1, status: "changed", added: added.slice(0, LIMIT), removed: removed.slice(0, LIMIT) });
      }
    }
  }

  res.json({
    ok: true,
    original: { name: fileName(files[0]), pages: a.pages.length },
    revised: { name: fileName(files[1]), pages: b.pages.length },
    summary: { identicalPages: identical, differentPages: changed, sameText: changed === 0 },
    notes: [
      ...(a.selectable ? [] : [`"${fileName(files[0])}" has no selectable text (scanned?).`]),
      ...(b.selectable ? [] : [`"${fileName(files[1])}" has no selectable text (scanned?).`]),
      "Comparison is based on text only. Layout, images and colours are not compared.",
    ],
    pages,
  });
});

/* ---------- OCR ---------- */

export function ocrLanguages() {
  try {
    return fs
      .readdirSync(TESSDATA_DIR)
      .filter((f) => f.endsWith(".traineddata"))
      .map((f) => f.replace(".traineddata", ""));
  } catch {
    return [];
  }
}

export const ocrPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a scanned PDF file");
  assertPdfFile(file);

  const available = ocrLanguages();
  if (!available.length) throw new HttpError(501, "OCR language data is missing on this server (server/tessdata).");
  const requested = String(req.body.language || "eng")
    .split("+")
    .filter((l) => available.includes(l));
  const languages = requested.length ? requested : [available.includes("eng") ? "eng" : available[0]];
  const output = req.body.output === "txt" ? "txt" : "pdf";
  const dpi = num(req.body.dpi, 200, 100, 300);

  const doc = await openPdf(file.buffer);
  let worker;
  try {
    const indexes = parsePages(req.body.pages, doc.numPages, { emptyMeansAll: true });
    if (indexes.length > OCR_MAX_PAGES) {
      throw new HttpError(400, `OCR is limited to ${OCR_MAX_PAGES} pages per run (you selected ${indexes.length}). Enter a smaller page range.`);
    }

    const Tesseract = await import("tesseract.js");
    const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;
    worker = await createWorker(languages.join("+"), 1, {
      langPath: TESSDATA_DIR,
      gzip: false,
      cacheMethod: "none",
      cachePath: os.tmpdir(),
    });

    const source = output === "pdf" ? await PDFDocument.load(file.buffer, { ignoreEncryption: true, updateMetadata: false }) : null;
    const target = output === "pdf" ? await PDFDocument.create() : null;
    const font = target ? await target.embedFont(StandardFonts.Helvetica) : null;

    let text = "";
    let confidence = 0;
    let characters = 0;

    for (const index of indexes) {
      const { buffer, width: pxW } = await renderPage(doc, index + 1, { scale: dpi / 72, format: "png" });
      const { data } = await worker.recognize(buffer);
      text += `${indexes.length > 1 ? `--- Page ${index + 1} ---\n` : ""}${data.text.trim()}\n\n`;
      confidence += data.confidence || 0;
      characters += data.text.replace(/\s/g, "").length;

      if (target) {
        const [page] = await target.copyPages(source, [index]);
        target.addPage(page);
        const { width: ptW, height: ptH } = page.getSize();
        const k = ptW / pxW;
        for (const word of data.words || []) {
          if (!word.text?.trim() || (word.confidence ?? 100) < 30) continue;
          const boxW = (word.bbox.x1 - word.bbox.x0) * k;
          const boxH = (word.bbox.y1 - word.bbox.y0) * k;
          try {
            const natural = font.widthOfTextAtSize(word.text, 1);
            const size = Math.min(boxH * 1.6, boxW / natural);
            if (!Number.isFinite(size) || size < 1) continue;
            // Invisible text layer positioned over each recognised word.
            page.drawText(word.text, { x: word.bbox.x0 * k, y: ptH - word.bbox.y1 * k + boxH * 0.2, size, font, opacity: 0 });
          } catch {
            /* characters the standard font cannot encode (e.g. Devanagari) are skipped in the PDF layer */
          }
        }
      }
    }

    const base = baseName(fileName(file));
    const meta = {
      pages: indexes.length,
      characters,
      note: `Recognized ${characters.toLocaleString()} characters on ${plural(indexes.length, "page")} (average confidence ${Math.round(confidence / indexes.length)}%). OCR is never 100% accurate: check important text.`,
    };
    if (output === "txt") {
      if (!characters) throw new HttpError(422, "No text was recognized. The scan may be too blurry or in an unsupported language.");
      return sendBuffer(res, Buffer.from(text.trim() + "\n", "utf8"), { filename: `${base}-ocr.txt`, ext: "txt", meta });
    }
    if (!characters) throw new HttpError(422, "No text was recognized. The scan may be too blurry or in an unsupported language.");
    if (languages.some((l) => !["eng", "fra", "deu", "ind", "spa", "ita", "por"].includes(l))) {
      meta.note += " The searchable PDF layer only supports Latin letters: for other scripts, choose the text file output.";
    }
    sendBuffer(res, await target.save(), { filename: `${base}-searchable.pdf`, ext: "pdf", meta });
  } finally {
    await worker?.terminate().catch(() => {});
    await doc.destroy();
  }
});

export const capabilitiesHandler = (req, res) => {
  res.json({ ok: true, ...capabilities(), ocrLanguages: ocrLanguages() });
};
