import { degrees, rgb } from "./pdflib.js";
import { HttpError } from "./errors.js";

/**
 * Pages can be rotated (/Rotate) or have a CropBox. These helpers let controllers think in
 * "visual" coordinates (origin bottom-left of the page as the reader sees it) and convert to
 * the PDF's real user space when drawing.
 */
export function pageGeometry(page) {
  const box = page.getCropBox();
  const R = ((page.getRotation().angle % 360) + 360) % 360;
  const swap = R === 90 || R === 270;
  return {
    x0: box.x,
    y0: box.y,
    W: box.width,
    H: box.height,
    R,
    vw: swap ? box.height : box.width,
    vh: swap ? box.width : box.height,
  };
}

export function toUser(g, vx, vy) {
  switch (g.R) {
    case 90:
      return { x: g.x0 + g.W - vy, y: g.y0 + vx };
    case 180:
      return { x: g.x0 + g.W - vx, y: g.y0 + g.H - vy };
    case 270:
      return { x: g.x0 + vy, y: g.y0 + g.H - vx };
    default:
      return { x: g.x0 + vx, y: g.y0 + vy };
  }
}

/** Draw text with its baseline-left corner at visual (vx, vy), rotated `angle` degrees CCW. */
export function drawTextVisual(page, text, { vx, vy, angle = 0, size, font, color, opacity = 1 }) {
  const g = pageGeometry(page);
  const { x, y } = toUser(g, vx, vy);
  page.drawText(text, { x, y, size, font, color, opacity, rotate: degrees(angle + g.R) });
}

/** Draw an image with its bottom-left corner at visual (vx, vy). */
export function drawImageVisual(page, image, { vx, vy, width, height, opacity = 1 }) {
  const g = pageGeometry(page);
  const { x, y } = toUser(g, vx, vy);
  page.drawImage(image, { x, y, width, height, opacity, rotate: degrees(g.R) });
}

/** Top-left corner of a box placed by name, in visual coordinates. */
export function placeBox(pw, ph, bw, bh, position = "center", margin = 36) {
  const [v, h] = position === "center" ? ["middle", "center"] : position.split("-");
  const x = h === "left" ? margin : h === "right" ? pw - bw - margin : (pw - bw) / 2;
  const y = v === "top" ? ph - bh - margin : v === "bottom" ? margin : (ph - bh) / 2;
  return { x, y };
}

export const POSITIONS = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
];

export const safePosition = (value, fallback = "center") => (POSITIONS.includes(value) ? value : fallback);

export function parseColor(hex, fallback = "#000000") {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()) || /^#?([0-9a-f]{6})$/i.exec(fallback);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** pdf-lib's standard fonts only encode Latin characters. Turn that into a clear message. */
export async function guardEncoding(task) {
  try {
    return await task();
  } catch (error) {
    if (/cannot encode/i.test(error?.message || "")) {
      throw new HttpError(
        400,
        "Your text contains characters (for example Hindi or emoji) that the built-in PDF fonts cannot draw. Please use Latin letters, numbers and common symbols.",
      );
    }
    throw error;
  }
}
