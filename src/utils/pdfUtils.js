import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Use the local bundled worker URL — required for pdfjs-dist v5 which ships only .mjs workers.
// The CDN does not carry v5, so using a CDN URL causes a 404 and breaks loading entirely.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
console.log('[pdfUtils] pdfjs version:', pdfjsLib.version, '— worker:', pdfjsWorkerUrl)

export { pdfjsLib }

/**
 * Load a PDF File object with pdfjs-dist.
 * Returns { pdfDoc, bytes } where bytes is the Uint8Array used to load the doc.
 */
export async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let pdfDoc
  try {
    // Use arrayBuffer.slice(0) to clone — pdfjs may neuter the underlying buffer
    const loadingTask = pdfjsLib.getDocument({
      data: bytes.slice(0),
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    pdfDoc = await loadingTask.promise
    console.log('[loadPDF]', file.name, '— pages:', pdfDoc.numPages)
  } catch (err) {
    if (err.name === 'PasswordException') {
      throw new Error('This PDF is password-protected. Please remove the password and try again.')
    }
    throw new Error('Failed to load PDF: ' + err.message)
  }
  return { pdfDoc, bytes }
}

export async function renderPageToCanvas(pdfDoc, pageNum, canvas, scale) {
  if (scale === undefined) scale = 1.5
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: scale })
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport: viewport }).promise
  return { width: viewport.width, height: viewport.height }
}

export function validateFile(file) {
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Please upload a valid PDF file.')
  }
}
