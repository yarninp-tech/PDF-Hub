import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { downloadBytes, downloadBlob, formatBytes, getBaseName, parsePageRanges } from '../../utils/fileUtils'
import { loadPDF } from '../../utils/pdfUtils'

function FileListItem({ item, index, isDragOver, onRemove, onPageSelectionChange, onDragStart, onDragOver, onDragEnd, onDrop }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragEnd={onDragEnd}
      onDrop={e => { e.preventDefault(); onDrop() }}
      className={`flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm transition-colors ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
    >
      {/* drag handle */}
      <span className="text-gray-300 cursor-grab select-none text-base leading-none flex-shrink-0">⠿</span>
      <span className="text-gray-400 text-sm w-5 text-center flex-shrink-0">{index + 1}</span>
      <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 truncate">{item.file.name}</p>
        <p className="text-xs text-gray-400">
          {formatBytes(item.file.size)}
          {item.pageCount > 0 && ` · ${item.pageCount} page${item.pageCount !== 1 ? 's' : ''}`}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <label className="text-xs text-gray-500 whitespace-nowrap">Pages:</label>
        <input
          type="text"
          value={item.pageSelection}
          onChange={e => onPageSelectionChange(e.target.value)}
          placeholder={item.pageCount > 0 ? `1-${item.pageCount}` : 'all'}
          title="e.g. 1, 3, 5-8 (default: all pages)"
          className="w-24 px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-red-50 text-red-400 flex-shrink-0"
        title="Remove"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// pdfFile/pdfDoc/pageCount: global file from App.jsx — pre-populates the Split tab
export default function MergeSplit({ pdfFile: globalFile, pdfDoc: globalDoc, pageCount: globalPageCount, onOpenFile }) {
  const [tab, setTab] = useState('merge')

  // Merge state (always independent — multiple files)
  // mergeItems: { id: string, file: File, pageCount: number, pageSelection: string }[]
  const [mergeItems, setMergeItems] = useState([])
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState(null)
  const dragIndexRef = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // Split state — use global file as default, allow local override
  const [localSplitFile, setLocalSplitFile] = useState(null)
  const [localSplitDoc, setLocalSplitDoc] = useState(null)
  const [splitMode, setSplitMode] = useState('individual')
  const [splitRange, setSplitRange] = useState('')
  const [splitting, setSplitting] = useState(false)
  const [splitError, setSplitError] = useState(null)

  // Effective split source: local override takes priority, then global
  const splitFile = localSplitFile || globalFile
  const splitDoc = localSplitDoc || globalDoc
  const splitPageCount = localSplitDoc ? localSplitDoc.numPages : (globalPageCount || 0)

  const { getRootProps: getMergeRootProps, getInputProps: getMergeInputProps, isDragActive: isMergeDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: async (accepted) => {
      const newItems = await Promise.all(accepted.map(async (file) => {
        let pageCount = 0
        try {
          const { pdfDoc } = await loadPDF(file)
          pageCount = pdfDoc.numPages
        } catch (_) {}
        return { id: `${file.name}-${Date.now()}-${Math.random()}`, file, pageCount, pageSelection: '' }
      }))
      setMergeItems(prev => [...prev, ...newItems])
    },
    multiple: true,
  })

  const { getRootProps: getSplitRootProps, getInputProps: getSplitInputProps, isDragActive: isSplitDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: async ([file]) => {
      if (!file) return
      setSplitError(null)
      try {
        const { pdfDoc } = await loadPDF(file)
        // Update global state AND local override so header reflects new file
        onOpenFile(file)
        setLocalSplitFile(null)
        setLocalSplitDoc(null)
      } catch (err) {
        setSplitError(err.message)
      }
    },
    multiple: false,
  })

  const handleDragStart = (index) => { dragIndexRef.current = index }
  const handleDragOver = (index) => { setDragOverIndex(index) }
  const handleDragEnd = () => { dragIndexRef.current = null; setDragOverIndex(null) }
  const handleDrop = (dropIndex) => {
    const dragIndex = dragIndexRef.current
    if (dragIndex === null || dragIndex === dropIndex) { setDragOverIndex(null); return }
    setMergeItems(prev => {
      const arr = [...prev]
      const [removed] = arr.splice(dragIndex, 1)
      arr.splice(dropIndex, 0, removed)
      return arr
    })
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleRemove = (index) => {
    setMergeItems(prev => prev.filter((_, i) => i !== index))
  }

  const handlePageSelectionChange = (index, value) => {
    setMergeItems(prev => prev.map((item, i) => i === index ? { ...item, pageSelection: value } : item))
  }

  const handleMerge = async () => {
    if (mergeItems.length < 2) {
      setMergeError('Please add at least 2 PDF files to merge.')
      return
    }
    setMergeError(null)
    setMerging(true)
    try {
      const merged = await PDFDocument.create()
      for (const item of mergeItems) {
        const bytes = await item.file.arrayBuffer()
        const doc = await PDFDocument.load(bytes)
        let pageIndices
        if (item.pageSelection.trim()) {
          const pages = parsePageRanges(item.pageSelection, doc.getPageCount())
          pageIndices = pages.map(p => p - 1)
        } else {
          pageIndices = doc.getPageIndices()
        }
        const copied = await merged.copyPages(doc, pageIndices)
        copied.forEach(p => merged.addPage(p))
      }
      const bytes = await merged.save()
      downloadBytes(bytes, 'merged.pdf')
    } catch (err) {
      setMergeError('Failed to merge PDFs: ' + err.message)
    } finally {
      setMerging(false)
    }
  }

  const handleSplit = async () => {
    if (!splitDoc || !splitFile) {
      setSplitError('Please load a PDF file first (or upload one globally above).')
      return
    }
    setSplitError(null)
    setSplitting(true)

    try {
      const srcBytes = await splitFile.arrayBuffer()
      const srcDoc = await PDFDocument.load(srcBytes)
      const baseName = getBaseName(splitFile.name)

      if (splitMode === 'individual') {
        if (splitPageCount === 1) {
          const newDoc = await PDFDocument.create()
          const [page] = await newDoc.copyPages(srcDoc, [0])
          newDoc.addPage(page)
          const bytes = await newDoc.save()
          downloadBytes(bytes, `${baseName}_page1.pdf`)
        } else {
          const zip = new JSZip()
          for (let i = 0; i < splitPageCount; i++) {
            const newDoc = await PDFDocument.create()
            const [page] = await newDoc.copyPages(srcDoc, [i])
            newDoc.addPage(page)
            const bytes = await newDoc.save()
            zip.file(`${baseName}_page${i + 1}.pdf`, bytes)
          }
          const zipBlob = await zip.generateAsync({ type: 'blob' })
          downloadBlob(zipBlob, `${baseName}_pages.zip`)
        }
      } else {
        // Range/extract mode
        const pages = parsePageRanges(splitRange, splitPageCount)
        if (!pages.length) {
          throw new Error('No valid pages found in the specified range.')
        }
        const newDoc = await PDFDocument.create()
        const copied = await newDoc.copyPages(srcDoc, pages.map(p => p - 1))
        copied.forEach(p => newDoc.addPage(p))
        const bytes = await newDoc.save()
        downloadBytes(bytes, `${baseName}_extracted.pdf`)
      }
    } catch (err) {
      setSplitError(err.message)
    } finally {
      setSplitting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Merge & Split</h2>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('merge')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
            tab === 'merge' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Merge PDFs
        </button>
        <button
          onClick={() => setTab('split')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
            tab === 'split' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Split PDF
        </button>
      </div>

      {tab === 'merge' && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            {...getMergeRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isMergeDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input {...getMergeInputProps()} />
            <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 font-medium">Drop PDF files here</p>
            <p className="text-gray-400 text-sm mt-1">or click to browse</p>
          </div>

          {mergeItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 font-medium">{mergeItems.length} file{mergeItems.length > 1 ? 's' : ''} selected · drag to reorder</p>
              {mergeItems.map((item, i) => (
                <FileListItem
                  key={item.id}
                  item={item}
                  index={i}
                  isDragOver={dragOverIndex === i}
                  onRemove={() => handleRemove(i)}
                  onPageSelectionChange={(val) => handlePageSelectionChange(i, val)}
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={() => handleDragOver(i)}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(i)}
                />
              ))}
            </div>
          )}

          {mergeError && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{mergeError}</p>}

          <button
            onClick={handleMerge}
            disabled={merging || mergeItems.length < 2}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {merging ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Merging...
              </>
            ) : 'Merge All PDFs'}
          </button>
        </div>
      )}

      {tab === 'split' && (
        <div className="space-y-4">
          {!splitFile ? (
            <div
              {...getSplitRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isSplitDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <input {...getSplitInputProps()} />
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 font-medium">Drop a PDF file here</p>
              <p className="text-gray-400 text-sm mt-1">or click to browse</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                </svg>
                <div>
                  <p className="font-medium text-gray-700">{splitFile.name}</p>
                  <p className="text-sm text-gray-400">{splitPageCount} page{splitPageCount !== 1 ? 's' : ''} · {formatBytes(splitFile.size)}</p>
                  {!localSplitFile && <p className="text-xs text-blue-500 mt-0.5">Using globally loaded file</p>}
                </div>
              </div>
              {/* Drop a new file to replace */}
              <div {...getSplitRootProps()} className="cursor-pointer">
                <input {...getSplitInputProps()} />
                <span className="text-xs text-blue-500 hover:text-blue-700 underline">Change</span>
              </div>
            </div>
          )}

          {splitFile && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
              <p className="font-medium text-gray-700">Split Options</p>
              <div className="space-y-2">
                {[
                  { value: 'individual', label: 'Split into individual pages' },
                  { value: 'range', label: 'Split by range / extract pages' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="splitMode"
                      value={opt.value}
                      checked={splitMode === opt.value}
                      onChange={e => setSplitMode(e.target.value)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-600">{opt.label}</span>
                  </label>
                ))}
              </div>

              {splitMode === 'range' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Pages to extract <span className="text-gray-400">(e.g. "1-3, 5, 8-10")</span>
                  </label>
                  <input
                    type="text"
                    value={splitRange}
                    onChange={e => setSplitRange(e.target.value)}
                    placeholder="1-3, 5, 8-10"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {splitError && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">{splitError}</p>}

          <button
            onClick={handleSplit}
            disabled={splitting || !splitFile}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {splitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Splitting...
              </>
            ) : 'Split PDF'}
          </button>
        </div>
      )}
    </div>
  )
}
