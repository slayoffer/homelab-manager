import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'

const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
const commitDate = execSync('git log -1 --format=%ci').toString().trim().split(' ')[0]

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
