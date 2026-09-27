import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        jardim: resolve(__dirname, 'jardim/index.html'),
      },
      output: {
        // three/r3f isolados: o site principal não baixa nada de 3D
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
          if (/node_modules\/three\//.test(id)) return 'three'
          if (/@react-three|postprocessing|three-stdlib|troika|maath|camera-controls|meshline|zustand|its-fine|suspend-react/.test(id)) return 'r3f'
        },
      },
    },
  },
})
