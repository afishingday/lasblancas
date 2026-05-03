/**
 * Sistema modular de reacciones (Firestore + UI).
 *
 * Otro proyecto (ej. Espacio de Pesca):
 * 1. import { registerAppContext, mountReactionBar } from '.../reactions'
 * 2. registerAppContext('espacioPesca', { articulo: { collection: 'articulos' } })
 * 3. mountReactionBar(document.querySelector('#rx'), { db, appContext: 'espacioPesca', contentType: 'articulo', contentId, userId })
 */
import './initDefaultContexts.js'

export { registerAppContext, getContentDocumentRef, getRegisteredContext } from './registry.js'
export {
  DEFAULT_REACTION_DEFINITIONS,
  REACTION_KEYS,
  EMPTY_REACTIONS,
  normalizeReactions,
} from './reactionConstants.js'
export { subscribeReactionsOnDocument, toggleUserReactionOnDocument } from './reactionsFirestore.js'
export { mountReactionBar } from './mountReactionBar.js'
export { useReactionsSubscription } from './useReactionsSubscription.js'
