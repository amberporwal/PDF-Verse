import path from "node:path";
import { Readable } from "node:stream";
import { PDFDocument, degrees } from "../utils/pdflib.js";
import { asyncHandler, HttpError } from "../utils/errors.js";
import { baseName, fileName, sendBuffer, sendZip } from "../utils/http.js";
import { bool, imageType, looksLikePdf, num, parsePages, plural, requireFile, requireFiles } from "../utils/pdf.js";
import { extractLines, hasText, openPdf, renderPage } from "../utils/pdfjs.js";
import {
  convertWithLibreOffice,
  escapeHtml,
  findLibreOffice,
  htmlToPdfBuffer,
} from "../utils/office.js";
import { MAX_RENDER_PAGES } from "../config.js";

/* =========================================================
 * Images -> PDF
 * ======================================================= */

/** EXIF orientation (1-8) of a JPEG, so phone photos are not placed sideways. */
function jpegOrientation(buf) {
  try {
    let off = 2;
    while (off + 4 < buf.length && buf[off] === 0xff) {
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker === 0xe1 && buf.toString("ascii", off + 4, off + 8) === "Exif") {
        const tiff = off + 10;
        const little = buf.toString("ascii", tiff, tiff + 2) === "II";
        const r16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const r32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const ifd = tiff + r32(tiff + 4);
        const count = r16(ifd);
        for (let i = 0; i < count; i++) {
          const entry = ifd + 2 + i * 12;
          if (r16(entry) === 0x0112) return r16(entry + 8);
        }
        return 1;
      }
      off += 2 + len;
    }
  } catch {
    /* ignore damaged EXIF */
  }
  return 1;
}

const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

function imagesToPdfHandler(allowed, label) {
  return asyncHandler(async (req, res) => {
    const files = requireFiles(req, 1, `${label} images`);
    const pageSize = ["a4", "letter", "fit"].includes(req.body.pageSize) ? req.body.pageSize : "a4";
    const orientation = ["auto", "portrait", "landscape"].includes(req.body.orientation) ? req.body.orientation : "auto";
    const margin = num(req.body.margin, 24, 0, 100);

    const pdf = await PDFDocument.create();
    for (const file of files) {
      const type = imageType(file.buffer);
      if (!type || !allowed.includes(type)) {
        throw new HttpError(400, `"${fileName(file)}" is not a valid ${label} image.`);
      }
      let image;
      try {
        image = type === "jpg" ? await pdf.embedJpg(file.buffer) : await pdf.embedPng(file.buffer);
      } catch {
        throw new HttpError(400, `"${fileName(file)}" looks damaged or uses an unsupported image format.`);
      }

      const orient = type === "jpg" ? jpegOrientation(file.buffer) : 1;
      const turned = orient === 6 || orient === 8;
      const dispW = turned ? image.height : image.width; // size as the viewer should see it
      const dispH = turned ? image.width : image.height;

      let pageW;
      let pageH;
      if (pageSize === "fit") {
        const k = Math.min(1, 1000 / Math.max(dispW, dispH)) * 0.75; // ~96 dpi, capped
        pageW = dispW * k;
        pageH = dispH * k;
      } else {
        [pageW, pageH] = PAGE_SIZES[pageSize];
        const landscape = orientation === "landscape" || (orientation === "auto" && dispW > dispH);
        if (landscape) [pageW, pageH] = [pageH, pageW];
      }

      const m = pageSize === "fit" ? 0 : margin;
      const scale = Math.min((pageW - 2 * m) / dispW, (pageH - 2 * m) / dispH);
      const w = dispW * scale;
      const h = dispH * scale;
      const bx = (pageW - w) / 2;
      const by = (pageH - h) / 2;

      const page = pdf.addPage([pageW, pageH]);
      const sw = image.width * scale; // image's own (unrotated) width/height after scaling
      const sh = image.height * scale;
      if (orient === 6) page.drawImage(image, { x: bx, y: by + h, width: sw, height: sh, rotate: degrees(-90) });
      else if (orient === 8) page.drawImage(image, { x: bx + w, y: by, width: sw, height: sh, rotate: degrees(90) });
      else if (orient === 3) page.drawImage(image, { x: bx + w, y: by + h, width: sw, height: sh, rotate: degrees(180) });
      else page.drawImage(image, { x: bx, y: by, width: sw, height: sh });
    }

    sendBuffer(res, await pdf.save(), {
      filename: files.length === 1 ? `${baseName(fileName(files[0]))}.pdf` : "images.pdf",
      ext: "pdf",
      meta: { pages: files.length, note: `Created a PDF from ${plural(files.length, "image")}.` },
    });
  });
}

export const jpgToPdf = imagesToPdfHandler(["jpg"], "JPG");
export const pngToPdf = imagesToPdfHandler(["png"], "PNG");

/* =========================================================
 * PDF -> JPG / PNG
 * ======================================================= */

function pdfToImagesHandler(format) {
  return asyncHandler(async (req, res) => {
    const file = requireFile(req, "file", "a PDF file");
    if (!looksLikePdf(file.buffer)) throw new HttpError(400, `"${fileName(file)}" is not a PDF file.`);

    const dpi = num(req.body.dpi, 150, 50, 300);
    const quality = num(req.body.quality, 85, 10, 100);
    const doc = await openPdf(file.buffer);
    try {
      const pages = parsePages(req.body.pages, doc.numPages, { emptyMeansAll: true });
      if (pages.length > MAX_RENDER_PAGES) {
        throw new HttpError(400, `Please convert at most ${MAX_RENDER_PAGES} pages at a time (this PDF has ${doc.numPages}). Enter a page range.`);
      }

      const base = baseName(fileName(file));
      const images = [];
      for (const index of pages) {
        const { buffer } = await renderPage(doc, index + 1, { scale: dpi / 72, format, quality });
        images.push({ page: index + 1, buffer });
      }

      if (images.length === 1) {
        return sendBuffer(res, images[0].buffer, {
          filename: `${base}-page-${images[0].page}.${format}`,
          ext: format,
          meta: { pages: 1, note: `Rendered at ${dpi} DPI.` },
        });
      }
      const pad = String(doc.numPages).length;
      await sendZip(
        res,
        images.map((i) => ({ name: `${base}-page-${String(i.page).padStart(pad, "0")}.${format}`, data: i.buffer })),
        { filename: `${base}-${format}-images.zip`, meta: { pages: images.length, note: `Rendered ${plural(images.length, "page")} at ${dpi} DPI.` } },
      );
    } finally {
      await doc.destroy();
    }
  });
}

export const pdfToJpg = pdfToImagesHandler("jpg");
export const pdfToPng = pdfToImagesHandler("png");

/* =========================================================
 * PDF -> Word / Excel / PowerPoint (text based, honest limits)
 * ======================================================= */

async function readText(file) {
  if (!looksLikePdf(file.buffer)) throw new HttpError(400, `"${fileName(file)}" is not a PDF file.`);
  const doc = await openPdf(file.buffer);
  try {
    const pages = await extractLines(doc);
    if (!hasText(pages)) {
      throw new HttpError(
        422,
        "No selectable text was found. This looks like a scanned PDF. Run it through OCR PDF first, then convert the result.",
      );
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 11;
};

/** Merge consecutive lines into paragraphs using vertical gaps and font size changes. */
function groupParagraphs(lines) {
  const paragraphs = [];
  let current = null;
  for (const line of lines) {
    const prev = current?.lines[current.lines.length - 1];
    const startsNew =
      !prev ||
      line.y - prev.y > prev.fontSize * 1.75 ||
      Math.abs(line.fontSize - prev.fontSize) > prev.fontSize * 0.2 ||
      Math.abs(line.x - prev.x) > prev.fontSize * 3;
    if (startsNew) {
      current = { lines: [line] };
      paragraphs.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return paragraphs;
}

export const pdfToWord = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const pages = await readText(file);
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import("docx");

  const bodySize = median(pages.flatMap((p) => p.lines.map((l) => l.fontSize)));
  const twip = (pt) => Math.round(pt * 20);

  const sections = pages.map((page) => {
    const children = groupParagraphs(page.lines).map((para) => {
      const first = para.lines[0];
      const text = para.lines
        .map((l) => l.text)
        .reduce((acc, t) => (acc.endsWith("-") ? acc.slice(0, -1) + t : acc ? `${acc} ${t}` : t), "");
      const heading = first.fontSize >= bodySize * 1.25;
      const centered =
        Math.abs(first.x + first.width / 2 - page.width / 2) < page.width * 0.03 && first.x > page.width * 0.15;
      return new Paragraph({
        alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: heading ? 160 : 120 },
        children: [
          new TextRun({
            text,
            bold: heading,
            size: Math.round(Math.min(40, Math.max(8, first.fontSize)) * 2),
          }),
        ],
      });
    });
    return {
      properties: {
        page: {
          size: { width: twip(page.width), height: twip(page.height) },
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      children: children.length ? children : [new Paragraph("")],
    };
  });

  const buffer = await Packer.toBuffer(new Document({ creator: "Pdf VERSE", sections }));
  sendBuffer(res, buffer, {
    filename: `${baseName(fileName(file))}.docx`,
    ext: "docx",
    meta: {
      pages: pages.length,
      note: "Text was converted to editable paragraphs. Images, tables and exact layout are not reproduced.",
    },
  });
});

const NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;

/** Split a text line into cells wherever there is a wide horizontal gap. */
function lineCells(line) {
  const cells = [];
  for (const item of line.items) {
    const last = cells[cells.length - 1];
    if (last && item.x - last.end <= item.fontSize * 1.2) {
      last.text += (item.x - last.end > item.fontSize * 0.2 ? " " : "") + item.str;
      last.end = item.x + item.width;
    } else {
      cells.push({ x: item.x, end: item.x + item.width, text: item.str });
    }
  }
  return cells.map((c) => ({ x: c.x, text: c.text.trim() })).filter((c) => c.text);
}

export const pdfToExcel = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const pages = await readText(file);
  const single = req.body.layout === "single";
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pdf VERSE";

  const addRows = (sheet, page, startRow = 1) => {
    const rows = page.lines.map(lineCells);
    // Column anchors: cluster the x positions where cells start.
    const xs = rows.flat().map((c) => c.x).sort((a, b) => a - b);
    const anchors = [];
    for (const x of xs) {
      if (!anchors.length || x - anchors[anchors.length - 1] > 12) anchors.push(x);
    }
    const colOf = (x) => {
      let best = 0;
      anchors.forEach((a, i) => {
        if (Math.abs(a - x) < Math.abs(anchors[best] - x)) best = i;
      });
      return best;
    };
    let r = startRow;
    for (const cells of rows) {
      const row = sheet.getRow(r++);
      for (const cell of cells) {
        const col = colOf(cell.x) + 1;
        const existing = row.getCell(col).value;
        const text = existing ? `${existing} ${cell.text}` : cell.text;
        row.getCell(col).value = !existing && NUMBER.test(cell.text) ? Number(cell.text.replace(/,/g, "")) : text;
      }
    }
    return r;
  };

  if (single) {
    const sheet = wb.addWorksheet("PDF data");
    let row = 1;
    for (const page of pages) row = addRows(sheet, page, row) + 1;
  } else {
    for (const page of pages) addRows(wb.addWorksheet(`Page ${page.number}`), page);
  }
  wb.eachSheet((sheet) => {
    sheet.columns.forEach((col) => {
      let max = 8;
      col.eachCell?.({ includeEmpty: false }, (c) => (max = Math.max(max, String(c.value).length + 2)));
      col.width = Math.min(60, max);
    });
  });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  sendBuffer(res, buffer, {
    filename: `${baseName(fileName(file))}.xlsx`,
    ext: "xlsx",
    meta: {
      pages: pages.length,
      note: "Rows and columns are detected from text positions. Simple tables convert well; complex layouts may need tidying.",
    },
  });
});

export const pdfToPowerpoint = asyncHandler(async (req, res) => {
  const file = requireFile(req, "file", "a PDF file");
  const mode = req.body.mode === "editable" ? "editable" : "image";
  if (!looksLikePdf(file.buffer)) throw new HttpError(400, `"${fileName(file)}" is not a PDF file.`);

  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.author = "Pdf VERSE";

  let count;
  if (mode === "editable") {
    const pages = await readText(file);
    count = pages.length;
    const W = pages[0].width / 72;
    const H = pages[0].height / 72;
    pptx.defineLayout({ name: "PDFPAGE", width: W, height: H });
    pptx.layout = "PDFPAGE";
    for (const page of pages) {
      const slide = pptx.addSlide();
      const k = W / (page.width / 72); // pages with other sizes are scaled to the first page
      for (const line of page.lines) {
        const x = (line.x / 72) * k;
        const y = ((line.y - line.fontSize) / 72) * k;
        slide.addText(line.text, {
          x,
          y: Math.max(0, y),
          w: Math.min(W - x, Math.max(0.5, (line.width / 72) * k + 0.4)),
          h: (line.fontSize * 1.3 * k) / 72,
          fontSize: Math.max(6, line.fontSize * k),
          fontFace: "Arial",
          color: "000000",
          margin: 0,
          valign: "top",
          wrap: false,
        });
      }
    }
  } else {
    const doc = await openPdf(file.buffer);
    try {
      if (doc.numPages > MAX_RENDER_PAGES) {
        throw new HttpError(400, `Image mode supports up to ${MAX_RENDER_PAGES} pages (this PDF has ${doc.numPages}).`);
      }
      count = doc.numPages;
      const first = await doc.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      const W = vp.width / 72;
      const H = vp.height / 72;
      pptx.defineLayout({ name: "PDFPAGE", width: W, height: H });
      pptx.layout = "PDFPAGE";
      for (let n = 1; n <= doc.numPages; n++) {
        const { buffer } = await renderPage(doc, n, { scale: 150 / 72, format: "jpg", quality: 88 });
        pptx.addSlide().addImage({ data: `image/jpeg;base64,${buffer.toString("base64")}`, x: 0, y: 0, w: W, h: H });
      }
    } finally {
      await doc.destroy();
    }
  }

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  sendBuffer(res, buffer, {
    filename: `${baseName(fileName(file))}.pptx`,
    ext: "pptx",
    meta: {
      pages: count,
      note:
        mode === "editable"
          ? "Each text line became an editable text box. Images and graphics are not included."
          : "Each page became a slide image: it looks identical to the PDF, but the text is not editable.",
    },
  });
});

/* =========================================================
 * Word / Excel / PowerPoint -> PDF
 * ======================================================= */

const htmlPage = (body, extraCss = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Calibri,Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#111}
  img{max-width:100%;height:auto} table{border-collapse:collapse;max-width:100%}
  td,th{border:1px solid #999;padding:3px 6px;vertical-align:top} ${extraCss}
</style></head><body>${body}</body></html>`;

async function docxFallback(buffer) {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.convertToHtml({ buffer });
  return htmlToPdfBuffer(htmlPage(value), { format: "A4", marginMm: 20 });
}

async function sheetFallback(buffer, ext) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  if (ext === ".csv") await wb.csv.read(Readable.from(buffer));
  else await wb.xlsx.load(buffer);

  let html = "";
  wb.eachSheet((sheet) => {
    let rows = "";
    let count = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (count++ > 5000) return;
      const cells = [];
      for (let c = 1; c <= sheet.actualColumnCount; c++) cells.push(`<td>${escapeHtml(row.getCell(c).text ?? "")}</td>`);
      rows += `<tr>${cells.join("")}</tr>`;
    });
    html += `<h3 style="page-break-before:${html ? "always" : "auto"}">${escapeHtml(sheet.name)}</h3><table>${rows}</table>`;
  });
  if (!html) throw new HttpError(422, "This spreadsheet has no data to convert.");
  return htmlToPdfBuffer(htmlPage(html, "td{font-size:9pt}"), { format: "A4", landscape: true, marginMm: 10 });
}

function officeToPdfHandler({ exts, label, install, fallback }) {
  return asyncHandler(async (req, res) => {
    const file = requireFile(req, "file", `a ${label} file`);
    const name = fileName(file);
    const ext = path.extname(name).toLowerCase();
    if (!exts.includes(ext)) {
      throw new HttpError(400, `"${name}" is not a supported ${label} file. Supported: ${exts.join(", ")}`);
    }
    if ([".docx", ".xlsx", ".pptx"].includes(ext) && file.buffer.subarray(0, 2).toString() !== "PK") {
      throw new HttpError(400, `"${name}" is damaged or is not really a ${ext} file.`);
    }

    let pdf;
    let engine;
    if (findLibreOffice()) {
      try {
        pdf = await convertWithLibreOffice(file.buffer, ext);
        engine = "LibreOffice";
      } catch (error) {
        if (error instanceof HttpError || !fallback?.(ext)) throw error;
        console.error("LibreOffice failed, using fallback:", error.message);
      }
    }
    if (!pdf) {
      if (!fallback?.(ext)) {
        throw new HttpError(501, `${install} Install LibreOffice (free, libreoffice.org), then restart the Pdf VERSE server.`);
      }
      pdf = await fallback.run(file.buffer, ext);
      engine = "the built-in converter (simplified layout)";
    }
    sendBuffer(res, pdf, {
      filename: `${baseName(name)}.pdf`,
      ext: "pdf",
      meta: { note: `Converted with ${engine}.` },
    });
  });
}

export const wordToPdf = officeToPdfHandler({
  exts: [".docx", ".doc", ".odt", ".rtf"],
  label: "Word",
  install: "Word to PDF for this file type needs LibreOffice.",
  fallback: Object.assign((ext) => ext === ".docx", { run: (buf) => docxFallback(buf) }),
});

export const excelToPdf = officeToPdfHandler({
  exts: [".xlsx", ".xls", ".csv", ".ods"],
  label: "Excel",
  install: "Excel to PDF for this file type needs LibreOffice.",
  fallback: Object.assign((ext) => [".xlsx", ".csv"].includes(ext), { run: (buf, ext) => sheetFallback(buf, ext) }),
});

export const powerpointToPdf = officeToPdfHandler({
  exts: [".pptx", ".ppt", ".odp"],
  label: "PowerPoint",
  install: "PowerPoint to PDF always needs LibreOffice (there is no reliable built-in converter).",
  fallback: null,
});

/* =========================================================
 * HTML -> PDF
 * ======================================================= */

export const htmlToPdf = asyncHandler(async (req, res) => {
  let html = String(req.body.html || "").trim();
  let name = "page";
  const file = req.file || req.files?.file?.[0];
  if (file) {
    name = fileName(file);
    if (!/\.html?$/i.test(name)) throw new HttpError(400, "Please upload a .html or .htm file.");
    html = file.buffer.toString("utf8");
  }
  if (!html) throw new HttpError(400, "Paste some HTML or upload an HTML file.");

  const format = ["A4", "Letter", "Legal", "A3"].includes(req.body.pageSize) ? req.body.pageSize : "A4";
  const pdf = await htmlToPdfBuffer(html, {
    format,
    landscape: req.body.orientation === "landscape",
    marginMm: num(req.body.margin, 15, 0, 50),
    printBackground: bool(req.body.background, true),
  });
  sendBuffer(res, pdf, {
    filename: `${baseName(name, "page")}.pdf`,
    ext: "pdf",
    meta: { note: "Scripts and external resources (links, remote images, web fonts) are blocked for security. Use inline CSS and data-URI images." },
  });
});
