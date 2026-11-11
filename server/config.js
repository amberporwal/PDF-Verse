import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// .env is optional. process.loadEnvFile exists on Node 20.12+/21.7+; older versions just skip it.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* no .env file or old Node: use defaults */
}

export const PORT = Number(process.env.PORT) || 5000;
export const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 50;
export const LIMITS = {
  fileSize: MAX_FILE_MB * 1024 * 1024,
  files: 60,
};

export const MAX_RENDER_PAGES = 100; // PDF -> image / PPT image mode
export const OCR_MAX_PAGES = 30; // per OCR run
export const MAX_RENDER_PIXELS = 36_000_000; // safety cap per rendered page

export const DIST_DIR = path.join(ROOT, "dist");
export const TESSDATA_DIR = path.join(ROOT, "server", "tessdata");
