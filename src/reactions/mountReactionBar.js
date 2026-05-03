/**
 * Inicialización Vanilla JS del bloque de reacciones (portable a otros sitios).
 * Requiere Firebase v9+ modular y el mismo patrón de datos: campo `reactions` en el documento.
 */
import './initDefaultContexts.js'
import './reactionBar.css'
import { getContentDocumentRef } from './registry.js'
import { subscribeReactionsOnDocument, toggleUserReactionOnDocument } from './reactionsFirestore.js'
import { DEFAULT_REACTION_DEFINITIONS, normalizeReactions } from './reactionConstants.js'

function applyThemeTokens(el, theme) {
  if (!theme || typeof theme !== 'object') return
  const map = {
    inactiveBg: '--rx-inactive-bg',
    inactiveBorder: '--rx-inactive-border',
    inactiveText: '--rx-inactive-text',
    activeBg: '--rx-active-bg',
    activeBorder: '--rx-active-border',
    activeText: '--rx-active-text',
  }
  for (const [k, cssVar] of Object.entries(map)) {
    if (theme[k] != null) el.style.setProperty(cssVar, String(theme[k]))
  }
}

/**
 * Monta la barra de reacciones dentro de `container` (HTMLElement).
 *
 * @param {HTMLElement} container
 * @param {object} options
 * @param {import('firebase/firestore').Firestore} options.db — instancia Firestore ya inicializada
 * @param {string} options.appContext — ej. 'lasBlancas' (o el que hayas registrado con registerAppContext)
 * @param {string} options.contentType — ej. 'news' | 'sharing' | 'initiative'
 * @param {string|number} options.contentId — id del documento
 * @param {string} options.userId — identificador del usuario (ej. lote)
 * @param {Array<{key:string,emoji:string,label:string}>} [options.reactionsDefinition]
 * @param {Record<string,string>} [options.theme] — tokens opcionales (inactiveBg, activeBg, …)
 * @param {(err: Error) => void} [options.onError]
 * @returns {{ unmount: () => void, getReactions: () => object }}
 */
export function mountReactionBar(container, options) {
  if (!container || !(container instanceof HTMLElement)) {
    throw new TypeError('mountReactionBar: container debe ser un HTMLElement')
  }
  const {
    db,
    appContext,
    contentType,
    contentId,
    userId,
    reactionsDefinition = DEFAULT_REACTION_DEFINITIONS,
    theme = {},
    onError,
  } = options

  const docRef = getContentDocumentRef(db, appContext, contentType, contentId)
  const root = document.createElement('div')
  root.className = 'portal-reactions'
  root.setAttribute('data-app-context', String(appContext))
  root.setAttribute('data-content-type', String(contentType))
  applyThemeTokens(root, theme)
  container.innerHTML = ''
  container.appendChild(root)

  let latest = normalizeReactions({})

  const render = () => {
    root.innerHTML = ''
    for (const { key, emoji, label } of reactionsDefinition) {
      const users = Array.isArray(latest[key]) ? latest[key] : []
      const active = userId && users.includes(userId)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'portal-reactions__btn' + (active ? ' portal-reactions__btn--active' : '')
      btn.title = label
      btn.setAttribute('aria-label', `${label} — ${users.length} reacción${users.length === 1 ? '' : 'es'}`)
      const emojiSpan = document.createElement('span')
      emojiSpan.textContent = emoji
      btn.appendChild(emojiSpan)
      if (users.length > 0) {
        const c = document.createElement('span')
        c.className = 'portal-reactions__count'
        c.textContent = String(users.length)
        btn.appendChild(c)
      }
      btn.addEventListener('click', async () => {
        if (!userId) return
        const listNow = Array.isArray(latest[key]) ? latest[key] : []
        const isActive = listNow.includes(userId)
        try {
          await toggleUserReactionOnDocument(docRef, userId, key, isActive)
        } catch (err) {
          console.error(err)
          onError?.(err)
        }
      })
      root.appendChild(btn)
    }
  }

  const unsub = subscribeReactionsOnDocument(
    docRef,
    (r) => {
      latest = normalizeReactions(r)
      render()
    },
    onError,
  )

  render()

  return {
    unmount: () => {
      unsub()
      root.remove()
      container.innerHTML = ''
    },
    getReactions: () => ({ ...latest }),
  }
}
