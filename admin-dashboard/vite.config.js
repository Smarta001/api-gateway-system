import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/auth':      { target: 'http://localhost:8080', changeOrigin: true },
      '/admin':     { target: 'http://localhost:8080', changeOrigin: true },
      '/api':       { target: 'http://localhost:8080', changeOrigin: true },
      '/summary':   { target: 'http://localhost:8000', changeOrigin: true },
      '/timeseries':{ target: 'http://localhost:8000', changeOrigin: true },
      '/services':  { target: 'http://localhost:8000', changeOrigin: true },
      '/users-stats':{ target: 'http://localhost:8000', changeOrigin: true },
      '/anomalies': { target: 'http://localhost:8000', changeOrigin: true },
      '/health':    { target: 'http://localhost:8000', changeOrigin: true },
    }
  }
})
