import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, FileText, Search, Sun, Moon, Sparkles, ShieldCheck,
  Menu, X, UploadCloud, WandSparkles, Heart, Check, ChevronDown, History, Trash2,
} from "lucide-react";
import { tools, categories, toolById } from "./data/tools";
import { faq } from "./data/faq";
import ToolModal from "./components/ToolModal";
import { getCapabilities } from "./lib/api";
import { useStoredState } from "./lib/storage";
import { formatBytes, timeAgo } from "./lib/format";

const HISTORY_LIMIT = 8;

function App() {
  const [theme, setTheme] = useStoredState("pdfverse-theme", "dark");
  const [favorites, setFavorites] = useStoredState("pdfverse-favorites", []);
  const [history, setHistory] = useStoredState("pdfverse-history", []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All tools");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [caps, setCaps] = useState(null);
  const searchRef = useRef(null);

  // Ask the server what this computer can do (LibreOffice, Chrome, OCR languages) so tools can be honest.
  useEffect(() => {
    getCapabilities().then(setCaps);
  }, []);

  // Cmd/Ctrl + K focuses the search box.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = theme === "dark" ? "#0b0c12" : "#f7f7fb";
  }, [theme]);

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((tool) => {
      const text = `${tool.name} ${tool.desc} ${tool.category}`.toLowerCase();
      return (
        (!q || text.includes(q)) &&
        (category === "All tools" || tool.category === category) &&
        (!onlyFavorites || favorites.includes(tool.id))
      );
    });
  }, [query, category, onlyFavorites, favorites]);

  const toggleFavorite = (id) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const activeTool = activeId ? toolById[activeId] : null;
  const closeTool = useCallback(() => setActiveId(null), []);

  // Only file names, sizes and times are remembered, never file contents. It stays in this browser.
  const recordDone = useCallback(
    (tool, res) => {
      const entry = {
        toolId: tool.id,
        file: res.filename || tool.name,
        size: res.meta?.resultSize ?? res.blob?.size ?? null,
        at: Date.now(),
      };
      setHistory((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT));
    },
    [setHistory],
  );

  const clearFilters = () => {
    setQuery("");
    setCategory("All tools");
    setOnlyFavorites(false);
  };

  return (
    <div className={`app ${theme}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="navbar">
        <a className="brand" href="#" aria-label="Pdf VERSE home">
          <span className="brand-mark"><FileText size={21} strokeWidth={2.5} /></span>
          <span>pdf<span className="brand-light">VERSE</span><i>.</i></span>
        </a>

        <nav className={`nav-links ${mobileOpen ? "open" : ""}`} onClick={() => setMobileOpen(false)}>
          <a className="nav-active" href="#tools">Tools</a>
          <a href="#how">How it works</a>
          <a href="#security">Privacy</a>
          <a href="#faq">FAQ</a>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={19} />
          </button>
        </nav>

        <div className="nav-actions">
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <a className="nav-cta" href="#tools">Explore tools <ArrowUpRight size={15} /></a>
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse-dot" /> YOUR DOCUMENTS, IN THEIR ELEMENT
              <span className="eyebrow-star">✦</span>
            </div>

            <h1>PDF work,<br /><span className="gradient-text">without the</span><br />busywork.</h1>

            <p className="hero-subtitle">
              Everything you need to work with PDFs. Simple tools,
              thoughtful design, and a little more room to breathe.
            </p>

            <div className="hero-actions">
              <a href="#tools" className="button-primary">
                Explore all tools <ArrowRight size={17} />
              </a>
              <a href="#how" className="button-quiet">
                <span className="play-icon">↗</span> How it works
              </a>
            </div>

            <div className="hero-trust">
              <div className="trust-avatars"><span>✦</span><span>✓</span><span>∞</span></div>
              <span><strong>Free to use</strong> · No sign-up required</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-orbit orbit-a" />
            <div className="visual-orbit orbit-b" />
            <div className="hero-glow" />
            <div className="floating-chip chip-top"><Sparkles size={14} /> Made for flow</div>

            <div className="document-stack">
              <div className="doc-back doc-back-two"><div className="doc-line short" /></div>
              <div className="doc-back doc-back-one"><div className="doc-line" /></div>

              <div className="doc-front">
                <div className="doc-top">
                  <span className="doc-label">PDF VERSE / 001</span>
                  <span className="doc-dot" />
                </div>
                <div className="doc-art">
                  <div className="art-circle" />
                  <div className="art-square" />
                  <div className="art-line" />
                </div>
                <div className="doc-title-lines"><span /><span /><span /></div>
                <div className="doc-footer"><span>YOUR FILE</span><span>READY TO FLOW ↗</span></div>
              </div>
            </div>

            <div className="floating-chip chip-bottom">
              <span className="chip-check"><Check size={12} /></span> All set. All yours.
            </div>
            <div className="orbit-icon icon-file"><FileText size={21} /></div>
            <div className="orbit-icon icon-spark"><Sparkles size={19} /></div>
          </div>
        </section>

        <section className="stats-strip">
          <div><strong>{tools.length} tools.</strong><span>Every PDF task.</span></div>
          <div className="stats-divider" />
          <div><strong>Simple by design.</strong><span>Tools that just make sense.</span></div>
          <div className="stats-divider" />
          <div><strong>Privacy first.</strong><span>Files are never kept.</span></div>
          <div className="stats-badge"><Sparkles size={14} /> A better way to PDF</div>
        </section>

        <section className="tools-section" id="tools">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">THE TOOLBOX</div>
              <h2>Find your <span className="gradient-text">flow.</span></h2>
              <p>One small task or a whole document day. Start anywhere.</p>
            </div>

            <div className="tool-search">
              <Search size={17} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search PDF tools..."
                aria-label="Search PDF tools"
              />
              <kbd>Ctrl K</kbd>
            </div>
          </div>

          <div className="category-row">
            <div className="category-tabs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={category === cat ? "category active" : "category"}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button
              className={`chip-toggle ${onlyFavorites ? "active" : ""}`}
              onClick={() => setOnlyFavorites((v) => !v)}
              aria-pressed={onlyFavorites}
            >
              <Heart size={13} fill={onlyFavorites ? "currentColor" : "none"} /> Favorites
              {favorites.length > 0 && <span>({favorites.length})</span>}
            </button>
          </div>

          <div className="tools-grid">
            {filteredTools.map((tool, i) => {
              const Icon = tool.icon;
              const fav = favorites.includes(tool.id);
              return (
                <article className="tool-card" key={tool.id} style={{ "--delay": `${Math.min(i, 12) * 40}ms` }}>
                  <div className="card-top">
                    <div className={`tool-icon ${tool.color}`}><Icon size={21} /></div>
                    <div className="card-badges">
                      {tool.tag && <span className={`tag ${tool.tag === "AI" ? "tag-ai" : ""}`}>{tool.tag}</span>}
                      <button
                        className={`favorite ${fav ? "favorited" : ""}`}
                        onClick={() => toggleFavorite(tool.id)}
                        aria-pressed={fav}
                        aria-label={`${fav ? "Remove" : "Add"} ${tool.name} ${fav ? "from" : "to"} favorites`}
                      >
                        <Heart size={16} fill={fav ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </div>

                  <h3>{tool.name}</h3>
                  <p>{tool.desc}</p>

                  <button className="card-link" onClick={() => setActiveId(tool.id)}>
                    Open tool <ArrowUpRight size={15} />
                  </button>
                </article>
              );
            })}
          </div>

          {filteredTools.length === 0 && (
            <div className="empty-state">
              <Search size={24} />
              <h3>{onlyFavorites && favorites.length === 0 ? "No favorites yet" : "No tools found"}</h3>
              <p>
                {onlyFavorites && favorites.length === 0
                  ? "Tap the heart on a tool to keep it handy here."
                  : "Try a different search or category."}
              </p>
              <button onClick={clearFilters}>Clear filters</button>
            </div>
          )}

          <div className="tools-footer">
            <span>Showing <strong>{filteredTools.length}</strong> of {tools.length} tools</span>
            {(category !== "All tools" || query || onlyFavorites) && (
              <button onClick={clearFilters}>Browse all tools <ArrowRight size={15} /></button>
            )}
          </div>
        </section>

        {history.length > 0 && (
          <section className="recent-section" aria-label="Recent activity">
            <div className="recent-head">
              <h3><History size={17} /> Recent activity</h3>
              <button className="link-button" onClick={() => setHistory([])}>
                <Trash2 size={12} /> Clear history
              </button>
            </div>
            <div className="recent-list">
              {history.map((h, i) => {
                const tool = toolById[h.toolId];
                if (!tool) return null;
                const Icon = tool.icon;
                return (
                  <div className="recent-item" key={`${h.at}-${i}`}>
                    <div className={`tool-icon ${tool.color}`}><Icon size={17} /></div>
                    <div>
                      <strong title={h.file}>{h.file}</strong>
                      <span>{tool.name}{h.size ? ` · ${formatBytes(h.size)}` : ""} · {timeAgo(h.at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="how-section" id="how">
          <div className="how-heading">
            <div className="eyebrow">NO MANUAL REQUIRED</div>
            <h2>Three steps.<br /><span className="gradient-text">Zero drama.</span></h2>
          </div>

          <div className="steps">
            <div className="step">
              <span className="step-number">01</span>
              <div className="step-icon"><UploadCloud size={23} /></div>
              <h3>Bring your file</h3>
              <p>Drop a file or choose one from your device. No account, no fuss.</p>
            </div>

            <div className="step-connector">··················→</div>

            <div className="step">
              <span className="step-number">02</span>
              <div className="step-icon"><WandSparkles size={23} /></div>
              <h3>Make it happen</h3>
              <p>Pick your tool, set a few options and let the busywork take care of itself.</p>
            </div>

            <div className="step-connector">··················→</div>

            <div className="step">
              <span className="step-number">03</span>
              <div className="step-icon"><ArrowRight size={23} /></div>
              <h3>Take it with you</h3>
              <p>Download your finished file. Ready for whatever comes next.</p>
            </div>
          </div>
        </section>

        <section className="security-section" id="security">
          <div className="security-icon"><ShieldCheck size={25} /></div>

          <div>
            <div className="eyebrow">YOUR FILES. YOUR BUSINESS.</div>
            <h2>Privacy isn't a feature.<br /><span className="gradient-text">It's the foundation.</span></h2>
            <p>
              Files are processed in memory and are not saved, shared or used for anything else.
              The few conversions that need a temporary file remove it as soon as your result is ready.
              Your history and favorites live only in this browser.
            </p>
          </div>

          <div className="security-points">
            <div><Check size={15} /> No account needed</div>
            <div><Check size={15} /> Files are not kept after processing</div>
            <div><Check size={15} /> Password tools never bypass protection</div>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="section-heading">
            <div className="eyebrow section-eyebrow">GOOD TO KNOW</div>
            <h2>Questions, <span className="gradient-text">answered.</span></h2>
          </div>
          {faq.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>{item.q}<ChevronDown size={17} /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>

        <section className="bottom-cta">
          <div className="cta-spark"><Sparkles size={22} /></div>
          <div className="eyebrow">YOUR NEXT PDF ERA STARTS HERE</div>
          <h2>Less file fuss.<br /><span className="gradient-text">More getting-things-done.</span></h2>
          <p>Good tools should get out of your way. That’s the whole idea.</p>
          <a href="#tools" className="button-primary">Find your tool <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#">
          <span className="brand-mark"><FileText size={18} /></span>
          <span>pdf<span className="brand-light">VERSE</span><i>.</i></span>
        </a>

        <span>Made for your document universe. <span className="footer-star">✦</span></span>
        <div className="footer-links">
          <a href="#tools">Tools</a>
          <a href="#security">Privacy</a>
          <a href="#faq">FAQ</a>
        </div>
        <span className="copyright">© 2026 Pdf VERSE</span>
      </footer>

      {activeTool && (
        <ToolModal
          key={activeTool.id}
          tool={activeTool}
          caps={caps}
          onClose={closeTool}
          onDone={recordDone}
        />
      )}
    </div>
  );
}

export default App;
