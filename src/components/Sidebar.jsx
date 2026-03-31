const tools = [
  { id: 'merge', label: 'Merge & Split', icon: '📄' },
  { id: 'annotate', label: 'Annotate', icon: '✏️' },
  { id: 'fillform', label: 'Fill Form', icon: '📝' },
  { id: 'convert', label: 'Convert', icon: '🔄' },
]

export default function Sidebar({ activeTool, onToolChange }) {
  return (
    <aside className="w-56 bg-slate-800 flex flex-col py-4 gap-1">
      <p className="text-xs uppercase tracking-widest text-slate-400 px-4 mb-2">Tools</p>
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`flex items-center gap-3 mx-2 px-4 py-3 rounded-lg text-left transition-all ${
            activeTool === tool.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
          }`}
        >
          <span className="text-lg">{tool.icon}</span>
          <span className="text-sm font-medium">{tool.label}</span>
        </button>
      ))}
    </aside>
  )
}
