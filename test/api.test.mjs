// End-to-end API tests. Start the backend first (npm run dev:backend), then: npm test
// Every test sends a real file to the real route and inspects the real output.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as docx from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";

const require = createRequire(import.meta.url);
const { createCanvas } = require("@napi-rs/canvas");
const BASE = process.env.API || "http://localhost:5000/api";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pdfverse-test-"));

/* ---------------- helpers ---------------- */
async function post(route, fields = {}, files = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
  for (const f of files) fd.append(f.field, new Blob([f.data], { type: f.type || "application/octet-stream" }), f.name);
  const res = await fetch(`${BASE}${route}`, { method: "POST", body: fd });
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") || "";
  let json = null;
  if (type.includes("json")) json = JSON.parse(buf.toString());
  let meta = null;
  const m = res.headers.get("x-result-meta");
  if (m) meta = JSON.parse(decodeURIComponent(m));
  return { status: res.status, type, buf, json, meta, disposition: res.headers.get("content-disposition") };
}
const F = (field, name, data, type) => ({ field, name, data, type });
const pdfF = (data, name = "test.pdf", field = "file") => F(field, name, data, "application/pdf");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const pages = async (buf) => (await PDFDocument.load(buf, { ignoreEncryption: true })).getPageCount();
const isPdf = (buf) => buf.subarray(0, 5).toString() === "%PDF-";
const isZip = (buf) => buf[0] === 0x50 && buf[1] === 0x4b;
const ok = (r, what = "") => assert(r.status === 200, `${what} expected 200 got ${r.status}: ${r.json?.error || r.buf.toString().slice(0, 200)}`);
const failsWith = (r, status, what = "") => {
  assert(r.status === status, `${what} expected ${status} got ${r.status}`);
  assert(r.json?.error && !/at .*\.js:\d+/.test(r.json.error), `${what} should return a friendly JSON error, got ${r.buf.toString().slice(0, 120)}`);
};
function zipList(buf) {
  const f = path.join(tmp, `z${Math.random().toString(36).slice(2)}.zip`);
  fs.writeFileSync(f, buf);
  return execFileSync("unzip", ["-Z1", f]).toString().trim().split("\n");
}
function pdfText(buf) {
  const f = path.join(tmp, `t${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(f, buf);
  return execFileSync("pdftotext", ["-layout", f, "-"]).toString();
}

/* ---------------- fixtures ---------------- */
async function makePdf(n, label) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${label} page ${i}`, { x: 60, y: 760, size: 24, font });
    page.drawText(`Total amount ${i * 100}`, { x: 60, y: 720, size: 12, font });
    page.drawText(`Name        Qty      Price`, { x: 60, y: 690, size: 11, font });
    page.drawText(`Widget      ${i}        ${i * 10}.00`, { x: 60, y: 674, size: 11, font });
    page.drawText(`Gadget      ${i + 1}        ${i * 20}.00`, { x: 60, y: 658, size: 11, font });
  }
  return Buffer.from(await doc.save());
}
function makeImage(type, label = "IMG") {
  const c = createCanvas(600, 400);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 600, 400);
  g.fillStyle = "#3355cc"; g.fillRect(40, 40, 200, 120);
  g.fillStyle = "#000"; g.font = "48px sans-serif"; g.fillText(label, 60, 300);
  return c.toBuffer(type === "png" ? "image/png" : "image/jpeg");
}
async function makeScanPdf() {
  const c = createCanvas(1240, 600);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 1240, 600);
  g.fillStyle = "#000"; g.font = "bold 90px sans-serif";
  g.fillText("HELLO OCR WORLD", 60, 200);
  g.fillText("Invoice 12345", 60, 400);
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(c.toBuffer("image/png"));
  const page = doc.addPage([620, 300]);
  page.drawImage(img, { x: 0, y: 0, width: 620, height: 300 });
  return Buffer.from(await doc.save());
}
async function makeFormPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const form = doc.getForm();
  const tf = form.createTextField("name");
  tf.setText("Amber");
  tf.addToPage(page, { x: 50, y: 200, width: 200, height: 24 });
  return Buffer.from(await doc.save());
}

const pdf5 = await makePdf(5, "Alpha");
const pdf3 = await makePdf(3, "Beta");
const png = makeImage("png", "PNG");
const jpg = makeImage("jpg", "JPG");

console.log(`\nPdf VERSE API tests -> ${BASE}\n`);

/* ---------------- infrastructure ---------------- */
console.log("Infrastructure");
await test("health endpoint", async () => {
  const r = await fetch(BASE + "/health");
  assert(r.ok && (await r.json()).status.includes("Pdf VERSE"), "bad health");
});
await test("unknown API route returns JSON 404", async () => {
  const r = await fetch(BASE + "/nope");
  assert(r.status === 404 && (await r.json()).error, "expected json 404");
});
await test("capabilities endpoint", async () => {
  const j = await (await fetch(BASE + "/capabilities")).json();
  assert(j.ok === true && "libreoffice" in j && "browser" in j, JSON.stringify(j));
});

/* ---------------- organize ---------------- */
console.log("\nOrganize");
await test("merge: 2 PDFs -> 8 pages (original route + field 'pdfs')", async () => {
  const r = await post("/merge-pdf", {}, [pdfF(pdf5, "a.pdf", "pdfs"), pdfF(pdf3, "b.pdf", "pdfs")]);
  ok(r);
  assert(r.type.includes("pdf") && isPdf(r.buf), "not a pdf");
  assert((await pages(r.buf)) === 8, "page count");
});
await test("merge: order is respected (b before a)", async () => {
  const r = await post("/merge-pdf", {}, [pdfF(pdf3, "b.pdf", "pdfs"), pdfF(pdf5, "a.pdf", "pdfs")]);
  ok(r);
  assert(pdfText(r.buf).indexOf("Beta page 1") < pdfText(r.buf).indexOf("Alpha page 1"), "wrong order");
});
await test("merge: 1 file -> friendly 400", async () => failsWith(await post("/merge-pdf", {}, [pdfF(pdf5, "a.pdf", "pdfs")]), 400));
await test("merge: non-PDF content -> friendly 4xx", async () => {
  const r = await post("/merge-pdf", {}, [pdfF(pdf5, "a.pdf", "pdfs"), F("pdfs", "x.pdf", Buffer.from("not a pdf at all"), "application/pdf")]);
  assert(r.status >= 400 && r.status < 500 && r.json?.error, `got ${r.status}`);
});
await test("split: every page separately -> ZIP with 5 PDFs (original route + field 'pdf')", async () => {
  const r = await post("/split-pdf", {}, [pdfF(pdf5, "a.pdf", "pdf")]);
  ok(r);
  assert(isZip(r.buf), "not zip");
  assert(zipList(r.buf).length === 5, zipList(r.buf).join());
});
await test("split: ranges '1-3, 5' -> 2 PDFs (3 pages + 1 page)", async () => {
  const r = await post("/split-pdf", { ranges: "1-3, 5" }, [pdfF(pdf5, "a.pdf", "pdf")]);
  ok(r);
  assert(zipList(r.buf).length === 2, "entries");
});
await test("split: out-of-range -> friendly 400", async () => failsWith(await post("/split-pdf", { ranges: "1-9" }, [pdfF(pdf5, "a.pdf", "pdf")]), 400));
await test("split: bad syntax -> friendly 400", async () => failsWith(await post("/split-pdf", { ranges: "abc" }, [pdfF(pdf5, "a.pdf", "pdf")]), 400));
await test("remove pages '2,3' -> 3 pages", async () => {
  const r = await post("/remove-pages", { pages: "2,3" }, [pdfF(pdf5)]);
  ok(r);
  assert((await pages(r.buf)) === 3, "count");
  const t = pdfText(r.buf);
  assert(!t.includes("Alpha page 2") && t.includes("Alpha page 4"), "wrong pages removed");
});
await test("remove all pages -> friendly 400", async () => failsWith(await post("/remove-pages", { pages: "1-5" }, [pdfF(pdf5)]), 400));
await test("extract pages '1, 4-5' -> 3 pages", async () => {
  const r = await post("/extract-pages", { pages: "1, 4-5" }, [pdfF(pdf5)]);
  ok(r);
  assert((await pages(r.buf)) === 3, "count");
  assert(pdfText(r.buf).includes("Alpha page 4"), "content");
});
await test("rotate: 90deg on pages 1-2", async () => {
  const r = await post("/rotate-pdf", { angle: "90", pages: "1-2" }, [pdfF(pdf5)]);
  ok(r);
  const d = await PDFDocument.load(r.buf);
  assert(d.getPage(0).getRotation().angle === 90 && d.getPage(1).getRotation().angle === 90 && d.getPage(2).getRotation().angle === 0, "rotation values");
});
await test("rotate: per-page map {1:180,3:270}", async () => {
  const r = await post("/rotate-pdf", { rotations: { 1: 180, 3: 270 } }, [pdfF(pdf5)]);
  ok(r);
  const d = await PDFDocument.load(r.buf);
  assert(d.getPage(0).getRotation().angle === 180 && d.getPage(2).getRotation().angle === 270, "rotation values");
});
await test("rotate: invalid angle -> friendly 400", async () => failsWith(await post("/rotate-pdf", { angle: "45" }, [pdfF(pdf5)]), 400));
await test("reorder '5,4,3,2,1'", async () => {
  const r = await post("/reorder-pdf", { order: "5,4,3,2,1" }, [pdfF(pdf5)]);
  ok(r);
  const t = pdfText(r.buf);
  assert(t.indexOf("Alpha page 5") < t.indexOf("Alpha page 1"), "order");
});
await test("reorder: incomplete order -> friendly 400", async () => failsWith(await post("/reorder-pdf", { order: "1,2" }, [pdfF(pdf5)]), 400));
await test("organize: delete/duplicate/rotate spec", async () => {
  const spec = [{ page: 3, rotate: 90 }, { page: 1 }, { page: 1 }];
  const r = await post("/organize-pdf", { spec }, [pdfF(pdf5)]);
  ok(r);
  const d = await PDFDocument.load(r.buf);
  assert(d.getPageCount() === 3 && d.getPage(0).getRotation().angle === 90, "spec result");
});

/* ---------------- convert ---------------- */
console.log("\nConvert");
await test("JPG -> PDF (2 images, A4)", async () => {
  const r = await post("/jpg-to-pdf", { pageSize: "a4" }, [F("files", "1.jpg", jpg, "image/jpeg"), F("files", "2.jpg", jpg, "image/jpeg")]);
  ok(r);
  assert(isPdf(r.buf) && (await pages(r.buf)) === 2, "pdf pages");
});
await test("PNG -> PDF (fit page size)", async () => {
  const r = await post("/png-to-pdf", { pageSize: "fit" }, [F("files", "1.png", png, "image/png")]);
  ok(r);
  assert(isPdf(r.buf) && (await pages(r.buf)) === 1, "pdf pages");
});
await test("JPG -> PDF rejects a PNG upload with friendly error", async () => {
  const r = await post("/jpg-to-pdf", {}, [F("files", "1.png", png, "image/png")]);
  assert(r.status === 400 && r.json?.error, `got ${r.status}`);
});
await test("PDF -> JPG: ZIP of 5 JPEGs", async () => {
  const r = await post("/pdf-to-jpg", { dpi: "72", quality: "80" }, [pdfF(pdf5)]);
  ok(r);
  assert(isZip(r.buf) && zipList(r.buf).length === 5, "zip entries");
});
await test("PDF -> PNG: selected page 2 only", async () => {
  const r = await post("/pdf-to-png", { dpi: "72", pages: "2" }, [pdfF(pdf5)]);
  ok(r);
  const ct = r.type;
  assert((ct.includes("png") && r.buf[1] === 0x50) || (isZip(r.buf) && zipList(r.buf).length === 1), `single image expected (${ct})`);
});
await test("PDF -> Word: real .docx with the text", async () => {
  const r = await post("/pdf-to-word", {}, [pdfF(pdf3)]);
  ok(r);
  assert(isZip(r.buf), "docx is a zip");
  const f = path.join(tmp, "out.docx"); fs.writeFileSync(f, r.buf);
  const xml = execFileSync("unzip", ["-p", f, "word/document.xml"]).toString();
  assert(xml.includes("Beta") && xml.includes("page"), "text missing in document.xml");
});
await test("PDF -> Excel: real .xlsx with the table cells", async () => {
  const r = await post("/pdf-to-excel", {}, [pdfF(pdf3)]);
  ok(r);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buf);
  assert(wb.worksheets.length >= 1, "no sheets");
  let found = false;
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { if (String(c.value).includes("Widget")) found = true; })));
  assert(found, "Widget row missing");
});
await test("PDF -> PowerPoint (image mode): real .pptx with 3 slides", async () => {
  const r = await post("/pdf-to-powerpoint", { mode: "image" }, [pdfF(pdf3)]);
  ok(r);
  const f = path.join(tmp, "out.pptx"); fs.writeFileSync(f, r.buf);
  const list = execFileSync("unzip", ["-Z1", f]).toString();
  assert((list.match(/ppt\/slides\/slide\d+\.xml/g) || []).length === 3, "slide count");
});
await test("PDF -> PowerPoint (editable mode)", async () => {
  const r = await post("/pdf-to-powerpoint", { mode: "editable" }, [pdfF(pdf3)]);
  ok(r);
  const f = path.join(tmp, "out2.pptx"); fs.writeFileSync(f, r.buf);
  const xml = execFileSync("unzip", ["-p", f, "ppt/slides/slide1.xml"]).toString();
  assert(xml.includes("Beta"), "text missing in slide");
});

// Office fixtures
const docxBuf = await docx.Packer.toBuffer(new docx.Document({ sections: [{ children: [
  new docx.Paragraph({ text: "Quarterly Report", heading: docx.HeadingLevel.HEADING_1 }),
  new docx.Paragraph("This is a paragraph written for the Word to PDF test."),
] }] }));
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Sales");
ws.addRow(["Item", "Qty", "Price"]); ws.addRow(["Laptop", 3, 1200]); ws.addRow(["Mouse", 10, 15]);
const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());
const pptx = new PptxGenJS();
pptx.addSlide().addText("Hello Slide One", { x: 1, y: 1, fontSize: 32 });
pptx.addSlide().addText("Second Slide", { x: 1, y: 1, fontSize: 32 });
const pptxBuf = Buffer.from(await pptx.write({ outputType: "nodebuffer" }));

await test("Word -> PDF", async () => {
  const r = await post("/word-to-pdf", {}, [F("file", "report.docx", docxBuf)]);
  ok(r);
  assert(isPdf(r.buf) && pdfText(r.buf).includes("Quarterly Report"), "text missing");
});
await test("Excel -> PDF", async () => {
  const r = await post("/excel-to-pdf", {}, [F("file", "sales.xlsx", xlsxBuf)]);
  ok(r);
  assert(isPdf(r.buf) && pdfText(r.buf).includes("Laptop"), "text missing");
});
await test("PowerPoint -> PDF", async () => {
  const r = await post("/powerpoint-to-pdf", {}, [F("file", "deck.pptx", pptxBuf)]);
  ok(r);
  assert(isPdf(r.buf) && (await pages(r.buf)) === 2, "pdf pages");
});
await test("Word -> PDF rejects wrong file type", async () => {
  const r = await post("/word-to-pdf", {}, [F("file", "fake.docx", Buffer.from("hello world, definitely not a docx"))]);
  assert(r.status >= 400 && r.status < 500 && r.json?.error, `got ${r.status}`);
});
await test("HTML -> PDF (pasted HTML)", async () => {
  const r = await post("/html-to-pdf", { html: "<h1>Hello HTML</h1><p>Made by Pdf VERSE</p>" });
  ok(r);
  assert(isPdf(r.buf) && pdfText(r.buf).includes("Hello HTML"), "text missing");
});
await test("HTML -> PDF (uploaded .html file)", async () => {
  const r = await post("/html-to-pdf", {}, [F("file", "page.html", Buffer.from("<html><body><h2>From a file</h2></body></html>"), "text/html")]);
  ok(r);
  assert(pdfText(r.buf).includes("From a file"), "text missing");
});
await test("HTML -> PDF: empty input -> friendly 400", async () => failsWith(await post("/html-to-pdf", { html: "" }), 400));

/* ---------------- optimize ---------------- */
console.log("\nOptimize");
await test("compress (smart/medium) returns valid, not-larger PDF", async () => {
  const r = await post("/compress-pdf", { level: "medium", mode: "smart" }, [pdfF(pdf5)]);
  ok(r);
  assert(isPdf(r.buf) && (await pages(r.buf)) === 5, "valid pdf");
  assert(r.meta?.resultSize <= pdf5.length, `output grew: ${r.meta?.resultSize} > ${pdf5.length}`);
});
await test("compress (rasterize/high) returns valid 5-page PDF", async () => {
  const r = await post("/compress-pdf", { level: "high", mode: "rasterize" }, [pdfF(pdf5)]);
  ok(r);
  assert(isPdf(r.buf) && (await pages(r.buf)) === 5, "valid pdf");
});
await test("repair: truncated PDF", async () => {
  const broken = pdf5.subarray(0, Math.floor(pdf5.length * 0.8));
  const r = await post("/repair-pdf", {}, [pdfF(broken)]);
  assert((r.status === 200 && isPdf(r.buf) && (await pages(r.buf)) >= 1) || (r.status >= 400 && r.status < 500 && r.json?.error), `got ${r.status}`);
  console.log(`        (truncated PDF -> ${r.status === 200 ? "recovered " + (await pages(r.buf)) + " page(s)" : "friendly refusal: " + r.json.error})`);
});
await test("repair: healthy PDF stays intact", async () => {
  const r = await post("/repair-pdf", {}, [pdfF(pdf5)]);
  ok(r);
  assert((await pages(r.buf)) === 5, "page count");
});
await test("repair: garbage upload -> friendly error", async () => {
  const r = await post("/repair-pdf", {}, [pdfF(Buffer.from("garbage"))]);
  assert(r.status >= 400 && r.status < 500 && r.json?.error, `got ${r.status}`);
});
await test("flatten: form field becomes static content", async () => {
  const form = await makeFormPdf();
  const r = await post("/flatten-pdf", {}, [pdfF(form)]);
  ok(r);
  const d = await PDFDocument.load(r.buf);
  assert(d.getForm().getFields().length === 0, "form fields still present");
  assert(pdfText(r.buf).includes("Amber"), "field value lost");
});

/* ---------------- security ---------------- */
console.log("\nSecurity");
let protectedPdf;
await test("protect: result is encrypted and asks for a password", async () => {
  const r = await post("/protect-pdf", { password: "secret123" }, [pdfF(pdf3)]);
  ok(r);
  protectedPdf = r.buf;
  assert(r.buf.includes("/Encrypt"), "no /Encrypt in output");
  let loadedWithoutPassword = true;
  try { await PDFDocument.load(r.buf); } catch { loadedWithoutPassword = false; }
  assert(!loadedWithoutPassword, "pdf-lib opened it without password");
  const f = path.join(tmp, "prot.pdf"); fs.writeFileSync(f, r.buf);
  let opened = true;
  try { execFileSync("pdftotext", [f, "-"], { stdio: "pipe" }); } catch { opened = false; }
  assert(!opened, "poppler opened it without the password");
  const withPw = execFileSync("pdftotext", ["-upw", "secret123", f, "-"]).toString();
  assert(withPw.includes("Beta page 1"), "correct password did not open it");
});
await test("protect: empty password -> friendly 400", async () => failsWith(await post("/protect-pdf", { password: "" }, [pdfF(pdf3)]), 400));
await test("unlock: correct password -> opens without password", async () => {
  const r = await post("/unlock-pdf", { password: "secret123" }, [pdfF(protectedPdf)]);
  ok(r);
  assert(!r.buf.includes("/Encrypt"), "still encrypted");
  assert(pdfText(r.buf).includes("Beta page 1"), "content missing");
});
await test("unlock: wrong password -> friendly error (no bypass)", async () => {
  const r = await post("/unlock-pdf", { password: "wrong" }, [pdfF(protectedPdf)]);
  assert(r.status >= 400 && r.status < 500 && r.json?.error, `got ${r.status}`);
});
await test("unlock: PDF that is not encrypted -> friendly message or passthrough", async () => {
  const r = await post("/unlock-pdf", { password: "x" }, [pdfF(pdf3)]);
  assert(r.status === 200 || (r.status < 500 && r.json?.error), `got ${r.status}`);
});
let watermarked;
await test("watermark: text stamped on every page", async () => {
  const r = await post("/watermark-pdf", { text: "CONFIDENTIAL", opacity: "0.3", rotation: "0", fontSize: "60", position: "center" }, [pdfF(pdf3)]);
  ok(r);
  watermarked = r.buf;
  assert((await pages(r.buf)) === 3, "pages");
  const t = pdfText(r.buf);
  assert((t.match(/CONFIDENTIAL/g) || []).length >= 3, "watermark text not found on all pages");
});
await test("watermark: tiled", async () => {
  const r = await post("/watermark-pdf", { text: "DRAFT", position: "tile", rotation: "0", fontSize: "20" }, [pdfF(pdf3)]);
  ok(r);
  assert((pdfText(r.buf).match(/DRAFT/g) || []).length > 3, "tiles");
});
await test("watermark: empty text -> friendly 400", async () => failsWith(await post("/watermark-pdf", { text: "" }, [pdfF(pdf3)]), 400));
await test("remove watermark: removes text this app added", async () => {
  assert(pdfText(watermarked).includes("CONFIDENTIAL"), "precondition: watermark must be visible before removal");
  const r = await post("/remove-watermark", { text: "CONFIDENTIAL" }, [pdfF(watermarked)]);
  ok(r);
  const t = pdfText(r.buf);
  assert(!t.includes("CONFIDENTIAL"), "watermark text still there");
  assert(t.includes("Beta page 1"), "original content was damaged");
});

/* ---------------- edit ---------------- */
console.log("\nEdit");
await test("page numbers: 'Page {n} of {total}' starting at 5, pages 1-2", async () => {
  const r = await post("/page-numbers", { format: "Page {n} of {total}", start: "5", pages: "1-2", position: "bottom-center" }, [pdfF(pdf5)]);
  ok(r);
  const t = pdfText(r.buf);
  assert(t.includes("Page 5 of 5") || t.includes("Page 5 of"), `numbering missing`);
  assert(!/Page 7 of/.test(t), "numbered a page it should not have");
});
await test("add text: appears on the page", async () => {
  const r = await post("/add-text", { text: "Approved by Amber", fontSize: "20", position: "top-right", pages: "1" }, [pdfF(pdf3)]);
  ok(r);
  const t = pdfText(r.buf);
  assert(t.includes("Approved by Amber"), "text missing");
});
await test("add text: empty -> friendly 400", async () => failsWith(await post("/add-text", { text: "  " }, [pdfF(pdf3)]), 400));
await test("add image (PNG) onto page 1", async () => {
  const r = await post("/add-image", { width: "30", position: "bottom-right", pages: "1" }, [pdfF(pdf3), F("image", "logo.png", png, "image/png")]);
  ok(r);
  assert(r.buf.includes("/Image"), "no image object in output");
  assert(r.buf.length > pdf3.length, "output did not grow");
});
await test("add image: missing image -> friendly 400", async () => failsWith(await post("/add-image", {}, [pdfF(pdf3)]), 400));
await test("crop: 50pt off every edge changes page size", async () => {
  const r = await post("/crop-pdf", { top: "50", right: "50", bottom: "50", left: "50" }, [pdfF(pdf3)]);
  ok(r);
  const d = await PDFDocument.load(r.buf);
  const { width, height } = d.getPage(0).getCropBox();
  assert(Math.round(width) === 495 && Math.round(height) === 742, `cropbox ${width}x${height}`);
});
await test("crop: margins bigger than the page -> friendly 400", async () => failsWith(await post("/crop-pdf", { top: "500", bottom: "500" }, [pdfF(pdf3)]), 400));
await test("edit metadata: title/author/keywords saved", async () => {
  const r = await post("/edit-metadata", { title: "My Title", author: "Amber Porwal", subject: "Test", keywords: "a, b, c" }, [pdfF(pdf3)]);
  ok(r);
  const d = await PDFDocument.load(r.buf);
  assert(d.getTitle() === "My Title" && d.getAuthor() === "Amber Porwal", `title=${d.getTitle()} author=${d.getAuthor()}`);
});

/* ---------------- utilities ---------------- */
console.log("\nUtilities");
await test("PDF -> ZIP: bundles uploaded PDFs", async () => {
  const r = await post("/pdf-to-zip", {}, [pdfF(pdf5, "a.pdf", "files"), pdfF(pdf3, "b.pdf", "files")]);
  ok(r);
  assert(isZip(r.buf) && zipList(r.buf).length === 2, "entries");
});
await test("page counter: counts per file", async () => {
  const r = await post("/page-count", {}, [pdfF(pdf5, "a.pdf", "files"), pdfF(pdf3, "b.pdf", "files")]);
  ok(r);
  const s = JSON.stringify(r.json);
  assert(s.includes("5") && s.includes("3"), s);
});
await test("PDF info: pages, size, metadata", async () => {
  const r = await post("/pdf-info", {}, [pdfF(pdf5)]);
  ok(r);
  const s = JSON.stringify(r.json);
  assert(/pages/i.test(s) && s.includes("5"), s.slice(0, 300));
});
await test("compare: finds the differences between two PDFs", async () => {
  const r = await post("/compare-pdf", {}, [pdfF(pdf5, "a.pdf", "files"), pdfF(pdf3, "b.pdf", "files")]);
  ok(r);
  assert(r.json && JSON.stringify(r.json).length > 50, "empty comparison");
});
await test("compare: identical PDFs reported as identical", async () => {
  const r = await post("/compare-pdf", {}, [pdfF(pdf3, "a.pdf", "files"), pdfF(pdf3, "b.pdf", "files")]);
  ok(r);
  assert(/identical|same|0/i.test(JSON.stringify(r.json)), JSON.stringify(r.json).slice(0, 300));
});
const scan = await makeScanPdf();
await test("OCR: scanned (image-only) PDF -> text contains the words", async () => {
  const r = await post("/ocr-pdf", { language: "eng", output: "txt", dpi: "200" }, [pdfF(scan)]);
  ok(r);
  const text = r.buf.toString().toUpperCase();
  assert(text.includes("HELLO") && text.includes("OCR"), `OCR text was: ${text.slice(0, 200)}`);
});
await test("OCR: searchable PDF output has a real text layer", async () => {
  const r = await post("/ocr-pdf", { language: "eng", output: "pdf", dpi: "200" }, [pdfF(scan)]);
  ok(r);
  assert(isPdf(r.buf), "not a pdf");
  assert(pdfText(r.buf).toUpperCase().includes("HELLO"), "no selectable text in output PDF");
});

/* ---------------- upload validation ---------------- */
console.log("\nValidation");
await test("no file uploaded -> friendly 400", async () => failsWith(await post("/rotate-pdf", { angle: "90" }, []), 400));
await test("text file renamed .pdf -> friendly 4xx", async () => {
  const r = await post("/extract-pages", { pages: "1" }, [pdfF(Buffer.from("just text"), "fake.pdf")]);
  assert(r.status >= 400 && r.status < 500 && r.json?.error, `got ${r.status}`);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
