import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/uploads': 'http://127.0.0.1:8787',
      '/api/video-proxy': 'http://127.0.0.1:8787',
    },
  },
})
