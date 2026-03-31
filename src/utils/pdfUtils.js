import * as pdfjsLib from 'pdfjs-dist'

// Use CDN URL matching the exact installed pdfjs-dist version for the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export { pdfjsLib }

export async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let pdfDoc
  try {
    const loadingTask = pdfjsLib.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false })
    pdfDoc = await loadingTask.promise
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
  const renderTask = page.render({ canvasContext: ctx, viewport: viewport })
  await renderTask.promise
  return { width: viewport.width, height: viewport.height }
}

export function validateFile(file) {
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Please upload a valid PDF file.')
  }
  if (file.size > 50 * 1024 * 1024) {
    console.warn('[validateFile] File is larger than 50MB, processing may be slow.')
  }
}
