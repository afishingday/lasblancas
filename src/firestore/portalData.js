import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { deleteObject, getMetadata, listAll, ref } from 'firebase/storage'
import { db, storage } from '../firebase.js'
import { INITIAL_DATA, PORTAL_USERS_CONFIG_VERSION } from '../initialData.js'
import { TENANT } from '../tenant.config.js'

export const COLLECTION_NAMES = [
  'users',
  'settings',
  'news',
  'initiatives',
  'funds',
  'events',
  'services',
  'community',
  'mapLayers',
  'logs',
  'sharing',
]

/** Quita undefined (Firestore no los acepta). */
export function stripForFirestore(value) {
  return JSON.parse(JSON.stringify(value))
}

function docToRow(d) {
  const data = d.data()
  let { id } = data
  if (id === undefined) {
    const n = Number(d.id)
    id = Number.isNaN(n) ? d.id : n
  }
  const row = { ...data, id }
  // Los docs son `users/{lote}`; si falta el campo `lot` (datos legacy o merges), usar el id del documento.
  if (d.ref.parent.id === 'users') {
    const lotTrim = String(row.lot ?? '').trim()
    if (!lotTrim) {
      const n = Number(d.id)
      const fallbackLot = Number.isNaN(n) ? String(d.id) : String(d.id)
      return { ...row, lot: fallbackLot }
    }
  }
  return row
}

function sortRows(name, rows) {
  if (name === 'news' || name === 'sharing')
    return [...rows].sort((a, b) => Number(b.id) - Number(a.id))
  if (name === 'logs')
    return [...rows].sort((a, b) => {
      const na = typeof a.id === 'number' ? a.id : Number(a.id) || 0
      const nb = typeof b.id === 'number' ? b.id : Number(b.id) || 0
      return nb - na
    })
  if (name === 'events')
    return [...rows].sort((a, b) => {
      const ta = Date.parse(a.startsAt) || 0
      const tb = Date.parse(b.startsAt) || 0
      return ta - tb
    })
  if (name === 'settings')
    return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return rows
}

/**
 * Suscripción en tiempo real a todas las colecciones del portal.
 * @param {(fn: import('react').SetStateAction<any>) => void} setDb
 * @param {() => void} [onReady] — se llama una vez cuando llegó al menos un snapshot de cada colección
 */
export function subscribePortalDb(setDb, onReady) {
  const gotFirst = new Set()
  const mark = (name) => {
    gotFirst.add(name)
    if (gotFirst.size === COLLECTION_NAMES.length) onReady?.()
  }

  const unsubs = COLLECTION_NAMES.map((name) =>
    onSnapshot(
      collection(db, name),
      (snap) => {
        const rows = sortRows(
          name,
          snap.docs.map(docToRow),
        )
        setDb((prev) => ({ ...prev, [name]: rows }))
        mark(name)
      },
      (err) => {
        console.error(`Firestore [${name}]:`, err)
        mark(name)
      },
    ),
  )

  return () => unsubs.forEach((u) => u())
}

/** Colecciones a vaciar (no incluye `users`). */
const PURGE_COLLECTIONS = ['news', 'initiatives', 'funds', 'events', 'services', 'community', 'mapLayers', 'logs', 'sharing']

/** Carpetas de Storage bajo las que suelen guardarse portadas (noticias, votaciones, proyectos). */
const PURGE_STORAGE_ROOTS = ['news', 'initiatives', 'funds', 'maps', 'sharing']

async function deleteStorageFolderRecursive(folderPath) {
  const folderRef = ref(storage, folderPath)
  const list = await listAll(folderRef)
  await Promise.all(list.items.map((itemRef) => deleteObject(itemRef)))
  await Promise.all(list.prefixes.map((p) => deleteStorageFolderRecursive(p.fullPath)))
}

async function deleteAllDocumentsInCollection(collectionName) {
  const snap = await getDocs(collection(db, collectionName))
  const docs = snap.docs
  const chunkSize = 450
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db)
    docs.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

/**
 * Borra noticias, iniciativas, fondos, servicios, comunidad y bitácoras. No toca usuarios.
 * Intenta borrar también archivos en Storage bajo `news/`, `initiatives/` y `funds/`.
 * Solo debe usarse manualmente (consola, script o herramienta de mantenimiento), nunca al cargar la app en cliente.
 */
export async function purgePortalNonUserData() {
  for (const name of PURGE_COLLECTIONS) {
    await deleteAllDocumentsInCollection(name)
  }
  for (const root of PURGE_STORAGE_ROOTS) {
    try {
      await deleteStorageFolderRecursive(root)
    } catch (err) {
      console.warn(`[purge] Storage "${root}":`, err)
    }
  }
}

/** Si no hay usuarios, vuelca solo el padrón de usuarios (sin datos de contenido demo). */
export async function seedFirestoreIfEmpty() {
  const snap = await getDocs(collection(db, 'users'))
  if (!snap.empty) return

  const batch = writeBatch(db)
  const data = INITIAL_DATA

  data.users.forEach((u) => {
    batch.set(doc(db, 'users', u.lot), stripForFirestore(u))
  })

  await batch.commit()
}

/**
 * Crea usuarios nuevos del padrón cuando cambia PORTAL_USERS_CONFIG_VERSION.
 * Usuarios ya existentes en Firestore: no se tocan (password, role y demás datos se preservan).
 * Lotes nuevos en el padrón: documento completo con contraseña por defecto.
 *
 * El estado de sincronización se guarda en Firestore (`settings/__sync_meta__`) además del localStorage.
 * Así, el sync real solo corre una vez por versión globalmente, sin importar cuántos navegadores abran el portal.
 */
export async function syncUsersIfNeeded() {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem('lb_portal_users_ver') === PORTAL_USERS_CONFIG_VERSION) return

  // Si otro navegador ya hizo el sync de esta versión, solo actualizar el cache local y salir.
  const syncMetaRef = doc(db, 'settings', '__sync_meta__')
  const syncMeta = await getDoc(syncMetaRef)
  if (syncMeta.exists() && syncMeta.data()?.usersVersion === PORTAL_USERS_CONFIG_VERSION) {
    localStorage.setItem('lb_portal_users_ver', PORTAL_USERS_CONFIG_VERSION)
    return
  }

  const snap = await getDocs(collection(db, 'users'))
  const existingIds = new Set(snap.docs.map((d) => d.id))

  const batch = writeBatch(db)
  INITIAL_DATA.users.forEach((u) => {
    if (!existingIds.has(u.lot)) {
      batch.set(doc(db, 'users', u.lot), stripForFirestore(u))
    }
  })
  batch.set(syncMetaRef, { usersVersion: PORTAL_USERS_CONFIG_VERSION }, { merge: true })
  await batch.commit()
  localStorage.setItem('lb_portal_users_ver', PORTAL_USERS_CONFIG_VERSION)
}

/**
 * Cambia la contraseña del usuario (texto plano en Firestore, como el resto del portal).
 * Costo típico: 1 lectura + 1 escritura por operación (dentro del cupo gratuito de Firestore).
 */
export async function updateUserPlainPassword(lotNumber, currentPassword, newPassword) {
  const ref = doc(db, 'users', lotNumber)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('USER_NOT_FOUND')
  const data = snap.data()
  if (data.password !== currentPassword) throw new Error('WRONG_PASSWORD')
  const next = String(newPassword ?? '').trim()
  if (!next) throw new Error('INVALID_NEW_PASSWORD')
  await updateDoc(ref, { password: next })
}

/**
 * Fuerza la contraseña de un usuario (sin conocer la anterior).
 * Debe usarse solo desde UI superadmin y con reglas de Firestore que lo permitan.
 */
export async function forceUserPlainPassword(lotNumber, newPassword) {
  const ref = doc(db, 'users', lotNumber)
  const next = String(newPassword ?? '').trim()
  if (!next) throw new Error('INVALID_NEW_PASSWORD')
  await updateDoc(ref, { password: next })
}

/** Bloquea o desbloquea un usuario para impedirle iniciar sesión. */
export async function setUserBlockedStatus(lotNumber, blocked) {
  const ref = doc(db, 'users', lotNumber)
  await updateDoc(ref, { blocked: Boolean(blocked) })
}

/** Actualiza campos de perfil del usuario (finca, avatar, etc.). */
export async function updateUserProfile(lotNumber, partial) {
  const ref = doc(db, 'users', lotNumber)
  await setDoc(
    ref,
    stripForFirestore({
      lot: lotNumber,
      ...partial,
      profileUpdatedAt: Date.now(),
    }),
    { merge: true },
  )
}

export async function appendLog(entry) {
  const id = Date.now()
  await setDoc(doc(db, 'logs', String(id)), stripForFirestore({ ...entry, id }))
}

export async function addNewsPost(post) {
  await setDoc(doc(db, 'news', String(post.id)), stripForFirestore(post))
}

export async function updateNewsPost(post) {
  await setDoc(doc(db, 'news', String(post.id)), stripForFirestore(post))
}

export async function deleteNewsPost(id) {
  await deleteDoc(doc(db, 'news', String(id)))
}

export async function setNewsPostSuppressed(id, suppressed) {
  await updateDoc(doc(db, 'news', String(id)), { adminSuppressed: Boolean(suppressed) })
}

export async function saveInitiative(init) {
  await setDoc(doc(db, 'initiatives', String(init.id)), stripForFirestore(init))
}

export async function deleteInitiative(id) {
  await deleteDoc(doc(db, 'initiatives', String(id)))
}

export async function setInitiativeSuppressed(id, suppressed) {
  await updateDoc(doc(db, 'initiatives', String(id)), { adminSuppressed: Boolean(suppressed) })
}

export async function convertInitiativeToFund(initiative, newProject) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'funds', String(newProject.id)), stripForFirestore(newProject))
  batch.update(doc(db, 'initiatives', String(initiative.id)), {
    convertedToProject: true,
  })
  await batch.commit()
}

export async function updateFundStatus(id, status) {
  await updateDoc(doc(db, 'funds', String(id)), { status })
}

export async function updateFundRaisedGoal(id, raised, goal) {
  await updateDoc(doc(db, 'funds', String(id)), { raised, goal })
}

export async function addFund(fund) {
  await setDoc(doc(db, 'funds', String(fund.id)), stripForFirestore(fund))
}

export async function deleteFund(id) {
  await deleteDoc(doc(db, 'funds', String(id)))
}

export async function upsertPortalEvent(ev) {
  await setDoc(doc(db, 'events', String(ev.id)), stripForFirestore(ev))
}

export async function deletePortalEvent(id) {
  await deleteDoc(doc(db, 'events', String(id)))
}

const PUBLIC_SETTINGS_DOC_ID = 'public'

const DEFAULT_PUBLIC_SETTINGS = {
  id: PUBLIC_SETTINGS_DOC_ID,
  ...TENANT.defaults,
  portalNavOrder: null,
  portalNavHidden: [],
}

/** Crea el documento de datos públicos del portal si no existe (trabajador, cuota, pagos, etc.). */
export async function ensurePublicSettings() {
  const ref = doc(db, 'settings', PUBLIC_SETTINGS_DOC_ID)
  const snap = await getDoc(ref)
  if (!snap.exists()) await setDoc(ref, stripForFirestore(DEFAULT_PUBLIC_SETTINGS))
}

export async function savePublicSettings(partial) {
  const ref = doc(db, 'settings', PUBLIC_SETTINGS_DOC_ID)
  await setDoc(
    ref,
    stripForFirestore({
      id: PUBLIC_SETTINGS_DOC_ID,
      updatedAt: Date.now(),
      ...partial,
    }),
    { merge: true },
  )
}

export async function upsertDirectoryRow(tableKey, row) {
  const col = tableKey === 'services' ? 'services' : 'community'
  await setDoc(doc(db, col, String(row.id)), stripForFirestore(row))
}

export async function deleteDirectoryRow(tableKey, id) {
  const col = tableKey === 'services' ? 'services' : 'community'
  await deleteDoc(doc(db, col, String(id)))
}

export async function upsertMapLayer(layer) {
  await setDoc(doc(db, 'mapLayers', String(layer.id)), stripForFirestore(layer))
}

export async function deleteMapLayer(id) {
  await deleteDoc(doc(db, 'mapLayers', String(id)))
}

export async function addSharingPost(post) {
  await setDoc(doc(db, 'sharing', String(post.id)), stripForFirestore(post))
}

export async function updateSharingPost(post) {
  await setDoc(doc(db, 'sharing', String(post.id)), stripForFirestore(post))
}

export async function deleteSharingPost(id) {
  await deleteDoc(doc(db, 'sharing', String(id)))
}

const GUIDE_STATS_DOC = 'guideStats'
const GUIDE_IDS = ['flora', 'peces', 'anfibios', 'mamiferos']

function blankGuideStats() {
  const obj = { id: GUIDE_STATS_DOC }
  GUIDE_IDS.forEach((id) => { obj[id] = { views: 0, downloads: 0, reactions: {} } })
  return obj
}

export async function recordGuideInteraction(guideId, field) {
  const r = doc(db, 'settings', GUIDE_STATS_DOC)
  try {
    await updateDoc(r, { [`${guideId}.${field}`]: increment(1) })
  } catch {
    const init = blankGuideStats()
    init[guideId][field] = 1
    await setDoc(r, stripForFirestore(init))
  }
}

export async function toggleGuideReaction(guideId, emoji, delta) {
  const r = doc(db, 'settings', GUIDE_STATS_DOC)
  try {
    await updateDoc(r, { [`${guideId}.reactions.${emoji}`]: increment(delta) })
  } catch {
    if (delta <= 0) return
    const init = blankGuideStats()
    init[guideId].reactions[emoji] = 1
    await setDoc(r, stripForFirestore(init))
  }
}

const STORAGE_ROOTS = ['news', 'initiatives', 'funds', 'maps', 'sharing']

async function listFilesRecursive(folderRef) {
  const items = []
  const list = await listAll(folderRef)
  items.push(...list.items)
  for (const prefix of list.prefixes) {
    const nested = await listFilesRecursive(prefix)
    items.push(...nested)
  }
  return items
}

export async function acceptTerms(userId, version) {
  await updateDoc(doc(db, 'users', String(userId)), {
    termsAcceptedVersion: version,
    termsAcceptedAt: Date.now(),
  })
}

export async function getStorageUsage() {
  const byFolder = {}
  let totalBytes = 0
  let totalFiles = 0
  for (const root of STORAGE_ROOTS) {
    const items = await listFilesRecursive(ref(storage, root))
    let folderBytes = 0
    for (const item of items) {
      try {
        const meta = await getMetadata(item)
        folderBytes += meta.size || 0
      } catch {}
    }
    byFolder[root] = { bytes: folderBytes, count: items.length }
    totalBytes += folderBytes
    totalFiles += items.length
  }
  return { totalBytes, totalFiles, byFolder, checkedAt: Date.now() }
}
