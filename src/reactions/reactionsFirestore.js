import { onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { normalizeReactions } from './reactionConstants.js'

/**
 * Escucha el campo `reactions` del documento en tiempo real.
 * @param {import('firebase/firestore').DocumentReference} docRef
 * @param {(reactions: Record<string, string[]>) => void} onReactions
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeReactionsOnDocument(docRef, onReactions, onError) {
  return onSnapshot(
    docRef,
    (snap) => {
      const data = snap.exists() ? snap.data() : {}
      onReactions(normalizeReactions(data.reactions))
    },
    (err) => {
      console.error('[reactions] onSnapshot', err)
      onError?.(err)
    },
  )
}

/**
 * Alterna la presencia de userId en reactions[reactionKey] con arrayUnion/arrayRemove.
 * @param {import('firebase/firestore').DocumentReference} docRef
 * @param {string} userId
 * @param {string} reactionKey
 * @param {boolean} userHasReacted — si true, se quita; si false, se añade
 */
export async function toggleUserReactionOnDocument(docRef, userId, reactionKey, userHasReacted) {
  const path = `reactions.${reactionKey}`
  await updateDoc(docRef, {
    [path]: userHasReacted ? arrayRemove(userId) : arrayUnion(userId),
  })
}
