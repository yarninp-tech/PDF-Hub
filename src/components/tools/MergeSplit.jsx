import { useState, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { downloadBytes, downloadBlob, formatBytes, getBaseName, parsePageRanges } from '../../utils/fileUtils'
import { loadPDF } from '../../utils/pdfUtils'
import PageThumbnailGrid from '../PageThumbnailGrid'

// mergeItem shape:
// { id, file, pageCount, thumbnailDoc, selectedPages, expanded, loading, loadError }

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function FileListItem({ item, index, isDragOver, onRemove, onSelectedPagesChange, onToggleExpanded, onDragStart, onDragOver, onDragEnd, onDrop }) {
  return (
    <div
      draggable={!item.loading}
      onDragStart={onDragStart}
      onDragOver={function(e) { e.preventDefault(); onDragOver() }}
      onDragEnd={onDragEnd}
      onDrop={function(e) { e.preventDefault(); onDrop() }}
      className={'bg-white border rounded-lg overflow-hidden shadow-sm transition-colors ' + (isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200')}
    >
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={'text-base leading-none flex-shrink-0 select-none ' + (item.loading ? 'text-gray-200 cursor-default' : 'text-gray-300 cursor-grab')}>⠿</span>
        <span className="text-gray-400 text-sm w-5 text-center flex-shrink-0">{index + 1}</span>
        <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">{item.file.name}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            {formatBytes(item.file.size)}
            {item.loading && (
              <>
                <span>·</span>
                <Spinner />
                <span className="text-blue-400">Loading…</span>
              </>
            )}
            {!item.loading && !item.loadError && item.pageCount > 0 && (
              <>
                <span>·</span>
                <span>{item.pageCount} page{item.pageCount !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{item.selectedPages.length} selected</span>
              </>
            )}
            {item.loadError && (
              <>
                <span>·</span>
                <span className="text-red-400">Failed to load</span>
              </>
            )}
          </p>
        </div>
        {!item.loading && !item.loadError && item.pageCount > 0 && (
          <button
            onClick={onToggleExpanded}
            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
          >
            Choose pages
            <svg
              className={'w-3 h-3 transition-transform ' + (item.expanded ? 'rotate-180' : '')}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
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

      {/* Collapsible thumbnail grid */}
      {item.expanded && item.thumbnailDoc && (
        <div className="border-t border-gray-100 px-3 py-3 bg-gray-50">
          <PageThumbnailGrid
            pdfDoc={item.thumbnailDoc}
            selectedPages={item.selectedPages}
            onChange={onSelectedPagesChange}
            columns={5}
          />
        </div>
      )}
    </div>
  )
}

// pdfFile/pdfDoc/pageCount: global file from App.jsx — pre-populates the Split tab
export default function MergeSplit({ pdfFile: globalFile, pdfDoc: globalDoc, pageCount: globalPageCount, onOpenFile }) {
  const [tab, setTab] = useState('merge')

  // Merge state
  const [mergeItems, setMergeItems] = useState([])
  const [merging, setMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState(null) // null | { current, total }
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

  const splitFile = localSplitFile || globalFile
  const splitDoc = localSplitDoc || globalDoc
  const splitPageCount = localSplitDoc ? localSplitDoc.numPages : (globalPageCount || 0)

  // Shared dropzone used both by the large empty-state zone and the "Add more" button
  const { getRootProps: getMergeRootProps, getInputProps: getMergeInputProps, isDragActive: isMergeDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    onDrop: async function(accepted) {
      if (!accepted.length) return

      // 1. Immediately add all dropped files to the list with loading=true
      //    so the user sees the file names right away without waiting for pdfjs
      var newItems = accepted.map(function(file) {
        return {
          id: file.name + '-' + Date.now() + '-' + Math.random(),
          file: file,
          pageCount: 0,
          thumbnailDoc: null,
          selectedPages: [],
          expanded: false,
          loading: true,
          loadError: null,
        }
      })
      setMergeItems(function(prev) { return prev.concat(newItems) })

      // 2. Load each file's pdfjs doc sequentially so we never block the UI
      for (var i = 0; i < newItems.length; i++) {
        var itemId = newItems[i].id
        var file = newItems[i].file
        try {
          console.log('[Merge] Loading file', i + 1, 'of', newItems.length, ':', file.name)
          var result = await loadPDF(file)
          var doc = result.pdfDoc
          var pc = doc.numPages
          var sp = []
          for (var j = 1; j <= pc; j++) sp.push(j)
          console.log('[Merge] Loaded:', file.name, pc + ' pages')
          var capturedId = itemId
          var capturedDoc = doc
          var capturedPc = pc
          var capturedSp = sp
          setMergeItems(function(prev) {
            return prev.map(function(it) {
              if (it.id !== capturedId) return it
              return {
                id: it.id, file: it.file,
                pageCount: capturedPc, thumbnailDoc: capturedDoc, selectedPages: capturedSp,
                expanded: false, loading: false, loadError: null,
              }
            })
          })
        } catch (err) {
          console.error('[Merge] Failed to load:', file.name, err)
          var errId = itemId
          var errMsg = err.message
          setMergeItems(function(prev) {
            return prev.map(function(it) {
              if (it.id !== errId) return it
              return {
                id: it.id, file: it.file,
                pageCount: 0, thumbnailDoc: null, selectedPages: [],
                expanded: false, loading: false, loadError: errMsg,
              }
            })
          })
        }
      }
    },
  })

  const { getRootProps: getSplitRootProps, getInputProps: getSplitInputProps, isDragActive: isSplitDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    onDrop: async function(files) {
      var file = files[0]
      if (!file) return
      setSplitError(null)
      try {
        onOpenFile(file)
        setLocalSplitFile(null)
        setLocalSplitDoc(null)
      } catch (err) {
        setSplitError(err.message)
      }
    },
  })

  // Drag-to-reorder
  function handleDragStart(index) { dragIndexRef.current = index }
  function handleDragOver(index) { setDragOverIndex(index) }
  function handleDragEnd() { dragIndexRef.current = null; setDragOverIndex(null) }
  function handleDrop(dropIndex) {
    var dragIndex = dragIndexRef.current
    if (dragIndex === null || dragIndex === dropIndex) { setDragOverIndex(null); return }
    setMergeItems(function(prev) {
      var arr = prev.slice()
      var removed = arr.splice(dragIndex, 1)[0]
      arr.splice(dropIndex, 0, removed)
      return arr
    })
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  function handleRemove(index) {
    setMergeItems(function(prev) { return prev.filter(function(_, i) { return i !== index }) })
  }

  function handleSelectedPagesChange(index, pages) {
    setMergeItems(function(prev) {
      return prev.map(function(item, i) {
        if (i !== index) return item
        return {
          id: item.id, file: item.file, pageCount: item.pageCount, thumbnailDoc: item.thumbnailDoc,
          selectedPages: pages, expanded: item.expanded, loading: item.loading, loadError: item.loadError,
        }
      })
    })
  }

  function handleToggleExpanded(index) {
    setMergeItems(function(prev) {
      return prev.map(function(item, i) {
        if (i !== index) return item
        return {
          id: item.id, file: item.file, pageCount: item.pageCount, thumbnailDoc: item.thumbnailDoc,
          selectedPages: item.selectedPages, expanded: !item.expanded, loading: item.loading, loadError: item.loadError,
        }
      })
    })
  }

  const handleMerge = async function() {
    if (mergeItems.length < 2) {
      setMergeError('Please add at least 2 PDF files to merge.')
      return
    }
    setMergeError(null)
    setMerging(true)
    setMergeProgress({ current: 0, total: mergeItems.length })
    try {
      console.log('[Merge] Starting merge of', mergeItems.length, 'files')
      var merged = await PDFDocument.create()
      console.log('[Merge] Created merged doc')

      for (var i = 0; i < mergeItems.length; i++) {
        var item = mergeItems[i]
        setMergeProgress({ current: i + 1, total: mergeItems.length })
        console.log('[Merge] Processing file', i + 1, 'of', mergeItems.length, ':', item.file.name)

        var bytes = await item.file.arrayBuffer()
        console.log('[Merge] ArrayBuffer loaded for', item.file.name, bytes.byteLength, 'bytes')

        var doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
        console.log('[Merge] pdf-lib loaded', item.file.name, ', pages:', doc.getPageCount())

        var pageIndices
        if (item.selectedPages.length > 0 && item.selectedPages.length < item.pageCount) {
          pageIndices = item.selectedPages.map(function(p) { return p - 1 })
        } else {
          pageIndices = doc.getPageIndices()
        }
        console.log('[Merge] Using page indices:', pageIndices)

        var copied = await merged.copyPages(doc, pageIndices)
        copied.forEach(function(p) { merged.addPage(p) })
        console.log('[Merge] Added', copied.length, 'pages from', item.file.name)
      }

      console.log('[Merge] Saving merged PDF, total pages:', merged.getPageCount())
      var outBytes = await merged.save()
      console.log('[Merge] Saved, size:', outBytes.length, 'bytes')
      downloadBytes(outBytes, 'merged.pdf')
      console.log('[Merge] Download triggered')
    } catch (err) {
      console.error('[Merge] Error:', err)
      setMergeError('Failed to merge PDFs: ' + err.message)
    } finally {
      setMerging(false)
      setMergeProgress(null)
    }
  }

  const handleSplit = async function() {
    if (!splitDoc || !splitFile) {
      setSplitError('Please load a PDF file first (or upload one globally above).')
      return
    }
    setSplitError(null)
    setSplitting(true)
    try {
      var srcBytes = await splitFile.arrayBuffer()
      var srcDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true })
      var baseName = getBaseName(splitFile.name)

      if (splitMode === 'individual') {
        if (splitPageCount === 1) {
          var nd = await PDFDocument.create()
          var pg = await nd.copyPages(srcDoc, [0])
          nd.addPage(pg[0])
          downloadBytes(await nd.save(), baseName + '_page1.pdf')
        } else {
          var zip = new JSZip()
          for (var i = 0; i < splitPageCount; i++) {
            var d = await PDFDocument.create()
            var p = await d.copyPages(srcDoc, [i])
            d.addPage(p[0])
            zip.file(baseName + '_page' + (i + 1) + '.pdf', await d.save())
          }
          downloadBlob(await zip.generateAsync({ type: 'blob' }), baseName + '_pages.zip')
        }
      } else {
        var pageNums = parsePageRanges(splitRange, splitPageCount)
        if (!pageNums.length) throw new Error('No valid pages found in the specified range.')
        var rd = await PDFDocument.create()
        var rp = await rd.copyPages(srcDoc, pageNums.map(function(n) { return n - 1 }))
        rp.forEach(function(pg2) { rd.addPage(pg2) })
        downloadBytes(await rd.save(), baseName + '_extracted.pdf')
      }
    } catch (err) {
      setSplitError(err.message)
    } finally {
      setSplitting(false)
    }
  }

  // Derived values for the merge tab
  var anyLoading = mergeItems.some(function(it) { return it.loading })
  var totalSelectedPages = mergeItems.reduce(function(sum, it) { return sum + it.selectedPages.length }, 0)
  var totalFilePages = mergeItems.reduce(function(sum, it) { return sum + it.pageCount }, 0)

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Merge & Split</h2>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={function() { setTab('merge') }}
          className={'px-5 py-2 rounded-md text-sm font-medium transition-all ' + (tab === 'merge' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700')}
        >
          Merge PDFs
        </button>
        <button
          onClick={function() { setTab('split') }}
          className={'px-5 py-2 rounded-md text-sm font-medium transition-all ' + (tab === 'split' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700')}
        >
          Split PDF
        </button>
      </div>

      {tab === 'merge' && (
        <div className="space-y-4">
          {mergeItems.length === 0 ? (
            /* Large drop zone — shown only when the list is empty */
            <div
              {...getMergeRootProps()}
              className={'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ' + (isMergeDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50')}
            >
              <input {...getMergeInputProps()} />
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-600 font-medium">Drop PDF files here</p>
              <p className="text-gray-400 text-sm mt-1">or click to browse — select multiple files at once</p>
            </div>
          ) : (
            <>
              {/* File list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500 font-medium">
                    {mergeItems.length} file{mergeItems.length !== 1 ? 's' : ''} · drag to reorder
                  </p>
                  {totalFilePages > 0 && (
                    <p className="text-xs text-gray-400">
                      {totalSelectedPages} of {totalFilePages} pages selected
                    </p>
                  )}
                </div>

                {mergeItems.map(function(item, i) {
                  return (
                    <FileListItem
                      key={item.id}
                      item={item}
                      index={i}
                      isDragOver={dragOverIndex === i}
                      onRemove={function() { handleRemove(i) }}
                      onSelectedPagesChange={function(pages) { handleSelectedPagesChange(i, pages) }}
                      onToggleExpanded={function() { handleToggleExpanded(i) }}
                      onDragStart={function() { handleDragStart(i) }}
                      onDragOver={function() { handleDragOver(i) }}
                      onDragEnd={handleDragEnd}
                      onDrop={function() { handleDrop(i) }}
                    />
                  )
                })}

                {/* Total combined pages */}
                {totalFilePages > 0 && (
                  <div className="text-xs text-gray-400 text-right pt-1 border-t border-gray-100">
                    Combined: {totalSelectedPages} page{totalSelectedPages !== 1 ? 's' : ''} selected
                    {totalSelectedPages !== totalFilePages && ' (of ' + totalFilePages + ' total)'}
                  </div>
                )}
              </div>

              {/* Add more files — compact drop zone */}
              <div
                {...getMergeRootProps()}
                className={'border border-dashed rounded-xl px-4 py-3 flex items-center gap-2 cursor-pointer transition-colors ' + (isMergeDragActive ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 text-gray-500')}
              >
                <input {...getMergeInputProps()} />
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">Add more files</span>
                <span className="text-xs ml-auto">drop here or click to browse</span>
              </div>
            </>
          )}

          {mergeError && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {mergeError}
            </p>
          )}

          <button
            onClick={handleMerge}
            disabled={merging || mergeItems.length < 2 || anyLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {merging ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {mergeProgress
                  ? 'Merging file ' + mergeProgress.current + ' of ' + mergeProgress.total + '…'
                  : 'Merging…'}
              </>
            ) : anyLoading ? (
              <>
                <Spinner />
                Loading files…
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
              className={'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ' + (isSplitDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50')}
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
                ].map(function(opt) {
                  return (
                    <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="splitMode"
                        value={opt.value}
                        checked={splitMode === opt.value}
                        onChange={function(e) { setSplitMode(e.target.value) }}
                        className="accent-blue-600"
                      />
                      <span className="text-sm text-gray-600">{opt.label}</span>
                    </label>
                  )
                })}
              </div>

              {splitMode === 'range' && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Pages to extract <span className="text-gray-400">(e.g. "1-3, 5, 8-10")</span>
                  </label>
                  <input
                    type="text"
                    value={splitRange}
                    onChange={function(e) { setSplitRange(e.target.value) }}
                    placeholder="1-3, 5, 8-10"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {splitError && (
            <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {splitError}
            </p>
          )}

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
                Splitting…
              </>
            ) : 'Split PDF'}
          </button>
        </div>
      )}
    </div>
  )
}
