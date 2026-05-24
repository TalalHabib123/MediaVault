import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const webHost = process.env.MEDIAVAULT_WEB_HOST || "localhost"
const apiTarget = process.env.MEDIAVAULT_API_TARGET || "http://localhost:5000"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: webHost,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
})
