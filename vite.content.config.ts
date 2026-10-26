import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      name: 'TabButlerExtractor',
      formats: ['iife'],
      fileName: () => 'content-extractor.js',
    },
  },
})
