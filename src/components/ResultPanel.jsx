import { useEffect, useState } from "react";
import { CircleCheck, Download, RefreshCw, TriangleAlert, Plus, Minus } from "lucide-react";
import { formatBytes, plural } from "../lib/format";
import { downloadBlob } from "../lib/api";
import { openPreview } from "../lib/pdfPreview";

function FileResult({ result, inputBytes, onReset }) {
  const { blob, filename, meta } = result;
  const [preview, setPreview] = useState(null);

  // Show the first page of a resulting PDF so the user can check it before downloading.
  useEffect(() => {
    let cancelled = false;
    let handle;
    if (/\.pdf$/i.test(filename)) {
      openPreview(new File([blob], filename, { type: "application/pdf" }))
        .then(async (h) => {
          handle = h;
          const t = await h.thumb(1, 360);
          if (!cancelled) setPreview(t.url);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [blob, filename]);

  const outBytes = meta.resultSize ?? blob.size;
  const change = inputBytes ? Math.round((1 - outBytes / inputBytes) * 100) : null;

  return (
    <div className="result">
      <div className="result-badge"><CircleCheck size={26} /></div>
      <h3>Your file is ready</h3>

      <div className="result-card">
        {preview && <img className="result-preview" src={preview} alt="First page preview" />}
        <div className="result-info">
          <div className="result-name" title={filename}>{filename}</div>
          <div className="result-sub">
            {formatBytes(outBytes)}
            {meta.pages ? <> · {plural(meta.pages, "page")}</> : null}
            {meta.files ? <> · {plural(meta.files, "file")}</> : null}
          </div>
          {inputBytes && change !== null && (
            <div className={`size-compare ${change > 0 ? "good" : ""}`}>
              {formatBytes(inputBytes)} → {formatBytes(outBytes)}
              {change > 0 ? <strong> · {change}% smaller</strong> : change < 0 ? <span> · {Math.abs(change)}% larger than the original</span> : <span> · same size</span>}
            </div>
          )}
        </div>
      </div>

      {meta.note && <p className="result-note">{meta.note}</p>}

      <div className="result-actions">
        <button className="btn-primary" onClick={() => downloadBlob(blob, filename)}><Download size={18} /> Download</button>
        <button className="btn-secondary" onClick={onReset}><RefreshCw size={16} /> Start over</button>
      </div>
    </div>
  );
}

function CountResult({ data }) {
  return (
    <>
      <div className="stat-row">
        <div className="stat"><strong>{data.totalPages}</strong><span>total pages</span></div>
        <div className="stat"><strong>{data.files.length}</strong><span>{data.files.length === 1 ? "file" : "files"}</span></div>
      </div>
      <table className="data-table">
        <thead><tr><th>File</th><th>Pages</th><th>Size</th></tr></thead>
        <tbody>
          {data.files.map((f, i) => (
            <tr key={i}>
              <td title={f.name}>{f.name}</td>
              <td>{f.error ? <span className="bad">{f.error}</span> : f.pages}</td>
              <td>{formatBytes(f.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function InfoResult({ data }) {
  const rows = [
    ["File name", data.name], ["File size", formatBytes(data.size)], ["Pages", data.pages],
    ["PDF version", data.version], ["Encrypted", data.encrypted ? "Yes" : "No"],
    ["Contains text", data.hasText === undefined ? "" : data.hasText ? "Yes" : "No (may be a scan)"],
    ["Form fields", data.formFields], ["Title", data.title], ["Author", data.author], ["Subject", data.subject],
    ["Keywords", data.keywords], ["Creator", data.creator], ["Producer", data.producer],
    ["Created", data.created && new Date(data.created).toLocaleString()],
    ["Modified", data.modified && new Date(data.modified).toLocaleString()],
  ].filter(([, v]) => v !== undefined && v !== "" && v !== null);

  return (
    <>
      {data.error && <div className="banner warn"><TriangleAlert size={16} /> {data.error}</div>}
      <dl className="info-grid">
        {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>))}
      </dl>
      {data.pageSizes?.length > 0 && (
        <>
          <h4>Page sizes</h4>
          <ul className="size-list">
            {data.pageSizes.map((s, i) => (
              <li key={i}>{s.name || "Custom"} · {Math.round(s.width)} × {Math.round(s.height)} pt · {plural(s.pages, "page")}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function CompareResult({ data }) {
  const { summary } = data;
  return (
    <>
      <div className="stat-row">
        <div className="stat"><strong>{summary.identicalPages}</strong><span>identical pages</span></div>
        <div className={`stat ${summary.differentPages ? "alert" : ""}`}><strong>{summary.differentPages}</strong><span>pages with changes</span></div>
      </div>
      {summary.sameText && <div className="banner ok"><CircleCheck size={16} /> The text of both files is identical.</div>}
      {data.original.pages !== data.revised.pages && (
        <div className="banner warn"><TriangleAlert size={16} /> Page count differs: {data.original.pages} in “{data.original.name}” vs {data.revised.pages} in “{data.revised.name}”.</div>
      )}
      <div className="diff-list">
        {data.pages.filter((p) => p.status !== "identical").map((p) => (
          <details key={p.page} className="diff-page" open={data.pages.filter((x) => x.status !== "identical").length <= 3}>
            <summary>Page {p.page} · {p.status}</summary>
            {p.removed.map((line, i) => <div className="diff removed" key={`r${i}`}><Minus size={12} /> {line}</div>)}
            {p.added.map((line, i) => <div className="diff added" key={`a${i}`}><Plus size={12} /> {line}</div>)}
          </details>
        ))}
      </div>
      {data.notes?.map((n, i) => <p className="help" key={i}>{n}</p>)}
    </>
  );
}

export default function ResultPanel({ tool, result, inputBytes, onReset }) {
  if (result.blob) return <FileResult result={result} inputBytes={tool.id === "compress-pdf" ? inputBytes : null} onReset={onReset} />;
  const data = result.json;
  return (
    <div className="result json-result">
      {tool.result === "count" && <CountResult data={data} />}
      {tool.result === "info" && <InfoResult data={data} />}
      {tool.result === "compare" && <CompareResult data={data} />}
      <div className="result-actions">
        <button className="btn-secondary" onClick={onReset}><RefreshCw size={16} /> Start over</button>
      </div>
    </div>
  );
}
