import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "../utils/pdflib.js";
import { createCanvas, loadImage } from "../utils/canvas.js";
import { asyncHandler, HttpError } from "../utils/errors.js";
import { baseName, fileName, sendBuffer } from "../utils/http.js";
import { assertPdfFile, loadPdf, plural, requireFile } from "../utils/pdf.js";
import { openPdf, renderPage } from "../utils/pdfjs.js";
import { MAX_RENDER_PAGES } from "../config.js";

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`);

/* =========================================================
 * Compress
 * ======================================================= */

const LEVELS = {
  low: { quality: 85, maxDim: 3000, dpi: 150 },
  medium: { quality: 70, maxDim: 1800, dpi: 120 },
  high: { quality: 50, maxDim: 1200, dpi: 96 },
};

const NAME = (s) => PDFName.of(s);

/** Re-encode embedded JPEG images at lower quality / resolution. Returns how many were replaced. */
async function recompressImages(doc, { quality, maxDim }) {
  const context = doc.context;
  let replaced = 0;

  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.lookup(NAME("Subtype")) !== NAME("Image")) continue;

    // Only plain JPEG (DCT) images in RGB/Gray without masks or decode tricks.
    const filter = dict.lookup(NAME("Filter"));
    const isDct =
      filter === NAME("DCTDecode") ||
      (filter instanceof PDFArray && filter.size() === 1 && filter.lookup(0) === NAME("DCTDecode"));
    if (!isDct) continue;
    if (dict.has(NAME("Decode")) || dict.has(NAME("Mask")) || dict.has(NAME("ImageMask"))) continue;

    const cs = dict.lookup(NAME("ColorSpace"));
    let components = 0;
    if (cs === NAME("DeviceRGB")) components = 3;
    else if (cs === NAME("DeviceGray")) components = 1;
    else if (cs instanceof PDFArray && cs.lookup(0) === NAME("ICCBased")) {
      const profile = cs.lookup(1);
      const n = profile?.dict?.lookup(NAME("N"));
      components = n instanceof PDFNumber ? n.asNumber() : 0;
    }
    if (components !== 1 && components !== 3) continue;
    const bpc = dict.lookup(NAME("BitsPerComponent"));
    if (bpc instanceof PDFNumber && bpc.asNumber() !== 8) continue;

    const original = Buffer.from(obj.contents);
    try {
      const img = await loadImage(original);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = createCanvas(w, h);
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const jpeg = canvas.toBuffer("image/jpeg", quality);
      if (jpeg.length >= original.length * 0.92) continue; // not worth it

      const newDict = context.obj({
        Type: "XObject",
        Subtype: "Image",
        Width: w,
        Height: h,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
        Filter: "DCTDecode",
      });
      const softMask = dict.get(NAME("SMask"));
      if (softMask) newDict.set(NAME("SMask"), softMask);
      context.assign(ref, PDFRawStream.of(newDict, new Uint8Array(jpeg)));
      replaced++;
    } catch {
      /* leave this image untouched */
    }
  }
  return replaced;
}

/** Maximum compression: every page becomes a JPEG (text is no longer selectable). */
async function rasterize(buffer, { dpi, quality }) {
  const doc = await openPdf(buffer);
  try {
    if (doc.numPages > MAX_RENDER_PAGES) {
      throw new HttpError(400, `Maximum compression supports up to ${MAX_RENDER_PAGES} pages (this PDF has ${doc.numPages}).`);
    }
    const out = await PDFDocument.create();
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const { buffer: jpg } = await renderPage(doc, n, { scale: dpi / 72, format: "jpg", quality });
      const image = await out.embedJpg(jpg);
      out.addPage([vp.width, vp.height]).drawImage(image, { x: 0, y: 0, width: vp.width, height: vp.height });
    }
    return out.save();
  } finally {
    await doc.destroy();
  }
}

export const compressPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const level = LEVELS[req.body.level] ? req.body.level : "medium";
  const mode = req.body.mode === "rasterize" ? "rasterize" : "smart";
  const settings = LEVELS[level];
  const originalSize = file.buffer.length;

  let bytes;
  let note;
  if (mode === "rasterize") {
    assertPdfFile(file);
    bytes = await rasterize(file.buffer, settings);
    note = "Every page was converted to an image to reach the smallest size. Text is no longer selectable or searchable.";
  } else {
    const doc = await loadPdf(file);
    const replaced = await recompressImages(doc, settings);
    bytes = await doc.save({ useObjectStreams: true });
    note = replaced
      ? `Recompressed ${plural(replaced, "image")}. Text and vector content were kept intact.`
      : "No large JPEG images were found, so only the file structure was optimized.";
  }

  if (bytes.length >= originalSize) {
    return sendBuffer(res, file.buffer, {
      filename: `${baseName(fileName(file))}-compressed.pdf`,
      ext: "pdf",
      meta: {
        originalSize,
        noGain: true,
        note: `This PDF is already well optimized, so it could not be made smaller (a result of ${kb(bytes.length)} would have been larger than the original ${kb(originalSize)}). Your original file is returned unchanged. Try the stronger level or "Maximum compression".`,
      },
    });
  }
  sendBuffer(res, bytes, {
    filename: `${baseName(fileName(file))}-compressed.pdf`,
    ext: "pdf",
    meta: { originalSize, note },
  });
});

/* =========================================================
 * Repair
 * ======================================================= */

export const repairPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  assertPdfFile(file);
  const name = fileName(file);

  let src;
  try {
    src = await PDFDocument.load(file.buffer, { throwOnInvalidObject: false, updateMetadata: false });
  } catch (error) {
    if (/encrypted/i.test(error?.message || "")) {
      throw new HttpError(422, `"${name}" is password protected. Unlock it first, then repair it.`);
    }
    throw new HttpError(422, `"${name}" is too badly damaged to recover. Its structure could not be read.`);
  }

  // Rebuild the document page by page so broken objects, orphaned data and bad cross-reference
  // tables are left behind.
  const out = await PDFDocument.create();
  let recovered = 0;
  const total = src.getPageCount();
  for (let i = 0; i < total; i++) {
    try {
      const [page] = await out.copyPages(src, [i]);
      out.addPage(page);
      recovered++;
    } catch {
      /* this page is unrecoverable */
    }
  }
  if (!recovered) throw new HttpError(422, `No pages could be recovered from "${name}".`);

  for (const [get, set] of [
    ["getTitle", "setTitle"],
    ["getAuthor", "setAuthor"],
    ["getSubject", "setSubject"],
  ]) {
    try {
      const value = src[get]();
      if (value) out[set](value);
    } catch {
      /* metadata is optional */
    }
  }

  sendBuffer(res, await out.save(), {
    filename: `${baseName(name)}-repaired.pdf`,
    ext: "pdf",
    meta: {
      pages: recovered,
      note:
        recovered === total
          ? `Rebuilt the file structure. All ${plural(total, "page")} were recovered.`
          : `Recovered ${recovered} of ${plural(total, "page")}. ${total - recovered} could not be recovered.`,
    },
  });
});

/* =========================================================
 * Flatten (form fields -> regular page content)
 * ======================================================= */

export const flattenPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const doc = await loadPdf(file);
  const form = doc.getForm();
  const count = form.getFields().length;

  if (!count) {
    throw new HttpError(422, "This PDF has no fillable form fields, so there is nothing to flatten.");
  }
  try {
    form.flatten();
  } catch {
    throw new HttpError(422, "The form fields in this PDF could not be flattened.");
  }

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-flattened.pdf`,
    ext: "pdf",
    meta: { pages: doc.getPageCount(), note: `Flattened ${plural(count, "form field")}. They can no longer be edited.` },
  });
});
