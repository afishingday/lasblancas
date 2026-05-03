import { db as defaultFirestore } from '../firebase.js'
import { useReactionsSubscription } from '../reactions/useReactionsSubscription.js'
import { DEFAULT_REACTION_DEFINITIONS } from '../reactions/reactionConstants.js'
import '../reactions/reactionBar.css'

export { EMPTY_REACTIONS, DEFAULT_REACTION_DEFINITIONS as REACTIONS } from '../reactions/reactionConstants.js'

const DEFAULT_APP_CONTEXT = 'lasBlancas'

const THEME_VAR_MAP = {
  inactiveBg: '--rx-inactive-bg',
  inactiveBorder: '--rx-inactive-border',
  inactiveText: '--rx-inactive-text',
  inactiveHoverBg: '--rx-inactive-hover-bg',
  inactiveHoverBorder: '--rx-inactive-hover-border',
  activeBg: '--rx-active-bg',
  activeBorder: '--rx-active-border',
  activeText: '--rx-active-text',
  activeShadow: '--rx-active-shadow',
}

/**
 * Barra de reacciones conectada en vivo a Firestore (`reactions` en el documento del contenido).
 *
 * @param {import('firebase/firestore').Firestore} [firestoreDb] — por defecto la instancia del proyecto
 * @param {string} [appContext='lasBlancas'] — registrado en `src/reactions/registry.js`
 * @param {'news'|'sharing'|'initiative'} contentType
 * @param {string|number} contentId
 * @param {string} [userId] — o `currentUserLot` (alias)
 * @param {Array<{key:string,emoji:string,label:string}>} [reactionDefinitions]
 * @param {Record<string,string>} [themeTokens] — sobrescribe variables CSS (ver reactionBar.css)
 * @param {string} [className] — clases Tailwind extra en el contenedor
 */
export default function ReactionBar({
  firestoreDb = defaultFirestore,
  appContext = DEFAULT_APP_CONTEXT,
  contentType,
  contentId,
  userId: userIdProp,
  currentUserLot,
  reactionDefinitions = DEFAULT_REACTION_DEFINITIONS,
  themeTokens,
  className = '',
}) {
  const userId = userIdProp ?? currentUserLot ?? ''
  const { reactions, toggle, pendingKey } = useReactionsSubscription({
    firestoreDb,
    appContext,
    contentType,
    contentId,
    userId,
  })

  if (contentId == null || String(contentId) === '') return null

  const style = {}
  if (themeTokens && typeof themeTokens === 'object') {
    for (const [k, cssVar] of Object.entries(THEME_VAR_MAP)) {
      if (themeTokens[k] != null) style[cssVar] = themeTokens[k]
    }
  }

  return (
    <div
      className={`portal-reactions ${className}`.trim()}
      style={style}
      data-app-context={appContext}
      data-content-type={contentType}
      data-content-id={String(contentId)}
    >
      {reactionDefinitions.map(({ key, emoji, label }) => {
        const users = Array.isArray(reactions?.[key]) ? reactions[key] : []
        const active = Boolean(userId && users.includes(userId))
        const busy = pendingKey === key
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (!userId) return
              void toggle(key)
            }}
            disabled={busy || !userId}
            title={label}
            aria-label={`${label} — ${users.length} reacción${users.length === 1 ? '' : 'es'}`}
            className={`portal-reactions__btn ${active ? 'portal-reactions__btn--active' : ''} ${busy ? 'opacity-60 pointer-events-none' : ''}`.trim()}
          >
            <span>{emoji}</span>
            {users.length > 0 && <span className="portal-reactions__count">{users.length}</span>}
          </button>
        )
      })}
    </div>
  )
}
