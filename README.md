# Pdf VERSE

PDF tools website: React + Vite frontend, Express backend. 35 tools, all wired to real processing.

## Run it

```bash
npm install
cp .env.example .env      # optional, defaults work
npm run dev               # frontend http://localhost:5173, backend http://localhost:5000
```

Production: `npm run build`, then `npm start` serves the site and the API together on port 5000.

Requirements: Node.js 22 or newer (tested on 22.23). Some dependencies declare Node 22 as their minimum, so older versions may print engine warnings or fail. Check with `node -v`.

Optional programs on the computer that runs the server (the site tells the user when they are missing):

| Program | Used by | Without it |
| --- | --- | --- |
| LibreOffice | Word, Excel, PowerPoint to PDF | Word to PDF (.docx) and Excel to PDF (.xlsx, .csv) use a simpler built-in converter. PowerPoint to PDF is unavailable. |
| Microsoft Edge or Google Chrome | HTML to PDF | HTML to PDF is unavailable. Set `CHROME_PATH` in `.env` if it is not found. |

## Project layout

```
server/
  index.js            app setup (cors, /api, static dist)
  config.js           port, limits, paths
  routes/index.js     every endpoint and its upload field names
  controllers/        organize, convert, optimize, security, edit, utilities
  middleware/upload.js  multer (memory storage, 50 MB per file)
  utils/              pdf-lib helpers, pdf.js text/render, office + browser converters, errors
  tessdata/           OCR language data (English, Hindi)
src/
  App.jsx             homepage, search, favorites, history, FAQ
  data/tools.js       one entry per tool: upload rules, options, route (add a tool here + a route)
  components/         ToolModal, FileDrop, FileList, OptionsForm, PageGrid, ResultPanel
  lib/                api (upload progress), pdf.js previews, local storage, formatting
test/api.test.mjs     68 end-to-end API tests
```

`POST /api/merge-pdf` (field `pdfs`) and `POST /api/split-pdf` (field `pdf`, optional `ranges`) keep the original URLs and field names.

## Deploy

Step-by-step Netlify + Render guide (Hinglish): see [DEPLOY.md](DEPLOY.md).

## Tests

Start the backend, then in another terminal:

```bash
npm test
```

Every test sends a real file to a real route and inspects the real output (page counts, ZIP contents, encryption, extracted text).

## Known limits

- PDF to Word, Excel and PowerPoint rebuild content from the text in the PDF. Complex layouts and images are not reproduced exactly. Scanned PDFs need OCR first.
- Remove watermark works only on watermarks that are separate elements (annotations or separate text). It cannot remove watermarks baked into images.
- Unlock PDF needs the correct password. It never guesses or bypasses protection.
- OCR reads up to 30 pages per run. English and Hindi data are included.
- Files are held in memory while processed and are not stored. Word, Excel, PowerPoint and HTML conversions use a temporary file that is deleted right after.
