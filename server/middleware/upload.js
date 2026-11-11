import multer from "multer";
import { LIMITS } from "../config.js";

// Files are kept in memory (no temp files left behind) and capped per file.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.fileSize, files: LIMITS.files, fieldSize: 5 * 1024 * 1024 },
});
