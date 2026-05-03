/** Definición de reacciones (clave, emoji, etiqueta accesible). */
export const DEFAULT_REACTION_DEFINITIONS = [
  { key: 'heart', emoji: '❤️', label: 'Me encanta' },
  { key: 'clap', emoji: '👏', label: 'Aplausos' },
  { key: 'wow', emoji: '😮', label: 'Sorprendido' },
  { key: 'seedling', emoji: '🌱', label: 'Buenísimo' },
]

export const REACTION_KEYS = DEFAULT_REACTION_DEFINITIONS.map((r) => r.key)

export const EMPTY_REACTIONS = Object.fromEntries(REACTION_KEYS.map((k) => [k, []]))

/** Fusiona datos de Firestore con la forma esperada (arrays por clave). */
export function normalizeReactions(raw) {
  const out = { ...EMPTY_REACTIONS }
  if (!raw || typeof raw !== 'object') return out
  for (const k of REACTION_KEYS) {
    const v = raw[k]
    out[k] = Array.isArray(v) ? [...v] : []
  }
  return out
}
