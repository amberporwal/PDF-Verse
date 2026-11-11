import { archiver } from "./pdflib.js";

const MIME = {
  pdf: "application/pdf",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  txt: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const mimeFor = (ext) => MIME[ext] || "application/octet-stream";

/** Browsers send file names as latin1-decoded UTF-8 through multer; undo that. */
export function fileName(file) {
  try {
    return Buffer.from(file.originalname, "latin1").toString("utf8");
  } catch {
    return file.originalname;
  }
}

/** "My Report (final).pdf" -> "My Report (final)" (safe to reuse in an output name). */
export function baseName(name, fallback = "document") {
  const stem = String(name || "").replace(/\.[^.\\/]+$/, "");
  const clean = stem.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").trim().slice(0, 80);
  return clean || fallback;
}

function disposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Send a finished file. `meta` is a small JSON object (sizes, notes, page counts) that the
 * frontend shows on its success screen. It travels in the X-Result-Meta header.
 */
export function sendBuffer(res, buffer, { filename, ext, meta } = {}) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  res.setHeader("Content-Type", mimeFor(ext || filename?.split(".").pop()));
  res.setHeader("Content-Disposition", disposition(filename));
  res.setHeader("Content-Length", data.length);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, X-Result-Meta");
  res.setHeader(
    "X-Result-Meta",
    encodeURIComponent(JSON.stringify({ resultSize: data.length, ...(meta || {}) })),
  );
  res.end(data);
}

/** Build a ZIP from in-memory entries ({ name, data }) and send it. */
export function sendZip(res, entries, { filename = "pdfverse.zip", meta } = {}) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];

    archive.on("data", (c) => chunks.push(c));
    archive.on("error", reject);
    archive.on("end", () => {
      try {
        sendBuffer(res, Buffer.concat(chunks), {
          filename,
          ext: "zip",
          meta: { files: entries.length, ...(meta || {}) },
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    for (const entry of entries) archive.append(Buffer.from(entry.data), { name: entry.name });
    archive.finalize();
  });
}
