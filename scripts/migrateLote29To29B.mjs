/**
 * Migración puntual: todo lo registrado como Lote29 → Lote29B.
 * - users: fusiona users/Lote29 en users/Lote29B y borra Lote29 (conserva contraseña/rol de 29B si ya existía).
 * - news, initiatives, funds, events, services, community, mapLayers, logs, settings: reemplazo seguro en strings y estructuras anidadas.
 *
 * Uso (desde la raíz del repo, con .env configurado):
 *   node scripts/migrateLote29To29B.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase/app'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  writeBatch,
} from 'firebase/firestore'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const SOURCE_LOT = 'Lote29'
const TARGET_LOT = 'Lote29B'

function readEnvFile(name) {
  const p = path.join(root, name)
  if (!fs.existsSync(p)) return {}
  const out = {}
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    out[key] = val
  }
  return out
}

function stripForFirestore(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Sustituye el identificador de lote sin tocar Lote29B ni Lote294, etc. */
function migrateLotInString(str) {
  if (typeof str !== 'string') return str
  return str.replace(/\bLote29\b/gi, TARGET_LOT)
}

function deepMigrate(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') return migrateLotInString(obj)
  if (typeof obj !== 'object') return obj
  if (obj instanceof Timestamp) return obj
  if (Array.isArray(obj)) return obj.map(deepMigrate)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = deepMigrate(v)
  }
  return out
}

function containsLote29Token(obj) {
  if (typeof obj === 'string') return /\bLote29\b/i.test(obj)
  if (obj === null || obj === undefined) return false
  if (typeof obj !== 'object') return false
  if (obj instanceof Timestamp) return false
  if (Array.isArray(obj)) return obj.some(containsLote29Token)
  return Object.values(obj).some(containsLote29Token)
}

async function migrateUsers(db) {
  const refSource = doc(db, 'users', SOURCE_LOT)
  const refTarget = doc(db, 'users', TARGET_LOT)
  const snapSource = await getDoc(refSource)
  if (!snapSource.exists()) {
    console.log(`[users] No existe ${SOURCE_LOT}; no se mueve usuario.`)
    return
  }
  const fromSource = snapSource.data()
  fromSource.lot = TARGET_LOT
  const snapTarget = await getDoc(refTarget)
  let toWrite
  if (snapTarget.exists()) {
    const t = snapTarget.data()
    toWrite = {
      ...fromSource,
      ...t,
      lot: TARGET_LOT,
      password: t.password ?? fromSource.password,
      role: t.role ?? fromSource.role,
      fincaName:
        String(t.fincaName ?? '').trim() !== '' ? t.fincaName : (fromSource.fincaName ?? t.fincaName ?? ''),
      avatar: String(t.avatar ?? '').trim() !== '' ? t.avatar : (fromSource.avatar ?? t.avatar ?? ''),
      blocked: t.blocked ?? fromSource.blocked,
      profileUpdatedAt: Math.max(
        Number(fromSource.profileUpdatedAt) || 0,
        Number(t.profileUpdatedAt) || 0,
        Date.now(),
      ),
    }
    console.log(`[users] Fusionando ${SOURCE_LOT} en ${TARGET_LOT} (destino ya existía).`)
  } else {
    toWrite = { ...fromSource, lot: TARGET_LOT }
    console.log(`[users] Copiando ${SOURCE_LOT} → ${TARGET_LOT}.`)
  }
  await setDoc(refTarget, stripForFirestore(toWrite), { merge: false })
  await deleteDoc(refSource)
  console.log(`[users] Eliminado documento ${SOURCE_LOT}.`)
}

async function migrateCollection(db, name) {
  const snap = await getDocs(collection(db, name))
  let updated = 0
  let batch = writeBatch(db)
  let count = 0

  const flush = async () => {
    if (count === 0) return
    await batch.commit()
    batch = writeBatch(db)
    count = 0
  }

  for (const d of snap.docs) {
    const raw = d.data()
    if (!containsLote29Token(raw)) continue
    const migrated = deepMigrate(raw)
    batch.set(d.ref, migrated, { merge: false })
    count++
    updated++
    if (count >= 400) await flush()
  }
  await flush()
  console.log(`[${name}] Documentos tocados: ${updated}`)
}

async function main() {
  const env = readEnvFile('.env')
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
  if (!firebaseConfig.projectId) {
    console.error('Falta .env en la raíz del proyecto con VITE_FIREBASE_PROJECT_ID y el resto del SDK web.')
    process.exit(1)
  }

  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)
  console.log('Proyecto:', firebaseConfig.projectId)
  console.log('Migración:', SOURCE_LOT, '→', TARGET_LOT)

  await migrateUsers(db)

  const collections = [
    'news',
    'initiatives',
    'funds',
    'events',
    'services',
    'community',
    'mapLayers',
    'logs',
    'settings',
  ]
  for (const col of collections) {
    await migrateCollection(db, col)
  }

  console.log('Migración terminada.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
