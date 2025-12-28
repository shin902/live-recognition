import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'src/main/index.ts'),
        preload: path.resolve(__dirname, 'src/main/preload.ts'),
        renderer: path.resolve(__dirname, 'src/renderer/index.html'),
      },
      external: ['electron', 'dotenv', 'path', 'fs'],
      output: [
        {
          dir: 'dist/main',
          format: 'cjs',
          entryFileNames: '[name].js',
        },
        {
          dir: 'dist/renderer',
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      ],
    },
  },
})
