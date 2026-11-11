import { PDFDocument } from "./pdflib.js";
import { HttpError } from "./errors.js";
import { fileName } from "./http.js";

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** True when the buffer starts like a PDF (the header may be preceded by a little junk). */
export function looksLikePdf(buffer) {
  return !!buffer && buffer.subarray(0, 1024).includes("%PDF-");
}

export function imageType(buffer) {
  if (!buffer || buffer.length < 8) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "png";
  }
  return null;
}

/** Return the one uploaded file for a field, or throw a friendly 400. */
export function requireFile(req, field, what = "a file") {
  const file = req.file?.fieldname === field ? req.file : req.files?.[field]?.[0];
  if (!file) throw new HttpError(400, `Please upload ${what}.`);
  return file;
}

export function requireFiles(req, min = 1, what = "files") {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length < min) {
    throw new HttpError(400, `Please upload ${min === 1 ? `at least one of ${what}` : `at least ${min} ${what}`}.`);
  }
  return files;
}

export function assertPdfFile(file) {
  if (!looksLikePdf(file.buffer)) {
    throw new HttpError(400, `"${fileName(file)}" is not a PDF file.`);
  }
}

/** Load a PDF with pdf-lib and translate parser errors into messages a user can act on. */
export async function loadPdf(file, options = {}) {
  assertPdfFile(file);
  const name = fileName(file);
  try {
    return await PDFDocument.load(file.buffer, { updateMetadata: false, ...options });
  } catch (error) {
    if (/encrypted/i.test(error?.message || "")) {
      throw new HttpError(
        422,
        `"${name}" is password protected. Open the Unlock PDF tool first, then try again.`,
      );
    }
    throw new HttpError(
      400,
      `"${name}" could not be read. It may be corrupted. Try the Repair PDF tool first.`,
    );
  }
}

/**
 * Parse page selections like "1-3, 5, 7-9" (also "all", "odd", "even") into 0-based indexes,
 * in the order written, without duplicates.
 */
export function parsePages(spec, total, { emptyMeansAll = false } = {}) {
  const raw = String(spec ?? "").trim().toLowerCase();
  const all = Array.from({ length: total }, (_, i) => i);

  if (!raw) {
    if (emptyMeansAll) return all;
    throw new HttpError(400, "Enter the pages you want, for example: 1-3, 5, 8-10");
  }
  if (raw === "all") return all;
  if (raw === "odd") return all.filter((i) => i % 2 === 0);
  if (raw === "even") return all.filter((i) => i % 2 === 1);

  const seen = new Set();
  const out = [];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (!value) continue;
    const match = value.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new HttpError(400, `Invalid page range: ${value}`);
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > total) {
      throw new HttpError(400, `Pages "${value}" are outside this PDF. It has ${plural(total, "page")}.`);
    }
    for (let p = start; p <= end; p++) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p - 1);
      }
    }
  }
  if (!out.length) throw new HttpError(400, "Enter the pages you want, for example: 1-3, 5, 8-10");
  return out;
}

export const num = (value, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true" || value === "1" || value === "on";
};

export function parseJson(value, what = "options") {
  try {
    return JSON.parse(value);
  } catch {
    throw new HttpError(400, `The ${what} sent with the request are not valid.`);
  }
}
