import { useState, useMemo } from 'react'
import {
  Users,
  UserCircle,
  Shield,
  ShieldOff,
  KeyRound,
  Loader2,
  Eye,
  EyeOff,
  Layers,
  X,
} from 'lucide-react'
import AvatarDisplay from '../../shared/AvatarDisplay.jsx'
import {
  portalUserLot,
  labelCameraPortadaAccess,
  buildMergedCameraPortadaVoteMap,
  resolveCameraPortadaAccessFromStores,
} from '../../shared/utils.js'
import { TENANT } from '../../tenant.config.js'
import SectionVisibilityView from './SectionVisibilityView.jsx'
import PortalAdminSettingsPanel from './PortalAdminSettingsPanel.jsx'

function RoleBadge({ role }) {
  if (role === 'admin')
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
        Admin
      </span>
    )
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
      Vecino
    </span>
  )
}

export default function AdministerUsersView({
  currentUser,
  db,
  showAlert,
  showConfirm,
  logAction,
  updateUserProfile,
  forceUserPlainPassword,
  setUserBlockedStatus,
  savePublicSettings,
  getStorageUsage,
  avatarImageOptions = [],
}) {
  const canManageAccounts = currentUser?.role === 'superadmin'

  const cameraVoteMap = useMemo(
    () => buildMergedCameraPortadaVoteMap(db.initiatives, TENANT),
    [db.initiatives],
  )
  const [showSections, setShowSections] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [newPwd, setNewPwd] = useState('')
  const [showResetPwd, setShowResetPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profileDetail, setProfileDetail] = useState(null)
  const [search, setSearch] = useState('')

  const settingsRow = useMemo(
    () => (db.settings || []).find((s) => String(s.id) === 'public'),
    [db.settings],
  )
  const currentUserRow = useMemo(
    () => (db.users || []).find((u) => portalUserLot(u) === String(currentUser?.lotNumber)),
    [db.users, currentUser?.lotNumber],
  )

  const users = useMemo(
    () =>
      (db.users || [])
        .filter((u) => {
          const lot = portalUserLot(u)
          return lot && lot !== TENANT.superadminLot
        })
        .sort((a, b) =>
          portalUserLot(a).localeCompare(portalUserLot(b), 'es', { numeric: true, sensitivity: 'base' }),
        ),
    [db.users],
  )

  const filteredUsers = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return users
    return users.filter(
      (u) =>
        portalUserLot(u).toLowerCase().includes(t) ||
        String(u.fincaName ?? '').toLowerCase().includes(t),
    )
  }, [users, search])

  const handleBlock = (u) => {
    const lotKey = portalUserLot(u)
    const verb = u.blocked ? 'desbloquear' : 'bloquear'
    showConfirm(
      `¿${verb.charAt(0).toUpperCase() + verb.slice(1)} el acceso de ${lotKey}?`,
      async () => {
        try {
          await setUserBlockedStatus(lotKey, !u.blocked)
          logAction?.(u.blocked ? 'DESBLOQUEO_USUARIO' : 'BLOQUEO_USUARIO', lotKey)
          showAlert(`${lotKey} ${u.blocked ? 'desbloqueado' : 'bloqueado'}.`)
          setProfileDetail((p) => (portalUserLot(p) === lotKey ? { ...p, blocked: !u.blocked } : p))
        } catch {
          showAlert('No se pudo cambiar el estado del usuario.')
        }
      },
    )
  }

  const handleResetPwd = async () => {
    if (!newPwd.trim() || newPwd.trim().length < 6)
      return showAlert('La contraseña debe tener al menos 6 caracteres.')
    setSaving(true)
    try {
      await forceUserPlainPassword(portalUserLot(resetTarget), newPwd.trim())
      logAction?.('SUPERADMIN_RESET_CLAVE', portalUserLot(resetTarget))
      showAlert(`Contraseña de ${portalUserLot(resetTarget)} restablecida.`)
      setResetTarget(null)
      setNewPwd('')
      setShowResetPwd(false)
    } catch {
      showAlert('No se pudo restablecer la contraseña.')
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = (u, nextRole) => {
    const lotKey = portalUserLot(u)
    if (nextRole === u.role) return
    const label = nextRole === 'admin' ? 'editor del conjunto' : 'vecino'
    showConfirm(`¿Cambiar el rol de ${lotKey} a ${label}?`, async () => {
      try {
        await updateUserProfile(lotKey, { role: nextRole })
        logAction?.('SUPERADMIN_CAMBIO_ROL', `${lotKey}→${nextRole}`)
        showAlert('Rol actualizado.')
        setProfileDetail((p) => (portalUserLot(p) === lotKey ? { ...p, role: nextRole } : p))
      } catch {
        showAlert('No se pudo actualizar el rol.')
      }
    })
  }

  if (showSections) {
    return (
      <SectionVisibilityView
        settingsRow={settingsRow}
        savePublicSettings={savePublicSettings}
        logAction={logAction}
        showAlert={showAlert}
        onBack={() => setShowSections(false)}
      />
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-black text-stone-900">Administración</h2>
        <p className="text-stone-500 mt-1">
          {canManageAccounts
            ? 'Herramientas de SuperAdmin, configuración del portal y administración de cuentas.'
            : 'Consulta la ficha de cada lote (incluye si tiene acceso a la cámara de portada). Solo el superadmin puede restablecer claves o bloquear cuentas.'}
        </p>
      </div>

      <PortalAdminSettingsPanel
        currentUser={currentUser}
        currentUserRow={currentUserRow}
        settingsRow={settingsRow}
        savePublicSettings={savePublicSettings}
        updateUserProfile={updateUserProfile}
        getStorageUsage={getStorageUsage}
        logAction={logAction}
        showAlert={showAlert}
      />

      {/* Configurar secciones — solo si savePublicSettings está disponible */}
      {savePublicSettings && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-blue-950">Menú público del portal</p>
            <p className="text-xs text-blue-900/80 mt-0.5">
              Activa u oculta secciones y el orden del menú que ven los vecinos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSections(true)}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 text-white px-4 py-2.5 text-sm font-black hover:bg-blue-800 transition-colors"
          >
            <Layers className="w-4 h-4" />
            Configurar secciones
          </button>
        </div>
      )}

      {/* Modal: Restablecer contraseña */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl border border-stone-200 shadow-xl p-6 max-w-sm w-full animate-in zoom-in-95">
            <h3 className="text-lg font-black text-stone-900 mb-1 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-500" /> Restablecer contraseña
            </h3>
            <p className="text-sm text-stone-500 mb-4">
              Para <span className="font-bold text-stone-800">{portalUserLot(resetTarget)}</span>
              {resetTarget.fincaName ? ` · ${resetTarget.fincaName}` : ''}
            </p>
            <div className="relative mb-4">
              <input
                type={showResetPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Nueva contraseña..."
                className="w-full p-3 pr-11 border border-stone-200 rounded-xl bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowResetPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-amber-700 p-0.5"
                aria-label={showResetPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showResetPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setResetTarget(null)
                  setNewPwd('')
                  setShowResetPwd(false)
                }}
                className="flex-1 py-3 rounded-xl border border-stone-200 font-bold text-stone-700 hover:bg-stone-50 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleResetPwd()}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-stone-950 font-black hover:bg-amber-400 text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ver ficha */}
      {profileDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl border border-stone-200 shadow-xl p-6 max-w-md w-full animate-in zoom-in-95 relative">
            <button
              type="button"
              onClick={() => setProfileDetail(null)}
              className="absolute right-4 top-4 p-2 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Avatar + identidad */}
            <div className="flex flex-col items-center text-center pt-2 pb-4 border-b border-stone-100">
              <div className="w-20 h-20 rounded-2xl bg-emerald-100 border border-emerald-200 overflow-hidden flex items-center justify-center text-2xl shrink-0">
                <AvatarDisplay
                  avatarId={profileDetail.avatar}
                  imageOptions={avatarImageOptions}
                  fallbackText="🏡"
                  className="text-2xl leading-none"
                  imgClassName="h-full w-full object-cover"
                />
              </div>
              <p className="text-lg font-black text-stone-900 mt-3">
                {profileDetail.fincaName || portalUserLot(profileDetail)}
              </p>
              {profileDetail.fincaName && (
                <p className="text-sm font-bold text-stone-500">{portalUserLot(profileDetail)}</p>
              )}
              <div className="mt-2 flex items-center gap-2 flex-wrap justify-center">
                <RoleBadge role={profileDetail.role} />
                {profileDetail.blocked && (
                  <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    Bloqueado
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 w-full rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-left">
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-900">
                Acceso cámara de portada
              </p>
              <p className="text-sm font-bold text-stone-900 mt-1">
                {labelCameraPortadaAccess(resolveCameraPortadaAccessFromStores(profileDetail, cameraVoteMap))}
              </p>
              {typeof profileDetail.cameraPortadaAccessUpdatedAt === 'number' && (
                <p className="text-[10px] text-stone-500 mt-1">
                  Actualizado: {new Date(profileDetail.cameraPortadaAccessUpdatedAt).toLocaleString('es-CO')}
                </p>
              )}
            </div>

            {/* Cambio de rol (superadmin, no puede cambiar su propio lote) */}
            {canManageAccounts && portalUserLot(profileDetail) !== TENANT.superadminLot && (
              <div className="mt-5">
                <label className="block text-xs font-black text-stone-500 uppercase tracking-wide mb-1">
                  Rol en el portal
                </label>
                <select
                  value={profileDetail.role === 'admin' ? 'admin' : 'user'}
                  onChange={(e) => handleRoleChange(profileDetail, e.target.value)}
                  className="w-full p-3 rounded-xl border border-stone-200 bg-stone-50 font-bold text-stone-800 outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="user">Vecino</option>
                  <option value="admin">Editor del conjunto (Admin)</option>
                </select>
                <p className="mt-1.5 text-[11px] text-stone-400">
                  Solo el superadmin puede cambiar roles.
                </p>
              </div>
            )}

            {/* Acciones (solo superadmin) */}
            {canManageAccounts && (
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetTarget(profileDetail)
                    setNewPwd('')
                    setShowResetPwd(false)
                    setProfileDetail(null)
                  }}
                  className="w-full py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 font-black text-sm hover:bg-amber-100 transition-colors"
                >
                  Restablecer contraseña…
                </button>
                <button
                  type="button"
                  onClick={() => handleBlock(profileDetail)}
                  className={`w-full py-2.5 rounded-xl font-black text-sm border transition-colors ${
                    profileDetail.blocked
                      ? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
                      : 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                  }`}
                >
                  {profileDetail.blocked ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setProfileDetail(null)}
              className="mt-4 w-full py-3 rounded-xl border border-stone-200 font-bold text-stone-700 hover:bg-stone-50 text-sm transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Buscador */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por lote o nombre de finca…"
        className="w-full max-w-sm border border-stone-200 rounded-xl px-4 py-2.5 text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-emerald-400"
      />

      {/* Lista de usuarios */}
      {filteredUsers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center">
          <Users className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 font-bold">
            {search ? 'No se encontraron resultados.' : 'No hay lotes registrados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => (
            <div
              key={portalUserLot(u)}
              className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 flex flex-col sm:flex-row items-start gap-4"
            >
              {/* Avatar */}
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-emerald-100 border border-emerald-200 overflow-hidden flex items-center justify-center text-xl">
                <AvatarDisplay
                  avatarId={u.avatar}
                  imageOptions={avatarImageOptions}
                  fallbackText="🏡"
                  className="text-xl leading-none"
                  imgClassName="h-full w-full object-cover"
                />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-black text-stone-900">{u.fincaName || portalUserLot(u)}</p>
                  {u.blocked && (
                    <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      Bloqueado
                    </span>
                  )}
                  <RoleBadge role={u.role} />
                </div>
                {u.fincaName && (
                  <p className="text-sm text-stone-500 font-bold mt-0.5">{portalUserLot(u)}</p>
                )}
                <p className="text-xs text-stone-500 mt-1">
                  Cámara portada:{' '}
                  <span className="font-bold text-stone-700">
                    {labelCameraPortadaAccess(resolveCameraPortadaAccessFromStores(u, cameraVoteMap))}
                  </span>
                </p>
              </div>

              {/* Acciones */}
              <div className="flex flex-wrap gap-2 shrink-0 w-full sm:w-auto sm:justify-end">
                <button
                  type="button"
                  onClick={() => setProfileDetail(u)}
                  className="inline-flex items-center gap-1.5 bg-white border border-stone-200 text-stone-800 px-3 py-2 rounded-xl font-bold text-sm hover:bg-stone-50 transition-colors"
                >
                  <UserCircle className="w-4 h-4" />
                  Ver ficha
                </button>
                {canManageAccounts && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setResetTarget(u)
                        setNewPwd('')
                        setShowResetPwd(false)
                      }}
                      title="Restablecer contraseña"
                      className="inline-flex items-center gap-1.5 bg-white border border-amber-200 text-amber-700 px-3 py-2 rounded-xl font-bold text-sm hover:bg-amber-50 transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlock(u)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm border transition-colors ${
                        u.blocked
                          ? 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
                          : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                      }`}
                    >
                      {u.blocked ? (
                        <>
                          <Shield className="w-4 h-4" /> Desbloquear
                        </>
                      ) : (
                        <>
                          <ShieldOff className="w-4 h-4" /> Bloquear
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
