/**
 * Re-encode images that exceed maxBytes as JPEG, reducing quality and size until they fit.
 * Used before Firebase Storage upload (rules enforce a small max size).
 *
 * @param {File} file
 * @param {number} maxBytes
 * @returns {Promise<File>}
 */
export async function compressImageFileIfNeeded(file, maxBytes) {
  if (!(file instanceof File)) throw new Error('ENTITY_IMAGE_INVALID')
  if (file.size === 0) throw new Error('ENTITY_IMAGE_INVALID')
  if (file.size <= maxBytes) return file

  const mime = (file.type || '').toLowerCase()
  if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') {
    throw new Error('ENTITY_IMAGE_INVALID')
  }
  if (mime === 'image/svg+xml') throw new Error('ENTITY_IMAGE_TOO_LARGE')

  let drawable = null
  try {
    drawable = await decodeToDrawable(file)
  } catch {
    throw new Error('ENTITY_IMAGE_DECODE_FAILED')
  }

  try {
    const { w: sw, h: sh } = drawableSize(drawable)
    if (!sw || !sh) throw new Error('ENTITY_IMAGE_DECODE_FAILED')

    let w = sw
    let h = sh
    const maxDimension = 2048
    if (w > maxDimension || h > maxDimension) {
      const s = maxDimension / Math.max(w, h)
      w = Math.round(w * s)
      h = Math.round(h * s)
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('ENTITY_IMAGE_TOO_LARGE')

    let quality = 0.9
    const minDimension = 280
    const minQuality = 0.42

    for (let iter = 0; iter < 26; iter += 1) {
      canvas.width = Math.max(1, Math.round(w))
      canvas.height = Math.max(1, Math.round(h))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      })
      if (!blob) break
      if (blob.size <= maxBytes) {
        return jpegFileFromBlob(blob, file.name)
      }
      if (quality > minQuality) {
        quality -= 0.06
        continue
      }
      if (w > minDimension && h > minDimension) {
        w = Math.round(w * 0.86)
        h = Math.round(h * 0.86)
        quality = 0.88
        continue
      }
      if (quality > minQuality) {
        quality = minQuality
        continue
      }
      break
    }
    throw new Error('ENTITY_IMAGE_TOO_LARGE')
  } finally {
    if (drawable && typeof drawable.close === 'function') drawable.close()
  }
}

function drawableSize(d) {
  if (d instanceof HTMLImageElement) {
    return {
      w: d.naturalWidth || d.width,
      h: d.naturalHeight || d.height,
    }
  }
  return { w: d.width, h: d.height }
}

async function decodeToDrawable(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through
    }
  }
  return loadImageElement(file)
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode'))
    }
    img.src = url
  })
}

function jpegFileFromBlob(blob, originalName) {
  const base = (originalName.replace(/\.[^.]+$/, '') || 'foto').replace(/[^\w\-]/g, '_').slice(0, 80)
  return new File([blob], `${base || 'foto'}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
