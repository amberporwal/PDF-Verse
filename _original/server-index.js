import { createRequire } from "module";

const require = createRequire(import.meta.url);

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { PDFDocument } = require("pdf-lib");
const archiver = require("archiver");
const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.get("/api/health", (req, res) => {
  res.json({ status: "Pdf VERSE backend running 🚀" });
});

// MERGE PDF
app.post("/api/merge-pdf", upload.array("pdfs", 20), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: "Please upload at least 2 PDF files." });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      const pdf = await PDFDocument.load(file.buffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="merged.pdf"');
    res.send(Buffer.from(mergedBytes));
  } catch (error) {
    console.error("Merge error:", error);
    res.status(500).json({ error: error.message });
  }
});

// SPLIT PDF
app.post("/api/split-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a PDF file." });
    }

    const pdf = await PDFDocument.load(req.file.buffer);
    const totalPages = pdf.getPageCount();

    let groups = [];

    if (req.body.ranges?.trim()) {
      for (const part of req.body.ranges.split(",")) {
        const value = part.trim();
        const match = value.match(/^(\d+)(?:\s*-\s*(\d+))?$/);

        if (!match) {
          return res.status(400).json({ error: `Invalid page range: ${value}` });
        }

        const start = Number(match[1]);
        const end = Number(match[2] || match[1]);

        if (start < 1 || end < start || end > totalPages) {
          return res.status(400).json({ error: `Invalid range ${value}. PDF has ${totalPages} pages.` });
        }

        groups.push(Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i));
      }
    } else {
      groups = Array.from({ length: totalPages }, (_, i) => [i]);
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="split-pdf.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("ZIP Error:", err);
      res.destroy(err);
    });

    archive.pipe(res);

    for (let i = 0; i < groups.length; i++) {
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdf, groups[i]);

      copiedPages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();

      archive.append(Buffer.from(pdfBytes), {
        name: `split-${i + 1}.pdf`,
      });
    }

    await archive.finalize();
  } catch (error) {
    console.error("Split PDF Error:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || "Unknown split error",
      });
    }
  }
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Pdf VERSE backend running on http://localhost:${PORT}`);
});