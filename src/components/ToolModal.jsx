import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, LoaderCircle, TriangleAlert, Info, Lock } from "lucide-react";
import FileDrop from "./FileDrop";
import FileList from "./FileList";
import OptionsForm from "./OptionsForm";
import PageGrid from "./PageGrid";
import ResultPanel from "./ResultPanel";
import { postForm } from "../lib/api";
import { openPreview } from "../lib/pdfPreview";
import { formatBytes, isPdfFile, plural } from "../lib/format";

const MAX_MB = 50;
let entryId = 0;

const defaultsOf = (tool) => Object.fromEntries((tool.options || []).map((o) => [o.key, o.default]));
const LANG_NAMES = { eng: "English", hin: "Hindi" };

/** Turn the page-thumbnail state into the form fields the server expects, or an error message. */
function gridFields(tool, items, total) {
  switch (tool.grid) {
    case "select": {
      const marked = items.filter((i) => i.marked).map((i) => i.page);
      if (!marked.length) return { error: `Click the pages you want to ${tool.gridVerb}.` };
      if (tool.gridVerb === "remove" && marked.length === total) return { error: "You cannot remove every page. Keep at least one." };
      return { fields: { pages: marked.join(",") } };
    }
    case "rotate": {
      const map = {};
      items.forEach((i) => i.rotate && (map[i.page] = i.rotate));
      if (!Object.keys(map).length) return { error: "Rotate at least one page first." };
      return { fields: { rotations: JSON.stringify(map) } };
    }
    case "reorder": {
      const order = items.map((i) => i.page);
      if (order.every((p, idx) => p === idx + 1)) return { error: "Drag at least one page to a new position first." };
      return { fields: { order: order.join(",") } };
    }
    case "organize": {
      if (!items.length) return { error: "The new document needs at least one page." };
      return { fields: { spec: JSON.stringify(items.map((i) => ({ page: i.page, rotate: i.rotate }))) } };
    }
    default:
      return { fields: {} };
  }
}

export default function ToolModal({ tool, caps, onClose, onDone }) {
  const Icon = tool.icon;
  const [entries, setEntries] = useState([]);
  const [extra, setExtra] = useState(null);
  const [values, setValues] = useState(() => defaultsOf(tool));
  const [grid, setGrid] = useState({ items: [], total: 0, status: "loading" });
  const [phase, setPhase] = useState("setup"); // setup | working | done
  const [progress, setProgress] = useState({ stage: "upload", pct: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const inputBytesRef = useRef(0);
  const busy = phase === "working";

  const spec = tool.files;
  const hasFiles = entries.length > 0;
  const ctx = { hasFiles };

  /* ---------- capability notices (honest about what this computer can do) ---------- */
  const notice = useMemo(() => {
    if (!caps) return null;
    if (tool.needs === "office-only" && !caps.libreoffice)
      return { blocking: true, text: "PowerPoint to PDF needs LibreOffice, which was not found on the computer running Pdf VERSE. Install LibreOffice (free, libreoffice.org) and restart the server." };
    if (tool.needs === "browser" && !caps.browser)
      return { blocking: true, text: "HTML to PDF needs Microsoft Edge or Google Chrome on the computer running Pdf VERSE, and none was found. Install one (or set CHROME_PATH in .env) and restart the server." };
    if (tool.needs === "office" && !caps.libreoffice)
      return { blocking: false, text: `LibreOffice was not found, so a simplified built-in converter will be used (${tool.id === "word-to-pdf" ? ".docx only" : ".xlsx and .csv only"}). Layout and fonts may differ. Install LibreOffice for full-quality conversion.` };
    return null;
  }, [caps, tool]);

  const dynamicChoices = useMemo(
    () => ({ ocrLanguages: caps?.ocrLanguages?.length ? caps.ocrLanguages.map((c) => [c, LANG_NAMES[c] || c]) : null }),
    [caps],
  );

  /* ---------- modal behaviour ---------- */
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);

  /* ---------- adding files ---------- */
  const addFiles = async (files) => {
    setError("");
    const accepted = [];
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`"${file.name}" is ${formatBytes(file.size)}. The limit is ${MAX_MB} MB per file.`);
        continue;
      }
      if (file.size === 0) {
        setError(`"${file.name}" is empty.`);
        continue;
      }
      accepted.push({ id: ++entryId, file, pages: null, note: "" });
    }
    if (!accepted.length) return;

    const room = spec.max ? spec.max - (spec.multiple ? entries.length : 0) : Infinity;
    const next = spec.multiple ? accepted.slice(0, Math.max(room, 0)) : accepted.slice(0, 1);
    if (spec.multiple && accepted.length > next.length) setError(`You can add up to ${spec.max} files here.`);
    setEntries((prev) => (spec.multiple ? [...prev, ...next] : next));

    // Page count and a readability check for PDFs happen in the browser, nothing is uploaded yet.
    for (const entry of next) {
      if (!isPdfFile(entry.file) || tool.preview === false) continue;
      openPreview(entry.file)
        .then((h) => {
          const pages = h.numPages;
          h.destroy();
          setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, pages } : e)));
        })
        .catch((err) => {
          const note = err.code === "password" ? "Password protected" : "Could not be read. It may be damaged";
          setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, note } : e)));
        });
    }

    // Edit metadata starts from the values already in the file.
    if (tool.prefillInfo && next[0]) {
      const fd = new FormData();
      fd.append("file", next[0].file);
      postForm("/pdf-info", fd)
        .then(({ json }) => {
          if (!json) return;
          setValues((v) => ({
            ...v,
            title: json.title || "", author: json.author || "", subject: json.subject || "",
            keywords: json.keywords || "", creator: json.creator || "", producer: json.producer || "",
          }));
        })
        .catch(() => {});
    }
  };

  const moveEntry = (from, to) =>
    setEntries((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  const setValue = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  /* ---------- run ---------- */
  const validate = () => {
    const count = entries.length;
    if (!spec.optional) {
      if (count === 0) return `Add ${spec.multiple ? "your files" : "a file"} first.`;
      if (spec.min && count < spec.min) return `Add at least ${spec.min} files. You have ${count}.`;
    }
    if (tool.extra && !extra) return `Add the ${tool.extra.label.toLowerCase()} too.`;
    for (const opt of tool.options || []) {
      if (opt.showIf && !opt.showIf(values, ctx)) continue;
      if (opt.required && !String(values[opt.key] ?? "").trim()) return `${opt.label} is required.`;
    }
    if (tool.grid) {
      if (grid.status !== "ready") return "Wait for the page thumbnails to load.";
      const g = gridFields(tool, grid.items, grid.total);
      if (g.error) return g.error;
    }
    return tool.validate?.(values, ctx) || null;
  };

  const run = async () => {
    const problem = validate();
    if (problem) return setError(problem);

    const fd = new FormData();
    entries.forEach((e) => fd.append(spec.field, e.file));
    if (extra) fd.append(tool.extra.field, extra.file);
    for (const opt of tool.options || []) {
      if (opt.local || (opt.showIf && !opt.showIf(values, ctx))) continue;
      const v = values[opt.key];
      fd.append(opt.key, typeof v === "boolean" ? String(v) : String(v ?? ""));
    }
    if (tool.grid) Object.entries(gridFields(tool, grid.items, grid.total).fields).forEach(([k, v]) => fd.append(k, v));

    inputBytesRef.current = entries.reduce((sum, e) => sum + e.file.size, 0);
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setProgress({ stage: "upload", pct: 0 });
    setPhase("working");

    try {
      const res = await postForm(tool.route, fd, {
        signal: controller.signal,
        onProgress: (pct) => setProgress({ stage: "upload", pct }),
        onUploaded: () => setProgress({ stage: "process", pct: 1 }),
      });
      setResult(res);
      setPhase("done");
      onDone?.(tool, res);
    } catch (err) {
      setPhase("setup");
      if (err.name !== "AbortError") setError(err.message || "Something went wrong. Please try again.");
    } finally {
      abortRef.current = null;
    }
  };

  const reset = () => {
    setEntries([]);
    setExtra(null);
    setValues(defaultsOf(tool));
    setResult(null);
    setError("");
    setPhase("setup");
    setGrid({ items: [], total: 0, status: "loading" });
  };

  const blocked = notice?.blocking;
  const pageFile = tool.grid && entries[0]?.file;
  const showDrop = !tool.grid ? (spec.multiple ? !spec.max || entries.length < spec.max : !hasFiles) : !hasFiles;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${tool.grid ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="tool-title">
        <header className="modal-head">
          <div className={`tool-icon ${tool.color}`}><Icon size={21} /></div>
          <div className="modal-title">
            <div className="eyebrow-small">PDF VERSE TOOL</div>
            <h2 id="tool-title">{tool.name}</h2>
          </div>
          <button className="icon-button" onClick={close} disabled={busy} aria-label="Close"><X size={20} /></button>
        </header>

        <div className="modal-body">
          {phase === "done" && result ? (
            <ResultPanel tool={tool} result={result} inputBytes={inputBytesRef.current} onReset={reset} />
          ) : (
            <>
              <p className="modal-intro">{tool.intro}</p>
              {tool.notes && <div className="banner info"><Info size={16} /> <span>{tool.notes}</span></div>}
              {notice && <div className={`banner ${notice.blocking ? "warn" : "info"}`}><TriangleAlert size={16} /> <span>{notice.text}</span></div>}
              {tool.id === "unlock-pdf" && <div className="banner info"><Lock size={16} /> <span>You need the password. This tool cannot open files you do not have access to.</span></div>}

              {showDrop && (
                <FileDrop
                  accept={spec.accept}
                  multiple={spec.multiple}
                  label={spec.label}
                  hint={spec.hint}
                  disabled={busy || blocked}
                  onFiles={addFiles}
                  onReject={setError}
                />
              )}

              {hasFiles && (
                <FileList
                  entries={entries}
                  reorder={!!spec.reorder}
                  order={tool.id !== "pdf-to-zip"}
                  image={!!spec.image}
                  disabled={busy}
                  onMove={moveEntry}
                  onRemove={(i) => setEntries((prev) => prev.filter((_, idx) => idx !== i))}
                  onClear={() => setEntries([])}
                />
              )}

              {tool.extra && (
                <div className="extra-upload">
                  {extra ? (
                    <FileList entries={[extra]} image disabled={busy} onMove={() => {}} onClear={() => {}} onRemove={() => setExtra(null)} />
                  ) : (
                    <FileDrop
                      compact accept={tool.extra.accept} multiple={false} label={tool.extra.label}
                      disabled={busy} onReject={setError}
                      onFiles={(files) => files[0] && setExtra({ id: ++entryId, file: files[0] })}
                    />
                  )}
                </div>
              )}

              {pageFile && (
                <PageGrid
                  key={entries[0].id}
                  file={pageFile}
                  mode={tool.grid}
                  verb={tool.gridVerb}
                  disabled={busy}
                  onChange={(items, total, status) => setGrid({ items, total, status })}
                />
              )}

              {tool.options && (hasFiles || spec.optional) && (
                <OptionsForm options={tool.options} values={values} onChange={setValue} ctx={ctx} disabled={busy} dynamicChoices={dynamicChoices} />
              )}

              {error && <div className="banner error" role="alert"><TriangleAlert size={16} /> <span>{error}</span></div>}

              {busy ? (
                <div className="progress" aria-live="polite">
                  <div className={`progress-bar ${progress.stage === "process" ? "indeterminate" : ""}`}>
                    <span style={{ width: progress.stage === "upload" ? `${Math.round(progress.pct * 100)}%` : "40%" }} />
                  </div>
                  <div className="progress-text">
                    <LoaderCircle className="spin" size={16} />
                    {progress.stage === "upload" ? `Uploading… ${Math.round(progress.pct * 100)}%` : `Processing ${plural(entries.length || 1, "file")}…`}
                    <button className="link-button" onClick={() => abortRef.current?.abort()}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn-primary btn-block" onClick={run} disabled={blocked || (!hasFiles && !spec.optional)}>
                  {tool.action}
                </button>
              )}
              <p className="fine-print">Up to {MAX_MB} MB per file. Files are processed in memory and are not kept.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
