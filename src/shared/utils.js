import { polishSpanishField } from '../geminiClient.js'
import { TENANT } from '../tenant.config.js'

export const EVENT_KIND_LABELS = {
  ordinary: 'Asamblea ordinaria',
  extraordinary: 'Reunión extraordinaria',
  special: 'Día especial / actividad',
  other: 'Otro',
}

export const formatCurrency = (amount) => {
  try {
    const n = Number(amount)
    const safe = Number.isFinite(n) ? Math.round(n) : 0
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(safe)
  } catch {
    return `$${amount}`
  }
}

export function copDigitsFromInput(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

export function parseCopIntegerFromDigits(raw) {
  const d = copDigitsFromInput(raw)
  if (!d) return 0
  const n = parseInt(d, 10)
  return Number.isFinite(n) ? Math.min(n, Number.MAX_SAFE_INTEGER) : 0
}

export const COP_AMOUNT_INPUT_HINT =
  'Escribe solo números (pesos enteros), sin símbolo $, sin puntos ni comas. Ejemplo: 2500000 para dos millones quinientos mil pesos.'

export function fundAmountFromDb(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

export const FUND_STATUS = {
  RECOLECCION: 'En recolección de fondos',
  META_ALCANZADA: 'Meta alcanzada',
  PENDIENTE: 'Pendiente de iniciar',
  EN_PROGRESO: 'En progreso',
  TERMINADO: 'Terminado',
}

export const FUND_STATUS_OPTIONS = [
  FUND_STATUS.RECOLECCION,
  FUND_STATUS.META_ALCANZADA,
  FUND_STATUS.PENDIENTE,
  FUND_STATUS.EN_PROGRESO,
  FUND_STATUS.TERMINADO,
]

export function mapLegacyFundStatus(st) {
  if (st === 'Aprobado') return FUND_STATUS.META_ALCANZADA
  if (FUND_STATUS_OPTIONS.includes(st)) return st
  return FUND_STATUS.RECOLECCION
}

export const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

export function parseYouTubeVideoId(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  if (YOUTUBE_ID_RE.test(s)) return s
  try {
    const href = /^https?:\/\//i.test(s) ? s : `https://${s}`
    const u = new URL(href)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return YOUTUBE_ID_RE.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch' || u.pathname === '/watch/') {
        const v = u.searchParams.get('v')
        return v && YOUTUBE_ID_RE.test(v) ? v : null
      }
      const embed = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})(?:\/|$)/)
      if (embed) return embed[1]
      const shorts = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})(?:\/|$)/)
      if (shorts) return shorts[1]
      const live = u.pathname.match(/^\/live\/([a-zA-Z0-9_-]{11})(?:\/|$)/)
      if (live) return live[1]
    }
  } catch {
    /* ignore */
  }
  const loose = s.match(/(?:youtube\.com\/watch\?[^#]*\bv=|youtu\.be\/)([a-zA-Z0-9_-]{11})\b/)
  return loose?.[1] && YOUTUBE_ID_RE.test(loose[1]) ? loose[1] : null
}

export function getYoutubeVideoIdFromNewsPost(post) {
  if (!post) return null
  const fromField = post.youtubeVideoId != null ? String(post.youtubeVideoId).trim() : ''
  if (fromField && YOUTUBE_ID_RE.test(fromField)) return fromField
  return parseYouTubeVideoId(post.youtubeUrl)
}

export const safeDateParse = (dateString) => {
  if (!dateString) return { isClosed: false, formatted: 'Sin fecha límite' }
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return { isClosed: false, formatted: 'Fecha inválida' }
  return {
    isClosed: new Date() > d,
    formatted: d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
  }
}

export function getTimeRemainingLabel(dateString) {
  if (!dateString) return null
  const ms = new Date(dateString).getTime()
  if (Number.isNaN(ms)) return null
  const diffMs = ms - Date.now()
  if (diffMs <= 0) return null

  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days >= 1) return `Quedan ${days} día${days === 1 ? '' : 's'}`
  if (hours >= 1) return `Quedan ${hours} h`
  if (minutes >= 1) return `Quedan ${minutes} min`
  return 'Quedan menos de 1 min'
}

export function formatPortalEventWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Fecha por confirmar'
  return d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
}

export function startOfLocalToday() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

export function toLocalDatetimeInputValue(d) {
  const t = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`
}

export function isVotingClosed(initiative) {
  if (initiative?.votingClosed === true) return true
  return safeDateParse(initiative?.deadline).isClosed
}

export const DEFAULT_INICIO_PUBLIC = TENANT.defaults

export const AVATAR_OPTIONS = [
  { id: 'dog', emoji: '🐶', label: 'Perro', category: 'animales' },
  { id: 'cat', emoji: '🐱', label: 'Gato', category: 'animales' },
  { id: 'rabbit', emoji: '🐰', label: 'Conejo', category: 'animales' },
  { id: 'hamster', emoji: '🐹', label: 'Hamster', category: 'animales' },
  { id: 'horse', emoji: '🐴', label: 'Caballo', category: 'animales' },
  { id: 'cow', emoji: '🐮', label: 'Vaca', category: 'animales' },
  { id: 'pig', emoji: '🐷', label: 'Cerdo', category: 'animales' },
  { id: 'penguin', emoji: '🐧', label: 'Pinguino', category: 'animales' },
  { id: 'owl', emoji: '🦉', label: 'Buho', category: 'animales' },
  { id: 'fox', emoji: '🦊', label: 'Zorro', category: 'animales' },
  { id: 'bear', emoji: '🐻', label: 'Oso', category: 'animales' },
  { id: 'panda', emoji: '🐼', label: 'Panda', category: 'animales' },
  { id: 'koala', emoji: '🐨', label: 'Koala', category: 'animales' },
  { id: 'tiger', emoji: '🐯', label: 'Tigre', category: 'animales' },
  { id: 'lion', emoji: '🦁', label: 'Leon', category: 'animales' },
  { id: 'husky', emoji: '🐺', label: 'Husky', category: 'animales' },
  { id: 'marlin', emoji: '🐟', label: 'Marlin', category: 'animales' },
  { id: 'shark', emoji: '🦈', label: 'Tiburon', category: 'animales' },
  { id: 'octopus', emoji: '🐙', label: 'Pulpo', category: 'animales' },
  { id: 'frog', emoji: '🐸', label: 'Rana', category: 'animales' },
  { id: 'spider', emoji: '🕷️', label: 'Arana', category: 'animales' },
  { id: 'scorpion', emoji: '🦂', label: 'Escorpion', category: 'animales' },
  { id: 'butterfly', emoji: '🦋', label: 'Mariposa', category: 'animales' },
  { id: 'mantis', emoji: '🦗', label: 'Mantis', category: 'animales' },
  { id: 'snake', emoji: '🐍', label: 'Serpiente', category: 'animales' },

  { id: 'seedling', emoji: '🌱', label: 'Brote', category: 'plantas' },
  { id: 'herb', emoji: '🌿', label: 'Hierba', category: 'plantas' },
  { id: 'leafy', emoji: '☘️', label: 'Trifolio', category: 'plantas' },
  { id: 'cactus', emoji: '🌵', label: 'Cactus', category: 'plantas' },
  { id: 'flower', emoji: '🌸', label: 'Flor', category: 'plantas' },
  { id: 'sunflower', emoji: '🌻', label: 'Girasol', category: 'plantas' },
  { id: 'tree', emoji: '🌳', label: 'Arbol', category: 'plantas' },
  { id: 'guayacan', emoji: '🌼', label: 'Guayacan', category: 'plantas' },

  { id: 'country-house', emoji: '🏡', label: 'Casa de campo', category: 'casas' },
  { id: 'house', emoji: '🏠', label: 'Casa', category: 'casas' },
]

export function getAvatarById(avatarId) {
  return AVATAR_OPTIONS.find((a) => a.id === avatarId) || null
}

/**
 * @param {string|undefined} avatarId — id emoji, `img:...`, o URL http(s)
 * @param {{ imageOptions?: { id: string, src: string, label?: string }[] }} [ctx]
 * @returns {{ kind: 'empty' }|{ kind: 'image', src: string, alt: string }|{ kind: 'emoji', emoji: string }|{ kind: 'text', text: string }}
 */
export function resolveAvatarDisplay(avatarId, ctx) {
  const imageOptions = ctx?.imageOptions ?? []
  const raw = String(avatarId ?? '').trim()
  if (!raw) return { kind: 'empty' }
  if (/^https?:\/\//i.test(raw)) return { kind: 'image', src: raw, alt: 'Avatar' }
  if (raw.startsWith('img:')) {
    const id = raw.slice(4)
    const opt = imageOptions.find((o) => String(o.id) === id)
    if (opt?.src) return { kind: 'image', src: opt.src, alt: opt.label || 'Avatar' }
    return { kind: 'text', text: '?' }
  }
  const em = getAvatarById(raw)
  if (em) return { kind: 'emoji', emoji: em.emoji }
  return { kind: 'text', text: '?' }
}

export function telHrefFromDisplayPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return `tel:+${digits}`
}

export function checkStrongPassword(raw) {
  const pwd = String(raw ?? '')
  const hasLength = pwd.length >= 8
  const hasLetter = /[A-Za-z]/.test(pwd)
  const hasNumber = /\d/.test(pwd)
  return {
    ok: hasLength && hasLetter && hasNumber,
    hasLength,
    hasLetter,
    hasNumber,
  }
}

export const SITE_BRAND_TITLE = TENANT.fullName

export const isAdminLike = (user) => user?.role === 'admin' || user?.role === 'superadmin'

/** Lote en filas de `users`: campo `lot` o id del documento (`users/{lote}`). */
export function portalUserLot(u) {
  if (!u || typeof u !== 'object') return ''
  const fromLot = String(u.lot ?? '').trim()
  if (fromLot) return fromLot
  return String(u.id ?? '').trim()
}

/** Interpreta `cameraPortadaAccess` como sí / no / sin responder. */
export function parseCameraPortadaAccess(raw) {
  if (raw === true) return true
  if (raw === false) return false
  if (raw === 'true' || raw === 'yes' || raw === 'sí') return true
  if (raw === 'false' || raw === 'no') return false
  if (raw === 1) return true
  if (raw === 0) return false
  return null
}

export function labelCameraPortadaAccess(tri) {
  if (tri === true) return 'Sí'
  if (tri === false) return 'No'
  return 'Sin responder'
}

function normalizeSurveyOptionText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Interpreta la opción votada en una encuesta tipo sí/no (texto de opción o posición).
 * @returns {boolean|null}
 */
export function surveyOptionIsAffirmative(options, optionId) {
  const opts = options || []
  const match = opts.find((o) => String(o.id) === String(optionId))
  if (!match) return null
  const txt = normalizeSurveyOptionText(match.text)
  if (/\bno\b/.test(txt) && !/\bsi\b/.test(txt)) return false
  if (/\bsi\b/.test(txt) && !/\bno\b/.test(txt)) return true
  if (txt.startsWith('si ')) return true
  if (txt.startsWith('no ')) return false
  const yesGuess =
    opts.find((opt) => {
      const t = normalizeSurveyOptionText(opt?.text)
      return /\bsi\b/.test(t) && !/\bno\b/.test(t)
    }) || opts[0]
  const noGuess = opts.find((opt) => {
    const t = normalizeSurveyOptionText(opt?.text)
    return /\bno\b/.test(t) && !/\bsi\b/.test(t)
  })
  if (noGuess && String(noGuess.id) === String(optionId)) return false
  if (yesGuess && String(yesGuess.id) === String(optionId)) return true
  return null
}

function initiativeCameraSurveyTextBlob(i) {
  return [i?.title, i?.excerpt, i?.survey?.question].map((x) => String(x || '').toLowerCase()).join('\n')
}

/**
 * Iniciativas (no propuestas) cuyos `survey.votes` se usan como respuesta histórica de cámara portada.
 */
export function findCameraPortadaSurveyInitiatives(initiatives, tenant) {
  const configured = tenant?.cameraPortadaSurveyInitiativeIds
  if (Array.isArray(configured) && configured.length > 0) {
    return configured
      .map((id) => (initiatives || []).find((i) => String(i?.id) === String(id)))
      .filter(Boolean)
  }
  const candidates = (initiatives || []).filter((i) => {
    if (i?.isProposal) return false
    const opts = i?.survey?.options || []
    const votes = i?.survey?.votes || []
    if (opts.length < 2) return false
    if (!Array.isArray(votes) || votes.length === 0) return false
    const blob = initiativeCameraSurveyTextBlob(i)
    const compact = blob.replace(/\s+/g, ' ')
    if (/ilumin/.test(blob) && !/c[aá]mara|hik/i.test(blob)) return false
    if (/(?=.*acceso)(?=.*c[aá]mara)/i.test(compact)) return true
    if (
      /c[aá]mara|hik\s*-?\s*connect|vigilancia[^\n]{0,40}portada|portada[^\n]{0,40}vigilancia|c[aá]mara[^\n]{0,40}portada|portada[^\n]{0,40}c[aá]mara/i.test(
        blob,
      )
    )
      return true
    return false
  })
  candidates.sort((a, b) => {
    const va = a?.survey?.votes?.length || 0
    const vb = b?.survey?.votes?.length || 0
    if (vb !== va) return vb - va
    return (Number(b?.id) || 0) - (Number(a?.id) || 0)
  })
  return candidates.length ? [candidates[0]] : []
}

export function buildCameraPortadaVoteMapFromInitiative(initiative) {
  const m = new Map()
  if (!initiative?.survey) return m
  const options = initiative.survey.options || []
  const votes = initiative.survey.votes || []
  for (const v of votes) {
    const lot = String(v?.lot || '').trim()
    if (!lot) continue
    const tri = surveyOptionIsAffirmative(options, v.optionId)
    if (tri === null) continue
    m.set(lot.toUpperCase(), tri)
  }
  return m
}

/** Mapa lote (mayúsculas) → tiene acceso, fusionando una o varias iniciativas configuradas o detectadas. */
export function buildMergedCameraPortadaVoteMap(initiatives, tenant) {
  const matched = findCameraPortadaSurveyInitiatives(initiatives, tenant)
  const merged = new Map()
  for (const init of matched) {
    const part = buildCameraPortadaVoteMapFromInitiative(init)
    for (const [k, v] of part) merged.set(k, v)
  }
  return merged
}

/**
 * Prioridad: campo en documento de usuario; si no hay, voto en encuesta histórica (mismo lote).
 */
export function resolveCameraPortadaAccessFromStores(user, voteMapByLotUpper) {
  const fromUser = parseCameraPortadaAccess(user?.cameraPortadaAccess)
  if (fromUser !== null) return fromUser
  const lot = portalUserLot(user).toUpperCase()
  if (!lot) return null
  if (voteMapByLotUpper?.has(lot)) return voteMapByLotUpper.get(lot)
  return null
}

export async function requestPolishedText(kind, text) {
  if (!text?.trim()) return ''
  const out = await polishSpanishField(kind, text)
  return out?.trim() ? out.trim() : ''
}

export const coerceSurveyOptionId = (options, raw) => {
  const match = (options || []).find((o) => String(o.id) === String(raw))
  return match ? match.id : raw
}
