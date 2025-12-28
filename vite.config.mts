import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'path'

// Viteはレンダラープロセス専用に使用
// メインプロセス/preloadはtscでビルド
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: '../../node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
          dest: './'
        },
        {
          src: '../../node_modules/@ricky0123/vad-web/dist/*.onnx',
          dest: './'
        },
        {
          src: '../../node_modules/onnxruntime-web/dist/*.wasm',
          dest: './'
        },
        {
          src: '../../node_modules/onnxruntime-web/dist/*.mjs',
          dest: './'
        }
      ]
    })
  ],
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
