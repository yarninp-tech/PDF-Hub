import MergeSplit from './tools/MergeSplit'
import Annotate from './tools/Annotate'
import FillForm from './tools/FillForm'
import Convert from './tools/Convert'

export default function ToolPanel({ activeTool, pdfFile, pdfDoc, pageCount, onOpenFile }) {
  const fileProps = { pdfFile, pdfDoc, pageCount, onOpenFile }
  return (
    <div className="flex-1 overflow-auto h-full">
      {activeTool === 'merge' && <MergeSplit {...fileProps} />}
      {activeTool === 'annotate' && <Annotate {...fileProps} />}
      {activeTool === 'fillform' && <FillForm {...fileProps} />}
      {activeTool === 'convert' && <Convert {...fileProps} />}
    </div>
  )
}
