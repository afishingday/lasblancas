/**
 * Secciones del menú lateral. Orden y visibilidad se guardan en `settings/public`
 * (`portalNavOrder`, `portalNavHidden`).
 */
export const PORTAL_NAV_ITEMS = [
  { id: 'news', label: 'Información de Interés' },
  { id: 'dashboard', label: 'Resumen' },
  { id: 'initiatives', label: 'Votaciones' },
  { id: 'proposals', label: 'Muro de propuestas' },
  { id: 'muro', label: 'Muro Comunitario' },
  { id: 'funds', label: 'Proyectos y Fondos' },
  { id: 'services', label: 'Servicios' },
  { id: 'community', label: 'Comunidad' },
  { id: 'naturaleza', label: 'Flora y Fauna' },
  { id: 'map', label: 'Mapa' },
  { id: 'profile', label: 'Perfil' },
  { id: 'adminUsers', label: 'Administración', minRole: 'admin' },
  { id: 'logs', label: 'Registro de actividad', superadminOnly: true },
]

const ALWAYS_VISIBLE = new Set(['profile', 'adminUsers', 'logs'])
const USER_TOGGLABLE_IDS = new Set(
  PORTAL_NAV_ITEMS.filter((item) => !item.minRole && !item.superadminOnly && !ALWAYS_VISIBLE.has(item.id)).map(
    (item) => item.id,
  ),
)

function navItemAllowedForRole(item, role) {
  if (item.superadminOnly) return role === 'superadmin'
  if (item.minRole === 'admin') return role === 'admin' || role === 'superadmin'
  return true
}

function navItemIdsForRole(role) {
  return PORTAL_NAV_ITEMS.filter((item) => navItemAllowedForRole(item, role)).map((i) => i.id)
}

/**
 * Entrega la lista de entradas de menú visibles para el rol, respetando orden y ocultos.
 */
export function getVisibleNavEntries(role, settingsRow, selfHiddenIds = []) {
  const availableIds = navItemIdsForRole(role)
  const byId = new Map(PORTAL_NAV_ITEMS.map((i) => [i.id, i]))
  const defaultOrder = availableIds
  const custom = Array.isArray(settingsRow?.portalNavOrder) ? settingsRow.portalNavOrder : null
  const ordered = custom?.length
    ? [
        ...custom.filter((id) => availableIds.includes(id)),
        ...defaultOrder.filter((id) => !custom.includes(id)),
      ]
    : defaultOrder
  const globalHidden = new Set(settingsRow?.portalNavHidden || [])
  const selfHidden = new Set(selfHiddenIds.filter((id) => USER_TOGGLABLE_IDS.has(id)))
  return ordered
    .filter((id) => ALWAYS_VISIBLE.has(id) || (!globalHidden.has(id) && !selfHidden.has(id)))
    .map((id) => byId.get(id))
    .filter(Boolean)
}

/**
 * Ids que el editor puede reordenar / mostrar u ocultar (perfil no se oculta).
 */
export function getNavIdsForEditor(role) {
  return navItemIdsForRole(role)
}

export function isNavIdAlwaysVisible(id) {
  return ALWAYS_VISIBLE.has(id)
}

export function getUserTogglableNavItems() {
  return PORTAL_NAV_ITEMS.filter((item) => USER_TOGGLABLE_IDS.has(item.id))
}
