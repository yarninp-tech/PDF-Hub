import { useState, useEffect, useRef } from 'react'

/**
 * Visual page thumbnail grid with checkbox selection.
 *
 * Props:
 *   pdfDoc        — loaded pdfjs-dist document object
 *   selectedPages — number[] of selected 1-based page numbers
 *   onChange      — function(number[]) called when selection changes
 *   columns       — optional fixed column count; defaults to auto-fill
 */
export default function PageThumbnailGrid({ pdfDoc, selectedPages, onChange, columns }) {
  // thumbnails: { pageNum: number, dataUrl: string|null, loading: boolean }[]
  const [thumbnails, setThumbnails] = useState([])
  const [renderedCount, setRenderedCount] = useState(0)
  const cancelRef = useRef({ value: false })

  const totalPages = pdfDoc ? pdfDoc.numPages : 0

  useEffect(function() {
    if (!pdfDoc) {
      setThumbnails([])
      setRenderedCount(0)
      return
    }

    // Cancel any in-progress render loop from a previous pdfDoc
    cancelRef.current.value = true
    var cancelled = { value: false }
    cancelRef.current = cancelled

    setRenderedCount(0)

    var initial = []
    for (var p = 1; p <= pdfDoc.numPages; p++) {
      initial.push({ pageNum: p, dataUrl: null, loading: true })
    }
    setThumbnails(initial)

    async function renderAll() {
      for (var i = 0; i < initial.length; i++) {
        if (cancelled.value) break

        // Yield to the UI thread between each render so the browser stays responsive
        await new Promise(function(resolve) { setTimeout(resolve, 0) })
        if (cancelled.value) break

        var pageNum = initial[i].pageNum
        try {
          var page = await pdfDoc.getPage(pageNum)
          // scale 0.25 keeps thumbnail rendering fast without blocking the thread
          var scaledViewport = page.getViewport({ scale: 0.25 })
          var canvas = document.createElement('canvas')
          canvas.width = scaledViewport.width
          canvas.height = scaledViewport.height
          var ctx = canvas.getContext('2d')
          var renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport })
          await renderTask.promise
          if (cancelled.value) break
          var dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          var pn = pageNum
          setThumbnails(function(prev) {
            return prev.map(function(t) {
              if (t.pageNum === pn) return { pageNum: pn, dataUrl: dataUrl, loading: false }
              return t
            })
          })
        } catch (_) {
          if (cancelled.value) break
          var pn2 = pageNum
          setThumbnails(function(prev) {
            return prev.map(function(t) {
              if (t.pageNum === pn2) return { pageNum: pn2, dataUrl: null, loading: false }
              return t
            })
          })
        }
        setRenderedCount(function(c) { return c + 1 })
      }
    }

    renderAll()
    return function() { cancelled.value = true }
  }, [pdfDoc])

  if (!pdfDoc || totalPages === 0) return null

  var selectedSet = new Set(selectedPages)

  function handleToggle(pageNum) {
    var next = new Set(selectedSet)
    if (next.has(pageNum)) {
      next.delete(pageNum)
    } else {
      next.add(pageNum)
    }
    var sorted = Array.from(next).sort(function(a, b) { return a - b })
    onChange(sorted)
  }

  function selectAll() {
    var all = []
    for (var i = 1; i <= totalPages; i++) all.push(i)
    onChange(all)
  }

  function deselectAll() {
    onChange([])
  }

  return (
    <div className="space-y-2">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={selectAll}
          className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
        >
          Select All
        </button>
        <button
          onClick={deselectAll}
          className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
        >
          Deselect All
        </button>
        <span className="text-xs text-gray-400">
          {selectedPages.length} of {totalPages} page{totalPages !== 1 ? 's' : ''} selected
        </span>
        {renderedCount < totalPages && (
          <span className="text-xs text-blue-400 ml-auto">
            Loading page {renderedCount + 1} of {totalPages}…
          </span>
        )}
      </div>

      {/* Thumbnail grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: columns ? 'repeat(' + columns + ', 1fr)' : 'repeat(auto-fill, minmax(72px, 1fr))' }}>
        {thumbnails.map(function(thumb) {
          var pageNum = thumb.pageNum
          var dataUrl = thumb.dataUrl
          var loading = thumb.loading
          var selected = selectedSet.has(pageNum)
          return (
            <div
              key={pageNum}
              onClick={function() { handleToggle(pageNum) }}
              className={'cursor-pointer rounded-lg border-2 overflow-hidden transition-all select-none ' + (selected ? 'border-blue-500' : 'border-gray-200 hover:border-gray-300')}
            >
              <div className="relative bg-gray-100">
                {loading ? (
                  <div className="flex items-center justify-center" style={{ minHeight: 90 }}>
                    <svg className="w-4 h-4 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                ) : dataUrl ? (
                  <img
                    src={dataUrl}
                    alt={'Page ' + pageNum}
                    className={'w-full block transition-opacity ' + (selected ? 'opacity-100' : 'opacity-50')}
                  />
                ) : (
                  <div className="flex items-center justify-center text-gray-300 text-xs" style={{ minHeight: 90 }}>—</div>
                )}
                {/* Checkbox overlay */}
                <div className="absolute top-1 left-1 pointer-events-none">
                  <div className={'w-4 h-4 rounded border-2 flex items-center justify-center shadow-sm ' + (selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400')}>
                    {selected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
              <div className={'text-center text-xs py-0.5 font-medium ' + (selected ? 'text-blue-600 bg-blue-50' : 'text-gray-400 bg-white')}>
                {pageNum}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
