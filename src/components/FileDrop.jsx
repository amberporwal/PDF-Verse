import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { matchesAccept } from "../lib/format";

// "Two PDF files" -> "two PDF files", but "PDF files" and "JPG images" keep their capitals.
const lowerFirst = (text) => text.replace(/^([A-Z])([a-z])/, (_, a, b) => a.toLowerCase() + b);

/** Drag-and-drop / click-to-browse file picker. Validates the file type before handing files up. */
export default function FileDrop({ accept, multiple, label, hint, onFiles, onReject, disabled, compact }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  const handle = (list) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    const good = files.filter((f) => matchesAccept(f, accept));
    const bad = files.filter((f) => !matchesAccept(f, accept));
    if (bad.length) {
      const names = bad.slice(0, 2).map((f) => `"${f.name}"`).join(", ");
      onReject?.(`${names}${bad.length > 2 ? ` and ${bad.length - 2} more` : ""} ${bad.length === 1 ? "is" : "are"} not a supported file type. Allowed: ${accept}.`);
    }
    if (good.length) onFiles(multiple ? good : good.slice(0, 1));
  };

  return (
    <div
      className={`dropzone ${over ? "over" : ""} ${compact ? "compact" : ""} ${disabled ? "disabled" : ""}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) handle(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
    >
      <span className="dropzone-icon"><UploadCloud size={compact ? 20 : 28} /></span>
      <strong>{over ? "Drop to add" : multiple ? `Add ${lowerFirst(label)}` : `Choose ${lowerFirst(label)}`}</strong>
      <span className="dropzone-sub">or drag and drop here{hint ? ` · ${hint}` : ""}</span>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
