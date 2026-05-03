import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle,
  ChevronDown,
  Eye,
  EyeOff,
  HardDrive,
  Loader2,
  Palette,
  RefreshCw,
  Settings2,
} from 'lucide-react'
import { getUserTogglableNavItems } from '../../portalNavConfig.js'
import { DEFAULT_THEME_ID, PORTAL_THEMES, applyTheme } from '../../shared/portalThemes.js'

const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024

const FOLDER_LABELS = {
  news: 'Noticias',
  initiatives: 'Votaciones',
  funds: 'Proyectos y Fondos',
  maps: 'Mapas',
  sharing: 'Muro Comunitario',
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function PortalAdminSettingsPanel({
  currentUser,
  currentUserRow,
  settingsRow,
  savePublicSettings,
  updateUserProfile,
  getStorageUsage,
  logAction,
  showAlert,
}) {
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [selectedThemeId, setSelectedThemeId] = useState(settingsRow?.portalTheme ?? DEFAULT_THEME_ID)
  const [themeSaving, setThemeSaving] = useState(false)
  const [storageOpen, setStorageOpen] = useState(false)
  const [storageResult, setStorageResult] = useState(null)
  const [storageLoading, setStorageLoading] = useState(false)
  const [selfMenuOpen, setSelfMenuOpen] = useState(false)
  const [selfSavingId, setSelfSavingId] = useState(null)

  const savedThemeId = settingsRow?.portalTheme ?? DEFAULT_THEME_ID
  const selfHidden = useMemo(
    () => new Set(currentUserRow?.superadminNavHidden || []),
    [currentUserRow?.superadminNavHidden],
  )
  const selfNavItems = useMemo(() => getUserTogglableNavItems(), [])

  useEffect(() => {
    setSelectedThemeId(savedThemeId)
  }, [savedThemeId])

  const saveTheme = async () => {
    if (!savePublicSettings) return showAlert?.('Función de configuración no disponible.')
    setThemeSaving(true)
    try {
      await savePublicSettings({ portalTheme: selectedThemeId })
      applyTheme(selectedThemeId)
      logAction?.('CAMBIAR_TEMA', `Cambió el tema del portal a: ${selectedThemeId}`)
      showAlert?.('Tema aplicado. Todos los usuarios verán el nuevo color al recargar el portal.')
    } catch (e) {
      console.error(e)
      showAlert?.('No se pudo aplicar el tema. Revisa permisos de Firestore.')
    } finally {
      setThemeSaving(false)
    }
  }

  const handleCheckStorage = async () => {
    if (!getStorageUsage) return showAlert?.('Función de almacenamiento no disponible.')
    setStorageLoading(true)
    try {
      const result = await getStorageUsage()
      setStorageResult(result)
      logAction?.('VERIFICAR_STORAGE', `Verificó uso de almacenamiento: ${formatBytes(result.totalBytes)}`)
    } catch (err) {
      console.error(err)
      showAlert?.('No se pudo verificar el almacenamiento. Revisa los permisos de Firebase Storage.')
    } finally {
      setStorageLoading(false)
    }
  }

  const toggleSelfSection = async (id) => {
    if (currentUser?.role !== 'superadmin' || !updateUserProfile || !currentUser?.lotNumber) return
    const next = new Set(selfHidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelfSavingId(id)
    try {
      await updateUserProfile(currentUser.lotNumber, { superadminNavHidden: Array.from(next) })
      logAction?.('SUPERADMIN_MENU_PERSONAL', `${id}=${next.has(id) ? 'hidden' : 'visible'}`)
    } catch (err) {
      console.error(err)
      showAlert?.('No se pudo guardar tu menú personal.')
    } finally {
      setSelfSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-violet-200 bg-violet-50/30 p-6">
        <button
          type="button"
          onClick={() => setThemePickerOpen((o) => !o)}
          className="w-full flex items-center justify-between text-left font-black text-violet-900 text-lg"
        >
          <span className="flex items-center gap-2">
            <Palette className="w-5 h-5" /> Colores del portal
          </span>
          <ChevronDown className={`w-5 h-5 transition-transform ${themePickerOpen ? 'rotate-180' : ''}`} />
        </button>
        {themePickerOpen && (
          <div className="mt-5 space-y-5 text-sm text-stone-800">
            <p className="text-stone-600 leading-snug">
              Elige la paleta de color principal del portal. El cambio es instantáneo para todos los usuarios.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {PORTAL_THEMES.map((theme) => {
                const isSaved = savedThemeId === theme.id
                const isSelected = selectedThemeId === theme.id
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedThemeId(theme.id)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-3 transition-all ${
                      isSelected
                        ? 'border-violet-400 bg-white shadow-md ring-2 ring-violet-300'
                        : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full shadow-sm flex items-center justify-center"
                      style={{ backgroundColor: theme.preview }}
                    >
                      {isSaved && <CheckCircle className="w-5 h-5 text-white drop-shadow" />}
                    </div>
                    <span className="text-[11px] font-black text-stone-800 text-center leading-tight">
                      {theme.name}
                    </span>
                    {isSaved && <span className="text-[10px] font-bold text-violet-600">Activo</span>}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={themeSaving || selectedThemeId === savedThemeId}
                onClick={() => void saveTheme()}
                className="px-4 py-2.5 rounded-xl bg-violet-700 text-white text-xs font-black hover:bg-violet-800 disabled:opacity-50 transition-colors"
              >
                {themeSaving ? 'Guardando...' : 'Aplicar tema'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedThemeId(savedThemeId)}
                className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {currentUser?.role === 'superadmin' && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6">
          <button
            type="button"
            onClick={() => setSelfMenuOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left font-black text-emerald-900 text-lg"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" /> Mi menú de SuperAdmin
            </span>
            <ChevronDown className={`w-5 h-5 transition-transform ${selfMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {selfMenuOpen && (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-stone-600">
                Oculta solo en tu sesión las secciones comunitarias que no necesitas administrar a diario.
                No cambia lo que ven vecinos ni admins.
              </p>
              <ul className="rounded-2xl border border-emerald-100 bg-white divide-y divide-stone-100 overflow-hidden">
                {selfNavItems.map((item) => {
                  const visible = !selfHidden.has(item.id)
                  const busy = selfSavingId === item.id
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-stone-900">{item.label}</p>
                        <p className="text-xs text-stone-500">{visible ? 'Visible para ti' : 'Oculta para ti'}</p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleSelfSection(item.id)}
                        className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors disabled:opacity-60 ${
                          visible
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : visible ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                        {visible ? 'Activa' : 'Inactiva'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {currentUser?.role === 'superadmin' && (
        <div className="rounded-3xl border border-indigo-200 bg-indigo-50/40 p-6">
          <button
            type="button"
            onClick={() => setStorageOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left font-black text-indigo-900 text-lg"
          >
            <span className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" /> Almacenamiento en la nube
            </span>
            <ChevronDown className={`w-5 h-5 transition-transform ${storageOpen ? 'rotate-180' : ''}`} />
          </button>
          {storageOpen && (
            <div className="mt-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-stone-600">
                  Plan <span className="font-bold text-stone-800">Firebase Spark (gratuito)</span> ·{' '}
                  <span className="font-bold text-indigo-700">5 GB disponibles</span>.
                </p>
                <button
                  type="button"
                  disabled={storageLoading}
                  onClick={() => void handleCheckStorage()}
                  className="inline-flex items-center gap-2 shrink-0 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                >
                  {storageLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Calculando...</>
                  ) : storageResult ? (
                    <><RefreshCw className="w-4 h-4" /> Actualizar</>
                  ) : (
                    <><HardDrive className="w-4 h-4" /> Calcular uso</>
                  )}
                </button>
              </div>

              {storageLoading && (
                <div className="flex flex-col items-center gap-3 py-8 text-indigo-700">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-bold">Leyendo archivos en Storage...</p>
                  <p className="text-xs text-stone-500">Puede tardar unos segundos según la cantidad de archivos.</p>
                </div>
              )}

              {storageResult && !storageLoading && (() => {
                const usedPct = Math.min(100, (storageResult.totalBytes / STORAGE_QUOTA_BYTES) * 100)
                const barColor =
                  usedPct > 80 ? 'bg-red-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-indigo-500'
                const textColor =
                  usedPct > 80 ? 'text-red-700' : usedPct > 50 ? 'text-amber-700' : 'text-indigo-700'
                const maxFolderBytes = Math.max(
                  ...Object.values(storageResult.byFolder).map((f) => f.bytes),
                  1,
                )
                return (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-indigo-100 bg-white p-4 space-y-3">
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">
                            Espacio usado
                          </p>
                          <p className={`text-3xl font-black tabular-nums ${textColor}`}>
                            {formatBytes(storageResult.totalBytes)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">
                            Disponible
                          </p>
                          <p className="text-xl font-black text-stone-400 tabular-nums">
                            {formatBytes(STORAGE_QUOTA_BYTES - storageResult.totalBytes)}
                          </p>
                        </div>
                      </div>
                      <div className="h-3 rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                          style={{ width: `${Math.max(usedPct, 0.5)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs font-bold text-stone-500">
                        <span className={`font-black ${textColor}`}>{usedPct.toFixed(2)}% usado</span>
                        <span>5 GB total</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-white overflow-hidden">
                      <p className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-stone-500 border-b border-stone-100 bg-stone-50">
                        Desglose por sección
                      </p>
                      <ul className="divide-y divide-stone-100">
                        {Object.entries(storageResult.byFolder).map(([folder, data]) => {
                          const folderPct = maxFolderBytes > 0 ? (data.bytes / maxFolderBytes) * 100 : 0
                          return (
                            <li key={folder} className="px-4 py-3 flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className="text-sm font-bold text-stone-800 truncate">
                                    {FOLDER_LABELS[folder] || folder}
                                  </span>
                                  <span className="text-xs font-black text-stone-600 tabular-nums shrink-0">
                                    {formatBytes(data.bytes)}
                                    <span className="text-stone-400 font-medium ml-2">
                                      ({data.count} arch.)
                                    </span>
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                                    style={{ width: `${Math.max(folderPct, data.bytes > 0 ? 1 : 0)}%` }}
                                  />
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
