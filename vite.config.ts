import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

/** 빌드 날짜 (KST, YYYY-MM-DD) — 하단 바 표시 */
const buildDate = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  server: { proxy: { '/api': 'http://localhost:3000' } }, // `vercel dev --listen 3000`
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
})
