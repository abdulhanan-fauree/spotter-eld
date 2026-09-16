import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // '@/…' beats '../../..' — imports stay stable when a file moves.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Proxy to Django in development so the browser sees a single origin and
    // CORS never enters the picture.
    proxy: { '/api': { target: 'http://127.0.0.1:8077', changeOrigin: true } },
  },
})
