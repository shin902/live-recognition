import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Viteはレンダラープロセス専用に使用
// メインプロセス/preloadはtscでビルド
export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html'),
    },
  },
})
