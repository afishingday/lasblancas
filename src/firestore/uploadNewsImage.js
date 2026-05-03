import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { BRAND_LOGO_SRC } from '../brandAssets.js'
import { storage } from '../firebase.js'
import { compressImageFileIfNeeded } from '../shared/compressImageUnderMaxBytes.js'
import { getYoutubeVideoIdFromNewsPost } from '../shared/utils.js'

/** URL del logo empaquetada (válida en Firestore y en la app). `public/images/logo.png` sigue existiendo para enlaces absolutos si hace falta. */
export const NEWS_FALLBACK_IMAGE = BRAND_LOGO_SRC

/** Compatibilidad con código que aún use el nombre anterior. */
export const DEFAULT_NEWS_IMAGE = NEWS_FALLBACK_IMAGE

/** Máximo por archivo ya procesado (600 KB). */
export const MAX_NEWS_IMAGE_BYTES = 600 * 1024

/** Tamaño máximo del archivo fuente que el usuario puede seleccionar (15 MB). */
export const MAX_IMAGE_SOURCE_BYTES = 15 * 1024 * 1024

/** Máximo de imágenes por noticia. */
export const MAX_NEWS_IMAGES_COUNT = 5

/** Imágenes propias de la noticia (sin logo placeholder ni URLs vacías). */
export function newsOwnImagesList(post) {
  const fromArr = Array.isArray(post?.images)
    ? post.images.filter((u) => u && !isNewsFallbackImageUrl(u))
    : []
  if (fromArr.length > 0) return fromArr
  if (post?.image && !isNewsFallbackImageUrl(post.image)) return [post.image]
  return []
}

/** Índice de la imagen de portada (0-based). Por defecto 0. */
export function getNewsCoverIndex(post) {
  const list = newsOwnImagesList(post)
  if (list.length === 0) return 0
  const raw = Number(post?.coverIndex)
  const idx = Number.isFinite(raw) ? Math.floor(raw) : 0
  return Math.min(Math.max(0, idx), list.length - 1)
}

/** Miniatura de YouTube para tarjetas cuando la noticia no tiene fotos propias. */
export function getYoutubeNewsPreviewThumbnailUrl(videoId) {
  const id = String(videoId || '').trim()
  if (!id) return null
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
}

/** Portada en el muro (Inicio): fotos propias; si no hay, miniatura del video de YouTube si aplica; si no, logo. */
export function getNewsListPreviewCoverUrl(post) {
  const own = newsOwnImagesList(post)
  if (own.length > 0) {
    const idx = Math.min(Math.max(0, getNewsCoverIndex(post)), own.length - 1)
    return own[idx]
  }
  const ytId = getYoutubeVideoIdFromNewsPost(post)
  const ytThumb = ytId ? getYoutubeNewsPreviewThumbnailUrl(ytId) : null
  if (ytThumb) return ytThumb
  return NEWS_FALLBACK_IMAGE
}

/** Galería en detalle de noticia: solo URLs reales; sin logo automático. */
export function getNewsDetailGalleryUrls(post) {
  return [...newsOwnImagesList(post)]
}

/** @deprecated Usa getNewsListPreviewCoverUrl o getNewsDetailGalleryUrls */
export function getNewsCoverUrl(post) {
  return getNewsListPreviewCoverUrl(post)
}

/** @deprecated Usa getNewsDetailGalleryUrls en detalle y getNewsListPreviewCoverUrl en listas */
export function getNewsGalleryUrls(post) {
  const own = newsOwnImagesList(post)
  if (own.length > 0) return [...own]
  return [NEWS_FALLBACK_IMAGE]
}

/** True si la URL es la imagen por defecto (logo empaquetado). */
export function isNewsFallbackImageUrl(url) {
  return !url || url === NEWS_FALLBACK_IMAGE || url === DEFAULT_NEWS_IMAGE
}

export async function uploadNewsImageFile(file, newsId, fileIndex = 0) {
  if (!(file instanceof File) || file.size === 0) throw new Error('NEWS_IMAGE_INVALID')
  const prepared = await compressImageFileIfNeeded(file, MAX_NEWS_IMAGE_BYTES)
  const safeName = prepared.name.replace(/[^\w.\-]/g, '_').slice(0, 96) || 'cover.jpg'
  const path = `news/${newsId}/${Date.now()}_${fileIndex}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, prepared, {
    contentType: prepared.type || 'image/jpeg',
  })
  return getDownloadURL(storageRef)
}

export async function uploadSharingImageFile(file, postId, fileIndex = 0) {
  if (!(file instanceof File) || file.size === 0) throw new Error('IMAGE_INVALID')
  const prepared = await compressImageFileIfNeeded(file, MAX_NEWS_IMAGE_BYTES)
  const safeName = prepared.name.replace(/[^\w.\-]/g, '_').slice(0, 96) || 'photo.jpg'
  const path = `sharing/${postId}/${Date.now()}_${fileIndex}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, prepared, { contentType: prepared.type || 'image/jpeg' })
  return getDownloadURL(storageRef)
}

/**
 * Sube varias imágenes en orden. Lanza NEWS_IMAGE_TOO_LARGE o NEWS_IMAGE_INVALID si aplica.
 */
export async function uploadNewsImageGallery(files, newsId) {
  const list = Array.from(files || []).filter((f) => f instanceof File && f.size > 0)
  if (list.length > MAX_NEWS_IMAGES_COUNT) throw new Error('NEWS_IMAGE_TOO_MANY')
  const urls = []
  for (let i = 0; i < list.length; i += 1) {
    urls.push(await uploadNewsImageFile(list[i], newsId, i))
  }
  return urls
}
