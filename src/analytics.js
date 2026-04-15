import { getAnalytics, isSupported, logEvent, setUserId, setUserProperties } from 'firebase/analytics'
import { app } from './firebase.js'

const hasMeasurementId = Boolean(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID)
let analyticsPromise = null

async function getClientAnalytics() {
  if (typeof window === 'undefined') return null
  if (!hasMeasurementId) return null
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      try {
        const supported = await isSupported()
        if (!supported) return null
        return getAnalytics(app)
      } catch (err) {
        console.warn('[analytics] no disponible:', err)
        return null
      }
    })()
  }
  return analyticsPromise
}

export async function trackPortalEvent(name, params = {}) {
  const analytics = await getClientAnalytics()
  if (!analytics) return
  try {
    logEvent(analytics, name, params)
  } catch (err) {
    console.warn('[analytics] error logEvent:', err)
  }
}

export async function setPortalAnalyticsUser(user) {
  const analytics = await getClientAnalytics()
  if (!analytics) return
  try {
    setUserId(analytics, user?.lotNumber || null)
    if (user?.role) setUserProperties(analytics, { role: user.role })
  } catch (err) {
    console.warn('[analytics] error setUser:', err)
  }
}
