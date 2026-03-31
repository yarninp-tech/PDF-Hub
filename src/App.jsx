import { useState, useRef, useCallback } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ToolPanel from './components/ToolPanel'
import PDFViewer from './components/PDFViewer'
import { pdfjsLib } from './utils/pdfUtils'
import { formatBytes } from './utils/fileUtils'

export default function App() {
  const [activeTool, setActiveTool] = useState('merge')
  const [showViewer, setShowViewer] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // loadedFile: { name, size, arrayBuffer } — set immediately on file pick, no pdfjs needed
  const [loadedFile, setLoadedFile] = useState(null)
  // pdfDoc / pageCount — set after pdfjs parses the arrayBuffer
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fileInputRef = useRef(null)

  // ─── Core file loader ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a valid PDF file.')
      return
    }

    // Reset everything and show file name immediately
    setError(null)
    setLoading(true)
    setLoadedFile(null)
    setPdfDoc(null)
    setPageCount(0)
    setShowViewer(false)

    try {
      // Step 1: read as ArrayBuffer — fast, no pdfjs involved
      const arrayBuffer = await file.arrayBuffer()
      console.log('File loaded:', file.name, arrayBuffer.byteLength, 'bytes')

      // Store immediately so filename/size show up in the UI right away
      setLoadedFile({ name: file.name, size: file.size, arrayBuffer })

      // Step 2: parse with pdfjs using a clone of the buffer (pdfjs may neuter the original)
      console.log('Parsing PDF with pdfjs...')
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer.slice(0),
        useWorkerFetch: false,
        isEvalSupported: false,
      })
      const doc = await loadingTask.promise
      console.log('PDF parsed:', doc.numPages, 'pages')
      setPdfDoc(doc)
      setPageCount(doc.numPages)
    } catch (err) {
      console.error('File load error:', err)
      setError('Failed to load PDF: ' + err.message)
      setLoadedFile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleClose = useCallback(() => {
    setLoadedFile(null)
    setPdfDoc(null)
    setPageCount(0)
    setError(null)
    setShowViewer(false)
  }, [])

  // ─── pdfFile compat shim ─────────────────────────────────────────────────────
  // Looks enough like a File object that all child tools work unchanged:
  //   pdfFile.name, .size — from loadedFile
  //   pdfFile.arrayBuffer() — returns a fresh clone each call (method, returns Promise)
  const pdfFile = loadedFile
    ? {
        name: loadedFile.name,
        size: loadedFile.size,
        type: 'application/pdf',
        arrayBuffer: () => Promise.resolve(loadedFile.arrayBuffer.slice(0)),
      }
    : null

  // ─── Drag-and-drop handlers (on the outer app shell) ────────────────────────
  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }
  const onDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear when leaving the outermost element
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false)
  }
  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const noFile = !loadedFile && !loading

  return (
    <div
      className="flex flex-col h-screen bg-gray-50 overflow-hidden relative"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ── Hidden native file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files[0]
          if (f) handleFile(f)
          e.target.value = ''   // reset so the same file can be re-selected
        }}
      />

      {/* ── Full-screen drag-over overlay ── */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-4 border-blue-400 border-dashed flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl text-center">
            <svg className="w-14 h-14 text-blue-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-blue-600 font-bold text-xl">Drop PDF to open</p>
          </div>
        </div>
      )}

      <Header
        pdfFile={pdfFile}
        onClose={handleClose}
        onClickOpen={() => fileInputRef.current && fileInputRef.current.click()}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTool={activeTool} onToolChange={setActiveTool} />

        <main className="flex-1 flex flex-col overflow-hidden">

          {/* ── File info bar (shows immediately when file is set) ── */}
          {pdfFile && (
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-shrink-0">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
              </svg>
              <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{pdfFile.name}</span>
              <span className="text-gray-300">·</span>
              {loading ? (
                <span className="text-sm text-blue-500 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Parsing…
                </span>
              ) : (
                <>
                  <span className="text-sm text-gray-400">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-sm text-gray-400">{formatBytes(pdfFile.size)}</span>
                  {pdfDoc && (
                    <button
                      onClick={() => setShowViewer(v => !v)}
                      className={`ml-auto px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        showViewer ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      {showViewer ? 'Hide Preview' : 'Preview PDF'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Error banner ── */}
          {error && (
            <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex-shrink-0 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
            </div>
          )}

          {/* ── Landing page — shown when no file is loaded ── */}
          {noFile && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-sm w-full">
                <div
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  className="border-2 border-dashed border-gray-300 rounded-2xl p-14 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                >
                  <svg className="w-16 h-16 text-gray-300 group-hover:text-blue-400 mx-auto mb-4 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-600 font-semibold text-lg">Open a PDF to get started</p>
                  <p className="text-gray-400 text-sm mt-1">Drag & drop anywhere, or click to browse</p>
                  <div className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Browse files
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ToolPanel + Viewer ── */}
          {/* Kept mounted even during loading so sub-tab state is preserved across file changes */}
          <div className={`flex-1 overflow-hidden flex ${noFile ? 'hidden' : ''}`}>
            <div className={`flex flex-col ${showViewer && pdfDoc ? 'w-1/2' : 'flex-1'} overflow-auto`}>
              <ToolPanel
                activeTool={activeTool}
                pdfFile={pdfFile}
                pdfDoc={pdfDoc}
                pageCount={pageCount}
                onOpenFile={handleFile}
              />
            </div>

            {showViewer && pdfDoc && (
              <div className="w-1/2 border-l border-gray-200 flex flex-col">
                <PDFViewer pdfDoc={pdfDoc} pageCount={pageCount} />
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  )
}
