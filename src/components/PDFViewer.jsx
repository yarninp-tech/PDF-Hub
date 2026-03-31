import { useEffect, useRef, useState, useCallback } from 'react'
import { renderPageToCanvas } from '../utils/pdfUtils'

export default function PDFViewer({ pdfDoc, pageCount }) {
  const [scale, setScale] = useState(1.2)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [jumpTo, setJumpTo] = useState('')
  // canvasRefs is a stable object; we index by pageNum (1-based)
  const canvasRefs = useRef({})
  const containerRef = useRef(null)
  // Track an incrementing render ID so stale renders self-abort
  const renderIdRef = useRef(0)

  const renderPages = useCallback(async () => {
    if (!pdfDoc || pageCount === 0) return

    const renderId = ++renderIdRef.current
    console.log(`[PDFViewer] renderPages called — renderId=${renderId}, pageCount=${pageCount}, scale=${scale}`)
    setLoading(true)

    for (let i = 1; i <= pageCount; i++) {
      // Abort if a newer render has started
      if (renderIdRef.current !== renderId) {
        console.log(`[PDFViewer] renderId=${renderId} superseded, aborting`)
        return
      }

      const canvas = canvasRefs.current[i]
      if (!canvas) {
        console.warn(`[PDFViewer] Canvas for page ${i} not yet in DOM, skipping`)
        continue
      }

      try {
        await renderPageToCanvas(pdfDoc, i, canvas, scale)
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error(`[PDFViewer] Error rendering page ${i}:`, err)
        }
      }
    }

    if (renderIdRef.current === renderId) {
      setLoading(false)
      console.log(`[PDFViewer] renderId=${renderId} complete`)
    }
  }, [pdfDoc, pageCount, scale])

  // Render whenever pdfDoc/pageCount/scale changes.
  // We defer one tick to ensure canvas DOM nodes are committed first.
  useEffect(() => {
    if (!pdfDoc || pageCount === 0) return
    console.log('[PDFViewer] useEffect fired — scheduling renderPages')
    const id = requestAnimationFrame(() => renderPages())
    return () => cancelAnimationFrame(id)
  }, [pdfDoc, pageCount, scale, renderPages])

  // Intersection observer to track current visible page
  useEffect(() => {
    if (!containerRef.current || pageCount === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.dataset.page, 10)
            setCurrentPage(pageNum)
          }
        })
      },
      { root: containerRef.current, threshold: 0.5 }
    )
    const pageEls = containerRef.current.querySelectorAll('[data-page]')
    pageEls.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [pageCount, pdfDoc])

  const handleJump = (e) => {
    e.preventDefault()
    const n = parseInt(jumpTo, 10)
    if (n >= 1 && n <= pageCount) {
      const el = containerRef.current?.querySelector(`[data-page="${n}"]`)
      el?.scrollIntoView({ behavior: 'smooth' })
    }
    setJumpTo('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(s => Math.max(0.5, parseFloat((s - 0.1).toFixed(1))))}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-sm text-gray-600 w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(3, parseFloat((s + 0.1).toFixed(1))))}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="text-sm text-gray-500">|</div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Page {currentPage} of {pageCount}</span>
          <form onSubmit={handleJump} className="flex items-center gap-1">
            <input
              type="number"
              value={jumpTo}
              onChange={e => setJumpTo(e.target.value)}
              placeholder="Go to"
              min={1}
              max={pageCount}
              className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
            />
            <button type="submit" className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600">Go</button>
          </form>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-blue-600 ml-auto">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Rendering...
          </div>
        )}
      </div>

      {/* Pages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto bg-gray-100 p-4 flex flex-col items-center gap-4">
        {pageCount === 0 && (
          <p className="text-gray-400 text-sm mt-8">No PDF loaded.</p>
        )}
        {Array.from({ length: pageCount }, (_, i) => i + 1).map(pageNum => (
          <div key={pageNum} data-page={pageNum} className="flex flex-col items-center gap-1">
            <div className="bg-white shadow-md rounded overflow-hidden">
              <canvas
                ref={el => {
                  if (el) {
                    canvasRefs.current[pageNum] = el
                  } else {
                    delete canvasRefs.current[pageNum]
                  }
                }}
              />
            </div>
            <span className="text-xs text-gray-400">{pageNum}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
