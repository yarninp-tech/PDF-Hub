# PDF HUB

A browser-based PDF editor built with React + Vite. All processing happens client-side — no backend required.

## Features

- **Merge & Split** — Combine multiple PDFs into one, or split a PDF into individual pages or custom ranges
- **Annotate** — Highlight, draw, add text labels, sticky notes, and rectangles; bake annotations into a downloadable PDF
- **Fill Form** — Detect and fill PDF form fields (text, checkboxes, dropdowns) with a live overlay; download filled PDF
- **Convert** — Images → PDF, PDF → PNG images, Text → PDF

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [pdf-lib](https://pdf-lib.js.org/) — PDF creation and manipulation
- [pdfjs-dist](https://mozilla.github.io/pdf.js/) — PDF rendering in canvas
- [react-dropzone](https://react-dropzone.js.org/) — Drag & drop file upload
- [JSZip](https://stuk.github.io/jszip/) — Multi-file ZIP downloads
- [file-saver](https://github.com/eligrey/FileSaver.js/) — File download utility
- [Tailwind CSS](https://tailwindcss.com/) — Styling

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
```

Output is in the `dist/` folder.

## Deploy to Netlify via GitHub

1. Push this project to a GitHub repository (see instructions below)
2. Go to [app.netlify.com](https://app.netlify.com) and click **Add new site → Import an existing project**
3. Connect your GitHub account and select the repository
4. Netlify will auto-detect the settings from `netlify.toml`:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Click **Deploy site**

Every push to `main` will trigger an automatic redeploy.

## GitHub Setup

```bash
# Inside the pdf-hub directory:
git init
git add .
git commit -m "Initial commit: PDF HUB app"

# Create a repo on GitHub (via gh CLI or github.com), then:
git remote add origin https://github.com/YOUR_USERNAME/pdf-hub.git
git branch -M main
git push -u origin main
```
