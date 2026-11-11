/** Renders a tool's option fields from its data definition. */
export default function OptionsForm({ options, values, onChange, ctx, disabled, dynamicChoices }) {
  const visible = options.filter((o) => !o.showIf || o.showIf(values, ctx));
  if (!visible.length) return null;

  return (
    <div className="options-grid">
      {visible.map((opt) => {
        const id = `opt-${opt.key}`;
        const value = values[opt.key];
        const set = (v) => onChange(opt.key, v);
        const choices = (opt.dynamic && dynamicChoices?.[opt.dynamic]) || opt.choices;
        const wide = ["textarea", "segmented", "toggle"].includes(opt.type) || opt.key === "text" || opt.key === "format";

        return (
          <div className={`field ${wide ? "wide" : ""} ${opt.type === "toggle" ? "field-toggle" : ""}`} key={opt.key}>
            {opt.type === "toggle" ? (
              <label className="toggle" htmlFor={id}>
                <input id={id} type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} disabled={disabled} />
                <span className="toggle-track" />
                <span>{opt.label}</span>
              </label>
            ) : (
              <>
                <label htmlFor={id}>
                  {opt.label}{opt.required && <span className="req"> *</span>}
                  {opt.type === "range" && <span className="range-value">{Math.round(value * 100)}%</span>}
                </label>

                {(opt.type === "text" || opt.type === "password") && (
                  <input id={id} type={opt.type} value={value} placeholder={opt.placeholder} disabled={disabled}
                    autoComplete={opt.type === "password" ? "new-password" : "off"} onChange={(e) => set(e.target.value)} />
                )}
                {opt.type === "number" && (
                  <input id={id} type="number" value={value} min={opt.min} max={opt.max} step={opt.step || 1} disabled={disabled} onChange={(e) => set(e.target.value)} />
                )}
                {opt.type === "textarea" && (
                  <textarea id={id} rows={4} value={value} placeholder={opt.placeholder} disabled={disabled} onChange={(e) => set(e.target.value)} />
                )}
                {opt.type === "select" && (
                  <select id={id} value={value} disabled={disabled} onChange={(e) => set(e.target.value)}>
                    {choices.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                )}
                {opt.type === "color" && (
                  <div className="color-input">
                    <input id={id} type="color" value={value} disabled={disabled} onChange={(e) => set(e.target.value)} />
                    <code>{value}</code>
                  </div>
                )}
                {opt.type === "range" && (
                  <input id={id} type="range" min={opt.min} max={opt.max} step={opt.step} value={value} disabled={disabled} onChange={(e) => set(Number(e.target.value))} />
                )}
                {opt.type === "segmented" && (
                  <div className="segmented" role="group" aria-label={opt.label}>
                    {choices.map(([v, label]) => (
                      <button type="button" key={v} className={value === v ? "active" : ""} disabled={disabled} onClick={() => set(v)}>{label}</button>
                    ))}
                  </div>
                )}
              </>
            )}
            {opt.help && <p className="help">{opt.help}</p>}
          </div>
        );
      })}
    </div>
  );
}
