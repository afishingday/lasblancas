import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase.js'

/** Misma regla que noticias: 600 KB por imagen de portada. */
export const MAX_ENTITY_IMAGE_BYTES = 600 * 1024

/**
 * Sube una sola imagen de portada (iniciativa o proyecto).
 * @param {File} file
 * @param {'initiatives' | 'funds'} folder
 * @param {string|number} entityId
 */
export async function uploadEntityCoverImage(file, folder, entityId) {
  if (!(file instanceof File) || file.size === 0) throw new Error('ENTITY_IMAGE_INVALID')
  if (file.size > MAX_ENTITY_IMAGE_BYTES) throw new Error('ENTITY_IMAGE_TOO_LARGE')

  const safeName = file.name.replace(/[^\w.\-]/g, '_').slice(0, 96) || 'cover.jpg'
  const path = `${folder}/${entityId}/${Date.now()}_${safeName}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'image/jpeg',
  })
  return getDownloadURL(storageRef)
}
