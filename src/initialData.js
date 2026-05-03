import { TENANT } from './tenant.config.js'

/** Sube la versión cuando cambie la lista de lotes para volver a sincronizar usuarios en los clientes. */
export const PORTAL_USERS_CONFIG_VERSION = 'lots-v4-20260420'

const ADMIN_LOTS = new Set(TENANT.adminLots)
const SUPERADMIN_LOT = TENANT.superadminLot

export function buildDefaultUsers() {
  const suffixes = TENANT.lotSuffixes

  return suffixes.map((suffix) => {
    const lot = `Lote${suffix}`
    return {
      lot,
      password: `${lot}2026`,
      role: ADMIN_LOTS.has(lot) ? 'admin' : 'resident',
      fincaName: '',
      avatar: '',
    }
  })
}

/**
 * Datos por defecto al primer arranque: solo usuarios.
 * Noticias, votaciones, proyectos, directorios y bitácoras se crean desde el portal.
 */
export const INITIAL_DATA = {
  users: buildDefaultUsers().concat([
    {
      lot: SUPERADMIN_LOT,
      password: `${SUPERADMIN_LOT}2026`,
      role: 'superadmin',
      fincaName: '',
      avatar: '',
    },
  ]),
  settings: [],
  news: [],
  initiatives: [],
  funds: [],
  events: [],
  services: [],
  community: [],
  mapLayers: [],
  logs: [],
}

export const EMPTY_DB = {
  users: [],
  settings: [],
  news: [],
  initiatives: [],
  funds: [],
  events: [],
  services: [],
  community: [],
  mapLayers: [],
  logs: [],
  sharing: [],
}
