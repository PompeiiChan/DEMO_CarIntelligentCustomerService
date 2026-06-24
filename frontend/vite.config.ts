import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_BACKEND_PROXY_TARGET ?? 'http://localhost:8199'
const wsTarget = backendTarget.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5185,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5185,
  },
})
