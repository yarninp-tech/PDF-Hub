import { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ToolPanel from './components/ToolPanel'
import PDFViewer from './components/PDFViewer'
import { usePDF } from './hooks/usePDF'
import { formatBytes } from './utils/fileUtils'

export default function App() {
  const [activeTool, setActiveTool] = useState('merge')
  const [showViewer, setShowViewer] = useState(false)
  const { pdfFile, pdfDoc, pageCount, loading, error, openFile, closeFile } = usePDF()

  const handleFile = async (file) => {
    await openFile(file)
    setShowViewer(false)
  }

  const handleClose = () => {
    closeFile()
    setShowViewer(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <Header pdfFile={pdfFile} onClose={handleClose} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTool={activeTool} onToolChange={setActiveTool} />

        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Persistent file info bar */}
          {pdfFile && (
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-shrink-0">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
              </svg>
              <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{pdfFile.name}</span>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-400">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-400">{formatBytes(pdfFile.size)}</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowViewer(v => !v)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    showViewer ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  {showViewer ? 'Hide Preview' : 'Preview PDF'}
                </button>
              </div>
            </div>
          )}

          {/* Loading banner — slim bar so ToolPanel stays mounted and tab state is preserved */}
          {loading && (
            <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2 text-blue-600 text-sm flex-shrink-0">
              <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Loading PDF…
            </div>
          )}

          {error && !loading && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex-shrink-0">
              {error}
            </div>
          )}

          {/* ToolPanel is always rendered — never unmounted — so sub-component tab state survives file loads */}
          <div className="flex-1 overflow-hidden flex">
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
