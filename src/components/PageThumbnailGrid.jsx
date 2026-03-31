import { useState, useEffect, useRef } from 'react'

/**
 * Visual page thumbnail grid with checkbox selection.
 *
 * Props:
 *   pdfDoc        — loaded pdfjs-dist document object (for rendering thumbnails)
 *   selectedPages — number[] of selected 1-based page numbers
 *   onChange      — function(number[]) called when selection changes
 */
export default function PageThumbnailGrid({ pdfDoc, selectedPages, onChange }) {
  // thumbnails: { pageNum: number, dataUrl: string|null, loading: boolean }[]
  const [thumbnails, setThumbnails] = useState([])
  const cancelRef = useRef({ value: false })

  const totalPages = pdfDoc ? pdfDoc.numPages : 0

  // When pdfDoc changes: reset thumbnail list and start background rendering
  useEffect(function() {
    if (!pdfDoc) {
      setThumbnails([])
      return
    }

    // Cancel any in-progress render from the previous pdfDoc
    cancelRef.current.value = true
    var cancelled = { value: false }
    cancelRef.current = cancelled

    var initial = []
    for (var p = 1; p <= pdfDoc.numPages; p++) {
      initial.push({ pageNum: p, dataUrl: null, loading: true })
    }
    setThumbnails(initial)

    async function renderAll() {
      for (var i = 0; i < initial.length; i++) {
        if (cancelled.value) break
        var pageNum = initial[i].pageNum
        try {
          console.log('[PageThumbnailGrid] Rendering thumbnail for page', pageNum)
          var page = await pdfDoc.getPage(pageNum)
          var viewport = page.getViewport({ scale: 1 })
          var scale = 96 / viewport.width
          var scaledViewport = page.getViewport({ scale: scale })
          var canvas = document.createElement('canvas')
          canvas.width = scaledViewport.width
          canvas.height = scaledViewport.height
          var ctx = canvas.getContext('2d')
          var renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport })
          await renderTask.promise
          if (cancelled.value) break
          var dataUrl = canvas.toDataURL('image/jpeg', 0.75)
          console.log('[PageThumbnailGrid] Page', pageNum, 'thumbnail ready')
          var pn = pageNum
          setThumbnails(function(prev) {
            return prev.map(function(t) {
              if (t.pageNum === pn) return { pageNum: pn, dataUrl: dataUrl, loading: false }
              return t
            })
          })
        } catch (err) {
          console.warn('[PageThumbnailGrid] Failed to render page', pageNum, err)
          if (cancelled.value) break
          var pn2 = pageNum
          setThumbnails(function(prev) {
            return prev.map(function(t) {
              if (t.pageNum === pn2) return { pageNum: pn2, dataUrl: null, loading: false }
              return t
            })
          })
        }
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
      </div>

      {/* Thumbnail grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))' }}>
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
                  <div className="flex items-center justify-center" style={{ minHeight: 106 }}>
                    <svg className="w-4 h-4 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                ) : dataUrl ? (
                  <img
                    src={dataUrl}
                    alt={'Page ' + pageNum}
                    className={'w-full block transition-opacity ' + (selected ? 'opacity-100' : 'opacity-30')}
                  />
                ) : (
                  <div className="flex items-center justify-center text-gray-300 text-xs" style={{ minHeight: 106 }}>—</div>
                )}
                {/* Checkbox overlay — top-left corner */}
                <div className="absolute top-1.5 left-1.5 pointer-events-none">
                  <div className={'w-4 h-4 rounded border-2 flex items-center justify-center shadow-sm ' + (selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-400')}>
                    {selected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
              {/* Page number label */}
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
