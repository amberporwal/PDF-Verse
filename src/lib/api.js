// Netlify pe frontend + alag server pe backend: VITE_API_URL me backend ka URL daalo (bina trailing slash).
// Local dev me khali chhodo, Vite proxy kaam karega.
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

/**
 * Send a FormData to the Pdf VERSE API with upload progress.
 * Resolves with { blob, filename, meta, json, contentType }.
 * Rejects with an Error whose message is safe to show to the user.
 */
export function postForm(route, formData, { onProgress, onUploaded, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api${route}`);
    xhr.responseType = "blob";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => onUploaded?.();

    xhr.onerror = () =>
      reject(new Error("Cannot reach the Pdf VERSE server. Make sure it is running (npm run dev) and try again."));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));

    xhr.onload = async () => {
      const contentType = xhr.getResponseHeader("Content-Type") || "";
      const blob = xhr.response;

      if (xhr.status < 200 || xhr.status >= 300) {
        let message = `Request failed (${xhr.status}).`;
        try {
          const data = JSON.parse(await blob.text());
          if (data?.error) message = data.error;
        } catch {
          if (xhr.status === 502 || xhr.status === 504) {
            message = "The Pdf VERSE server is not responding. Make sure it is running (npm run dev).";
          }
        }
        reject(new Error(message));
        return;
      }

      let meta = {};
      try {
        const raw = xhr.getResponseHeader("X-Result-Meta");
        if (raw) meta = JSON.parse(decodeURIComponent(raw));
      } catch {
        /* meta is optional */
      }

      if (contentType.includes("application/json")) {
        try {
          resolve({ json: JSON.parse(await blob.text()), meta, contentType });
        } catch {
          reject(new Error("The server sent an unreadable answer."));
        }
        return;
      }
      resolve({ blob, filename: filenameFromDisposition(xhr.getResponseHeader("Content-Disposition")), meta, contentType });
    };

    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(formData);
  });
}

function filenameFromDisposition(header) {
  if (!header) return "pdfverse-result";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : "pdfverse-result";
}

export async function getCapabilities() {
  try {
    const res = await fetch(`${API_BASE}/api/capabilities`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
