import {
  Files, Scissors, Layers, Trash2, FileOutput, RotateCw, ArrowUpDown, Image, FileImage,
  FileType2, FileSpreadsheet, Presentation, FileCode, Minimize2, Wrench, Layers2,
  LockKeyhole, LockKeyholeOpen, WandSparkles, Eraser, Hash, Type, ImagePlus, Crop,
  FileCog, Archive, FileDiff, ListOrdered, Info, ScanText, FileInput,
} from "lucide-react";

/**
 * One entry per tool. The modal, the upload box, the options form and the API call are all
 * generated from this data, so adding a tool means adding an entry here and a route in the server.
 *
 *   files:   what to upload  { field, accept, multiple, min, max, label, hint, reorder, preview }
 *   extra:   an optional second upload (add image) { field, accept, label }
 *   grid:    page thumbnails UI: "select" | "rotate" | "reorder" | "organize"
 *   options: form fields (type: select | number | text | textarea | toggle | color | password | segmented)
 *   result:  "file" (download) or the name of a JSON viewer
 *   needs:   "office" | "browser": external program used by the server (see /api/capabilities)
 */

const PDF = ".pdf";
const POSITIONS = [
  ["top-left", "Top left"], ["top-center", "Top center"], ["top-right", "Top right"],
  ["middle-left", "Middle left"], ["center", "Center"], ["middle-right", "Middle right"],
  ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"], ["bottom-right", "Bottom right"],
];
const FONTS = [["helvetica", "Helvetica"], ["times", "Times"], ["courier", "Courier"]];
const PAGES_HELP = "Example: 1-3, 5, 8-10. Leave empty for all pages.";

const pages = (label = "Pages", help = PAGES_HELP) => ({
  key: "pages", label, type: "text", default: "", placeholder: "All pages", help,
});

const onePdf = (extra = {}) => ({ field: "file", accept: PDF, multiple: false, label: "PDF file", ...extra });

export const tools = [
  /* ------------------------------ ORGANIZE ------------------------------ */
  {
    id: "merge-pdf", name: "Merge PDF", icon: Files, category: "Organize", color: "violet", tag: "Popular",
    desc: "Combine multiple PDFs into one seamless file.",
    intro: "Add two or more PDFs and put them in the order you want. They are merged top to bottom.",
    route: "/merge-pdf", action: "Merge PDFs",
    files: { field: "pdfs", accept: PDF, multiple: true, min: 2, max: 20, label: "PDF files", hint: "Add 2 to 20 PDFs", reorder: true },
  },
  {
    id: "split-pdf", name: "Split PDF", icon: Scissors, category: "Organize", color: "pink",
    desc: "Separate pages or extract the ones you need.",
    intro: "Split one PDF into several files. You get a ZIP with every part.",
    route: "/split-pdf", action: "Split PDF",
    files: onePdf({ field: "pdf" }),
    options: [
      { key: "mode", local: true, label: "Split method", type: "segmented", default: "individual",
        choices: [["individual", "Every page separately"], ["ranges", "Custom page ranges"]] },
      { key: "ranges", label: "Page ranges", type: "text", default: "", placeholder: "1-3, 5, 7-9", required: true,
        showIf: (v) => v.mode === "ranges", help: "Each range or page becomes its own PDF inside the ZIP." },
    ],
  },
  {
    id: "organize-pdf", name: "Organize PDF", icon: Layers, category: "Organize", color: "cyan",
    desc: "Reorder, rotate, duplicate or delete pages visually.",
    intro: "Drag pages to reorder them. Rotate, duplicate or delete any page, then save the new PDF.",
    route: "/organize-pdf", action: "Save organized PDF", files: onePdf(), grid: "organize",
  },
  {
    id: "remove-pages", name: "Remove pages", icon: Trash2, category: "Organize", color: "pink",
    desc: "Delete the pages you do not need.",
    intro: "Click the pages you want to delete. Marked pages are removed from the new PDF.",
    route: "/remove-pages", action: "Remove pages", files: onePdf(), grid: "select", gridVerb: "remove",
  },
  {
    id: "extract-pages", name: "Extract pages", icon: FileOutput, category: "Organize", color: "orange",
    desc: "Pull selected pages out into a new PDF.",
    intro: "Click the pages you want to keep. Only those pages go into the new PDF.",
    route: "/extract-pages", action: "Extract pages", files: onePdf(), grid: "select", gridVerb: "extract",
  },
  {
    id: "rotate-pdf", name: "Rotate PDF", icon: RotateCw, category: "Organize", color: "cyan", tag: "Popular",
    desc: "Fix page orientation in just a few clicks.",
    intro: "Rotate single pages with the buttons on each page, or rotate them all at once.",
    route: "/rotate-pdf", action: "Save rotated PDF", files: onePdf(), grid: "rotate",
  },
  {
    id: "reorder-pdf", name: "Reorder pages", icon: ArrowUpDown, category: "Organize", color: "violet",
    desc: "Drag pages into a new order.",
    intro: "Drag a page to a new position, or use the arrows. Every page is kept exactly once.",
    route: "/reorder-pdf", action: "Save new order", files: onePdf(), grid: "reorder",
  },

  /* ------------------------------ CONVERT ------------------------------ */
  {
    id: "jpg-to-pdf", name: "JPG to PDF", icon: Image, category: "Convert", color: "orange",
    desc: "Bundle JPG photos into one PDF.",
    intro: "Add your JPG images and put them in order. Each image becomes a page.",
    route: "/jpg-to-pdf", action: "Create PDF",
    files: { field: "files", accept: ".jpg,.jpeg", multiple: true, min: 1, max: 60, label: "JPG images", hint: "JPG / JPEG", reorder: true, image: true },
    options: [
      { key: "pageSize", label: "Page size", type: "select", default: "a4", choices: [["a4", "A4"], ["letter", "US Letter"], ["fit", "Same as the image"]] },
      { key: "orientation", label: "Orientation", type: "select", default: "auto", choices: [["auto", "Automatic"], ["portrait", "Portrait"], ["landscape", "Landscape"]], showIf: (v) => v.pageSize !== "fit" },
      { key: "margin", label: "Margin (points)", type: "number", default: 24, min: 0, max: 100 },
    ],
  },
  {
    id: "png-to-pdf", name: "PNG to PDF", icon: FileImage, category: "Convert", color: "orange",
    desc: "Turn PNG images into a PDF.",
    intro: "Add your PNG images and put them in order. Each image becomes a page.",
    route: "/png-to-pdf", action: "Create PDF",
    files: { field: "files", accept: ".png", multiple: true, min: 1, max: 60, label: "PNG images", hint: "PNG", reorder: true, image: true },
    options: [
      { key: "pageSize", label: "Page size", type: "select", default: "a4", choices: [["a4", "A4"], ["letter", "US Letter"], ["fit", "Same as the image"]] },
      { key: "orientation", label: "Orientation", type: "select", default: "auto", choices: [["auto", "Automatic"], ["portrait", "Portrait"], ["landscape", "Landscape"]], showIf: (v) => v.pageSize !== "fit" },
      { key: "margin", label: "Margin (points)", type: "number", default: 24, min: 0, max: 100 },
    ],
  },
  {
    id: "pdf-to-jpg", name: "PDF to JPG", icon: FileImage, category: "Convert", color: "orange", tag: "Popular",
    desc: "Turn PDF pages into high-quality images.",
    intro: "Every page is rendered as a JPG image. Several pages are delivered as a ZIP.",
    route: "/pdf-to-jpg", action: "Convert to JPG", files: onePdf(),
    options: [
      { key: "dpi", label: "Resolution", type: "select", default: "150", choices: [["72", "72 DPI (screen)"], ["150", "150 DPI (good)"], ["300", "300 DPI (print)"]] },
      { key: "quality", label: "JPG quality", type: "number", default: 85, min: 10, max: 100, help: "10 = smallest file, 100 = best quality." },
      pages("Pages to convert"),
    ],
  },
  {
    id: "pdf-to-png", name: "PDF to PNG", icon: FileImage, category: "Convert", color: "cyan",
    desc: "Render PDF pages as lossless PNG images.",
    intro: "Every page is rendered as a PNG image. Several pages are delivered as a ZIP.",
    route: "/pdf-to-png", action: "Convert to PNG", files: onePdf(),
    options: [
      { key: "dpi", label: "Resolution", type: "select", default: "150", choices: [["72", "72 DPI (screen)"], ["150", "150 DPI (good)"], ["300", "300 DPI (print)"]] },
      pages("Pages to convert"),
    ],
  },
  {
    id: "pdf-to-word", name: "PDF to Word", icon: FileType2, category: "Convert", color: "blue",
    desc: "Convert PDFs into editable Word documents.",
    intro: "Text is extracted and rebuilt as an editable .docx. Works best on text-based PDFs.",
    notes: "Complex layouts, images and scanned pages are not reproduced. For scans, run OCR first.",
    route: "/pdf-to-word", action: "Convert to Word", files: onePdf(),
  },
  {
    id: "word-to-pdf", name: "Word to PDF", icon: FileType2, category: "Convert", color: "blue",
    desc: "Turn Word documents into PDFs.",
    intro: "Upload a Word document and get a PDF.",
    route: "/word-to-pdf", action: "Convert to PDF", needs: "office",
    files: { field: "file", accept: ".docx,.doc,.odt,.rtf", multiple: false, label: "Word document", hint: ".docx, .doc, .odt, .rtf" },
  },
  {
    id: "pdf-to-excel", name: "PDF to Excel", icon: FileSpreadsheet, category: "Convert", color: "green",
    desc: "Extract tables into an Excel spreadsheet.",
    intro: "Text positions are analysed to rebuild rows and columns in a real .xlsx file.",
    notes: "Works on text-based PDFs with table-like layouts. Scanned PDFs need OCR first.",
    route: "/pdf-to-excel", action: "Convert to Excel", files: onePdf(),
    options: [
      { key: "layout", label: "Sheets", type: "select", default: "pages", choices: [["pages", "One sheet per page"], ["single", "All pages on one sheet"]] },
    ],
  },
  {
    id: "excel-to-pdf", name: "Excel to PDF", icon: FileSpreadsheet, category: "Convert", color: "green",
    desc: "Turn spreadsheets into PDFs.",
    intro: "Upload a spreadsheet and get a PDF.",
    route: "/excel-to-pdf", action: "Convert to PDF", needs: "office",
    files: { field: "file", accept: ".xlsx,.xls,.csv,.ods", multiple: false, label: "Spreadsheet", hint: ".xlsx, .xls, .csv, .ods" },
  },
  {
    id: "pdf-to-powerpoint", name: "PDF to PowerPoint", icon: Presentation, category: "Convert", color: "orange",
    desc: "Turn PDF pages into PowerPoint slides.",
    intro: "Choose between exact page images or editable text boxes.",
    route: "/pdf-to-powerpoint", action: "Convert to PowerPoint", files: onePdf(),
    options: [
      { key: "mode", label: "Slide content", type: "select", default: "image",
        choices: [["image", "Page images (looks exactly like the PDF)"], ["editable", "Editable text (simpler layout)"]] },
    ],
  },
  {
    id: "powerpoint-to-pdf", name: "PowerPoint to PDF", icon: Presentation, category: "Convert", color: "orange",
    desc: "Turn presentations into PDFs.",
    intro: "Upload a presentation and get a PDF with one page per slide.",
    route: "/powerpoint-to-pdf", action: "Convert to PDF", needs: "office-only",
    files: { field: "file", accept: ".pptx,.ppt,.odp", multiple: false, label: "Presentation", hint: ".pptx, .ppt, .odp" },
  },
  {
    id: "html-to-pdf", name: "HTML to PDF", icon: FileCode, category: "Convert", color: "violet",
    desc: "Turn HTML code or a .html file into a PDF.",
    intro: "Paste HTML or upload a .html file. Scripts and remote resources are blocked for safety.",
    route: "/html-to-pdf", action: "Create PDF", needs: "browser",
    files: { field: "file", accept: ".html,.htm", multiple: false, label: "HTML file", hint: "Optional: or paste HTML below", optional: true },
    options: [
      { key: "html", label: "HTML code", type: "textarea", default: "", placeholder: "<h1>Hello</h1>", showIf: (v, ctx) => !ctx.hasFiles },
      { key: "pageSize", label: "Page size", type: "select", default: "A4", choices: [["A4", "A4"], ["Letter", "US Letter"], ["Legal", "Legal"], ["A3", "A3"]] },
      { key: "orientation", label: "Orientation", type: "select", default: "portrait", choices: [["portrait", "Portrait"], ["landscape", "Landscape"]] },
      { key: "margin", label: "Margin (mm)", type: "number", default: 15, min: 0, max: 50 },
      { key: "background", label: "Print backgrounds", type: "toggle", default: true },
    ],
    validate: (v, ctx) => (!ctx.hasFiles && !String(v.html || "").trim() ? "Paste some HTML or upload an HTML file." : null),
  },
  {
    id: "ocr-pdf", name: "OCR PDF", icon: ScanText, category: "Convert", color: "violet", tag: "AI",
    desc: "Make scanned documents searchable.",
    intro: "Recognizes text in scanned PDFs. Get a searchable PDF or a plain text file.",
    notes: "OCR runs on the server and is limited to the first 30 pages per run. Clear, straight scans work best.",
    route: "/ocr-pdf", action: "Run OCR", files: onePdf(), ocr: true,
    options: [
      { key: "language", label: "Language", type: "select", default: "eng", choices: [["eng", "English"]], dynamic: "ocrLanguages" },
      { key: "output", label: "Output", type: "select", default: "pdf", choices: [["pdf", "Searchable PDF"], ["txt", "Text file (.txt)"]] },
      { key: "dpi", label: "Scan quality", type: "select", default: "200", choices: [["150", "Fast (150 DPI)"], ["200", "Balanced (200 DPI)"], ["300", "Best (300 DPI, slower)"]] },
      pages("Pages to read", "Example: 1-3, 5. Leave empty for the first 30 pages."),
    ],
  },

  /* ------------------------------ OPTIMIZE ------------------------------ */
  {
    id: "compress-pdf", name: "Compress PDF", icon: Minimize2, category: "Optimize", color: "blue", tag: "Popular",
    desc: "Reduce file size while keeping quality crisp.",
    intro: "Make the PDF smaller. You will see the size before and after.",
    route: "/compress-pdf", action: "Compress PDF", files: onePdf(),
    options: [
      { key: "mode", label: "Method", type: "segmented", default: "smart",
        choices: [["smart", "Smart (keeps text)"], ["rasterize", "Maximum (images only)"]],
        help: "Smart keeps text selectable and recompresses images. Maximum turns every page into an image: smallest file, but text can no longer be selected." },
      { key: "level", label: "Compression level", type: "segmented", default: "medium",
        choices: [["low", "Light"], ["medium", "Balanced"], ["high", "Strong"]] },
    ],
  },
  {
    id: "repair-pdf", name: "Repair PDF", icon: Wrench, category: "Optimize", color: "pink",
    desc: "Recover pages from a damaged PDF.",
    intro: "Rebuilds the PDF structure and keeps every page that can still be read.",
    notes: "Severely truncated files whose page data is gone cannot be recovered.",
    route: "/repair-pdf", action: "Repair PDF", files: onePdf(),
  },
  {
    id: "flatten-pdf", name: "Flatten PDF", icon: Layers2, category: "Optimize", color: "cyan",
    desc: "Turn form fields into fixed content.",
    intro: "Filled-in form fields become part of the page and can no longer be edited.",
    route: "/flatten-pdf", action: "Flatten PDF", files: onePdf(),
  },

  /* ------------------------------ SECURITY ------------------------------ */
  {
    id: "protect-pdf", name: "Protect PDF", icon: LockKeyhole, category: "Security", color: "green",
    desc: "Add a password to keep your documents private.",
    intro: "Encrypts the PDF with AES-256. Anyone opening it needs the password.",
    notes: "There is no password recovery. If you forget it, the file cannot be opened.",
    route: "/protect-pdf", action: "Protect PDF", files: onePdf(),
    options: [
      { key: "password", label: "Password", type: "password", default: "", required: true, placeholder: "At least 4 characters" },
      { key: "confirm", local: true, label: "Repeat password", type: "password", default: "", required: true },
      { key: "allowPrint", label: "Allow printing", type: "toggle", default: true },
      { key: "allowCopy", label: "Allow copying text", type: "toggle", default: true },
      { key: "allowModify", label: "Allow editing", type: "toggle", default: false },
    ],
    validate: (v) => (v.password !== v.confirm ? "The two passwords do not match." : null),
  },
  {
    id: "unlock-pdf", name: "Unlock PDF", icon: LockKeyholeOpen, category: "Security", color: "green",
    desc: "Remove the password from a PDF you own.",
    intro: "Enter the current password to save a copy that opens without one.",
    notes: "Pdf VERSE only unlocks files when you know the password. It never cracks or bypasses protection.",
    route: "/unlock-pdf", action: "Unlock PDF", files: onePdf(), preview: false,
    options: [{ key: "password", label: "Current password", type: "password", default: "", required: true }],
  },
  {
    id: "watermark-pdf", name: "Add watermark", icon: WandSparkles, category: "Security", color: "pink",
    desc: "Stamp your documents with custom text.",
    intro: "Add a text watermark to every page, or only the pages you choose.",
    route: "/watermark-pdf", action: "Add watermark", files: onePdf(),
    options: [
      { key: "text", label: "Watermark text", type: "text", default: "CONFIDENTIAL", required: true },
      { key: "fontSize", label: "Size", type: "number", default: 48, min: 8, max: 200 },
      { key: "opacity", label: "Opacity", type: "range", default: 0.25, min: 0.05, max: 1, step: 0.05 },
      { key: "rotation", label: "Rotation (degrees)", type: "number", default: 45, min: -180, max: 180 },
      { key: "position", label: "Position", type: "select", default: "center", choices: [...POSITIONS, ["tile", "Repeat across the page"]] },
      { key: "color", label: "Color", type: "color", default: "#808080" },
      { key: "bold", label: "Bold", type: "toggle", default: true },
      pages(),
    ],
  },
  {
    id: "remove-watermark", name: "Remove watermark", icon: Eraser, category: "Security", color: "cyan",
    desc: "Remove watermarks that are separate objects.",
    intro: "Removes stamp-style watermark annotations and, if you enter it, watermark text drawn on the pages.",
    notes: "This only works when the watermark is separate from the page content. Watermarks baked into images or flattened pages cannot be removed.",
    route: "/remove-watermark", action: "Remove watermark", files: onePdf(),
    options: [
      { key: "text", label: "Watermark text (optional)", type: "text", default: "", placeholder: "e.g. DRAFT", help: "Text to look for and remove from the page content." },
      { key: "annotations", label: "Remove watermark and stamp annotations", type: "toggle", default: true },
    ],
  },

  /* -------------------------------- EDIT -------------------------------- */
  {
    id: "page-numbers", name: "Add page numbers", icon: Hash, category: "Edit", color: "violet",
    desc: "Number the pages of your PDF.",
    intro: "Choose where the number goes, how it looks and which number to start at.",
    route: "/page-numbers", action: "Add page numbers", files: onePdf(),
    options: [
      { key: "format", label: "Format", type: "text", default: "{n}", help: "Use {n} for the page number and {total} for the page count. Example: Page {n} of {total}" },
      { key: "position", label: "Position", type: "select", default: "bottom-center", choices: POSITIONS },
      { key: "start", label: "Start at", type: "number", default: 1, min: 0 },
      { key: "fontSize", label: "Font size", type: "number", default: 11, min: 6, max: 48 },
      { key: "font", label: "Font", type: "select", default: "helvetica", choices: FONTS },
      { key: "color", label: "Color", type: "color", default: "#333333" },
      pages("Number these pages"),
    ],
  },
  {
    id: "add-text", name: "Add text", icon: Type, category: "Edit", color: "blue",
    desc: "Write text onto your PDF pages.",
    intro: "Place a text note, label or signature line on any pages.",
    notes: "Standard fonts only: Latin letters, numbers and common symbols.",
    route: "/add-text", action: "Add text", files: onePdf(),
    options: [
      { key: "text", label: "Text", type: "textarea", default: "", required: true, placeholder: "Type your text" },
      { key: "position", label: "Position", type: "select", default: "top-left", choices: POSITIONS },
      { key: "fontSize", label: "Font size", type: "number", default: 18, min: 6, max: 144 },
      { key: "font", label: "Font", type: "select", default: "helvetica", choices: FONTS },
      { key: "bold", label: "Bold", type: "toggle", default: false },
      { key: "color", label: "Color", type: "color", default: "#000000" },
      { key: "opacity", label: "Opacity", type: "range", default: 1, min: 0.1, max: 1, step: 0.05 },
      pages(),
    ],
  },
  {
    id: "add-image", name: "Add image", icon: ImagePlus, category: "Edit", color: "pink",
    desc: "Place a logo, stamp or signature on pages.",
    intro: "Upload the PDF, then the PNG or JPG image to place on it.",
    route: "/add-image", action: "Add image", files: onePdf(),
    extra: { field: "image", accept: ".png,.jpg,.jpeg", label: "Image (PNG or JPG)" },
    options: [
      { key: "position", label: "Position", type: "select", default: "bottom-right", choices: POSITIONS },
      { key: "width", label: "Image width (% of page)", type: "number", default: 30, min: 2, max: 100 },
      { key: "opacity", label: "Opacity", type: "range", default: 1, min: 0.1, max: 1, step: 0.05 },
      pages(),
    ],
  },
  {
    id: "crop-pdf", name: "Crop PDF", icon: Crop, category: "Edit", color: "orange",
    desc: "Trim margins from your pages.",
    intro: "Enter how much to cut from each edge. 72 points = 1 inch.",
    route: "/crop-pdf", action: "Crop PDF", files: onePdf(),
    options: [
      { key: "top", label: "Top (points)", type: "number", default: 0, min: 0 },
      { key: "bottom", label: "Bottom (points)", type: "number", default: 0, min: 0 },
      { key: "left", label: "Left (points)", type: "number", default: 0, min: 0 },
      { key: "right", label: "Right (points)", type: "number", default: 0, min: 0 },
      pages(),
    ],
    validate: (v) => (["top", "bottom", "left", "right"].every((k) => !Number(v[k])) ? "Enter a crop amount for at least one edge." : null),
  },
  {
    id: "edit-metadata", name: "Edit metadata", icon: FileCog, category: "Edit", color: "cyan",
    desc: "Change title, author, subject and keywords.",
    intro: "Update the document properties stored inside the PDF. Fields are prefilled from the file.",
    route: "/edit-metadata", action: "Save properties", files: onePdf(), prefillInfo: true,
    options: [
      { key: "title", label: "Title", type: "text", default: "" },
      { key: "author", label: "Author", type: "text", default: "" },
      { key: "subject", label: "Subject", type: "text", default: "" },
      { key: "keywords", label: "Keywords", type: "text", default: "", help: "Separate with commas." },
      { key: "creator", label: "Creator", type: "text", default: "" },
      { key: "producer", label: "Producer", type: "text", default: "" },
    ],
  },

  /* ----------------------------- UTILITIES ----------------------------- */
  {
    id: "pdf-to-zip", name: "PDF to ZIP", icon: Archive, category: "Utilities", color: "violet",
    desc: "Pack several PDFs into one ZIP archive.",
    intro: "Add the PDFs you want to bundle and download a single ZIP.",
    route: "/pdf-to-zip", action: "Create ZIP",
    files: { field: "files", accept: PDF, multiple: true, min: 1, max: 60, label: "PDF files", hint: "Add as many PDFs as you like", reorder: true },
  },
  {
    id: "compare-pdf", name: "Compare PDFs", icon: FileDiff, category: "Utilities", color: "blue",
    desc: "See what changed between two versions.",
    intro: "Add the original first and the revised version second. Text changes are listed page by page.",
    notes: "The comparison is text-based. Layout, images and colors are not compared.",
    route: "/compare-pdf", action: "Compare PDFs", result: "compare",
    files: { field: "files", accept: PDF, multiple: true, min: 2, max: 2, label: "Two PDF files", hint: "Original first, revised second", reorder: true },
  },
  {
    id: "page-count", name: "Page counter", icon: ListOrdered, category: "Utilities", color: "green",
    desc: "Count the pages of one or many PDFs.",
    intro: "Add PDFs to see how many pages each one has.",
    route: "/page-count", action: "Count pages", result: "count",
    files: { field: "files", accept: PDF, multiple: true, min: 1, max: 60, label: "PDF files", hint: "Add as many PDFs as you like" },
  },
  {
    id: "pdf-info", name: "PDF information", icon: Info, category: "Utilities", color: "pink",
    desc: "Inspect size, pages, metadata and more.",
    intro: "See everything stored in a PDF: pages, page sizes, version, encryption and properties.",
    route: "/pdf-info", action: "Show information", result: "info", files: onePdf(),
  },
];

export const categories = ["All tools", "Organize", "Convert", "Optimize", "Edit", "Security", "Utilities"];
export const toolById = Object.fromEntries(tools.map((t) => [t.id, t]));
