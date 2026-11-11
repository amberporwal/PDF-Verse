import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, RotateCcw, RotateCw, Trash2, LoaderCircle } from "lucide-react";
import { openPreview } from "../lib/pdfPreview";

const BOX_W = 128;
const BOX_H = 168;
let uidCounter = 0;
const nextUid = () => ++uidCounter;

/**
 * Page thumbnails for the page tools. `mode`:
 *   select   click pages to mark them (remove / extract)
 *   rotate   rotate single pages or all of them
 *   reorder  drag pages (or use arrows) into a new order
 *   organize reorder + rotate + duplicate + delete
 * It reports its state upward with onChange(items, totalPages).
 */
export default function PageGrid({ file, mode, verb, onChange, disabled }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [thumbs, setThumbs] = useState({});
  const [status, setStatus] = useState("loading"); // loading | ready | password | invalid
  const [dragFrom, setDragFrom] = useState(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    let handle;
    setStatus("loading");
    setThumbs({});
    setItems([]);

    (async () => {
      try {
        handle = await openPreview(file);
        if (cancelled) return handle.destroy();
        setTotal(handle.numPages);
        setItems(Array.from({ length: handle.numPages }, (_, i) => ({ uid: nextUid(), page: i + 1, rotate: 0, marked: false })));
        setStatus("ready");
        for (let p = 1; p <= handle.numPages && !cancelled; p++) {
          try {
            const t = await handle.thumb(p, BOX_W * 1.6);
            if (!cancelled) setThumbs((prev) => ({ ...prev, [p]: t }));
          } catch {
            /* a page that cannot be drawn simply keeps its placeholder */
          }
        }
      } catch (error) {
        if (!cancelled) setStatus(error.code === "password" ? "password" : "invalid");
      }
    })();

    return () => {
      cancelled = true;
      handle?.destroy();
    };
  }, [file]);

  useEffect(() => {
    onChangeRef.current?.(items, total, status);
  }, [items, total, status]);

  const update = (fn) => setItems((prev) => fn(prev));
  const toggle = (uid) => update((p) => p.map((i) => (i.uid === uid ? { ...i, marked: !i.marked } : i)));
  const rotate = (uid, by) => update((p) => p.map((i) => (i.uid === uid ? { ...i, rotate: (((i.rotate + by) % 360) + 360) % 360 } : i)));
  const remove = (uid) => update((p) => p.filter((i) => i.uid !== uid));
  const duplicate = (uid) =>
    update((p) => {
      const at = p.findIndex((i) => i.uid === uid);
      const copy = { ...p[at], uid: nextUid() };
      return [...p.slice(0, at + 1), copy, ...p.slice(at + 1)];
    });
  const move = (from, to) =>
    update((p) => {
      if (to < 0 || to >= p.length || from === to) return p;
      const next = [...p];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  const reset = () =>
    update(() => Array.from({ length: total }, (_, i) => ({ uid: nextUid(), page: i + 1, rotate: 0, marked: false })));

  if (status === "loading") {
    return <div className="grid-status"><LoaderCircle className="spin" size={20} /> Reading pages…</div>;
  }
  if (status === "password") {
    return <div className="grid-status warn">This PDF is password protected. Unlock it first with the Unlock PDF tool, then come back.</div>;
  }
  if (status === "invalid") {
    return <div className="grid-status warn">This PDF could not be read, so page thumbnails are not available. If it is damaged, try the Repair PDF tool first.</div>;
  }

  const markedCount = items.filter((i) => i.marked).length;
  const canDrag = (mode === "reorder" || mode === "organize") && !disabled;

  return (
    <div className="page-grid-wrap">
      <div className="grid-toolbar">
        {mode === "select" && (
          <>
            <span className="grid-count">
              <strong>{markedCount}</strong> of {total} selected to {verb}
            </span>
            <button className="chip-button" onClick={() => update((p) => p.map((i) => ({ ...i, marked: true })))} disabled={disabled}>Select all</button>
            <button className="chip-button" onClick={() => update((p) => p.map((i) => ({ ...i, marked: !i.marked })))} disabled={disabled}>Invert</button>
            <button className="chip-button" onClick={() => update((p) => p.map((i) => ({ ...i, marked: false })))} disabled={disabled}>Clear</button>
          </>
        )}
        {mode === "rotate" && (
          <>
            <span className="grid-count">Rotate pages individually or all at once</span>
            <button className="chip-button" onClick={() => update((p) => p.map((i) => ({ ...i, rotate: (i.rotate + 270) % 360 })))} disabled={disabled}><RotateCcw size={14} /> All left</button>
            <button className="chip-button" onClick={() => update((p) => p.map((i) => ({ ...i, rotate: (i.rotate + 90) % 360 })))} disabled={disabled}><RotateCw size={14} /> All right</button>
            <button className="chip-button" onClick={reset} disabled={disabled}>Reset</button>
          </>
        )}
        {(mode === "reorder" || mode === "organize") && (
          <>
            <span className="grid-count">
              {mode === "organize" ? `${items.length} pages in the new document. ` : ""}Drag pages to reorder
            </span>
            <button className="chip-button" onClick={() => update((p) => [...p].reverse())} disabled={disabled}>Reverse</button>
            <button className="chip-button" onClick={reset} disabled={disabled}>Reset</button>
          </>
        )}
      </div>

      <div className="page-grid">
        {items.map((item, index) => {
          const t = thumbs[item.page];
          const ratio = t?.ratio ?? 1.414;
          const fitW = ratio >= BOX_H / BOX_W ? BOX_H / ratio : BOX_W;
          const fitH = ratio >= BOX_H / BOX_W ? BOX_H : BOX_W * ratio;
          const odd = item.rotate % 180 !== 0;
          const scale = odd ? Math.min(1, BOX_W / fitH, BOX_H / fitW) : 1;

          return (
            <div
              key={item.uid}
              className={`page-card ${item.marked ? "marked" : ""} ${mode === "select" ? "clickable" : ""} ${dragFrom === index ? "dragging" : ""} ${verb === "remove" && item.marked ? "remove" : ""}`}
              draggable={canDrag}
              onDragStart={() => setDragFrom(index)}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, index);
                setDragFrom(null);
              }}
              onClick={() => mode === "select" && !disabled && toggle(item.uid)}
            >
              <div className="page-thumb" style={{ width: BOX_W, height: BOX_H }}>
                {t ? (
                  <img
                    src={t.url}
                    alt={`Page ${item.page}`}
                    draggable={false}
                    style={{ width: fitW, height: fitH, transform: `rotate(${item.rotate}deg) scale(${scale})` }}
                  />
                ) : (
                  <LoaderCircle className="spin muted" size={18} />
                )}
                {mode === "select" && item.marked && <span className="page-check"><Check size={14} /></span>}
              </div>

              <div className="page-label">
                <span>Page {item.page}{item.rotate ? ` · ${item.rotate}°` : ""}</span>
              </div>

              {mode !== "select" && (
                <div className="page-tools" onClick={(e) => e.stopPropagation()}>
                  {(mode === "rotate" || mode === "organize") && (
                    <>
                      <button title="Rotate left" aria-label={`Rotate page ${item.page} left`} onClick={() => rotate(item.uid, 270)} disabled={disabled}><RotateCcw size={14} /></button>
                      <button title="Rotate right" aria-label={`Rotate page ${item.page} right`} onClick={() => rotate(item.uid, 90)} disabled={disabled}><RotateCw size={14} /></button>
                    </>
                  )}
                  {(mode === "reorder" || mode === "organize") && (
                    <>
                      <button title="Move earlier" aria-label={`Move page ${item.page} earlier`} onClick={() => move(index, index - 1)} disabled={disabled || index === 0}><ArrowLeft size={14} /></button>
                      <button title="Move later" aria-label={`Move page ${item.page} later`} onClick={() => move(index, index + 1)} disabled={disabled || index === items.length - 1}><ArrowRight size={14} /></button>
                    </>
                  )}
                  {mode === "organize" && (
                    <>
                      <button title="Duplicate" aria-label={`Duplicate page ${item.page}`} onClick={() => duplicate(item.uid)} disabled={disabled}><Copy size={14} /></button>
                      <button className="danger" title="Delete" aria-label={`Delete page ${item.page}`} onClick={() => remove(item.uid)} disabled={disabled || items.length === 1}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
