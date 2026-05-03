import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import './initDefaultContexts.js'
import { getContentDocumentRef } from './registry.js'
import { subscribeReactionsOnDocument, toggleUserReactionOnDocument } from './reactionsFirestore.js'
import { EMPTY_REACTIONS, normalizeReactions } from './reactionConstants.js'

/**
 * Suscripción en vivo al campo `reactions` de un documento de contenido.
 * @param {object} opts
 * @param {import('firebase/firestore').Firestore} opts.firestoreDb
 * @param {string} opts.appContext
 * @param {string} opts.contentType
 * @param {string|number} opts.contentId
 * @param {string} opts.userId
 */
export function useReactionsSubscription({ firestoreDb, appContext, contentType, contentId, userId }) {
  const [reactions, setReactions] = useState(() => ({ ...EMPTY_REACTIONS }))
  const reactionsRef = useRef(reactions)
  reactionsRef.current = reactions
  const [error, setError] = useState(null)
  const [pendingKey, setPendingKey] = useState(null)

  const docRef = useMemo(() => {
    if (!firestoreDb || contentId == null || String(contentId) === '') return null
    try {
      return getContentDocumentRef(firestoreDb, appContext, contentType, contentId)
    } catch (e) {
      console.warn(e)
      return null
    }
  }, [firestoreDb, appContext, contentType, contentId])

  useEffect(() => {
    if (!docRef) return undefined
    setError(null)
    return subscribeReactionsOnDocument(
      docRef,
      (r) => setReactions(normalizeReactions(r)),
      (err) => setError(err),
    )
  }, [docRef])

  const toggle = useCallback(
    async (reactionKey) => {
      if (!docRef || !userId) return
      const list = reactionsRef.current[reactionKey] || []
      const active = list.includes(userId)
      setPendingKey(reactionKey)
      try {
        await toggleUserReactionOnDocument(docRef, userId, reactionKey, active)
      } catch (e) {
        console.error(e)
        setError(e)
      } finally {
        setPendingKey(null)
      }
    },
    [docRef, userId],
  )

  return { reactions, toggle, error, pendingKey }
}
