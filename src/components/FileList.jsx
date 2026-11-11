import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileText, GripVertical, Image as ImageIcon, Trash2, TriangleAlert } from "lucide-react";
import { formatBytes, plural } from "../lib/format";

function Thumb({ file }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img className="file-thumb" src={url} alt="" />;
}

/** The selected files: shows size and page count, lets the user reorder (drag or arrows) and remove. */
export default function FileList({ entries, reorder, image, onMove, onRemove, onClear, disabled, order = true }) {
  const [dragFrom, setDragFrom] = useState(null);

  return (
    <div className="file-list">
      <div className="file-list-head">
        <strong>Selected files ({entries.length})</strong>
        {entries.length > 1 && (
          <button className="link-button" onClick={onClear} disabled={disabled}>Clear all</button>
        )}
      </div>

      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className={`file-row ${dragFrom === index ? "dragging" : ""}`}
          draggable={reorder && !disabled}
          onDragStart={() => setDragFrom(index)}
          onDragEnd={() => setDragFrom(null)}
          onDragOver={(e) => reorder && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragFrom !== null && dragFrom !== index) onMove(dragFrom, index);
            setDragFrom(null);
          }}
        >
          {reorder && entries.length > 1 && <GripVertical className="grip" size={16} />}
          {reorder && order && entries.length > 1 && <span className="file-order">{index + 1}</span>}
          {image ? <Thumb file={entry.file} /> : <span className="file-icon"><FileText size={20} /></span>}

          <div className="file-meta">
            <div className="file-name" title={entry.file.name}>{entry.file.name}</div>
            <div className="file-sub">
              {formatBytes(entry.file.size)}
              {entry.pages != null && <> · {plural(entry.pages, "page")}</>}
              {entry.note && <span className="file-note"><TriangleAlert size={12} /> {entry.note}</span>}
            </div>
          </div>

          {reorder && entries.length > 1 && (
            <div className="file-actions">
              <button aria-label="Move up" title="Move up" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={15} /></button>
              <button aria-label="Move down" title="Move down" disabled={disabled || index === entries.length - 1} onClick={() => onMove(index, index + 1)}><ArrowDown size={15} /></button>
            </div>
          )}
          <button className="file-remove" aria-label={`Remove ${entry.file.name}`} title="Remove" disabled={disabled} onClick={() => onRemove(index)}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
