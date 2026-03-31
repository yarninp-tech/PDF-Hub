import { useState, useRef, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { renderPageToCanvas } from '../../utils/pdfUtils'
import { downloadBytes, getBaseName } from '../../utils/fileUtils'

const TOOLS = [
  { id: 'select',    label: 'Select',    icon: '↖' },
  { id: 'highlight', label: 'Highlight', icon: '🖊' },
  { id: 'draw',      label: 'Draw',      icon: '✏️' },
  { id: 'rectangle', label: 'Rectangle', icon: '⬜' },
  { id: 'text',      label: 'Text',      icon: 'T' },
  { id: 'note',      label: 'Note',      icon: '📌' },
]

const HANDLE_NAMES = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br']
const HANDLE_CURSORS = {
  tl: 'nw-resize', tc: 'n-resize',  tr: 'ne-resize',
  ml: 'w-resize',                    mr: 'e-resize',
  bl: 'sw-resize', bc: 's-resize',  br: 'se-resize',
}

// ─── Pure helpers (outside component for stable references) ─────────────────

function getAnnotBounds(ann) {
  if (ann.type === 'highlight' || ann.type === 'rectangle') {
    return {
      x: ann.w >= 0 ? ann.x : ann.x + ann.w,
      y: ann.h >= 0 ? ann.y : ann.y + ann.h,
      w: Math.abs(ann.w),
      h: Math.abs(ann.h),
    }
  }
  if (ann.type === 'draw') {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (var i = 0; i < ann.path.length; i++) {
      if (ann.path[i].x < minX) minX = ann.path[i].x
      if (ann.path[i].y < minY) minY = ann.path[i].y
      if (ann.path[i].x > maxX) maxX = ann.path[i].x
      if (ann.path[i].y > maxY) maxY = ann.path[i].y
    }
    var pad = (ann.size || 2) + 2
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
  }
  if (ann.type === 'text') {
    var fs = ann.fontSize || 16
    var tw = Math.max((ann.text || '').length * fs * 0.55, 20)
    return { x: ann.x, y: ann.y - fs, w: tw, h: fs * 1.3 }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}

function hitTest(ann, px, py) {
  var b = getAnnotBounds(ann)
  return px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4
}

function getHandlePositions(b) {
  return {
    tl: { x: b.x,           y: b.y           },
    tc: { x: b.x + b.w / 2, y: b.y           },
    tr: { x: b.x + b.w,     y: b.y           },
    ml: { x: b.x,           y: b.y + b.h / 2 },
    mr: { x: b.x + b.w,     y: b.y + b.h / 2 },
    bl: { x: b.x,           y: b.y + b.h     },
    bc: { x: b.x + b.w / 2, y: b.y + b.h     },
    br: { x: b.x + b.w,     y: b.y + b.h     },
  }
}

function getHandleAtPoint(b, px, py) {
  var handles = getHandlePositions(b)
  for (var i = 0; i < HANDLE_NAMES.length; i++) {
    var name = HANDLE_NAMES[i]
    var h = handles[name]
    if (Math.abs(px - h.x) <= 6 && Math.abs(py - h.y) <= 6) return name
  }
  return null
}

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
      for (var i = 0; i < ann.path.length; i++) {
        if (i === 0) ctx.moveTo(ann.path[i].x, ann.path[i].y)
        else ctx.lineTo(ann.path[i].x, ann.path[i].y)
      }
      ctx.stroke()
      break
    case 'text':
      ctx.globalAlpha = 1
      ctx.fillStyle = ann.color
      ctx.font = (ann.fontSize || 16) + 'px sans-serif'
      ctx.fillText(ann.text, ann.x, ann.y)
      break
  }
  ctx.restore()
}

function drawSelectionOverlay(ctx, ann) {
  var b = getAnnotBounds(ann)
  ctx.save()
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 3])
  ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
  ctx.setLineDash([])
  ctx.fillStyle = '#3b82f6'
  var handles = getHandlePositions(b)
  for (var i = 0; i < HANDLE_NAMES.length; i++) {
    var hp = handles[HANDLE_NAMES[i]]
    ctx.fillRect(hp.x - 4, hp.y - 4, 8, 8)
  }
  ctx.restore()
}

function translateAnnot(ann, dx, dy) {
  if (ann.type === 'highlight' || ann.type === 'rectangle') {
    return Object.assign({}, ann, { x: ann.x + dx, y: ann.y + dy })
  }
  if (ann.type === 'draw') {
    var newPath = []
    for (var i = 0; i < ann.path.length; i++) {
      newPath.push({ x: ann.path[i].x + dx, y: ann.path[i].y + dy })
    }
    return Object.assign({}, ann, { path: newPath })
  }
  if (ann.type === 'text') {
    return Object.assign({}, ann, { x: ann.x + dx, y: ann.y + dy })
  }
  return ann
}

function resizeAnnot(ann, handle, origBounds, dx, dy) {
  var b = { x: origBounds.x, y: origBounds.y, w: origBounds.w, h: origBounds.h }
  if      (handle === 'tl') { b.x += dx; b.y += dy; b.w -= dx; b.h -= dy }
  else if (handle === 'tc') {             b.y += dy;             b.h -= dy }
  else if (handle === 'tr') {             b.y += dy; b.w += dx; b.h -= dy }
  else if (handle === 'ml') { b.x += dx;             b.w -= dx            }
  else if (handle === 'mr') {                         b.w += dx            }
  else if (handle === 'bl') { b.x += dx;             b.w -= dx; b.h += dy }
  else if (handle === 'bc') {                                    b.h += dy }
  else if (handle === 'br') {                         b.w += dx; b.h += dy }
  b.w = Math.max(b.w, 5)
  b.h = Math.max(b.h, 5)

  if (ann.type === 'highlight' || ann.type === 'rectangle') {
    return Object.assign({}, ann, { x: b.x, y: b.y, w: b.w, h: b.h })
  }
  if (ann.type === 'text') {
    var newFs = Math.max(8, Math.round(b.h / 1.3))
    return Object.assign({}, ann, { x: b.x, y: b.y + b.h, fontSize: newFs })
  }
  if (ann.type === 'draw' && origBounds.w >= 1 && origBounds.h >= 1) {
    var sx = b.w / origBounds.w
    var sy = b.h / origBounds.h
    var newPath = []
    for (var i = 0; i < ann.path.length; i++) {
      newPath.push({
        x: b.x + (ann.path[i].x - origBounds.x) * sx,
        y: b.y + (ann.path[i].y - origBounds.y) * sy,
      })
    }
    return Object.assign({}, ann, { path: newPath })
  }
  return ann
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Annotate({ pdfFile, pdfDoc, pageCount, onOpenFile }) {
  const [currentPage, setCurrentPage]   = useState(1)
  const [activeTool, setActiveTool]     = useState('select')
  const [color, setColor]               = useState('#ffff00')
  const [brushSize, setBrushSize]       = useState(4)
  const [annotations, setAnnotations]   = useState({})
  const [history, setHistory]           = useState([])
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)
  const [notes, setNotes]               = useState([])
  const [selectedAnn, setSelectedAnn]   = useState(null)  // { page, idx } | null
  const [canvasCursor, setCanvasCursor] = useState('default')

  const pdfCanvasRef  = useRef(null)
  const annotCanvasRef = useRef(null)
  const isDrawing     = useRef(false)
  const startPos      = useRef({ x: 0, y: 0 })
  const currentPath   = useRef([])
  const lastDocRef    = useRef(null)

  // Selection drag — refs only, no state updates during drag for smooth perf
  const dragModeRef       = useRef(null)  // 'move' | handle-name | null
  const dragStartRef      = useRef({ x: 0, y: 0 })
  const dragOrigAnnRef    = useRef(null)
  const dragOrigBoundsRef = useRef(null)
  const liveAnnRef        = useRef(null)  // live position during drag

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: ([file]) => file && onOpenFile(file),
    multiple: false,
    noClick: !!pdfFile,
    noKeyboard: !!pdfFile,
  })

  // Reset when file changes
  useEffect(() => {
    if (pdfDoc && pdfDoc !== lastDocRef.current) {
      lastDocRef.current = pdfDoc
      setAnnotations({})
      setNotes([])
      setHistory([])
      setCurrentPage(1)
      setSelectedAnn(null)
      setError(null)
    }
  }, [pdfDoc])

  // Deselect when switching away from select tool
  useEffect(() => {
    if (activeTool !== 'select') setSelectedAnn(null)
  }, [activeTool])

  // ── Canvas drawing ──────────────────────────────────────────────────────────

  const redrawAnnotations = useCallback((overrideAnn) => {
    if (!annotCanvasRef.current || !pdfCanvasRef.current) return
    const canvas = annotCanvasRef.current
    canvas.width  = pdfCanvasRef.current.width
    canvas.height = pdfCanvasRef.current.height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const pageAnns = annotations[currentPage] || []
    for (let i = 0; i < pageAnns.length; i++) {
      const ann = (overrideAnn !== undefined && selectedAnn && selectedAnn.page === currentPage && selectedAnn.idx === i)
        ? overrideAnn
        : pageAnns[i]
      drawAnnotation(ctx, ann)
    }
    // Draw selection overlay on top
    if (selectedAnn && selectedAnn.page === currentPage) {
      const selAnn = overrideAnn !== undefined ? overrideAnn : pageAnns[selectedAnn.idx]
      if (selAnn) drawSelectionOverlay(ctx, selAnn)
    }
  }, [annotations, currentPage, selectedAnn])

  // Redraw on annotation/page/selection changes
  useEffect(() => { redrawAnnotations() }, [redrawAnnotations])

  // Render PDF page when page or doc changes
  useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) return
    renderPageToCanvas(pdfDoc, currentPage, pdfCanvasRef.current, 1.4)
      .then(() => redrawAnnotations())
      .catch(err => setError('Render error: ' + err.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage])

  // ── Keyboard delete ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (!selectedAnn || selectedAnn.page !== currentPage) return
      setAnnotations(prev => {
        const pageAnns = (prev[currentPage] || []).slice()
        pageAnns.splice(selectedAnn.idx, 1)
        setHistory(h => [...h, prev])
        return { ...prev, [currentPage]: pageAnns }
      })
      setSelectedAnn(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedAnn, currentPage])

  // ── Canvas coordinate helper ────────────────────────────────────────────────
  function getCanvasPos(e) {
    const rect = annotCanvasRef.current.getBoundingClientRect()
    const scaleX = annotCanvasRef.current.width  / rect.width
    const scaleY = annotCanvasRef.current.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (!annotCanvasRef.current) return
    const pos = getCanvasPos(e)
    startPos.current = pos

    if (activeTool === 'select') {
      const pageAnns = annotations[currentPage] || []

      // Check for resize handle hit on selected annotation
      if (selectedAnn && selectedAnn.page === currentPage) {
        const ann = pageAnns[selectedAnn.idx]
        if (ann) {
          const b = getAnnotBounds(ann)
          const handle = getHandleAtPoint(b, pos.x, pos.y)
          if (handle) {
            dragModeRef.current       = handle
            dragStartRef.current      = pos
            dragOrigAnnRef.current    = Object.assign({}, ann, { path: ann.path ? ann.path.slice() : undefined })
            dragOrigBoundsRef.current = Object.assign({}, b)
            liveAnnRef.current        = Object.assign({}, ann, { path: ann.path ? ann.path.slice() : undefined })
            isDrawing.current = true
            return
          }
          // Move via body hit
          if (hitTest(ann, pos.x, pos.y)) {
            dragModeRef.current       = 'move'
            dragStartRef.current      = pos
            dragOrigAnnRef.current    = Object.assign({}, ann, { path: ann.path ? ann.path.slice() : undefined })
            dragOrigBoundsRef.current = getAnnotBounds(ann)
            liveAnnRef.current        = Object.assign({}, ann, { path: ann.path ? ann.path.slice() : undefined })
            isDrawing.current = true
            return
          }
        }
      }

      // Hit-test all annotations (topmost first)
      for (var i = pageAnns.length - 1; i >= 0; i--) {
        if (hitTest(pageAnns[i], pos.x, pos.y)) {
          setSelectedAnn({ page: currentPage, idx: i })
          dragModeRef.current       = 'move'
          dragStartRef.current      = pos
          dragOrigAnnRef.current    = Object.assign({}, pageAnns[i], { path: pageAnns[i].path ? pageAnns[i].path.slice() : undefined })
          dragOrigBoundsRef.current = getAnnotBounds(pageAnns[i])
          liveAnnRef.current        = Object.assign({}, pageAnns[i], { path: pageAnns[i].path ? pageAnns[i].path.slice() : undefined })
          isDrawing.current = true
          return
        }
      }
      // Clicked empty space — deselect
      setSelectedAnn(null)
      return
    }

    isDrawing.current = true
    if (activeTool === 'draw') currentPath.current = [pos]
    if (activeTool === 'text') {
      const text = prompt('Enter text:')
      if (text) addAnnotation({ type: 'text', x: pos.x, y: pos.y, text, color, fontSize: 16 })
      isDrawing.current = false
    }
    if (activeTool === 'note') {
      setNotes(prev => [...prev, { id: Date.now(), x: pos.x, y: pos.y, page: currentPage, text: '' }])
      isDrawing.current = false
    }
  }

  const handleMouseMove = (e) => {
    if (!annotCanvasRef.current) return
    const pos = getCanvasPos(e)

    if (activeTool === 'select') {
      if (!isDrawing.current) {
        // Update cursor on hover
        var cursor = 'default'
        const pageAnns = annotations[currentPage] || []
        if (selectedAnn && selectedAnn.page === currentPage) {
          const ann = pageAnns[selectedAnn.idx]
          if (ann) {
            const b = getAnnotBounds(ann)
            const handle = getHandleAtPoint(b, pos.x, pos.y)
            if (handle) cursor = HANDLE_CURSORS[handle]
            else if (hitTest(ann, pos.x, pos.y)) cursor = 'move'
          }
        }
        if (cursor === 'default') {
          for (var i = 0; i < pageAnns.length; i++) {
            if (hitTest(pageAnns[i], pos.x, pos.y)) { cursor = 'move'; break }
          }
        }
        setCanvasCursor(cursor)
        return
      }

      // Dragging — compute live position and draw directly (no state update for perf)
      if (!dragOrigAnnRef.current) return
      const dx = pos.x - dragStartRef.current.x
      const dy = pos.y - dragStartRef.current.y
      const newAnn = dragModeRef.current === 'move'
        ? translateAnnot(dragOrigAnnRef.current, dx, dy)
        : resizeAnnot(dragOrigAnnRef.current, dragModeRef.current, dragOrigBoundsRef.current, dx, dy)
      liveAnnRef.current = newAnn
      redrawAnnotations(newAnn)
      return
    }

    if (!isDrawing.current) return
    if (activeTool === 'draw') {
      currentPath.current.push(pos)
      const ctx = annotCanvasRef.current.getContext('2d')
      redrawAnnotations()
      ctx.save()
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = color
      ctx.lineWidth   = brushSize
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
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
        ctx.fillStyle   = color
        ctx.fillRect(startPos.current.x, startPos.current.y, w, h)
      } else {
        ctx.globalAlpha  = 0.8
        ctx.strokeStyle  = color
        ctx.lineWidth    = 2
        ctx.strokeRect(startPos.current.x, startPos.current.y, w, h)
      }
      ctx.restore()
    }
  }

  const handleMouseUp = (e) => {
    if (activeTool === 'select') {
      if (isDrawing.current && liveAnnRef.current && selectedAnn) {
        const finalAnn = liveAnnRef.current
        const idx      = selectedAnn.idx
        setHistory(h => [...h, annotations])
        setAnnotations(prev => {
          const pageAnns = (prev[currentPage] || []).slice()
          pageAnns[idx] = finalAnn
          return { ...prev, [currentPage]: pageAnns }
        })
      }
      isDrawing.current       = false
      dragModeRef.current     = null
      dragOrigAnnRef.current  = null
      dragOrigBoundsRef.current = null
      liveAnnRef.current      = null
      return
    }

    if (!isDrawing.current) return
    isDrawing.current = false
    const pos = getCanvasPos(e)
    if (activeTool === 'draw') {
      if (currentPath.current.length > 1)
        addAnnotation({ type: 'draw', path: [...currentPath.current], color, size: brushSize })
      currentPath.current = []
    }
    if (activeTool === 'highlight' || activeTool === 'rectangle') {
      const w = pos.x - startPos.current.x
      const h = pos.y - startPos.current.y
      if (Math.abs(w) > 2 && Math.abs(h) > 2)
        addAnnotation({ type: activeTool, x: startPos.current.x, y: startPos.current.y, w, h, color })
    }
  }

  // ── Annotation mutations ────────────────────────────────────────────────────
  function addAnnotation(ann) {
    setAnnotations(prev => {
      const pageAnns = prev[currentPage] || []
      const next = { ...prev, [currentPage]: [...pageAnns, ann] }
      setHistory(h => [...h, prev])
      return next
    })
  }

  function handleDeleteSelected() {
    if (!selectedAnn || selectedAnn.page !== currentPage) return
    setAnnotations(prev => {
      const pageAnns = (prev[currentPage] || []).slice()
      pageAnns.splice(selectedAnn.idx, 1)
      setHistory(h => [...h, prev])
      return { ...prev, [currentPage]: pageAnns }
    })
    setSelectedAnn(null)
  }

  function handleDuplicateSelected() {
    if (!selectedAnn || selectedAnn.page !== currentPage) return
    const pageAnns = annotations[currentPage] || []
    const ann = pageAnns[selectedAnn.idx]
    if (!ann) return
    const dup = translateAnnot(
      Object.assign({}, ann, { path: ann.path ? ann.path.map(p => ({ ...p })) : undefined }),
      12, 12
    )
    addAnnotation(dup)
    setSelectedAnn({ page: currentPage, idx: pageAnns.length })
  }

  function handleChangeSelectedColor(newColor) {
    if (!selectedAnn || selectedAnn.page !== currentPage) return
    const pageAnns = annotations[currentPage] || []
    const ann = pageAnns[selectedAnn.idx]
    if (!ann) return
    setAnnotations(prev => {
      const anns = (prev[currentPage] || []).slice()
      anns[selectedAnn.idx] = Object.assign({}, ann, { color: newColor })
      return { ...prev, [currentPage]: anns }
    })
  }

  const handleUndo = () => {
    if (!history.length) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setAnnotations(prev)
    setSelectedAnn(null)
  }

  const handleClear = () => {
    setHistory(h => [...h, annotations])
    setAnnotations(prev => ({ ...prev, [currentPage]: [] }))
    setNotes(prev => prev.filter(n => n.page !== currentPage))
    setSelectedAnn(null)
  }

  const handleSave = async () => {
    if (!pdfFile) return
    setSaving(true)
    setError(null)
    try {
      const bytes    = await pdfFile.arrayBuffer()
      const pdfLibDoc = await PDFDocument.load(bytes)
      const font     = await pdfLibDoc.embedFont(StandardFonts.Helvetica)

      for (const [pageNumStr, anns] of Object.entries(annotations)) {
        const pageNum  = parseInt(pageNumStr, 10)
        const page     = pdfLibDoc.getPage(pageNum - 1)
        const { width, height } = page.getSize()
        const canvasW  = pdfCanvasRef.current?.width  || 1
        const canvasH  = pdfCanvasRef.current?.height || 1
        const scaleX   = width  / canvasW
        const scaleY   = height / canvasH

        for (const ann of anns) {
          if (ann.type === 'highlight' || ann.type === 'rectangle') {
            const x = ann.x * scaleX
            const y = height - (ann.y + ann.h) * scaleY
            const w = ann.w * scaleX
            const h = Math.abs(ann.h * scaleY)
            const r = parseInt(ann.color.slice(1, 3), 16) / 255
            const g = parseInt(ann.color.slice(3, 5), 16) / 255
            const b = parseInt(ann.color.slice(5, 7), 16) / 255
            if (ann.type === 'highlight') {
              page.drawRectangle({ x, y, width: w, height: h, color: rgb(r, g, b), opacity: 0.35 })
            } else {
              page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(r, g, b), borderWidth: 1, opacity: 0 })
            }
          } else if (ann.type === 'draw') {
            for (let i = 1; i < ann.path.length; i++) {
              const r = parseInt(ann.color.slice(1, 3), 16) / 255
              const g = parseInt(ann.color.slice(3, 5), 16) / 255
              const b = parseInt(ann.color.slice(5, 7), 16) / 255
              page.drawLine({
                start: { x: ann.path[i-1].x * scaleX, y: height - ann.path[i-1].y * scaleY },
                end:   { x: ann.path[i].x   * scaleX, y: height - ann.path[i].y   * scaleY },
                color: rgb(r, g, b),
                thickness: ann.size * scaleX,
              })
            }
          } else if (ann.type === 'text') {
            const r = parseInt(ann.color.slice(1, 3), 16) / 255
            const g = parseInt(ann.color.slice(3, 5), 16) / 255
            const b = parseInt(ann.color.slice(5, 7), 16) / 255
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

      downloadBytes(await pdfLibDoc.save(), getBaseName(pdfFile.name) + '_annotated.pdf')
    } catch (err) {
      setError('Failed to save annotated PDF: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived values for rendering ────────────────────────────────────────────
  const toolCursor = activeTool === 'select' ? canvasCursor : 'crosshair'
  const selectedAnnotation = selectedAnn && selectedAnn.page === currentPage
    ? (annotations[currentPage] || [])[selectedAnn.idx]
    : null
  const selectedBounds = selectedAnnotation ? getAnnotBounds(selectedAnnotation) : null

  // ── No file — drop zone ─────────────────────────────────────────────────────
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

  // ── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Toolbar */}
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

        <button onClick={handleUndo} disabled={!history.length} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-40">
          Undo
        </button>
        <button onClick={handleClear} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200">
          Clear Page
        </button>

        <div className="h-6 w-px bg-gray-300" />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
          >◀</button>
          <span className="text-sm text-gray-600">Page {currentPage} / {pageCount}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"
          >▶</button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="ml-auto px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : '⬇ Download'}
        </button>
      </div>

      {error && (
        <div className="text-red-500 text-sm px-4 py-2 bg-red-50 border-b border-red-100">{error}</div>
      )}

      {/* Canvas area */}
      <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-4">
        <div className="relative bg-white shadow-xl" style={{ display: 'inline-block' }}>

          {/* PDF background canvas */}
          <canvas ref={pdfCanvasRef} style={{ display: 'block' }} />

          {/* Annotation overlay canvas */}
          <canvas
            ref={annotCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, cursor: toolCursor }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Mini toolbar for selected annotation */}
          {selectedAnnotation && selectedBounds && (
            <div
              style={{
                position: 'absolute',
                left: selectedBounds.x,
                top: Math.max(0, selectedBounds.y - 42),
                zIndex: 30,
              }}
              className="flex items-center gap-1 bg-white border border-gray-200 shadow-lg rounded-lg px-2 py-1"
              onMouseDown={e => e.stopPropagation()}
            >
              <input
                type="color"
                value={selectedAnnotation.color || '#000000'}
                onChange={e => handleChangeSelectedColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                title="Color"
              />
              <button
                onClick={handleDuplicateSelected}
                className="text-sm px-1.5 py-0.5 hover:bg-gray-100 rounded text-gray-600"
                title="Duplicate"
              >⧉</button>
              <button
                onClick={handleDeleteSelected}
                className="text-sm px-1.5 py-0.5 hover:bg-red-50 rounded text-red-500"
                title="Delete (Del)"
              >🗑</button>
            </div>
          )}

          {/* Sticky notes */}
          {notes
            .filter(n => n.page === currentPage)
            .map(note => (
              <div
                key={note.id}
                style={{ position: 'absolute', left: note.x, top: note.y, zIndex: 20, width: 140 }}
                className="bg-yellow-100 border border-yellow-300 rounded shadow-md p-1"
              >
                <textarea
                  value={note.text}
                  onChange={e => setNotes(prev => prev.map(n => n.id === note.id ? { ...n, text: e.target.value } : n))}
                  placeholder="Add note…"
                  rows={3}
                  className="w-full bg-transparent text-xs resize-none focus:outline-none"
                />
                <button
                  onClick={() => setNotes(prev => prev.filter(n => n.id !== note.id))}
                  className="absolute top-0.5 right-0.5 text-gray-400 hover:text-red-500 text-xs leading-none"
                >×</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
