import { useState, useEffect, useRef, useMemo } from 'react'
import {
  ArrowLeft,
  User,
  Calendar,
  PlusCircle,
  Edit3,
  Trash2,
  Newspaper,
  Sparkles,
  Loader2,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
  Eye,
  EyeOff,
} from 'lucide-react'
import ReactionBar from '../../shared/ReactionBar.jsx'
import { ImageCropDialog } from '../../shared/ImageCropDialog.jsx'
import {
  isAdminLike,
  isVotingClosed,
  formatCurrency,
  fundAmountFromDb,
  parseYouTubeVideoId,
  getYoutubeVideoIdFromNewsPost,
  requestPolishedText,
} from '../../shared/utils.js'
import { TENANT } from '../../tenant.config.js'
import {
  fetchGeminiFundMetaReachedNews,
  getLastGeminiDetail,
  isGeminiConfigured,
} from '../../geminiClient.js'
import {
  MAX_NEWS_IMAGE_BYTES,
  MAX_NEWS_IMAGES_COUNT,
  MAX_IMAGE_SOURCE_BYTES,
  getNewsCoverIndex,
  getNewsListPreviewCoverUrl,
  getNewsDetailGalleryUrls,
  newsOwnImagesList,
  isNewsFallbackImageUrl,
  uploadNewsImageFile,
} from '../../firestore/uploadNewsImage.js'

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
  setNewsPostSuppressed,
  showAlert,
  showConfirm,
  newsDraftFromFund,
  onConsumeNewsDraftFromFund,
  setActiveTab,
}) => {
  const [showForm, setShowForm] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [form, setForm] = useState(() => emptyNewsForm())
  const [cropQueue, setCropQueue] = useState([])
  const [activeCropFile, setActiveCropFile] = useState(null)
  const [activeCategory, setActiveCategory] = useState('Todas')
  const lastAppliedFundNewsKeyRef = useRef(null)

  // Articles visible to this user (suppression filter, before category filter)
  const preFilteredNews = useMemo(() => {
    const all = db.news || []
    if (isAdminLike(currentUser)) return all
    return all.filter((p) => !p.adminSuppressed || p.author === currentUser.lotNumber)
  }, [db.news, currentUser])

  // Categories that exist in pre-filtered articles
  const categoriesInArticles = useMemo(() => {
    const cats = new Set()
    preFilteredNews.forEach((p) => { if (p.category) cats.add(p.category) })
    return Array.from(cats).sort()
  }, [preFilteredNews])

  // Final list after category filter
  const visibleNews = useMemo(() => {
    if (activeCategory === 'Todas') return preFilteredNews
    return preFilteredNews.filter((p) => p.category === activeCategory)
  }, [preFilteredNews, activeCategory])

  // Reset category when it disappears from articles
  useEffect(() => {
    if (activeCategory !== 'Todas' && !categoriesInArticles.includes(activeCategory)) {
      setActiveCategory('Todas')
    }
  }, [categoriesInArticles, activeCategory])

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

  const handlePickedFiles = (picked) => {
    const room = MAX_NEWS_IMAGES_COUNT - form.mediaItems.length
    if (room <= 0) {
      showAlert(`Ya alcanzaste el máximo de ${MAX_NEWS_IMAGES_COUNT} imágenes. Quita alguna para añadir más.`)
      return
    }
    const slice = picked.slice(0, room)
    const tooBig = slice.find((f) => f.size > MAX_IMAGE_SOURCE_BYTES)
    if (tooBig) {
      showAlert(
        `La foto "${tooBig.name}" supera los ${Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024))} MB y no se puede procesar.`,
      )
      return
    }
    setActiveCropFile(slice[0])
    setCropQueue(slice.slice(1))
  }

  const handleCropConfirm = (croppedFile) => {
    const [nextFile, ...remaining] = cropQueue
    setForm((prev) => {
      const newItem = { id: crypto.randomUUID(), type: 'file', file: croppedFile }
      const mediaItems = [...prev.mediaItems, newItem]
      const coverMediaId =
        prev.coverMediaId && mediaItems.some((m) => m.id === prev.coverMediaId)
          ? prev.coverMediaId
          : mediaItems[0]?.id ?? null
      return { ...prev, mediaItems, coverMediaId }
    })
    setActiveCropFile(nextFile ?? null)
    setCropQueue(remaining)
  }

  const handleCropCancel = () => {
    const [nextFile, ...remaining] = cropQueue
    setActiveCropFile(nextFile ?? null)
    setCropQueue(remaining)
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
      `¿Eliminar permanentemente el artículo "${post.title}"? Esta acción no se puede deshacer.`,
      () => {
        deleteNewsPost(post.id)
          .then(() => {
            showAlert('Artículo eliminado.')
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
        setActiveCropFile(null)
        setCropQueue([])
        showAlert(
          isEditing ? 'Artículo actualizado.' : '¡Artículo publicado con éxito!',
        )
      } catch (err) {
        console.error(err)
        if (err instanceof Error && (err.message === 'NEWS_IMAGE_TOO_LARGE' || err.message === 'ENTITY_IMAGE_TOO_LARGE')) {
          showAlert('No pudimos comprimir alguna imagen lo suficiente. Prueba con una foto de menor resolución.')
          return
        }
        if (err instanceof Error && err.message === 'ENTITY_IMAGE_DECODE_FAILED') {
          showAlert('No se pudo procesar una imagen. Prueba con JPG o PNG.')
          return
        }
        showAlert(
          'No se pudo guardar el artículo. Si subiste imagen, revisa Firebase Storage y las reglas de almacenamiento.',
        )
      } finally {
        setIsUploading(false)
      }
    }

    if (form.mediaItems.length === 0) {
      const noPhotosYtId = ytTrim ? parseYouTubeVideoId(ytTrim) : null
      showConfirm(
        noPhotosYtId
          ? '¿Publicar esta noticia sin fotos? En la lista se mostrará la miniatura del video de YouTube como vista previa.'
          : `¿Publicar esta noticia sin fotos? En el muro de Inicio se mostrará el logo de ${TENANT.name} solo como vista previa; no se guardará como imagen en la base de datos.`,
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

  const handleSuppressToggle = async (post) => {
    try {
      await setNewsPostSuppressed(post.id, !post.adminSuppressed)
      if (selectedPost?.id === post.id) setSelectedPost(null)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo cambiar la visibilidad del artículo.')
    }
  }

  const canEditPost = (post) => isAdminLike(currentUser) || post.author === currentUser.lotNumber

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
            <ArrowLeft className="w-5 h-5 mr-2" /> Volver a Información de Interés
          </button>
          {canEditPost(selectedPost) && (
            <div className="flex flex-wrap gap-2">
              {isAdminLike(currentUser) && (
                <button
                  type="button"
                  onClick={() => void handleSuppressToggle(selectedPost)}
                  className={`inline-flex items-center px-4 py-2 rounded-xl font-bold text-sm shadow-sm ${
                    selectedPost.adminSuppressed
                      ? 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                      : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  {selectedPost.adminSuppressed
                    ? <><Eye className="w-4 h-4 mr-2" /> Mostrar</>
                    : <><EyeOff className="w-4 h-4 mr-2" /> Ocultar</>
                  }
                </button>
              )}
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
        {selectedPost.adminSuppressed && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold px-4 py-3 rounded-xl">
            {isAdminLike(currentUser)
              ? 'Este artículo está oculto para la comunidad. Solo tú y el autor pueden verlo.'
              : 'Tu artículo está en revisión y aún no es visible para el resto de la comunidad.'}
          </div>
        )}

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
            <h2 className="text-3xl md:text-4xl font-black text-stone-900 mb-6 leading-tight">{selectedPost.title}</h2>
            <div className="flex items-center text-sm font-bold text-stone-600 mb-8 gap-6 border-b border-stone-100 pb-6">
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

            <div className="prose max-w-none text-stone-800 text-lg leading-relaxed whitespace-pre-wrap">
              {selectedPost.content || selectedPost.excerpt}
            </div>
            <div className="mt-8 pt-6 border-t border-stone-100">
              <ReactionBar
                appContext="lasBlancas"
                contentType="news"
                contentId={selectedPost.id}
                userId={currentUser.lotNumber}
              />
            </div>
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <ImageCropDialog
        open={activeCropFile !== null}
        file={activeCropFile}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
      <header className="rounded-3xl border border-emerald-100/40 bg-gradient-to-r from-white/70 to-white/40 backdrop-blur p-6 md:p-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-stone-800">Información de Interés</h2>
            <p className="text-stone-600 mt-1">Novedades y comunicados oficiales de {TENANT.name}.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showForm) {
                setShowForm(false)
                setEditingId(null)
                setForm(emptyNewsForm())
                setActiveCropFile(null)
                setCropQueue([])
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
                <PlusCircle className="w-5 h-5 mr-2" /> Publicar Artículo
              </>
            )}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab?.('funds')}
            className="bg-white/70 ring-1 ring-emerald-100/40 border border-emerald-100/30 rounded-2xl p-4 text-left hover:bg-emerald-50/70 hover:ring-emerald-200/60 active:bg-emerald-100/60 transition-colors"
          >
            <p className="text-xs font-black uppercase tracking-widest text-emerald-800">Proyectos en curso</p>
            <p className="text-3xl font-black text-emerald-800 tabular-nums leading-none mt-2">
              {(db.funds || []).length}
            </p>
            <p className="text-xs text-stone-700 mt-2 font-bold">Ver proyectos y fondos →</p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab?.('initiatives')}
            className="bg-white/70 ring-1 ring-blue-100/40 border border-blue-100/30 rounded-2xl p-4 text-left hover:bg-blue-50/70 hover:ring-blue-200/60 active:bg-blue-100/60 transition-colors"
          >
            <p className="text-xs font-black uppercase tracking-widest text-blue-800">Votaciones activas</p>
            <p className="text-3xl font-black text-blue-800 tabular-nums leading-none mt-2">
              {(db.initiatives || []).filter((i) => !i?.isProposal && !isVotingClosed(i)).length}
            </p>
            <p className="text-xs text-stone-700 mt-2 font-bold">Participa con tu voto →</p>
          </button>
        </div>
      </header>

      {showForm && (
        <div className="bg-white/85 backdrop-blur p-8 rounded-3xl border border-emerald-100/40 shadow-md space-y-6 animate-in slide-in-from-top-4">
          <h3 className="text-xl font-bold flex items-center">
            <Newspaper className="mr-2 text-emerald-600" />
            {editingId != null ? 'Editar artículo' : 'Redactar Nuevo Artículo'}
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
                  <option value="Seguridad">Seguridad</option>
                  <option value="Manejo de tu Lote">Manejo de tu Lote</option>
                  <option value="Cuidado Personal">Cuidado Personal</option>
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
                  handlePickedFiles(picked)
                }}
              />
              <label htmlFor="img-upload" className="cursor-pointer flex flex-col items-center">
                <UploadCloud className="w-10 h-10 text-emerald-600 mb-3" />
                <span className="font-bold text-emerald-900 text-lg">
                  {form.mediaItems.length > 0
                    ? `${form.mediaItems.length} / ${MAX_NEWS_IMAGES_COUNT} imagen(es)`
                    : 'Añadir imágenes'}
                </span>
                <span className="text-sm text-emerald-600 mt-1">
                  Al elegir cada foto se abrirá un editor de recorte.
                  {editingId != null ? ' En edición también puedes añadir fotos nuevas.' : ''}
                </span>
                <span className="text-xs text-emerald-700/80 mt-2 font-medium max-w-md">
                  Cada foto fuente: máximo {Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024))} MB. El resultado se
                  optimiza automáticamente. Sin fotos se pedirá confirmación.
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
                'Publicar a la Comunidad'
              )}
            </button>
          </form>
        </div>
      )}

      {!showForm && preFilteredNews.length > 0 && categoriesInArticles.length > 1 && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setActiveCategory('Todas')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              activeCategory === 'Todas'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white border border-stone-200 text-stone-700 hover:border-emerald-300'
            }`}
          >
            Todas
          </button>
          {categoriesInArticles.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                activeCategory === cat
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-stone-200 text-stone-700 hover:border-emerald-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {preFilteredNews.length === 0 && !showForm && (
        <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-12 text-center">
          <Newspaper className="w-12 h-12 text-emerald-500 mx-auto mb-4 opacity-80" />
          <p className="text-stone-800 font-bold text-lg mb-1">Aún no hay artículos</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Cuando publiquen artículos en el portal, aparecerán aquí. Usa &quot;Publicar Artículo&quot; para compartir
            información con la comunidad.
          </p>
        </div>
      )}

      {!showForm && visibleNews.length === 0 && preFilteredNews.length > 0 && (
        <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 px-6 py-8 text-center">
          <p className="text-stone-600 text-sm font-medium">No hay artículos en la categoría &quot;{activeCategory}&quot;.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visibleNews.map((post) => {
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
              className="relative bg-white/85 backdrop-blur rounded-3xl overflow-hidden border border-stone-100 shadow-sm flex flex-col group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              {canEditPost(post) && (
                <div
                  className="absolute top-3 right-3 z-20 flex gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  {isAdminLike(currentUser) && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleSuppressToggle(post) }}
                      className={`p-2 rounded-lg shadow-md border ${
                        post.adminSuppressed
                          ? 'bg-white/95 text-emerald-700 border-emerald-100 hover:bg-emerald-50'
                          : 'bg-white/95 text-rose-600 border-rose-100 hover:bg-rose-50'
                      }`}
                      title={post.adminSuppressed ? 'Mostrar para la comunidad' : 'Ocultar para la comunidad'}
                    >
                      {post.adminSuppressed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEdit(post) }}
                    className="bg-white/95 text-emerald-800 p-2 rounded-lg shadow-md border border-emerald-100 hover:bg-emerald-50"
                    title="Editar noticia"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); requestDeleteNews(post) }}
                    className="bg-white/95 text-red-700 p-2 rounded-lg shadow-md border border-red-100 hover:bg-red-50"
                    title="Eliminar noticia"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              {post.adminSuppressed && (
                <div className="absolute top-0 left-0 right-0 z-10 bg-rose-500/85 text-white text-[10px] font-black px-3 py-1 text-center">
                  {isAdminLike(currentUser) ? 'Oculto' : 'En revisión'}
                </div>
              )}
              <div
                className={`h-56 relative overflow-hidden bg-stone-100 ${
                  cardCoverIsFallback ? 'flex items-center justify-center p-7 sm:p-9' : ''
                }`}
              >
                <img
                  src={cardCover}
                  className={`object-center transition-transform duration-500 group-hover:scale-[1.02] ${
                    cardCoverIsFallback
                      ? 'max-h-full max-w-[min(100%,200px)] object-contain scale-100 sm:scale-105'
                      : 'absolute inset-0 h-full w-full object-cover'
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
                <h3 className="text-xl font-bold text-stone-900 mb-3 leading-tight group-hover:text-emerald-700 transition-colors">
                  {post.title}
                </h3>
                <p className="text-stone-600 text-sm mb-6 flex-1 line-clamp-3">{post.excerpt}</p>
                <div className="pt-4 border-t border-stone-100 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold text-stone-500 uppercase tracking-widest">
                    <span className="flex items-center">
                      <User className="w-3.5 h-3.5 mr-1.5" /> {post.author}
                    </span>
                    <span className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1.5" /> {post.date}
                    </span>
                  </div>
                  <ReactionBar
                    appContext="lasBlancas"
                    contentType="news"
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

export default NewsView
