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
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Pisahkan pustaka besar yang jarang berubah → cache browser awet antar-deploy,
        // dan halaman tidak perlu mengunduh ulang vendor bila hanya kode aplikasi yang berubah.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (/node_modules\/(recharts|d3-[^/]+|victory-vendor|recharts-scale|internmap)\//.test(id)) return 'vendor-charts'
        },
      },
    },
  },
})
