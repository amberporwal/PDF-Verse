import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { PORT, CLIENT_ORIGIN, DIST_DIR } from "./config.js";
import router from "./routes/index.js";
import { errorHandler, notFound } from "./utils/errors.js";

const app = express();

app.disable("x-powered-by");
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    exposedHeaders: ["Content-Disposition", "X-Result-Meta"],
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "Pdf VERSE backend running 🚀" });
});

// All tools live under /api (merge-pdf and split-pdf keep their original URLs and field names).
app.use("/api", router);
app.use("/api", notFound);

// Production: serve the built frontend (npm run build) from the same server.
if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
}

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Pdf VERSE backend running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other program or set PORT in .env.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
