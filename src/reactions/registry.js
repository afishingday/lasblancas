import { doc } from 'firebase/firestore'

/**
 * Registro de rutas de contenido por appContext.
 * `contentType` → `{ collection: string }` (documento = contentId).
 */
const contexts = new Map()

/**
 * @param {string} appContext — ej. 'lasBlancas', 'espacioPesca'
 * @param {Record<string, { collection: string }>} contentTypes
 */
export function registerAppContext(appContext, contentTypes) {
  if (!appContext || typeof contentTypes !== 'object') return
  contexts.set(String(appContext), { ...contentTypes })
}

export function getRegisteredContext(appContext) {
  const c = contexts.get(String(appContext))
  if (!c) throw new Error(`[reactions] appContext no registrado: "${appContext}". Usa registerAppContext().`)
  return c
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} appContext
 * @param {string} contentType — ej. 'news', 'sharing', 'initiative'
 * @param {string|number} contentId
 * @returns {import('firebase/firestore').DocumentReference}
 */
export function getContentDocumentRef(db, appContext, contentType, contentId) {
  const ctx = getRegisteredContext(appContext)
  const cfg = ctx[String(contentType)]
  if (!cfg?.collection) {
    throw new Error(`[reactions] contentType desconocido "${contentType}" para appContext "${appContext}"`)
  }
  return doc(db, cfg.collection, String(contentId))
}
