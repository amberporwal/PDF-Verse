import { StandardFonts } from "../utils/pdflib.js";
import { asyncHandler, HttpError } from "../utils/errors.js";
import { baseName, fileName, sendBuffer } from "../utils/http.js";
import { imageType, loadPdf, num, parsePages, plural, requireFile } from "../utils/pdf.js";
import {
  drawImageVisual,
  drawTextVisual,
  guardEncoding,
  pageGeometry,
  parseColor,
  placeBox,
  safePosition,
  toUser,
} from "../utils/layout.js";

const FONTS = {
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  courier: [StandardFonts.Courier, StandardFonts.CourierBold],
};
const pickFont = (name, bold) => FONTS[name]?.[bold ? 1 : 0] ?? FONTS.helvetica[bold ? 1 : 0];

/* ---------- Page numbers ---------- */

export const addPageNumbers = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const doc = await loadPdf(file);
  const count = doc.getPageCount();

  const pattern = String(req.body.format || "{n}").slice(0, 60);
  if (!/\{n\}/.test(pattern)) throw new HttpError(400, "The number format must contain {n}, for example: Page {n} of {total}");
  const start = Math.round(num(req.body.start, 1, 0, 100000));
  const size = num(req.body.fontSize, 11, 6, 48);
  const margin = num(req.body.margin, 28, 0, 200);
  const position = safePosition(req.body.position, "bottom-center");
  const color = parseColor(req.body.color, "#333333");
  const indexes = parsePages(req.body.pages, count, { emptyMeansAll: true });
  const font = await doc.embedFont(pickFont(req.body.font, false));
  const total = start - 1 + count;

  await guardEncoding(async () => {
    for (const i of indexes) {
      const page = doc.getPage(i);
      const g = pageGeometry(page);
      const label = pattern.replace(/\{n\}/g, String(start + i)).replace(/\{total\}/g, String(total));
      const tw = font.widthOfTextAtSize(label, size);
      const { x, y } = placeBox(g.vw, g.vh, tw, size, position, margin);
      drawTextVisual(page, label, { vx: x, vy: y, size, font, color });
    }
  });

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-numbered.pdf`,
    ext: "pdf",
    meta: { pages: count, note: `Numbers added to ${plural(indexes.length, "page")}.` },
  });
});

/* ---------- Add text ---------- */

export const addText = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const text = String(req.body.text || "").replace(/\r/g, "");
  if (!text.trim()) throw new HttpError(400, "Enter the text to add.");
  if (text.length > 2000) throw new HttpError(400, "That text is too long (2000 characters maximum).");

  const doc = await loadPdf(file);
  const size = num(req.body.fontSize, 18, 6, 144);
  const margin = num(req.body.margin, 40, 0, 300);
  const opacity = num(req.body.opacity, 1, 0.05, 1);
  const position = safePosition(req.body.position, "top-left");
  const color = parseColor(req.body.color, "#000000");
  const indexes = parsePages(req.body.pages, doc.getPageCount(), { emptyMeansAll: true });
  const font = await doc.embedFont(pickFont(req.body.font, req.body.bold === "true"));

  const lines = text.split("\n");
  const lineHeight = size * 1.25;
  const blockW = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)));
  const blockH = lines.length * lineHeight;

  await guardEncoding(async () => {
    for (const i of indexes) {
      const page = doc.getPage(i);
      const g = pageGeometry(page);
      const { x, y } = placeBox(g.vw, g.vh, blockW, blockH, position, margin);
      lines.forEach((line, k) => {
        const lw = font.widthOfTextAtSize(line, size);
        const dx = position.endsWith("right") ? blockW - lw : position.endsWith("center") || position === "center" ? (blockW - lw) / 2 : 0;
        drawTextVisual(page, line, { vx: x + dx, vy: y + blockH - (k + 1) * lineHeight + (lineHeight - size) / 2 + size * 0.2, size, font, color, opacity });
      });
    }
  });

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-text.pdf`,
    ext: "pdf",
    meta: { pages: doc.getPageCount(), note: `Text added to ${plural(indexes.length, "page")}.` },
  });
});

/* ---------- Add image ---------- */

export const addImage = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const imageFile = requireFile(req, "image", "an image (JPG or PNG) to place on the PDF");
  const type = imageType(imageFile.buffer);
  if (!type) throw new HttpError(400, "The image must be a JPG or PNG file.");

  const doc = await loadPdf(file);
  let image;
  try {
    image = type === "jpg" ? await doc.embedJpg(imageFile.buffer) : await doc.embedPng(imageFile.buffer);
  } catch {
    throw new HttpError(400, "That image looks damaged or uses an unsupported format.");
  }

  const widthPercent = num(req.body.width, 30, 2, 100);
  const opacity = num(req.body.opacity, 1, 0.05, 1);
  const margin = num(req.body.margin, 36, 0, 300);
  const position = safePosition(req.body.position, "bottom-right");
  const indexes = parsePages(req.body.pages, doc.getPageCount(), { emptyMeansAll: true });

  for (const i of indexes) {
    const page = doc.getPage(i);
    const g = pageGeometry(page);
    const w = (g.vw * widthPercent) / 100;
    const h = (w * image.height) / image.width;
    const { x, y } = placeBox(g.vw, g.vh, w, h, position, margin);
    drawImageVisual(page, image, { vx: x, vy: y, width: w, height: h, opacity });
  }

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-image.pdf`,
    ext: "pdf",
    meta: { pages: doc.getPageCount(), note: `Image placed on ${plural(indexes.length, "page")}.` },
  });
});

/* ---------- Crop ---------- */

export const cropPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const doc = await loadPdf(file);
  const top = num(req.body.top, 0, 0, 5000);
  const right = num(req.body.right, 0, 0, 5000);
  const bottom = num(req.body.bottom, 0, 0, 5000);
  const left = num(req.body.left, 0, 0, 5000);
  if (!(top || right || bottom || left)) throw new HttpError(400, "Set at least one margin to crop.");

  const indexes = parsePages(req.body.pages, doc.getPageCount(), { emptyMeansAll: true });
  for (const i of indexes) {
    const page = doc.getPage(i);
    const g = pageGeometry(page);
    if (g.vw - left - right < 20 || g.vh - top - bottom < 20) {
      throw new HttpError(400, `Page ${i + 1} would be cropped to almost nothing. Use smaller margins.`);
    }
    // Visual crop rectangle -> real coordinates (handles rotated pages).
    const a = toUser(g, left, bottom);
    const b = toUser(g, g.vw - right, g.vh - top);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    page.setCropBox(x, y, w, h);
    page.setMediaBox(x, y, w, h);
  }

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-cropped.pdf`,
    ext: "pdf",
    meta: {
      pages: doc.getPageCount(),
      note: `Cropped ${plural(indexes.length, "page")}. The cropped-away content is hidden from view but is not deleted from the file.`,
    },
  });
});

/* ---------- Metadata ---------- */

export const editMetadata = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const doc = await loadPdf(file);
  const field = (key) => (typeof req.body[key] === "string" ? req.body[key].trim().slice(0, 500) : undefined);

  const title = field("title");
  const author = field("author");
  const subject = field("subject");
  const keywords = field("keywords");
  const creator = field("creator");
  const producer = field("producer");

  if (title !== undefined) doc.setTitle(title);
  if (author !== undefined) doc.setAuthor(author);
  if (subject !== undefined) doc.setSubject(subject);
  if (keywords !== undefined) doc.setKeywords(keywords ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : []);
  if (creator !== undefined) doc.setCreator(creator);
  if (producer !== undefined) doc.setProducer(producer);
  doc.setModificationDate(new Date());

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-metadata.pdf`,
    ext: "pdf",
    meta: { pages: doc.getPageCount(), note: "Document properties updated." },
  });
});
