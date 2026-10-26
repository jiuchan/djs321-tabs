import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json'

const logger = createLogger()
const _warn = logger.warn.bind(logger)
logger.warn = (msg, opts) => {
  // crxjs 2.x 在 Vite 8 下同时生成两套选项，属已知兼容问题，忽略此警告
  if (msg.includes('rollupOptions') && msg.includes('rolldownOptions')) return
  _warn(msg, opts)
}

export default defineConfig({
  customLogger: logger,
  plugins: [react(), crx({ manifest })],
  build: { outDir: 'dist' },
})
