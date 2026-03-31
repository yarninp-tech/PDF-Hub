import MergeSplit from './tools/MergeSplit'
import Annotate from './tools/Annotate'
import FillForm from './tools/FillForm'
import Convert from './tools/Convert'

export default function ToolPanel({ activeTool }) {
  return (
    <div className="flex-1 overflow-auto">
      {activeTool === 'merge' && <MergeSplit />}
      {activeTool === 'annotate' && <Annotate />}
      {activeTool === 'fillform' && <FillForm />}
      {activeTool === 'convert' && <Convert />}
    </div>
  )
}
