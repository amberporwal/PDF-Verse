// pdf.js loads @napi-rs/canvas through require(). If we import it as ESM we would get a second,
// incompatible copy of its classes (Path2D, Image...) and rendering would crash. So the whole
// server loads the canvas package through require() from this one file.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const { createCanvas, loadImage } = require("@napi-rs/canvas");
