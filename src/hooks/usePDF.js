import { useState, useCallback } from 'react'
import { loadPDF, validateFile } from '../utils/pdfUtils'

export function usePDF() {
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [pdfBytes, setPdfBytes] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const openFile = useCallback(async (file) => {
    setError(null)
    setLoading(true)
    try {
      validateFile(file)
      const { pdfDoc: doc, bytes } = await loadPDF(file)
      setPdfFile(file)
      setPdfDoc(doc)
      setPdfBytes(bytes)
      setPageCount(doc.numPages)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const closeFile = useCallback(() => {
    setPdfFile(null)
    setPdfDoc(null)
    setPdfBytes(null)
    setPageCount(0)
    setError(null)
  }, [])

  return {
    pdfFile,
    pdfDoc,
    pdfBytes,
    pageCount,
    loading,
    error,
    openFile,
    closeFile,
    setError,
  }
}
