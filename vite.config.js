import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // pdfjs-dist v4+ is pure ESM — pre-bundling it causes worker resolution issues
    exclude: ['pdfjs-dist'],
  },
})
