import { useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import JSZip from 'jszip'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { saveAs } from 'file-saver'
import { downloadBytes, downloadBlob, getBaseName, formatBytes } from '../../utils/fileUtils'
import PageThumbnailGrid from '../PageThumbnailGrid'

// ---- Image → PDF ----
function ImageToPDF() {
  const [images, setImages] = useState([])
  const [layout, setLayout] = useState('one-per-page') // 'one-per-page' | 'all-on-one'
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState(null)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] },
    onDrop: (accepted) => setImages(prev => [...prev, ...accepted]),
    multiple: true,
  })

  const handleConvert = async () => {
    if (!images.length) return
    setError(null)
    setConverting(true)
    try {
      const pdfDoc = await PDFDocument.create()

      for (const imgFile of images) {
        const arrayBuffer = await imgFile.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let img
        const mime = imgFile.type
        if (mime === 'image/png') {
          img = await pdfDoc.embedPng(bytes)
        } else {
          img = await pdfDoc.embedJpg(bytes)
        }

        if (layout === 'one-per-page') {
          const page = pdfDoc.addPage([img.width, img.height])
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
        } else {
          // All on one — add them to a running page
          // For simplicity: each image gets its own height on one long page
        }
      }

      if (layout === 'all-on-one') {
        // Create one tall page
        const totalHeight = await images.reduce(async (accP, imgFile) => {
          const acc = await accP
          const ab = await imgFile.arrayBuffer()
          const bytes = new Uint8Array(ab)
          let img
          if (imgFile.type === 'image/png') img = await pdfDoc.embedPng(bytes)
          else img = await pdfDoc.embedJpg(bytes)
          return acc + img.height
        }, Promise.resolve(0))

        const maxWidth = 612
        const page = pdfDoc.addPage([maxWidth, totalHeight])
        let y = totalHeight
        for (const imgFile of images) {
          const ab = await imgFile.arrayBuffer()
          const bytes = new Uint8Array(ab)
          let img
          if (imgFile.type === 'image/png') img = await pdfDoc.embedPng(bytes)
          else img = await pdfDoc.embedJpg(bytes)
          const scale = maxWidth / img.width
          const h = img.height * scale
          y -= h
          page.drawImage(img, { x: 0, y, width: maxWidth, height: h })
        }
        // Remove the per-page pages we accidentally added above
        // Actually let's rebuild properly
        const fixed = await PDFDocument.create()
        const totalH2 = await Promise.all(images.map(async f => {
          const ab = await f.arrayBuffer()
          const b = new Uint8Array(ab)
          const im = f.type === 'image/png' ? await fixed.embedPng(b) : await fixed.embedJpg(b)
          return { img: im, w: im.width, h: im.height }
        }))
        const maxW = 612
        const totalH = totalH2.reduce((s, { w, h }) => s + h * (maxW / w), 0)
        const pg = fixed.addPage([maxW, totalH])
        let curY = totalH
        for (const { img, w, h } of totalH2) {
          const scale = maxW / w
          const scaledH = h * scale
          curY -= scaledH
          pg.drawImage(img, { x: 0, y: curY, width: maxW, height: scaledH })
        }
        const outBytes = await fixed.save()
        downloadBytes(outBytes, 'images_combined.pdf')
        return
      }

      const outBytes = await pdfDoc.save()
      downloadBytes(outBytes, 'images_to_pdf.pdf')
    } catch (err) {
      setError('Conversion failed: ' + err.message)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700">Images to PDF</h3>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-gray-500 text-sm">Drop images here (JPG, PNG, WebP)</p>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={URL.createObjectURL(img)}
                alt={img.name}
                className="w-full h-20 object-cover rounded-lg border border-gray-200"
              />
              <button
                onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4">
        {[
          { value: 'one-per-page', label: 'One image per page' },
          { value: 'all-on-one', label: 'All on one page' },
        ].map(opt => (
          <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
            <input type="radio" name="imgLayout" value={opt.value} checked={layout === opt.value} onChange={() => setLayout(opt.value)} className="accent-blue-600" />
            {opt.label}
          </label>
        ))}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleConvert}
        disabled={converting || !images.length}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-xl transition-colors"
      >
        {converting ? 'Converting...' : 'Convert to PDF'}
      </button>
    </div>
  )
}

// ---- PDF → Images ----
function PDFToImages({ pdfFile: globalFile, pdfDoc: globalDoc, pageCount: globalPageCount, onOpenFile }) {
  const [localFile, setLocalFile] = useState(null)
  const [localDoc, setLocalDoc] = useState(null)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState(null)

  const pdfFile = localFile || globalFile
  const pdfDoc = localDoc || globalDoc
  const pageCount = localDoc ? localDoc.numPages : (globalPageCount || 0)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: async ([file]) => {
      if (!file) return
      setError(null)
      try {
        onOpenFile(file)
        setLocalFile(null)
        setLocalDoc(null)
      } catch (err) {
        setError(err.message)
      }
    },
    multiple: false,
  })

  const handleConvert = async () => {
    if (!pdfDoc) return
    setError(null)
    setConverting(true)
    try {
      const baseName = getBaseName(pdfFile.name)
      const zip = pageCount > 1 ? new JSZip() : null

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))

        if (pageCount === 1) {
          downloadBlob(blob, `${baseName}_page1.png`)
        } else {
          const arr = await blob.arrayBuffer()
          zip.file(`${baseName}_page${i}.png`, arr)
        }
      }

      if (pageCount > 1) {
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        downloadBlob(zipBlob, `${baseName}_pages.zip`)
      }
    } catch (err) {
      setError('Conversion failed: ' + err.message)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700">PDF to Images</h3>

      {!pdfFile ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-gray-500 text-sm">Drop a PDF file here to convert to PNG images</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-700 text-sm">{pdfFile.name}</p>
            <p className="text-xs text-gray-400">{pageCount} pages · {formatBytes(pdfFile.size)}</p>
            {!localFile && <p className="text-xs text-blue-500 mt-0.5">Using globally loaded file</p>}
          </div>
          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <span className="text-xs text-blue-500 hover:text-blue-700 underline">Change</span>
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleConvert}
        disabled={converting || !pdfFile}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-xl transition-colors"
      >
        {converting ? 'Converting...' : pageCount > 1 ? 'Download All as ZIP' : 'Download PNG'}
      </button>
    </div>
  )
}

// ---- Text/HTML → PDF ----
function TextToPDF() {
  const [text, setText] = useState('')
  const [fontSize, setFontSize] = useState(12)
  const [fontFamily, setFontFamily] = useState('Helvetica')
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState(null)

  const FONTS = ['Helvetica', 'TimesRoman', 'Courier']

  const handleConvert = async () => {
    if (!text.trim()) return
    setError(null)
    setConverting(true)
    try {
      const pdfDoc = await PDFDocument.create()
      const fontMap = {
        Helvetica: StandardFonts.Helvetica,
        TimesRoman: StandardFonts.TimesRoman,
        Courier: StandardFonts.Courier,
      }
      const font = await pdfDoc.embedFont(fontMap[fontFamily] || StandardFonts.Helvetica)

      const pageWidth = 595
      const pageHeight = 842
      const margin = 50
      const lineHeight = fontSize * 1.5
      const maxWidth = pageWidth - margin * 2

      const lines = []
      for (const rawLine of text.split('\n')) {
        // Word wrap
        const words = rawLine.split(' ')
        let current = ''
        for (const word of words) {
          const test = current ? current + ' ' + word : word
          const width = font.widthOfTextAtSize(test, fontSize)
          if (width > maxWidth && current) {
            lines.push(current)
            current = word
          } else {
            current = test
          }
        }
        lines.push(current)
      }

      let page = pdfDoc.addPage([pageWidth, pageHeight])
      let y = pageHeight - margin

      for (const line of lines) {
        if (y - lineHeight < margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight])
          y = pageHeight - margin
        }
        page.drawText(line, { x: margin, y, font, size: fontSize, color: rgb(0, 0, 0) })
        y -= lineHeight
      }

      const outBytes = await pdfDoc.save()
      downloadBytes(outBytes, 'text_to_pdf.pdf')
    } catch (err) {
      setError('Conversion failed: ' + err.message)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700">Text to PDF</h3>

      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Font</label>
          <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm">
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Size</label>
          <input type="number" min={6} max={72} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-16 px-2 py-1 border border-gray-300 rounded text-sm" />
        </div>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste or type your text here..."
        rows={10}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        onClick={handleConvert}
        disabled={converting || !text.trim()}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-xl transition-colors"
      >
        {converting ? 'Creating PDF...' : 'Create PDF'}
      </button>
    </div>
  )
}

// ---- PDF → Text extraction ----
// Processes pages in batches of 5, yields to browser between batches.
// onProgress(current, total) called after each page.
// cancelRef.current = true stops the loop early.
// Returns { pageNum, text }[]
async function extractTextFromPDF(arrayBuffer, selectedPages, onProgress, cancelRef) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) })
  const pdf = await loadingTask.promise
  const totalPages = pdf.numPages
  const pagesToExtract = selectedPages && selectedPages.length > 0
    ? selectedPages
    : Array.from({ length: totalPages }, (_, i) => i + 1)

  const BATCH_SIZE = 5
  const results = []

  for (let i = 0; i < pagesToExtract.length; i += BATCH_SIZE) {
    if (cancelRef && cancelRef.current) break

    const batchEnd = Math.min(i + BATCH_SIZE, pagesToExtract.length)
    for (let j = i; j < batchEnd; j++) {
      if (cancelRef && cancelRef.current) break
      const pageNum = pagesToExtract[j]
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const items = textContent.items
      let pageText = ''
      for (let k = 0; k < items.length; k++) {
        pageText += items[k].str + ' '
      }
      results.push({ pageNum: pageNum, text: pageText.trim() })
      if (onProgress) onProgress(j + 1, pagesToExtract.length)
    }

    // Yield to browser after each batch
    await new Promise(function(resolve) { setTimeout(resolve, 0) })
  }

  return results
}

// ---- PDF → Text ----
function PDFToText({ pdfFile: globalFile, pdfDoc: globalDoc, pageCount: globalPageCount, onOpenFile }) {
  const [localFile, setLocalFile] = useState(null)
  const [localDoc, setLocalDoc] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState(null) // { current, total }
  const [error, setError] = useState(null)
  const [pageTexts, setPageTexts] = useState([]) // { pageNum, text }[]
  const [selectedPages, setSelectedPages] = useState([])
  const cancelRef = useRef(false)
  const lastDocRef = useRef(null)

  const pdfFile = localFile || globalFile
  const pdfDoc = localDoc || globalDoc
  const pageCount = localDoc ? localDoc.numPages : (globalPageCount || 0)

  // Reset and pre-select all pages when doc changes
  useEffect(function() {
    if (pdfDoc && pdfDoc !== lastDocRef.current) {
      lastDocRef.current = pdfDoc
      setPageTexts([])
      setError(null)
      var all = []
      for (var i = 1; i <= pdfDoc.numPages; i++) all.push(i)
      setSelectedPages(all)
    }
  }, [pdfDoc])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: async function(files) {
      var file = files[0]
      if (!file) return
      setError(null)
      setPageTexts([])
      try {
        onOpenFile(file)
        setLocalFile(null)
        setLocalDoc(null)
      } catch (err) {
        setError(err.message)
      }
    },
    multiple: false,
  })

  const handleExtract = async function() {
    if (!pdfFile) return
    setError(null)
    setExtracting(true)
    setPageTexts([])
    cancelRef.current = false
    var total = selectedPages.length > 0 ? selectedPages.length : pageCount
    setExtractProgress({ current: 0, total: total })

    try {
      var arrayBuffer = await pdfFile.arrayBuffer()
      console.log('[PDFToText] ArrayBuffer ready, byteLength:', arrayBuffer.byteLength)

      var texts = await extractTextFromPDF(
        arrayBuffer,
        selectedPages,
        function(current, total) { setExtractProgress({ current: current, total: total }) },
        cancelRef
      )

      if (cancelRef.current) {
        setError('Extraction cancelled.')
        return
      }

      var totalChars = 0
      for (var i = 0; i < texts.length; i++) totalChars += texts[i].text.length
      if (totalChars === 0) throw new Error('SCANNED')

      setPageTexts(texts)
    } catch (err) {
      console.error('[PDFToText] Extraction error:', err)
      if (err.message === 'SCANNED') {
        setError('This PDF appears to be scanned. No text could be extracted.')
      } else {
        setError('Extraction failed: ' + err.message)
      }
    } finally {
      setExtracting(false)
      setExtractProgress(null)
    }
  }

  const handleCancel = function() { cancelRef.current = true }

  const handleDownloadTxt = function() {
    var lines = []
    for (var i = 0; i < pageTexts.length; i++) {
      lines.push('--- Page ' + pageTexts[i].pageNum + ' ---\n\n' + pageTexts[i].text)
    }
    saveAs(new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' }), getBaseName(pdfFile.name) + '_extracted.txt')
  }

  const handleDownloadDocx = async function() {
    try {
      var children = [
        new Paragraph({ text: 'Extracted Text — ' + pdfFile.name, heading: HeadingLevel.HEADING_1 }),
      ]
      for (var i = 0; i < pageTexts.length; i++) {
        children.push(new Paragraph({ text: 'Page ' + pageTexts[i].pageNum, heading: HeadingLevel.HEADING_2 }))
        children.push(new Paragraph({ children: [new TextRun(pageTexts[i].text)] }))
        children.push(new Paragraph({ text: '' }))
      }
      var doc = new Document({ sections: [{ children: children }] })
      var blob = await Packer.toBlob(doc)
      saveAs(blob, getBaseName(pdfFile.name) + '_extracted.docx')
    } catch (err) {
      setError('Failed to create Word document: ' + err.message)
    }
  }

  // Preview text (built only after extraction)
  var previewText = ''
  for (var i = 0; i < pageTexts.length; i++) {
    previewText += '--- Page ' + pageTexts[i].pageNum + ' ---\n\n' + pageTexts[i].text + '\n\n'
  }
  previewText = previewText.trim()
  var wordCount = previewText.split(/\s+/).filter(Boolean).length

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700">PDF to Text</h3>

      {/* File info */}
      {!pdfFile ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-gray-500 text-sm">Drop a PDF file here to extract text</p>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            </svg>
            <div>
              <p className="font-medium text-gray-700 text-sm">{pdfFile.name}</p>
              <p className="text-xs text-gray-400">{pageCount} page{pageCount !== 1 ? 's' : ''} · {formatBytes(pdfFile.size)}</p>
              {!localFile && <p className="text-xs text-blue-500 mt-0.5">Using globally loaded file</p>}
            </div>
          </div>
          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <span className="text-xs text-blue-500 hover:text-blue-700 underline">Change</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Page thumbnail grid — shown when no extraction in progress and no results yet */}
      {pdfFile && pdfDoc && !extracting && pageTexts.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Select pages to extract</p>
          <PageThumbnailGrid
            pdfDoc={pdfDoc}
            selectedPages={selectedPages}
            onChange={setSelectedPages}
          />
        </div>
      )}

      {/* Progress bar + cancel — shown during extraction */}
      {extracting && extractProgress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Extracting… page {extractProgress.current} of {extractProgress.total}</span>
            <button onClick={handleCancel} className="text-red-500 hover:text-red-700 font-medium">
              Cancel
            </button>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: extractProgress.total > 0 ? (extractProgress.current / extractProgress.total * 100) + '%' : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Extract button — hidden once results are shown */}
      {pageTexts.length === 0 && (
        <button
          onClick={handleExtract}
          disabled={extracting || !pdfFile || selectedPages.length === 0}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {extracting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Extracting…
            </>
          ) : selectedPages.length === 0 ? 'Select at least one page' : 'Extract Text'}
        </button>
      )}

      {/* Results — only shown after extraction is fully complete */}
      {!extracting && pageTexts.length > 0 && (
        <div className="space-y-3">
          <textarea
            readOnly
            value={previewText}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 resize-none"
            style={{ height: 300, overflowY: 'scroll' }}
          />
          <p className="text-xs text-gray-400 text-right">
            {previewText.length.toLocaleString()} characters · {wordCount.toLocaleString()} words
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleDownloadDocx}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download as Word (.docx)
            </button>
            <button
              onClick={handleDownloadTxt}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download as Text (.txt)
            </button>
          </div>

          <button
            onClick={function() { setPageTexts([]) }}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            ← Extract different pages
          </button>
        </div>
      )}
    </div>
  )
}

// ---- Main Convert component ----
export default function Convert({ pdfFile, pdfDoc, pageCount, onOpenFile }) {
  const [tab, setTab] = useState('img-to-pdf')
  const fileProps = { pdfFile, pdfDoc, pageCount, onOpenFile }

  const tabs = [
    { id: 'img-to-pdf', label: 'Images → PDF' },
    { id: 'pdf-to-img', label: 'PDF → Images' },
    { id: 'text-to-pdf', label: 'Text → PDF' },
    { id: 'pdf-to-text', label: 'PDF → Text' },
  ]

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Convert</h2>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        {tab === 'img-to-pdf' && <ImageToPDF />}
        {tab === 'pdf-to-img' && <PDFToImages {...fileProps} />}
        {tab === 'text-to-pdf' && <TextToPDF />}
        {tab === 'pdf-to-text' && <PDFToText {...fileProps} />}
      </div>
    </div>
  )
}
