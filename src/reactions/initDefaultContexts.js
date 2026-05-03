import { registerAppContext } from './registry.js'

/** Registra el mapa por defecto de Las Blancas (una vez al cargar el módulo). */
registerAppContext('lasBlancas', {
  news: { collection: 'news' },
  sharing: { collection: 'sharing' },
  initiative: { collection: 'initiatives' },
})
