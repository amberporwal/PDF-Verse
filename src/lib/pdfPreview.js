// Browser-side PDF previews (page count + thumbnails) with pdf.js. Nothing is uploaded for this.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Open a File as a preview handle: { numPages, thumb(pageNumber, width) -> dataURL, destroy() }.
 * Throws an Error with `.code` = "password" | "invalid".
 */
export async function openPreview(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  } catch (error) {
    const err = new Error(error?.name === "PasswordException" ? "Password protected" : "Could not read this PDF");
    err.code = error?.name === "PasswordException" ? "password" : "invalid";
    throw err;
  }

  return {
    numPages: doc.numPages,
    async thumb(pageNumber, width = 180) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      page.cleanup();
      return { url: canvas.toDataURL("image/jpeg", 0.8), ratio: base.height / base.width };
    },
    destroy: () => doc.destroy(),
  };
}
