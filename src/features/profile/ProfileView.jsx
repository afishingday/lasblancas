import { useState, useEffect, useMemo } from 'react'
import { Eye, EyeOff, Lock, ChevronRight } from 'lucide-react'
import { checkStrongPassword, portalUserLot } from '../../shared/utils.js'
import AvatarDisplay from '../../shared/AvatarDisplay.jsx'
import PortalAvatarPicker from '../../shared/PortalAvatarPicker.jsx'
import { updateUserPlainPassword, updateUserProfile } from '../../firestore/portalData.js'
import { savePortalSession } from '../../portalSession.js'

const ChangePasswordPanel = ({ lotNumber, showAlert, logAction }) => {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showAgain, setShowAgain] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (next !== again) return showAlert('La nueva contraseña y la repetición no coinciden.')
    const strong = checkStrongPassword(next.trim())
    if (!strong.ok)
      return showAlert('La nueva clave debe tener mínimo 8 caracteres e incluir letras y números.')
    setBusy(true)
    try {
      await updateUserPlainPassword(lotNumber, current, next.trim())
      savePortalSession(lotNumber, next.trim())
      logAction?.('CAMBIAR_CONTRASENA', 'Actualizó su contraseña desde el portal')
      showAlert('Contraseña actualizada correctamente.')
      setCurrent('')
      setNext('')
      setAgain('')
      setOpen(false)
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'WRONG_PASSWORD') showAlert('La contraseña actual no es correcta.')
      else if (code === 'USER_NOT_FOUND') showAlert('No se encontró tu usuario en la base de datos.')
      else if (code === 'INVALID_NEW_PASSWORD') showAlert('La nueva contraseña no es válida.')
      else showAlert('No se pudo guardar. Revisa la conexión o las reglas de Firestore.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-xs font-bold text-stone-800"
      >
        <span className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" /> Cambiar contraseña
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2 border-t border-stone-100 pt-3">
          <p className="text-[10px] leading-snug text-stone-600">
            La clave se guarda en Firestore en texto plano (igual que el login). Cada cambio usa una lectura y una
            escritura; en el plan gratuito suele ser de coste despreciable.
          </p>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Contraseña actual"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 pr-8 text-xs font-medium outline-none focus:border-emerald-500"
            />
            <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showNext ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Nueva contraseña"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 pr-8 text-xs font-medium outline-none focus:border-emerald-500"
            />
            <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showNext ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showAgain ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repetir nueva contraseña"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 pr-8 text-xs font-medium outline-none focus:border-emerald-500"
            />
            <button type="button" onClick={() => setShowAgain((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showAgain ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      )}
    </div>
  )
}

const ProfileView = ({ currentUser, db, showAlert, logAction, avatarImageOptions = [] }) => {
  const currentUserRow = useMemo(
    () => (db.users || []).find((u) => portalUserLot(u) === String(currentUser?.lotNumber)),
    [db.users, currentUser?.lotNumber],
  )
  const [fincaName, setFincaName] = useState('')
  const [avatarId, setAvatarId] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busyPass, setBusyPass] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showAgain, setShowAgain] = useState(false)

  useEffect(() => {
    setFincaName((currentUserRow?.fincaName || '').trim())
    setAvatarId((currentUserRow?.avatar || '').trim())
  }, [currentUserRow?.fincaName, currentUserRow?.avatar])

  const saveProfile = async (e) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await updateUserProfile(currentUser.lotNumber, {
        fincaName: fincaName.trim(),
        avatar: avatarId || '',
      })
      logAction?.('ACTUALIZAR_PERFIL', 'Actualizó nombre de finca y avatar')
      showAlert('Perfil actualizado correctamente.')
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar el perfil.')
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (next !== again) return showAlert('La nueva contraseña y la repetición no coinciden.')
    const strong = checkStrongPassword(next.trim())
    if (!strong.ok)
      return showAlert('La nueva clave debe tener mínimo 8 caracteres e incluir letras y números.')
    setBusyPass(true)
    try {
      await updateUserPlainPassword(currentUser.lotNumber, current, next.trim())
      savePortalSession(currentUser.lotNumber, next.trim())
      logAction?.('CAMBIAR_CONTRASENA', 'Actualizó su contraseña desde Perfil')
      showAlert('Contraseña actualizada correctamente.')
      setCurrent('')
      setNext('')
      setAgain('')
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'WRONG_PASSWORD') showAlert('La contraseña actual no es correcta.')
      else if (code === 'USER_NOT_FOUND') showAlert('No se encontró tu usuario en la base de datos.')
      else if (code === 'INVALID_NEW_PASSWORD') showAlert('La nueva contraseña no es válida.')
      else showAlert('No se pudo guardar. Revisa la conexión o las reglas de Firestore.')
    } finally {
      setBusyPass(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-100 shadow-sm">
        <h2 className="text-2xl md:text-3xl font-black text-stone-900">Perfil</h2>
        <p className="text-stone-600 mt-1">Personaliza cómo te ve la comunidad en el portal.</p>
      </div>

      <form onSubmit={(e) => void saveProfile(e)} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-3xl overflow-hidden shrink-0">
            <AvatarDisplay
              avatarId={avatarId}
              imageOptions={avatarImageOptions}
              fallbackText="🏡"
              className="text-3xl leading-none"
              imgClassName="h-16 w-16 w-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-black text-stone-900">{currentUser?.lotNumber}</p>
            <p className="text-xs text-stone-600">
              Saludo actual: Familia {(fincaName || '').trim() || currentUser?.lotNumber}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-stone-800 mb-1">Nombre de la finca (opcional)</label>
          <input
            value={fincaName}
            onChange={(e) => setFincaName(e.target.value)}
            placeholder="Ej: La Esperanza"
            className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-400"
          />
          <p className="text-[11px] text-stone-600 mt-1">
            Si lo dejas vacío, el saludo usará el lote automáticamente.
          </p>
        </div>

        <div>
          <PortalAvatarPicker value={avatarId} onChange={setAvatarId} />
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {savingProfile ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </form>

      <form onSubmit={(e) => void savePassword(e)} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-stone-900">Cambiar contraseña</h3>
        <div className="relative">
          <input
            type={showCurrent ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Contraseña actual"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
          />
          <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700">
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showNext ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Nueva contraseña"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
          />
          <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700">
            {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <div className="relative">
          <input
            type={showAgain ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repetir nueva contraseña"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
          />
          <button type="button" onClick={() => setShowAgain((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700">
            {showAgain ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-stone-600">La clave debe tener mínimo 8 caracteres e incluir letras y números.</p>
        <button
          type="submit"
          disabled={busyPass}
          className="bg-stone-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-stone-800 disabled:opacity-50"
        >
          {busyPass ? 'Guardando…' : 'Guardar nueva contraseña'}
        </button>
      </form>

    </div>
  )
}

export const ForcePasswordChangeModal = ({ lotNumber, onSuccess, onLogout }) => {
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [showNext, setShowNext] = useState(false)
  const [showAgain, setShowAgain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const defaultPassword = `${lotNumber}2026`

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (next !== again) return setError('Las contraseñas no coinciden.')
    if (next.trim() === defaultPassword) return setError('La nueva clave no puede ser igual a la actual.')
    const strong = checkStrongPassword(next.trim())
    if (!strong.ok) return setError('Mínimo 8 caracteres e incluir letras y números.')
    setBusy(true)
    try {
      await updateUserPlainPassword(lotNumber, defaultPassword, next.trim())
      savePortalSession(lotNumber, next.trim())
      onSuccess(next.trim())
    } catch {
      setError('No se pudo guardar. Revisa la conexión e intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-emerald-950/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-[2rem] border border-emerald-200/70 bg-gradient-to-b from-white via-white to-emerald-50/45 p-7 shadow-2xl ring-1 ring-white/90 animate-in zoom-in-95 duration-200">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
            <Lock className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h3 className="text-xl font-black text-stone-900">Cambia tu contraseña</h3>
            <p className="text-xs text-stone-500">Paso obligatorio en el primer ingreso</p>
          </div>
        </div>
        <p className="mt-3 mb-5 text-sm leading-snug text-stone-600">
          Por seguridad, la contraseña de acceso inicial debe ser reemplazada antes de continuar. Elige una clave personal que solo conozcas tú.
        </p>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="relative">
            <input
              type={showNext ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Nueva contraseña"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-4 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
            />
            <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showAgain ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repetir nueva contraseña"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-4 py-3 pr-10 text-sm font-medium outline-none focus:border-emerald-500"
            />
            <button type="button" onClick={() => setShowAgain((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              {showAgain ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-stone-500">Mínimo 8 caracteres, con letras y números.</p>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 py-3 font-black text-white shadow-md hover:from-emerald-700 hover:to-blue-700 disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Actualizar contraseña y continuar'}
          </button>
        </form>
        <button
          type="button"
          onClick={onLogout}
          className="mt-4 w-full rounded-xl border border-stone-200 bg-white py-2.5 text-xs font-bold text-stone-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          Salir del portal
        </button>
      </div>
    </div>
  )
}

export { ChangePasswordPanel }
export default ProfileView
