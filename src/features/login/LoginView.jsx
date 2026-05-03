import { useState } from 'react'
import { AlertCircle, User, Lock, Eye, EyeOff, ChevronRight, CheckCircle2 } from 'lucide-react'
import { SITE_BRAND_TITLE, checkStrongPassword, portalUserLot } from '../../shared/utils.js'
import { TENANT } from '../../tenant.config.js'
import { BRAND_LOGO_SRC } from '../../brandAssets.js'
import { updateUserPlainPassword } from '../../firestore/portalData.js'

const LoginView = ({ db, onLogin }) => {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [cpUser, setCpUser] = useState('')
  const [cpCurrent, setCpCurrent] = useState('')
  const [pwNext, setPwNext] = useState('')
  const [pwAgain, setPwAgain] = useState('')
  const [showCpCurrent, setShowCpCurrent] = useState(false)
  const [showCpNext, setShowCpNext] = useState(false)
  const [showCpAgain, setShowCpAgain] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    const userFormat = username.trim().replace(/\s+/g, '')
    const foundUser = db.users?.find((u) => portalUserLot(u).toLowerCase() === userFormat.toLowerCase())

    if (!foundUser) return setError('Usuario no encontrado. Escríbelo sin espacios (Ej: Lote1A).')
    if (foundUser.blocked)
      return setError('Tu usuario está bloqueado temporalmente. Contacta a quienes coordinan el portal.')
    if (foundUser.password !== password) return setError('Contraseña incorrecta.')

    const lotKey = portalUserLot(foundUser)
    onLogin({
      lotNumber: lotKey,
      shortLot: lotKey.replace(/Lote/i, 'L'),
      role: foundUser.role,
      password,
    })
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    const userFormat = cpUser.trim().replace(/\s+/g, '')
    const foundUser = db.users?.find((u) => portalUserLot(u).toLowerCase() === userFormat.toLowerCase())
    if (!foundUser) return setError('Escribe tu usuario (Ej: Lote1A) para cambiar la contraseña.')
    if (foundUser.blocked)
      return setError('Tu usuario está bloqueado. Alguien con permiso para editar usuarios debe desbloquearlo antes del cambio de clave.')
    if (!cpCurrent) return setError('Escribe tu contraseña actual para cambiarla.')
    if (pwNext !== pwAgain) return setError('La nueva contraseña y la repetición no coinciden.')
    const strong = checkStrongPassword(pwNext.trim())
    if (!strong.ok)
      return setError('La nueva clave debe tener mínimo 8 caracteres e incluir letras y números.')
    setPwBusy(true)
    try {
      await updateUserPlainPassword(portalUserLot(foundUser), cpCurrent, pwNext.trim())
      setMode('login')
      setCpUser('')
      setCpCurrent('')
      setPwNext('')
      setPwAgain('')
      setSuccessMsg('Contraseña actualizada. Ya puedes ingresar con tu nueva clave.')
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      if (code === 'WRONG_PASSWORD') setError('La contraseña actual no es correcta.')
      else setError('No se pudo cambiar la contraseña. Revisa conexión o reglas de Firestore.')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-portal-canvas flex flex-col">
      <div className="flex-1 flex justify-center items-center p-4">
        <div className="w-full max-w-md bg-white/95 rounded-[2rem] shadow-xl shadow-emerald-100/40 overflow-hidden border border-emerald-100/50 ring-1 ring-amber-100/30">
          <div className="bg-emerald-800 flex flex-col items-center justify-center text-center text-white min-h-[min(52vh,320px)] sm:min-h-[340px] px-4 py-6 sm:py-8">
            <img
              src={BRAND_LOGO_SRC}
              alt={TENANT.name}
              className="w-full max-w-[96%] h-auto max-h-[min(42vh,280px)] sm:max-h-[300px] object-contain object-center drop-shadow-md flex-1 min-h-0 mb-4"
            />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-snug shrink-0">
              {SITE_BRAND_TITLE}
            </h1>
          </div>
          <div className="p-8">
            {mode === 'login' ? (
              <>
                <p className="text-stone-600 text-sm text-center mb-6 leading-relaxed">
                  Portal comunitario para residentes. Ingresa con tu usuario de lote.
                </p>
                {error && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center text-sm mb-6 border border-red-100">
                    <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="relative">
                    <User className="w-5 h-5 absolute left-4 top-4 text-stone-500" />
                    <input
                      type="text"
                      placeholder="Usuario (Ej. Lote1A)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-12 p-4 rounded-xl border border-stone-200 bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-4 top-4 text-stone-500" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 p-4 rounded-xl border border-stone-200 bg-stone-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-4 top-4 text-stone-500 hover:text-emerald-600 transition-colors"
                    >
                      {showPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-emerald-600 text-white p-4 rounded-xl font-bold hover:bg-emerald-700 flex justify-center items-center transition-all mt-2"
                  >
                    Ingresar al Portal <ChevronRight className="w-5 h-5 ml-2" />
                  </button>
                </form>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setError('')
                      setMode('change')
                    }}
                    className="w-full text-xs font-bold text-emerald-700 hover:text-emerald-800 underline-offset-4 hover:underline"
                  >
                    ¿Quieres cambiar tu contraseña?
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-black text-stone-900">Cambiar contraseña</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login')
                      setError('')
                      setSuccessMsg('')
                    }}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Volver al ingreso
                  </button>
                </div>
                {error && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center text-sm mb-4 border border-red-100">
                    <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl flex items-center text-sm mb-4 border border-emerald-100">
                    <CheckCircle2 className="w-5 h-5 mr-2 shrink-0" />
                    {successMsg}
                  </div>
                )}
                <p className="text-xs text-stone-600 mb-4 leading-relaxed">
                  Requisitos: mínimo 8 caracteres, incluir letras y números.
                </p>
                <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Usuario (Ej. Lote1A)"
                    value={cpUser}
                    onChange={(e) => setCpUser(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                  <div className="relative">
                    <input
                      type={showCpCurrent ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Contraseña actual"
                      value={cpCurrent}
                      onChange={(e) => setCpCurrent(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 pr-11 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpCurrent((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-emerald-600"
                      aria-label={showCpCurrent ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                    >
                      {showCpCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showCpNext ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Nueva contraseña"
                      value={pwNext}
                      onChange={(e) => setPwNext(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 pr-11 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpNext((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-emerald-600"
                      aria-label={showCpNext ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                    >
                      {showCpNext ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showCpAgain ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repetir nueva contraseña"
                      value={pwAgain}
                      onChange={(e) => setPwAgain(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 pr-11 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpAgain((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-emerald-600"
                      aria-label={showCpAgain ? 'Ocultar repetición de contraseña' : 'Mostrar repetición de contraseña'}
                    >
                      {showCpAgain ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={pwBusy}
                    className="w-full rounded-xl bg-emerald-700 text-white py-3 font-bold text-sm hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {pwBusy ? 'Guardando…' : 'Guardar nueva contraseña'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
      <footer className="text-center text-[11px] sm:text-xs text-stone-500 py-6 px-6 border-t border-emerald-100/50">
        <p className="max-w-md mx-auto leading-relaxed text-stone-600">
          <span className="font-bold text-stone-700">Aviso importante: </span>
          Este sitio es una herramienta voluntaria de convivencia para quienes viven o disfrutan el {TENANT.locationDescription}. No
          reemplaza ni actúa como administración de propiedad horizontal, parcelación ni entidad similar: no hay órgano de
          gobierno, junta de accionales ni responsabilidad compartida derivada del uso del portal. Las aportaciones o
          recaudos publicados buscan proyectos de mejora del sector; son a voluntad de quien aporta y no constituyen cuotas
          obligatorias ni actos de la administración. El uso del portal es opcional. La información aquí es de carácter
          general y comunitario; no se trata de un registro de datos personales sensibles ni de un canal oficial de
          gestión legal o contable. Si no estás de acuerdo con lo anterior, te pedimos no utilices el sitio.
        </p>
      </footer>
    </div>
  )
}

export default LoginView
