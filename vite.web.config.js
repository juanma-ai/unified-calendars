import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => mode === 'server' ? {
  build: { ssr: 'src/server/index.mjs', outDir: 'dist/server', target: 'node22', rollupOptions: { output: { entryFileNames: 'index.mjs' } } },
  ssr: { noExternal: true }
} : {
  root: 'src/web',
  plugins: [react()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  resolve: { dedupe: ['react', 'react-dom'] }
})
