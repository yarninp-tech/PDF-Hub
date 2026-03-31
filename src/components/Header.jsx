export default function Header({ pdfFile, onClose }) {
  return (
    <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <svg className="w-8 h-8 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
          <path d="M8 12h8v1.5H8zm0 3h8v1.5H8zm0 3h5v1.5H8z"/>
        </svg>
        <span className="text-xl font-bold tracking-wide text-white">
          PDF <span className="text-blue-400">HUB</span>
        </span>
      </div>

      {pdfFile && (
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2 bg-slate-700 px-3 py-1.5 rounded-full">
            <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            </svg>
            <span className="text-gray-200 max-w-xs truncate">{pdfFile.name}</span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 transition-colors px-3 py-1.5 rounded-full text-white text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      )}
    </header>
  )
}
