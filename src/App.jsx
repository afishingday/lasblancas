import React, { useState, useEffect, useRef, useCallback, useMemo, Component } from 'react'
import {
  LayoutDashboard,
  CheckSquare,
  TrendingUp,
  Phone,
  Users,
  Map as MapIcon,
  Menu,
  X,
  Calendar,
  CheckCircle2,
  AlertCircle,
  MapPin,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Search,
  Lock,
  LogOut,
  Eye,
  EyeOff,
  BarChart2,
  Edit3,
  Sparkles,
  Loader2,
  Trash2,
  Newspaper,
  Edit,
  Check,
  ArrowLeft,
  UploadCloud,
  Rocket,
  Info,
  ZoomIn,
  ZoomOut,
  Download,
  ListFilter,
  ArrowDownAZ,
  ChevronDown,
  Shield,
  PlayCircle,
  Star,
} from 'lucide-react'
import mapEtapaa from '../images/etapaa.jpeg'
import mapEtapab from '../images/etapab.jpeg'
import { EMPTY_DB } from './initialData.js'
import {
  subscribePortalDb,
  seedFirestoreIfEmpty,
  syncUsersIfNeeded,
  ensurePublicSettings,
  savePublicSettings,
  appendLog,
  addNewsPost,
  updateNewsPost,
  deleteNewsPost,
  saveInitiative,
  convertInitiativeToFund,
  updateFundStatus,
  updateFundRaisedGoal,
  addFund,
  deleteFund,
  upsertPortalEvent,
  deletePortalEvent,
  deleteInitiative,
  upsertDirectoryRow,
  deleteDirectoryRow,
  upsertMapLayer,
  deleteMapLayer,
  updateUserPlainPassword,
  updateUserProfile,
  forceUserPlainPassword,
  setUserBlockedStatus,
} from './firestore/portalData.js'
import { savePortalSession, clearPortalSession, readPortalSession } from './portalSession.js'
import { uploadEntityCoverImage, MAX_ENTITY_IMAGE_BYTES } from './firestore/uploadEntityImage.js'
import { BRAND_LOGO_SRC } from './brandAssets.js'
import {
  fetchGeminiSurveyOptions,
  fetchGeminiProjectDescriptionFromTitle,
  fetchGeminiFundMetaReachedNews,
  getLastGeminiDetail,
  isGeminiConfigured,
  polishProposalWallDraft,
  polishSpanishField,
} from './geminiClient.js'
import { setPortalAnalyticsUser, trackPortalEvent } from './analytics.js'
import {
  MAX_NEWS_IMAGE_BYTES,
  MAX_NEWS_IMAGES_COUNT,
  getNewsCoverIndex,
  getNewsListPreviewCoverUrl,
  getNewsDetailGalleryUrls,
  newsOwnImagesList,
  isNewsFallbackImageUrl,
  uploadNewsImageFile,
} from './firestore/uploadNewsImage.js'
import { sumFundsRaisedTotal } from './fundHistoricRaised.js'

// ============================================================================
// 1. ESCUDO ANTI-ERRORES (ERROR BOUNDARY)
// ============================================================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error.toString() }
  }
  componentDidCatch(error, errorInfo) {
    console.error('Error capturado:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 text-center">
          <div className="bg-white p-10 rounded-[2rem] shadow-xl max-w-lg border border-red-100">
            <AlertCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-black text-stone-900 mb-3">Interrupción Menor</h2>
            <p className="text-stone-700 mb-6 text-sm">
              Protegimos el portal de un error de datos. Haz clic abajo para restaurar.
            </p>
            <div className="bg-stone-100 p-4 rounded-xl text-xs text-left text-red-600 overflow-auto mb-6 font-mono h-24">
              {this.state.errorMsg}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-stone-900 text-white px-8 py-4 rounded-xl font-bold w-full hover:bg-stone-800 transition-colors"
            >
              Restaurar Portal
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const EVENT_KIND_LABELS = {
  ordinary: 'Asamblea ordinaria',
  extraordinary: 'Reunión extraordinaria',
  special: 'Día especial / actividad',
  other: 'Otro',
}

// ============================================================================
// 3. UTILIDADES
// ============================================================================
const formatCurrency = (amount) => {
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

/** Montos COP en formularios: solo dígitos (sin $, puntos ni comas) para no confundir con decimales. */
function copDigitsFromInput(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

function parseCopIntegerFromDigits(raw) {
  const d = copDigitsFromInput(raw)
  if (!d) return 0
  const n = parseInt(d, 10)
  return Number.isFinite(n) ? Math.min(n, Number.MAX_SAFE_INTEGER) : 0
}

const COP_AMOUNT_INPUT_HINT =
  'Escribe solo números (pesos enteros), sin símbolo $, sin puntos ni comas. Ejemplo: 2500000 para dos millones quinientos mil pesos.'

function fundAmountFromDb(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n)
}

/** Estados posibles de un proyecto en el portal. */
const FUND_STATUS = {
  RECOLECCION: 'En recolección de fondos',
  META_ALCANZADA: 'Meta alcanzada',
  PENDIENTE: 'Pendiente de iniciar',
  EN_PROGRESO: 'En progreso',
  TERMINADO: 'Terminado',
}

const FUND_STATUS_OPTIONS = [
  FUND_STATUS.RECOLECCION,
  FUND_STATUS.META_ALCANZADA,
  FUND_STATUS.PENDIENTE,
  FUND_STATUS.EN_PROGRESO,
  FUND_STATUS.TERMINADO,
]

function mapLegacyFundStatus(st) {
  if (st === 'Aprobado') return FUND_STATUS.META_ALCANZADA
  if (FUND_STATUS_OPTIONS.includes(st)) return st
  return FUND_STATUS.RECOLECCION
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

/** Extrae el ID de 11 caracteres de una URL o texto de YouTube; devuelve null si no es reconocible. */
function parseYouTubeVideoId(raw) {
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

function getYoutubeVideoIdFromNewsPost(post) {
  if (!post) return null
  const fromField = post.youtubeVideoId != null ? String(post.youtubeVideoId).trim() : ''
  if (fromField && YOUTUBE_ID_RE.test(fromField)) return fromField
  return parseYouTubeVideoId(post.youtubeUrl)
}

function NewsYoutubeEmbed({ videoId }) {
  if (!videoId) return null
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-stone-200 bg-black shadow-md aspect-video">
      <iframe
        title="Video de YouTube"
        className="absolute inset-0 h-full w-full"
        src={src}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

function buildNewsFormFromFund(fund) {
  const requiresBudget = fund.requiresBudget !== false
  const goalNum = fundAmountFromDb(fund.goal)
  const raisedNum = fundAmountFromDb(fund.raised)
  const quotaNum = fundAmountFromDb(fund.expectedQuotaPerLotCOP)
  const lines = []
  if (String(fund.description ?? '').trim()) lines.push(String(fund.description).trim())
  lines.push('')
  lines.push(`Estado del proyecto: ${fund.status || '—'}.`)
  if (requiresBudget && goalNum > 0) {
    lines.push(`Meta de recaudo: ${formatCurrency(goalNum)} · Recaudado: ${formatCurrency(raisedNum)}.`)
  }
  if (quotaNum > 0) {
    lines.push(
      `Cuota de referencia por lote: ${formatCurrency(quotaNum)} (valor del proyecto ÷ promedio de lotes que aportan al mes).`,
    )
  }
  const content = lines.join('\n')
  const excerpt =
    requiresBudget && goalNum > 0
      ? `${fund.name}: ${formatCurrency(raisedNum)} de ${formatCurrency(goalNum)} · ${fund.status || ''}`.slice(0, 280)
      : `${fund.name} · ${fund.status || 'Proyecto'}`.slice(0, 280)
  const mediaItems = []
  let coverMediaId = null
  if (fund.image && !isNewsFallbackImageUrl(fund.image)) {
    const id = crypto.randomUUID()
    mediaItems.push({ id, type: 'url', url: fund.image })
    coverMediaId = id
  }
  return {
    title: `Actualización: ${fund.name}`,
    excerpt,
    content,
    category: 'Proyectos',
    mediaItems,
    coverMediaId,
    youtubeUrl: '',
  }
}

const safeDateParse = (dateString) => {
  if (!dateString) return { isClosed: false, formatted: 'Sin fecha límite' }
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return { isClosed: false, formatted: 'Fecha inválida' }
  return {
    isClosed: new Date() > d,
    formatted: d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
  }
}

/** Etiqueta corta del tiempo restante (solo visual; no afecta lógica). */
function getTimeRemainingLabel(dateString) {
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

function formatPortalEventWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Fecha por confirmar'
  return d.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
}

function startOfLocalToday() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

/** Valor para `datetime-local` en hora local (evita mezclar UTC como en toISOString().slice). */
function toLocalDatetimeInputValue(d) {
  const t = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`
}

/** Cierre por fecha límite o cierre manual desde el portal. */
function isVotingClosed(initiative) {
  if (initiative?.votingClosed === true) return true
  return safeDateParse(initiative?.deadline).isClosed
}

const DEFAULT_INICIO_PUBLIC = {
  workerName: 'Arley Franco',
  workerPhone: '+57 315 4293038',
  adminFeeCOP: 110000,
  paymentAlias: '@davi3137884550',
  paymentBankName: 'Banco Davivienda',
  paymentAccountNumber: '488445444166',
  paymentReceiptEmail: 'comunidadlasblancas@gmail.com',
}

const AVATAR_OPTIONS = [
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

function getAvatarById(avatarId) {
  return AVATAR_OPTIONS.find((a) => a.id === avatarId) || null
}

function telHrefFromDisplayPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  return `tel:+${digits}`
}

function checkStrongPassword(raw) {
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

const SITE_BRAND_TITLE = 'Portal Comunitario Las Blancas'
const isAdminLike = (user) => user?.role === 'admin' || user?.role === 'superadmin'

function PortalFooter() {
  return (
    <footer className="text-center text-[11px] sm:text-xs text-stone-600 dark:text-slate-400 space-y-2 py-6 px-4 border-t border-emerald-100/50 dark:border-slate-800/60 bg-gradient-to-t from-amber-50/35 via-white/70 to-emerald-50/25 dark:from-slate-950/50 dark:via-slate-950/40 backdrop-blur">
      <p className="text-stone-700 dark:text-slate-300 leading-relaxed">
        Creado por Luis Montoya ·{' '}
        <a href="tel:+573016394349" className="text-emerald-700 dark:text-emerald-300 font-semibold hover:underline">
          301 639 4349
        </a>
        {' · '}
        <a
          href="https://www.instagram.com/afishingday/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 dark:text-emerald-300 font-semibold hover:underline"
        >
          @afishingday
        </a>
      </p>
      <p className="text-stone-500 dark:text-slate-500">© 2026 {SITE_BRAND_TITLE}. Todos los derechos reservados.</p>
    </footer>
  )
}

async function requestPolishedText(kind, text) {
  if (!text?.trim()) return ''
  const out = await polishSpanishField(kind, text)
  return out?.trim() ? out.trim() : ''
}

/** Aro y barra de progreso de fondos: verde 90–100 %, azul 70–89 %, naranja 40–69 %, rojo 0–39 %. */
function getFundProgressToneClasses(progressPercent) {
  const p = Math.min(100, Math.max(0, Number(progressPercent) || 0))
  if (p >= 90) {
    return {
      ringClass: 'text-emerald-500',
      labelClass: 'text-emerald-700',
      barClass: 'bg-emerald-500',
      raisedClass: 'text-emerald-600',
    }
  }
  if (p >= 70) {
    return {
      ringClass: 'text-blue-500',
      labelClass: 'text-blue-800',
      barClass: 'bg-blue-500',
      raisedClass: 'text-blue-800',
    }
  }
  if (p >= 40) {
    return {
      ringClass: 'text-orange-500',
      labelClass: 'text-orange-800',
      barClass: 'bg-orange-500',
      raisedClass: 'text-orange-800',
    }
  }
  return {
    ringClass: 'text-red-500',
    labelClass: 'text-red-700',
    barClass: 'bg-red-500',
    raisedClass: 'text-red-700',
  }
}

const CircularProgress = ({ percentage, colorClass, textClass, labelPercent }) => {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const label = Math.round(labelPercent != null ? labelPercent : percentage)
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-24 h-24 transform -rotate-90">
        <circle
          className="text-gray-100"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
        <circle
          className={colorClass}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
      </svg>
      <span className={`absolute text-xl font-bold ${textClass}`}>{label}%</span>
    </div>
  )
}

/** Animación breve al cargar si el recaudo alcanzó el 100 %. */
const FundCircularWithCelebration = ({ fundId, percentage, colorClass, textClass }) => {
  const raw = Number(percentage) || 0
  const strokePct = Math.min(100, Math.max(0, raw))
  const isComplete = raw >= 100
  const [burst, setBurst] = useState(false)
  useEffect(() => {
    if (!isComplete) return
    setBurst(true)
    const t = window.setTimeout(() => setBurst(false), 3200)
    return () => window.clearTimeout(t)
  }, [isComplete, fundId])
  return (
    <div className="relative flex items-center justify-center shrink-0">
      <CircularProgress
        percentage={strokePct}
        labelPercent={raw}
        colorClass={colorClass}
        textClass={textClass}
      />
      {burst && (
        <div
          className="absolute inset-[-6px] z-20 flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/95 to-emerald-700/95 text-white shadow-lg ring-4 ring-emerald-200/80 pointer-events-none animate-in zoom-in-95 fade-in duration-300"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-md shrink-0" />
          <span className="mt-1.5 px-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-center leading-tight">
            ¡Meta lograda!
          </span>
        </div>
      )}
    </div>
  )
}

function NewsMediaThumb({ item }) {
  const [src, setSrc] = useState(() => (item.type === 'url' ? item.url : ''))
  useEffect(() => {
    if (item.type === 'url') {
      setSrc(item.url)
      return
    }
    const u = URL.createObjectURL(item.file)
    setSrc(u)
    return () => URL.revokeObjectURL(u)
  }, [item.type, item.type === 'url' ? item.url : item.file])
  if (!src) return <div className="h-full w-full bg-stone-200" />
  return <img src={src} alt="" className="h-full w-full object-cover" />
}

// ============================================================================
// 4. VISTAS DEL PORTAL
// ============================================================================

const LoginView = ({ db, onLogin }) => {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [cpUser, setCpUser] = useState('')
  const [cpCurrent, setCpCurrent] = useState('')
  const [pwNext, setPwNext] = useState('')
  const [pwAgain, setPwAgain] = useState('')
  const [showCpCurrent, setShowCpCurrent] = useState(false)
  const [showCpNext, setShowCpNext] = useState(false)
  const [showCpAgain, setShowCpAgain] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    const userFormat = username.trim().replace(/\s+/g, '')
    const foundUser = db.users?.find((u) => u.lot?.toLowerCase() === userFormat.toLowerCase())

    if (!foundUser) return setError('Usuario no encontrado. Escríbelo sin espacios (Ej: Lote1A).')
    if (foundUser.blocked)
      return setError('Tu usuario está bloqueado temporalmente. Contacta a quienes coordinan el portal.')
    if (foundUser.password !== password) return setError('Contraseña incorrecta.')

    onLogin({
      lotNumber: foundUser.lot,
      shortLot: foundUser.lot.replace(/Lote/i, 'L'),
      role: foundUser.role,
      password,
    })
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    const userFormat = cpUser.trim().replace(/\s+/g, '')
    const foundUser = db.users?.find((u) => u.lot?.toLowerCase() === userFormat.toLowerCase())
    if (!foundUser) return setError('Escribe tu usuario (Ej: Lote1A) para cambiar la contraseña.')
    if (foundUser.blocked)
      return setError('Tu usuario está bloqueado. Alguien con permiso para editar usuarios debe desbloquearlo antes del cambio de clave.')
    if (!cpCurrent) return setError('Escribe tu contraseña actual para cambiarla.')
    if (pwNext !== pwAgain) return setError('La nueva contraseña y la repetición no coinciden.')
    const strong = checkStrongPassword(pwNext.trim())
    if (!strong.ok)
      return setError('La nueva clave debe tener mínimo 8 caracteres e incluir letras y números.')
    setPwBusy(true)
    try {
      await updateUserPlainPassword(foundUser.lot, cpCurrent, pwNext.trim())
      setMode('login')
      setCpUser('')
      setCpCurrent('')
      setPwNext('')
      setPwAgain('')
      setSuccessMsg('Contraseña actualizada. Ya puedes ingresar con tu nueva clave.')
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'WRONG_PASSWORD') setError('La contraseña actual no es correcta.')
      else setError('No se pudo cambiar la contraseña. Revisa conexión o reglas de Firestore.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-portal-canvas flex flex-col">
      <div className="flex-1 flex justify-center items-center p-4">
        <div className="w-full max-w-md bg-white/95 rounded-[2rem] shadow-xl shadow-emerald-100/40 overflow-hidden border border-emerald-100/50 ring-1 ring-amber-100/30">
          <div className="bg-emerald-800 flex flex-col items-center justify-center text-center text-white min-h-[min(52vh,320px)] sm:min-h-[340px] px-4 py-6 sm:py-8">
            <img
              src={BRAND_LOGO_SRC}
              alt="Las Blancas"
              className="w-full max-w-[96%] h-auto max-h-[min(42vh,280px)] sm:max-h-[300px] object-contain object-center drop-shadow-md flex-1 min-h-0 mb-4"
            />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-snug shrink-0">
              {SITE_BRAND_TITLE}
            </h1>
          </div>
          <div className="p-8">
            {mode === 'login' ? (
              <>
                <p className="text-stone-600 text-sm text-center mb-6 leading-relaxed">
                  Portal comunitario para residentes. Ingresa con tu usuario de lote.
                </p>
                {error && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center text-sm mb-6 border border-red-100">
                    <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-4 top-4 text-stone-500" />
                    <input
                      type="text"
                      placeholder="Usuario (Ej. Lote1A)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-12 p-4 rounded-xl border border-stone-200 bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-4 top-4 text-stone-500" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 p-4 rounded-xl border border-stone-200 bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-4 top-4 text-stone-500 hover:text-emerald-600 transition-colors"
                    >
                      {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold hover:bg-emerald-700 flex justify-center items-center transition-all mt-2"
                  >
                    Ingresar al Portal <ChevronRight className="w-5 h-5 ml-2" />
                  </button>
                </form>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setError('')
                      setMode('change')
                    }}
                    className="w-full text-xs font-bold text-emerald-700 hover:text-emerald-800 underline-offset-4 hover:underline"
                  >
                    ¿Quieres cambiar tu contraseña?
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-stone-900">Cambiar contraseña</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setError('')
                      setSuccessMsg('')
                    }}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Volver al ingreso
                  </button>
                </div>
                {error && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center text-sm mb-4 border border-red-100">
                    <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl flex items-center text-sm mb-4 border border-emerald-100">
                    <CheckCircle2 className="w-5 h-5 mr-2 shrink-0" />
                    {successMsg}
                  </div>
                )}
                <p className="text-xs text-stone-600 mb-4 leading-relaxed">
                  Requisitos: mínimo 8 caracteres, incluir letras y números.
                </p>
                <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Usuario (Ej. Lote1A)"
                    value={cpUser}
                    onChange={(e) => setCpUser(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                  <div className="relative">
                    <input
                      type={showCpCurrent ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Contraseña actual"
                      value={cpCurrent}
                      onChange={(e) => setCpCurrent(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 pr-11 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpCurrent((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-emerald-600"
                      aria-label={showCpCurrent ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                    >
                      {showCpCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showCpNext ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Nueva contraseña"
                      value={pwNext}
                      onChange={(e) => setPwNext(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 pr-11 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpNext((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-emerald-600"
                      aria-label={showCpNext ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                    >
                      {showCpNext ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showCpAgain ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repetir nueva contraseña"
                      value={pwAgain}
                      onChange={(e) => setPwAgain(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 pr-11 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpAgain((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-emerald-600"
                      aria-label={showCpAgain ? 'Ocultar repetición de contraseña' : 'Mostrar repetición de contraseña'}
                    >
                      {showCpAgain ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={pwBusy}
                    className="w-full rounded-xl bg-emerald-700 text-white py-3 font-bold text-sm hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {pwBusy ? 'Guardando…' : 'Guardar nueva contraseña'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
      <PortalFooter />
    </div>
  )
}

const emptyNewsForm = () => ({
  title: '',
  excerpt: '',
  content: '',
  category: 'General',
  mediaItems: [],
  coverMediaId: null,
  youtubeUrl: '',
})

const NewsView = ({
  currentUser,
  db,
  addNewsPost,
  updateNewsPost,
  deleteNewsPost,
  showAlert,
  showConfirm,
  newsDraftFromFund,
  onConsumeNewsDraftFromFund,
}) => {
  const [showForm, setShowForm] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [form, setForm] = useState(() => emptyNewsForm())
  const lastAppliedFundNewsKeyRef = useRef(null)

  useEffect(() => {
    if (!newsDraftFromFund?.fund) {
      lastAppliedFundNewsKeyRef.current = null
      return
    }
    const draftKey = newsDraftFromFund.key
    if (draftKey != null && lastAppliedFundNewsKeyRef.current === draftKey) return
    if (draftKey != null) lastAppliedFundNewsKeyRef.current = draftKey

    const { fund, aiMilestone } = newsDraftFromFund
    const base = buildNewsFormFromFund(fund)
    setSelectedPost(null)
    setEditingId(null)
    setForm(base)
    setShowForm(true)
    onConsumeNewsDraftFromFund?.()

    if (aiMilestone) {
      void (async () => {
        if (!isGeminiConfigured()) {
          showAlert(
            'Configura VITE_GEMINI_API_KEY para que la IA redacte la noticia de meta alcanzada; quedó el borrador con datos del proyecto para que lo completes a mano.',
          )
          return
        }
        setAiBusy(true)
        try {
          const ai = await fetchGeminiFundMetaReachedNews(fund)
          if (ai?.title && ai.excerpt && ai.content) {
            setForm((prev) => ({
              ...prev,
              title: ai.title,
              excerpt: ai.excerpt,
              content: ai.content,
            }))
            showAlert('La IA generó un borrador para la comunidad. Revísalo y ajusta lo que quieras antes de publicar.')
          } else {
            const d = getLastGeminiDetail()
            showAlert(d ? `La IA no respondió: ${d}` : 'No se pudo generar el texto; puedes editar el borrador manualmente.')
          }
        } finally {
          setAiBusy(false)
        }
      })()
    }
  }, [newsDraftFromFund, onConsumeNewsDraftFromFund])

  useEffect(() => {
    if (selectedPost) setGalleryIndex(getNewsCoverIndex(selectedPost))
    else setGalleryIndex(0)
  }, [selectedPost?.id, selectedPost?.coverIndex])

  const buildImageUrlsFromMedia = async (mediaItems, newsId) => {
    const urls = []
    for (const item of mediaItems) {
      if (item.type === 'url') urls.push(item.url)
      else urls.push(await uploadNewsImageFile(item.file, newsId, urls.length))
    }
    return urls
  }

  const appendImageFiles = (picked) => {
    const room = MAX_NEWS_IMAGES_COUNT - form.mediaItems.length
    if (room <= 0) {
      showAlert(`Ya alcanzaste el máximo de ${MAX_NEWS_IMAGES_COUNT} imágenes. Quita alguna para añadir más.`)
      return
    }
    const slice = picked.slice(0, room)
    const tooBig = slice.find((f) => f.size > MAX_NEWS_IMAGE_BYTES)
    if (tooBig) {
      showAlert(
        `Cada imagen debe pesar como máximo ${Math.round(MAX_NEWS_IMAGE_BYTES / 1024)} KB. "${tooBig.name}" pesa más.`,
      )
      return
    }
    setForm((prev) => {
      const added = slice.map((file) => ({ id: crypto.randomUUID(), type: 'file', file }))
      const mediaItems = [...prev.mediaItems, ...added]
      const coverMediaId =
        prev.coverMediaId && mediaItems.some((m) => m.id === prev.coverMediaId)
          ? prev.coverMediaId
          : mediaItems[0]?.id ?? null
      return { ...prev, mediaItems, coverMediaId }
    })
  }

  const removeMediaItem = (id) => {
    setForm((prev) => {
      const mediaItems = prev.mediaItems.filter((m) => m.id !== id)
      let coverMediaId = prev.coverMediaId
      if (coverMediaId === id || !mediaItems.some((m) => m.id === coverMediaId)) {
        coverMediaId = mediaItems[0]?.id ?? null
      }
      return { ...prev, mediaItems, coverMediaId }
    })
  }

  const openEdit = (post) => {
    setSelectedPost(null)
    setEditingId(post.id)
    const rawUrls =
      Array.isArray(post.images) && post.images.length > 0
        ? [...post.images]
        : post.image
          ? [post.image]
          : []
    const urls = rawUrls.filter((u) => u && !isNewsFallbackImageUrl(u))
    const mediaItems = urls.map((url) => ({
      id: crypto.randomUUID(),
      type: 'url',
      url,
    }))
    const ci = mediaItems.length ? Math.min(getNewsCoverIndex(post), mediaItems.length - 1) : 0
    const coverMediaId = mediaItems[ci]?.id ?? null
    const existingYtId = getYoutubeVideoIdFromNewsPost(post)
    setForm({
      title: post.title,
      excerpt: post.excerpt || '',
      content: post.content || '',
      category: post.category || 'General',
      mediaItems,
      coverMediaId,
      youtubeUrl:
        post.youtubeUrl?.trim() || (existingYtId ? `https://www.youtube.com/watch?v=${existingYtId}` : ''),
    })
    setShowForm(true)
  }

  const requestDeleteNews = (post) => {
    showConfirm(
      `¿Eliminar permanentemente la noticia "${post.title}"? Esta acción no se puede deshacer.`,
      () => {
        deleteNewsPost(post.id)
          .then(() => {
            showAlert('Noticia eliminada.')
            setSelectedPost((p) => (p?.id === post.id ? null : p))
            setShowForm(false)
            setEditingId(null)
            setForm(emptyNewsForm())
          })
          .catch((err) => {
            console.error(err)
            showAlert('No se pudo eliminar la noticia.')
          })
      },
    )
  }

  const runSaveNews = async () => {
    for (const m of form.mediaItems) {
      if (m.type === 'file' && m.file.size > MAX_NEWS_IMAGE_BYTES) {
        showAlert(
          `Cada imagen debe pesar como máximo ${Math.round(MAX_NEWS_IMAGE_BYTES / 1024)} KB. Revisa "${m.file.name}".`,
        )
        return
      }
    }

    const ytTrim = String(form.youtubeUrl || '').trim()
    const youtubeVideoId = ytTrim ? parseYouTubeVideoId(ytTrim) : null
    if (ytTrim && !youtubeVideoId) {
      showAlert(
        'La URL de YouTube no es válida. Pega el enlace del video (youtube.com/watch, youtu.be o Shorts) o solo el ID de 11 caracteres.',
      )
      return
    }

    const isEditing = editingId != null
    const newsDocId = editingId ?? Date.now()
    const existing = isEditing ? (db.news || []).find((n) => n.id === editingId) : null

    const proceed = async () => {
      setIsUploading(true)
      try {
        let imageUrls = await buildImageUrlsFromMedia(form.mediaItems, newsDocId)
        imageUrls = imageUrls.filter((u) => u && !isNewsFallbackImageUrl(u))

        const rawCoverPos =
          imageUrls.length <= 1 ? 0 : form.mediaItems.findIndex((m) => m.id === form.coverMediaId)
        const coverIdx =
          imageUrls.length <= 1
            ? 0
            : Math.min(
                Math.max(0, rawCoverPos >= 0 ? rawCoverPos : 0),
                imageUrls.length - 1,
              )
        const coverUrl = imageUrls.length ? imageUrls[coverIdx] ?? imageUrls[0] : null

        const payload = {
          id: newsDocId,
          title: form.title,
          excerpt: form.excerpt,
          content: form.content,
          category: form.category,
          images: imageUrls,
          ...(coverUrl ? { image: coverUrl } : {}),
          coverIndex: coverIdx,
          author: existing?.author ?? currentUser.lotNumber,
          date: existing?.date ?? new Date().toLocaleDateString('es-CO'),
          ...(youtubeVideoId ? { youtubeVideoId, youtubeUrl: ytTrim } : {}),
        }

        if (isEditing) await updateNewsPost(payload)
        else await addNewsPost(payload)

        setShowForm(false)
        setEditingId(null)
        setForm(emptyNewsForm())
        showAlert(
          isEditing ? 'Noticia actualizada.' : '¡Noticia publicada con éxito en el muro comunitario!',
        )
      } catch (err) {
        console.error(err)
        if (err instanceof Error && err.message === 'NEWS_IMAGE_TOO_LARGE') {
          showAlert(`Alguna imagen supera ${Math.round(MAX_NEWS_IMAGE_BYTES / 1024)} KB.`)
          return
        }
        showAlert(
          'No se pudo guardar la noticia. Si subiste imagen, revisa Firebase Storage y las reglas de almacenamiento.',
        )
      } finally {
        setIsUploading(false)
      }
    }

    if (form.mediaItems.length === 0) {
      showConfirm(
        '¿Publicar esta noticia sin fotos? En el muro de Inicio se mostrará el logo de Las Blancas solo como vista previa; no se guardará como imagen en la base de datos.',
        () => {
          void proceed()
        },
      )
      return
    }

    await proceed()
  }

  const handlePost = (e) => {
    e.preventDefault()
    void runSaveNews()
  }

  const handleNewsAiPolish = async () => {
    if (!form.title.trim() && !form.excerpt.trim() && !form.content.trim()) {
      showAlert('Escribe título, resumen o contenido para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setAiBusy(true)
    try {
      const [title, excerpt, content] = await Promise.all([
        requestPolishedText('news_title', form.title),
        requestPolishedText('news_excerpt', form.excerpt),
        requestPolishedText('news_content', form.content),
      ])
      setForm((prev) => ({
        ...prev,
        title: title || prev.title,
        excerpt: excerpt || prev.excerpt,
        content: content || prev.content,
      }))
      showAlert('Sugerencias de redacción aplicadas. Revísalas antes de publicar.')
    } finally {
      setAiBusy(false)
    }
  }

  const handleNewsAutoExcerpt = async () => {
    if (!form.content.trim()) return showAlert('Escribe el contenido completo primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setAiBusy(true)
    try {
      const excerpt = await requestPolishedText('news_excerpt', form.content)
      if (!excerpt) {
        const detail = getLastGeminiDetail()
        showAlert(detail ? `No se pudo generar el resumen: ${detail}` : 'No se pudo generar el resumen.')
        return
      }
      setForm((prev) => ({ ...prev, excerpt }))
      showAlert('Resumen corto generado desde el contenido.')
    } finally {
      setAiBusy(false)
    }
  }

  if (selectedPost) {
    const gallery = getNewsDetailGalleryUrls(selectedPost)
    const gi = Math.min(galleryIndex, Math.max(0, gallery.length - 1))
    const activeSrc = gallery.length ? gallery[gi] : null
    const detailYoutubeId = getYoutubeVideoIdFromNewsPost(selectedPost)

    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedPost(null)}
            className="flex items-center text-emerald-700 font-bold hover:text-emerald-800 transition-colors bg-white px-4 py-2 rounded-xl shadow-sm w-fit"
          >
            <ArrowLeft className="w-5 h-5 mr-2" /> Volver al muro de noticias
          </button>
          {isAdminLike(currentUser) && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEdit(selectedPost)}
                className="inline-flex items-center bg-white border border-emerald-200 text-emerald-800 px-4 py-2 rounded-xl font-bold text-sm shadow-sm hover:bg-emerald-50"
              >
                <Edit3 className="w-4 h-4 mr-2" /> Editar
              </button>
              <button
                type="button"
                onClick={() => requestDeleteNews(selectedPost)}
                className="inline-flex items-center bg-white border border-red-200 text-red-700 px-4 py-2 rounded-xl font-bold text-sm shadow-sm hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Eliminar
              </button>
            </div>
          )}
        </div>

        <article className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
          {gallery.length > 0 && activeSrc ? (
            <>
              <div className="relative min-h-[16rem] max-h-[min(70vh,28rem)] md:max-h-[min(75vh,32rem)] w-full bg-stone-100 flex items-center justify-center p-4 md:p-6">
                <img
                  src={activeSrc}
                  alt={selectedPost.title}
                  className="max-w-full max-h-[min(60vh,26rem)] md:max-h-[min(65vh,30rem)] w-auto h-auto object-contain rounded-lg shadow-md"
                />
                <div className="absolute top-6 left-6">
                  <span className="bg-emerald-600 text-white text-xs font-black px-4 py-2 rounded-lg uppercase tracking-widest shadow-md">
                    {selectedPost.category}
                  </span>
                </div>
                {gallery.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Imagen anterior"
                      className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-stone-800 p-2 rounded-full shadow-md"
                      onClick={() =>
                        setGalleryIndex((i) => (i - 1 + gallery.length) % gallery.length)
                      }
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      type="button"
                      aria-label="Imagen siguiente"
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-stone-800 p-2 rounded-full shadow-md"
                      onClick={() => setGalleryIndex((i) => (i + 1) % gallery.length)}
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                    <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs font-bold px-3 py-1 rounded-full">
                      {galleryIndex + 1} / {gallery.length}
                    </span>
                  </>
                )}
              </div>
              {gallery.length > 1 && (
                <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-stone-100 bg-stone-50/90">
                  {gallery.map((url, i) => {
                    const isDefaultCover = i === getNewsCoverIndex(selectedPost)
                    return (
                      <button
                        key={`${i}-${url}`}
                        type="button"
                        onClick={() => setGalleryIndex(i)}
                        className={`relative shrink-0 rounded-lg overflow-hidden ring-2 ring-offset-2 transition-all ${
                          i === galleryIndex ? 'ring-emerald-600' : 'ring-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        {isDefaultCover && (
                          <span className="absolute top-0.5 left-0.5 z-10 rounded bg-emerald-600 px-1 py-0.5 text-[8px] font-black uppercase text-white shadow">
                            Portada
                          </span>
                        )}
                        <img src={url} alt="" className="h-14 w-20 object-cover" />
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="px-6 md:px-10 pt-8 pb-2 border-b border-stone-100">
              <span className="inline-flex bg-emerald-600 text-white text-xs font-black px-4 py-2 rounded-lg uppercase tracking-widest shadow-md">
                {selectedPost.category}
              </span>
            </div>
          )}
            <div className="p-6 md:p-10">
            <h2 className="text-3xl md:text-4xl font-black text-stone-900 dark:text-slate-100 mb-6 leading-tight">{selectedPost.title}</h2>
            <div className="flex items-center text-sm font-bold text-stone-600 dark:text-slate-300 mb-8 gap-6 border-b border-stone-100 dark:border-slate-800/60 pb-6">
              <span className="flex items-center">
                <User className="w-4 h-4 mr-2 text-emerald-600" /> Escrito por: {selectedPost.author}
              </span>
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-emerald-600" /> Publicado: {selectedPost.date}
              </span>
            </div>

            {detailYoutubeId && (
              <div className="mb-8 max-w-3xl">
                <NewsYoutubeEmbed videoId={detailYoutubeId} />
              </div>
            )}

            <div className="prose max-w-none text-stone-800 dark:text-slate-200 text-lg leading-relaxed whitespace-pre-wrap">
              {selectedPost.content || selectedPost.excerpt}
            </div>
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <header className="rounded-3xl border border-emerald-100/40 dark:border-slate-800/60 bg-gradient-to-r from-white/70 to-white/40 dark:from-slate-950/55 dark:to-slate-900/35 backdrop-blur p-6 md:p-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-stone-800 dark:text-slate-100">Muro de Noticias</h2>
            <p className="text-stone-600 dark:text-slate-300 mt-1">Novedades y comunicados oficiales de Las Blancas.</p>
          </div>
          {isAdminLike(currentUser) && (
            <button
              type="button"
              onClick={() => {
                if (showForm) {
                  setShowForm(false)
                  setEditingId(null)
                  setForm(emptyNewsForm())
                } else {
                  setEditingId(null)
                  setForm(emptyNewsForm())
                  setShowForm(true)
                }
              }}
              className="bg-gradient-to-r from-emerald-600 to-blue-600 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:from-emerald-700 hover:to-blue-700 transition-colors"
            >
              {showForm ? (
                'Cancelar'
              ) : (
                <>
                  <PlusCircle className="w-5 h-5 mr-2" /> Publicar Noticia
                </>
              )}
            </button>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/70 dark:bg-slate-950/50 ring-1 ring-emerald-100/40 dark:ring-slate-800/60 border border-emerald-100/30 dark:border-slate-800/60 rounded-2xl p-4">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-800">Últimas publicaciones</p>
            <p className="text-3xl font-black text-emerald-800 dark:text-emerald-200 tabular-nums leading-none mt-2">
              {(db.news || []).length}
            </p>
            <p className="text-xs text-stone-700 dark:text-slate-300 mt-2 font-bold">Lo más nuevo del muro.</p>
          </div>

          <div className="bg-white/70 dark:bg-slate-950/50 ring-1 ring-blue-100/40 dark:ring-slate-800/60 border border-blue-100/30 dark:border-slate-800/60 rounded-2xl p-4">
            <p className="text-xs font-black uppercase tracking-widest text-blue-800">Votaciones activas</p>
            <p className="text-3xl font-black text-blue-800 dark:text-blue-200 tabular-nums leading-none mt-2">
              {(db.initiatives || []).filter((i) => !i?.isProposal && !isVotingClosed(i)).length}
            </p>
            <p className="text-xs text-stone-700 dark:text-slate-300 mt-2 font-bold">Participa con tu voto.</p>
          </div>
        </div>
      </header>

      {showForm && (
        <div className="bg-white/85 dark:bg-slate-950/55 backdrop-blur p-8 rounded-3xl border border-emerald-100/40 dark:border-slate-800/60 shadow-md space-y-6 animate-in slide-in-from-top-4">
          <h3 className="text-xl font-bold flex items-center">
            <Newspaper className="mr-2 text-emerald-600" />
            {editingId != null ? 'Editar comunicado' : 'Redactar Nuevo Comunicado'}
          </h3>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <button
              type="button"
              onClick={() => void handleNewsAiPolish()}
              disabled={aiBusy}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {aiBusy ? 'Procesando…' : 'Sugerir redacción (IA)'}
            </button>
            <button
              type="button"
              onClick={() => void handleNewsAutoExcerpt()}
              disabled={aiBusy}
              className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            >
              Generar resumen corto desde contenido
            </button>
            <p className="text-xs text-stone-700">Usa IA solo para redactar; fechas y categoría siguen siendo manuales.</p>
          </div>
          <form onSubmit={handlePost} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Título *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Categoría</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="General">General</option>
                  <option value="Proyectos">Proyectos</option>
                  <option value="Asamblea">Asamblea</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Eventos">Eventos</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Resumen corto *</label>
                <textarea
                  required
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 h-20"
                  placeholder="Aparecerá en la tarjeta principal..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Contenido completo *</label>
                <textarea
                  required
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 h-40"
                  placeholder="Escribe el artículo completo aquí..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm font-bold text-stone-800 mb-1.5">
                  <PlayCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden />
                  Video de YouTube (opcional)
                </label>
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={form.youtubeUrl}
                  onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  placeholder="https://www.youtube.com/watch?v=… o https://youtu.be/…"
                />
                <p className="text-xs text-stone-600 mt-1.5">
                  Se mostrará un reproductor adaptable al ancho de la pantalla. Déjalo vacío si no hay video.
                </p>
              </div>
            </div>

            <div className="border-2 border-dashed border-emerald-200 bg-emerald-50 p-8 rounded-2xl text-center hover:bg-emerald-100 transition-colors">
              <input
                type="file"
                id="img-upload"
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const picked = Array.from(e.target.files || [])
                  e.target.value = ''
                  if (picked.length === 0) return
                  appendImageFiles(picked)
                }}
              />
              <label htmlFor="img-upload" className="cursor-pointer flex flex-col items-center">
                <UploadCloud className="w-10 h-10 text-emerald-600 mb-3" />
                <span className="font-bold text-emerald-900 text-lg">
                  {form.mediaItems.length > 0
                    ? `${form.mediaItems.length} / ${MAX_NEWS_IMAGES_COUNT} imagen(es)`
                    : 'Añadir imágenes (una o varias)'}
                </span>
                <span className="text-sm text-emerald-600 mt-1">
                  Puedes ir sumando de a una hasta {MAX_NEWS_IMAGES_COUNT} fotos; no se reemplazan al elegir más
                  {editingId != null ? ' (en edición también puedes añadir archivos nuevos junto a las ya publicadas)' : ''}.
                </span>
                <span className="text-xs text-emerald-700/80 mt-2 font-medium max-w-md">
                  Cada archivo: máximo {Math.round(MAX_NEWS_IMAGE_BYTES / 1024)} KB. Si publicas sin imágenes, se pedirá
                  confirmación y se usará el logo de Las Blancas.
                </span>
              </label>
              {form.mediaItems.length > 0 && (
                <div className="mt-5 text-left max-w-2xl mx-auto space-y-3">
                  <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                    Imagen de portada (tarjeta del muro)
                  </p>
                  <p className="text-xs text-emerald-800/90">
                    Marca cuál foto quieres como principal; el resto sigue en la galería al abrir la noticia.
                  </p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {form.mediaItems.map((m) => {
                      const isCover =
                        form.coverMediaId != null
                          ? form.coverMediaId === m.id
                          : m.id === form.mediaItems[0]?.id
                      return (
                        <li
                          key={m.id}
                          className={`flex gap-3 bg-white/90 rounded-xl p-3 border-2 transition-colors ${
                            isCover ? 'border-emerald-500 shadow-md' : 'border-emerald-100'
                          }`}
                        >
                          <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                            <NewsMediaThumb item={m} />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-emerald-900">
                              <input
                                type="radio"
                                name="news-cover"
                                className="h-4 w-4 accent-emerald-600"
                                checked={isCover}
                                onChange={() => setForm((prev) => ({ ...prev, coverMediaId: m.id }))}
                              />
                              Portada
                            </label>
                            <span className="truncate text-xs font-medium text-stone-800">
                              {m.type === 'file' ? (
                                <>
                                  {m.file.name}{' '}
                                  <span className="text-emerald-600">({Math.round(m.file.size / 1024)} KB)</span>
                                </>
                              ) : (
                                <span className="text-emerald-800">Ya publicada</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeMediaItem(m.id)}
                              className="self-start text-red-600 font-bold text-[10px] uppercase tracking-wide hover:underline"
                            >
                              Quitar
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isUploading}
              className="w-full bg-emerald-600 text-white p-4 rounded-xl font-black flex justify-center items-center disabled:opacity-50 hover:bg-emerald-700 transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="animate-spin mr-2" />
                  {editingId != null ? 'Guardando...' : 'Publicando...'}
                </>
              ) : editingId != null ? (
                'Guardar cambios'
              ) : (
                'Publicar Noticia a la Comunidad'
              )}
            </button>
          </form>
        </div>
      )}

      {(db.news || []).length === 0 && !showForm && (
        <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-12 text-center">
          <Newspaper className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-80" />
          <p className="text-stone-800 font-bold text-lg mb-1">Aún no hay noticias</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Cuando publiquen comunicados en el portal, aparecerán aquí. Si puedes publicar, usa &quot;Publicar
            Noticia&quot;.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(db.news || []).map((post) => {
          const galleryCount = newsOwnImagesList(post).length
          const cardCover = getNewsListPreviewCoverUrl(post)
          const cardCoverIsFallback = isNewsFallbackImageUrl(cardCover)
          const cardHasVideo = Boolean(getYoutubeVideoIdFromNewsPost(post))
          return (
          <article
            key={post.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedPost(post)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSelectedPost(post)
              }
            }}
            className="relative bg-white/85 dark:bg-slate-950/55 backdrop-blur rounded-3xl overflow-hidden border border-stone-100 dark:border-slate-800/60 shadow-sm flex flex-col group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
          >
            {isAdminLike(currentUser) && (
              <div
                className="absolute top-3 right-3 z-20 flex gap-1.5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(post)
                  }}
                  className="bg-white/95 text-emerald-800 p-2 rounded-lg shadow-md border border-emerald-100 hover:bg-emerald-50"
                  title="Editar noticia"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    requestDeleteNews(post)
                  }}
                  className="bg-white/95 text-red-700 p-2 rounded-lg shadow-md border border-red-100 hover:bg-red-50"
                  title="Eliminar noticia"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <div
              className={`h-56 relative overflow-hidden bg-stone-100 flex items-center justify-center ${
                cardCoverIsFallback ? 'p-7 sm:p-9' : 'p-1'
              }`}
            >
              <img
                src={cardCover}
                className={`max-h-full w-full object-center transition-transform duration-500 group-hover:scale-[1.02] ${
                  cardCoverIsFallback
                    ? 'max-w-[min(100%,200px)] object-contain scale-100 sm:scale-105'
                    : 'max-w-full h-full object-contain'
                }`}
                alt={post.title}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/55 to-transparent" />
              <div className="absolute top-4 left-4 bg-emerald-600 text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest">
                {post.category}
              </div>
              <div className="absolute bottom-3 right-3 flex flex-wrap items-center justify-end gap-1.5">
                {cardHasVideo && (
                  <span className="inline-flex items-center gap-1 bg-red-600/95 text-white text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wide">
                    <PlayCircle className="w-3 h-3 shrink-0" aria-hidden />
                    Video
                  </span>
                )}
                {galleryCount > 1 && (
                  <span className="bg-black/55 text-white text-[10px] font-bold px-2 py-1 rounded-md">
                    {galleryCount} fotos
                  </span>
                )}
              </div>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="text-xl font-bold text-stone-900 dark:text-slate-100 mb-3 leading-tight group-hover:text-emerald-700 transition-colors">
                {post.title}
              </h3>
              <p className="text-stone-600 dark:text-slate-300 text-sm mb-6 flex-1 line-clamp-3">{post.excerpt}</p>
              <div className="pt-4 border-t border-stone-100 dark:border-slate-800/60 flex justify-between items-center text-xs font-bold text-stone-500 dark:text-slate-400 uppercase tracking-widest">
                <span className="flex items-center">
                  <User className="w-3.5 h-3.5 mr-1.5" /> {post.author}
                </span>
                <span className="flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1.5" /> {post.date}
                </span>
              </div>
            </div>
          </article>
          )
        })}
      </div>
    </div>
  )
}

const DashboardView = ({
  currentUser,
  db,
  setActiveTab,
  upsertPortalEvent,
  deletePortalEvent,
  savePublicSettings,
  updateUserProfile,
  addNewsPost,
  logAction,
  showAlert,
  showConfirm,
}) => {
  const activePolls = (db.initiatives || []).filter((i) => !i?.isProposal && !isVotingClosed(i)).length
  const totalRaisedInProjects = sumFundsRaisedTotal(db.funds || [])
  const currentUserRow = useMemo(
    () => (db.users || []).find((u) => String(u?.lot) === String(currentUser?.lotNumber)),
    [db.users, currentUser?.lotNumber],
  )
  const greetingFamilyName = (currentUserRow?.fincaName || '').trim() || currentUser?.lotNumber

  const upcomingEvents = useMemo(() => {
    const t0 = startOfLocalToday()
    return (db.events || [])
      .filter((e) => e?.startsAt && Date.parse(e.startsAt) >= t0)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  }, [db.events])
  const [upcomingIdx, setUpcomingIdx] = useState(0)

  useEffect(() => {
    if (upcomingEvents.length === 0) {
      setUpcomingIdx(0)
      return
    }
    setUpcomingIdx((idx) => Math.min(idx, upcomingEvents.length - 1))
  }, [upcomingEvents.length])

  const nextEvent = upcomingEvents[upcomingIdx] || null

  const [coHolidays, setCoHolidays] = useState([])
  const [holidaysErr, setHolidaysErr] = useState(null)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState(null)
  const [eventAiBusy, setEventAiBusy] = useState(false)
  const [eventForm, setEventForm] = useState({
    title: '',
    kind: 'ordinary',
    startsAt: '',
    location: '',
    notes: '',
  })
  const [editInicioInfo, setEditInicioInfo] = useState(false)
  const [infoSaving, setInfoSaving] = useState(false)
  const [cameraAccessSaving, setCameraAccessSaving] = useState(false)
  const [cameraAccessFilter, setCameraAccessFilter] = useState('all')
  const [infoDraft, setInfoDraft] = useState({
    workerName: '',
    workerPhone: '',
    adminFeeDigits: '',
    paymentAlias: '',
    paymentBankName: '',
    paymentAccountNumber: '',
    paymentReceiptEmail: '',
  })

  const settingsRow = useMemo(
    () => (db.settings || []).find((s) => String(s.id) === 'public'),
    [db.settings],
  )
  const cameraAccessAnswer =
    currentUserRow?.cameraPortadaAccess === true
      ? 'yes'
      : currentUserRow?.cameraPortadaAccess === false
        ? 'no'
        : null
  const cameraAccessRows = useMemo(() => {
    return (db.users || [])
      .map((u) => ({
        lot: String(u?.lot || '').trim(),
        hasAccess:
          u?.cameraPortadaAccess === true ? true : u?.cameraPortadaAccess === false ? false : null,
      }))
      .filter((row) => row.lot)
      .sort((a, b) => a.lot.localeCompare(b.lot, 'es-CO', { numeric: true, sensitivity: 'base' }))
  }, [db.users])
  const cameraAccessStats = useMemo(() => {
    const yes = cameraAccessRows.filter((row) => row.hasAccess === true).length
    const no = cameraAccessRows.filter((row) => row.hasAccess === false).length
    const pending = cameraAccessRows.filter((row) => row.hasAccess == null).length
    return { yes, no, pending, total: cameraAccessRows.length }
  }, [cameraAccessRows])
  const cameraAccessFilteredRows = useMemo(() => {
    if (cameraAccessFilter === 'yes') return cameraAccessRows.filter((row) => row.hasAccess === true)
    if (cameraAccessFilter === 'no') return cameraAccessRows.filter((row) => row.hasAccess === false)
    if (cameraAccessFilter === 'pending') return cameraAccessRows.filter((row) => row.hasAccess == null)
    return cameraAccessRows
  }, [cameraAccessRows, cameraAccessFilter])
  const inicioPublic = useMemo(() => {
    const fee = fundAmountFromDb(settingsRow?.adminFeeCOP)
    return {
      workerName: (settingsRow?.workerName || '').trim() || DEFAULT_INICIO_PUBLIC.workerName,
      workerPhone: (settingsRow?.workerPhone || '').trim() || DEFAULT_INICIO_PUBLIC.workerPhone,
      adminFeeCOP: fee > 0 ? fee : DEFAULT_INICIO_PUBLIC.adminFeeCOP,
      paymentAlias: (settingsRow?.paymentAlias || '').trim() || DEFAULT_INICIO_PUBLIC.paymentAlias,
      paymentBankName:
        (settingsRow?.paymentBankName || '').trim() || DEFAULT_INICIO_PUBLIC.paymentBankName,
      paymentAccountNumber:
        (settingsRow?.paymentAccountNumber || '').trim() || DEFAULT_INICIO_PUBLIC.paymentAccountNumber,
      paymentReceiptEmail:
        (settingsRow?.paymentReceiptEmail || '').trim() || DEFAULT_INICIO_PUBLIC.paymentReceiptEmail,
    }
  }, [settingsRow])

  useEffect(() => {
    let cancelled = false
    fetch('https://date.nager.at/api/v3/PublicHolidays/2026/CO')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setCoHolidays(data)
      })
      .catch(() => {
        if (!cancelled) setHolidaysErr('No se pudieron cargar los feriados en línea.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveEvent = async (e) => {
    e.preventDefault()
    if (!eventForm.title.trim()) return showAlert('Escribe el título del evento.')
    if (!eventForm.startsAt) return showAlert('Indica fecha y hora del evento.')
    if (!eventForm.location.trim()) return showAlert('Indica el lugar o enlace.')
    const id = editingEventId || `ev-${Date.now()}`
    const row = {
      id,
      title: eventForm.title.trim(),
      kind: eventForm.kind,
      startsAt: new Date(eventForm.startsAt).toISOString(),
      location: eventForm.location.trim(),
      notes: eventForm.notes.trim() || '',
      createdAt: Date.now(),
      createdBy: currentUser?.lotNumber,
    }
    try {
      await upsertPortalEvent(row)
      logAction(editingEventId ? 'EDITAR_EVENTO' : 'CREAR_EVENTO', `${editingEventId ? 'Editó' : 'Creó'} evento: ${row.title}`)
      setEditingEventId(null)
      setEventForm({ title: '', kind: 'ordinary', startsAt: '', location: '', notes: '' })
      showAlert('Evento guardado. Aparecerá en el resumen y en la agenda de eventos.')
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar el evento.')
    }
  }

  const handleEventAiPolish = async () => {
    if (!eventForm.title.trim() && !eventForm.notes.trim()) {
      showAlert('Escribe título o notas para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setEventAiBusy(true)
    try {
      const [title, notes] = await Promise.all([
        requestPolishedText('event_title', eventForm.title),
        requestPolishedText('event_notes', eventForm.notes),
      ])
      setEventForm((prev) => ({
        ...prev,
        title: title || prev.title,
        notes: notes || prev.notes,
      }))
      showAlert('Sugerencias de redacción del evento aplicadas.')
    } finally {
      setEventAiBusy(false)
    }
  }

  const requestDeleteEvent = (ev) => {
    showConfirm(`¿Eliminar el evento "${ev.title}"?`, async () => {
      try {
        await deletePortalEvent(ev.id)
        logAction('ELIMINAR_EVENTO', `Eliminó evento #${ev.id}`)
        showAlert('Evento eliminado.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar el evento.')
      }
    })
  }

  const startEditEvent = (ev) => {
    setEditingEventId(ev.id)
    setEventsOpen(true)
    setEventForm({
      title: ev.title || '',
      kind: ev.kind || 'ordinary',
      startsAt: toLocalDatetimeInputValue(ev.startsAt),
      location: ev.location || '',
      notes: ev.notes || '',
    })
  }

  const convertEventToNews = (ev) => {
    showConfirm(`¿Convertir el evento "${ev.title}" en noticia del muro?`, async () => {
      try {
        const post = {
          id: Date.now(),
          title: `Evento: ${ev.title}`,
          excerpt: ev.notes?.trim() || `Próximo evento en ${ev.location}.`,
          content: `${ev.notes?.trim() || 'Evento comunitario programado.'}\n\nFecha: ${formatPortalEventWhen(ev.startsAt)}\nLugar: ${ev.location}`,
          category: 'Eventos',
          images: [],
          coverIndex: 0,
          author: currentUser?.lotNumber,
          date: new Date().toLocaleDateString('es-CO'),
        }
        await addNewsPost(post)
        logAction('EVENTO_A_NOTICIA', `Convirtió evento #${ev.id} a noticia`)
        showAlert('Evento convertido en noticia del muro.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo convertir el evento en noticia.')
      }
    })
  }

  const handleCameraAccessAnswer = async (hasAccess) => {
    if (!currentUser?.lotNumber) return showAlert('No se encontró tu lote para guardar la respuesta.')
    setCameraAccessSaving(true)
    try {
      await updateUserProfile(currentUser.lotNumber, {
        cameraPortadaAccess: Boolean(hasAccess),
        cameraPortadaAccessUpdatedAt: Date.now(),
      })
      logAction(
        'ACTUALIZAR_ACCESO_CAMARA_PORTADA',
        `${currentUser.lotNumber} respondió acceso cámara portada: ${hasAccess ? 'SI' : 'NO'}`,
      )
      showAlert(
        hasAccess
          ? '¡Gracias! Registramos que ya tienes acceso a la cámara de la portada.'
          : 'Respuesta guardada. Cuando tengas acceso, por favor vuelve y cámbiala a "Sí".',
      )
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar tu respuesta. Inténtalo de nuevo.')
    } finally {
      setCameraAccessSaving(false)
    }
  }

  const toggleCameraAccessFilter = (nextFilter) => {
    setCameraAccessFilter((prev) => (prev === nextFilter ? 'all' : nextFilter))
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-stone-800 dark:text-slate-100">Hola, Familia {greetingFamilyName} 👋</h1>
          <p className="text-stone-600 dark:text-slate-300 mt-2 font-medium">Resumen rápido de Las Blancas.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-emerald-600 dark:bg-slate-950/55 text-white p-8 rounded-3xl shadow-sm relative overflow-hidden lg:col-span-2 ring-1 ring-emerald-500/20 dark:ring-slate-800/60">
          <div className="relative z-10">
            <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white mb-4">
              <CheckCircle2 className="w-3 h-3 mr-1.5" /> Asamblea Virtual
            </span>
            <h3 className="text-2xl font-black mb-3">Tus opiniones construyen comunidad</h3>
            <p className="text-emerald-50 mb-6 max-w-md">
              Ingresa a la sección de iniciativas para revisar los proyectos actuales, votar o proponer nuevas ideas de
              mejora.
            </p>
            <button
              type="button"
              onClick={() => {
                void trackPortalEvent('dashboard_cta_click', { cta: 'go_initiatives' })
                setActiveTab('initiatives')
              }}
              className="bg-white/90 dark:bg-slate-900/70 text-emerald-800 dark:text-slate-100 px-6 py-3 rounded-xl font-bold shadow-sm transition-transform hover:scale-105 border border-white/30 dark:border-slate-800/60"
            >
              Ir a Votaciones ({activePolls} Activas)
            </button>
          </div>
          <BarChart2 className="absolute -bottom-6 -right-6 w-56 h-56 text-emerald-500/30 transform -rotate-12" />
        </div>

        <div className="space-y-6 flex flex-col">
          <button
            type="button"
            onClick={() => {
              void trackPortalEvent('dashboard_cta_click', { cta: 'go_funds' })
              setActiveTab('funds')
            }}
            className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/40 border border-emerald-100/30 hover:border-emerald-200 cursor-pointer transition-all flex-1 flex flex-col justify-center text-left w-full p-6 rounded-3xl shadow-sm hover:shadow-md"
          >
            <h3 className="text-stone-600 font-bold mb-1 flex items-center text-xs uppercase tracking-widest">
              <TrendingUp className="w-4 h-4 mr-2 text-blue-600" /> Proyectos y Fondos
            </h3>
            <p className="text-xs text-stone-500 mb-1">Recaudo total en proyectos:</p>
            <p className="text-2xl font-black text-blue-700">{formatCurrency(totalRaisedInProjects)}</p>
            <p className="text-[10px] text-stone-500 mt-2 leading-snug">
              Suma del dinero registrado como recaudado en cada proyecto del conjunto.
            </p>
          </button>
          <div className="bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/50 ring-1 ring-amber-100/50 border border-amber-100/40 rounded-3xl p-6 shadow-sm flex-1 flex flex-col justify-center gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-amber-600 font-bold flex items-center text-xs uppercase tracking-widest">
                <Calendar className="w-4 h-4 mr-2" /> Próximo evento comunitario
              </h3>
              {upcomingEvents.length > 1 && (
                <div className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setUpcomingIdx((i) => (i > 0 ? i - 1 : upcomingEvents.length - 1))}
                    className="p-1.5 rounded-md text-amber-700 hover:bg-amber-50"
                    aria-label="Evento anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-black text-amber-800 px-1 min-w-[2.5rem] text-center">
                    {upcomingIdx + 1}/{upcomingEvents.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUpcomingIdx((i) => (i < upcomingEvents.length - 1 ? i + 1 : 0))}
                    className="p-1.5 rounded-md text-amber-700 hover:bg-amber-50"
                    aria-label="Evento siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {nextEvent ? (
              <>
                <p className="font-black text-stone-800 text-lg leading-snug">{nextEvent.title}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800/90">
                  {EVENT_KIND_LABELS[nextEvent.kind] || EVENT_KIND_LABELS.other}
                </p>
                <p className="text-stone-700 font-bold text-sm">{formatPortalEventWhen(nextEvent.startsAt)}</p>
                <p className="text-stone-600 text-xs flex items-start gap-1">
                  <MapPin className="w-3 h-3 mr-1 shrink-0 mt-0.5" /> {nextEvent.location}
                </p>
              </>
            ) : (
              <p className="text-stone-700 text-sm">
                Aún no hay eventos programados a partir de hoy. Si puedes editar el resumen, crea asambleas o
                reuniones en el panel de abajo.
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-blue-100 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 p-5 md:p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-700">Acceso cámara de portada</h3>
            <p className="text-sm text-stone-700 mt-2">
              ¿Actualmente tienes acceso a la cámara de vigilancia de la portada?
            </p>
            <details className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-blue-800">
                Instrucciones para activar acceso
              </summary>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-xs text-stone-700">
                <li>Descargar la app Hik-Connect.</li>
                <li>Crear una cuenta (con número de celular o correo).</li>
                <li>Contactar a la persona encargada de la cámara en el grupo de WhatsApp de Las Blancas.</li>
                <li>Escanear el código QR compartido y usar la clave que les asignen.</li>
              </ol>
            </details>
            <p className="text-xs text-stone-600 mt-1">
              Si respondes «No», cuando ya tengas acceso por favor vuelve y cambia tu respuesta a «Sí».
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={cameraAccessSaving}
              onClick={() => void handleCameraAccessAnswer(true)}
              className={`inline-flex items-center rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                cameraAccessAnswer === 'yes'
                  ? 'border-emerald-300 bg-emerald-600 text-white'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              } disabled:opacity-60`}
            >
              <Eye className="w-4 h-4 mr-1.5" /> Sí
            </button>
            <button
              type="button"
              disabled={cameraAccessSaving}
              onClick={() => void handleCameraAccessAnswer(false)}
              className={`inline-flex items-center rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                cameraAccessAnswer === 'no'
                  ? 'border-red-300 bg-red-600 text-white'
                  : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
              } disabled:opacity-60`}
            >
              <EyeOff className="w-4 h-4 mr-1.5" /> No
            </button>
          </div>
        </div>
        {isAdminLike(currentUser) && (
          <div className="mt-5 border-t border-blue-100 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider">
              <button
                type="button"
                onClick={() => toggleCameraAccessFilter('yes')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'yes'
                    ? 'border-emerald-300 bg-emerald-600 text-white'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Sí: {cameraAccessStats.yes}
              </button>
              <button
                type="button"
                onClick={() => toggleCameraAccessFilter('no')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'no'
                    ? 'border-red-300 bg-red-600 text-white'
                    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                No: {cameraAccessStats.no}
              </button>
              <button
                type="button"
                onClick={() => toggleCameraAccessFilter('pending')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'pending'
                    ? 'border-stone-300 bg-stone-700 text-white'
                    : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                Sin responder: {cameraAccessStats.pending}
              </button>
              <button
                type="button"
                onClick={() => setCameraAccessFilter('all')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'all'
                    ? 'border-blue-300 bg-blue-600 text-white'
                    : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Total lotes: {cameraAccessStats.total}
              </button>
            </div>
            <details className="mt-3 rounded-2xl border border-stone-200 bg-white" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase tracking-wide text-stone-700 border-b border-stone-200 bg-stone-50">
                Ver listado detallado por lote
              </summary>
              <div className="max-h-60 overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-black uppercase tracking-wide text-stone-600">Lote</th>
                      <th className="px-3 py-2 text-left font-black uppercase tracking-wide text-stone-600">
                        Acceso cámara portada
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cameraAccessFilteredRows.map((row) => (
                      <tr key={`camera-access-${row.lot}`} className="border-b border-stone-100 last:border-0">
                        <td className="px-3 py-2 font-mono font-bold text-stone-800">{row.lot}</td>
                        <td className="px-3 py-2">
                          {row.hasAccess === true ? (
                            <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                              Sí
                            </span>
                          ) : row.hasAccess === false ? (
                            <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-bold text-red-700">
                              No
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 font-bold text-stone-600">
                              Sin responder
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {cameraAccessFilteredRows.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-4 text-center text-stone-500">
                          No hay lotes para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </section>

      <div className="rounded-3xl border border-emerald-100/40 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/30 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
            <Phone className="w-4 h-4" /> Cuota del conjunto y pagos
          </h3>
          {isAdminLike(currentUser) && (
            <button
              type="button"
              onClick={() => {
                if (editInicioInfo) {
                  setEditInicioInfo(false)
                } else {
                  setInfoDraft({
                    workerName: inicioPublic.workerName,
                    workerPhone: inicioPublic.workerPhone,
                    adminFeeDigits: copDigitsFromInput(String(inicioPublic.adminFeeCOP)),
                    paymentAlias: inicioPublic.paymentAlias,
                    paymentBankName: inicioPublic.paymentBankName,
                    paymentAccountNumber: inicioPublic.paymentAccountNumber,
                    paymentReceiptEmail: inicioPublic.paymentReceiptEmail,
                  })
                  setEditInicioInfo(true)
                }
              }}
              className="text-xs font-black uppercase tracking-wide bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg border border-white/30"
            >
              {editInicioInfo ? 'Cerrar edición' : 'Editar información'}
            </button>
          )}
        </div>
        <div className="p-5 md:p-6 space-y-4">
          {editInicioInfo && isAdminLike(currentUser) ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!infoDraft.workerName.trim()) return showAlert('Indica el nombre del trabajador.')
                if (!infoDraft.workerPhone.trim()) return showAlert('Indica el teléfono.')
                const fee = parseCopIntegerFromDigits(infoDraft.adminFeeDigits)
                if (fee <= 0) return showAlert('La cuota debe ser mayor a cero (solo números).')
                if (!infoDraft.paymentAlias.trim())
                  return showAlert('Indica la llave alfanumérica para transferencias.')
                if (!infoDraft.paymentBankName.trim() || !infoDraft.paymentAccountNumber.trim())
                  return showAlert('Indica banco y número de cuenta para consignaciones.')
                if (!infoDraft.paymentReceiptEmail.trim() || !infoDraft.paymentReceiptEmail.includes('@'))
                  return showAlert('Indica un correo válido para recibir comprobantes.')
                setInfoSaving(true)
                savePublicSettings({
                  workerName: infoDraft.workerName.trim(),
                  workerPhone: infoDraft.workerPhone.trim(),
                  adminFeeCOP: fee,
                  paymentAlias: infoDraft.paymentAlias.trim(),
                  paymentBankName: infoDraft.paymentBankName.trim(),
                  paymentAccountNumber: infoDraft.paymentAccountNumber.trim(),
                  paymentReceiptEmail: infoDraft.paymentReceiptEmail.trim(),
                })
                  .then(() => {
                    logAction('EDITAR_INFO_RESUMEN', 'Actualizó cuota, contacto y cuentas de pago')
                    showAlert('Cambios guardados correctamente.')
                    setEditInicioInfo(false)
                  })
                  .catch((err) => {
                    console.error(err)
                    showAlert('No se pudo guardar. Revisa permisos de Firestore en la colección settings.')
                  })
                  .finally(() => setInfoSaving(false))
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Trabajador del conjunto</label>
                  <input
                    value={infoDraft.workerName}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, workerName: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Teléfono</label>
                  <input
                    value={infoDraft.workerPhone}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, workerPhone: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Llave alfanumérica</label>
                  <input
                    value={infoDraft.paymentAlias}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentAlias: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono"
                    placeholder="@usuario"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Banco</label>
                  <input
                    value={infoDraft.paymentBankName}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentBankName: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Número de cuenta</label>
                  <input
                    value={infoDraft.paymentAccountNumber}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentAccountNumber: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Correo para enviar comprobante
                  </label>
                  <input
                    type="email"
                    value={infoDraft.paymentReceiptEmail}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentReceiptEmail: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="comunidadlasblancas@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Cuota mensual del conjunto (COP)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={infoDraft.adminFeeDigits}
                    onChange={(e) =>
                      setInfoDraft((d) => ({ ...d, adminFeeDigits: copDigitsFromInput(e.target.value) }))
                    }
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono font-bold tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={infoSaving}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {infoSaving ? 'Guardando…' : 'Guardar datos'}
              </button>
            </form>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-stone-100 bg-stone-50/90 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-600 mb-1">
                  Trabajador Las Blancas
                </p>
                <p className="text-lg font-black text-stone-900">{inicioPublic.workerName}</p>
                <a
                  href={telHrefFromDisplayPhone(inicioPublic.workerPhone) || undefined}
                  className="mt-2 inline-flex items-center text-emerald-700 font-bold text-base hover:underline"
                >
                  <Phone className="w-4 h-4 mr-2 shrink-0" />
                  {inicioPublic.workerPhone}
                </a>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800 mb-1">
                  Cuota para cubrir salario
                </p>
                <p className="text-2xl font-black text-emerald-800">{formatCurrency(inicioPublic.adminFeeCOP)}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">Formas de pago</p>
                <p className="text-xs text-stone-700">Puedes pagar por cualquiera de estos dos medios:</p>
                <p className="text-sm text-stone-800">
                  <span className="font-black">Llave (alfanumérica):</span>{' '}
                  <span className="font-mono font-bold">{inicioPublic.paymentAlias}</span>
                </p>
                <p className="text-sm text-stone-800">
                  <span className="font-black">{inicioPublic.paymentBankName}:</span>{' '}
                  <span className="font-mono font-bold">{inicioPublic.paymentAccountNumber}</span>
                </p>
                <p className="text-sm text-stone-800">
                  <span className="font-black">Enviar comprobante a:</span>{' '}
                  <span className="font-semibold">{inicioPublic.paymentReceiptEmail}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-black text-stone-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" /> Feriados en Colombia (2026)
          </h3>
          <a
            href="https://date.nager.at/"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-emerald-700 hover:underline shrink-0"
          >
            Fuente: Nager.Date (API pública) →
          </a>
        </div>
        {holidaysErr && <p className="text-sm text-amber-800 mb-2">{holidaysErr}</p>}
        <ul className="max-h-40 overflow-y-auto text-sm text-stone-800 space-y-1.5 pr-1">
          {coHolidays.map((h) => (
            <li key={h.date + h.name} className="flex gap-2">
              <span className="font-mono text-xs text-stone-600 shrink-0 w-[5.5rem]">{h.date}</span>
              <span>{h.localName || h.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {isAdminLike(currentUser) && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6">
          <button
            type="button"
            onClick={() => setEventsOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left font-black text-emerald-900 text-lg"
          >
            <span>Eventos comunitarios (edición)</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${eventsOpen ? 'rotate-180' : ''}`} />
          </button>
          {eventsOpen && (
            <div className="mt-6 space-y-6">
              <p className="text-sm text-stone-800">
                Crea asambleas, reuniones extraordinarias o días especiales. Se muestran en orden cronológico; el
                bloque amarillo del resumen toma el próximo a partir de hoy.
              </p>
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                <button
                  type="button"
                  onClick={() => void handleEventAiPolish()}
                  disabled={eventAiBusy}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                  {eventAiBusy ? 'Procesando…' : 'Sugerir redacción (IA)'}
                </button>
                <p className="mt-1.5 text-xs text-stone-700">
                  Mejora solo título y notas. Fecha, tipo y lugar siguen siendo manuales.
                </p>
              </div>
              <form onSubmit={saveEvent} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/80 rounded-2xl p-4 border border-emerald-100">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Título *</label>
                  <input
                    value={eventForm.title}
                    onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Ej: Asamblea general ordinaria"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Tipo *</label>
                  <select
                    value={eventForm.kind}
                    onChange={(e) => setEventForm((f) => ({ ...f, kind: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold"
                  >
                    {Object.entries(EVENT_KIND_LABELS).map(([k, lab]) => (
                      <option key={k} value={k}>
                        {lab}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Fecha y hora *</label>
                  <input
                    type="datetime-local"
                    value={eventForm.startsAt}
                    onChange={(e) => setEventForm((f) => ({ ...f, startsAt: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Lugar o enlace *</label>
                  <input
                    value={eventForm.location}
                    onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Ej: Kiosco principal / Meet…"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Notas (opcional)</label>
                  <textarea
                    value={eventForm.notes}
                    onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Orden del día, documentos, etc."
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-800"
                  >
                    {editingEventId ? 'Guardar cambios del evento' : 'Guardar evento'}
                  </button>
                  {editingEventId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEventId(null)
                        setEventForm({ title: '', kind: 'ordinary', startsAt: '', location: '', notes: '' })
                      }}
                      className="ml-2 bg-white border border-stone-200 text-stone-800 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-stone-50"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
              </form>

              <div>
                <h4 className="text-sm font-black text-stone-800 mb-2">Eventos registrados</h4>
                {(db.events || []).length === 0 ? (
                  <p className="text-sm text-stone-600">Ninguno aún.</p>
                ) : (
                  <ul className="space-y-2">
                    {[...(db.events || [])]
                      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
                      .map((ev) => (
                        <li
                          key={ev.id}
                          className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 bg-white rounded-xl border border-stone-100 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-stone-900">{ev.title}</p>
                            <p className="text-xs text-stone-600 truncate">
                              {formatPortalEventWhen(ev.startsAt)} · {ev.location}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:justify-end text-xs font-bold">
                            <button
                              type="button"
                              onClick={() => startEditEvent(ev)}
                              className="text-emerald-700 hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => convertEventToNews(ev)}
                              className="text-blue-700 hover:underline"
                            >
                              Convertir en noticia
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteEvent(ev)}
                              className="text-red-600 hover:underline"
                            >
                              Eliminar
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Normaliza el optionId del voto al tipo/id real de la encuesta. */
const coerceSurveyOptionId = (options, raw) => {
  const match = (options || []).find((o) => String(o.id) === String(raw))
  return match ? match.id : raw
}

/** Panel superadmin: editar lista de votos (lote → opción) y guardar en Firestore. */
const SuperadminVotesPanel = ({ post, db, saveInitiative, logAction, showAlert }) => {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState([])

  const opts = post.survey?.options || []
  const votesKey = JSON.stringify(post.survey?.votes || [])

  useEffect(() => {
    if (!open) return
    setDraft((post.survey?.votes || []).map((r) => ({ ...r })))
  }, [open, post.id, votesKey])

  const lotChoices = useMemo(() => {
    const set = new Set()
    ;(db.users || []).forEach((u) => {
      if (u?.lot) set.add(String(u.lot))
    })
    ;(post.survey?.votes || []).forEach((v) => {
      if (v?.lot) set.add(String(v.lot))
    })
    draft.forEach((r) => {
      if (r?.lot) set.add(String(r.lot).trim())
    })
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }, [db.users, post.survey?.votes, draft])

  const syncDraftFromServer = () => {
    setDraft((post.survey?.votes || []).map((r) => ({ ...r })))
  }

  const persist = async () => {
    if (!opts.length) {
      showAlert('Esta iniciativa no tiene opciones de encuesta.')
      return
    }
    const byLot = new Map()
    for (const row of draft) {
      const lot = String(row.lot || '').trim()
      if (!lot) continue
      const optionId = coerceSurveyOptionId(opts, row.optionId)
      if (!opts.some((o) => String(o.id) === String(optionId))) {
        showAlert(`La opción elegida no es válida para el lote ${lot}.`)
        return
      }
      const ts =
        row.timestamp?.trim() ||
        new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
      byLot.set(lot.toUpperCase(), { lot, optionId, timestamp: ts })
    }
    const votes = Array.from(byLot.values())
    setSaving(true)
    try {
      const updated = {
        ...post,
        survey: { ...post.survey, votes },
      }
      await saveInitiative(updated)
      logAction('SUPERADMIN_VOTOS', `Editó votos manualmente en iniciativa #${post.id}`)
      showAlert('Votación guardada. Los cambios ya están aplicados.')
      setOpen(false)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar la votación.')
    } finally {
      setSaving(false)
    }
  }

  if (!post.survey) return null

  return (
    <div className="mt-6 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left font-black text-amber-950 hover:bg-amber-100/50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0 text-sm sm:text-base">
          <Shield className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-amber-700" aria-hidden />
          <span className="leading-snug">Gestionar votación manualmente (superadmin)</span>
        </span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-amber-800 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-amber-100 space-y-4">
          <datalist id={`superadmin-vote-lots-${post.id}`}>
            {lotChoices.map((lot) => (
              <option key={lot} value={lot} />
            ))}
          </datalist>
          <p className="text-xs text-amber-950/80 font-medium leading-relaxed pt-3">
            Asigna o corrige el voto de cada lote. Solo puede haber un voto por lote: si repites un lote, prevalece la
            última fila. Los cambios se guardan en la nube para toda la comunidad.
          </p>
          <div className="rounded-xl border border-amber-100 bg-white/90 overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="border-b border-stone-100 text-left text-[10px] font-black uppercase tracking-wider text-stone-600">
                  <th className="px-3 py-2.5">Lote</th>
                  <th className="px-3 py-2.5">Opción</th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {draft.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-stone-600 font-medium text-xs">
                      No hay votos. Usa &quot;Añadir fila&quot; para registrar votos en nombre de los lotes.
                    </td>
                  </tr>
                ) : (
                  draft.map((row, idx) => (
                    <tr key={idx} className="align-middle">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          list={`superadmin-vote-lots-${post.id}`}
                          value={row.lot || ''}
                          onChange={(e) =>
                            setDraft((d) => d.map((r, i) => (i === idx ? { ...r, lot: e.target.value } : r)))
                          }
                          placeholder="Ej: LOTE29"
                          className="w-full max-w-[11rem] border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white outline-none focus:border-amber-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={String(row.optionId ?? '')}
                          onChange={(e) =>
                            setDraft((d) =>
                              d.map((r, i) =>
                                i === idx ? { ...r, optionId: coerceSurveyOptionId(opts, e.target.value) } : r,
                              ),
                            )
                          }
                          className="w-full min-w-[8rem] border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white outline-none focus:border-amber-500"
                        >
                          {opts.map((o) => (
                            <option key={String(o.id)} value={String(o.id)}>
                              {o.text}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setDraft((d) => d.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                          aria-label="Quitar fila"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft((d) => [
                  ...d,
                  {
                    lot: '',
                    optionId: opts[0]?.id ?? '',
                    timestamp: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
                  },
                ])
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 text-xs font-black uppercase tracking-wide hover:bg-amber-50"
            >
              <PlusCircle className="w-4 h-4" /> Añadir fila
            </button>
            <button
              type="button"
              onClick={syncDraftFromServer}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-stone-200 bg-white text-stone-800 text-xs font-bold hover:bg-stone-50"
            >
              Descartar cambios locales
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void persist()}
              className="inline-flex flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black uppercase tracking-wide hover:bg-amber-700 disabled:opacity-50 sm:ml-auto min-w-[10rem]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Guardar votación
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const ProposalsView = ({
  currentUser,
  db,
  saveInitiative,
  deleteInitiative,
  logAction,
  showAlert,
  showConfirm,
}) => {
  const canManageInitiatives = isAdminLike(currentUser)
  const [showProposalForm, setShowProposalForm] = useState(false)
  const [proposalSaving, setProposalSaving] = useState(false)
  const [proposalAiBusy, setProposalAiBusy] = useState(false)
  const [editingProposalId, setEditingProposalId] = useState(null)
  const [proposalDraft, setProposalDraft] = useState({ title: '', excerpt: '' })

  const projectProposals = useMemo(
    () => (db.initiatives || []).filter((i) => i?.isProposal),
    [db.initiatives],
  )

  const getProposalRatingMeta = useCallback(
    (proposal) => {
      const ratings = Array.isArray(proposal?.ratings) ? proposal.ratings : []
      const normalized = ratings
        .map((row) => ({
          lot: String(row?.lot ?? '').trim(),
          stars: Number(row?.stars),
        }))
        .filter((row) => row.lot && Number.isFinite(row.stars) && row.stars >= 1 && row.stars <= 5)

      const total = normalized.reduce((acc, row) => acc + row.stars, 0)
      const average = normalized.length ? total / normalized.length : 0
      const mine = normalized.find((row) => row.lot === currentUser.lotNumber)?.stars ?? 0

      return {
        average,
        count: normalized.length,
        mine,
      }
    },
    [currentUser.lotNumber],
  )

  const resetProposalForm = () => {
    setShowProposalForm(false)
    setEditingProposalId(null)
    setProposalDraft({ title: '', excerpt: '' })
  }

  const handleCreateProposal = async (e) => {
    e.preventDefault()
    if (!proposalDraft.title.trim()) return showAlert('Escribe el título de la propuesta.')
    if (!proposalDraft.excerpt.trim()) return showAlert('Agrega una breve descripción de la propuesta.')
    setProposalSaving(true)
    const isEditingProposal = editingProposalId != null
    const prev = isEditingProposal ? (db.initiatives || []).find((i) => i.id === editingProposalId) : null
    const proposal = {
      ...(prev || {}),
      id: editingProposalId || Date.now(),
      title: proposalDraft.title.trim(),
      excerpt: proposalDraft.excerpt.trim(),
      author: prev?.author || currentUser.lotNumber,
      date: prev?.date || new Date().toLocaleDateString('es-CO'),
      isProposal: true,
      proposalStatus: 'pendiente',
      convertedToProject: false,
      votingClosed: false,
      image: null,
    }
    try {
      await saveInitiative(proposal)
      void trackPortalEvent('proposal_submit', { mode: isEditingProposal ? 'edit' : 'new' })
      logAction(
        isEditingProposal ? 'EDITAR_PROPUESTA' : 'PROPONER_PROYECTO',
        `${isEditingProposal ? 'Editó' : 'Propuso'}: ${proposal.title}`,
      )
      resetProposalForm()
      showAlert(
        isEditingProposal
          ? 'Propuesta actualizada.'
          : 'Propuesta enviada. Quienes coordinan el portal pueden convertirla en votación.',
      )
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar la propuesta.')
    } finally {
      setProposalSaving(false)
    }
  }

  const handleProposalAiPolish = async () => {
    const titleIn = proposalDraft.title.trim()
    const excerptIn = proposalDraft.excerpt.trim()
    if (!titleIn && !excerptIn) {
      showAlert('Escribe título o descripción para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setProposalAiBusy(true)
    try {
      const res = await polishProposalWallDraft({ title: proposalDraft.title, excerpt: proposalDraft.excerpt })
      if (!res) {
        const d = getLastGeminiDetail()
        showAlert(d ? `La IA no respondió: ${d}` : 'La IA no devolvió texto. Revisa la clave en .env o inténtalo en unos segundos.')
        return
      }
      setProposalDraft((prev) => {
        const nextTitle = titleIn ? (res.title || prev.title) : prev.title
        const nextExcerpt = excerptIn ? (res.excerpt || prev.excerpt) : prev.excerpt
        return { ...prev, title: nextTitle, excerpt: nextExcerpt }
      })
      const improvedTitle = titleIn && res.title && res.title !== titleIn
      const improvedExcerpt = excerptIn && res.excerpt && res.excerpt !== excerptIn
      if (!improvedTitle && !improvedExcerpt && (titleIn || excerptIn)) {
        showAlert('La IA devolvió el mismo texto o vacío. Prueba acortando o añade un poco más de contexto.')
      } else if (!excerptIn && titleIn) {
        showAlert('Título revisado con IA. Para la descripción vacía, usa «Descripción desde el título».')
      } else {
        showAlert('Sugerencias de redacción aplicadas. Revísalas antes de enviar.')
      }
    } catch (err) {
      console.error(err)
      showAlert(err instanceof Error ? err.message : 'Error al contactar la IA.')
    } finally {
      setProposalAiBusy(false)
    }
  }

  const handleProposalDescriptionFromTitle = async () => {
    if (!proposalDraft.title.trim()) return showAlert('Escribe el título de la propuesta primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setProposalAiBusy(true)
    try {
      const aiResponse = await fetchGeminiProjectDescriptionFromTitle(proposalDraft.title, { mode: 'proposal' })
      if (aiResponse?.description) {
        setProposalDraft((prev) => ({ ...prev, excerpt: aiResponse.description }))
        showAlert('Descripción sugerida a partir del título. Revísala antes de enviar.')
      } else {
        const d = getLastGeminiDetail()
        showAlert(d ? `La IA no respondió: ${d}` : 'No se pudo generar la descripción. Inténtalo de nuevo.')
      }
    } catch (err) {
      console.error(err)
      showAlert(err instanceof Error ? err.message : 'Error al contactar la IA.')
    } finally {
      setProposalAiBusy(false)
    }
  }

  const startEditProposal = (proposal) => {
    setEditingProposalId(proposal.id)
    setProposalDraft({
      title: proposal.title || '',
      excerpt: proposal.excerpt || '',
    })
    setShowProposalForm(true)
  }

  const handleDeleteProposal = (proposal) => {
    showConfirm(`¿Eliminar la propuesta "${proposal.title}"? Esta acción no se puede deshacer.`, async () => {
      try {
        await deleteInitiative(proposal.id)
        logAction('ELIMINAR_PROPUESTA', `Eliminó propuesta #${proposal.id}`)
        showAlert('Propuesta eliminada correctamente.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar la propuesta.')
      }
    })
  }

  const handleConvertProposalToSurvey = (proposal) => {
    showConfirm(
      `¿Convertir "${proposal.title}" en votación? Se publicará de inmediato en la pestaña de Votaciones.`,
      async () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const converted = {
          ...proposal,
          isProposal: false,
          proposalStatus: 'convertida',
          convertedToProject: false,
          votingClosed: false,
          deadline: toLocalDatetimeInputValue(tomorrow),
          survey: {
            question: `¿Apruebas la propuesta: "${proposal.title || 'Proyecto'}"?`,
            requiresBudget: false,
            budgetAmount: null,
            options: [
              { id: 'opt0', text: 'Sí, de acuerdo' },
              { id: 'opt1', text: 'No, por ahora no' },
            ],
            votes: [],
          },
        }
        try {
          await saveInitiative(converted)
          void trackPortalEvent('proposal_to_survey', { source: 'proposal_wall' })
          logAction('CONVERTIR_PROPUESTA_ENCUESTA', `Convirtió propuesta #${proposal.id} en votación`)
          showAlert('La propuesta se convirtió en votación y ya aparece en la pestaña Votaciones.')
        } catch (err) {
          console.error(err)
          showAlert('No se pudo convertir la propuesta en votación.')
        }
      },
    )
  }

  const handleRateProposal = async (proposal, stars) => {
    const starsValue = Number(stars)
    if (!Number.isInteger(starsValue) || starsValue < 1 || starsValue > 5) return

    const lot = String(currentUser.lotNumber ?? '').trim()
    if (!lot) return showAlert('No encontramos tu lote para registrar la calificación.')

    const currentRatings = Array.isArray(proposal?.ratings) ? proposal.ratings : []
    const nextRatings = []
    let hasExisting = false

    currentRatings.forEach((row) => {
      const rowLot = String(row?.lot ?? '').trim()
      const rowStars = Number(row?.stars)
      if (!rowLot || !Number.isFinite(rowStars) || rowStars < 1 || rowStars > 5) return
      if (rowLot === lot) {
        nextRatings.push({
          lot,
          stars: starsValue,
          timestamp: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        })
        hasExisting = true
      } else {
        nextRatings.push({
          lot: rowLot,
          stars: rowStars,
          timestamp: row?.timestamp || null,
        })
      }
    })

    if (!hasExisting) {
      nextRatings.push({
        lot,
        stars: starsValue,
        timestamp: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
      })
    }

    try {
      await saveInitiative({
        ...proposal,
        ratings: nextRatings,
      })
      logAction(hasExisting ? 'EDITAR_CALIFICACION_PROPUESTA' : 'CALIFICAR_PROPUESTA', `${lot} calificó propuesta #${proposal.id} con ${starsValue} estrella(s)`)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar tu calificación. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-100 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-stone-900">Muro de Propuestas</h2>
          <p className="text-stone-600 mt-1">Espacio para plantear ideas de mejora que luego pueden pasar a votación.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showProposalForm) resetProposalForm()
            else setShowProposalForm(true)
          }}
          className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <PlusCircle className="w-4 h-4 mr-2" /> {showProposalForm ? 'Cerrar propuesta' : 'Proponer Proyecto'}
        </button>
      </div>

      {showProposalForm && (
        <div className="bg-white p-6 md:p-7 rounded-3xl border border-emerald-100 shadow-sm">
          <h3 className="text-lg font-black text-emerald-900 mb-4">
            {editingProposalId ? 'Editar propuesta de proyecto' : 'Proponer un proyecto para la comunidad'}
          </h3>
          <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => void handleProposalAiPolish()}
              disabled={proposalAiBusy}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {proposalAiBusy ? 'Procesando…' : 'Mejorar lo que escribí (IA)'}
            </button>
            <button
              type="button"
              onClick={() => void handleProposalDescriptionFromTitle()}
              disabled={proposalAiBusy}
              className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              Descripción desde el título
            </button>
            <p className="text-xs text-stone-700 sm:min-w-0 sm:flex-1">
              «Mejorar lo que escribí» pulirá título y texto si ya los tienes. «Descripción desde el título» rellena o
              sustituye la descripción según el título; revísala siempre antes de enviar.
            </p>
          </div>
          <form onSubmit={handleCreateProposal} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-stone-800 mb-1">Título *</label>
              <input
                required
                value={proposalDraft.title}
                onChange={(e) => setProposalDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-400"
                placeholder="Ej: Mejorar iluminación en senderos"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-stone-800 mb-1">Descripción breve *</label>
              <textarea
                required
                value={proposalDraft.excerpt}
                onChange={(e) => setProposalDraft((d) => ({ ...d, excerpt: e.target.value }))}
                className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-400 h-24"
                placeholder="Cuéntanos qué se quiere hacer y por qué."
              />
            </div>
            <button
              type="submit"
              disabled={proposalSaving}
              className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {proposalSaving
                ? 'Guardando…'
                : editingProposalId
                  ? 'Guardar cambios de propuesta'
                  : 'Enviar propuesta'}
            </button>
          </form>
        </div>
      )}

      {projectProposals.length === 0 && !showProposalForm && (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center">
          <BarChart2 className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          <p className="text-stone-800 font-bold text-lg mb-1">No hay propuestas registradas</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Usa el botón «Proponer Proyecto» para abrir el muro y registrar la primera idea de mejora.
          </p>
        </div>
      )}

      {projectProposals.length > 0 && (
        <div className="space-y-4">
          {projectProposals.map((proposal) => {
            const canEditOwnProposal = proposal.author === currentUser.lotNumber || canManageInitiatives
            const ratingMeta = getProposalRatingMeta(proposal)
            return (
              <article key={proposal.id} className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h4 className="text-xl font-black text-stone-900">{proposal.title}</h4>
                    <p className="text-xs text-stone-600 mt-1">
                      Propuesta por {proposal.author === currentUser.lotNumber ? 'ti' : proposal.author} · {proposal.date}
                    </p>
                  </div>
                  <span className="inline-flex px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Pendiente de encuesta
                  </span>
                </div>
                <p className="text-stone-800 text-sm mt-4 whitespace-pre-wrap">{proposal.excerpt}</p>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-bold text-stone-700">
                      ¿Qué tan importante te parece esta propuesta?
                    </p>
                    <p className="text-xs font-black text-amber-800">
                      Promedio: {ratingMeta.average ? ratingMeta.average.toFixed(1) : '0.0'} / 5
                      {' · '}
                      {ratingMeta.count} voto{ratingMeta.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((stars) => {
                      const active = stars <= (ratingMeta.mine || 0)
                      return (
                        <button
                          key={`${proposal.id}-star-${stars}`}
                          type="button"
                          onClick={() => void handleRateProposal(proposal, stars)}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                            active
                              ? 'border-amber-300 bg-amber-100 text-amber-600'
                              : 'border-stone-200 bg-white text-stone-400 hover:border-amber-200 hover:text-amber-500'
                          }`}
                          aria-label={`Calificar con ${stars} estrella${stars === 1 ? '' : 's'}`}
                          title={`Calificar con ${stars} estrella${stars === 1 ? '' : 's'}`}
                        >
                          <Star className="h-4 w-4" fill="currentColor" />
                        </button>
                      )
                    })}
                    <span className="ml-1 text-xs font-semibold text-stone-600">
                      Tu voto: {ratingMeta.mine || 0} / 5 (puedes cambiarlo)
                    </span>
                  </div>
                </div>
                {canEditOwnProposal && (
                  <div className="pt-4 mt-4 border-t border-stone-100 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditProposal(proposal)}
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                    >
                      <Edit3 className="w-4 h-4 mr-1.5" /> Editar propuesta
                    </button>
                    {canManageInitiatives && (
                      <button
                        type="button"
                        onClick={() => handleConvertProposalToSurvey(proposal)}
                        className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"
                      >
                        <Sparkles className="w-4 h-4 mr-1.5 text-amber-300" /> Convertir en encuesta
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteProposal(proposal)}
                      className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar propuesta
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

const InitiativesView = ({
  currentUser,
  db,
  saveInitiative,
  convertInitiativeToFund,
  deleteInitiative,
  logAction,
  showAlert,
  showConfirm,
}) => {
  const LIGHTING_APPROVAL_LOTS = useMemo(
    () => [
      '14B',
      '28B',
      '3B',
      '4B',
      '11A',
      '1B',
      '2B',
      '36B',
      '2A',
      '27B',
      '26B',
      '23B',
      '18A',
      '9B',
      '10A',
      '8A',
      '30B',
      '38B',
      '18B',
      '32B',
      '6A',
    ].map((lot) => `Lote${lot}`),
    [],
  )
  const canManageInitiatives = isAdminLike(currentUser)
  const isSyncingLightingVotesRef = useRef(false)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [editingSurveys, setEditingSurveys] = useState({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingInitiativeId, setEditingInitiativeId] = useState(null)
  const createFormRef = useRef(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [copyAiBusy, setCopyAiBusy] = useState(false)
  const [isSubmittingInitiative, setIsSubmittingInitiative] = useState(false)
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [newSurvey, setNewSurvey] = useState({
    title: '',
    excerpt: '',
    question: '',
    deadline: '',
    requiresBudget: false,
    budgetAmount: '',
    expectedQuotaPerLotCOP: '',
    options: [
      { id: 1, text: '' },
      { id: 2, text: '' },
    ],
  })
  const surveyInitiatives = useMemo(
    () => (db.initiatives || []).filter((i) => !i?.isProposal),
    [db.initiatives],
  )

  useEffect(() => {
    if (!canManageInitiatives) return
    const targetDate = new Date(2026, 3, 12).toLocaleDateString('es-CO')
    const illuminationSurvey = surveyInitiatives.find((row) =>
      String(row?.title || '')
        .toLowerCase()
        .includes('ilumin'),
    )
    if (!illuminationSurvey) return
    if (String(illuminationSurvey.date || '').trim() === targetDate) return

    void saveInitiative({
      ...illuminationSurvey,
      date: targetDate,
    }).catch((err) => {
      console.error('No se pudo ajustar la fecha de publicación de la encuesta de iluminación:', err)
    })
  }, [canManageInitiatives, surveyInitiatives, saveInitiative])

  useEffect(() => {
    if (!canManageInitiatives || isSyncingLightingVotesRef.current) return
    const illuminationSurvey = surveyInitiatives.find((row) =>
      String(row?.title || '')
        .toLowerCase()
        .includes('ilumin'),
    )
    if (!illuminationSurvey) return

    const options = illuminationSurvey.survey?.options || []
    if (options.length === 0) return
    const normalizeOptionText = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    const yesOption =
      options.find((opt) => {
        const txt = normalizeOptionText(opt?.text)
        return /\bsi\b/.test(txt) && !/\bno\b/.test(txt)
      }) ||
      options.find((opt) => normalizeOptionText(opt?.text).startsWith('si ')) ||
      options[0]
    if (!yesOption?.id) return

    const prevVotes = illuminationSurvey.survey?.votes || []
    const byLot = new Map()
    prevVotes.forEach((vote) => {
      const lot = String(vote?.lot || '').trim()
      if (!lot) return
      byLot.set(lot.toUpperCase(), vote)
    })

    let changed = false
    LIGHTING_APPROVAL_LOTS.forEach((lot) => {
      const lotNorm = String(lot).toUpperCase()
      const existing = byLot.get(lotNorm)
      if (!existing || String(existing.optionId) !== String(yesOption.id)) {
        byLot.set(lotNorm, {
          lot,
          optionId: yesOption.id,
          timestamp:
            existing?.timestamp || new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        })
        changed = true
      }
    })
    if (!changed) return

    const nextVotes = Array.from(byLot.values())
    isSyncingLightingVotesRef.current = true
    void saveInitiative({
      ...illuminationSurvey,
      survey: {
        ...illuminationSurvey.survey,
        votes: nextVotes,
      },
    })
      .catch((err) => {
        console.error('No se pudo sincronizar votos de iluminación:', err)
      })
      .finally(() => {
        isSyncingLightingVotesRef.current = false
      })
  }, [canManageInitiatives, surveyInitiatives, saveInitiative, LIGHTING_APPROVAL_LOTS])

  const handleVote = (initiativeId) => {
    const init = db.initiatives?.find((i) => i.id === initiativeId)
    if (!init) return
    if (isVotingClosed(init))
      return showAlert('La fecha límite para votar en esta iniciativa ya ha pasado.')

    const optionId = selectedOptions[initiativeId]
    if (!optionId) return showAlert('Por favor, selecciona una opción antes de votar.')

    const timestamp = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
    const updatedInitiatives = db.initiatives.map((i) => {
      if (i.id === initiativeId) {
        const votes = i.survey?.votes || []
        const existingIdx = votes.findIndex((v) => v.lot === currentUser.lotNumber)
        let newVotes = [...votes]
        if (existingIdx >= 0) {
          newVotes[existingIdx] = { lot: currentUser.lotNumber, optionId, timestamp }
          logAction('VOTO_MODIFICADO', `Modificó voto en #${initiativeId}`)
        } else {
          newVotes.push({ lot: currentUser.lotNumber, optionId, timestamp })
          logAction('VOTO_EMITIDO', `Votó en #${initiativeId}`)
        }
        return { ...i, survey: { ...i.survey, votes: newVotes } }
      }
      return i
    })

    const updated = updatedInitiatives.find((i) => i.id === initiativeId)
    if (updated)
      saveInitiative(updated)
        .then(() => {
          void trackPortalEvent('vote_submit', {
            initiative_id: String(initiativeId).slice(0, 40),
          })
        })
        .catch((err) => {
          console.error(err)
          showAlert('No se pudo guardar el voto.')
        })
    setEditingSurveys((p) => ({ ...p, [initiativeId]: false }))
  }

  const handleConvertToProject = (initiative) => {
    showConfirm(
      `¿Estás seguro que deseas convertir "${initiative.title}" en un proyecto en ejecución? Esto creará el proyecto en Proyectos y Fondos y marcará esta votación como convertida.`,
      async () => {
        const votes = initiative.survey?.votes || []
        let winnerText = 'Sin votos'
        if (votes.length > 0) {
          const counts = {}
          votes.forEach((v) => {
            counts[v.optionId] = (counts[v.optionId] || 0) + 1
          })
          const winnerId = Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b))
          winnerText =
            initiative.survey?.options?.find((o) => o.id === winnerId)?.text || winnerText
        }

        const newProject = {
          id: `fp-${crypto.randomUUID()}`,
          name: initiative.title,
          description: `${initiative.excerpt}\n\n[Origen: Votación finalizada. Opción más votada: "${winnerText}"]`,
          date: (initiative?.date || '').trim() || new Date().toLocaleDateString('es-CO'),
          requiresBudget: initiative.survey?.requiresBudget || false,
          goal: initiative.survey?.requiresBudget ? Number(initiative.survey?.budgetAmount) || 0 : 0,
          raised: 0,
          status: FUND_STATUS.RECOLECCION,
          image:
            initiative.image && !isNewsFallbackImageUrl(initiative.image) ? initiative.image : null,
          expectedQuotaPerLotCOP: Number(initiative.survey?.expectedQuotaPerLotCOP) || 0,
          createdAt: Date.now(),
        }

        try {
          await convertInitiativeToFund(initiative, newProject)
          logAction('CONVERTIR_PROYECTO', `Convirtió iniciativa #${initiative.id} en Proyecto`)
          showAlert(
            "La votación se convirtió en proyecto. Revísalo en la pestaña «Proyectos y Fondos».",
          )
        } catch (err) {
          console.error(err)
          showAlert('No se pudo convertir la iniciativa en proyecto. Revisa permisos de Firestore y la consola.')
        }
      },
    )
  }

  const startEditInitiative = (initiative) => {
    setEditingInitiativeId(initiative.id)
    setShowCreateForm(true)
    setCoverImageFile(null)
    setNewSurvey({
      title: initiative.title || '',
      excerpt: initiative.excerpt || '',
      question: initiative.survey?.question || '',
      deadline: initiative.deadline || '',
      requiresBudget: initiative.survey?.requiresBudget || false,
      budgetAmount: initiative.survey?.budgetAmount ? String(initiative.survey.budgetAmount) : '',
      expectedQuotaPerLotCOP: initiative.survey?.expectedQuotaPerLotCOP
        ? String(initiative.survey.expectedQuotaPerLotCOP)
        : '',
      options: (initiative.survey?.options || []).map((o, idx) => ({
        id: o.id ?? Date.now() + idx,
        text: o.text || '',
      })),
    })
  }

  const cancelCreateOrEdit = () => {
    setShowCreateForm(false)
    setEditingInitiativeId(null)
    setCoverImageFile(null)
    setNewSurvey({
      title: '',
      excerpt: '',
      question: '',
      deadline: '',
      requiresBudget: false,
      budgetAmount: '',
      expectedQuotaPerLotCOP: '',
      options: [
        { id: 1, text: '' },
        { id: 2, text: '' },
      ],
    })
  }

  const handleDeleteInitiative = (initiative) => {
    showConfirm(`¿Eliminar la votación "${initiative.title}"? Esta acción no se puede deshacer.`, async () => {
      try {
        await deleteInitiative(initiative.id)
        logAction('ELIMINAR_ENCUESTA', `Eliminó iniciativa #${initiative.id}`)
        showAlert('Votación eliminada correctamente.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar la votación.')
      }
    })
  }

  const handleFinalizeInitiative = (initiative) => {
    showConfirm(`¿Finalizar ahora la votación "${initiative.title}"? Los residentes ya no podrán votar ni modificar voto.`, async () => {
      try {
        const closedAt = toLocalDatetimeInputValue(new Date(Date.now() - 120_000))
        await saveInitiative({
          ...initiative,
          deadline: closedAt,
          votingClosed: true,
        })
        logAction('FINALIZAR_ENCUESTA', `Finalizó manualmente iniciativa #${initiative.id}`)
        showAlert('La votación quedó finalizada. Usa «Convertir en proyecto» cuando quieras llevarla a Proyectos y Fondos.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo finalizar la votación.')
      }
    })
  }

  const triggerAIAssistant = async () => {
    if (!newSurvey.question.trim())
      return showAlert('Por favor, escribe la pregunta de la encuesta primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setIsAnalyzing(true)
    const aiResponse = await fetchGeminiSurveyOptions(newSurvey.question)
    if (aiResponse?.suggestedOptions?.length > 0) {
      setNewSurvey((p) => ({
        ...p,
        options: aiResponse.suggestedOptions.map((o, idx) => ({ id: Date.now() + idx, text: o })),
      }))
    } else {
      const d = getLastGeminiDetail()
      showAlert(
        d
          ? `No se pudo obtener sugerencias: ${d}`
          : 'No se pudo conectar con la IA de sugerencias. Ingresa las opciones manualmente.',
      )
    }
    setIsAnalyzing(false)
  }

  const triggerSurveyCopyAssistant = async () => {
    if (!newSurvey.title.trim() && !newSurvey.excerpt.trim() && !newSurvey.question.trim()) {
      showAlert('Escribe título, contexto o pregunta para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setCopyAiBusy(true)
    try {
      const [title, excerpt, question] = await Promise.all([
        requestPolishedText('initiative_title', newSurvey.title),
        requestPolishedText('initiative_excerpt', newSurvey.excerpt),
        requestPolishedText('initiative_question', newSurvey.question),
      ])
      setNewSurvey((prev) => ({
        ...prev,
        title: title || prev.title,
        excerpt: excerpt || prev.excerpt,
        question: question || prev.question,
      }))
      showAlert('Sugerencias de redacción aplicadas en la votación.')
    } finally {
      setCopyAiBusy(false)
    }
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    const validOptions = newSurvey.options.filter((o) => o.text.trim() !== '')
    if (validOptions.length < 2)
      return showAlert('Se requiere un mínimo de 2 opciones de respuesta válidas.')
    if (!newSurvey.deadline) return showAlert('Debes seleccionar una fecha y hora de cierre.')
    if (
      newSurvey.requiresBudget &&
      (!newSurvey.budgetAmount || Number.isNaN(Number(newSurvey.budgetAmount)))
    )
      return showAlert('Por favor, ingresa un monto de presupuesto válido en COP.')
    if (
      newSurvey.requiresBudget &&
      newSurvey.expectedQuotaPerLotCOP &&
      Number.isNaN(Number(newSurvey.expectedQuotaPerLotCOP))
    )
      return showAlert('La cuota o aporte esperado por lote debe ser un número válido.')
    if (coverImageFile && coverImageFile.size > MAX_ENTITY_IMAGE_BYTES)
      return showAlert(
        `La imagen de portada no puede superar ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`,
      )

    const editingExisting = editingInitiativeId != null
    const id = editingExisting ? editingInitiativeId : Date.now()
    const prev = editingExisting ? (db.initiatives || []).find((i) => i.id === editingInitiativeId) : null
    setIsSubmittingInitiative(true)
    try {
      let imageUrl = null
      if (prev?.image && !isNewsFallbackImageUrl(prev.image)) imageUrl = prev.image
      if (coverImageFile) {
        imageUrl = await uploadEntityCoverImage(coverImageFile, 'initiatives', id)
      }

      const newOptions = validOptions.map((o, i) => ({ id: `opt${i}`, text: o.text }))
      const finalInit = prev
        ? {
            ...prev,
            id,
            title: newSurvey.title,
            excerpt: newSurvey.excerpt,
            deadline: newSurvey.deadline,
            isProposal: false,
            image: imageUrl,
            survey: {
              ...prev.survey,
              question: newSurvey.question,
              requiresBudget: newSurvey.requiresBudget,
              budgetAmount: newSurvey.requiresBudget ? Number(newSurvey.budgetAmount) : null,
              expectedQuotaPerLotCOP:
                newSurvey.requiresBudget && newSurvey.expectedQuotaPerLotCOP
                  ? Number(newSurvey.expectedQuotaPerLotCOP)
                  : null,
              options: newOptions,
              votes: prev.survey?.votes || [],
            },
          }
        : {
            id,
            title: newSurvey.title,
            excerpt: newSurvey.excerpt,
            author: currentUser.lotNumber,
            date: new Date().toLocaleDateString('es-CO'),
            deadline: newSurvey.deadline,
            convertedToProject: false,
            votingClosed: false,
            isProposal: false,
            image: imageUrl,
            survey: {
              question: newSurvey.question,
              requiresBudget: newSurvey.requiresBudget,
              budgetAmount: newSurvey.requiresBudget ? Number(newSurvey.budgetAmount) : null,
              expectedQuotaPerLotCOP:
                newSurvey.requiresBudget && newSurvey.expectedQuotaPerLotCOP
                  ? Number(newSurvey.expectedQuotaPerLotCOP)
                  : null,
              options: newOptions,
              votes: [],
            },
          }

      await saveInitiative(finalInit)
      void trackPortalEvent('survey_publish', { mode: editingExisting ? 'edit' : 'new' })
      logAction(editingExisting ? 'EDITAR_ENCUESTA' : 'CREAR_ENCUESTA', `${editingExisting ? 'Editó' : 'Creó'}: ${finalInit.title}`)
      cancelCreateOrEdit()
      showAlert(editingExisting ? 'Votación actualizada correctamente.' : '¡La iniciativa y su encuesta han sido publicadas a la comunidad!')
    } catch (err) {
      console.error(err)
      if (err instanceof Error && err.message === 'ENTITY_IMAGE_TOO_LARGE') {
        showAlert(`La imagen supera ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`)
      } else showAlert('No se pudo publicar la iniciativa.')
    } finally {
      setIsSubmittingInitiative(false)
    }
  }

  useEffect(() => {
    if (!showCreateForm) return
    const node = createFormRef.current
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showCreateForm, editingInitiativeId])

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-3xl font-black text-stone-800">Iniciativas y Votaciones</h2>
          <p className="text-stone-600 mt-1">Propón ideas, participa y decide en comunidad.</p>
        </div>
        {canManageInitiatives && (
          <button
            type="button"
            onClick={() => {
              if (showCreateForm) cancelCreateOrEdit()
              else setShowCreateForm(true)
            }}
            className="bg-stone-900 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-stone-800 transition-colors"
          >
            {showCreateForm ? (
              'Cancelar'
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2 text-amber-400" /> Crear/Editar Votación
              </>
            )}
          </button>
        )}
      </div>

      {showCreateForm && (
        <div
          ref={createFormRef}
          className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-sm animate-in slide-in-from-top-4"
        >
          <h3 className="text-xl font-black flex items-center mb-6">
            <Sparkles className="w-5 h-5 text-amber-500 mr-2" /> {editingInitiativeId != null ? 'Editar votación' : 'Creador de Encuestas Asistido'}
          </h3>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <button
              type="button"
              onClick={() => void triggerSurveyCopyAssistant()}
              disabled={copyAiBusy}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {copyAiBusy ? 'Procesando…' : 'Sugerir redacción (IA)'}
            </button>
            <button
              type="button"
              onClick={() => void triggerAIAssistant()}
              disabled={isAnalyzing}
              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {isAnalyzing ? 'Analizando…' : 'Sugerir opciones (IA)'}
            </button>
            <p className="text-xs text-stone-700">La IA se concentra en redacción y opciones, no en fecha ni presupuesto.</p>
          </div>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Título de la iniciativa *</label>
                <input
                  required
                  value={newSurvey.title}
                  onChange={(e) => setNewSurvey({ ...newSurvey, title: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500"
                  placeholder="Ej: Construcción de parque infantil"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Contexto / justificación *</label>
                <textarea
                  required
                  value={newSurvey.excerpt}
                  onChange={(e) => setNewSurvey({ ...newSurvey, excerpt: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500 h-24"
                  placeholder="Explica los beneficios para la comunidad..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Fecha y Hora de Cierre *</label>
                <input
                  required
                  type="datetime-local"
                  value={newSurvey.deadline}
                  onChange={(e) => setNewSurvey({ ...newSurvey, deadline: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2 bg-stone-50 p-4 rounded-xl border border-stone-100 flex flex-col gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSurvey.requiresBudget}
                    onChange={(e) => setNewSurvey({ ...newSurvey, requiresBudget: e.target.checked })}
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 mr-3"
                  />
                  <span className="font-bold text-stone-800">
                    Esta iniciativa requiere aprobación de presupuesto
                  </span>
                </label>
                {newSurvey.requiresBudget && (
                  <div className="pl-8">
                    <label className="block text-sm font-bold text-stone-700 mb-1.5">Monto estimado (COP) *</label>
                    <input
                      type="number"
                      required
                      value={newSurvey.budgetAmount}
                      onChange={(e) => setNewSurvey({ ...newSurvey, budgetAmount: e.target.value })}
                      className="w-full md:w-1/2 border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500"
                      placeholder="Ej: 5000000"
                    />
                    <label className="block text-sm font-bold text-stone-700 mt-3 mb-1.5">
                      Cuota o aporte esperado por lote (COP) — opcional
                    </label>
                    <input
                      type="number"
                      value={newSurvey.expectedQuotaPerLotCOP}
                      onChange={(e) =>
                        setNewSurvey({ ...newSurvey, expectedQuotaPerLotCOP: e.target.value })
                      }
                      className="w-full md:w-1/2 border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500"
                      placeholder="Ej: 50000"
                    />
                    <p className="text-xs text-stone-600 mt-1">
                      Referencia opcional para estimar el aporte mensual promedio por lote.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-stone-200 rounded-2xl p-4 bg-stone-50/90 mb-2">
              <label className="block text-sm font-bold text-stone-800 mb-2">Imagen de portada (opcional, 1 archivo)</label>
              <input
                type="file"
                accept="image/*"
                className="w-full text-sm font-medium text-stone-800 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  setCoverImageFile(f || null)
                }}
              />
              {coverImageFile && (
                <p className="text-xs text-stone-700 mt-2">
                  Seleccionada: {coverImageFile.name} ({Math.round(coverImageFile.size / 1024)} KB). Máx.{' '}
                  {Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB. Si no subes imagen, la tarjeta no mostrará foto.
                </p>
              )}
            </div>

            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
              <label className="mb-2 block text-base font-bold text-blue-900">Pregunta de la encuesta *</label>
              <input
                required
                value={newSurvey.question}
                onChange={(e) => setNewSurvey({ ...newSurvey, question: e.target.value })}
                className="w-full border border-blue-200 p-3 rounded-xl mb-4 font-bold outline-none focus:border-blue-400"
                placeholder="Ej: ¿Estás de acuerdo con el presupuesto?"
              />

              <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <span className="block text-sm font-bold text-blue-800">Opciones de Respuesta</span>
                <span className="text-xs text-stone-700">Puedes sugerir opciones desde el botón superior.</span>
              </div>

              <div className="space-y-3">
                {newSurvey.options.map((opt, idx) => (
                  <div key={opt.id} className="flex gap-2 items-center">
                    <input
                      required
                      value={opt.text}
                      onChange={(e) =>
                        setNewSurvey((p) => ({
                          ...p,
                          options: p.options.map((o) => (o.id === opt.id ? { ...o, text: e.target.value } : o)),
                        }))
                      }
                      className="flex-1 border border-blue-200 p-3 rounded-xl outline-none focus:border-blue-400"
                      placeholder={`Opción ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewSurvey((p) => ({ ...p, options: p.options.filter((o) => o.id !== opt.id) }))
                      }
                      className="text-red-500 p-3 border border-red-200 rounded-xl bg-white hover:bg-red-50"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setNewSurvey((p) => ({ ...p, options: [...p.options, { id: Date.now(), text: '' }] }))}
                className="mt-4 text-blue-600 font-bold text-sm flex items-center"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" /> Añadir opción manual
              </button>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmittingInitiative}
                className="w-full bg-stone-900 text-white p-4 rounded-xl font-bold hover:bg-stone-800 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmittingInitiative ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Publicando…
                  </>
                ) : editingInitiativeId != null ? (
                  'Guardar cambios de votación'
                ) : (
                  'Publicar Iniciativa'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {surveyInitiatives.length === 0 && !showCreateForm && (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center">
          <BarChart2 className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          <p className="text-stone-800 font-bold text-lg mb-1">No hay votaciones disponibles</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Cuando publiquen una votación, aparecerá aquí para que la comunidad participe.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {surveyInitiatives.map((post) => {
          const votingClosed = isVotingClosed(post)
          const { formatted } = safeDateParse(post.deadline)
          const timeRemainingLabel = getTimeRemainingLabel(post.deadline)
          const votes = post.survey?.votes || []
          const userVote = votes.find((v) => v.lot === currentUser.lotNumber)
          const isEditing = editingSurveys[post.id]
          const totalMembers = 89
          const options = post.survey?.options || []
          const optionVoteCounts = options.map((opt) => ({
            ...opt,
            count: votes.filter((v) => String(coerceSurveyOptionId(options, v.optionId)) === String(opt.id)).length,
          }))
          const maxVotesInOption = Math.max(...optionVoteCounts.map((opt) => opt.count), 0)
          const totalVotes = votes.length

          const coverSrc =
            post.image && !isNewsFallbackImageUrl(post.image) ? post.image : null
          return (
            <article
              key={post.id}
              className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/40 border border-emerald-100/30 rounded-3xl shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md"
            >
              {coverSrc ? (
                <div
                  className={`relative flex h-52 sm:h-64 shrink-0 items-center justify-center bg-stone-100`}
                >
                  <img
                    src={coverSrc}
                    className={`max-h-full max-w-full rounded-lg h-full w-full object-cover ${votingClosed ? 'grayscale opacity-80' : ''}`}
                    alt=""
                  />
                  <span
                    className={`absolute top-4 left-4 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${votingClosed ? 'bg-stone-800' : 'bg-emerald-600'}`}
                  >
                    {votingClosed ? 'Votación Finalizada' : 'Activa'}
                  </span>
                </div>
              ) : (
                <div className="relative flex h-14 sm:h-16 shrink-0 items-center px-6 bg-stone-50 border-b border-stone-100">
                  <span
                    className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${votingClosed ? 'bg-stone-800' : 'bg-emerald-600'}`}
                  >
                    {votingClosed ? 'Votación Finalizada' : 'Activa'}
                  </span>
                </div>
              )}
              <div className="p-6 md:p-8 flex-1 flex flex-col gap-4">
                <h3 className="text-2xl font-bold text-stone-800 mb-2">{post.title}</h3>
                <div className="flex items-center text-xs font-bold uppercase tracking-wider text-stone-500 mb-4 gap-4">
                  <span className="flex items-center bg-stone-50 px-3 py-1.5 rounded-lg">
                    <User className="w-3.5 h-3.5 mr-1" />
                    {post.author === currentUser.lotNumber ? 'Tú' : post.author}
                  </span>
                  <span className="flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    {post.date}
                  </span>
                </div>
                <p className="text-stone-700 mb-4 text-sm flex-1">{post.excerpt}</p>

                {post.survey?.requiresBudget && (
                  <div className="mb-6 bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center w-fit">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest mr-2">
                      Presupuesto Estimado:
                    </span>
                    <span className="text-sm font-black text-emerald-600">
                      {formatCurrency(post.survey.budgetAmount)}
                    </span>
                  </div>
                )}

                {votingClosed || (userVote && !isEditing) ? (
                  <div className="bg-gradient-to-b from-stone-100/90 to-emerald-50/30 rounded-2xl border border-emerald-100/50 mt-auto overflow-hidden">
                    <div className="bg-white p-5 border-b border-stone-200">
                      <div className="flex items-center mb-1">
                        <ArrowLeft className="w-5 h-5 text-stone-600 mr-3 shrink-0" aria-hidden />
                        <span className="font-bold text-stone-800 text-lg">Votos de la encuesta</span>
                      </div>
                      <h4 className="font-medium text-stone-900 text-[15px] leading-snug mt-2 flex items-start">
                        <BarChart2 className="w-4 h-4 text-stone-500 mr-2 shrink-0 mt-0.5" />
                        {post.survey?.question}
                      </h4>
                      <p className="text-xs text-stone-600 mt-2 font-medium">
                        {votes.length} de {totalMembers} miembros votaron.
                      </p>
                    </div>

                    <div className="divide-y divide-stone-100">
                      {optionVoteCounts.map((opt) => {
                        const vts = votes.filter(
                          (v) => String(coerceSurveyOptionId(options, v.optionId)) === String(opt.id),
                        )
                        const isWinner = vts.length > 0 && vts.length === maxVotesInOption
                        const isSelectedByMe = userVote?.optionId === opt.id

                        return (
                          <div key={opt.id} className="bg-white p-4">
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-medium text-stone-900 text-[15px] flex items-start">
                                {isSelectedByMe && (
                                  <div className="bg-emerald-500 rounded-sm w-4 h-4 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                                {opt.text}
                              </span>
                              <div className="flex items-center text-sm font-medium text-stone-600 shrink-0 ml-4">
                                {vts.length} {isWinner && <span className="text-stone-500 ml-1.5 text-sm">★</span>}
                              </div>
                            </div>

                            <details className="mt-2 rounded-lg border border-stone-200 bg-white">
                              <summary className="cursor-pointer px-3 py-2 text-[11px] font-black uppercase tracking-wide text-stone-700">
                                Ver votantes de esta opción ({vts.length})
                              </summary>
                              <div className="space-y-3 pl-6 pr-3 py-3 border-t border-stone-200">
                                {vts.map((v, i) => (
                                  <div key={i} className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-stone-200 overflow-hidden mr-3 shrink-0">
                                      <User className="w-5 h-5 text-stone-500 mx-auto mt-1.5" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[14px] font-bold text-stone-900 leading-tight">
                                        {v.lot === currentUser.lotNumber ? 'Tú' : v.lot}
                                      </span>
                                      <span className="text-xs text-stone-600 mt-0.5">{v.timestamp}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )
                      })}
                    </div>
                    <div className="p-3 bg-stone-50 border-t border-stone-200 flex flex-wrap gap-2 justify-end">
                      {userVote && !votingClosed && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOptions((p) => ({ ...p, [post.id]: userVote.optionId }))
                            setEditingSurveys((p) => ({ ...p, [post.id]: true }))
                          }}
                          className="text-emerald-600 font-bold text-sm px-4 py-2 hover:bg-emerald-100 rounded-lg transition-colors flex items-center"
                        >
                          <Edit3 className="w-4 h-4 mr-2" /> Modificar mi voto
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mt-auto rounded-2xl p-6 border transition-colors ${isEditing ? 'bg-amber-50/50 border-amber-200' : 'bg-blue-50/30 border-blue-100'}`}
                  >
                    <h4 className="font-bold text-stone-900 text-lg mb-2 flex items-start">
                      <BarChart2
                        className={`w-5 h-5 mr-2 shrink-0 mt-0.5 ${isEditing ? 'text-amber-500' : 'text-blue-500'}`}
                      />
                      {post.survey?.question}
                    </h4>
                    <p className="text-xs font-bold text-stone-600 mb-5 ml-7 flex items-center flex-wrap gap-x-2 gap-y-1">
                      <Clock className="w-4 h-4 mr-1.5 text-stone-500" /> Cierra: {formatted}
                      {timeRemainingLabel && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {timeRemainingLabel}
                        </span>
                      )}
                    </p>
                    <div className="space-y-2 mb-6">
                      {options.map((opt) => {
                        const isSelected = selectedOptions[post.id] === opt.id
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center p-4 bg-white border rounded-xl cursor-pointer transition-all shadow-sm ${isSelected ? (isEditing ? 'border-amber-400' : 'border-blue-400') : 'border-stone-200 hover:border-stone-300'}`}
                          >
                            <input
                              type="radio"
                              name={`vote-${post.id}`}
                              checked={isSelected}
                              onChange={() => setSelectedOptions((p) => ({ ...p, [post.id]: opt.id }))}
                              className={`w-5 h-5 ${isEditing ? 'text-amber-600' : 'text-blue-600'}`}
                            />
                            <span className={`ml-3 font-bold ${isSelected ? 'text-stone-900' : 'text-stone-700'}`}>
                              {opt.text}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="mb-6 rounded-xl border border-emerald-100 bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-800">
                          {votingClosed ? 'Resultados finales' : 'Resultados parciales'}
                        </p>
                        <p className="text-xs font-bold text-stone-600">
                          {totalVotes} voto{totalVotes === 1 ? '' : 's'} registrados
                        </p>
                      </div>
                      <div className="space-y-2">
                        {optionVoteCounts.map((opt) => {
                          const pct = totalVotes > 0 ? Math.round((opt.count / totalVotes) * 100) : 0
                          const isWinner = opt.count > 0 && opt.count === maxVotesInOption
                          return (
                            <div key={`partial-${post.id}-${opt.id}`} className="space-y-1 rounded-lg border border-stone-100 bg-stone-50/40 p-2.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-stone-800">
                                  {opt.text}
                                  {isWinner ? <span className="ml-1 text-amber-600">★</span> : null}
                                </span>
                                <span className="font-black text-stone-700">
                                  {opt.count} ({pct}%)
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-stone-200 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <details className="mt-3 rounded-lg border border-stone-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-[11px] font-black uppercase tracking-wide text-stone-700">
                          Ver detalle de quién votó por opción
                        </summary>
                        <div className="border-t border-stone-200 p-3 space-y-2">
                          {optionVoteCounts.map((opt) => {
                            const vts = votes.filter(
                              (v) => String(coerceSurveyOptionId(options, v.optionId)) === String(opt.id),
                            )
                            return (
                              <div key={`voter-detail-${post.id}-${opt.id}`} className="rounded-md border border-stone-100 bg-stone-50/50 p-2">
                                <p className="text-[11px] font-black text-stone-700 mb-1">{opt.text}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {vts.length > 0 ? (
                                    vts.map((v, idx) => (
                                      <span
                                        key={`voter-chip-${post.id}-${opt.id}-${idx}`}
                                        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                                          v.lot === currentUser.lotNumber
                                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                            : 'border-stone-200 bg-white text-stone-700'
                                        }`}
                                        title={v.timestamp || ''}
                                      >
                                        {v.lot === currentUser.lotNumber ? 'Tú' : v.lot}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[11px] text-stone-500">Sin votos aún en esta opción.</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleVote(post.id)}
                        className={`flex-1 text-white font-bold py-3 rounded-xl shadow-sm transition-transform hover:scale-[1.02] ${isEditing ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {isEditing ? 'Guardar Nuevo Voto' : 'Confirmar Voto'}
                      </button>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => setEditingSurveys((p) => ({ ...p, [post.id]: false }))}
                          className="flex-1 bg-white border border-stone-200 rounded-xl font-bold text-stone-700 hover:bg-stone-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {canManageInitiatives && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {!votingClosed && (
                      <button
                        type="button"
                        onClick={() => handleFinalizeInitiative(post)}
                        className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100"
                      >
                        <Check className="w-4 h-4 mr-1.5" /> Finalizar votación
                      </button>
                    )}
                    {votingClosed && canManageInitiatives && !post.convertedToProject && (
                      <button
                        type="button"
                        onClick={() => handleConvertToProject(post)}
                        className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 shadow-sm"
                      >
                        <Rocket className="w-4 h-4 mr-1.5" /> Convertir en proyecto
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditInitiative(post)}
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900 hover:bg-emerald-100"
                    >
                      <Edit3 className="w-4 h-4 mr-1.5" /> Editar votación
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInitiative(post)}
                      className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar votación
                    </button>
                  </div>
                )}

                {currentUser.role === 'superadmin' && post.survey && (
                  <SuperadminVotesPanel
                    post={post}
                    db={db}
                    saveInitiative={saveInitiative}
                    logAction={logAction}
                    showAlert={showAlert}
                  />
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

const AdminFundAmountForm = ({ fund, onApply, showAlert }) => {
  const hasBudget = fund.requiresBudget !== false
  const [raised, setRaised] = useState(() => copDigitsFromInput(String(fundAmountFromDb(fund.raised))))
  const [goal, setGoal] = useState(() => copDigitsFromInput(String(fundAmountFromDb(fund.goal))))

  const handleSubmit = (e) => {
    e.preventDefault()
    const raisedNum = parseCopIntegerFromDigits(raised)
    const goalNum = parseCopIntegerFromDigits(goal)
    if (raisedNum < 0) return showAlert('El monto recaudado no es válido.')
    if (goalNum < 0) return showAlert('El valor total no es válido.')
    if (hasBudget && goalNum <= 0)
      return showAlert('La meta de recaudo debe ser mayor a cero (solo números, sin puntos ni comas).')
    void Promise.resolve(onApply(fund.id, { raised: raisedNum, goal: goalNum }))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 p-4 md:p-5 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 to-white space-y-4"
    >
      <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">
        {hasBudget ? 'Actualizar recaudo y meta' : 'Actualizar recaudo y valor total'}
      </p>
      <p className="text-xs text-stone-800 leading-relaxed border-l-4 border-blue-400 pl-3 py-0.5 bg-white/80 rounded-r-lg">
        {COP_AMOUNT_INPUT_HINT}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-w-0">
          <label className="block text-xs font-bold text-stone-800 mb-1.5">Recaudado (COP)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={raised}
            onChange={(e) => setRaised(copDigitsFromInput(e.target.value))}
            placeholder="0"
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-base font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white font-mono tracking-tight"
          />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-bold text-stone-800 mb-1.5">
            {hasBudget ? 'Meta de recaudo (COP)' : 'Valor total del proyecto (COP)'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={goal}
            onChange={(e) => setGoal(copDigitsFromInput(e.target.value))}
            placeholder={hasBudget ? 'Ej: 5000000' : '0'}
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-base font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white font-mono tracking-tight"
          />
        </div>
      </div>
      {!hasBudget && (
        <p className="text-xs text-stone-700">
          En proyectos sin meta de recaudo puedes registrar igualmente el valor total de referencia y lo recaudado (por
          ejemplo aportes voluntarios).
        </p>
      )}
      <button
        type="submit"
        className="w-full sm:w-auto bg-blue-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
      >
        Guardar montos
      </button>
    </form>
  )
}

const FundsView = ({
  currentUser,
  db,
  updateFundStatus,
  updateFundRaisedGoal,
  addFund,
  deleteFund,
  logAction,
  showAlert,
  showConfirm,
  openNewsComposerFromFund,
}) => {
  const canManageFunds = isAdminLike(currentUser)
  const isBackfillingFundDatesRef = useRef(false)
  const fundEditFormRef = useRef(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingFundId, setEditingFundId] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [copyAiBusy, setCopyAiBusy] = useState(false)
  const [isSubmittingFund, setIsSubmittingFund] = useState(false)
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    requiresBudget: true,
    goal: '',
    expectedQuotaPerLot: '',
  })

  useEffect(() => {
    if (!canManageFunds || isBackfillingFundDatesRef.current) return
    const fundsWithoutDate = (db.funds || []).filter((fund) => !String(fund?.date || '').trim())
    if (fundsWithoutDate.length === 0) return

    isBackfillingFundDatesRef.current = true
    Promise.all(
      fundsWithoutDate.map((fund) =>
        addFund({
          ...fund,
          date: Number.isFinite(Number(fund?.createdAt))
            ? new Date(Number(fund.createdAt)).toLocaleDateString('es-CO')
            : new Date().toLocaleDateString('es-CO'),
        }),
      ),
    )
      .catch((err) => {
        console.error('No se pudo completar el backfill de fechas en proyectos:', err)
      })
      .finally(() => {
        isBackfillingFundDatesRef.current = false
      })
  }, [canManageFunds, db.funds, addFund])

  useEffect(() => {
    if (!showCreateForm || !canManageFunds || editingFundId == null) return
    const t = window.setTimeout(() => {
      fundEditFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [showCreateForm, editingFundId, canManageFunds])

  const handleStatusChange = (fund, val) => {
    const prevStatus = fund.status
    if (prevStatus === val) return
    const isMeta = val === FUND_STATUS.META_ALCANZADA
    updateFundStatus(fund.id, val)
      .then(() => {
        logAction('MODIFICAR_PROYECTO', `Cambió estado a: ${val}`)
        if (canManageFunds) {
          showConfirm(
            isMeta
              ? '¿Crear una noticia para celebrar que se reunió la meta? Se abrirá el borrador y la IA propondrá un mensaje para la comunidad (agradecimiento, compromiso de los lotes, que ya están listos para comenzar la siguiente fase). Podrás editarlo todo antes de publicar.'
              : '¿Abrir noticias con un borrador a partir de este proyecto para contar la novedad? Podrás editar todo antes de publicar.',
            () =>
              openNewsComposerFromFund(
                { ...fund, status: val },
                isMeta ? { aiMilestone: true } : {},
              ),
          )
        }
      })
      .catch((err) => {
        console.error(err)
        showAlert('No se pudo actualizar el estado del proyecto.')
      })
  }

  const handleApplyAmounts = (id, { raised, goal }) => {
    const f = (db.funds || []).find((x) => x.id === id)
    return updateFundRaisedGoal(id, raised, goal)
      .then(() => {
        logAction(
          'ACTUALIZAR_FONDOS',
          `${f?.name || id}: recaudo ${formatCurrency(raised)}, meta ${formatCurrency(goal)}`,
        )
        const requiresBudget = f?.requiresBudget !== false
        const stNorm = mapLegacyFundStatus(f?.status)
        const shouldAutoMeta =
          requiresBudget &&
          goal > 0 &&
          raised >= goal &&
          (stNorm === FUND_STATUS.RECOLECCION || stNorm === FUND_STATUS.PENDIENTE)
        const shouldRevertMeta =
          requiresBudget && goal > 0 && raised < goal && stNorm === FUND_STATUS.META_ALCANZADA
        if (shouldAutoMeta) {
          return updateFundStatus(id, FUND_STATUS.META_ALCANZADA).then(() => {
            if (!canManageFunds) {
              showAlert('Montos guardados correctamente.')
              return
            }
            const fundSnapshot = {
              ...f,
              raised,
              goal,
              status: FUND_STATUS.META_ALCANZADA,
            }
            showConfirm(
              'Se marcó «Meta alcanzada» porque el recaudo llegó al 100%. ¿Crear una noticia para la comunidad? La IA redactará un mensaje festivo con variaciones de agradecimiento y de que ya están listos para la siguiente fase (podrás editarlo).',
              () => openNewsComposerFromFund(fundSnapshot, { aiMilestone: true }),
            )
          })
        }
        if (shouldRevertMeta) {
          return updateFundStatus(id, FUND_STATUS.RECOLECCION).then(() => {
            showAlert(
              'El recaudo quedó por debajo de la meta (por un ajuste de montos o porque la meta subió). El proyecto volvió automáticamente a «En recolección de fondos».',
            )
          })
        }
        showAlert('Montos guardados correctamente.')
      })
      .catch((err) => {
        console.error(err)
        showAlert('No se pudo guardar montos.')
      })
  }

  const triggerAIAssistantDesc = async () => {
    if (!newProject.name.trim()) return showAlert('Escribe el nombre del proyecto primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setIsAnalyzing(true)
    const aiResponse = await fetchGeminiProjectDescriptionFromTitle(newProject.name)
    if (aiResponse?.description) {
      setNewProject((p) => ({ ...p, description: aiResponse.description }))
    } else {
      const d = getLastGeminiDetail()
      showAlert(d ? `La IA no respondió: ${d}` : 'No se pudo conectar con la IA. Ingresa la descripción manualmente.')
    }
    setIsAnalyzing(false)
  }

  const triggerProjectCopyAssistant = async () => {
    if (!newProject.name.trim() && !newProject.description.trim()) {
      showAlert('Escribe nombre o descripción para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setCopyAiBusy(true)
    try {
      const polishedName = await requestPolishedText('fund_name', newProject.name)
      let polishedDesc = await requestPolishedText('fund_description', newProject.description)
      if (!polishedDesc && (polishedName || newProject.name.trim())) {
        const aiResponse = await fetchGeminiProjectDescriptionFromTitle(polishedName || newProject.name)
        polishedDesc = aiResponse?.description?.trim() || ''
      }
      setNewProject((prev) => ({
        ...prev,
        name: polishedName || prev.name,
        description: polishedDesc || prev.description,
      }))
      showAlert('Sugerencias de redacción aplicadas en el proyecto.')
    } finally {
      setCopyAiBusy(false)
    }
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (newProject.requiresBudget) {
      const g = parseCopIntegerFromDigits(newProject.goal)
      if (g <= 0) return showAlert('Ingresa la meta solo con números, sin puntos ni comas (ej.: 5000000).')
    }
    if (coverImageFile && coverImageFile.size > MAX_ENTITY_IMAGE_BYTES)
      return showAlert(
        `La imagen de portada no puede superar ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`,
      )

    const editingExisting = editingFundId != null
    const id = editingExisting ? editingFundId : `fp-${crypto.randomUUID()}`
    const prev = editingExisting ? (db.funds || []).find((f) => f.id === editingFundId) : null
    setIsSubmittingFund(true)
    try {
      let imageUrl = null
      if (prev?.image && !isNewsFallbackImageUrl(prev.image)) imageUrl = prev.image
      if (coverImageFile) {
        imageUrl = await uploadEntityCoverImage(coverImageFile, 'funds', id)
      }

      const expectedQuotaPerLotCOP = parseCopIntegerFromDigits(newProject.expectedQuotaPerLot)
      const publicationDate = (editingExisting && prev?.date ? String(prev.date).trim() : '') || new Date().toLocaleDateString('es-CO')

      const finalProject = editingExisting && prev
        ? (() => {
            const { historicRaisedBaseline: _removed, ...prevRest } = prev
            return {
              ...prevRest,
              id,
              name: newProject.name,
              description: newProject.description,
              requiresBudget: newProject.requiresBudget,
              goal: newProject.requiresBudget ? parseCopIntegerFromDigits(newProject.goal) : 0,
              raised: fundAmountFromDb(prev.raised),
              status: mapLegacyFundStatus(prev.status),
              expectedQuotaPerLotCOP,
              createdAt: prev.createdAt ?? Date.now(),
              date: publicationDate,
              image: imageUrl,
            }
          })()
        : {
            id,
            name: newProject.name,
            description: newProject.description,
            requiresBudget: newProject.requiresBudget,
            goal: newProject.requiresBudget ? parseCopIntegerFromDigits(newProject.goal) : 0,
            raised: 0,
            status: FUND_STATUS.RECOLECCION,
            expectedQuotaPerLotCOP,
            createdAt: Date.now(),
            date: publicationDate,
            image: imageUrl,
          }

      await addFund(finalProject)
      void trackPortalEvent('fund_publish', { mode: editingExisting ? 'edit' : 'new' })
      logAction(editingExisting ? 'EDITAR_PROYECTO' : 'CREAR_PROYECTO', `${editingExisting ? 'Editó' : 'Creó'} proyecto: ${finalProject.name}`)
      setShowCreateForm(false)
      setEditingFundId(null)
      setCoverImageFile(null)
      setNewProject({
        name: '',
        description: '',
        requiresBudget: true,
        goal: '',
        expectedQuotaPerLot: '',
      })
      showAlert(editingExisting ? 'Proyecto actualizado correctamente.' : '¡El nuevo proyecto ha sido creado exitosamente!')
    } catch (err) {
      console.error(err)
      if (err instanceof Error && err.message === 'ENTITY_IMAGE_TOO_LARGE') {
        showAlert(`La imagen supera ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`)
      } else showAlert('No se pudo crear el proyecto.')
    } finally {
      setIsSubmittingFund(false)
    }
  }

  const startEditFund = (fund) => {
    setEditingFundId(fund.id)
    setShowCreateForm(true)
    setCoverImageFile(null)
    setNewProject({
      name: fund.name || '',
      description: fund.description || '',
      requiresBudget: fund.requiresBudget !== false,
      goal: fund.requiresBudget !== false ? copDigitsFromInput(String(fundAmountFromDb(fund.goal))) : '',
      expectedQuotaPerLot: copDigitsFromInput(String(fundAmountFromDb(fund.expectedQuotaPerLotCOP))),
    })
  }

  const handleDeleteFund = (fund) => {
    showConfirm(`¿Eliminar el proyecto "${fund.name}"? Esta acción no se puede deshacer.`, async () => {
      try {
        await deleteFund(fund.id)
        logAction('ELIMINAR_PROYECTO', `Eliminó proyecto ${fund.id}`)
        showAlert('Proyecto eliminado correctamente.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar el proyecto.')
      }
    })
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-stone-800">Proyectos y Fondos</h2>
          <p className="text-stone-600 mt-1">Costo, recaudo y estado de los proyectos actuales.</p>
          <p className="text-sm font-bold text-blue-800 mt-2">
            Recaudo total registrado en proyectos: {formatCurrency(sumFundsRaisedTotal(db.funds || []))}
          </p>
        </div>
        {canManageFunds && (
          <button
            type="button"
            onClick={() => {
              if (showCreateForm) {
                setShowCreateForm(false)
                setEditingFundId(null)
                setCoverImageFile(null)
                setNewProject({
                  name: '',
                  description: '',
                  requiresBudget: true,
                  goal: '',
                  expectedQuotaPerLot: '',
                })
              } else {
                setShowCreateForm(true)
              }
            }}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-blue-700 transition-colors"
          >
            {showCreateForm ? (
              'Cancelar'
            ) : (
              <>
                <PlusCircle className="w-4 h-4 mr-2" /> {editingFundId != null ? 'Editar Proyecto' : 'Crear Proyecto'}
              </>
            )}
          </button>
        )}
      </div>

      {showCreateForm && canManageFunds && (
        <div
          ref={fundEditFormRef}
          className="bg-white p-6 md:p-8 rounded-3xl border border-blue-100 shadow-sm animate-in slide-in-from-top-4 scroll-mt-24"
        >
          <h3 className="text-xl font-black flex items-center mb-6 text-blue-900">
            <TrendingUp className="w-5 h-5 text-blue-500 mr-2" /> {editingFundId != null ? 'Editar Proyecto o Fondo' : 'Nuevo Proyecto o Fondo'}
          </h3>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <button
              type="button"
              onClick={() => void triggerProjectCopyAssistant()}
              disabled={copyAiBusy || isAnalyzing}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {copyAiBusy ? 'Procesando…' : 'Sugerir redacción (IA)'}
            </button>
            <button
              type="button"
              onClick={() => void triggerAIAssistantDesc()}
              disabled={isAnalyzing || copyAiBusy}
              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {isAnalyzing ? 'Analizando…' : 'Crear descripción desde título'}
            </button>
            <p className="text-xs text-stone-700">La IA se usa solo para copy; montos y estados quedan manuales.</p>
          </div>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Nombre del proyecto *</label>
                <input
                  required
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500"
                  placeholder="Ej: Poda de zonas verdes"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-bold text-stone-800">Descripción *</label>
                <textarea
                  required
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500 h-24"
                  placeholder="Describe el alcance del proyecto..."
                />
              </div>
              <div className="md:col-span-2 border border-stone-200 rounded-xl p-4 bg-stone-50/90">
                <label className="block text-sm font-bold text-stone-800 mb-2">
                  Imagen de portada (opcional, 1 archivo, máx. {Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm font-medium text-stone-800 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-bold"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    setCoverImageFile(f || null)
                  }}
                />
                {coverImageFile && (
                  <p className="text-xs text-stone-700 mt-2">
                    {coverImageFile.name} — si no eliges archivo, el listado no mostrará imagen de portada.
                  </p>
                )}
              </div>
              <div className="md:col-span-2 bg-stone-50 p-4 rounded-xl border border-stone-100 flex flex-col gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newProject.requiresBudget}
                    onChange={(e) => setNewProject({ ...newProject, requiresBudget: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mr-3"
                  />
                  <span className="font-bold text-stone-800">Este proyecto tiene una meta de recaudo económico</span>
                </label>
                {newProject.requiresBudget && (
                  <div className="pl-8 space-y-2">
                    <label className="block text-sm font-bold text-stone-700">Meta de recaudo (COP) *</label>
                    <p className="text-xs text-stone-700 leading-relaxed max-w-xl">{COP_AMOUNT_INPUT_HINT}</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      value={newProject.goal}
                      onChange={(e) =>
                        setNewProject({ ...newProject, goal: copDigitsFromInput(e.target.value) })
                      }
                      className="w-full md:max-w-md border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                      placeholder="2000000"
                    />
                  </div>
                )}
                <div className="pl-0 md:pl-0 pt-2 border-t border-stone-200/80 mt-2 space-y-2">
                  <label className="block text-sm font-bold text-stone-800">
                    Cuota o aporte esperado por lote (COP) — opcional
                  </label>
                  <p className="text-xs text-stone-700 leading-relaxed max-w-2xl">
                    Usualmente: valor del proyecto ÷ promedio de lotes que aportan al mes. Cifra de referencia para
                    consulta; vacío o 0 = no se muestra en la tarjeta.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={newProject.expectedQuotaPerLot}
                    onChange={(e) =>
                      setNewProject({ ...newProject, expectedQuotaPerLot: copDigitsFromInput(e.target.value) })
                    }
                    className="w-full md:max-w-md border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                    placeholder="Ej. 50000"
                  />
                </div>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmittingFund}
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmittingFund ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Creando…
                  </>
                ) : editingFundId != null ? (
                  'Guardar cambios del proyecto'
                ) : (
                  'Crear proyecto'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {(db.funds || []).length === 0 && !showCreateForm && (
        <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 px-6 py-12 text-center">
          <TrendingUp className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <p className="text-stone-800 font-bold text-lg mb-1">No hay proyectos ni fondos registrados</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Los proyectos de recaudo y obras aparecerán aquí. Si puedes gestionarlos, usa &quot;Crear Proyecto&quot;.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {(db.funds || []).map((fund) => {
          const requiresBudget = fund.requiresBudget !== false
          const goalNum = fundAmountFromDb(fund.goal)
          const raisedNum = fundAmountFromDb(fund.raised)
          const pct = goalNum > 0 ? (raisedNum / goalNum) * 100 : 0
          const fundProgressTone = getFundProgressToneClasses(Math.min(100, pct))
          const fundCover =
            fund.image && !isNewsFallbackImageUrl(fund.image) ? fund.image : null
          const goalLooksLikeDecimalBug =
            requiresBudget &&
            goalNum > 0 &&
            goalNum < 1000 &&
            typeof fund.goal === 'number' &&
            !Number.isInteger(fund.goal)
          const quotaPerLotNum = fundAmountFromDb(fund.expectedQuotaPerLotCOP)
          const publicationDateLabel =
            typeof fund?.date === 'string' && fund.date.trim()
              ? fund.date
              : Number.isFinite(Number(fund?.createdAt))
                ? new Date(Number(fund.createdAt)).toLocaleDateString('es-CO', { dateStyle: 'long' })
                : ''
          return (
            <div
              key={fund.id}
              className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/40 border border-emerald-100/30 rounded-3xl p-5 sm:p-7 md:p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-6 items-stretch"
            >
              {fundCover ? (
                <div className="w-full shrink-0">
                  <div className="rounded-2xl border border-emerald-100/60 bg-gradient-to-b from-emerald-50/70 via-amber-50/25 to-sky-50/40 flex items-center justify-center aspect-[4/3] sm:aspect-[16/10] p-3 sm:p-5">
                    <img
                      src={fundCover}
                      alt=""
                      className="max-h-full max-w-full w-full h-full rounded-lg shadow-sm object-contain"
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex-1 w-full min-w-0 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <h3 className="text-xl sm:text-2xl font-bold text-stone-800 leading-snug">{fund.name}</h3>
                    {publicationDateLabel && (
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-stone-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Publicado: {publicationDateLabel}
                      </p>
                    )}
                  </div>
                  {canManageFunds ? (
                    <select
                      value={mapLegacyFundStatus(fund.status)}
                      onChange={(e) => handleStatusChange(fund, e.target.value)}
                      className="bg-white/70 backdrop-blur border border-emerald-100/50 text-sm font-bold text-stone-800 px-3 py-2 rounded-lg outline-none focus:border-emerald-500 shrink-0 max-w-full sm:max-w-[14rem]"
                    >
                      {FUND_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="inline-block px-4 py-1.5 rounded-lg text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 shrink-0 w-fit">
                      {mapLegacyFundStatus(fund.status)}
                    </span>
                  )}
                </div>
                <p className="text-stone-700 text-sm whitespace-pre-wrap leading-relaxed">{fund.description}</p>
                {quotaPerLotNum > 0 && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/90 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-800 mb-1">
                      Aporte de referencia por lote
                    </p>
                    <p className="text-lg font-black text-blue-950 tabular-nums">{formatCurrency(quotaPerLotNum)}</p>
                    <p className="text-xs text-blue-900/80 mt-1">
                      Cuota de referencia: costo del proyecto ÷ promedio de lotes con aporte mensual.
                    </p>
                  </div>
                )}
                {canManageFunds && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditFund(fund)}
                      className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
                    >
                      <Edit3 className="w-4 h-4 mr-1.5" /> Editar proyecto
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openNewsComposerFromFund(
                          fund,
                          mapLegacyFundStatus(fund.status) === FUND_STATUS.META_ALCANZADA
                            ? { aiMilestone: true }
                            : {},
                        )
                      }
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100"
                    >
                      <Newspaper className="w-4 h-4 mr-1.5" /> Noticia desde proyecto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFund(fund)}
                      className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar proyecto
                    </button>
                  </div>
                )}

                {!requiresBudget && (
                  <div className="bg-amber-50/80 px-4 py-2.5 rounded-xl border border-amber-100 text-xs font-bold text-amber-900 flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0" />
                    Este proyecto está marcado sin meta de recaudo; igual puedes ver y editar valores de referencia.
                  </div>
                )}

                {goalLooksLikeDecimalBug && canManageFunds && (
                  <div className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    El valor de la meta parece demasiado bajo (quizá se guardó con punto como decimal). Vuelve a
                    escribir la meta completa solo con números, sin puntos ni comas, y guarda.
                  </div>
                )}

                <div className="rounded-2xl border border-emerald-100/30 bg-white/60 ring-1 ring-emerald-100/25 p-4 md:p-6">
                  <div className="grid grid-cols-1 2xl:grid-cols-12 gap-4 2xl:gap-5 items-stretch">
                    <div className="2xl:col-span-4 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-xl border border-emerald-100/30 shadow-sm p-4 flex flex-col justify-center">
                      {requiresBudget && goalNum > 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4">
                          <div className="relative flex h-[145px] w-[145px] items-center justify-center rounded-full border border-stone-200 bg-white ring-1 ring-emerald-100/60">
                            <FundCircularWithCelebration
                              fundId={fund.id}
                              percentage={pct}
                              colorClass={fundProgressTone.ringClass}
                              textClass={fundProgressTone.labelClass}
                            />
                          </div>
                          <div className="w-full bg-stone-200 rounded-full h-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${fundProgressTone.barClass}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="min-h-[170px] flex items-center justify-center">
                          <p className="text-sm font-bold text-stone-600 text-center">Sin meta de recaudo definida</p>
                        </div>
                      )}
                    </div>

                    <div className="2xl:col-span-8 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                        <div className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-xl p-4 md:p-5 border border-emerald-100/30 shadow-sm min-w-0 flex flex-col justify-center">
                          <p className="text-xs font-bold text-stone-600 uppercase mb-2 tracking-wide">Recaudado</p>
                          <p
                            className={`text-lg sm:text-xl lg:text-2xl font-black tabular-nums tracking-tight whitespace-nowrap leading-none ${requiresBudget && goalNum > 0 ? fundProgressTone.raisedClass : 'text-stone-900'}`}
                          >
                            {formatCurrency(raisedNum)}
                          </p>
                        </div>

                        <div className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-xl p-4 md:p-5 border border-emerald-100/30 shadow-sm min-w-0 flex flex-col justify-center">
                          <p className="text-xs font-bold text-stone-600 uppercase mb-2 tracking-wide">
                            {requiresBudget ? 'Meta de recaudo' : 'Valor total del proyecto'}
                          </p>
                          <p className="text-lg sm:text-xl lg:text-2xl font-black text-stone-900 tabular-nums tracking-tight whitespace-nowrap leading-none">
                            {formatCurrency(goalNum)}
                          </p>
                        </div>
                      </div>

                      {canManageFunds && (
                        <AdminFundAmountForm
                          key={`${fund.id}-${fund.raised}-${fund.goal}`}
                          fund={fund}
                          onApply={handleApplyAmounts}
                          showAlert={showAlert}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DirectoriesView = ({
  currentUser,
  db,
  upsertDirectoryRow,
  deleteDirectoryRow,
  logAction,
  type,
  showAlert,
  showConfirm,
}) => {
  const BASE_SERVICE_CATEGORIES = useMemo(
    () => [
      'Salud',
      'Seguridad',
      'Mantenimiento',
      'Domicilios',
      'Entes Municipales',
      'Servicios públicos',
      'Legal',
    ],
    [],
  )
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [professionKeyword, setProfessionKeyword] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [categoryAiBusy, setCategoryAiBusy] = useState(false)
  const [customServiceCategories, setCustomServiceCategories] = useState([])

  const isServices = type === 'services'
  const title = isServices ? 'Directorio de Servicios' : 'Comunidad y Vecinos'
  const table = isServices ? db.services || [] : db.community || []
  const defaultForm = isServices
    ? { name: '', phone: '', category: '', desc: '' }
    : { name: '', phone: '', profession: '', contactPref: 'Servicios' }
  const [form, setForm] = useState(defaultForm)

  const tableKey = isServices ? 'services' : 'community'

  useEffect(() => {
    setSearch('')
    setSortBy('name')
    setCategoryFilter('')
    setProfessionKeyword('')
    setCategoryDraft('')
    setCategoryAiBusy(false)
    setCustomServiceCategories([])
  }, [type])

  const categoriesInData = useMemo(() => {
    const set = new Set()
    table.forEach((i) => {
      const c = (i.category || '').trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [table])
  const serviceCategories = useMemo(() => {
    const ordered = []
    const seen = new Set()
    const source = [...BASE_SERVICE_CATEGORIES, ...categoriesInData, ...customServiceCategories]
    source.forEach((cat) => {
      const c = String(cat || '').trim()
      if (!c) return
      const key = c.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      ordered.push(c)
    })
    return ordered
  }, [BASE_SERVICE_CATEGORIES, categoriesInData, customServiceCategories])

  const normalizeCategoryForMatch = useCallback((value) => {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.replace(/(es|s)$/i, ''))
      .join(' ')
      .trim()
  }, [])

  const toCategoryLabel = useCallback((value) => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }, [])

  const findSimilarCategory = useCallback(
    (candidate) => {
      const normCandidate = normalizeCategoryForMatch(candidate)
      if (!normCandidate) return ''
      return (
        serviceCategories.find((cat) => {
          const normCat = normalizeCategoryForMatch(cat)
          if (!normCat) return false
          if (normCat === normCandidate) return true
          if (normCat.length >= 6 && normCandidate.length >= 6) {
            return normCat.includes(normCandidate) || normCandidate.includes(normCat)
          }
          return false
        }) || ''
      )
    },
    [normalizeCategoryForMatch, serviceCategories],
  )

  const handleAddCategoryWithAi = async () => {
    const raw = String(categoryDraft || '').trim()
    if (!raw) {
      showAlert('Escribe el nombre de la categoría que deseas agregar.')
      return
    }
    if (!isGeminiConfigured()) {
      showAlert('Configura VITE_GEMINI_API_KEY en .env para corregir categorías con IA.')
      return
    }
    setCategoryAiBusy(true)
    try {
      const polished = await polishSpanishField('directory_category', raw)
      const candidate = toCategoryLabel(polished || raw)
      if (!candidate) {
        showAlert('No se pudo interpretar la categoría. Intenta con otra redacción.')
        return
      }
      const similar = findSimilarCategory(candidate)
      if (similar) {
        setForm((prev) => ({ ...prev, category: similar }))
        showAlert(`Esta categoría ya existe o es muy similar a "${similar}". Se seleccionó automáticamente.`)
        return
      }
      setCustomServiceCategories((prev) => [...prev, candidate])
      setForm((prev) => ({ ...prev, category: candidate }))
      setCategoryDraft('')
      showAlert(`Categoría añadida: ${candidate}`)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo procesar la categoría con IA. Intenta nuevamente.')
    } finally {
      setCategoryAiBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editId) {
      const merged = table.map((i) => (i.id === editId ? { ...i, ...form } : i)).find((i) => i.id === editId)
      if (merged)
        upsertDirectoryRow(tableKey, merged).catch((err) => {
          console.error(err)
          showAlert('No se pudo actualizar el registro.')
        })
      logAction(isServices ? 'EDITAR_SERVICIO' : 'EDITAR_COMUNIDAD', `Editó: ${form.name}`)
      showAlert('¡Registro actualizado exitosamente!')
    } else {
      const newRowId = crypto.randomUUID()
      upsertDirectoryRow(tableKey, {
        id: newRowId,
        addedBy: currentUser.lotNumber,
        lot: currentUser.lotNumber,
        ...form,
      }).catch((err) => {
        console.error(err)
        showAlert('No se pudo añadir el registro.')
      })
      logAction(isServices ? 'CREAR_SERVICIO' : 'CREAR_COMUNIDAD', `Creó: ${form.name}`)
      showAlert('¡Nuevo registro añadido al directorio!')
    }
    setShowForm(false)
    setEditId(null)
    setForm(defaultForm)
  }
  const startEdit = (item) => {
    setForm(item)
    setEditId(item.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const handleDelete = (id) => {
    showConfirm(
      '¿Estás seguro que deseas eliminar permanentemente este registro del directorio?',
      () => {
        deleteDirectoryRow(tableKey, id).catch((err) => {
          console.error(err)
          showAlert('No se pudo eliminar el registro.')
        })
        logAction(isServices ? 'ELIMINAR_SERVICIO' : 'ELIMINAR_COMUNIDAD', 'Eliminó registro')
        showAlert('El registro ha sido eliminado.')
      },
    )
  }

  const filteredSorted = useMemo(() => {
    const qRaw = search.toLowerCase().trim()
    const words = qRaw ? qRaw.split(/\s+/).filter(Boolean) : []
    const matchesSearch = (i) => {
      if (words.length === 0) return true
      const hay = [
        i.name,
        i.category,
        i.profession,
        i.lot,
        i.desc,
        i.contactPref,
        i.phone,
        i.addedBy,
      ]
        .map((f) => String(f || '').toLowerCase())
        .join(' ')
      return words.every((w) => hay.includes(w))
    }

    let rows = table.filter(matchesSearch)

    if (isServices && categoryFilter) {
      rows = rows.filter((i) => (i.category || '') === categoryFilter)
    }
    if (!isServices && professionKeyword.trim()) {
      const pk = professionKeyword.trim().toLowerCase()
      rows = rows.filter((i) =>
        [i.profession, i.lot, i.name].some((f) => String(f || '').toLowerCase().includes(pk)),
      )
    }

    const cmpLot = (a, b) =>
      String(a.lot || '').localeCompare(String(b.lot || ''), 'es', { numeric: true, sensitivity: 'base' })
    const cmpCat = (a, b) =>
      String(a.category || '').localeCompare(String(b.category || ''), 'es', { sensitivity: 'base' })
    const cmpProf = (a, b) =>
      String(a.profession || '').localeCompare(String(b.profession || ''), 'es', { sensitivity: 'base' })
    const cmpName = (a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' })

    const sorted = [...rows]
    if (sortBy === 'name') sorted.sort(cmpName)
    else if (sortBy === 'lot') {
      if (isServices) sorted.sort((a, b) => cmpCat(a, b) || cmpName(a, b))
      else sorted.sort((a, b) => cmpLot(a, b) || cmpName(a, b))
    } else {
      if (isServices) sorted.sort((a, b) => cmpCat(a, b) || cmpName(a, b))
      else sorted.sort((a, b) => cmpProf(a, b) || cmpName(a, b))
    }
    return sorted
  }, [table, search, isServices, categoryFilter, professionKeyword, sortBy])

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-stone-800">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm)
            if (showForm) {
              setEditId(null)
              setForm(defaultForm)
            }
          }}
          className="bg-stone-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-sm"
        >
          {showForm ? (
            'Cancelar'
          ) : (
            <>
              <PlusCircle className="w-4 h-4 mr-2" /> Añadir Registro
            </>
          )}
        </button>
      </div>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
        <input
          type="text"
          placeholder="Buscar por nombre o palabra clave..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 p-4 rounded-xl border border-stone-200 outline-none focus:border-emerald-700 bg-white"
        />
      </div>

      <div className="rounded-3xl border border-emerald-100/70 bg-gradient-to-br from-amber-50/40 via-white to-emerald-50/50 p-5 md:p-6 shadow-sm shadow-emerald-100/30 space-y-5">
        {isServices && (
          <>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-stone-600 flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-emerald-600" />
                Categoría
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter('')}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                  !categoryFilter
                    ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                    : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                }`}
              >
                Todas
              </button>
              {serviceCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                    categoryFilter === cat
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-white text-stone-800 border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </>
        )}

        <div className={isServices ? 'border-t border-stone-200/80 pt-4' : ''}>
          <span className="text-xs font-black uppercase tracking-widest text-stone-600 flex items-center gap-2 mb-3">
            <ArrowDownAZ className="w-4 h-4 text-emerald-600" />
            Ordenar
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                sortBy === 'name'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
              }`}
            >
              Por nombre
            </button>
            <button
              type="button"
              onClick={() => setSortBy('lot')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                sortBy === 'lot'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
              }`}
            >
              {isServices ? 'Por categoría' : 'Por lote'}
            </button>
            {!isServices && (
              <button
                type="button"
                onClick={() => setSortBy('label')}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                  sortBy === 'label'
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                }`}
              >
                Por profesión
              </button>
            )}
          </div>
        </div>

      </div>

      {showForm && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-sm animate-in slide-in-from-top-4">
          <h3 className="font-bold text-xl mb-6">{editId ? 'Modificar Registro' : 'Nuevo Registro'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold mb-1.5 text-stone-800">Nombre *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5 text-stone-800">Teléfono *</label>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
              />
            </div>
            {isServices ? (
              <>
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-stone-800">Categoría *</label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
                  >
                    <option value="">Selecciona...</option>
                    {serviceCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-800 mb-2">
                      Agregar categoría con IA
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={categoryDraft}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        placeholder="Ej.: planeacion municipal"
                        className="flex-1 border border-amber-200 p-2.5 rounded-lg bg-white outline-none focus:border-amber-400 text-sm"
                      />
                      <button
                        type="button"
                        disabled={categoryAiBusy}
                        onClick={() => void handleAddCategoryWithAi()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                      >
                        {categoryAiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Añadir
                      </button>
                    </div>
                    <p className="text-[11px] text-stone-600 mt-1.5">
                      Se corrige ortografía y se evita crear categorías repetidas o similares.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-stone-800">Descripción breve</label>
                  <input
                    value={form.desc}
                    onChange={(e) => setForm({ ...form, desc: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
                  />
                </div>
              </>
            ) : (
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-stone-800">Profesión u Oficio *</label>
                  <input
                    required
                    value={form.profession}
                    onChange={(e) => setForm({ ...form, profession: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
                  />
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-stone-600 mb-2">
                    Preferencia de contacto
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, contactPref: 'Servicios' })}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${
                        (form.contactPref || 'Servicios') === 'Servicios'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Solo servicios
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, contactPref: 'Servicios y emergencias' })}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${
                        form.contactPref === 'Servicios y emergencias'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Servicios y emergencias
                    </button>
                  </div>
                  <p className="text-xs text-stone-600 mt-2">
                    Esto solo informa a los vecinos cómo prefieres que te contacten.
                  </p>
                </div>
              </div>
            )}
            <div className="md:col-span-2 flex justify-end pt-2">
              <button type="submit" className="bg-stone-900 text-white px-8 py-3 rounded-xl font-bold">
                {editId ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSorted.map((item) => {
          const ownerId = isServices ? item.addedBy : item.lot
          const canEdit = isAdminLike(currentUser) || currentUser.lotNumber === ownerId
          return (
            <div
              key={item.id}
              className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm relative pt-10 mt-2 flex flex-col"
            >
              <span className="absolute -top-3 left-6 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase border border-emerald-200">
                {isServices ? item.category : item.lot}
              </span>
              {canEdit && (
                <div className="absolute top-3 right-3 flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              <h4 className="text-xl font-bold text-stone-900 mb-1">{item.name}</h4>
              <p className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-5">
                {isServices ? item.desc : `${item.profession}${item.contactPref ? ` · ${item.contactPref}` : ''}`}
              </p>
              <div className="mt-auto">
                <a
                  href={`tel:${item.phone}`}
                  className="flex justify-center items-center w-full bg-stone-50 py-3 rounded-xl font-bold border border-stone-200 text-stone-800 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                >
                  <Phone className="w-4 h-4 mr-2" /> {item.phone}
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {table.length === 0 && !showForm && (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center">
          {isServices ? (
            <Phone className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          ) : (
            <Users className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          )}
          <p className="text-stone-800 font-bold text-lg mb-1">
            {isServices ? 'No hay servicios en el directorio' : 'No hay vecinos registrados en la comunidad'}
          </p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            {isServices
              ? 'Añade contactos útiles (salud, mantenimiento, etc.) con el botón «Añadir registro».'
              : 'Comparte oficios y datos de contacto con «Añadir registro».'}
          </p>
        </div>
      )}
      {table.length > 0 && filteredSorted.length === 0 && (
        <p className="text-center text-stone-600 font-medium py-8">No hay resultados para tu búsqueda o filtros.</p>
      )}
    </div>
  )
}

const DEFAULT_MAP_LAYERS = [
  { id: 'a', label: 'Etapa A', src: mapEtapaa },
  { id: 'b', label: 'Etapa B', src: mapEtapab },
]

function touchDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

const MAP_ZOOM_MIN = 1
const MAP_ZOOM_MAX = 4
const MAP_ZOOM_STEP = 0.25

const MapImageLightbox = ({ onClose, src, title, fileSlug }) => {
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const pinchRef = useRef({ startDist: 0, startScale: 1 })
  const viewportRef = useRef(null)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAP_ZOOM_MAX, Math.round((s + MAP_ZOOM_STEP) * 100) / 100))
  }, [])
  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(MAP_ZOOM_MIN, Math.round((s - MAP_ZOOM_STEP) * 100) / 100))
  }, [])

  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        startDist: touchDistance(e.touches[0], e.touches[1]),
        startScale: scaleRef.current,
      }
    }
  }, [])

  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 2) return
    e.preventDefault()
    const d = touchDistance(e.touches[0], e.touches[1])
    const { startDist, startScale } = pinchRef.current
    if (startDist < 1) return
    const next = (startScale * d) / startDist
    setScale(Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, next)))
  }, [])

  const downloadMap = useCallback(async () => {
    const name = `plano-lotes-urbanizados-las-blancas-${fileSlug}.jpg`
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      queueMicrotask(() => URL.revokeObjectURL(url))
    } catch {
      const a = document.createElement('a')
      a.href = src
      a.download = name
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }, [src, fileSlug])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [onTouchMove])

  const btnClass =
    'p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 active:bg-white/25 transition-colors touch-manipulation'

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Vista ampliada del plano"
    >
      <div className="shrink-0 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 bg-black/90 border-b border-white/10">
        <p className="flex-1 min-w-0 text-sm font-bold text-white truncate pr-2">{title}</p>
        <span className="text-xs text-white/70 tabular-nums shrink-0">{Math.round(scale * 100)}%</span>
        <button type="button" className={btnClass} onClick={zoomOut} aria-label="Reducir zoom">
          <ZoomOut className="w-5 h-5" />
        </button>
        <button type="button" className={btnClass} onClick={zoomIn} aria-label="Aumentar zoom">
          <ZoomIn className="w-5 h-5" />
        </button>
        <button type="button" className={btnClass} onClick={downloadMap} aria-label="Descargar imagen">
          <Download className="w-5 h-5" />
        </button>
        <button type="button" className={btnClass} onClick={onClose} aria-label="Cerrar">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div
        ref={viewportRef}
        className="flex-1 min-h-0 overflow-auto overscroll-contain touch-pan-x touch-pan-y"
        onTouchStart={onTouchStart}
      >
        <div
          className="flex min-h-full min-w-full items-center justify-center p-3"
          style={{ width: `${scale * 100}%`, minHeight: `${Math.max(100, scale * 100)}%` }}
        >
          <img
            src={src}
            alt={title}
            className="block w-full h-auto max-w-none select-none"
            draggable={false}
            decoding="async"
          />
        </div>
      </div>
    </div>
  )
}

const MapView = ({ currentUser, db, upsertMapLayer, deleteMapLayer, logAction, showAlert, showConfirm }) => {
  const canManageMaps = isAdminLike(currentUser)
  const mapLayers = useMemo(() => {
    const remote = (db.mapLayers || [])
      .filter((m) => m?.id && m?.label && m?.src)
      .map((m) => ({ id: String(m.id), label: String(m.label), src: String(m.src) }))
    return remote.length > 0 ? remote : DEFAULT_MAP_LAYERS
  }, [db.mapLayers])
  const [activeLayer, setActiveLayer] = useState(() => mapLayers[0]?.id || 'a')
  const [showMapForm, setShowMapForm] = useState(false)
  const [editingMapId, setEditingMapId] = useState(null)
  const [mapLabelDraft, setMapLabelDraft] = useState('')
  const [mapUrlDraft, setMapUrlDraft] = useState('')
  const [mapImageFile, setMapImageFile] = useState(null)
  const [savingMap, setSavingMap] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isMobileMap, setIsMobileMap] = useState(false)
  const layer = mapLayers.find((l) => l.id === activeLayer) || mapLayers[0]

  useEffect(() => {
    if (!mapLayers.some((l) => l.id === activeLayer)) setActiveLayer(mapLayers[0]?.id || 'a')
  }, [activeLayer, mapLayers])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setIsMobileMap(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const resetMapForm = () => {
    setShowMapForm(false)
    setEditingMapId(null)
    setMapLabelDraft('')
    setMapUrlDraft('')
    setMapImageFile(null)
  }

  const startEditMap = (mapLayer) => {
    setShowMapForm(true)
    setEditingMapId(mapLayer.id)
    setMapLabelDraft(mapLayer.label || '')
    setMapUrlDraft(mapLayer.src || '')
    setMapImageFile(null)
  }

  const handleDeleteMap = (mapLayer) => {
    showConfirm(`¿Eliminar el mapa "${mapLayer.label}"?`, async () => {
      try {
        await deleteMapLayer(mapLayer.id)
        logAction('ELIMINAR_MAPA', `Eliminó mapa ${mapLayer.id}`)
        showAlert('Mapa eliminado correctamente.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar el mapa.')
      }
    })
  }

  const handleSaveMap = async (e) => {
    e.preventDefault()
    if (!canManageMaps) return
    if (!mapLabelDraft.trim()) return showAlert('Debes ingresar el nombre de la etapa.')
    if (!mapImageFile && !mapUrlDraft.trim()) return showAlert('Debes subir imagen o indicar URL del mapa.')

    const id = editingMapId || `map-${crypto.randomUUID()}`
    setSavingMap(true)
    try {
      let src = mapUrlDraft.trim()
      if (mapImageFile) src = await uploadEntityCoverImage(mapImageFile, 'maps', id)
      await upsertMapLayer({ id, label: mapLabelDraft.trim(), src })
      logAction(editingMapId ? 'EDITAR_MAPA' : 'CREAR_MAPA', `${editingMapId ? 'Editó' : 'Creó'} mapa ${id}`)
      showAlert(editingMapId ? 'Mapa actualizado correctamente.' : 'Mapa agregado correctamente.')
      resetMapForm()
    } catch (err) {
      console.error(err)
      if (err instanceof Error && err.message === 'ENTITY_IMAGE_TOO_LARGE') {
        showAlert(`La imagen supera ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`)
      } else {
        showAlert('No se pudo guardar el mapa.')
      }
    } finally {
      setSavingMap(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      {lightboxOpen && isMobileMap ? (
        <MapImageLightbox
          key={activeLayer}
          onClose={() => setLightboxOpen(false)}
          src={layer.src}
          title={`Plano — ${layer.label}`}
          fileSlug={layer.id}
        />
      ) : null}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-stone-800 dark:text-slate-100">Mapa de Las Blancas</h2>
          <p className="text-stone-600 dark:text-slate-300 text-sm mt-1">Planos oficiales por etapa.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {canManageMaps && (
            <button
              type="button"
              onClick={() => {
                if (showMapForm) resetMapForm()
                else setShowMapForm(true)
              }}
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
            >
              <PlusCircle className="w-4 h-4 mr-1.5" /> {showMapForm ? 'Cancelar' : 'Agregar/Editar mapa'}
            </button>
          )}
        </div>
      </div>

      {showMapForm && canManageMaps && (
        <form
          onSubmit={handleSaveMap}
          className="rounded-2xl border border-emerald-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-950/55 backdrop-blur p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-xs font-bold text-stone-800 dark:text-slate-200 mb-1.5">Nombre de etapa *</label>
            <input
              required
              value={mapLabelDraft}
              onChange={(e) => setMapLabelDraft(e.target.value)}
              className="w-full border border-stone-200 dark:border-slate-800/60 rounded-xl px-3 py-2.5 bg-stone-50 dark:bg-slate-900/60 dark:text-slate-100 outline-none focus:border-emerald-500"
              placeholder="Ej: Etapa C"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-800 dark:text-slate-200 mb-1.5">URL de imagen (opcional)</label>
            <input
              value={mapUrlDraft}
              onChange={(e) => setMapUrlDraft(e.target.value)}
              className="w-full border border-stone-200 dark:border-slate-800/60 rounded-xl px-3 py-2.5 bg-stone-50 dark:bg-slate-900/60 dark:text-slate-100 outline-none focus:border-emerald-500"
              placeholder="https://..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-stone-800 dark:text-slate-200 mb-1.5">Subir imagen (opcional, reemplaza URL)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                setMapImageFile(f || null)
              }}
              className="w-full text-sm font-medium text-stone-800 dark:text-slate-200 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold"
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
            {editingMapId && (
              <button
                type="button"
                onClick={resetMapForm}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 text-stone-800 dark:text-slate-200 text-xs font-bold hover:bg-stone-50 dark:hover:bg-slate-900/70"
              >
                Cancelar edición
              </button>
            )}
            <button
              type="submit"
              disabled={savingMap}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {savingMap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingMapId ? 'Guardar mapa' : 'Crear mapa'}
            </button>
          </div>
        </form>
      )}

      <div className="flex rounded-xl bg-white/80 dark:bg-slate-950/55 backdrop-blur border border-stone-200 dark:border-slate-800/60 p-1 shadow-sm w-fit flex-wrap">
          {mapLayers.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActiveLayer(l.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeLayer === l.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-stone-800 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-900/60'
              }`}
            >
              {l.label}
            </button>
          ))}
      </div>
      {canManageMaps && (
        <div className="rounded-2xl border border-stone-200 dark:border-slate-800/60 bg-white dark:bg-slate-950/55 backdrop-blur p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-slate-400">Gestión de mapas por etapa</p>
          <div className="flex flex-wrap gap-2">
            {mapLayers.map((m) => (
              <div key={`map-admin-${m.id}`} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 dark:border-slate-800/60 px-2.5 py-1.5 bg-white/60 dark:bg-slate-900/40">
                <span className="text-xs font-bold text-stone-800 dark:text-slate-200">{m.label}</span>
                <button type="button" onClick={() => startEditMap(m)} className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => handleDeleteMap(m)} className="text-red-600 hover:text-red-800">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {isMobileMap && (
        <p className="text-xs text-stone-600 dark:text-slate-400 -mt-2 md:hidden">Toca el plano para verlo en pantalla completa, zoom y descarga.</p>
      )}
      <div className="rounded-3xl border border-stone-200 dark:border-slate-800/60 bg-stone-100 dark:bg-slate-950/55 flex-1 w-full min-h-[min(52vh,480px)] flex items-center justify-center p-3 sm:p-5 md:p-8">
        <button
          type="button"
          className={`max-w-full max-h-full p-0 border-0 bg-transparent ${isMobileMap ? 'cursor-pointer active:opacity-90 touch-manipulation' : 'cursor-default'}`}
          onClick={() => {
            if (isMobileMap) setLightboxOpen(true)
          }}
          aria-label={isMobileMap ? 'Abrir plano en pantalla completa' : undefined}
          tabIndex={isMobileMap ? 0 : -1}
        >
          <img
            key={layer.id}
            src={layer.src}
            alt={`Plano de Las Blancas — ${layer.label}`}
            className="max-w-full max-h-[min(75vh,820px)] w-auto h-auto object-contain object-center animate-in fade-in duration-300 pointer-events-none rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 bg-white/60 dark:bg-slate-900/30"
            decoding="async"
          />
        </button>
      </div>
    </div>
  )
}

const ChangePasswordPanel = ({ lotNumber, showAlert, logAction }) => {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (next !== again) return showAlert('La nueva contraseña y la repetición no coinciden.')
    const strong = checkStrongPassword(next.trim())
    if (!strong.ok)
      return showAlert('La nueva clave debe tener mínimo 8 caracteres e incluir letras y números.')
    setBusy(true)
    try {
      await updateUserPlainPassword(lotNumber, current, next.trim())
      savePortalSession(lotNumber, next.trim())
      logAction?.('CAMBIAR_CONTRASENA', 'Actualizó su contraseña desde el portal')
      showAlert('Contraseña actualizada correctamente.')
      setCurrent('')
      setNext('')
      setAgain('')
      setOpen(false)
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'WRONG_PASSWORD') showAlert('La contraseña actual no es correcta.')
      else if (code === 'USER_NOT_FOUND') showAlert('No se encontró tu usuario en la base de datos.')
      else if (code === 'INVALID_NEW_PASSWORD') showAlert('La nueva contraseña no es válida.')
      else showAlert('No se pudo guardar. Revisa la conexión o las reglas de Firestore.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-xs font-bold text-stone-800"
      >
        <span className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" /> Cambiar contraseña
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2 border-t border-stone-100 pt-3">
          <p className="text-[10px] leading-snug text-stone-600">
            La clave se guarda en Firestore en texto plano (igual que el login). Cada cambio usa una lectura y una
            escritura; en el plan gratuito suele ser de coste despreciable.
          </p>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña actual"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium outline-none focus:border-emerald-500"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium outline-none focus:border-emerald-500"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repetir nueva contraseña"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      )}
    </div>
  )
}

const ProfileView = ({ currentUser, db, showAlert, logAction }) => {
  const currentUserRow = useMemo(
    () => (db.users || []).find((u) => String(u?.lot) === String(currentUser?.lotNumber)),
    [db.users, currentUser?.lotNumber],
  )
  const selectedAvatar = getAvatarById(currentUserRow?.avatar)
  const [fincaName, setFincaName] = useState('')
  const [avatarId, setAvatarId] = useState('')
  const [avatarCategory, setAvatarCategory] = useState('animales')
  const [savingProfile, setSavingProfile] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busyPass, setBusyPass] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showAgain, setShowAgain] = useState(false)

  useEffect(() => {
    setFincaName((currentUserRow?.fincaName || '').trim())
    setAvatarId((currentUserRow?.avatar || '').trim())
  }, [currentUserRow?.fincaName, currentUserRow?.avatar])

  const filteredAvatars = useMemo(
    () => AVATAR_OPTIONS.filter((opt) => opt.category === avatarCategory),
    [avatarCategory],
  )

  const saveProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await updateUserProfile(currentUser.lotNumber, {
        fincaName: fincaName.trim(),
        avatar: avatarId || '',
      })
      logAction?.('ACTUALIZAR_PERFIL', 'Actualizó nombre de finca y avatar')
      showAlert('Perfil actualizado correctamente.')
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar el perfil.')
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (next !== again) return showAlert('La nueva contraseña y la repetición no coinciden.')
    const strong = checkStrongPassword(next.trim())
    if (!strong.ok)
      return showAlert('La nueva clave debe tener mínimo 8 caracteres e incluir letras y números.')
    setBusyPass(true)
    try {
      await updateUserPlainPassword(currentUser.lotNumber, current, next.trim())
      savePortalSession(currentUser.lotNumber, next.trim())
      logAction?.('CAMBIAR_CONTRASENA', 'Actualizó su contraseña desde Perfil')
      showAlert('Contraseña actualizada correctamente.')
      setCurrent('')
      setNext('')
      setAgain('')
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'WRONG_PASSWORD') showAlert('La contraseña actual no es correcta.')
      else if (code === 'USER_NOT_FOUND') showAlert('No se encontró tu usuario en la base de datos.')
      else if (code === 'INVALID_NEW_PASSWORD') showAlert('La nueva contraseña no es válida.')
      else showAlert('No se pudo guardar. Revisa la conexión o las reglas de Firestore.')
    } finally {
      setBusyPass(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-100 shadow-sm">
        <h2 className="text-2xl md:text-3xl font-black text-stone-900">Perfil</h2>
        <p className="text-stone-600 mt-1">Personaliza cómo te ve la comunidad en el portal.</p>
      </div>

      <form onSubmit={(e) => void saveProfile(e)} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-3xl">
            {selectedAvatar?.emoji || '🏡'}
          </div>
          <div>
            <p className="text-sm font-black text-stone-900">{currentUser?.lotNumber}</p>
            <p className="text-xs text-stone-600">
              Saludo actual: Familia {(fincaName || '').trim() || currentUser?.lotNumber}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-stone-800 mb-1">Nombre de la finca (opcional)</label>
          <input
            value={fincaName}
            onChange={(e) => setFincaName(e.target.value)}
            placeholder="Ej: La Esperanza"
            className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-400"
          />
          <p className="text-[11px] text-stone-600 mt-1">
            Si lo dejas vacío, el saludo usará el lote automáticamente.
          </p>
        </div>

        <div>
          <label className="block text-sm font-bold text-stone-800 mb-2">Avatar</label>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAvatarCategory('animales')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                avatarCategory === 'animales'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : 'bg-white border-stone-200 text-stone-700'
              }`}
            >
              Animales
            </button>
            <button
              type="button"
              onClick={() => setAvatarCategory('plantas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                avatarCategory === 'plantas'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : 'bg-white border-stone-200 text-stone-700'
              }`}
            >
              Plantas y arboles
            </button>
            <button
              type="button"
              onClick={() => setAvatarCategory('casas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                avatarCategory === 'casas'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : 'bg-white border-stone-200 text-stone-700'
              }`}
            >
              Casas de campo
            </button>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {filteredAvatars.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAvatarId(opt.id)}
                aria-label={opt.label}
                title={opt.label}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  avatarId === opt.id
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <span className="block text-2xl text-center leading-none">{opt.emoji}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAvatarId('')}
            className="mt-2 text-xs font-bold text-stone-600 hover:text-stone-800 underline"
          >
            Quitar avatar
          </button>
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {savingProfile ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </form>

      <form onSubmit={(e) => void savePassword(e)} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-stone-900">Cambiar contraseña</h3>
        <div className="relative">
          <input
            type={showCurrent ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Contraseña actual"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
          />
          <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700">
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showNext ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Nueva contraseña"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
          />
          <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700">
            {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showAgain ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repetir nueva contraseña"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
          />
          <button type="button" onClick={() => setShowAgain((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700">
            {showAgain ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-stone-600">La clave debe tener mínimo 8 caracteres e incluir letras y números.</p>
        <button
          type="submit"
          disabled={busyPass}
          className="bg-stone-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 disabled:opacity-50"
        >
          {busyPass ? 'Guardando…' : 'Guardar nueva contraseña'}
        </button>
      </form>
    </div>
  )
}

const SuperadminPasswordResetPanel = ({ db, showAlert, logAction }) => {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [targetLot, setTargetLot] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  const users = (db.users || [])
    .map((u) => u.lot)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }))
  const filtered = q.trim()
    ? users.filter((u) => String(u).toLowerCase().includes(q.trim().toLowerCase()))
    : users

  const submit = async (e) => {
    e.preventDefault()
    if (!targetLot) return showAlert('Selecciona un usuario.')
    if (!next.trim()) return showAlert('Escribe la nueva contraseña.')
    setBusy(true)
    try {
      await forceUserPlainPassword(targetLot, next.trim())
      logAction?.('SUPERADMIN_RESET_CLAVE', `Reseteó clave de ${targetLot}`)
      showAlert(`Contraseña actualizada para ${targetLot}.`)
      setNext('')
    } catch (err) {
      console.error(err)
      showAlert('No se pudo cambiar la clave. Revisa reglas de Firestore.')
    } finally {
      setBusy(false)
    }
  }

  const toggleBlock = async (lot, shouldBlock) => {
    try {
      await setUserBlockedStatus(lot, shouldBlock)
      logAction?.(shouldBlock ? 'SUPERADMIN_BLOQUEO_USUARIO' : 'SUPERADMIN_DESBLOQUEO_USUARIO', `${shouldBlock ? 'Bloqueó' : 'Desbloqueó'} ${lot}`)
      showAlert(`${lot} ${shouldBlock ? 'fue bloqueado' : 'fue desbloqueado'} correctamente.`)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo actualizar el estado de bloqueo del usuario.')
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-xs font-black text-rose-700"
      >
        <span className="flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Superadmin: cambiar clave a otro usuario
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2 border-t border-stone-100 pt-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar lote…"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium outline-none focus:border-rose-400"
          />
          <select
            value={targetLot}
            onChange={(e) => setTargetLot(e.target.value)}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold outline-none focus:border-rose-400 bg-white"
          >
            <option value="">Selecciona usuario…</option>
            {filtered.slice(0, 120).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña (texto plano)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium outline-none focus:border-rose-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar nueva clave'}
          </button>
          <p className="text-[10px] text-stone-600 leading-snug">
            Esto requiere reglas de Firestore que permitan a superadmin editar `users/*`. Sin reglas adecuadas fallará.
          </p>
          <div className="pt-2 border-t border-stone-100">
            <p className="text-[11px] font-black text-stone-800 mb-2">Bloqueo por falta de pago</p>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {filtered.slice(0, 80).map((lot) => {
                const user = (db.users || []).find((u) => u.lot === lot)
                const blocked = Boolean(user?.blocked)
                return (
                  <div key={lot} className="flex items-center justify-between rounded-lg border border-stone-100 px-2 py-1.5 bg-white">
                    <span className="text-[11px] font-bold text-stone-800">{lot}</span>
                    <button
                      type="button"
                      onClick={() => void toggleBlock(lot, !blocked)}
                      className={`text-[10px] font-black px-2 py-1 rounded-md ${blocked ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
                    >
                      {blocked ? 'Desbloquear' : 'Bloquear'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </form>
      )}
    </div>
  )
}

// ============================================================================
// 5. APLICACIÓN RAÍZ (modales globales)
// ============================================================================
function PortalApp() {
  const [db, setDb] = useState(EMPTY_DB)
  const [dataReady, setDataReady] = useState(false)
  const [sessionRehydrated, setSessionRehydrated] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('news')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [newsDraftFromFund, setNewsDraftFromFund] = useState(null)
  const consumeNewsDraftFromFund = useCallback(() => setNewsDraftFromFund(null), [])
  const openNewsComposerFromFund = useCallback((fund, opts = {}) => {
    setNewsDraftFromFund({
      key: Date.now(),
      fund: { ...fund },
      aiMilestone: Boolean(opts?.aiMilestone),
    })
    setActiveTab('news')
  }, [])

  useEffect(() => {
    // Asegura que el portal vuelva a modo claro si quedó una clase persistida.
    document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    let unsub = () => {}
    let cancelled = false
    ;(async () => {
      try {
        await seedFirestoreIfEmpty()
        await syncUsersIfNeeded()
        await ensurePublicSettings()
      } catch (err) {
        console.error(err)
      }
      if (cancelled) return
      unsub = subscribePortalDb(setDb, () => {
        if (!cancelled) setDataReady(true)
      })
    })()
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!dataReady) return

    const raw = readPortalSession()
    if (!raw) {
      setSessionRehydrated(true)
      return
    }

    const users = db.users ?? []
    if (users.length === 0) {
      const t = window.setTimeout(() => setSessionRehydrated(true), 2000)
      return () => window.clearTimeout(t)
    }

    try {
      const { lotNumber, password } = raw
      const user = users.find(
        (u) => u.lot?.toLowerCase() === String(lotNumber).toLowerCase() && u.password === password,
      )
      if (user && !user.blocked) {
        setCurrentUser({
          lotNumber: user.lot,
          shortLot: user.lot.replace(/Lote/i, 'L'),
          role: user.role,
        })
      } else {
        clearPortalSession()
      }
    } catch {
      clearPortalSession()
    }
    setSessionRehydrated(true)
  }, [dataReady, db.users])

  const logAction = (action, details) => {
    if (!currentUser) return
    appendLog({
      user: currentUser.lotNumber,
      action,
      details,
      timestamp: new Date().toLocaleString('es-CO'),
    }).catch(console.error)
    void trackPortalEvent('portal_action', {
      action_name: String(action || '').slice(0, 40),
      role: currentUser.role || 'unknown',
    })
  }

  useEffect(() => {
    void setPortalAnalyticsUser(currentUser)
  }, [currentUser])

  useEffect(() => {
    if (!currentUser?.lotNumber) return
    void trackPortalEvent('portal_tab_view', {
      tab_name: String(activeTab || '').slice(0, 40),
      role: currentUser.role || 'unknown',
    })
  }, [activeTab, currentUser?.lotNumber, currentUser?.role])

  const showAlert = (message) => setDialog({ type: 'alert', message })
  const showConfirm = (message, onConfirm) => setDialog({ type: 'confirm', message, onConfirm })

  if (!dataReady || !sessionRehydrated) {
    return (
      <div className="min-h-screen bg-portal-canvas dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" aria-hidden />
          <p className="text-stone-700 dark:text-slate-300 font-bold">
            {!dataReady ? 'Sincronizando con la base de datos…' : 'Restaurando sesión…'}
          </p>
        </div>
      </div>
    )
  }

  if (!currentUser)
    return (
      <LoginView
        db={db}
        onLogin={(user) => {
          savePortalSession(user.lotNumber, user.password)
          setCurrentUser({
            lotNumber: user.lotNumber,
            shortLot: user.shortLot,
            role: user.role,
          })
          void trackPortalEvent('portal_login', { role: user.role || 'unknown' })
          appendLog({
            user: user.lotNumber,
            action: 'LOGIN',
            details: 'Ingreso al portal',
            timestamp: new Date().toLocaleString('es-CO'),
          }).catch(console.error)
        }}
      />
    )

  const menu = [
    { id: 'news', label: 'Inicio (Noticias)', icon: Newspaper },
    { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
    { id: 'initiatives', label: 'Votaciones', icon: CheckSquare },
    { id: 'proposals', label: 'Muro de propuestas', icon: Rocket },
    { id: 'funds', label: 'Proyectos y Fondos', icon: TrendingUp },
    { id: 'services', label: 'Servicios', icon: Phone },
    { id: 'community', label: 'Comunidad', icon: Users },
    { id: 'map', label: 'Mapa', icon: MapIcon },
    { id: 'profile', label: 'Perfil', icon: User },
  ]
  const currentUserRow = (db.users || []).find((u) => String(u?.lot) === String(currentUser?.lotNumber))
  const activeAvatar = getAvatarById(currentUserRow?.avatar)

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/95 via-cyan-50/50 to-amber-50/35 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex font-sans text-stone-900 dark:text-slate-100 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-emerald-300/35 dark:bg-emerald-500/12 blur-3xl" />
        <div className="absolute top-1/3 -right-28 h-96 w-96 rounded-full bg-sky-300/30 dark:bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-200/25 dark:bg-amber-500/8 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.22),transparent_52%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.16),transparent_50%),radial-gradient(circle_at_45%_100%,rgba(251,191,36,0.12),transparent_45%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(circle_at_90%_15%,rgba(56,189,248,0.08),transparent_55%)]" />
      </div>
      {dialog && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-emerald-950/[0.12] backdrop-blur-[3px] dark:bg-slate-950/55 dark:backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-dialog-title"
        >
          <div className="relative max-w-md w-full rounded-[2rem] border border-emerald-200/70 bg-gradient-to-b from-white via-white to-emerald-50/45 p-6 shadow-2xl shadow-emerald-200/35 ring-1 ring-white/90 dark:border-slate-600/80 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 dark:ring-slate-600/40 md:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center mb-4">
              {dialog.type === 'alert' ? (
                <Info className="w-8 h-8 text-sky-500 mr-3 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="w-8 h-8 text-amber-500 mr-3 shrink-0" aria-hidden />
              )}
              <h3 id="portal-dialog-title" className="text-2xl font-black text-stone-900 dark:text-slate-50">
                {dialog.type === 'alert' ? 'Aviso' : 'Confirmar acción'}
              </h3>
            </div>
            <p className="mb-8 text-lg font-medium leading-snug text-stone-600 dark:text-slate-200">
              {dialog.message}
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              {dialog.type === 'confirm' && (
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="w-full rounded-xl border border-emerald-200/80 bg-white px-6 py-3 font-bold text-stone-800 shadow-sm transition-colors hover:bg-emerald-50/80 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 sm:w-auto"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (dialog.type === 'confirm' && dialog.onConfirm) {
                    const run = dialog.onConfirm
                    setDialog(null)
                    queueMicrotask(() => run())
                  } else {
                    setDialog(null)
                  }
                }}
                className={`px-8 py-3 rounded-xl font-black text-white shadow-md transition-colors w-full sm:w-auto ${
                  dialog.type === 'alert'
                    ? 'bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700'
                    : 'bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700'
                }`}
              >
                {dialog.type === 'alert' ? 'Entendido' : 'Sí, continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 border-0 bg-emerald-950/[0.14] p-0 backdrop-blur-[2px] transition-opacity dark:bg-slate-950/45 md:hidden cursor-pointer w-full h-full"
          aria-label="Cerrar menú"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-gradient-to-b from-white/92 via-emerald-50/20 to-amber-50/15 backdrop-blur supports-[backdrop-filter]:from-white/85 dark:from-slate-950/80 dark:via-slate-950/70 dark:to-slate-950/85 border-r border-emerald-100/50 dark:border-slate-800/60 z-50 transform transition-transform duration-300 ease-out md:relative md:translate-x-0 flex flex-col shadow-sm shadow-emerald-100/20 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-emerald-100/50 dark:border-slate-800/60 flex justify-between items-center gap-2 bg-white/55 dark:bg-slate-950/35">
          <div className="flex items-center gap-3 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 object-contain shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-emerald-800 dark:text-emerald-200 leading-tight">
              Portal Comunitario
              <span className="block text-sm sm:text-base text-emerald-900/90 dark:text-slate-200">Las Blancas</span>
            </h1>
          </div>
          <button
            type="button"
            className="md:hidden bg-white/60 dark:bg-slate-900/60 border border-emerald-100/40 dark:border-slate-800/60 p-2 rounded-xl"
            onClick={() => setIsMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 flex-1 space-y-1.5 overflow-y-auto">
          {menu.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void trackPortalEvent('portal_nav_click', {
                  to_tab: String(item.id).slice(0, 40),
                })
                setActiveTab(item.id)
                setIsMenuOpen(false)
              }}
              className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-colors ring-1 ${
                activeTab === item.id
                  ? 'bg-gradient-to-r from-emerald-600/15 to-blue-600/15 dark:from-emerald-400/20 dark:to-blue-400/20 ring-emerald-100/50 dark:ring-emerald-500/25 text-emerald-800 dark:text-emerald-200'
                  : 'text-stone-800 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-900/60 hover:text-stone-900 dark:hover:text-slate-100 ring-transparent hover:ring-emerald-100/40 dark:hover:ring-slate-700/60'
              }`}
            >
              <item.icon
                className={`w-5 h-5 mr-3 ${
                  activeTab === item.id ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-slate-400'
                }`}
              />{' '}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-6 bg-gradient-to-t from-emerald-50/30 to-transparent dark:from-slate-950/50 border-t border-emerald-100/40 dark:border-slate-800/60 space-y-3">
          <div className="flex items-start gap-3 mb-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-200 to-blue-200 flex items-center justify-center font-black text-emerald-900 shrink-0 text-xs">
              {activeAvatar?.emoji || currentUser.shortLot}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-stone-900 dark:text-slate-100 leading-tight truncate">{currentUser.lotNumber}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-600 mt-0.5">
                {currentUser.role === 'superadmin'
                  ? 'Super editor'
                  : currentUser.role === 'admin'
                    ? 'Editor del conjunto'
                    : 'Vecino'}
              </p>
            </div>
          </div>
          <ChangePasswordPanel
            lotNumber={currentUser.lotNumber}
            showAlert={showAlert}
            logAction={logAction}
          />
        {currentUser.role === 'superadmin' && (
          <SuperadminPasswordResetPanel db={db} showAlert={showAlert} logAction={logAction} />
        )}
          <button
            type="button"
            onClick={() => {
              void trackPortalEvent('portal_logout', { role: currentUser?.role || 'unknown' })
              clearPortalSession()
              setCurrentUser(null)
              setActiveTab('news')
            }}
            className="w-full bg-white/60 dark:bg-slate-900/60 border border-emerald-100/40 dark:border-slate-800/60 text-stone-800 dark:text-slate-200 py-3 rounded-xl font-bold flex items-center justify-center hover:bg-red-50/80 hover:text-red-600 transition-colors text-xs shadow-sm"
          >
            <LogOut className="w-4 h-4 mr-2" /> Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="bg-gradient-to-r from-white/90 via-emerald-50/25 to-amber-50/20 backdrop-blur supports-[backdrop-filter]:from-white/80 border-b border-emerald-100/45 p-4 flex items-center justify-between md:hidden shrink-0 z-30 sticky top-0">
          <button type="button" onClick={() => setIsMenuOpen(true)} className="mr-4 bg-white/60 border border-emerald-100/40 p-2 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain shrink-0" />
            <h1 className="font-black text-stone-800 text-xs leading-tight text-center max-w-[180px] sm:max-w-[220px]">
              {SITE_BRAND_TITLE}
            </h1>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-blue-100 text-emerald-800 flex items-center justify-center font-black text-xs shadow-sm">
            {activeAvatar?.emoji || currentUser?.shortLot}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth flex flex-col">
          <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0">
            <div className="flex-1">
            {activeTab === 'dashboard' && (
              <DashboardView
                currentUser={currentUser}
                db={db}
                setActiveTab={setActiveTab}
                upsertPortalEvent={upsertPortalEvent}
                deletePortalEvent={deletePortalEvent}
                savePublicSettings={savePublicSettings}
                updateUserProfile={updateUserProfile}
                addNewsPost={addNewsPost}
                logAction={logAction}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'news' && (
              <NewsView
                currentUser={currentUser}
                db={db}
                addNewsPost={addNewsPost}
                updateNewsPost={updateNewsPost}
                deleteNewsPost={deleteNewsPost}
                showAlert={showAlert}
                showConfirm={showConfirm}
                newsDraftFromFund={newsDraftFromFund}
                onConsumeNewsDraftFromFund={consumeNewsDraftFromFund}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileView currentUser={currentUser} db={db} showAlert={showAlert} logAction={logAction} />
            )}
            {activeTab === 'initiatives' && (
              <InitiativesView
                currentUser={currentUser}
                db={db}
                saveInitiative={saveInitiative}
                convertInitiativeToFund={convertInitiativeToFund}
                deleteInitiative={deleteInitiative}
                logAction={logAction}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'proposals' && (
              <ProposalsView
                currentUser={currentUser}
                db={db}
                saveInitiative={saveInitiative}
                deleteInitiative={deleteInitiative}
                logAction={logAction}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'funds' && (
              <FundsView
                currentUser={currentUser}
                db={db}
                updateFundStatus={updateFundStatus}
                updateFundRaisedGoal={updateFundRaisedGoal}
                addFund={addFund}
                deleteFund={deleteFund}
                logAction={logAction}
                showAlert={showAlert}
                showConfirm={showConfirm}
                openNewsComposerFromFund={openNewsComposerFromFund}
              />
            )}
            {activeTab === 'map' && (
              <MapView
                currentUser={currentUser}
                db={db}
                upsertMapLayer={upsertMapLayer}
                deleteMapLayer={deleteMapLayer}
                logAction={logAction}
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'services' && (
              <DirectoriesView
                currentUser={currentUser}
                db={db}
                upsertDirectoryRow={upsertDirectoryRow}
                deleteDirectoryRow={deleteDirectoryRow}
                logAction={logAction}
                type="services"
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            )}
            {activeTab === 'community' && (
              <DirectoriesView
                currentUser={currentUser}
                db={db}
                upsertDirectoryRow={upsertDirectoryRow}
                deleteDirectoryRow={deleteDirectoryRow}
                logAction={logAction}
                type="community"
                showAlert={showAlert}
                showConfirm={showConfirm}
              />
            )}
            </div>
            <PortalFooter />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <PortalApp />
    </ErrorBoundary>
  )
}
