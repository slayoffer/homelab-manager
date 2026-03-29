import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

let commitHash = 'dev'
let commitDate = new Date().toISOString().split('T')[0]
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim()
  commitDate = execSync('git log -1 --format=%ci').toString().trim().split(' ')[0]
} catch { /* no git available (Docker build) */ }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${commitDate} (${commitHash})`),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3456',
      '/ws': {
        target: 'ws://localhost:3456',
        ws: true,
      },
    },
  },
})
