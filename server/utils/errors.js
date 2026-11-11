import { MAX_FILE_MB } from "../config.js";

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    res.destroy(err);
    return;
  }

  let status = 500;
  let message = "Something went wrong while processing your file. Please try again.";

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err?.name === "MulterError") {
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? `A file is too large. The limit is ${MAX_FILE_MB} MB per file.`
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Too many files, or a file was sent in the wrong field."
          : `Upload problem: ${err.message}`;
  } else if (err?.type === "entity.too.large") {
    status = 413;
    message = "Request is too large.";
  } else if (err?.type === "entity.parse.failed") {
    status = 400;
    message = "Request body is not valid JSON.";
  } else {
    // Unexpected: log the details on the server, never leak them to the client.
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(status).json({ error: message });
}
