import { saveAs } from 'file-saver'

export function downloadBlob(blob, filename) {
  saveAs(blob, filename)
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  saveAs(blob, filename)
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function getBaseName(filename) {
  return filename.replace(/\.[^.]+$/, '')
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function parsePageRanges(rangeStr, totalPages) {
  const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean)
  const pages = new Set()
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10))
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range: "${part}"`)
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= totalPages) pages.add(i)
      }
    } else {
      const n = parseInt(part, 10)
      if (isNaN(n)) throw new Error(`Invalid page number: "${part}"`)
      if (n >= 1 && n <= totalPages) pages.add(n)
    }
  }
  return [...pages].sort((a, b) => a - b)
}
