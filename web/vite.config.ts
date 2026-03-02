import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    return fallback
  }
  return parsed
}

const backendPort = parsePort(process.env.VITE_BACKEND_PORT, 8000)
const frontendPort = parsePort(process.env.VITE_FRONTEND_PORT, 3000)
const backendHttpTarget = `http://localhost:${backendPort}`
const backendWsTarget = `ws://localhost:${backendPort}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: frontendPort,
    host: '0.0.0.0',
    proxy: {
      '/api': backendHttpTarget,
      '/ws': {
        target: backendWsTarget,
        ws: true,
      },
    },
  },
})
