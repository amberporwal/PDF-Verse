export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const isPdfFile = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** Does a file match an `accept` string like ".pdf" or ".jpg,.jpeg"? */
export function matchesAccept(file, accept) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  return accept.split(",").some((a) => {
    const t = a.trim().toLowerCase();
    return t.startsWith(".") ? name.endsWith(t) : file.type === t;
  });
}

export const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;
