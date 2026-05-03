const _raw = import.meta.glob('./assets/icons/*.{png,jpg,jpeg,webp,svg,gif}', {
  eager: true,
  import: 'default',
})

function _buildIconList() {
  const list = []
  for (const [path, url] of Object.entries(_raw)) {
    if (typeof url !== 'string') continue
    const filename = path.replace(/.*\//, '')
    if (!filename || filename.startsWith('.')) continue
    const id = filename.replace(/\.[a-z0-9]+$/i, '')
    list.push({ id, label: id, src: url })
  }
  list.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }))
  return list
}

export const PORTAL_AVATAR_ICONS = _buildIconList()

/**
 * Retorna la lista de avatares disponibles (sync, vía import.meta.glob).
 * Se mantiene como async para compatibilidad con el useEffect de App.jsx.
 */
export async function loadPortalAvatarImages() {
  return PORTAL_AVATAR_ICONS
}

export function isImgAvatarValue(raw) {
  return String(raw || '').trim().startsWith('img:')
}

export function avatarValueFromImageId(id) {
  return `img:${String(id).trim()}`
}
