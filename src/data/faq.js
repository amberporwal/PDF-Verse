export const faq = [
  {
    q: "Are my files safe?",
    a: "Your file is sent to the Pdf VERSE server only to be processed. It is handled in memory, never saved permanently and never shared. The few conversions that need a temporary file (Word, Excel, PowerPoint and HTML to PDF) delete it as soon as the result is ready. When you run Pdf VERSE on your own computer, the server is your own computer.",
  },
  {
    q: "Why are some conversions simplified?",
    a: "PDF is a fixed-layout format. PDF to Word, Excel and PowerPoint rebuild editable content from the text found in the PDF, so complex layouts, images and scanned pages will not match exactly. Running OCR first helps with scans. PowerPoint to PDF, and the best Word and Excel to PDF results, use LibreOffice when it is installed.",
  },
  {
    q: "Can Pdf VERSE unlock any PDF?",
    a: "No. Unlock PDF removes a password only when you enter the correct one. It does not guess, crack or bypass protection on files you do not have access to.",
  },
  {
    q: "Can every watermark be removed?",
    a: "Only watermarks that are separate from the page content, such as stamp annotations or text added as its own element. Watermarks baked into images or flattened pages cannot be removed without damaging the page.",
  },
  {
    q: "How does OCR work, and which languages are supported?",
    a: "OCR looks at each page as an image and recognizes the letters. English and Hindi are included. Results are best on clear, straight scans at 200 to 300 DPI. Each run reads up to 30 pages.",
  },
  {
    q: "What are the file size limits?",
    a: "Each file can be up to 50 MB. Merge accepts up to 20 PDFs at once, and the image and ZIP tools accept up to 60 files.",
  },
  {
    q: "What happens if my PDF is damaged or encrypted?",
    a: "Pdf VERSE tells you instead of failing quietly. Damaged files can be tried with Repair PDF, and password-protected files must be unlocked with their password first.",
  },
];
