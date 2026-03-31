import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import ToolPanel from './components/ToolPanel'
import PDFViewer from './components/PDFViewer'
import { usePDF } from './hooks/usePDF'
import { formatBytes } from './utils/fileUtils'

function DropZone({ onFile }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop: ([file]) => file && onFile(file),
    multiple: false,
  })

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        {...getRootProps()}
        className={`w-full max-w-lg border-3 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 scale-105'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50 hover:scale-102'
        }`}
        style={{ borderWidth: '2px' }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center">
            <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-xl font-semibold text-gray-700">
              {isDragActive ? 'Drop your PDF here' : 'Drag & drop a PDF file'}
            </p>
            <p className="text-gray-400 text-sm mt-2">or click to browse your files</p>
            <p className="text-gray-300 text-xs mt-4">Supports PDF files up to 50MB</p>
          </div>
        </div>
      </div>
    </div>
  )
}

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
          {/* File info bar */}
          {pdfFile && (
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                </svg>
                <span className="font-medium">{pdfFile.name}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-400">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-400">{formatBytes(pdfFile.size)}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowViewer(!showViewer)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    showViewer ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  {showViewer ? 'Hide Preview' : 'Preview PDF'}
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center flex-1">
              <div className="flex items-center gap-3 text-blue-600">
                <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span className="font-medium">Loading PDF...</span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              {error}
            </div>
          )}

          {!loading && (
            <div className="flex-1 overflow-hidden flex">
              {/* Main content: tool or drop zone */}
              <div className={`flex flex-col ${showViewer && pdfDoc ? 'w-1/2' : 'flex-1'} overflow-auto`}>
                {!pdfFile && activeTool !== 'merge' && activeTool !== 'convert' ? (
                  <DropZone onFile={handleFile} />
                ) : (
                  <ToolPanel activeTool={activeTool} pdfFile={pdfFile} pdfDoc={pdfDoc} pageCount={pageCount} />
                )}
              </div>

              {/* PDF Viewer panel */}
              {showViewer && pdfDoc && (
                <div className="w-1/2 border-l border-gray-200 flex flex-col">
                  <PDFViewer pdfDoc={pdfDoc} pageCount={pageCount} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
