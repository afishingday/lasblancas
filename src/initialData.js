/** Sube la versión cuando cambie la lista de lotes para volver a sincronizar usuarios en los clientes. */
export const PORTAL_USERS_CONFIG_VERSION = 'lots-v3-20260415'

/** Lotes administradores: el resto son residentes. */
const ADMIN_LOTS = new Set(['Lote4B', 'Lote29B'])
const SUPERADMIN_LOT = 'SuperAdmin'

/**
 * Usuarios por defecto: usuario `Lote{número}{etapa}`, clave `Lote{número}{etapa}2026`.
 * Incluye 1A–20A, 1B–20B, 20-1B, 20-2B y 21B–38B (sin 22B), según el padrón del conjunto.
 */
export function buildDefaultUsers() {
  const suffixes = [
    ...Array.from({ length: 20 }, (_, i) => `${i + 1}A`),
    ...Array.from({ length: 20 }, (_, i) => `${i + 1}B`),
    '20-1B',
    '20-2B',
    '21B',
    '23B',
    '24B',
    '25B',
    '26B',
    '27B',
    '28B',
    '29B',
    '30B',
    '31B',
    '32B',
    '33B',
    '34B',
    '35B',
    '36B',
    '37B',
    '38B',
  ]

  return suffixes.map((suffix) => {
    const lot = `Lote${suffix}`
    return {
      lot,
      password: `${lot}2026`,
      role: ADMIN_LOTS.has(lot) ? 'admin' : 'resident',
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
    },
  ]),
  news: [],
  initiatives: [],
  funds: [],
  services: [],
  community: [],
  mapLayers: [],
  logs: [],
}

export const EMPTY_DB = {
  users: [],
  news: [],
  initiatives: [],
  funds: [],
  services: [],
  community: [],
  mapLayers: [],
  logs: [],
}
