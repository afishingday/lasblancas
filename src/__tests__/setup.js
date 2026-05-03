import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Imagen de marca — evita errores de import en componentes
vi.mock('../brandAssets.js', () => ({ BRAND_LOGO_SRC: '/test-logo.png' }))

// Firebase — nunca debe ejecutarse en tests
vi.mock('../firebase.js', () => ({
  db: {},
  storage: {},
  analytics: null,
}))
