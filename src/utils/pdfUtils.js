import * as pdfjsLib from 'pdfjs-dist'
// Use Vite's ?url suffix to get the resolved path to the worker .mjs file
// This is required for pdfjs-dist v4+ which ships only .mjs workers
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
console.log('[pdfUtils] pdf.js version:', pdfjsLib.version)
console.log('[pdfUtils] workerSrc set to:', pdfjsWorkerUrl)

export { pdfjsLib }

export async function loadPDF(file) {
  console.log('[loadPDF] Starting load for file:', file.name, 'size:', file.size)

  console.log('[loadPDF] Reading ArrayBuffer...')
  const arrayBuffer = await file.arrayBuffer()
  console.log('[loadPDF] ArrayBuffer ready, byteLength:', arrayBuffer.byteLength)

  const bytes = new Uint8Array(arrayBuffer)

  console.log('[loadPDF] Calling pdfjsLib.getDocument...')
  let pdfDoc
  try {
    const loadingTask = pdfjsLib.getDocument({ data: bytes })
    pdfDoc = await loadingTask.promise
    console.log('[loadPDF] PDF loaded successfully, numPages:', pdfDoc.numPages)
  } catch (err) {
    console.error('[loadPDF] getDocument failed:', err)
    if (err.name === 'PasswordException') {
      throw new Error('This PDF is password-protected. Please remove the password and try again.')
    }
    throw new Error(`Failed to load PDF: ${err.message}`)
  }

  return { pdfDoc, bytes }
}

export async function renderPageToCanvas(pdfDoc, pageNum, canvas, scale = 1.5) {
  console.log(`[renderPageToCanvas] Rendering page ${pageNum} at scale ${scale}`)
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  const renderTask = page.render({ canvasContext: ctx, viewport })
  await renderTask.promise
  console.log(`[renderPageToCanvas] Page ${pageNum} done — ${viewport.width}x${viewport.height}`)
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
