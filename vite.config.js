import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // site + protótipo da flor em 3D em tempo real (/flor)
      input: { main: 'index.html', flor: 'flor.html' },
      output: {
        // three em chunk próprio (cache estável entre deploys)
        manualChunks(id) {
          if (id.includes('preload-helper') || id.includes('modulepreload-polyfill')) return 'vite'
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (/node_modules\/three\//.test(id)) return 'three'
        },
      },
    },
  },
})
