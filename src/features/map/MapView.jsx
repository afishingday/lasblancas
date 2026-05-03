import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  PlusCircle,
  ZoomIn,
  ZoomOut,
  Download,
  X,
  Check,
  Edit3,
  Trash2,
  Loader2,
} from 'lucide-react'
import { isAdminLike } from '../../shared/utils.js'
import { TENANT } from '../../tenant.config.js'
import { uploadEntityCoverImage, MAX_ENTITY_IMAGE_BYTES } from '../../firestore/uploadEntityImage.js'
import { MAX_IMAGE_SOURCE_BYTES } from '../../firestore/uploadNewsImage.js'
import { ImageCropDialog } from '../../shared/ImageCropDialog.jsx'
import mapEtapaa from '../../../images/etapaa.jpeg'
import mapEtapab from '../../../images/etapab.jpeg'

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
  const [activeMapCropFile, setActiveMapCropFile] = useState(null)
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
    setActiveMapCropFile(null)
  }

  const startEditMap = (mapLayer) => {
    setShowMapForm(true)
    setEditingMapId(mapLayer.id)
    setMapLabelDraft(mapLayer.label || '')
    setMapUrlDraft(mapLayer.src || '')
    setMapImageFile(null)
    setActiveMapCropFile(null)
  }

  const handleMapImagePicked = (f) => {
    if (!f) return
    if (f.size > MAX_IMAGE_SOURCE_BYTES) {
      showAlert(
        `La imagen supera los ${Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024))} MB y no se puede procesar.`,
      )
      return
    }
    setActiveMapCropFile(f)
  }

  const handleMapCropConfirm = (croppedFile) => {
    setMapImageFile(croppedFile)
    setActiveMapCropFile(null)
  }

  const handleMapCropCancel = () => {
    setActiveMapCropFile(null)
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
      <ImageCropDialog
        open={activeMapCropFile !== null}
        file={activeMapCropFile}
        title="Recortar imagen del plano"
        onConfirm={handleMapCropConfirm}
        onCancel={handleMapCropCancel}
      />
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
          <h2 className="text-3xl font-black text-stone-800">Mapa de {TENANT.name}</h2>
          <p className="text-stone-600 text-sm mt-1">Planos oficiales por etapa.</p>
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
          onSubmit={(e) => void handleSaveMap(e)}
          className="rounded-2xl border border-emerald-200/60 bg-white backdrop-blur p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1.5">Nombre de etapa *</label>
            <input
              required
              value={mapLabelDraft}
              onChange={(e) => setMapLabelDraft(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50 outline-none focus:border-emerald-500"
              placeholder="Ej: Etapa C"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1.5">URL de imagen (opcional)</label>
            <input
              value={mapUrlDraft}
              onChange={(e) => setMapUrlDraft(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50 outline-none focus:border-emerald-500"
              placeholder="https://..."
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-stone-800 mb-1.5">
              Subir imagen (opcional, reemplaza URL; podrás recortar como en Información de Interés; máx.{' '}
              {Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024))} MB de origen)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) handleMapImagePicked(f)
              }}
              className="w-full text-sm font-medium text-stone-800 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold"
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
            {editingMapId && (
              <button
                type="button"
                onClick={resetMapForm}
                className="px-4 py-2 rounded-xl border border-stone-200 bg-white text-stone-800 text-xs font-bold hover:bg-stone-50"
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

      <div className="flex rounded-xl bg-white/80 backdrop-blur border border-stone-200 p-1 shadow-sm w-fit flex-wrap">
        {mapLayers.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setActiveLayer(l.id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              activeLayer === l.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-stone-800 hover:bg-stone-50'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {canManageMaps && (
        <div className="rounded-2xl border border-stone-200 bg-white backdrop-blur p-3 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-600">Gestión de mapas por etapa</p>
          <div className="flex flex-wrap gap-2">
            {mapLayers.map((m) => (
              <div key={`map-admin-${m.id}`} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-1.5 bg-white/60">
                <span className="text-xs font-bold text-stone-800">{m.label}</span>
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
        <p className="text-xs text-stone-600 -mt-2 md:hidden">Toca el plano para verlo en pantalla completa, zoom y descarga.</p>
      )}
      <div className="rounded-3xl border border-stone-200 bg-stone-100 flex-1 w-full min-h-[min(52vh,480px)] flex items-center justify-center p-3 sm:p-5 md:p-8">
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
            alt={`Plano de ${TENANT.name} — ${layer.label}`}
            className="max-w-full max-h-[min(75vh,820px)] w-auto h-auto object-contain object-center animate-in fade-in duration-300 pointer-events-none rounded-xl shadow-lg ring-1 ring-black/5 bg-white/60"
            decoding="async"
          />
        </button>
      </div>
    </div>
  )
}

export default MapView
