import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HttpError } from "./errors.js";

/* ---------- finding external programs (cached) ---------- */

function onPath(names) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat"] : [""];
  for (const dir of dirs) {
    for (const name of names) {
      for (const ext of exts) {
        const full = path.join(dir, name + ext);
        try {
          if (fs.statSync(full).isFile()) return full;
        } catch {
          /* keep looking */
        }
      }
    }
  }
  return null;
}

const firstExisting = (list) => list.filter(Boolean).find((p) => fs.existsSync(p)) || null;

let sofficeCache;
/** LibreOffice (soffice) executable, or null. Set SOFFICE_PATH to override, or DISABLE_LIBREOFFICE=true. */
export function findLibreOffice() {
  if (sofficeCache !== undefined) return sofficeCache;
  if (process.env.DISABLE_LIBREOFFICE === "true") return (sofficeCache = null);
  const env = process.env.SOFFICE_PATH;
  sofficeCache =
    (env && fs.existsSync(env) ? env : null) ||
    onPath(["soffice", "libreoffice"]) ||
    firstExisting([
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      "/usr/bin/soffice",
    ]);
  return sofficeCache;
}

let browserCache;
/** Chrome / Edge / Chromium executable for HTML -> PDF, or null. Set CHROME_PATH to override. */
export function findBrowser() {
  if (browserCache !== undefined) return browserCache;
  const local = process.env.LOCALAPPDATA;
  browserCache =
    (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null) ||
    firstExisting([
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      local && path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]) ||
    onPath(["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]);
  return browserCache;
}

/* ---------- LibreOffice conversion ---------- */

// LibreOffice does not like parallel runs sharing a profile, so conversions are queued.
let queue = Promise.resolve();
const enqueue = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new HttpError(504, "The conversion took too long and was stopped. Try a smaller file."));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`soffice exited with ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

/** Convert an Office document buffer to PDF with LibreOffice. */
export function convertWithLibreOffice(buffer, ext) {
  const soffice = findLibreOffice();
  if (!soffice) throw new HttpError(501, "LibreOffice is not installed on this server.");

  return enqueue(async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "pdfverse-"));
    try {
      const input = path.join(dir, `input${ext}`);
      await fsp.writeFile(input, buffer);
      await runProcess(
        soffice,
        [
          "--headless",
          "--norestore",
          "--nolockcheck",
          "--nologo",
          `-env:UserInstallation=${pathToFileURL(path.join(dir, "profile")).href}`,
          "--convert-to",
          "pdf",
          "--outdir",
          dir,
          input,
        ],
        120_000,
      );
      const output = path.join(dir, "input.pdf");
      if (!fs.existsSync(output)) {
        throw new HttpError(422, "LibreOffice could not convert this file. It may be damaged or password protected.");
      }
      return await fsp.readFile(output);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

/* ---------- headless browser: HTML -> PDF ---------- */

export async function htmlToPdfBuffer(html, { format = "A4", landscape = false, marginMm = 15, printBackground = true } = {}) {
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new HttpError(
      501,
      "No Chrome, Edge or Chromium browser was found on this server, so HTML conversion is unavailable.",
    );
  }
  const puppeteer = (await import("puppeteer-core")).default;
  const args = ["--disable-gpu", "--disable-dev-shm-usage", "--font-render-hinting=none"]; // dev-shm: containers have a tiny /dev/shm
  if (process.getuid?.() === 0) args.push("--no-sandbox"); // only needed when running as root (containers)

  const browser = await puppeteer.launch({ executablePath, headless: true, args });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    const allowRemote = process.env.ALLOW_REMOTE_RESOURCES === "true";
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank" || (allowRemote && /^https?:/.test(url))) req.continue();
      else req.abort(); // blocks file:// and network access from user-supplied HTML
    });
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const margin = `${marginMm}mm`;
    const pdf = await page.pdf({
      format,
      landscape,
      printBackground,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      timeout: 60_000,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const capabilities = () => ({
  libreoffice: !!findLibreOffice(),
  browser: !!findBrowser(),
});
