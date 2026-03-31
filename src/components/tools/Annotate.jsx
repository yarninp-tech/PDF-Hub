import { useState, useRef, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { renderPageToCanvas, loadPDF } from '../../utils/pdfUtils'
import { downloadBytes, getBaseName } from '../../utils/fileUtils'

const TOOLS = [
  { id: 'highlight', label: 'Highlight', icon: '🖊' },
  { id: 'draw', label: 'Draw', icon: '✏️' },
  { id: 'rectangle', label: 'Rectangle', icon: '⬜' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'note', label: 'Note', icon: '📌' },
]

export default function Annotate() {
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTool, setActiveTool] = useState('highlight')
  const [color, setColor] = useState('#ffff00')
  const [brushSize, setBrushSize] = useState(4)
  const [annotations, setAnnotations] = useState({}) // { pageNum: [...shapes] }
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notes, setNotes] = useState([]) // sticky notes
  const [editingNote, setEditingNote] = useState(null)

  const pdfCanvasRef = useRef(null)
  const annotCanvasRef = useRef(null)
  const isDrawing = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const currentPath = useRef([])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: async ([file]) => {
      if (!file) return
      setError(null)
      try {
        const { pdfDoc: doc } = await loadPDF(file)
        setPdfFile(file)
        setPdfDoc(doc)
        setPageCount(doc.numPages)
        setCurrentPage(1)
        setAnnotations({})
        setNotes([])
        setHistory([])
      } catch (err) {
        setError(err.message)
      }
    },
    multiple: false,
  })

  // Render PDF page
  useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) return
    renderPageToCanvas(pdfDoc, currentPage, pdfCanvasRef.current, 1.4)
      .then(() => redrawAnnotations())
  }, [pdfDoc, currentPage])

  const getCanvasPos = (e) => {
    const rect = annotCanvasRef.current.getBoundingClientRect()
    const scaleX = annotCanvasRef.current.width / rect.width
    const scaleY = annotCanvasRef.current.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const redrawAnnotations = useCallback(() => {
    if (!annotCanvasRef.current || !pdfCanvasRef.current) return
    const canvas = annotCanvasRef.current
    canvas.width = pdfCanvasRef.current.width
    canvas.height = pdfCanvasRef.current.height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const pageAnnotations = annotations[currentPage] || []
    pageAnnotations.forEach(ann => drawAnnotation(ctx, ann))
  }, [annotations, currentPage])

  useEffect(() => {
    redrawAnnotations()
  }, [redrawAnnotations])

  function drawAnnotation(ctx, ann) {
    ctx.save()
    switch (ann.type) {
      case 'highlight':
        ctx.globalAlpha = 0.35
        ctx.fillStyle = ann.color
        ctx.fillRect(ann.x, ann.y, ann.w, ann.h)
        break
      case 'rectangle':
        ctx.globalAlpha = 0.8
        ctx.strokeStyle = ann.color
        ctx.lineWidth = 2
        ctx.strokeRect(ann.x, ann.y, ann.w, ann.h)
        break
      case 'draw':
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = ann.color
        ctx.lineWidth = ann.size
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ann.path.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y))
        ctx.stroke()
        break
      case 'text':
        ctx.globalAlpha = 1
        ctx.fillStyle = ann.color
        ctx.font = `${ann.fontSize || 16}px sans-serif`
        ctx.fillText(ann.text, ann.x, ann.y)
        break
    }
    ctx.restore()
  }

  const handleMouseDown = (e) => {
    if (!annotCanvasRef.current) return
    isDrawing.current = true
    const pos = getCanvasPos(e)
    startPos.current = pos

    if (activeTool === 'draw') {
      currentPath.current = [pos]
    }

    if (activeTool === 'text') {
      const text = prompt('Enter text:')
      if (text) {
        addAnnotation({ type: 'text', x: pos.x, y: pos.y, text, color, fontSize: 16 })
      }
      isDrawing.current = false
    }

    if (activeTool === 'note') {
      setNotes(prev => [...prev, { id: Date.now(), x: pos.x, y: pos.y, page: currentPage, text: '' }])
      isDrawing.current = false
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing.current || !annotCanvasRef.current) return
    const pos = getCanvasPos(e)

    if (activeTool === 'draw') {
      currentPath.current.push(pos)
      const ctx = annotCanvasRef.current.getContext('2d')
      redrawAnnotations()
      ctx.save()
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = color
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      currentPath.current.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y))
      ctx.stroke()
      ctx.restore()
    }

    if (activeTool === 'highlight' || activeTool === 'rectangle') {
      const ctx = annotCanvasRef.current.getContext('2d')
      redrawAnnotations()
      ctx.save()
      const w = pos.x - startPos.current.x
      const h = pos.y - startPos.current.y
      if (activeTool === 'highlight') {
        ctx.globalAlpha = 0.35
        ctx.fillStyle = color
        ctx.fillRect(startPos.current.x, startPos.current.y, w, h)
      } else {
        ctx.globalAlpha = 0.8
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.strokeRect(startPos.current.x, startPos.current.y, w, h)
      }
      ctx.restore()
    }
  }

  const handleMouseUp = (e) => {
    if (!isDrawing.current) return
    isDrawing.current = false
    const pos = getCanvasPos(e)

    if (activeTool === 'draw') {
      if (currentPath.current.length > 1) {
        addAnnotation({ type: 'draw', path: [...currentPath.current], color, size: brushSize })
      }
      currentPath.current = []
    }

    if (activeTool === 'highlight' || activeTool === 'rectangle') {
      const w = pos.x - startPos.current.x
      const h = pos.y - startPos.current.y
      if (Math.abs(w) > 2 && Math.abs(h) > 2) {
        addAnnotation({ type: activeTool, x: startPos.current.x, y: startPos.current.y, w, h, color })
      }
    }
  }

  function addAnnotation(ann) {
    setAnnotations(prev => {
      const pageAnns = prev[currentPage] || []
      const next = { ...prev, [currentPage]: [...pageAnns, ann] }
      setHistory(h => [...h, prev])
      return next
    })
  }

  const handleUndo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setAnnotations(prev)
  }

  const handleClear = () => {
    setHistory(h => [...h, annotations])
    setAnnotations(prev => ({ ...prev, [currentPage]: [] }))
    setNotes(prev => prev.filter(n => n.page !== currentPage))
  }

  const handleSave = async () => {
    if (!pdfFile) return
    setSaving(true)
    setError(null)
    try {
      const bytes = await pdfFile.arrayBuffer()
      const pdfLibDoc = await PDFDocument.load(bytes)
      const font = await pdfLibDoc.embedFont(StandardFonts.Helvetica)

      for (const [pageNumStr, anns] of Object.entries(annotations)) {
        const pageNum = parseInt(pageNumStr, 10)
        const page = pdfLibDoc.getPage(pageNum - 1)
        const { width, height } = page.getSize()
        const canvasW = pdfCanvasRef.current?.width || 1
        const canvasH = pdfCanvasRef.current?.height || 1
        const scaleX = width / canvasW
        const scaleY = height / canvasH

        for (const ann of anns) {
          if (ann.type === 'highlight' || ann.type === 'rectangle') {
            const x = ann.x * scaleX
            const y = height - (ann.y + ann.h) * scaleY
            const w = ann.w * scaleX
            const h = Math.abs(ann.h * scaleY)
            const hexColor = ann.color
            const r = parseInt(hexColor.slice(1, 3), 16) / 255
            const g = parseInt(hexColor.slice(3, 5), 16) / 255
            const b = parseInt(hexColor.slice(5, 7), 16) / 255
            if (ann.type === 'highlight') {
              page.drawRectangle({ x, y, width: w, height: h, color: rgb(r, g, b), opacity: 0.35 })
            } else {
              page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(r, g, b), borderWidth: 1, opacity: 0 })
            }
          } else if (ann.type === 'draw') {
            // Draw freehand lines
            for (let i = 1; i < ann.path.length; i++) {
              const x1 = ann.path[i - 1].x * scaleX
              const y1 = height - ann.path[i - 1].y * scaleY
              const x2 = ann.path[i].x * scaleX
              const y2 = height - ann.path[i].y * scaleY
              const hexColor = ann.color
              const r = parseInt(hexColor.slice(1, 3), 16) / 255
              const g = parseInt(hexColor.slice(3, 5), 16) / 255
              const b = parseInt(hexColor.slice(5, 7), 16) / 255
              page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: rgb(r, g, b), thickness: ann.size * scaleX })
            }
          } else if (ann.type === 'text') {
            const hexColor = ann.color
            const r = parseInt(hexColor.slice(1, 3), 16) / 255
            const g = parseInt(hexColor.slice(3, 5), 16) / 255
            const b = parseInt(hexColor.slice(5, 7), 16) / 255
            page.drawText(ann.text, {
              x: ann.x * scaleX,
              y: height - ann.y * scaleY,
              size: (ann.fontSize || 16) * scaleX,
              font,
              color: rgb(r, g, b),
            })
          }
        }
      }

      const outBytes = await pdfLibDoc.save()
      downloadBytes(outBytes, `${getBaseName(pdfFile.name)}_annotated.pdf`)
    } catch (err) {
      setError('Failed to save annotated PDF: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!pdfFile) {
    return (
      <div className="p-6 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Annotate PDF</h2>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-gray-600 font-medium text-lg">Drop a PDF file here to annotate</p>
          <p className="text-gray-400 text-sm mt-2">or click to browse</p>
        </div>
        {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Annotation toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-wrap flex-shrink-0">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            title={tool.label}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTool === tool.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tool.icon} {tool.label}
          </button>
        ))}

        <div className="h-6 w-px bg-gray-300" />

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Color</label>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-gray-300" />
        </div>

        {activeTool === 'draw' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Size</label>
            <input type="range" min={1} max={20} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-24" />
            <span className="text-xs text-gray-500">{brushSize}px</span>
          </div>
        )}

        <div className="h-6 w-px bg-gray-300" />

        <button onClick={handleUndo} disabled={history.length === 0} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40">
          Undo
        </button>
        <button onClick={handleClear} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200">
          Clear Page
        </button>

        <div className="h-6 w-px bg-gray-300" />

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            ◀
          </button>
          <span className="text-sm text-gray-600">Page {currentPage} / {pageCount}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            ▶
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 flex items-center gap-1"
        >
          {saving ? 'Saving...' : '⬇ Download'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm px-4 py-2 bg-red-50">{error}</p>}

      {/* Canvas area */}
      <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-4">
        <div className="relative bg-white shadow-xl" style={{ display: 'inline-block' }}>
          <canvas ref={pdfCanvasRef} />
          <canvas
            ref={annotCanvasRef}
            className="annotation-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {/* Sticky notes for current page */}
          {notes
            .filter(n => n.page === currentPage)
            .map(note => (
              <div
                key={note.id}
                className="sticky-note"
                style={{ left: note.x, top: note.y }}
              >
                <textarea
                  value={note.text}
                  onChange={e => setNotes(prev => prev.map(n => n.id === note.id ? { ...n, text: e.target.value } : n))}
                  placeholder="Add note..."
                />
                <button
                  onClick={() => setNotes(prev => prev.filter(n => n.id !== note.id))}
                  className="absolute top-1 right-1 text-gray-400 hover:text-red-500 text-xs leading-none"
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
