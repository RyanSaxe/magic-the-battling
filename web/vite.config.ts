import fs from 'node:fs'
import path from 'node:path'
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

function loadLocalCerts(): { key: Buffer; cert: Buffer } | undefined {
  const certDir = path.resolve(__dirname, 'certs')
  const certPath = path.join(certDir, 'dev.pem')
  const keyPath = path.join(certDir, 'dev-key.pem')
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  }
  return undefined
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
    https: loadLocalCerts(),
    proxy: {
      '/api': backendHttpTarget,
      '/ws': {
        target: backendWsTarget,
        ws: true,
      },
    },
  },
})
