import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // three/r3f isolados: só são baixados no final (buquê)
        manualChunks(id) {
          // o helper de preload do Vite não pode cair no chunk do three
          if (id.includes('preload-helper') || id.includes('modulepreload-polyfill')) return 'vite'
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (/node_modules\/three\//.test(id)) return 'three'
          if (/@react-three|postprocessing|three-stdlib|troika|maath|camera-controls|meshline|zustand|its-fine|suspend-react/.test(id)) return 'r3f'
        },
      },
    },
  },
})
