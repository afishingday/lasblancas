import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { deleteObject, listAll, ref } from 'firebase/storage'
import { db, storage } from '../firebase.js'
import { INITIAL_DATA, PORTAL_USERS_CONFIG_VERSION } from '../initialData.js'

export const COLLECTION_NAMES = [
  'users',
  'news',
  'initiatives',
  'funds',
  'services',
  'community',
  'mapLayers',
  'logs',
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
  return { ...data, id }
}

function sortRows(name, rows) {
  if (name === 'news')
    return [...rows].sort((a, b) => Number(b.id) - Number(a.id))
  if (name === 'logs')
    return [...rows].sort((a, b) => {
      const na = typeof a.id === 'number' ? a.id : Number(a.id) || 0
      const nb = typeof b.id === 'number' ? b.id : Number(b.id) || 0
      return nb - na
    })
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
const PURGE_COLLECTIONS = ['news', 'initiatives', 'funds', 'services', 'community', 'mapLayers', 'logs']

/** Carpetas de Storage bajo las que suelen guardarse portadas (noticias, votaciones, proyectos). */
const PURGE_STORAGE_ROOTS = ['news', 'initiatives', 'funds', 'maps']

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
 * Crea o actualiza todos los usuarios del padrón (merge) cuando cambia PORTAL_USERS_CONFIG_VERSION.
 * Usuarios ya existentes: solo actualiza `lot` y `role` (no toca `password`, para no revertir cambios de clave).
 * Lotes nuevos en el padrón: documento completo con contraseña por defecto.
 */
export async function syncUsersIfNeeded() {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem('lb_portal_users_ver') === PORTAL_USERS_CONFIG_VERSION) return

  const snap = await getDocs(collection(db, 'users'))
  const existingIds = new Set(snap.docs.map((d) => d.id))

  const batch = writeBatch(db)
  INITIAL_DATA.users.forEach((u) => {
    if (existingIds.has(u.lot)) {
      batch.set(doc(db, 'users', u.lot), stripForFirestore({ lot: u.lot, role: u.role }), { merge: true })
    } else {
      batch.set(doc(db, 'users', u.lot), stripForFirestore(u))
    }
  })
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

export async function saveInitiative(init) {
  await setDoc(doc(db, 'initiatives', String(init.id)), stripForFirestore(init))
}

export async function deleteInitiative(id) {
  await deleteDoc(doc(db, 'initiatives', String(id)))
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
