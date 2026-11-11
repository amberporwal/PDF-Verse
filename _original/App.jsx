
import { useMemo, useState } from "react";
import {
  ArrowRight, ArrowUpRight, FileText, Files, Scissors, Minimize2,
  Image, FileImage, RotateCw, LockKeyhole, FileType2, ScanText,
  Search, Sun, Moon, Sparkles, ShieldCheck, Zap, Menu, X,
  ChevronDown, Layers, WandSparkles, UploadCloud, Heart, Check,
  FilePlus2, Trash2, Download, LoaderCircle
} from "lucide-react";

const tools = [
  { name: "Merge PDF", desc: "Combine multiple PDFs into one seamless file.", icon: Files, category: "Organize", tag: "Popular", color: "violet" },
  { name: "Compress PDF", desc: "Reduce file size while keeping quality crisp.", icon: Minimize2, category: "Optimize", tag: "Popular", color: "blue" },
  { name: "Split PDF", desc: "Separate pages or extract the ones you need.", icon: Scissors, category: "Organize", color: "pink" },
  { name: "PDF to JPG", desc: "Turn PDF pages into high-quality images.", icon: FileImage, category: "Convert", color: "orange" },
  { name: "Rotate PDF", desc: "Fix page orientation in just a few clicks.", icon: RotateCw, category: "Organize", color: "cyan" },
  { name: "Protect PDF", desc: "Add a password to keep your documents private.", icon: LockKeyhole, category: "Security", color: "green" },
  { name: "PDF to Word", desc: "Convert PDFs into editable Word documents.", icon: FileType2, category: "Convert", color: "blue" },
  { name: "OCR PDF", desc: "Make scanned documents searchable.", icon: ScanText, category: "Convert", tag: "AI", color: "violet" },
  { name: "Add watermark", desc: "Stamp your documents with custom branding.", icon: WandSparkles, category: "Edit", color: "pink" },
  { name: "Images to PDF", desc: "Bundle photos and images into one PDF.", icon: Image, category: "Convert", color: "orange" },
  { name: "Organize PDF", desc: "Reorder, delete, or duplicate PDF pages.", icon: Layers, category: "Edit", color: "cyan" },
  { name: "PDF to Excel", desc: "Extract tables into an Excel spreadsheet.", icon: FileText, category: "Convert", color: "green" }
];

const categories = ["All tools", "Organize", "Convert", "Optimize", "Edit", "Security"];

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("pdfverse-theme") || "dark");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All tools");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);

  // Merge PDF states
  const [activeTool, setActiveTool] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");

  // Split PDF states
  const [splitFile, setSplitFile] = useState(null);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState("");
  const [splitMode, setSplitMode] = useState("individual");
  const [splitRanges, setSplitRanges] = useState("");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("pdfverse-theme", next);
  };

  const filteredTools = useMemo(() => tools.filter(tool => {
    const matchesQuery = `${tool.name} ${tool.desc} ${tool.category}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "All tools" || tool.category === category;
    return matchesQuery && matchesCategory;
  }), [query, category]);

  const toggleFavorite = (name) =>
    setFavorites(prev => prev.includes(name)
      ? prev.filter(x => x !== name)
      : [...prev, name]);

  // Open selected tool
  const openTool = (toolName) => {
    if (toolName === "Merge PDF") {
      setActiveTool("Merge PDF");
      setSelectedFiles([]);
      setError("");
    } else if (toolName === "Split PDF") {
      setActiveTool("Split PDF");
      setSplitFile(null);
      setSplitError("");
      setSplitMode("individual");
      setSplitRanges("");
    } else {
      alert(`${toolName} is coming in the next build phase.`);
    }
  };

  // Close merge modal
  const closeTool = () => {
    if (merging) return;
    setActiveTool(null);
    setSelectedFiles([]);
    setError("");
    setSplitFile(null);
    setSplitError("");
  };

  // Upload PDF files
  const handleFiles = (event) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => file.type === "application/pdf");

    if (validFiles.length !== files.length) {
      setError("Only PDF files are allowed.");
    } else {
      setError("");
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
    event.target.value = "";
  };

  // Remove selected PDF
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Merge PDF API request
  const mergePDFs = async () => {
    if (selectedFiles.length < 2) {
      setError("Please select at least 2 PDF files.");
      return;
    }

    setMerging(true);
    setError("");

    try {
      const formData = new FormData();

      selectedFiles.forEach(file => {
        formData.append("pdfs", file);
      });

      const response = await fetch("/api/merge-pdf", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        let message = "PDF merge failed.";

        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // Use default error message
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "merged.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setMerging(false);
    }
  };

  // Select one PDF for splitting
  const handleSplitFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSplitError("Only PDF files are allowed.");
      setSplitFile(null);
    } else {
      setSplitFile(file);
      setSplitError("");
    }

    event.target.value = "";
  };

  // Split PDF API request and download ZIP
  const splitPDF = async () => {
    if (!splitFile) {
      setSplitError("Please select a PDF file.");
      return;
    }

    if (splitMode === "ranges" && !splitRanges.trim()) {
      setSplitError("Enter page ranges, for example: 1-3, 5-7");
      return;
    }

    setSplitting(true);
    setSplitError("");

    try {
      const formData = new FormData();
      formData.append("pdf", splitFile);
      if (splitMode === "ranges") {
        formData.append("ranges", splitRanges.trim());
      }

      const response = await fetch("http://localhost:5000/api/split-pdf", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        let message = "PDF split failed.";
        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // Keep the default message if response isn't JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "split-pdf.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setSplitError(err.message || "Something went wrong while splitting.");
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className={`app ${theme}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="navbar">
        <a className="brand" href="#" aria-label="Pdf VERSE home">
          <span className="brand-mark"><FileText size={21} strokeWidth={2.5}/></span>
          <span>pdf<span className="brand-light">VERSE</span><i>.</i></span>
        </a>

        <nav className={`nav-links ${mobileOpen ? "open" : ""}`}>
          <a className="nav-active" href="#tools">Tools</a>
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X size={19}/>
          </button>
        </nav>

        <div className="nav-actions">
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}
          </button>
          <a className="nav-cta" href="#tools">Explore tools <ArrowUpRight size={15}/></a>
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={20}/>
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse-dot"/> YOUR DOCUMENTS, IN THEIR ELEMENT
              <span className="eyebrow-star">✦</span>
            </div>

            <h1>PDF work,<br/><span className="gradient-text">without the</span><br/>busywork.</h1>

            <p className="hero-subtitle">
              Everything you need to work with PDFs. Simple tools,
              thoughtful design, and a little more room to breathe.
            </p>

            <div className="hero-actions">
              <a href="#tools" className="button-primary">
                Explore all tools <ArrowRight size={17}/>
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
            <div className="visual-orbit orbit-a"/>
            <div className="visual-orbit orbit-b"/>
            <div className="hero-glow"/>
            <div className="floating-chip chip-top"><Sparkles size={14}/> Made for flow</div>

            <div className="document-stack">
              <div className="doc-back doc-back-two"><div className="doc-line short"/></div>
              <div className="doc-back doc-back-one"><div className="doc-line"/></div>

              <div className="doc-front">
                <div className="doc-top">
                  <span className="doc-label">PDF VERSE / 001</span>
                  <span className="doc-dot"/>
                </div>
                <div className="doc-art">
                  <div className="art-circle"/>
                  <div className="art-square"/>
                  <div className="art-line"/>
                </div>
                <div className="doc-title-lines"><span/><span/><span/></div>
                <div className="doc-footer"><span>YOUR FILE</span><span>READY TO FLOW ↗</span></div>
              </div>
            </div>

            <div className="floating-chip chip-bottom">
              <span className="chip-check"><Check size={12}/></span> All set. All yours.
            </div>
            <div className="orbit-icon icon-file"><FileText size={21}/></div>
            <div className="orbit-icon icon-spark"><Sparkles size={19}/></div>
          </div>
        </section>

        <section className="stats-strip">
          <div><strong>One space.</strong><span>Every PDF task.</span></div>
          <div className="stats-divider"/>
          <div><strong>Simple by design.</strong><span>Tools that just make sense.</span></div>
          <div className="stats-divider"/>
          <div><strong>Privacy first.</strong><span>Your files stay yours.</span></div>
          <div className="stats-badge"><Sparkles size={14}/> A better way to PDF</div>
        </section>

        <section className="tools-section" id="tools">
          <div className="section-heading">
            <div>
              <div className="eyebrow section-eyebrow">THE TOOLBOX</div>
              <h2>Find your <span className="gradient-text">flow.</span></h2>
              <p>One small task or a whole document day. Start anywhere.</p>
            </div>

            <div className="tool-search">
              <Search size={17}/>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search PDF tools..."
                aria-label="Search PDF tools"
              />
              <kbd>⌘ K</kbd>
            </div>
          </div>

          <div className="category-row">
            <div className="category-tabs">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={category === cat ? "category active" : "category"}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button className="sort-button">Featured <ChevronDown size={14}/></button>
          </div>

          <div className="tools-grid">
            {filteredTools.map((tool, i) => {
              const Icon = tool.icon;

              return (
                <article className="tool-card" key={tool.name} style={{"--delay": `${i * 45}ms`}}>
                  <div className="card-top">
                    <div className={`tool-icon ${tool.color}`}><Icon size={21}/></div>

                    <div className="card-badges">
                      {tool.tag && (
                        <span className={`tag ${tool.tag === "AI" ? "tag-ai" : ""}`}>
                          {tool.tag}
                        </span>
                      )}

                      <button
                        className={`favorite ${favorites.includes(tool.name) ? "favorited" : ""}`}
                        onClick={() => toggleFavorite(tool.name)}
                        aria-label={`Favorite ${tool.name}`}
                      >
                        <Heart size={16} fill={favorites.includes(tool.name) ? "currentColor" : "none"}/>
                      </button>
                    </div>
                  </div>

                  <h3>{tool.name}</h3>
                  <p>{tool.desc}</p>

                  <button className="card-link" onClick={() => openTool(tool.name)}>
                    Open tool <ArrowUpRight size={15}/>
                  </button>
                </article>
              );
            })}
          </div>

          {filteredTools.length === 0 && (
            <div className="empty-state">
              <Search size={24}/>
              <h3>No tools found</h3>
              <p>Try a different search or category.</p>
              <button onClick={() => {setQuery("");setCategory("All tools");}}>
                Clear filters
              </button>
            </div>
          )}

          <div className="tools-footer">
            <span>Showing <strong>{filteredTools.length}</strong> tools in this preview</span>
            <button onClick={() => {setCategory("All tools");setQuery("");}}>
              Browse all tools <ArrowRight size={15}/>
            </button>
          </div>
        </section>

        <section className="how-section" id="how">
          <div className="how-heading">
            <div className="eyebrow">NO MANUAL REQUIRED</div>
            <h2>Three steps.<br/><span className="gradient-text">Zero drama.</span></h2>
          </div>

          <div className="steps">
            <div className="step">
              <span className="step-number">01</span>
              <div className="step-icon"><UploadCloud size={23}/></div>
              <h3>Bring your file</h3>
              <p>Choose a PDF from your device. No account, no fuss.</p>
            </div>

            <div className="step-connector">··················→</div>

            <div className="step">
              <span className="step-number">02</span>
              <div className="step-icon"><WandSparkles size={23}/></div>
              <h3>Make it happen</h3>
              <p>Pick your tool and let the busywork take care of itself.</p>
            </div>

            <div className="step-connector">··················→</div>

            <div className="step">
              <span className="step-number">03</span>
              <div className="step-icon"><ArrowRight size={23}/></div>
              <h3>Take it with you</h3>
              <p>Download your finished file. Ready for whatever comes next.</p>
            </div>
          </div>
        </section>

        <section className="security-section" id="security">
          <div className="security-icon"><ShieldCheck size={25}/></div>

          <div>
            <div className="eyebrow">YOUR FILES. YOUR BUSINESS.</div>
            <h2>Privacy isn't a feature.<br/><span className="gradient-text">It's the foundation.</span></h2>
            <p>
              We’re building Pdf VERSE with privacy in mind. Processing details
              and file handling will be clearly explained as each tool launches.
            </p>
          </div>

          <div className="security-points">
            <div><Check size={15}/> No account needed for basic tools</div>
            <div><Check size={15}/> Clear file handling policies</div>
            <div><Check size={15}/> Secure processing roadmap</div>
          </div>
        </section>

        <section className="bottom-cta" id="faq">
          <div className="cta-spark"><Sparkles size={22}/></div>
          <div className="eyebrow">YOUR NEXT PDF ERA STARTS HERE</div>
          <h2>Less file fuss.<br/><span className="gradient-text">More getting-things-done.</span></h2>
          <p>Good tools should get out of your way. That’s the whole idea.</p>
          <a href="#tools" className="button-primary">Find your tool <ArrowRight size={17}/></a>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#">
          <span className="brand-mark"><FileText size={18}/></span>
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

      {/* MERGE PDF MODAL */}
      {activeTool === "Merge PDF" && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeTool();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <div style={{
            width: "100%",
            maxWidth: "540px",
            maxHeight: "90vh",
            overflowY: "auto",
            padding: "28px",
            borderRadius: "24px",
            background: theme === "dark" ? "#171722" : "#ffffff",
            color: theme === "dark" ? "#ffffff" : "#171722",
            border: "1px solid rgba(150,130,255,0.25)",
            boxShadow: "0 25px 100px rgba(0,0,0,0.4)"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px"
            }}>
              <div>
                <div style={{fontSize: "12px", color: "#a78bfa", fontWeight: 700, letterSpacing: "2px"}}>
                  PDF VERSE TOOL
                </div>
                <h2 style={{margin: "8px 0 0", fontSize: "26px"}}>Merge PDF files</h2>
              </div>

              <button
                onClick={closeTool}
                disabled={merging}
                style={{
                  border: "none",
                  background: "rgba(150,130,255,0.12)",
                  color: "inherit",
                  borderRadius: "12px",
                  padding: "10px",
                  cursor: "pointer"
                }}
              >
                <X size={20}/>
              </button>
            </div>

            <p style={{opacity: 0.7, lineHeight: 1.6}}>
              Select at least two PDF files. They will be merged in the order shown below.
            </p>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                padding: "30px 15px",
                margin: "20px 0",
                border: "2px dashed rgba(167,139,250,0.5)",
                borderRadius: "18px",
                cursor: "pointer",
                textAlign: "center"
              }}
            >
              <FilePlus2 size={32} color="#a78bfa"/>
              <strong>Select PDF files</strong>
              <span style={{fontSize: "13px", opacity: 0.65}}>
                PDF format only · Select multiple files
              </span>

              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={handleFiles}
                style={{display: "none"}}
              />
            </label>

            {selectedFiles.length > 0 && (
              <div style={{marginBottom: "20px"}}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "12px"
                }}>
                  <strong>Selected files ({selectedFiles.length})</strong>
                  <button
                    onClick={() => setSelectedFiles([])}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#a78bfa",
                      cursor: "pointer"
                    }}
                  >
                    Clear all
                  </button>
                </div>

                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px",
                      marginBottom: "8px",
                      borderRadius: "12px",
                      background: theme === "dark" ? "#222230" : "#f3f2f9"
                    }}
                  >
                    <FileText size={20} color="#a78bfa"/>

                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        {file.name}
                      </div>
                      <div style={{fontSize: "12px", opacity: 0.6}}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>

                    <button
                      onClick={() => removeFile(index)}
                      title="Remove file"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#ef4444",
                        cursor: "pointer"
                      }}
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{
                padding: "12px",
                marginBottom: "15px",
                borderRadius: "10px",
                background: "rgba(239,68,68,0.12)",
                color: "#ef4444",
                fontSize: "14px"
              }}>
                {error}
              </div>
            )}

            <button
              onClick={mergePDFs}
              disabled={merging || selectedFiles.length < 2}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "10px",
                padding: "15px",
                border: "none",
                borderRadius: "14px",
                background: merging || selectedFiles.length < 2
                  ? "#6b5b9e"
                  : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: merging || selectedFiles.length < 2 ? "not-allowed" : "pointer",
                opacity: merging || selectedFiles.length < 2 ? 0.65 : 1
              }}
            >
              {merging ? (
                <>
                  <LoaderCircle size={18}/> Merging PDFs...
                </>
              ) : (
                <>
                  <Download size={18}/> Merge & Download PDF
                </>
              )}
            </button>

            <p style={{
              fontSize: "12px",
              textAlign: "center",
              opacity: 0.5,
              marginTop: "15px"
            }}>
              Maximum 20 PDFs · 50 MB per file
            </p>
          </div>
        </div>
      )}

      {/* SPLIT PDF MODAL */}
      {activeTool === "Split PDF" && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeTool();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <div style={{
            width: "100%",
            maxWidth: "540px",
            maxHeight: "90vh",
            overflowY: "auto",
            padding: "28px",
            borderRadius: "24px",
            background: theme === "dark" ? "#171722" : "#ffffff",
            color: theme === "dark" ? "#ffffff" : "#171722",
            border: "1px solid rgba(150,130,255,0.25)",
            boxShadow: "0 25px 100px rgba(0,0,0,0.4)"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              marginBottom: "20px"
            }}>
              <div>
                <div style={{fontSize: "12px", color: "#a78bfa", fontWeight: 700, letterSpacing: "2px"}}>
                  PDF VERSE TOOL
                </div>
                <h2 style={{margin: "8px 0 0", fontSize: "26px"}}>Split PDF</h2>
              </div>
              <button
                onClick={closeTool}
                disabled={splitting}
                style={{
                  border: "none",
                  background: "rgba(150,130,255,0.12)",
                  color: "inherit",
                  borderRadius: "12px",
                  padding: "10px",
                  cursor: "pointer"
                }}
              >
                <X size={20}/>
              </button>
            </div>

            <p style={{opacity: 0.7, lineHeight: 1.6}}>
              Upload one PDF and split it into separate files. Your ZIP will download automatically.
            </p>

            <label style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              padding: "30px 15px",
              margin: "20px 0",
              border: "2px dashed rgba(167,139,250,0.5)",
              borderRadius: "18px",
              cursor: "pointer",
              textAlign: "center"
            }}>
              <FilePlus2 size={32} color="#a78bfa"/>
              <strong>{splitFile ? "Choose another PDF" : "Select a PDF file"}</strong>
              <span style={{fontSize: "13px", opacity: 0.65}}>
                PDF format only · One file at a time
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleSplitFile}
                style={{display: "none"}}
              />
            </label>

            {splitFile && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px",
                marginBottom: "18px",
                borderRadius: "12px",
                background: theme === "dark" ? "#222230" : "#f3f2f9"
              }}>
                <FileText size={20} color="#a78bfa"/>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontSize: "14px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                    {splitFile.name}
                  </div>
                  <div style={{fontSize: "12px", opacity: 0.6}}>
                    {(splitFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
                <button
                  onClick={() => {setSplitFile(null); setSplitError("");}}
                  title="Remove file"
                  style={{border: "none", background: "transparent", color: "#ef4444", cursor: "pointer"}}
                >
                  <Trash2 size={18}/>
                </button>
              </div>
            )}

            <div style={{marginBottom: "16px"}}>
              <strong style={{display: "block", marginBottom: "10px"}}>Split method</strong>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px"}}>
                <button
                  onClick={() => setSplitMode("individual")}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    border: splitMode === "individual" ? "1px solid #a78bfa" : "1px solid rgba(150,130,255,0.2)",
                    background: splitMode === "individual" ? "rgba(139,92,246,0.16)" : "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Every page separately
                </button>
                <button
                  onClick={() => setSplitMode("ranges")}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    border: splitMode === "ranges" ? "1px solid #a78bfa" : "1px solid rgba(150,130,255,0.2)",
                    background: splitMode === "ranges" ? "rgba(139,92,246,0.16)" : "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontWeight: 600
                  }}
                >
                  Custom page ranges
                </button>
              </div>
            </div>

            {splitMode === "ranges" && (
              <div style={{marginBottom: "18px"}}>
                <label style={{display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "8px"}}>
                  Page ranges
                </label>
                <input
                  value={splitRanges}
                  onChange={(e) => setSplitRanges(e.target.value)}
                  placeholder="Example: 1-3, 5, 7-9"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "13px 14px",
                    borderRadius: "12px",
                    border: "1px solid rgba(150,130,255,0.3)",
                    background: theme === "dark" ? "#222230" : "#f7f6fb",
                    color: "inherit",
                    outline: "none"
                  }}
                />
                <p style={{fontSize: "12px", opacity: 0.55, marginTop: "7px"}}>
                  Each range or page will become a separate PDF inside the ZIP.
                </p>
              </div>
            )}

            {splitError && (
              <div style={{
                padding: "12px",
                marginBottom: "15px",
                borderRadius: "10px",
                background: "rgba(239,68,68,0.12)",
                color: "#ef4444",
                fontSize: "14px"
              }}>
                {splitError}
              </div>
            )}

            <button
              onClick={splitPDF}
              disabled={splitting || !splitFile}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "10px",
                padding: "15px",
                border: "none",
                borderRadius: "14px",
                background: splitting || !splitFile ? "#6b5b9e" : "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                color: "#fff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: splitting || !splitFile ? "not-allowed" : "pointer",
                opacity: splitting || !splitFile ? 0.65 : 1
              }}
            >
              {splitting ? (
                <>
                  <LoaderCircle size={18}/> Splitting PDF...
                </>
              ) : (
                <>
                  <Download size={18}/> Split & Download ZIP
                </>
              )}
            </button>

            <p style={{fontSize: "12px", textAlign: "center", opacity: 0.5, marginTop: "15px"}}>
              Choose every page or custom ranges · ZIP download
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
