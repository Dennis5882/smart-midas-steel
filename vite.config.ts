import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  server: { proxy: { '/api': 'http://localhost:3000' } }, // `vercel dev --listen 3000`
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
