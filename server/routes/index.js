import { Router } from "express";
import { upload } from "../middleware/upload.js";
import * as organize from "../controllers/organize.js";
import * as convert from "../controllers/convert.js";
import * as optimize from "../controllers/optimize.js";
import * as security from "../controllers/security.js";
import * as edit from "../controllers/edit.js";
import * as utilities from "../controllers/utilities.js";

const router = Router();

// Upload shapes. Field names are part of the API contract with the frontend.
const one = upload.single("file");
const many = upload.array("files", 60);

/* ---- Organize (merge/split keep their original field names: "pdfs" and "pdf") ---- */
router.post("/merge-pdf", upload.array("pdfs", 20), organize.mergePdf);
router.post("/split-pdf", upload.single("pdf"), organize.splitPdf);
router.post("/remove-pages", one, organize.removePages);
router.post("/extract-pages", one, organize.extractPages);
router.post("/rotate-pdf", one, organize.rotatePdf);
router.post("/reorder-pdf", one, organize.reorderPdf);
router.post("/organize-pdf", one, organize.organizePdf);

/* ---- Convert ---- */
router.post("/jpg-to-pdf", many, convert.jpgToPdf);
router.post("/png-to-pdf", many, convert.pngToPdf);
router.post("/pdf-to-jpg", one, convert.pdfToJpg);
router.post("/pdf-to-png", one, convert.pdfToPng);
router.post("/pdf-to-word", one, convert.pdfToWord);
router.post("/word-to-pdf", one, convert.wordToPdf);
router.post("/pdf-to-excel", one, convert.pdfToExcel);
router.post("/excel-to-pdf", one, convert.excelToPdf);
router.post("/pdf-to-powerpoint", one, convert.pdfToPowerpoint);
router.post("/powerpoint-to-pdf", one, convert.powerpointToPdf);
router.post("/html-to-pdf", one, convert.htmlToPdf);

/* ---- Optimize ---- */
router.post("/compress-pdf", one, optimize.compressPdf);
router.post("/repair-pdf", one, optimize.repairPdf);
router.post("/flatten-pdf", one, optimize.flattenPdf);

/* ---- Security ---- */
router.post("/protect-pdf", one, security.protectPdf);
router.post("/unlock-pdf", one, security.unlockPdf);
router.post("/watermark-pdf", one, security.watermarkPdf);
router.post("/remove-watermark", one, security.removeWatermark);

/* ---- Edit ---- */
router.post("/page-numbers", one, edit.addPageNumbers);
router.post("/add-text", one, edit.addText);
router.post("/add-image", upload.fields([{ name: "file", maxCount: 1 }, { name: "image", maxCount: 1 }]), edit.addImage);
router.post("/crop-pdf", one, edit.cropPdf);
router.post("/edit-metadata", one, edit.editMetadata);

/* ---- Utilities ---- */
router.post("/pdf-to-zip", many, utilities.pdfToZip);
router.post("/page-count", many, utilities.pageCount);
router.post("/pdf-info", one, utilities.pdfInfo);
router.post("/compare-pdf", many, utilities.comparePdfs);
router.post("/ocr-pdf", one, utilities.ocrPdf);
router.get("/capabilities", utilities.capabilitiesHandler);

export default router;
