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
} from 'lucide-react'
import mapEtapaa from '../images/etapaa.jpeg'
import mapEtapab from '../images/etapab.jpeg'
import { EMPTY_DB } from './initialData.js'
import {
  subscribePortalDb,
  seedFirestoreIfEmpty,
  syncUsersIfNeeded,
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
  deleteInitiative,
  upsertDirectoryRow,
  deleteDirectoryRow,
  upsertMapLayer,
  deleteMapLayer,
  updateUserPlainPassword,
  forceUserPlainPassword,
} from './firestore/portalData.js'
import { savePortalSession, clearPortalSession, readPortalSession } from './portalSession.js'
import { uploadEntityCoverImage, MAX_ENTITY_IMAGE_BYTES } from './firestore/uploadEntityImage.js'
import { BRAND_LOGO_SRC } from './brandAssets.js'
import {
  fetchGeminiSurveyOptions,
  fetchGeminiProjectDescriptionFromTitle,
  fetchGeminiDirectoryPreferences,
  getLastGeminiDetail,
  isGeminiConfigured,
  polishSpanishField,
} from './geminiClient.js'
import {
  DEFAULT_NEWS_IMAGE,
  MAX_NEWS_IMAGE_BYTES,
  MAX_NEWS_IMAGES_COUNT,
  NEWS_FALLBACK_IMAGE,
  getNewsCoverIndex,
  getNewsCoverUrl,
  getNewsGalleryUrls,
  isNewsFallbackImageUrl,
  uploadNewsImageFile,
} from './firestore/uploadNewsImage.js'

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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
          <div className="bg-white p-10 rounded-[2rem] shadow-xl max-w-lg border border-red-100">
            <AlertCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
            <h2 className="text-2xl font-black text-gray-900 mb-3">Interrupción Menor</h2>
            <p className="text-gray-600 mb-6 text-sm">
              Protegimos el portal de un error de datos. Haz clic abajo para restaurar.
            </p>
            <div className="bg-gray-100 p-4 rounded-xl text-xs text-left text-red-600 overflow-auto mb-6 font-mono h-24">
              {this.state.errorMsg}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="bg-gray-900 text-white px-8 py-4 rounded-xl font-bold w-full hover:bg-gray-800 transition-colors"
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

const MOCK_MEETINGS = [
  { id: 1, title: 'Asamblea General Ordinaria', date: '15 Mayo, 2026 - 10:00 AM', location: 'Kiosco Principal' },
]

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
const safeDateParse = (dateString) => {
  if (!dateString) return { isClosed: false, formatted: 'Sin fecha límite' }
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return { isClosed: false, formatted: 'Fecha inválida' }
  return {
    isClosed: new Date() > d,
    formatted: d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
  }
}
const SITE_BRAND_TITLE = 'Portal Comunitario Las Blancas'
const isAdminLike = (user) => user?.role === 'admin' || user?.role === 'superadmin'

function PortalFooter() {
  return (
    <footer className="text-center text-[11px] sm:text-xs text-gray-500 space-y-2 py-6 px-4 border-t border-gray-200/80 bg-white/50">
      <p className="text-gray-600 leading-relaxed">
        Creado por Luis Montoya ·{' '}
        <a href="tel:+573016394349" className="text-emerald-700 font-semibold hover:underline">
          301 639 4349
        </a>
        {' · '}
        <a
          href="https://www.instagram.com/afishingday/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 font-semibold hover:underline"
        >
          @afishingday
        </a>
      </p>
      <p className="text-gray-400">© 2026 {SITE_BRAND_TITLE}. Todos los derechos reservados.</p>
    </footer>
  )
}

/** Botón para mejorar un campo de texto con Gemini (requiere VITE_GEMINI_API_KEY). */
const GeminiPolishButton = ({ kind, text, onPolished, showAlert, compact }) => {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!text?.trim()) return showAlert('Escribe algo en este campo primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA de Gemini.')
    setBusy(true)
    try {
      const out = await polishSpanishField(kind, text)
      if (out) {
        onPolished(out)
        showAlert('Texto sugerido por la IA aplicado. Revísalo antes de publicar.')
      } else {
        const detail = getLastGeminiDetail()
        showAlert(
          detail
            ? `La IA no respondió (${detail}). Revisa la clave en .env o prueba en unos segundos.`
            : 'La IA no respondió. Inténtalo de nuevo en unos segundos.',
        )
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      className={
        compact
          ? 'shrink-0 text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 disabled:opacity-50 px-2 py-1 rounded-lg border border-amber-200 bg-amber-50/80'
          : 'text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 disabled:opacity-50'
      }
    >
      <Sparkles className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-amber-500 shrink-0`} />
      {busy ? '…' : 'IA'}
    </button>
  )
}

const CircularProgress = ({ percentage, colorClass, textClass }) => {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
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
      <span className={`absolute text-xl font-bold ${textClass}`}>{Math.round(percentage)}%</span>
    </div>
  )
}

/** Animación breve al cargar si el recaudo alcanzó el 100 %. */
const FundCircularWithCelebration = ({ fundId, percentage, colorClass, textClass }) => {
  const pct = Math.min(100, Math.max(0, Math.round(Number(percentage) || 0)))
  const isComplete = pct >= 100
  const [burst, setBurst] = useState(false)
  useEffect(() => {
    if (!isComplete) return
    setBurst(true)
    const t = window.setTimeout(() => setBurst(false), 3200)
    return () => window.clearTimeout(t)
  }, [isComplete, fundId])
  return (
    <div className="relative flex items-center justify-center shrink-0">
      <CircularProgress percentage={percentage} colorClass={colorClass} textClass={textClass} />
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
  if (!src) return <div className="h-full w-full bg-gray-200" />
  return <img src={src} alt="" className="h-full w-full object-cover" />
}

// ============================================================================
// 4. VISTAS DEL PORTAL
// ============================================================================

const LoginView = ({ db, onLogin }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [pwOpen, setPwOpen] = useState(false)
  const [pwNext, setPwNext] = useState('')
  const [pwAgain, setPwAgain] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    const userFormat = username.trim().replace(/\s+/g, '')
    const foundUser = db.users?.find((u) => u.lot?.toLowerCase() === userFormat.toLowerCase())

    if (!foundUser) return setError('Usuario no encontrado. Escríbelo sin espacios (Ej: Lote1A).')
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
    const userFormat = username.trim().replace(/\s+/g, '')
    const foundUser = db.users?.find((u) => u.lot?.toLowerCase() === userFormat.toLowerCase())
    if (!foundUser) return setError('Escribe tu usuario (Ej: Lote1A) para cambiar la contraseña.')
    if (!password) return setError('Escribe tu contraseña actual para cambiarla.')
    if (pwNext !== pwAgain) return setError('La nueva contraseña y la repetición no coinciden.')
    if (pwNext.trim().length < 4) return setError('Usa al menos 4 caracteres para la nueva contraseña.')
    setPwBusy(true)
    try {
      await updateUserPlainPassword(foundUser.lot, password, pwNext.trim())
      setPwOpen(false)
      setPwNext('')
      setPwAgain('')
      setError('Contraseña actualizada. Ya puedes ingresar con tu nueva clave.')
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'WRONG_PASSWORD') setError('La contraseña actual no es correcta.')
      else setError('No se pudo cambiar la contraseña. Revisa conexión o reglas de Firestore.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <div className="flex-1 flex justify-center items-center p-4">
        <div className="w-full max-w-md bg-white rounded-[2rem] shadow-xl overflow-hidden border border-gray-100">
          <div className="bg-emerald-800 flex flex-col items-center justify-center text-center text-white min-h-[min(52vh,320px)] sm:min-h-[340px] px-6 py-10 sm:py-12">
            <img
              src={BRAND_LOGO_SRC}
              alt="Las Blancas"
              className="w-full max-w-[min(92%,300px)] h-auto max-h-[min(38vh,220px)] sm:max-h-[240px] object-contain object-center drop-shadow-md flex-1 min-h-0 mb-6"
            />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-snug shrink-0">{SITE_BRAND_TITLE}</h1>
            <p className="text-emerald-200 text-sm mt-3 font-semibold shrink-0">Portal comunitario</p>
          </div>
          <div className="p-8">
            <p className="text-gray-500 text-sm text-center mb-6 leading-relaxed">
              Portal comunitario para residentes. Ingresa con tu usuario de lote.
            </p>
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center text-sm mb-6 border border-red-100">
              <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="relative">
                <User className="w-5 h-5 absolute left-4 top-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Usuario (Ej. Lote1A)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 p-4 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>
            <div>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-4 top-4 text-gray-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 p-4 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-4 text-gray-400 hover:text-emerald-600 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
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
              onClick={() => setPwOpen((s) => !s)}
              className="w-full text-xs font-bold text-emerald-700 hover:text-emerald-800 underline-offset-4 hover:underline"
            >
              ¿Quieres cambiar tu contraseña?
            </button>
            {pwOpen && (
              <form onSubmit={(e) => void handleChangePassword(e)} className="mt-3 space-y-2">
                <p className="text-[10px] text-gray-500 leading-snug">
                  Para cambiarla aquí, escribe tu usuario y tu contraseña actual arriba. La nueva clave se guarda en la
                  base de datos sin cifrar (como pediste).
                </p>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Nueva contraseña"
                  value={pwNext}
                  onChange={(e) => setPwNext(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repetir nueva contraseña"
                  value={pwAgain}
                  onChange={(e) => setPwAgain(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={pwBusy}
                  className="w-full rounded-xl bg-emerald-700 text-white py-3 font-bold text-sm hover:bg-emerald-800 disabled:opacity-50"
                >
                  {pwBusy ? 'Guardando…' : 'Guardar nueva contraseña'}
                </button>
              </form>
            )}
          </div>
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
})

const NewsView = ({
  currentUser,
  db,
  addNewsPost,
  updateNewsPost,
  deleteNewsPost,
  showAlert,
  showConfirm,
}) => {
  const [showForm, setShowForm] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => emptyNewsForm())

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
    const urls =
      Array.isArray(post.images) && post.images.length > 0
        ? [...post.images]
        : post.image
          ? [post.image]
          : []
    const mediaItems = urls.map((url) => ({
      id: crypto.randomUUID(),
      type: 'url',
      url,
    }))
    const ci = mediaItems.length ? Math.min(getNewsCoverIndex(post), mediaItems.length - 1) : 0
    const coverMediaId = mediaItems[ci]?.id ?? null
    setForm({
      title: post.title,
      excerpt: post.excerpt || '',
      content: post.content || '',
      category: post.category || 'General',
      mediaItems,
      coverMediaId,
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

    const isEditing = editingId != null
    const newsDocId = editingId ?? Date.now()
    const existing = isEditing ? (db.news || []).find((n) => n.id === editingId) : null

    const proceed = async () => {
      setIsUploading(true)
      try {
        let imageUrls = await buildImageUrlsFromMedia(form.mediaItems, newsDocId)
        if (imageUrls.length === 0) imageUrls = [NEWS_FALLBACK_IMAGE]

        const rawCoverPos =
          imageUrls.length <= 1 ? 0 : form.mediaItems.findIndex((m) => m.id === form.coverMediaId)
        const coverIdx =
          imageUrls.length <= 1
            ? 0
            : Math.min(
                Math.max(0, rawCoverPos >= 0 ? rawCoverPos : 0),
                imageUrls.length - 1,
              )
        const coverUrl = imageUrls[coverIdx] ?? imageUrls[0]

        const payload = {
          id: newsDocId,
          title: form.title,
          excerpt: form.excerpt,
          content: form.content,
          category: form.category,
          images: imageUrls,
          image: coverUrl,
          coverIndex: coverIdx,
          author: existing?.author ?? currentUser.lotNumber,
          date: existing?.date ?? new Date().toLocaleDateString('es-CO'),
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
        '¿Publicar esta noticia sin imágenes propias? Se usará el logo de Las Blancas como imagen de portada.',
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

  if (selectedPost) {
    const gallery = getNewsGalleryUrls(selectedPost)
    const activeSrc = gallery[Math.min(galleryIndex, gallery.length - 1)] || DEFAULT_NEWS_IMAGE

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

        <article className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="relative min-h-[16rem] max-h-[min(70vh,28rem)] md:max-h-[min(75vh,32rem)] w-full bg-gray-100 flex items-center justify-center p-4 md:p-6">
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-2 rounded-full shadow-md"
                  onClick={() =>
                    setGalleryIndex((i) => (i - 1 + gallery.length) % gallery.length)
                  }
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  aria-label="Imagen siguiente"
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-2 rounded-full shadow-md"
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
            <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-gray-100 bg-gray-50/80">
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
          <div className="p-6 md:p-10">
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-6 leading-tight">{selectedPost.title}</h2>
            <div className="flex items-center text-sm font-bold text-gray-500 mb-8 gap-6 border-b border-gray-100 pb-6">
              <span className="flex items-center">
                <User className="w-4 h-4 mr-2 text-emerald-600" /> Escrito por: {selectedPost.author}
              </span>
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-emerald-600" /> Publicado: {selectedPost.date}
              </span>
            </div>

            <div className="prose max-w-none text-gray-700 text-lg leading-relaxed whitespace-pre-wrap">
              {selectedPost.content || selectedPost.excerpt}
            </div>
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-800">Muro de Noticias</h2>
          <p className="text-gray-500 mt-1">Novedades y comunicados oficiales de Las Blancas.</p>
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
            className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-emerald-700 transition-colors"
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

      {showForm && (
        <div className="bg-white p-8 rounded-3xl border border-emerald-100 shadow-md space-y-6 animate-in slide-in-from-top-4">
          <h3 className="text-xl font-bold flex items-center">
            <Newspaper className="mr-2 text-emerald-600" />
            {editingId != null ? 'Editar comunicado' : 'Redactar Nuevo Comunicado'}
          </h3>
          <form onSubmit={handlePost} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <div className="flex justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-bold text-gray-700">Título *</label>
                  <GeminiPolishButton
                    kind="news_title"
                    text={form.title}
                    onPolished={(t) => setForm({ ...form, title: t })}
                    showAlert={showAlert}
                    compact
                  />
                </div>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Categoría</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="General">General</option>
                  <option value="Asamblea">Asamblea</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Eventos">Eventos</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="flex justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-bold text-gray-700">Resumen corto *</label>
                  <GeminiPolishButton
                    kind="news_excerpt"
                    text={form.excerpt}
                    onPolished={(t) => setForm({ ...form, excerpt: t })}
                    showAlert={showAlert}
                    compact
                  />
                </div>
                <textarea
                  required
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 h-20"
                  placeholder="Aparecerá en la tarjeta principal..."
                />
              </div>
              <div className="md:col-span-2">
                <div className="flex justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-bold text-gray-700">Contenido completo *</label>
                  <GeminiPolishButton
                    kind="news_content"
                    text={form.content}
                    onPolished={(t) => setForm({ ...form, content: t })}
                    showAlert={showAlert}
                    compact
                  />
                </div>
                <textarea
                  required
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  className="w-full p-4 border rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-emerald-500 h-40"
                  placeholder="Escribe el artículo completo aquí..."
                />
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
                          <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
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
                            <span className="truncate text-xs font-medium text-gray-700">
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
          <p className="text-gray-700 font-bold text-lg mb-1">Aún no hay noticias</p>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Cuando el administrador publique comunicados, aparecerán aquí. Si eres admin, usa &quot;Publicar
            Noticia&quot;.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {(db.news || []).map((post) => {
          const galleryCount = getNewsGalleryUrls(post).length
          const cardCover = getNewsCoverUrl(post)
          const cardCoverIsFallback = isNewsFallbackImageUrl(cardCover)
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
            className="relative bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm flex flex-col group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
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
              className={`h-56 relative overflow-hidden bg-gray-100 flex items-center justify-center ${
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
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 to-transparent" />
              <div className="absolute top-4 left-4 bg-emerald-600 text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest">
                {post.category}
              </div>
              {galleryCount > 1 && (
                <span className="absolute bottom-3 right-3 bg-black/55 text-white text-[10px] font-bold px-2 py-1 rounded-md">
                  {galleryCount} fotos
                </span>
              )}
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight group-hover:text-emerald-700 transition-colors">
                {post.title}
              </h3>
              <p className="text-gray-500 text-sm mb-6 flex-1 line-clamp-3">{post.excerpt}</p>
              <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-xs font-bold text-gray-400 uppercase tracking-widest">
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

const DashboardView = ({ currentUser, db, setActiveTab }) => {
  const activePolls = (db.initiatives || []).filter((i) => !safeDateParse(i.deadline).isClosed).length
  const totalRaised = (db.funds || []).reduce((acc, curr) => acc + (curr.raised || 0), 0)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-800">Hola, Familia {currentUser?.lotNumber} 👋</h1>
          <p className="text-gray-500 mt-2 font-medium">Resumen rápido de Las Blancas.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-emerald-600 text-white p-8 rounded-3xl shadow-sm relative overflow-hidden lg:col-span-2">
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
              onClick={() => setActiveTab('initiatives')}
              className="bg-white text-emerald-800 px-6 py-3 rounded-xl font-bold shadow-sm transition-transform hover:scale-105"
            >
              Ir a Votaciones ({activePolls} Activas)
            </button>
          </div>
          <BarChart2 className="absolute -bottom-6 -right-6 w-56 h-56 text-emerald-500/30 transform -rotate-12" />
        </div>

        <div className="space-y-6 flex flex-col">
          <button
            type="button"
            onClick={() => setActiveTab('funds')}
            className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-emerald-200 cursor-pointer transition-all flex-1 flex flex-col justify-center text-left w-full"
          >
            <h3 className="text-gray-500 font-bold mb-1 flex items-center text-xs uppercase tracking-widest">
              <TrendingUp className="w-4 h-4 mr-2 text-blue-600" /> Proyectos y Fondos
            </h3>
            <p className="text-xs text-gray-400 mb-1">Recaudo histórico:</p>
            <p className="text-2xl font-black text-blue-700">{formatCurrency(totalRaised)}</p>
          </button>
          <div className="bg-amber-50/50 rounded-3xl p-6 shadow-sm border border-amber-100 flex-1 flex flex-col justify-center">
            <h3 className="text-amber-600 font-bold mb-2 flex items-center text-xs uppercase tracking-widest">
              <Calendar className="w-4 h-4 mr-2" /> Próxima Asamblea
            </h3>
            <p className="font-black text-gray-800 text-lg mb-1">{MOCK_MEETINGS[0]?.title}</p>
            <p className="text-gray-600 font-bold text-sm mb-1">{MOCK_MEETINGS[0]?.date}</p>
            <p className="text-gray-500 text-xs flex items-center">
              <MapPin className="w-3 h-3 mr-1" /> {MOCK_MEETINGS[0]?.location}
            </p>
          </div>
        </div>
      </div>
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
                <tr className="border-b border-gray-100 text-left text-[10px] font-black uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2.5">Lote</th>
                  <th className="px-3 py-2.5">Opción</th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {draft.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-gray-500 font-medium text-xs">
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
                          className="w-full max-w-[11rem] border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white outline-none focus:border-amber-500"
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
                          className="w-full min-w-[8rem] border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white outline-none focus:border-amber-500"
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
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-bold hover:bg-gray-50"
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
  const canManageInitiatives = isAdminLike(currentUser)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [editingSurveys, setEditingSurveys] = useState({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingInitiativeId, setEditingInitiativeId] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSubmittingInitiative, setIsSubmittingInitiative] = useState(false)
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [newSurvey, setNewSurvey] = useState({
    title: '',
    excerpt: '',
    question: '',
    deadline: '',
    requiresBudget: false,
    budgetAmount: '',
    options: [
      { id: 1, text: '' },
      { id: 2, text: '' },
    ],
  })

  const handleVote = (initiativeId) => {
    const init = db.initiatives?.find((i) => i.id === initiativeId)
    if (!init) return
    if (safeDateParse(init.deadline).isClosed)
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
      saveInitiative(updated).catch((err) => {
        console.error(err)
        showAlert('No se pudo guardar el voto.')
      })
    setEditingSurveys((p) => ({ ...p, [initiativeId]: false }))
  }

  const handleConvertToProject = (initiative) => {
    showConfirm(
      `¿Estás seguro que deseas convertir "${initiative.title}" en un proyecto en ejecución? Esto lo moverá a la sección de Proyectos y Fondos.`,
      () => {
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
          requiresBudget: initiative.survey?.requiresBudget || false,
          goal: initiative.survey?.requiresBudget ? Number(initiative.survey?.budgetAmount) || 0 : 0,
          raised: 0,
          status: 'Pendiente de iniciar',
          image: initiative.image || NEWS_FALLBACK_IMAGE,
        }

        convertInitiativeToFund(initiative, newProject).catch((err) => {
          console.error(err)
          showAlert('No se pudo convertir la iniciativa en proyecto.')
        })

        logAction('CONVERTIR_PROYECTO', `Convirtió iniciativa #${initiative.id} en Proyecto`)
        showAlert(
          "¡La iniciativa fue convertida en Proyecto exitosamente! Puedes revisarla ahora en la sección 'Proyectos y Fondos'.",
        )
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
    showConfirm(`¿Finalizar ahora la votación "${initiative.title}"?`, async () => {
      try {
        const closedAt = new Date(Date.now() - 60_000).toISOString().slice(0, 16)
        await saveInitiative({ ...initiative, deadline: closedAt })
        logAction('FINALIZAR_ENCUESTA', `Finalizó manualmente iniciativa #${initiative.id}`)
        showAlert('La votación quedó finalizada.')
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
    if (coverImageFile && coverImageFile.size > MAX_ENTITY_IMAGE_BYTES)
      return showAlert(
        `La imagen de portada no puede superar ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`,
      )

    const editingExisting = editingInitiativeId != null
    const id = editingExisting ? editingInitiativeId : Date.now()
    setIsSubmittingInitiative(true)
    try {
      let imageUrl = NEWS_FALLBACK_IMAGE
      if (editingExisting) {
        const prev = (db.initiatives || []).find((i) => i.id === editingInitiativeId)
        imageUrl = prev?.image || NEWS_FALLBACK_IMAGE
      }
      if (coverImageFile) {
        imageUrl = await uploadEntityCoverImage(coverImageFile, 'initiatives', id)
      }

      const finalInit = {
        id,
        title: newSurvey.title,
        excerpt: newSurvey.excerpt,
        author: currentUser.lotNumber,
        date: new Date().toLocaleDateString('es-CO'),
        deadline: newSurvey.deadline,
        convertedToProject: false,
        image: imageUrl,
        survey: {
          question: newSurvey.question,
          requiresBudget: newSurvey.requiresBudget,
          budgetAmount: newSurvey.requiresBudget ? Number(newSurvey.budgetAmount) : null,
          options: validOptions.map((o, i) => ({ id: `opt${i}`, text: o.text })),
          votes: [],
        },
      }

      await saveInitiative(finalInit)
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-3xl font-black text-gray-800">Iniciativas y Votaciones</h2>
          <p className="text-gray-500 mt-1">Participa en las decisiones comunitarias.</p>
        </div>
        {canManageInitiatives && (
          <button
            type="button"
            onClick={() => {
              if (showCreateForm) cancelCreateOrEdit()
              else setShowCreateForm(true)
            }}
            className="bg-gray-900 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-gray-800 transition-colors"
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
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-sm animate-in slide-in-from-top-4">
          <h3 className="text-xl font-black flex items-center mb-6">
            <Sparkles className="w-5 h-5 text-amber-500 mr-2" /> {editingInitiativeId != null ? 'Editar votación' : 'Creador de Encuestas Asistido'}
          </h3>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <div className="flex justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-bold text-gray-700">Título de la iniciativa *</label>
                  <GeminiPolishButton
                    kind="initiative_title"
                    text={newSurvey.title}
                    onPolished={(t) => setNewSurvey({ ...newSurvey, title: t })}
                    showAlert={showAlert}
                    compact
                  />
                </div>
                <input
                  required
                  value={newSurvey.title}
                  onChange={(e) => setNewSurvey({ ...newSurvey, title: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-400"
                  placeholder="Ej: Construcción de parque infantil"
                />
              </div>
              <div className="md:col-span-2">
                <div className="flex justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-bold text-gray-700">Contexto / justificación *</label>
                  <GeminiPolishButton
                    kind="initiative_excerpt"
                    text={newSurvey.excerpt}
                    onPolished={(t) => setNewSurvey({ ...newSurvey, excerpt: t })}
                    showAlert={showAlert}
                    compact
                  />
                </div>
                <textarea
                  required
                  value={newSurvey.excerpt}
                  onChange={(e) => setNewSurvey({ ...newSurvey, excerpt: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-400 h-24"
                  placeholder="Explica los beneficios para la comunidad..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1.5">Fecha y Hora de Cierre *</label>
                <input
                  required
                  type="datetime-local"
                  value={newSurvey.deadline}
                  onChange={(e) => setNewSurvey({ ...newSurvey, deadline: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-400"
                />
              </div>

              <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSurvey.requiresBudget}
                    onChange={(e) => setNewSurvey({ ...newSurvey, requiresBudget: e.target.checked })}
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 mr-3"
                  />
                  <span className="font-bold text-gray-800">
                    Esta iniciativa requiere aprobación de presupuesto
                  </span>
                </label>
                {newSurvey.requiresBudget && (
                  <div className="pl-8">
                    <label className="block text-sm font-bold text-gray-600 mb-1.5">Monto estimado (COP) *</label>
                    <input
                      type="number"
                      required
                      value={newSurvey.budgetAmount}
                      onChange={(e) => setNewSurvey({ ...newSurvey, budgetAmount: e.target.value })}
                      className="w-full md:w-1/2 border border-gray-200 p-3 rounded-xl outline-none focus:border-gray-400"
                      placeholder="Ej: 5000000"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/80 mb-2">
              <label className="block text-sm font-bold text-gray-700 mb-2">Imagen de portada (opcional, 1 archivo)</label>
              <input
                type="file"
                accept="image/*"
                className="w-full text-sm font-medium text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  setCoverImageFile(f || null)
                }}
              />
              {coverImageFile && (
                <p className="text-xs text-gray-600 mt-2">
                  Seleccionada: {coverImageFile.name} ({Math.round(coverImageFile.size / 1024)} KB). Máx.{' '}
                  {Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB. Si no subes imagen, se usará el logo de Las Blancas.
                </p>
              )}
            </div>

            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
              <div className="flex justify-between items-start gap-2 mb-2">
                <label className="block text-base font-bold text-blue-900">Pregunta de la encuesta *</label>
                <GeminiPolishButton
                  kind="initiative_question"
                  text={newSurvey.question}
                  onPolished={(t) => setNewSurvey({ ...newSurvey, question: t })}
                  showAlert={showAlert}
                  compact
                />
              </div>
              <input
                required
                value={newSurvey.question}
                onChange={(e) => setNewSurvey({ ...newSurvey, question: e.target.value })}
                className="w-full border border-blue-200 p-3 rounded-xl mb-4 font-bold outline-none focus:border-blue-400"
                placeholder="Ej: ¿Estás de acuerdo con el presupuesto?"
              />

              <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <span className="block text-sm font-bold text-blue-800">Opciones de Respuesta</span>
                <button
                  type="button"
                  onClick={triggerAIAssistant}
                  disabled={isAnalyzing}
                  className="bg-white border border-blue-200 text-blue-700 px-4 py-2 rounded-lg font-bold text-sm flex items-center shadow-sm hover:bg-blue-50 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 mr-2 text-amber-500" />{' '}
                  {isAnalyzing ? 'Analizando...' : 'Sugerir con IA'}
                </button>
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
                className="w-full bg-gray-900 text-white p-4 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
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

      {(db.initiatives || []).length === 0 && !showCreateForm && (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
          <BarChart2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-700 font-bold text-lg mb-1">No hay votaciones ni iniciativas</p>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Cuando alguien proponga una encuesta, verás aquí el detalle y podrás votar. Usa &quot;Proponer
            Iniciativa&quot; para crear la primera.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {(db.initiatives || []).map((post) => {
          const { isClosed, formatted } = safeDateParse(post.deadline)
          const votes = post.survey?.votes || []
          const userVote = votes.find((v) => v.lot === currentUser.lotNumber)
          const isEditing = editingSurveys[post.id]
          const totalMembers = 89

          const coverSrc = post.image || NEWS_FALLBACK_IMAGE
          const voteImgIsFallback = isNewsFallbackImageUrl(coverSrc)
          return (
            <article key={post.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div
                className={`relative flex h-52 sm:h-64 shrink-0 items-center justify-center ${
                  voteImgIsFallback ? 'bg-gray-50 p-6 md:p-8' : 'bg-gray-100'
                }`}
              >
                <img
                  src={coverSrc}
                  className={`max-h-full max-w-full rounded-lg ${voteImgIsFallback ? 'object-contain' : 'h-full w-full object-cover'} ${isClosed ? 'grayscale opacity-80' : ''}`}
                  alt=""
                />
                <span
                  className={`absolute top-4 left-4 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${isClosed ? 'bg-gray-800' : 'bg-emerald-600'}`}
                >
                  {isClosed ? 'Votación Finalizada' : 'Activa'}
                </span>
              </div>
              <div className="p-6 md:p-8 flex-1 flex flex-col gap-4">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">{post.title}</h3>
                <div className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 gap-4">
                  <span className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
                    <User className="w-3.5 h-3.5 mr-1" />
                    {post.author === currentUser.lotNumber ? 'Tú' : post.author}
                  </span>
                  <span className="flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    {post.date}
                  </span>
                </div>
                <p className="text-gray-600 mb-4 text-sm flex-1">{post.excerpt}</p>

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

                {isClosed || (userVote && !isEditing) ? (
                  <div className="bg-[#f0f2f5] rounded-2xl border border-gray-200 mt-auto overflow-hidden">
                    <div className="bg-white p-5 border-b border-gray-200">
                      <div className="flex items-center mb-1">
                        <ArrowLeft className="w-5 h-5 text-gray-500 mr-3 shrink-0" aria-hidden />
                        <span className="font-bold text-gray-800 text-lg">Votos de la encuesta</span>
                      </div>
                      <h4 className="font-medium text-gray-900 text-[15px] leading-snug mt-2 flex items-start">
                        <BarChart2 className="w-4 h-4 text-gray-400 mr-2 shrink-0 mt-0.5" />
                        {post.survey?.question}
                      </h4>
                      <p className="text-xs text-gray-500 mt-2 font-medium">
                        {votes.length} de {totalMembers} miembros votaron.
                      </p>
                    </div>

                    <div className="divide-y divide-gray-100">
                      {(post.survey?.options || []).map((opt) => {
                        const vts = votes.filter((v) => v.optionId === opt.id)
                        const maxVts = Math.max(
                          ...(post.survey?.options || []).map((o) => votes.filter((vo) => vo.optionId === o.id).length),
                          0,
                        )
                        const isWinner = vts.length > 0 && vts.length === maxVts
                        const isSelectedByMe = userVote?.optionId === opt.id

                        return (
                          <div key={opt.id} className="bg-white p-4">
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-medium text-gray-900 text-[15px] flex items-start">
                                {isSelectedByMe && (
                                  <div className="bg-emerald-500 rounded-sm w-4 h-4 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                                {opt.text}
                              </span>
                              <div className="flex items-center text-sm font-medium text-gray-500 shrink-0 ml-4">
                                {vts.length} {isWinner && <span className="text-gray-400 ml-1.5 text-sm">★</span>}
                              </div>
                            </div>

                            <div className="space-y-3 pl-6">
                              {vts.map((v, i) => (
                                <div key={i} className="flex items-center">
                                  <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden mr-3 shrink-0">
                                    <User className="w-5 h-5 text-gray-400 mx-auto mt-1.5" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[14px] font-bold text-gray-900 leading-tight">
                                      {v.lot === currentUser.lotNumber ? 'Tú' : v.lot}
                                    </span>
                                    <span className="text-xs text-gray-500 mt-0.5">{v.timestamp}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-2 justify-end">
                      {userVote && !isClosed && (
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
                      {isClosed && canManageInitiatives && !post.convertedToProject && (
                        <button
                          type="button"
                          onClick={() => handleConvertToProject(post)}
                          className="text-white bg-blue-600 font-bold text-sm px-4 py-2 hover:bg-blue-700 rounded-lg transition-colors flex items-center"
                        >
                          <Rocket className="w-4 h-4 mr-2" /> Convertir en Proyecto
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mt-auto rounded-2xl p-6 border transition-colors ${isEditing ? 'bg-amber-50/50 border-amber-200' : 'bg-blue-50/30 border-blue-100'}`}
                  >
                    <h4 className="font-bold text-gray-900 text-lg mb-2 flex items-start">
                      <BarChart2
                        className={`w-5 h-5 mr-2 shrink-0 mt-0.5 ${isEditing ? 'text-amber-500' : 'text-blue-500'}`}
                      />
                      {post.survey?.question}
                    </h4>
                    <p className="text-xs font-bold text-gray-500 mb-5 ml-7 flex items-center">
                      <Clock className="w-4 h-4 mr-1.5 text-gray-400" /> Cierra: {formatted}
                    </p>
                    <div className="space-y-2 mb-6">
                      {(post.survey?.options || []).map((opt) => {
                        const isSelected = selectedOptions[post.id] === opt.id
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center p-4 bg-white border rounded-xl cursor-pointer transition-all shadow-sm ${isSelected ? (isEditing ? 'border-amber-400' : 'border-blue-400') : 'border-gray-200 hover:border-gray-300'}`}
                          >
                            <input
                              type="radio"
                              name={`vote-${post.id}`}
                              checked={isSelected}
                              onChange={() => setSelectedOptions((p) => ({ ...p, [post.id]: opt.id }))}
                              className={`w-5 h-5 ${isEditing ? 'text-amber-600' : 'text-blue-600'}`}
                            />
                            <span className={`ml-3 font-bold ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                              {opt.text}
                            </span>
                          </label>
                        )
                      })}
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
                          className="flex-1 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {canManageInitiatives && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {!isClosed && (
                      <button
                        type="button"
                        onClick={() => handleFinalizeInitiative(post)}
                        className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100"
                      >
                        <Check className="w-4 h-4 mr-1.5" /> Finalizar votación
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
    onApply(fund.id, { raised: raisedNum, goal: goalNum })
    showAlert('Montos guardados correctamente.')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 p-4 md:p-5 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 to-white space-y-4"
    >
      <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">
        {hasBudget ? 'Actualizar recaudo y meta (administrador)' : 'Actualizar recaudo y valor total (administrador)'}
      </p>
      <p className="text-xs text-gray-700 leading-relaxed border-l-4 border-blue-400 pl-3 py-0.5 bg-white/80 rounded-r-lg">
        {COP_AMOUNT_INPUT_HINT}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-w-0">
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Recaudado (COP)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={raised}
            onChange={(e) => setRaised(copDigitsFromInput(e.target.value))}
            placeholder="0"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white font-mono tracking-tight"
          />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-bold text-gray-700 mb-1.5">
            {hasBudget ? 'Meta de recaudo (COP)' : 'Valor total del proyecto (COP)'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={goal}
            onChange={(e) => setGoal(copDigitsFromInput(e.target.value))}
            placeholder={hasBudget ? 'Ej: 5000000' : '0'}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white font-mono tracking-tight"
          />
        </div>
      </div>
      {!hasBudget && (
        <p className="text-xs text-gray-600">
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
}) => {
  const canManageFunds = isAdminLike(currentUser)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingFundId, setEditingFundId] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSubmittingFund, setIsSubmittingFund] = useState(false)
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    requiresBudget: true,
    goal: '',
  })

  const handleStatusChange = (id, val) => {
    updateFundStatus(id, val).catch((err) => {
      console.error(err)
      showAlert('No se pudo actualizar el estado del proyecto.')
    })
    logAction('MODIFICAR_PROYECTO', `Cambió estado a: ${val}`)
  }

  const handleApplyAmounts = (id, { raised, goal }) => {
    updateFundRaisedGoal(id, raised, goal).catch((err) => {
      console.error(err)
      showAlert('No se pudo guardar montos.')
    })
    const f = (db.funds || []).find((x) => x.id === id)
    logAction(
      'ACTUALIZAR_FONDOS',
      `${f?.name || id}: recaudo ${formatCurrency(raised)}, meta ${formatCurrency(goal)}`,
    )
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
    setIsSubmittingFund(true)
    try {
      let imageUrl = NEWS_FALLBACK_IMAGE
      if (editingExisting) {
        const prev = (db.funds || []).find((f) => f.id === editingFundId)
        imageUrl = prev?.image || NEWS_FALLBACK_IMAGE
      }
      if (coverImageFile) {
        imageUrl = await uploadEntityCoverImage(coverImageFile, 'funds', id)
      }

      const finalProject = {
        id,
        name: newProject.name,
        description: newProject.description,
        requiresBudget: newProject.requiresBudget,
        goal: newProject.requiresBudget ? parseCopIntegerFromDigits(newProject.goal) : 0,
        raised: 0,
        status: 'Pendiente de iniciar',
        image: imageUrl,
      }

      await addFund(finalProject)
      logAction(editingExisting ? 'EDITAR_PROYECTO' : 'CREAR_PROYECTO', `${editingExisting ? 'Editó' : 'Creó'} proyecto: ${finalProject.name}`)
      setShowCreateForm(false)
      setEditingFundId(null)
      setCoverImageFile(null)
      setNewProject({ name: '', description: '', requiresBudget: true, goal: '' })
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

  const statusOptions = [
    'Pendiente de iniciar',
    'En recolección de fondos',
    'En progreso',
    'Terminado',
    'Aprobado',
  ]

  const startEditFund = (fund) => {
    setEditingFundId(fund.id)
    setShowCreateForm(true)
    setCoverImageFile(null)
    setNewProject({
      name: fund.name || '',
      description: fund.description || '',
      requiresBudget: fund.requiresBudget !== false,
      goal: fund.requiresBudget !== false ? copDigitsFromInput(String(fundAmountFromDb(fund.goal))) : '',
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
          <h2 className="text-3xl font-black text-gray-800">Proyectos y Fondos</h2>
          <p className="text-gray-500 mt-1">Costo, recaudo y estado de los proyectos actuales.</p>
        </div>
        {canManageFunds && (
          <button
            type="button"
            onClick={() => {
              if (showCreateForm) {
                setShowCreateForm(false)
                setEditingFundId(null)
                setCoverImageFile(null)
                setNewProject({ name: '', description: '', requiresBudget: true, goal: '' })
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
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-blue-100 shadow-sm animate-in slide-in-from-top-4">
          <h3 className="text-xl font-black flex items-center mb-6 text-blue-900">
            <TrendingUp className="w-5 h-5 text-blue-500 mr-2" /> {editingFundId != null ? 'Editar Proyecto o Fondo' : 'Nuevo Proyecto o Fondo'}
          </h3>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <div className="flex justify-between items-center gap-2 mb-1.5">
                  <label className="block text-sm font-bold text-gray-700">Nombre del proyecto *</label>
                  <GeminiPolishButton
                    kind="fund_name"
                    text={newProject.name}
                    onPolished={(t) => setNewProject({ ...newProject, name: t })}
                    showAlert={showAlert}
                    compact
                  />
                </div>
                <input
                  required
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-400"
                  placeholder="Ej: Poda de zonas verdes"
                />
              </div>
              <div className="md:col-span-2">
                <div className="flex justify-between items-end mb-1.5 gap-2 flex-wrap">
                  <label className="block text-sm font-bold text-gray-700">Descripción *</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <GeminiPolishButton
                      kind="fund_description"
                      text={newProject.description}
                      onPolished={(t) => setNewProject({ ...newProject, description: t })}
                      showAlert={showAlert}
                      compact
                    />
                    <button
                      type="button"
                      onClick={() => void triggerAIAssistantDesc()}
                      disabled={isAnalyzing}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 mr-1 text-amber-500" />
                      {isAnalyzing ? 'Pensando...' : 'Desde el título'}
                    </button>
                  </div>
                </div>
                <textarea
                  required
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full border border-gray-200 p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-400 h-24"
                  placeholder="Describe el alcance del proyecto..."
                />
              </div>
              <div className="md:col-span-2 border border-gray-200 rounded-xl p-4 bg-gray-50/80">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Imagen de portada (opcional, 1 archivo, máx. {Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm font-medium text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-bold"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    setCoverImageFile(f || null)
                  }}
                />
                {coverImageFile && (
                  <p className="text-xs text-gray-600 mt-2">
                    {coverImageFile.name} — si no eliges archivo se usará el logo de Las Blancas.
                  </p>
                )}
              </div>
              <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newProject.requiresBudget}
                    onChange={(e) => setNewProject({ ...newProject, requiresBudget: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mr-3"
                  />
                  <span className="font-bold text-gray-800">Este proyecto tiene una meta de recaudo económico</span>
                </label>
                {newProject.requiresBudget && (
                  <div className="pl-8 space-y-2">
                    <label className="block text-sm font-bold text-gray-600">Meta de recaudo (COP) *</label>
                    <p className="text-xs text-gray-600 leading-relaxed max-w-xl">{COP_AMOUNT_INPUT_HINT}</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      value={newProject.goal}
                      onChange={(e) =>
                        setNewProject({ ...newProject, goal: copDigitsFromInput(e.target.value) })
                      }
                      className="w-full md:max-w-md border border-gray-200 p-3 rounded-xl outline-none focus:border-gray-400 font-mono font-bold tabular-nums"
                      placeholder="2000000"
                    />
                  </div>
                )}
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
          <p className="text-gray-700 font-bold text-lg mb-1">No hay proyectos ni fondos registrados</p>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Los proyectos de recaudo y obras aparecerán aquí. Si eres administrador, usa &quot;Crear Proyecto&quot;.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {(db.funds || []).map((fund) => {
          const requiresBudget = fund.requiresBudget !== false
          const goalNum = fundAmountFromDb(fund.goal)
          const raisedNum = fundAmountFromDb(fund.raised)
          const pct = goalNum > 0 ? (raisedNum / goalNum) * 100 : 0
          const fundCover = fund.image || NEWS_FALLBACK_IMAGE
          const fundCoverIsFallback = isNewsFallbackImageUrl(fundCover)
          const goalLooksLikeDecimalBug =
            requiresBudget &&
            goalNum > 0 &&
            goalNum < 1000 &&
            typeof fund.goal === 'number' &&
            !Number.isInteger(fund.goal)
          return (
            <div
              key={fund.id}
              className="bg-white rounded-3xl p-5 sm:p-7 md:p-8 shadow-sm border border-gray-100 flex flex-col xl:flex-row gap-6 xl:gap-10 items-stretch"
            >
              <div className="w-full xl:w-[min(100%,24rem)] shrink-0">
                <div
                  className={`rounded-2xl border border-gray-100 bg-gradient-to-b from-slate-50 to-slate-100/80 flex items-center justify-center aspect-[4/3] sm:aspect-[16/10] xl:aspect-auto xl:min-h-[220px] xl:max-h-[320px] ${
                    fundCoverIsFallback ? 'p-8 sm:p-10' : 'p-3 sm:p-5'
                  }`}
                >
                  <img
                    src={fundCover}
                    alt=""
                    className={`max-h-full rounded-lg shadow-sm object-center ${
                      fundCoverIsFallback
                        ? 'max-w-[min(100%,220px)] w-full object-contain sm:scale-105'
                        : 'max-w-full w-full h-full object-contain'
                    }`}
                  />
                </div>
              </div>
              <div className="flex-1 w-full min-w-0 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-800 leading-snug pr-2">{fund.name}</h3>
                  {canManageFunds ? (
                    <select
                      value={fund.status}
                      onChange={(e) => handleStatusChange(fund.id, e.target.value)}
                      className="bg-white border border-gray-200 text-sm font-bold text-gray-700 px-3 py-2 rounded-lg outline-none focus:border-blue-500 shrink-0 max-w-full sm:max-w-[14rem]"
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="inline-block px-4 py-1.5 rounded-lg text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 shrink-0 w-fit">
                      {fund.status}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">{fund.description}</p>
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

                <div className="rounded-2xl border border-gray-200/80 bg-slate-50/60 p-4 md:p-6">
                  <div className="flex flex-col lg:flex-row lg:items-stretch gap-8 lg:gap-10">
                    {requiresBudget && goalNum > 0 && (
                      <div className="flex justify-center lg:justify-start shrink-0 lg:pt-1">
                        <div className="relative flex h-[168px] w-[168px] items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm ring-1 ring-gray-100/80">
                          <FundCircularWithCelebration
                            fundId={fund.id}
                            percentage={pct}
                            colorClass={pct >= 100 ? 'text-emerald-500' : 'text-blue-500'}
                            textClass={pct >= 100 ? 'text-emerald-700' : 'text-gray-800'}
                          />
                        </div>
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div className="bg-white rounded-xl p-4 md:p-5 border border-gray-100 shadow-sm min-w-0">
                          <p className="text-xs font-bold text-gray-500 uppercase mb-2 tracking-wide">Recaudado</p>
                          <p
                            className={`text-lg sm:text-xl md:text-2xl font-black tabular-nums tracking-tight break-all leading-snug ${requiresBudget && pct >= 100 ? 'text-emerald-600' : 'text-gray-900'}`}
                          >
                            {formatCurrency(raisedNum)}
                          </p>
                        </div>
                        <div className="bg-white rounded-xl p-4 md:p-5 border border-gray-100 shadow-sm min-w-0">
                          <p className="text-xs font-bold text-gray-500 uppercase mb-2 tracking-wide">
                            {requiresBudget ? 'Meta de recaudo' : 'Valor total del proyecto'}
                          </p>
                          <p className="text-lg sm:text-xl md:text-2xl font-black text-gray-900 tabular-nums tracking-tight break-all leading-snug">
                            {formatCurrency(goalNum)}
                          </p>
                        </div>
                      </div>
                      {requiresBudget && goalNum > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      )}
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
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [professionKeyword, setProfessionKeyword] = useState('')
  const [aiIntent, setAiIntent] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

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
    setAiIntent('')
  }, [type])

  const categoriesInData = useMemo(() => {
    const set = new Set()
    table.forEach((i) => {
      const c = (i.category || '').trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [table])

  const professionChips = useMemo(() => {
    const counts = {}
    table.forEach((i) => {
      const p = (i.profession || '').trim()
      if (p) counts[p] = (counts[p] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      .slice(0, 12)
      .map(([p]) => p)
  }, [table])

  const resolveCategoryFromAi = useCallback(
    (raw) => {
      const t = (raw || '').trim()
      if (!t) return ''
      const exact = categoriesInData.find((c) => c.toLowerCase() === t.toLowerCase())
      if (exact) return exact
      const partial = categoriesInData.find(
        (c) => c.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(c.toLowerCase()),
      )
      return partial || ''
    },
    [categoriesInData],
  )

  const applyDirectoryAi = async () => {
    if (!aiIntent.trim()) {
      showAlert('Escribe qué quieres ver (por ejemplo: solo salud, ordenados por nombre).')
      return
    }
    if (!isGeminiConfigured()) {
      showAlert('Configura VITE_GEMINI_API_KEY en .env para usar el asistente.')
      return
    }
    setAiBusy(true)
    const summary = isServices
      ? `Categorías en los datos: ${categoriesInData.join(', ') || '(ninguna aún)'}. Ejemplos: ${table
          .slice(0, 6)
          .map((i) => `${i.name} [${i.category}]`)
          .join('; ')}`
      : `Profesiones frecuentes: ${professionChips.join(', ') || '(ninguna)'}. Ejemplos: ${table
          .slice(0, 8)
          .map((i) => `${i.lot}: ${i.name} — ${i.profession}`)
          .join('; ')}`
    const pref = await fetchGeminiDirectoryPreferences(isServices ? 'services' : 'community', aiIntent, summary)
    setAiBusy(false)
    if (!pref) {
      const d = getLastGeminiDetail()
      showAlert(
        d
          ? `La IA no pudo interpretar la petición. ${d} Revisa la clave o prueba otra frase.`
          : 'La IA no devolvió un resultado válido. Prueba otra frase o revisa .env.',
      )
      return
    }
    setSortBy(pref.sortBy)
    if (isServices) setCategoryFilter(resolveCategoryFromAi(pref.filter))
    else setProfessionKeyword(pref.filter)
    showAlert('Listo: filtros y orden aplicados según tu indicación.')
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
    const q = search.toLowerCase().trim()
    const matchesSearch = (i) =>
      !q ||
      [i.name, i.category, i.profession, i.lot, i.desc, i.contactPref].some((f) =>
        String(f || '').toLowerCase().includes(q),
      )

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
          <h2 className="text-3xl font-black text-gray-800">{title}</h2>
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
          className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-sm"
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
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre o palabra clave..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 p-4 rounded-xl border border-gray-200 outline-none focus:border-gray-900 bg-white"
        />
      </div>

      <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-5 md:p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <ListFilter className="w-4 h-4 text-emerald-600" />
            {isServices ? 'Categoría' : 'Rubro / lote'}
          </span>
          {!isServices && professionKeyword && (
            <button
              type="button"
              onClick={() => setProfessionKeyword('')}
              className="text-xs font-bold text-emerald-700 hover:underline"
            >
              Limpiar filtro
            </button>
          )}
        </div>
        {isServices ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                !categoryFilter
                  ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              Todas
            </button>
            {categoriesInData.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                  categoryFilter === cat
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-white text-gray-800 border-gray-200 hover:border-emerald-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setProfessionKeyword('')}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                !professionKeyword
                  ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              Todos
            </button>
            {professionChips.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProfessionKeyword(p)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-all max-w-[220px] truncate ${
                  professionKeyword === p
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-white text-gray-800 border-gray-200 hover:border-emerald-300'
                }`}
                title={p}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-gray-200/80 pt-4">
          <span className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2 mb-3">
            <ArrowDownAZ className="w-4 h-4 text-emerald-600" />
            Ordenar
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                sortBy === 'name'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              Por nombre
            </button>
            <button
              type="button"
              onClick={() => setSortBy('lot')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                sortBy === 'lot'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
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
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                }`}
              >
                Por profesión
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200/80 pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-xs font-black uppercase tracking-widest text-gray-500">Asistente IA</span>
          </div>
          <p className="text-xs text-gray-500">
            Describe en una frase cómo quieres filtrar y ordenar (por ejemplo: «solo mantenimiento, orden alfabético»).
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={aiIntent}
              onChange={(e) => setAiIntent(e.target.value)}
              disabled={aiBusy}
              placeholder="Ej.: vecinos de la etapa A ordenados por oficio"
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-gray-900 bg-white/90 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => void applyDirectoryAi()}
              className="shrink-0 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-5 py-3 rounded-xl border border-amber-600 shadow-sm disabled:opacity-50"
            >
              {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Aplicar con IA
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-sm animate-in slide-in-from-top-4">
          <h3 className="font-bold text-xl mb-6">{editId ? 'Modificar Registro' : 'Nuevo Registro'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold mb-1.5 text-gray-700">Nombre *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5 text-gray-700">Teléfono *</label>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-900"
              />
            </div>
            {isServices ? (
              <>
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-gray-700">Categoría *</label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-900"
                  >
                    <option value="">Selecciona...</option>
                    <option value="Salud">Salud</option>
                    <option value="Seguridad">Seguridad</option>
                    <option value="Mantenimiento">Mantenimiento</option>
                    <option value="Domicilios">Domicilios</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-gray-700">Descripción breve</label>
                  <input
                    value={form.desc}
                    onChange={(e) => setForm({ ...form, desc: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-900"
                  />
                </div>
              </>
            ) : (
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-gray-700">Profesión u Oficio *</label>
                  <input
                    required
                    value={form.profession}
                    onChange={(e) => setForm({ ...form, profession: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-gray-50 outline-none focus:border-gray-900"
                  />
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
                    Preferencia de contacto
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, contactPref: 'Servicios' })}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${
                        (form.contactPref || 'Servicios') === 'Servicios'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
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
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      Servicios y emergencias
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Esto solo informa a los vecinos cómo prefieres que te contacten.
                  </p>
                </div>
              </div>
            )}
            <div className="md:col-span-2 flex justify-end pt-2">
              <button type="submit" className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold">
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
              className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative pt-10 mt-2 flex flex-col"
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
              <h4 className="text-xl font-bold text-gray-900 mb-1">{item.name}</h4>
              <p className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-5">
                {isServices ? item.desc : `${item.profession}${item.contactPref ? ` · ${item.contactPref}` : ''}`}
              </p>
              <div className="mt-auto">
                <a
                  href={`tel:${item.phone}`}
                  className="flex justify-center items-center w-full bg-gray-50 py-3 rounded-xl font-bold border border-gray-200 text-gray-800 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                >
                  <Phone className="w-4 h-4 mr-2" /> {item.phone}
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {table.length === 0 && !showForm && (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
          {isServices ? (
            <Phone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          ) : (
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          )}
          <p className="text-gray-700 font-bold text-lg mb-1">
            {isServices ? 'No hay servicios en el directorio' : 'No hay vecinos registrados en la comunidad'}
          </p>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            {isServices
              ? 'Añade contactos útiles (salud, mantenimiento, etc.) con el botón «Añadir registro».'
              : 'Comparte oficios y datos de contacto con «Añadir registro».'}
          </p>
        </div>
      )}
      {table.length > 0 && filteredSorted.length === 0 && (
        <p className="text-center text-gray-500 font-medium py-8">No hay resultados para tu búsqueda o filtros.</p>
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
          <h2 className="text-3xl font-black text-gray-800">Mapa de Las Blancas</h2>
          <p className="text-gray-500 text-sm mt-1">Planos oficiales por etapa.</p>
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
          className="rounded-2xl border border-emerald-200 bg-white p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Nombre de etapa *</label>
            <input
              required
              value={mapLabelDraft}
              onChange={(e) => setMapLabelDraft(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 outline-none focus:border-emerald-500"
              placeholder="Ej: Etapa C"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">URL de imagen (opcional)</label>
            <input
              value={mapUrlDraft}
              onChange={(e) => setMapUrlDraft(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 outline-none focus:border-emerald-500"
              placeholder="https://..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Subir imagen (opcional, reemplaza URL)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                setMapImageFile(f || null)
              }}
              className="w-full text-sm font-medium text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold"
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
            {editingMapId && (
              <button
                type="button"
                onClick={resetMapForm}
                className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-bold hover:bg-gray-50"
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

      <div className="flex rounded-xl bg-white border border-gray-200 p-1 shadow-sm w-fit flex-wrap">
          {mapLayers.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActiveLayer(l.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                activeLayer === l.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {l.label}
            </button>
          ))}
      </div>
      {canManageMaps && (
        <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Gestión de mapas por etapa</p>
          <div className="flex flex-wrap gap-2">
            {mapLayers.map((m) => (
              <div key={`map-admin-${m.id}`} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
                <span className="text-xs font-bold text-gray-700">{m.label}</span>
                <button type="button" onClick={() => startEditMap(m)} className="text-emerald-700 hover:text-emerald-900">
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
        <p className="text-xs text-gray-500 -mt-2 md:hidden">Toca el plano para verlo en pantalla completa, zoom y descarga.</p>
      )}
      <div className="rounded-3xl border border-gray-200 bg-gray-100 flex-1 w-full min-h-[min(52vh,480px)] flex items-center justify-center p-3 sm:p-5 md:p-8">
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
            className="max-w-full max-h-[min(75vh,820px)] w-auto h-auto object-contain object-center animate-in fade-in duration-300 pointer-events-none"
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
    if (next.trim().length < 4) return showAlert('Usa al menos 4 caracteres para la nueva contraseña.')
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
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-xs font-bold text-gray-700"
      >
        <span className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" /> Cambiar contraseña
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-[10px] leading-snug text-gray-500">
            La clave se guarda en Firestore en texto plano (igual que el login). Cada cambio usa una lectura y una
            escritura; en el plan gratuito suele ser de coste despreciable.
          </p>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña actual"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium outline-none focus:border-emerald-500"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nueva contraseña"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium outline-none focus:border-emerald-500"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repetir nueva contraseña"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium outline-none focus:border-emerald-500"
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
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
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar lote…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium outline-none focus:border-rose-400"
          />
          <select
            value={targetLot}
            onChange={(e) => setTargetLot(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold outline-none focus:border-rose-400 bg-white"
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
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium outline-none focus:border-rose-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar nueva clave'}
          </button>
          <p className="text-[10px] text-gray-500 leading-snug">
            Esto requiere reglas de Firestore que permitan a superadmin editar `users/*`. Sin reglas adecuadas fallará.
          </p>
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

  useEffect(() => {
    let unsub = () => {}
    let cancelled = false
    ;(async () => {
      try {
        await seedFirestoreIfEmpty()
        await syncUsersIfNeeded()
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
      if (user) {
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
  }

  const showAlert = (message) => setDialog({ type: 'alert', message })
  const showConfirm = (message, onConfirm) => setDialog({ type: 'confirm', message, onConfirm })

  if (!dataReady || !sessionRehydrated) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" aria-hidden />
          <p className="text-gray-600 font-bold">
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
    { id: 'funds', label: 'Proyectos y Fondos', icon: TrendingUp },
    { id: 'map', label: 'Mapa', icon: MapIcon },
    { id: 'services', label: 'Servicios', icon: Phone },
    { id: 'community', label: 'Comunidad', icon: Users },
  ]

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans text-gray-900">
      {dialog && (
        <div
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-dialog-title"
        >
          <div className="bg-white rounded-[2rem] p-6 md:p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center mb-4">
              {dialog.type === 'alert' ? (
                <Info className="w-8 h-8 text-blue-500 mr-3 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="w-8 h-8 text-amber-500 mr-3 shrink-0" aria-hidden />
              )}
              <h3 id="portal-dialog-title" className="text-2xl font-black text-gray-900">
                {dialog.type === 'alert' ? 'Aviso' : 'Confirmar acción'}
              </h3>
            </div>
            <p className="text-gray-600 mb-8 font-medium text-lg leading-snug">{dialog.message}</p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              {dialog.type === 'confirm' && (
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="px-6 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors w-full sm:w-auto"
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
                className={`px-8 py-3 rounded-xl font-black text-white shadow-md transition-colors w-full sm:w-auto ${dialog.type === 'alert' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
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
          className="fixed inset-0 bg-gray-900/50 z-40 md:hidden transition-opacity border-0 p-0 cursor-pointer w-full h-full"
          aria-label="Cerrar menú"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 ease-out md:relative md:translate-x-0 flex flex-col ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 object-contain shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-emerald-800 leading-tight">
              Portal Comunitario
              <span className="block text-sm sm:text-base text-emerald-900/90">Las Blancas</span>
            </h1>
          </div>
          <button type="button" className="md:hidden bg-gray-50 p-2 rounded-xl" onClick={() => setIsMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 flex-1 space-y-1.5 overflow-y-auto">
          {menu.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id)
                setIsMenuOpen(false)
              }}
              className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-colors ${activeTab === item.id ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <item.icon className={`w-5 h-5 mr-3 ${activeTab === item.id ? 'text-emerald-600' : 'text-gray-400'}`} />{' '}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-6 bg-gray-50 border-t border-gray-100 space-y-3">
          <div className="flex items-start gap-3 mb-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center font-black text-emerald-900 shrink-0 text-xs">
              {currentUser.shortLot}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">{currentUser.lotNumber}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-0.5">
                {currentUser.role === 'superadmin'
                  ? 'Super Admin'
                  : currentUser.role === 'admin'
                    ? 'Administrador'
                    : 'Propietario'}
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
              clearPortalSession()
              setCurrentUser(null)
              setActiveTab('news')
            }}
            className="w-full bg-white border border-gray-200 text-gray-600 py-3 rounded-xl font-bold flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors text-xs shadow-sm"
          >
            <LogOut className="w-4 h-4 mr-2" /> Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="bg-white border-b border-gray-200 p-4 flex items-center justify-between md:hidden shrink-0 z-30 sticky top-0">
          <button type="button" onClick={() => setIsMenuOpen(true)} className="mr-4 bg-gray-50 p-2 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain shrink-0" />
            <h1 className="font-black text-gray-800 text-xs leading-tight text-center max-w-[180px] sm:max-w-[220px]">
              {SITE_BRAND_TITLE}
            </h1>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-xs shadow-sm">
            {currentUser?.shortLot}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth flex flex-col">
          <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0">
            <div className="flex-1">
            {activeTab === 'dashboard' && (
              <DashboardView currentUser={currentUser} db={db} setActiveTab={setActiveTab} />
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
              />
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
