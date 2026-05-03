import { useMemo, useState } from 'react'
import { Eye, EyeOff, Layers, Loader2, ChevronUp, ChevronDown, ArrowLeft } from 'lucide-react'
import { PORTAL_NAV_ITEMS, isNavIdAlwaysVisible } from '../../portalNavConfig.js'

const PORTAL_SECTION_LABELS = Object.fromEntries(
  PORTAL_NAV_ITEMS.map((i) => [i.id, i.label]),
)

const CONFIGURABLE_IDS = PORTAL_NAV_ITEMS.filter(
  (item) => !item.superadminOnly && !item.minRole && !isNavIdAlwaysVisible(item.id),
).map((i) => i.id)

export default function SectionVisibilityView({
  settingsRow,
  savePublicSettings,
  logAction,
  showAlert,
  onBack,
}) {
  const [busyId, setBusyId] = useState(null)

  const hidden = useMemo(
    () => new Set(settingsRow?.portalNavHidden || []),
    [settingsRow?.portalNavHidden],
  )

  const orderedIds = useMemo(() => {
    const stored = settingsRow?.portalNavOrder
    if (!Array.isArray(stored) || stored.length === 0) return CONFIGURABLE_IDS
    const seen = new Set()
    const out = []
    for (const id of stored) {
      if (CONFIGURABLE_IDS.includes(id) && !seen.has(id)) {
        out.push(id)
        seen.add(id)
      }
    }
    for (const id of CONFIGURABLE_IDS) {
      if (!seen.has(id)) out.push(id)
    }
    return out
  }, [settingsRow?.portalNavOrder])

  const toggle = async (id) => {
    const nowHidden = hidden.has(id)
    const nextHidden = nowHidden
      ? [...hidden].filter((x) => x !== id)
      : [...hidden, id]

    const visibleCount = CONFIGURABLE_IDS.filter((x) => !nextHidden.includes(x)).length
    if (visibleCount === 0) {
      showAlert?.('Debe quedar al menos una sección visible en el portal.')
      return
    }
    setBusyId(id)
    try {
      await savePublicSettings({ portalNavHidden: nextHidden })
      logAction?.('PORTAL_SECCION_VISIBILIDAD', `${id}=${nowHidden ? 'on' : 'off'}`)
    } catch {
      showAlert?.('No se pudo guardar la configuración.')
    } finally {
      setBusyId(null)
    }
  }

  const move = async (id, delta) => {
    const idx = orderedIds.indexOf(id)
    const j = idx + delta
    if (idx < 0 || j < 0 || j >= orderedIds.length) return
    const next = [...orderedIds]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setBusyId(id)
    try {
      await savePublicSettings({ portalNavOrder: next })
      logAction?.('PORTAL_SECCION_ORDEN', `${PORTAL_SECTION_LABELS[id] || id} · pos ${idx + 1}→${j + 1}`)
    } catch {
      showAlert?.('No se pudo guardar el orden.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <button
        type="button"
        onClick={() => onBack?.()}
        className="inline-flex items-center text-blue-700 font-bold hover:text-blue-800 bg-white px-4 py-2 rounded-xl shadow-sm border border-blue-100 text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
        Volver a administrar cuentas
      </button>

      <div>
        <h2 className="text-3xl font-black text-stone-900 flex items-center gap-2">
          <Layers className="w-8 h-8 text-blue-700 shrink-0" />
          Secciones del portal
        </h2>
        <p className="text-stone-500 mt-1 max-w-2xl">
          Define el <span className="font-bold text-stone-700">orden del menú</span> y qué
          secciones están visibles. Lo que desactives no aparece para ningún vecino. Solo el
          superadmin ve esta pantalla.
        </p>
      </div>

      <ul className="rounded-2xl border border-blue-100/80 bg-white/90 divide-y divide-stone-100 shadow-sm max-w-xl">
        {orderedIds.map((id, index) => {
          const on = !hidden.has(id)
          const busy = busyId === id
          return (
            <li key={id} className="flex items-center gap-2 sm:gap-3 p-3 md:px-4">
              <div className="flex flex-col shrink-0 gap-0.5">
                <button
                  type="button"
                  disabled={busy || index === 0}
                  onClick={() => void move(id, -1)}
                  className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Subir en el menú"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={busy || index === orderedIds.length - 1}
                  onClick={() => void move(id, 1)}
                  className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Bajar en el menú"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-stone-900">{PORTAL_SECTION_LABELS[id] || id}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {on ? 'Visible en el menú' : 'Oculta para todos'} · Posición {index + 1}
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle(id)}
                className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-colors disabled:opacity-60 ${
                  on
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                }`}
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : on ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                {on ? 'Activa' : 'Inactiva'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
