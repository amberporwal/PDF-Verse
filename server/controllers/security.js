import { randomBytes } from "node:crypto";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  SecurePDFDocument,
  SecurePDFName,
  StandardFonts,
  decodePDFRawStream,
} from "../utils/pdflib.js";
import { asyncHandler, HttpError } from "../utils/errors.js";
import { baseName, fileName, sendBuffer } from "../utils/http.js";
import { assertPdfFile, bool, loadPdf, num, parsePages, plural, requireFile } from "../utils/pdf.js";
import { drawTextVisual, guardEncoding, pageGeometry, parseColor, placeBox, safePosition } from "../utils/layout.js";

/* =========================================================
 * Protect / Unlock
 * ======================================================= */

/**
 * After decrypting, the library still writes the old encryption dictionary and the old
 * cross-reference stream back into the file as orphan objects. They are harmless, but the
 * old encryption dictionary holds password verifier data, so drop them from the unlocked copy.
 */
function dropEncryptionLeftovers(doc) {
  const key = (name) => SecurePDFName.of(name);
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    // The old cross-reference stream is kept as an "invalid object" blob that still names /Encrypt.
    if (obj?.constructor?.name === "PDFInvalidObject") {
      doc.context.delete(ref);
      continue;
    }
    const dict = obj?.dict ?? obj;
    if (typeof dict?.get !== "function") continue;
    const type = dict.get(key("Type"))?.toString();
    const isEncryptDict =
      dict.get(key("Filter"))?.toString() === "/Standard" && dict.has(key("O")) && dict.has(key("U"));
    // Object streams were already unpacked into normal objects when the file was opened.
    if (type === "/XRef" || type === "/ObjStm" || isEncryptDict) doc.context.delete(ref);
  }
}

export const protectPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  assertPdfFile(file);
  const password = String(req.body.password || "");
  if (password.length < 4) throw new HttpError(400, "Choose a password with at least 4 characters.");
  if (password.length > 64) throw new HttpError(400, "Please use a password of 64 characters or fewer.");

  let doc;
  try {
    doc = await SecurePDFDocument.load(file.buffer, { updateMetadata: false });
  } catch (error) {
    if (/encrypted/i.test(error?.message || "")) {
      throw new HttpError(422, "This PDF is already password protected. Unlock it first if you want to set a new password.");
    }
    throw new HttpError(400, `"${fileName(file)}" could not be read. It may be corrupted. Try the Repair PDF tool first.`);
  }

  doc.encrypt({
    userPassword: password,
    ownerPassword: String(req.body.ownerPassword || "") || randomBytes(16).toString("hex"),
    algorithm: "AES-256",
    permissions: {
      printing: bool(req.body.allowPrint, true) ? "highResolution" : false,
      copying: bool(req.body.allowCopy, true),
      modifying: bool(req.body.allowModify, false),
      annotating: bool(req.body.allowModify, false),
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: bool(req.body.allowModify, false),
    },
  });

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-protected.pdf`,
    ext: "pdf",
    meta: { pages: doc.getPageCount(), note: "Protected with AES-256 encryption. Keep your password safe: it cannot be recovered." },
  });
});

export const unlockPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  assertPdfFile(file);
  const password = String(req.body.password || "");

  // Is it encrypted at all? (Regular pdf-lib refuses to open encrypted files.)
  try {
    await PDFDocument.load(file.buffer, { updateMetadata: false });
    throw new HttpError(422, "This PDF is not password protected, so there is nothing to unlock.");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (!/encrypted/i.test(error?.message || "")) {
      throw new HttpError(400, `"${fileName(file)}" could not be read. It may be corrupted. Try the Repair PDF tool first.`);
    }
  }

  let doc;
  try {
    doc = await SecurePDFDocument.load(file.buffer, { password, updateMetadata: false });
  } catch (error) {
    throw new HttpError(
      422,
      /password/i.test(error?.message || "")
        ? password
          ? "That password is incorrect."
          : "This PDF needs a password to open. Enter it and try again."
        : "This PDF could not be unlocked. It may use an unsupported encryption method.",
    );
  }
  if (!password) {
    // It opened without any password: it only carries owner restrictions (no printing/copying).
    // Pdf VERSE never removes restrictions without the owner password.
    throw new HttpError(
      422,
      "This PDF has usage restrictions set by its owner (for example no copying or printing). Pdf VERSE only unlocks files when you provide the password.",
    );
  }

  dropEncryptionLeftovers(doc);
  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-unlocked.pdf`,
    ext: "pdf",
    meta: { pages: doc.getPageCount(), note: "Password removed. This file can now be opened without a password." },
  });
});

/* =========================================================
 * Add watermark
 * ======================================================= */

export const watermarkPdf = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const text = String(req.body.text || "").trim();
  if (!text) throw new HttpError(400, "Enter the watermark text.");
  if (text.length > 120) throw new HttpError(400, "Watermark text is too long (120 characters maximum).");

  const size = num(req.body.fontSize, 48, 8, 200);
  const opacity = num(req.body.opacity, 0.25, 0.02, 1);
  const angle = num(req.body.rotation, 45, -180, 180);
  const color = parseColor(req.body.color, "#808080");
  const rawPosition = req.body.position === "tile" ? "tile" : safePosition(req.body.position, "center");

  const doc = await loadPdf(file);
  const font = await doc.embedFont(bool(req.body.bold, true) ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  const indexes = parsePages(req.body.pages, doc.getPageCount(), { emptyMeansAll: true });

  const tw = font.widthOfTextAtSize(text, size);
  const th = size * 0.72; // approximate cap height
  const rad = (angle * Math.PI) / 180;
  const draw = (page, cx, cy) =>
    drawTextVisual(page, text, {
      vx: cx - (tw / 2) * Math.cos(rad) + (th / 2) * Math.sin(rad),
      vy: cy - (tw / 2) * Math.sin(rad) - (th / 2) * Math.cos(rad),
      angle,
      size,
      font,
      color,
      opacity,
    });

  await guardEncoding(async () => {
    for (const i of indexes) {
      const page = doc.getPage(i);
      const g = pageGeometry(page);
      if (rawPosition === "tile") {
        const stepX = tw + size * 1.5;
        const stepY = size * 3.2;
        let row = 0;
        for (let cy = stepY / 2; cy < g.vh + stepY; cy += stepY, row++) {
          for (let cx = (row % 2 ? stepX / 2 : 0); cx < g.vw + stepX; cx += stepX) draw(page, cx, cy);
        }
      } else {
        const { x, y } = placeBox(g.vw, g.vh, tw, th, rawPosition, 36);
        draw(page, x + tw / 2, y + th / 2);
      }
    }
  });

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-watermarked.pdf`,
    ext: "pdf",
    meta: { pages: doc.getPageCount(), note: `Watermark added to ${plural(indexes.length, "page")}.` },
  });
});

/* =========================================================
 * Remove watermark (best effort)
 * ======================================================= */

/** Text shown by a BT..ET block: literal (...) and hex <...> strings, concatenated in order. */
function blockText(block) {
  let text = "";
  const re = /<([0-9A-Fa-f\s]*)>|\(((?:\\[\s\S]|[^\\)])*)\)/g;
  for (const m of block.matchAll(re)) {
    if (m[1] !== undefined) {
      const hex = m[1].replace(/\s+/g, "");
      for (let i = 0; i + 1 < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    } else {
      text += m[2].replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) => {
        if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
        return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[c] ?? c;
      });
    }
  }
  return text;
}

function stripTextBlocks(content, needle) {
  let removed = 0;
  const out = content.replace(/\bBT\b[\s\S]*?\bET\b/g, (block) => {
    if (blockText(block).toLowerCase().includes(needle)) {
      removed++;
      return "";
    }
    return block;
  });
  return { out, removed };
}

const decodeStream = (stream) => {
  try {
    return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
  } catch {
    return null;
  }
};

/** Remove matching text from a page's content and from the form XObjects it uses. */
function cleanPageContent(doc, page, needle) {
  const context = doc.context;
  let removed = 0;

  const contents = page.node.Contents();
  const parts = contents instanceof PDFArray ? contents.asArray().map((_, i) => contents.lookup(i)) : [contents];
  const decoded = parts.filter((s) => s instanceof PDFRawStream).map(decodeStream);
  if (decoded.length && decoded.every((d) => d !== null)) {
    const result = stripTextBlocks(decoded.join("\n"), needle);
    if (result.removed) {
      removed += result.removed;
      page.node.set(PDFName.of("Contents"), context.register(context.flateStream(Buffer.from(result.out, "latin1"))));
    }
  }

  const seen = new Set();
  const visit = (resources, depth) => {
    const xobjects = resources?.lookupMaybe?.(PDFName.of("XObject"), PDFDict);
    if (!xobjects || depth > 2) return;
    for (const [, value] of xobjects.entries()) {
      const stream = xobjects.context.lookup(value);
      if (!(stream instanceof PDFRawStream) || seen.has(stream)) continue;
      seen.add(stream);
      if (stream.dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Form")) continue;

      const text = decodeStream(stream);
      if (text !== null) {
        const result = stripTextBlocks(text, needle);
        if (result.removed) {
          removed += result.removed;
          const entries = [...stream.dict.entries()]
            .filter(([k]) => !["Length", "Filter", "DecodeParms"].includes(k.decodeText()))
            .map(([k, v]) => [k.decodeText(), v]);
          const replacement = context.flateStream(Buffer.from(result.out, "latin1"), Object.fromEntries(entries));
          if (value.objectNumber !== undefined) context.assign(value, replacement);
        }
      }
      visit(stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict), depth + 1);
    }
  };
  visit(page.node.Resources(), 0);
  return removed;
}

export const removeWatermark = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const needle = String(req.body.text || "").trim().toLowerCase();
  const stripAnnotations = bool(req.body.annotations, true);
  if (!needle && !stripAnnotations) throw new HttpError(400, "Enter the watermark text to look for.");

  const doc = await loadPdf(file);
  let textRemoved = 0;
  let annotsRemoved = 0;

  for (const page of doc.getPages()) {
    if (needle) textRemoved += cleanPageContent(doc, page, needle);

    if (stripAnnotations) {
      const annots = page.node.Annots();
      if (annots) {
        const kept = [];
        for (let i = 0; i < annots.size(); i++) {
          const annot = annots.lookupMaybe(i, PDFDict);
          const subtype = annot?.lookup(PDFName.of("Subtype"));
          if (subtype === PDFName.of("Watermark")) annotsRemoved++;
          else kept.push(annots.get(i));
        }
        if (kept.length !== annots.size()) page.node.set(PDFName.of("Annots"), doc.context.obj(kept));
      }
    }
  }

  if (!textRemoved && !annotsRemoved) {
    throw new HttpError(
      422,
      "No matching watermark was found. Pdf VERSE can only remove watermarks that are stored as text (check the spelling) or as watermark annotations. Watermarks baked into images or scanned pages cannot be removed.",
    );
  }

  sendBuffer(res, await doc.save(), {
    filename: `${baseName(fileName(file))}-no-watermark.pdf`,
    ext: "pdf",
    meta: {
      pages: doc.getPageCount(),
      note: `Removed ${textRemoved} text watermark${textRemoved === 1 ? "" : "s"}${annotsRemoved ? ` and ${plural(annotsRemoved, "watermark annotation")}` : ""}.`,
    },
  });
});
