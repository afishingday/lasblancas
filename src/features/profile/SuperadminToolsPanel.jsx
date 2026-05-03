import { useMemo, useState } from 'react'
import { AlertCircle, ChevronDown, Eye, EyeOff, X } from 'lucide-react'
import AvatarDisplay from '../../shared/AvatarDisplay.jsx'
import PortalAvatarPicker from '../../shared/PortalAvatarPicker.jsx'

/**
 * Panel de superadmin: clave, bloqueo y avatares. `pageMode` = sección central del portal; `embedded` = sin encabezado.
 */
export default function SuperadminToolsPanel({
  db,
  showAlert,
  logAction,
  updateUserProfile,
  forceUserPlainPassword,
  setUserBlockedStatus,
  avatarImageOptions = [],
  embedded = false,
  pageMode = false,
}) {
  const [accOpen, setAccOpen] = useState(() => new Set(['clave']))

  const toggleAcc = (id) => {
    setAccOpen((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div
      className={`flex flex-col min-h-0 ${
        pageMode
          ? 'rounded-3xl border border-rose-200/60 bg-white/95 shadow-sm ring-1 ring-rose-100/30 overflow-hidden'
          : embedded
            ? 'h-full rounded-xl border border-rose-100/70 bg-white/60 overflow-hidden'
            : 'rounded-2xl border border-rose-200/70 bg-white/95 shadow-sm ring-1 ring-rose-100/40'
      }`}
    >
      {!embedded && !pageMode && (
        <div className="shrink-0 px-3.5 py-2.5 border-b border-rose-100/80 bg-gradient-to-r from-rose-50/40 to-amber-50/30">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-rose-900/90">Administración de usuarios</h2>
        </div>
      )}
      <ClavesSection
        db={db}
        showAlert={showAlert}
        logAction={logAction}
        forceUserPlainPassword={forceUserPlainPassword}
        open={accOpen.has('clave')}
        onToggle={() => toggleAcc('clave')}
      />
      <BloqueoSection
        db={db}
        showAlert={showAlert}
        logAction={logAction}
        setUserBlockedStatus={setUserBlockedStatus}
        open={accOpen.has('bloqueo')}
        onToggle={() => toggleAcc('bloqueo')}
      />
      <FotosSection
        db={db}
        showAlert={showAlert}
        logAction={logAction}
        updateUserProfile={updateUserProfile}
        avatarImageOptions={avatarImageOptions}
        open={accOpen.has('fotos')}
        onToggle={() => toggleAcc('fotos')}
      />
    </div>
  )
}

function AccItem({ title, hint, open, onToggle, children }) {
  const border = 'border-stone-100/90'
  return (
    <div className={`border-b ${border} last:border-b-0`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-rose-50/50 transition-colors"
      >
        <span>
          <span className="block text-[12px] font-black text-rose-900/95">{title}</span>
          {hint ? <span className="mt-0.5 block text-[10px] font-medium text-stone-500 leading-snug">{hint}</span> : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-rose-600/80 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-3.5 pb-3.5 pt-0 text-stone-800 space-y-2.5 border-t border-stone-100/80 bg-rose-50/20">{children}</div>}
    </div>
  )
}

function ClavesSection({ db, showAlert, logAction, forceUserPlainPassword, open, onToggle }) {
  const [q, setQ] = useState('')
  const [targetLot, setTargetLot] = useState('')
  const [next, setNext] = useState('')
  const [showNext, setShowNext] = useState(false)
  const [busy, setBusy] = useState(false)

  const users = (db.users || [])
    .map((u) => u.lot)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }))
  const filtered = q.trim() ? users.filter((u) => String(u).toLowerCase().includes(q.trim().toLowerCase())) : users

  const submit = async (e) => {
    e.preventDefault()
    if (!targetLot) return showAlert('Selecciona un usuario.')
    if (!next.trim()) return showAlert('Escribe la nueva contraseña.')
    setBusy(true)
    try {
      await forceUserPlainPassword(targetLot, next.trim())
      logAction?.('SUPERADMIN_RESET_CLAVE', `Reseteó clave de ${targetLot}`)
      showAlert(`Contraseña actualizada para ${targetLot}.`)
      setNext('')
    } catch (err) {
      console.error(err)
      showAlert('No se pudo cambiar la clave. Revisa reglas de Firestore.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccItem
      id="clave"
      title="Cambiar clave a un usuario"
      hint="Reasigna la contraseña sin conocer la actual."
      open={open}
      onToggle={onToggle}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar lote…"
          className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[11px] font-medium outline-none focus:border-rose-400"
        />
        <select
          value={targetLot}
          onChange={(e) => setTargetLot(e.target.value)}
          className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[11px] font-bold outline-none focus:border-rose-400"
        >
          <option value="">Selecciona usuario…</option>
          {filtered.slice(0, 120).map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <div className="relative">
          <input
            type={showNext ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Nueva contraseña"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 pr-8 text-[11px] font-medium outline-none focus:border-rose-400"
          />
          <button
            type="button"
            onClick={() => setShowNext((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
            aria-label={showNext ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showNext ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-rose-600 py-2 text-[11px] font-black text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? 'Guardando…' : 'Guardar nueva clave'}
        </button>
        <p className="text-[9px] text-stone-500 leading-snug">
          <AlertCircle className="inline h-2.5 w-2.5 -mt-0.5 mr-0.5" /> Requiere reglas de Firestore que permitan
          a superadmin editar usuarios.
        </p>
      </form>
    </AccItem>
  )
}

function BloqueoSection({ db, showAlert, logAction, setUserBlockedStatus, open, onToggle }) {
  const [q, setQ] = useState('')

  const users = (db.users || [])
    .map((u) => u.lot)
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' }))
  const filtered = q.trim() ? users.filter((u) => String(u).toLowerCase().includes(q.trim().toLowerCase())) : users

  const toggleBlock = async (lot, shouldBlock) => {
    try {
      await setUserBlockedStatus(lot, shouldBlock)
      logAction?.(shouldBlock ? 'SUPERADMIN_BLOQUEO_USUARIO' : 'SUPERADMIN_DESBLOQUEO_USUARIO', `${shouldBlock ? 'Bloqueó' : 'Desbloqueó'} ${lot}`)
      showAlert(`${lot} ${shouldBlock ? 'fue bloqueado' : 'fue desbloqueado'} correctamente.`)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo actualizar el estado de bloqueo del usuario.')
    }
  }

  return (
    <AccItem
      id="bloqueo"
      title="Bloqueo de ingreso"
      hint="Impedir acceso al portal (por ejemplo por falta de pago o convenio)."
      open={open}
      onToggle={onToggle}
    >
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar lote en la lista…"
        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium outline-none focus:border-rose-400"
      />
      <div className="max-h-[14rem] overflow-y-auto space-y-1.5 pr-0.5 rounded-lg border border-stone-100/90 bg-white p-1.5">
        {filtered.slice(0, 200).map((lot) => {
          const user = (db.users || []).find((u) => u.lot === lot)
          const blocked = Boolean(user?.blocked)
          return (
            <div
              key={lot}
              className="flex items-center justify-between gap-2 rounded-md border border-stone-100 px-2 py-1.5 bg-stone-50/80"
            >
              <span className="text-[10px] font-bold text-stone-800 truncate">{lot}</span>
              <button
                type="button"
                onClick={() => void toggleBlock(lot, !blocked)}
                className={`shrink-0 text-[9px] font-black px-2 py-1 rounded-md ${
                  blocked ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}
              >
                {blocked ? 'Desbloquear' : 'Bloquear'}
              </button>
            </div>
          )
        })}
      </div>
    </AccItem>
  )
}

function FotosSection({ db, showAlert, logAction, updateUserProfile, avatarImageOptions, open, onToggle }) {
  const [q, setQ] = useState('')
  const [editingLot, setEditingLot] = useState(null)
  const [pickValue, setPickValue] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = useMemo(
    () =>
      (db.users || [])
        .filter((u) => u?.lot && u.lot !== 'SuperAdmin')
        .sort((a, b) => String(a.lot).localeCompare(String(b.lot), 'es', { numeric: true, sensitivity: 'base' })),
    [db.users],
  )

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter((r) => String(r.lot).toLowerCase().includes(t))
  }, [rows, q])

  const saveEdit = async () => {
    if (!editingLot) return
    setBusy(true)
    try {
      await updateUserProfile(editingLot, { avatar: pickValue || '' })
      logAction?.('SUPERADMIN_AVATAR', `Actualizó avatar de ${editingLot}`)
      showAlert(`Imagen de perfil actualizada para ${editingLot}.`)
      setEditingLot(null)
    } catch (e) {
      console.error(e)
      showAlert('No se pudo guardar. Revisa permisos de Firestore.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AccItem
        id="fotos"
        title="Fotos de perfil"
        hint="Miniaturas y cambio de imagen para cada lote."
        open={open}
        onToggle={onToggle}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar lote…"
          className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium outline-none focus:border-rose-400"
        />
        <div className="grid grid-cols-1 gap-2 max-h-[min(20rem,45vh)] overflow-y-auto pr-0.5">
          {filtered.map((u) => (
            <div
              key={u.lot}
              className="flex items-center gap-2.5 rounded-xl border border-stone-200/80 bg-white px-2.5 py-2 shadow-sm/5"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-stone-200 flex items-center justify-center bg-stone-50 text-base">
                <AvatarDisplay
                  avatarId={u.avatar}
                  imageOptions={avatarImageOptions}
                  fallbackText={u.lot.replace(/Lote/i, 'L').slice(0, 2)}
                  className="text-sm font-black leading-none"
                  imgClassName="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-stone-900 leading-tight truncate">{u.lot}</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingLot(u.lot)
                    setPickValue((u.avatar || '').trim())
                  }}
                  className="mt-0.5 text-[10px] font-bold text-rose-700 hover:underline"
                >
                  Cambiar imagen
                </button>
              </div>
            </div>
          ))}
        </div>
      </AccItem>
      {editingLot && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-stone-900/45 backdrop-blur-sm">
          <div
            className="w-full sm:max-w-lg sm:max-h-[90vh] h-[min(100%,36rem)] sm:rounded-2xl overflow-y-auto border border-stone-200 sm:border bg-white p-4 sm:shadow-2xl rounded-t-2xl"
            role="dialog"
            aria-modal
            aria-label={`Avatar de ${editingLot}`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-sm font-black text-stone-900">Foto de {editingLot}</h4>
              <button
                type="button"
                onClick={() => setEditingLot(null)}
                className="p-2 rounded-lg text-stone-500 hover:bg-stone-100"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PortalAvatarPicker value={pickValue} onChange={setPickValue} />
            <div className="mt-3 flex flex-wrap gap-2 justify-end border-t border-stone-100 pt-3">
              <button
                type="button"
                onClick={() => setEditingLot(null)}
                className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveEdit()}
                className="px-3 py-2 rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
