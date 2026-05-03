import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

const buildStampParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).formatToParts(new Date())

const buildStampDate = buildStampParts
  .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
  .map((part) => part.value)
  .join('-')

const buildStampTime = buildStampParts
  .filter((part) => part.type === 'hour' || part.type === 'minute')
  .map((part) => part.value)
  .join(':')

const buildStamp = `${buildStampDate} ${buildStampTime} COT`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
    __APP_BUILD_STAMP__: JSON.stringify(buildStamp),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/shared/utils.js', 'src/features/**/*.{js,jsx}'],
      exclude: ['**/*.test.{js,jsx}', 'src/__tests__/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/firebase/')) return 'firebase'
          if (id.includes('/lucide-react/')) return 'icons'
          if (id.includes('/react-dom/')) return 'react-dom'
          if (id.includes('/react/')) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
