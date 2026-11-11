// pdf-lib and archiver are CommonJS packages. The original server already loaded them with
// createRequire (which works in every Node version), so we keep that approach in one place.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const lib = require("pdf-lib");
export const {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFRawStream,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFNumber,
  decodePDFRawStream,
} = lib;

// @cantoo/pdf-lib is a drop-in fork of pdf-lib that adds password encryption/decryption.
// It is used only by the Protect / Unlock tools.
const secure = require("@cantoo/pdf-lib");
export const SecurePDFDocument = secure.PDFDocument;
export const SecurePDFName = secure.PDFName;

export const archiver = require("archiver");
