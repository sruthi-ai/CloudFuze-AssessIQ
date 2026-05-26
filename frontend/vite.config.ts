import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@vladmandic/face-api'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Monaco Editor (~1MB) — only loaded on test-builder / code questions
          if (id.includes('@monaco-editor') || id.includes('monaco-editor')) return 'monaco'
          // React + router + tanstack — stable vendor chunk, cached long-term
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') ||
              id.includes('react-router') || id.includes('@tanstack')) return 'vendor-react'
          // Recharts + d3 — only on analytics page
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
