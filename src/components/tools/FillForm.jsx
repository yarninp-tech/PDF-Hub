import { useState, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { PDFDocument } from 'pdf-lib'
import { renderPageToCanvas } from '../../utils/pdfUtils'
import { downloadBytes, getBaseName } from '../../utils/fileUtils'

// pdfFile, pdfDoc, pageCount come from global state in App.jsx
export default function FillForm({ pdfFile, pdfDoc, pageCount, onOpenFile }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [formFields, setFormFields] = useState([])
  const [formValues, setFormValues] = useState({})
  const [noFields, setNoFields] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [canvasDims, setCanvasDims] = useState({ width: 1, height: 1 })
  const [pageDims, setPageDims] = useState({ width: 1, height: 1 })
  const pdfCanvasRef = useRef(null)
  const lastDocRef = useRef(null)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: ([file]) => file && onOpenFile(file),
    multiple: false,
  })

  // Scan form fields whenever a new doc is loaded
  useEffect(() => {
    if (!pdfDoc || pdfDoc === lastDocRef.current) return
    lastDocRef.current = pdfDoc
    setCurrentPage(1)
    setFormValues({})
    setFormFields([])
    setNoFields(false)
    setError(null)

    async function scanFields() {
      setScanning(true)
      try {
        const fields = []
        for (let p = 1; p <= pdfDoc.numPages; p++) {
          const page = await pdfDoc.getPage(p)
          const annotations = await page.getAnnotations()
          for (const ann of annotations) {
            if (ann.subtype === 'Widget' && ann.fieldType) {
              fields.push({
                id: ann.id || `field_${p}_${ann.fieldName}`,
                name: ann.fieldName || 'Unnamed',
                type: ann.fieldType,
                page: p,
                rect: ann.rect,
                value: ann.fieldValue || '',
                options: ann.options || [],
                readOnly: ann.readOnly,
              })
            }
          }
        }
        if (fields.length === 0) {
          setNoFields(true)
        } else {
          const values = {}
          fields.forEach(f => { values[f.name] = f.value || '' })
          setFormValues(values)
        }
        setFormFields(fields)
      } catch (err) {
        setError(err.message)
      } finally {
        setScanning(false)
      }
    }
    scanFields()
  }, [pdfDoc])

  // Render page
  useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) return
    renderPageToCanvas(pdfDoc, currentPage, pdfCanvasRef.current, 1.4)
      .then(({ width, height }) => setCanvasDims({ width, height }))
      .catch(err => setError('Render error: ' + err.message))
  }, [pdfDoc, currentPage])

  // Page dimensions for field overlay positioning
  useEffect(() => {
    if (!pdfDoc) return
    pdfDoc.getPage(currentPage).then(page => {
      const vp = page.getViewport({ scale: 1 })
      setPageDims({ width: vp.width, height: vp.height })
    })
  }, [pdfDoc, currentPage])

  const pageFields = formFields.filter(f => f.page === currentPage)

  const getFieldStyle = (field) => {
    const [x1, , x2, y2] = field.rect
    const scaleX = canvasDims.width / pageDims.width
    const scaleY = canvasDims.height / pageDims.height
    return {
      position: 'absolute',
      left: x1 * scaleX,
      top: (pageDims.height - y2) * scaleY,
      width: (x2 - x1) * scaleX,
      height: (y2 - field.rect[1]) * scaleY,
    }
  }

  const handleSave = async () => {
    if (!pdfFile) return
    setSaving(true)
    setError(null)
    try {
      const bytes = await pdfFile.arrayBuffer()
      const pdfLibDoc = await PDFDocument.load(bytes)
      const form = pdfLibDoc.getForm()
      for (const field of form.getFields()) {
        const name = field.getName()
        const value = formValues[name]
        if (value === undefined) continue
        const typeName = field.constructor.name
        try {
          if (typeName === 'PDFTextField') field.setText(String(value))
          else if (typeName === 'PDFCheckBox') value ? field.check() : field.uncheck()
          else if (typeName === 'PDFDropdown' && value) field.select(value)
          else if (typeName === 'PDFRadioGroup' && value) field.select(value)
        } catch (_) {}
      }
      downloadBytes(await pdfLibDoc.save(), `${getBaseName(pdfFile.name)}_filled.pdf`)
    } catch (err) {
      setError('Failed to save form: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!pdfFile) {
    return (
      <div className="p-6 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Fill Form</h2>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 font-medium text-lg">Drop a PDF form here</p>
          <p className="text-gray-400 text-sm mt-2">or click to browse</p>
        </div>
        {error && <p className="mt-4 text-red-500 text-sm">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Fields panel */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-700 text-sm">Form Fields</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {scanning && (
            <div className="flex items-center gap-2 text-blue-600 text-sm p-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Scanning fields...
            </div>
          )}
          {!scanning && noFields && (
            <div className="text-center py-8 px-4">
              <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-400 text-sm">No fillable form fields detected in this PDF.</p>
            </div>
          )}
          {!scanning && formFields.map(field => (
            <div key={field.id} className={`p-2 rounded-lg border text-sm ${field.page === currentPage ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`}>
              <p className="font-medium text-gray-700 truncate text-xs">{field.name}</p>
              <p className="text-xs text-gray-400 mb-1">Page {field.page} · {field.type}</p>
              {field.type === 'Tx' && (
                <input
                  type="text"
                  value={formValues[field.name] || ''}
                  onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.value }))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
              {field.type === 'Btn' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formValues[field.name]}
                    onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.checked }))}
                    className="accent-blue-600"
                  />
                  <span className="text-xs text-gray-500">Checked</span>
                </label>
              )}
              {field.type === 'Ch' && field.options.length > 0 && (
                <select
                  value={formValues[field.name] || ''}
                  onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.value }))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="">Select...</option>
                  {field.options.map(opt => (
                    <option key={opt.exportValue} value={opt.exportValue}>{opt.displayValue}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-gray-200 space-y-2">
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">◀</button>
            <span className="text-xs text-gray-500 flex-1 text-center">Page {currentPage}/{pageCount}</span>
            <button onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount} className="p-1 rounded hover:bg-gray-100 disabled:opacity-40">▶</button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || noFields || scanning}
            className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : '⬇ Download Filled PDF'}
          </button>
        </div>
      </div>

      {/* PDF canvas with overlaid form fields */}
      <div className="flex-1 overflow-auto bg-gray-100 flex items-start justify-center p-4">
        <div className="relative bg-white shadow-xl" style={{ display: 'inline-block' }}>
          <canvas ref={pdfCanvasRef} />
          {pageFields.map(field => (
            <div key={field.id} style={getFieldStyle(field)}>
              {field.type === 'Tx' && (
                <input
                  type="text"
                  value={formValues[field.name] || ''}
                  onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.value }))}
                  className="w-full h-full px-1 bg-blue-50 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
              {field.type === 'Btn' && (
                <div className="w-full h-full flex items-center justify-center">
                  <input type="checkbox" checked={!!formValues[field.name]} onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.checked }))} className="accent-blue-600 w-4 h-4" />
                </div>
              )}
              {field.type === 'Ch' && (
                <select value={formValues[field.name] || ''} onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.value }))} className="w-full h-full text-xs bg-blue-50 border border-blue-300 rounded focus:outline-none">
                  <option value="">Select...</option>
                  {field.options.map(opt => <option key={opt.exportValue} value={opt.exportValue}>{opt.displayValue}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
