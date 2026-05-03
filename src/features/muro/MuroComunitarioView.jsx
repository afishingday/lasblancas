import { useState, useEffect, useMemo } from 'react'
import { PlusCircle, Trash2, UploadCloud, Loader2, Camera } from 'lucide-react'
import { isAdminLike } from '../../shared/utils.js'
import { TENANT } from '../../tenant.config.js'
import { trackPortalEvent } from '../../analytics.js'
import {
  MAX_NEWS_IMAGE_BYTES,
  MAX_IMAGE_SOURCE_BYTES,
  isNewsFallbackImageUrl,
  uploadSharingImageFile,
} from '../../firestore/uploadNewsImage.js'
import ReactionBar, { EMPTY_REACTIONS } from '../../shared/ReactionBar.jsx'
import { ImageCropDialog } from '../../shared/ImageCropDialog.jsx'

const CATEGORIES = ['General', 'Cultivos', 'Animales', 'Paisajes', 'Recetas']
const MAX_SHARING_IMAGES = 3

function SharingThumb({ file }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  if (!src) return <div className="h-full w-full bg-stone-200 rounded-lg" />
  return <img src={src} alt="" className="h-full w-full object-cover rounded-lg" />
}

const emptyForm = () => ({ category: 'General', body: '', mediaItems: [] })

export default function MuroComunitarioView({
  currentUser,
  db,
  addSharingPost,
  deleteSharingPost,
  logAction,
  showAlert,
  showConfirm,
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState(null)
  const [activeCropFile, setActiveCropFile] = useState(null)
  const [cropQueue, setCropQueue] = useState([])

  const posts = useMemo(() => {
    const all = db.sharing || []
    if (!filterCategory) return all
    return all.filter((p) => p.category === filterCategory)
  }, [db.sharing, filterCategory])

  const handlePickedFiles = (picked) => {
    const room = MAX_SHARING_IMAGES - form.mediaItems.length
    if (room <= 0) {
      showAlert(`Máximo ${MAX_SHARING_IMAGES} fotos por publicación.`)
      return
    }
    const slice = picked.slice(0, room)
    const tooBig = slice.find((f) => f.size > MAX_IMAGE_SOURCE_BYTES)
    if (tooBig) {
      showAlert(`Cada foto debe pesar máximo ${Math.round(MAX_IMAGE_SOURCE_BYTES / 1024 / 1024)} MB.`)
      return
    }
    setActiveCropFile(slice[0])
    setCropQueue(slice.slice(1))
  }

  const handleCropConfirm = (croppedFile) => {
    const [nextFile, ...remaining] = cropQueue
    setForm((prev) => ({
      ...prev,
      mediaItems: [...prev.mediaItems, { id: crypto.randomUUID(), file: croppedFile }],
    }))
    setActiveCropFile(nextFile ?? null)
    setCropQueue(remaining)
  }

  const handleCropCancel = () => {
    const [nextFile, ...remaining] = cropQueue
    setActiveCropFile(nextFile ?? null)
    setCropQueue(remaining)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.body.trim() && form.mediaItems.length === 0) {
      return showAlert('Agrega una descripción o al menos una foto.')
    }
    setIsSaving(true)
    try {
      const postId = Date.now()
      const imageUrls = []
      for (let i = 0; i < form.mediaItems.length; i++) {
        imageUrls.push(await uploadSharingImageFile(form.mediaItems[i].file, postId, i))
      }
      const post = {
        id: postId,
        body: form.body.trim(),
        category: form.category,
        images: imageUrls,
        author: currentUser.lotNumber,
        date: new Date().toLocaleDateString('es-CO'),
        reactions: { ...EMPTY_REACTIONS },
      }
      await addSharingPost(post)
      void trackPortalEvent('sharing_post_submit', { category: form.category })
      logAction('PUBLICAR_MURO', `Publicó en Muro Comunitario: ${form.category}`)
      setForm(emptyForm())
      setShowForm(false)
      setActiveCropFile(null)
      setCropQueue([])
      showAlert('¡Publicado en el Muro Comunitario!')
    } catch (err) {
      console.error(err)
      const code = err?.message
      if (code === 'ENTITY_IMAGE_TOO_LARGE') {
        showAlert('Una foto es demasiado grande. Intenta con una imagen más pequeña.')
      } else if (code === 'ENTITY_IMAGE_DECODE_FAILED') {
        showAlert('No se pudo leer una foto. Verifica que el archivo sea una imagen válida.')
      } else {
        showAlert('No se pudo publicar. Verifica tu conexión e intenta de nuevo.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = (post) => {
    showConfirm('¿Eliminar esta publicación? Esta acción no se puede deshacer.', async () => {
      try {
        await deleteSharingPost(post.id)
        logAction('ELIMINAR_MURO', `Eliminó publicación #${post.id}`)
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar la publicación.')
      }
    })
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ImageCropDialog
        open={!!activeCropFile}
        file={activeCropFile}
        title="Recortar foto"
        subtitle={cropQueue.length > 0 ? `Faltan ${cropQueue.length} más después de esta` : undefined}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
      <header className="rounded-3xl border border-emerald-100/40 bg-gradient-to-r from-white/70 to-white/40 backdrop-blur p-6 md:p-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-stone-800">Muro Comunitario</h2>
            <p className="text-stone-600 mt-1">
              Comparte cultivos, avistamientos, paisajes y momentos de {TENANT.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showForm) {
                setShowForm(false)
                setForm(emptyForm())
                setActiveCropFile(null)
                setCropQueue([])
              } else {
                setShowForm(true)
              }
            }}
            className="bg-gradient-to-r from-emerald-600 to-blue-600 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:from-emerald-700 hover:to-blue-700 transition-colors"
          >
            {showForm ? (
              'Cancelar'
            ) : (
              <>
                <PlusCircle className="w-5 h-5 mr-2" /> Compartir en la Comunidad
              </>
            )}
          </button>
        </div>
      </header>

      {showForm && (
        <div className="bg-white/85 backdrop-blur p-6 md:p-8 rounded-3xl border border-emerald-100/40 shadow-md space-y-5 animate-in slide-in-from-top-4">
          <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-600" />
            Nueva publicación
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-stone-800 mb-1.5">Categoría</label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="w-full p-4 border rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-stone-800 mb-1.5">
                Descripción <span className="font-normal text-stone-500">(opcional)</span>
              </label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                className="w-full p-4 border rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 h-24"
                placeholder="¿Qué quieres compartir con la comunidad?"
              />
            </div>
            <div className="border-2 border-dashed border-emerald-200 bg-emerald-50 p-6 rounded-2xl text-center hover:bg-emerald-100 transition-colors">
              <input
                type="file"
                id="sharing-img-upload"
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const picked = Array.from(e.target.files || [])
                  e.target.value = ''
                  if (picked.length) handlePickedFiles(picked)
                }}
              />
              <label htmlFor="sharing-img-upload" className="cursor-pointer flex flex-col items-center">
                <UploadCloud className="w-8 h-8 text-emerald-600 mb-2" />
                <span className="font-bold text-emerald-900">
                  {form.mediaItems.length > 0
                    ? `${form.mediaItems.length} / ${MAX_SHARING_IMAGES} foto(s)`
                    : 'Añadir fotos'}
                </span>
                <span className="text-xs text-emerald-600 mt-1">
                  Hasta {MAX_SHARING_IMAGES} fotos · máx. {Math.round(MAX_IMAGE_SOURCE_BYTES / 1024 / 1024)} MB · se abrirá editor de recorte
                </span>
              </label>
              {form.mediaItems.length > 0 && (
                <div className="mt-4 flex gap-2 flex-wrap justify-center">
                  {form.mediaItems.map((m) => (
                    <div key={m.id} className="relative h-20 w-24">
                      <SharingThumb file={m.file} />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((p) => ({ ...p, mediaItems: p.mediaItems.filter((x) => x.id !== m.id) }))
                        }
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black leading-none"
                        aria-label="Quitar foto"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-emerald-600 text-white p-4 rounded-xl font-black flex justify-center items-center disabled:opacity-50 hover:bg-emerald-700 transition-colors"
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin mr-2" /> Publicando...
                </>
              ) : (
                'Publicar en el Muro'
              )}
            </button>
          </form>
        </div>
      )}

      {(db.sharing || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Ver:</span>
          <button
            type="button"
            onClick={() => setFilterCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-colors ${
              !filterCategory
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-300'
            }`}
          >
            Todos
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilterCategory(c === filterCategory ? null : c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-colors ${
                filterCategory === c
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {(db.sharing || []).length === 0 && !showForm && (
        <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-12 text-center">
          <Camera className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-80" />
          <p className="text-stone-800 font-bold text-lg mb-1">Aún no hay publicaciones</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Sé el primero en compartir algo: cultivos, avistamientos de animales, paisajes o lo que quieras.
          </p>
        </div>
      )}

      {posts.length === 0 && filterCategory && (db.sharing || []).length > 0 && (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50/40 px-6 py-8 text-center">
          <p className="text-stone-600 font-bold">No hay publicaciones en &quot;{filterCategory}&quot; todavía.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {posts.map((post) => {
          const images = Array.isArray(post.images)
            ? post.images.filter((u) => u && !isNewsFallbackImageUrl(u))
            : []
          const canDelete = post.author === currentUser.lotNumber || isAdminLike(currentUser)
          return (
            <article
              key={post.id}
              className="bg-white/85 backdrop-blur rounded-3xl overflow-hidden border border-stone-100 shadow-sm flex flex-col"
            >
              {images.length > 0 && (
                <div className="h-56 bg-stone-100 overflow-hidden">
                  <img src={images[0]} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest">
                    {post.category}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(post)}
                      className="text-stone-400 hover:text-red-600 transition-colors p-0.5"
                      title="Eliminar publicación"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {post.body && (
                  <p className="text-stone-800 text-sm leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {post.body}
                  </p>
                )}
                {images.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    {images.slice(1).map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="h-14 w-20 shrink-0 rounded-lg object-cover border border-stone-100"
                      />
                    ))}
                  </div>
                )}
                <div className="pt-3 border-t border-stone-100 flex flex-col gap-2.5">
                  <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
                    {post.author} · {post.date}
                  </p>
                  <ReactionBar
                    appContext="lasBlancas"
                    contentType="sharing"
                    contentId={post.id}
                    userId={currentUser.lotNumber}
                  />
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
