/** Clave localStorage para mantener sesión tras F5 (misma verificación que login contra Firestore). */
export const PORTAL_SESSION_KEY = 'lb_portal_session'

export function savePortalSession(lotNumber, password) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify({ lotNumber, password }))
}

export function clearPortalSession() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(PORTAL_SESSION_KEY)
}

export function readPortalSession() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PORTAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.lotNumber !== 'string' || typeof parsed.password !== 'string') return null
    return { lotNumber: parsed.lotNumber, password: parsed.password }
  } catch {
    return null
  }
}
