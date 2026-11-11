import { PDFDocument, degrees } from "../utils/pdflib.js";
import { asyncHandler, HttpError } from "../utils/errors.js";
import { baseName, fileName, sendBuffer, sendZip } from "../utils/http.js";
import { loadPdf, parseJson, parsePages, plural, requireFile } from "../utils/pdf.js";

const normAngle = (a) => ((Math.round(a) % 360) + 360) % 360;

/** Copy pages into a new document; `entries` = [{ index, rotate }]. Handles repeated pages. */
async function buildPdf(src, entries) {
  const out = await PDFDocument.create();
  const hasDuplicates = new Set(entries.map((e) => e.index)).size !== entries.length;

  const pages = hasDuplicates
    ? await Promise.all(entries.map((e) => out.copyPages(src, [e.index]).then((p) => p[0])))
    : await out.copyPages(src, entries.map((e) => e.index));

  pages.forEach((page, i) => {
    const extra = entries[i].rotate || 0;
    if (extra) page.setRotation(degrees(normAngle(page.getRotation().angle + extra)));
    out.addPage(page);
  });
  return out;
}

/* ---------- Merge PDF (existing feature, same field names and behaviour) ---------- */

export const mergePdf = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (files.length < 2) throw new HttpError(400, "Please upload at least 2 PDF files.");

  const merged = await PDFDocument.create();
  for (const file of files) {
    const pdf = await loadPdf(file);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  const bytes = await merged.save();
  sendBuffer(res, bytes, {
    filename: "merged.pdf",
    ext: "pdf",
    meta: { pages: merged.getPageCount(), files: files.length },
  });
});

/* ---------- Split PDF (existing feature: ZIP of PDFs, same ranges rules) ---------- */

export const splitPdf = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Please upload a PDF file.");

  const pdf = await loadPdf(req.file);
  const totalPages = pdf.getPageCount();
  let groups = [];

  if (req.body.ranges?.trim()) {
    for (const part of req.body.ranges.split(",")) {
      const value = part.trim();
      const match = value.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new HttpError(400, `Invalid page range: ${value}`);

      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (start < 1 || end < start || end > totalPages) {
        throw new HttpError(400, `Invalid range ${value}. PDF has ${totalPages} pages.`);
      }
      groups.push(Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i));
    }
  } else {
    groups = Array.from({ length: totalPages }, (_, i) => [i]);
  }

  // Build every PDF first, then send, so an error never leaves a half-written ZIP.
  const entries = [];
  for (let i = 0; i < groups.length; i++) {
    const newPdf = await PDFDocument.create();
    const copied = await newPdf.copyPages(pdf, groups[i]);
    copied.forEach((page) => newPdf.addPage(page));
    entries.push({ name: `split-${i + 1}.pdf`, data: await newPdf.save() });
  }

  await sendZip(res, entries, { filename: "split-pdf.zip", meta: { sourcePages: totalPages } });
});

/* ---------- Remove / Extract pages ---------- */

export const removePages = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const src = await loadPdf(file);
  const total = src.getPageCount();
  const remove = new Set(parsePages(req.body.pages, total));

  if (remove.size >= total) throw new HttpError(400, "You cannot remove every page. Keep at least one page.");

  const keep = src.getPageIndices().filter((i) => !remove.has(i)).map((index) => ({ index }));
  const out = await buildPdf(src, keep);
  sendBuffer(res, await out.save(), {
    filename: `${baseName(fileName(file))}-removed-pages.pdf`,
    ext: "pdf",
    meta: { pages: keep.length, note: `Removed ${plural(remove.size, "page")}. ${plural(keep.length, "page")} left.` },
  });
});

export const extractPages = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const src = await loadPdf(file);
  const picked = parsePages(req.body.pages, src.getPageCount()).map((index) => ({ index }));

  const out = await buildPdf(src, picked);
  sendBuffer(res, await out.save(), {
    filename: `${baseName(fileName(file))}-extracted.pdf`,
    ext: "pdf",
    meta: { pages: picked.length, note: `Extracted ${plural(picked.length, "page")}.` },
  });
});

/* ---------- Rotate ---------- */

export const rotatePdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const doc = await loadPdf(file);
  const total = doc.getPageCount();
  let rotated = 0;

  if (req.body.rotations) {
    // Per-page rotations from the page grid: { "1": 90, "3": 270 } (clockwise degrees)
    const map = parseJson(req.body.rotations, "rotations");
    for (const [key, angle] of Object.entries(map)) {
      const index = Number(key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= total) {
        throw new HttpError(400, `Page ${key} does not exist. This PDF has ${plural(total, "page")}.`);
      }
      const a = normAngle(Number(angle));
      if (a % 90 !== 0) throw new HttpError(400, "Rotation must be 90, 180 or 270 degrees.");
      if (a) {
        const page = doc.getPage(index);
        page.setRotation(degrees(normAngle(page.getRotation().angle + a)));
        rotated++;
      }
    }
  } else {
    const angle = normAngle(Number(req.body.angle));
    if (![90, 180, 270].includes(angle)) throw new HttpError(400, "Choose a rotation of 90, 180 or 270 degrees.");
    for (const index of parsePages(req.body.pages, total, { emptyMeansAll: true })) {
      const page = doc.getPage(index);
      page.setRotation(degrees(normAngle(page.getRotation().angle + angle)));
      rotated++;
    }
  }

  if (!rotated) throw new HttpError(400, "No pages were rotated. Choose a rotation first.");
  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-rotated.pdf`,
    ext: "pdf",
    meta: { pages: total, note: `Rotated ${plural(rotated, "page")}.` },
  });
});

/* ---------- Reorder / Organize ---------- */

export const reorderPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const src = await loadPdf(file);
  const total = src.getPageCount();

  const order = String(req.body.order || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => s_isInt(n));
  const sorted = [...order].sort((a, b) => a - b);
  const valid = order.length === total && sorted.every((n, i) => n === i + 1);
  if (!valid) {
    throw new HttpError(400, `The new order must list every page from 1 to ${total} exactly once.`);
  }

  const out = await buildPdf(src, order.map((n) => ({ index: n - 1 })));
  sendBuffer(res, await out.save(), {
    filename: `${baseName(fileName(file))}-reordered.pdf`,
    ext: "pdf",
    meta: { pages: total, note: "Pages reordered." },
  });
});

const s_isInt = (n) => Number.isInteger(n) && n >= 1;

/** Full page organizer: delete, duplicate, reorder and rotate in one go. */
export const organizePdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const src = await loadPdf(file);
  const total = src.getPageCount();
  const spec = parseJson(req.body.spec, "page layout");

  if (!Array.isArray(spec) || !spec.length) {
    throw new HttpError(400, "The new document needs at least one page.");
  }
  const entries = spec.map((item) => {
    const index = Number(item.page) - 1;
    const rotate = normAngle(Number(item.rotate || 0));
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      throw new HttpError(400, `Page ${item.page} does not exist. This PDF has ${plural(total, "page")}.`);
    }
    if (rotate % 90 !== 0) throw new HttpError(400, "Rotation must be a multiple of 90 degrees.");
    return { index, rotate };
  });

  const out = await buildPdf(src, entries);
  sendBuffer(res, await out.save(), {
    filename: `${baseName(fileName(file))}-organized.pdf`,
    ext: "pdf",
    meta: { pages: entries.length, note: `New document has ${plural(entries.length, "page")}.` },
  });
});
