import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LayoutDashboard,
  CheckSquare,
  TrendingUp,
  Phone,
  Users,
  Map as MapIcon,
  Menu,
  X,
  Info,
  AlertCircle,
  Newspaper,
  Rocket,
  User,
  LogOut,
  Loader2,
  ScrollText,
  Camera,
  UserCog,
  Leaf,
} from 'lucide-react'
import { EMPTY_DB } from './initialData.js'
import {
  subscribePortalDb,
  seedFirestoreIfEmpty,
  syncUsersIfNeeded,
  ensurePublicSettings,
  savePublicSettings,
  appendLog,
  addNewsPost,
  updateNewsPost,
  deleteNewsPost,
  saveInitiative,
  convertInitiativeToFund,
  updateFundStatus,
  updateFundRaisedGoal,
  addFund,
  deleteFund,
  upsertPortalEvent,
  deletePortalEvent,
  deleteInitiative,
  setInitiativeSuppressed,
  upsertDirectoryRow,
  deleteDirectoryRow,
  upsertMapLayer,
  deleteMapLayer,
  updateUserProfile,
  forceUserPlainPassword,
  setUserBlockedStatus,
  recordGuideInteraction,
  toggleGuideReaction,
  getStorageUsage,
  addSharingPost,
  deleteSharingPost,
  setNewsPostSuppressed,
  acceptTerms,
} from './firestore/portalData.js'
import { savePortalSession, clearPortalSession, readPortalSession } from './portalSession.js'
import { BRAND_LOGO_SRC } from './brandAssets.js'
import { setPortalAnalyticsUser, trackPortalEvent } from './analytics.js'
import { SITE_BRAND_TITLE, isAdminLike, portalUserLot } from './shared/utils.js'
import { applyTheme, DEFAULT_THEME_ID } from './shared/portalThemes.js'
import AvatarDisplay from './shared/AvatarDisplay.jsx'
import { loadPortalAvatarImages } from './avatarImages.js'
import { getVisibleNavEntries } from './portalNavConfig.js'
import { TENANT } from './tenant.config.js'
import ErrorBoundary from './shared/ErrorBoundary.jsx'
import TermsModal from './shared/TermsModal.jsx'
import PortalFooter from './shared/PortalFooter.jsx'
import LoginView from './features/login/LoginView.jsx'
import NewsView from './features/news/NewsView.jsx'
import DashboardView from './features/dashboard/DashboardView.jsx'
import ProposalsView from './features/proposals/ProposalsView.jsx'
import InitiativesView from './features/initiatives/InitiativesView.jsx'
import FundsView from './features/funds/FundsView.jsx'
import DirectoriesView from './features/directories/DirectoriesView.jsx'
import MapView from './features/map/MapView.jsx'
import NaturalezaView from './features/naturaleza/NaturalezaView.jsx'
import ProfileView, { ChangePasswordPanel, ForcePasswordChangeModal } from './features/profile/ProfileView.jsx'
import AdministerUsersView from './features/profile/AdministerUsersView.jsx'
import LogsView from './features/logs/LogsView.jsx'
import MuroComunitarioView from './features/muro/MuroComunitarioView.jsx'

const FORCE_PWD_EXEMPT = new Set(TENANT.forcePwdExempt)
const isDefaultPassword = (lot, password) => password === `${lot}2026`

function PortalApp() {
  const [db, setDb] = useState(EMPTY_DB)
  const [dataReady, setDataReady] = useState(false)
  const [sessionRehydrated, setSessionRehydrated] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [activeTab, setActiveTab] = useState('news')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [mustChangePwd, setMustChangePwd] = useState(false)
  const [acceptingTerms, setAcceptingTerms] = useState(false)
  const [newsDraftFromFund, setNewsDraftFromFund] = useState(null)
  const [avatarImageOptions, setAvatarImageOptions] = useState([])
  const consumeNewsDraftFromFund = useCallback(() => setNewsDraftFromFund(null), [])
  const openNewsComposerFromFund = useCallback((fund, opts = {}) => {
    setNewsDraftFromFund({
      key: Date.now(),
      fund: { ...fund },
      aiMilestone: Boolean(opts?.aiMilestone),
    })
    setActiveTab('news')
  }, [])

  useEffect(() => {
    let unsub = () => {}
    let cancelled = false
    ;(async () => {
      try {
        await seedFirestoreIfEmpty()
        await syncUsersIfNeeded()
        await ensurePublicSettings()
      } catch (err) {
        console.error(err)
      }
      if (cancelled) return
      unsub = subscribePortalDb(setDb, () => {
        if (!cancelled) setDataReady(true)
      })
    })()
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  useEffect(() => {
    if (!dataReady) return

    const raw = readPortalSession()
    if (!raw) {
      setSessionRehydrated(true)
      return
    }

    const users = db.users ?? []
    if (users.length === 0) {
      const t = window.setTimeout(() => setSessionRehydrated(true), 2000)
      return () => window.clearTimeout(t)
    }

    try {
      const { lotNumber, password } = raw
      const user = users.find(
        (u) => portalUserLot(u).toLowerCase() === String(lotNumber).toLowerCase() && u.password === password,
      )
      if (user && !user.blocked) {
        const lotKey = portalUserLot(user)
        setCurrentUser({
          lotNumber: lotKey,
          shortLot: lotKey.replace(/Lote/i, 'L'),
          role: user.role,
        })
        if (!FORCE_PWD_EXEMPT.has(lotKey) && isDefaultPassword(lotKey, user.password)) {
          setMustChangePwd(true)
        }
      } else {
        clearPortalSession()
      }
    } catch {
      clearPortalSession()
    }
    setSessionRehydrated(true)
  }, [dataReady, db.users])

  const handleAcceptTerms = async () => {
    if (!currentUser?.lotNumber) return
    setAcceptingTerms(true)
    try {
      await acceptTerms(currentUser.lotNumber, TENANT.legal.termsVersion)
      appendLog({
        user: currentUser.lotNumber,
        action: 'ACEPTO_TERMINOS',
        details: `Términos v${TENANT.legal.termsVersion}`,
        timestamp: new Date().toLocaleString('es-CO'),
      }).catch(console.error)
    } catch (err) {
      console.error(err)
    } finally {
      setAcceptingTerms(false)
    }
  }

  const logAction = (action, details) => {
    if (!currentUser) return
    appendLog({
      user: currentUser.lotNumber,
      action,
      details,
      timestamp: new Date().toLocaleString('es-CO'),
    }).catch(console.error)
    void trackPortalEvent('portal_action', {
      action_name: String(action || '').slice(0, 40),
      role: currentUser.role || 'unknown',
    })
  }

  useEffect(() => {
    void setPortalAnalyticsUser(currentUser)
  }, [currentUser])

  useEffect(() => {
    void loadPortalAvatarImages().then(setAvatarImageOptions)
  }, [])

  useEffect(() => {
    if (!currentUser?.lotNumber) return
    void trackPortalEvent('portal_tab_view', {
      tab_name: String(activeTab || '').slice(0, 40),
      role: currentUser.role || 'unknown',
    })
  }, [activeTab, currentUser?.lotNumber, currentUser?.role])

  const settingsRow = useMemo(
    () => (db.settings || []).find((s) => String(s.id) === 'public'),
    [db.settings],
  )
  const currentUserRow = useMemo(
    () => (db.users || []).find((u) => portalUserLot(u) === String(currentUser?.lotNumber)),
    [db.users, currentUser?.lotNumber],
  )

  useEffect(() => {
    applyTheme(settingsRow?.portalTheme ?? DEFAULT_THEME_ID)
  }, [settingsRow?.portalTheme])

  const menu = useMemo(() => {
    if (!currentUser?.role) return []
    const iconById = {
      news: Newspaper,
      dashboard: LayoutDashboard,
      initiatives: CheckSquare,
      proposals: Rocket,
      muro: Camera,
      funds: TrendingUp,
      services: Phone,
      community: Users,
      naturaleza: Leaf,
      map: MapIcon,
      profile: User,
      adminUsers: UserCog,
      logs: ScrollText,
    }
    const selfHiddenIds = currentUser.role === 'superadmin' ? currentUserRow?.superadminNavHidden : []
    return getVisibleNavEntries(currentUser.role, settingsRow, selfHiddenIds)
      .map((entry) => ({ ...entry, icon: iconById[entry.id] }))
      .filter((item) => item.icon)
  }, [currentUser, currentUserRow?.superadminNavHidden, settingsRow])

  useEffect(() => {
    if (!currentUser) return
    if (menu.length === 0) return
    if (!menu.some((i) => i.id === activeTab)) setActiveTab(menu[0].id)
  }, [currentUser, menu, activeTab])

  const showAlert = (message) => setDialog({ type: 'alert', message })
  const showConfirm = (message, onConfirm) => setDialog({ type: 'confirm', message, onConfirm })

  if (!dataReady || !sessionRehydrated) {
    return (
      <div className="min-h-screen bg-portal-canvas flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-pt-600 animate-spin mx-auto mb-4" aria-hidden />
          <p className="text-stone-700 font-bold">
            {!dataReady ? 'Sincronizando con la base de datos…' : 'Restaurando sesión…'}
          </p>
        </div>
      </div>
    )
  }

  if (!currentUser)
    return (
      <LoginView
        db={db}
        onLogin={(user) => {
          savePortalSession(user.lotNumber, user.password)
          setCurrentUser({
            lotNumber: user.lotNumber,
            shortLot: user.shortLot,
            role: user.role,
          })
          void trackPortalEvent('portal_login', { role: user.role || 'unknown' })
          appendLog({
            user: user.lotNumber,
            action: 'LOGIN',
            details: 'Ingreso al portal',
            timestamp: new Date().toLocaleString('es-CO'),
          }).catch(console.error)
          if (!FORCE_PWD_EXEMPT.has(user.lotNumber) && isDefaultPassword(user.lotNumber, user.password)) {
            setMustChangePwd(true)
          }
        }}
      />
    )

  const needsTermsAcceptance = Boolean(
    TENANT.legal?.termsVersion &&
    currentUserRow &&
    currentUserRow.termsAcceptedVersion !== TENANT.legal.termsVersion,
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-pt-50/95 via-cyan-50/50 to-amber-50/35 flex font-sans text-stone-900 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-pt-200/35 blur-3xl" />
        <div className="absolute top-1/3 -right-28 h-96 w-96 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-200/25 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.22),transparent_52%),radial-gradient(circle_at_88%_12%,rgba(14,165,233,0.16),transparent_50%),radial-gradient(circle_at_45%_100%,rgba(251,191,36,0.12),transparent_45%)]" />
      </div>
      {dialog && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-pt-900/[0.12] backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-dialog-title"
        >
          <div className="relative max-w-md w-full rounded-[2rem] border border-pt-200/70 bg-gradient-to-b from-white via-white to-pt-50/45 p-6 shadow-2xl shadow-pt-200/35 ring-1 ring-white/90 md:p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center mb-4">
              {dialog.type === 'alert' ? (
                <Info className="w-8 h-8 text-sky-500 mr-3 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="w-8 h-8 text-amber-500 mr-3 shrink-0" aria-hidden />
              )}
              <h3 id="portal-dialog-title" className="text-2xl font-black text-stone-900">
                {dialog.type === 'alert' ? 'Aviso' : 'Confirmar acción'}
              </h3>
            </div>
            <p className="mb-8 text-lg font-medium leading-snug text-stone-600">
              {dialog.message}
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              {dialog.type === 'confirm' && (
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="w-full rounded-xl border border-emerald-200/80 bg-white px-6 py-3 font-bold text-stone-800 shadow-sm transition-colors hover:bg-emerald-50/80 sm:w-auto"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (dialog.type === 'confirm' && dialog.onConfirm) {
                    const run = dialog.onConfirm
                    setDialog(null)
                    queueMicrotask(() => run())
                  } else {
                    setDialog(null)
                  }
                }}
                className={`px-8 py-3 rounded-xl font-black text-white shadow-md transition-colors w-full sm:w-auto ${
                  dialog.type === 'alert'
                    ? 'bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700'
                    : 'bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700'
                }`}
              >
                {dialog.type === 'alert' ? 'Entendido' : 'Sí, continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {needsTermsAcceptance && (
        <TermsModal onAccept={handleAcceptTerms} accepting={acceptingTerms} />
      )}
      {!needsTermsAcceptance && mustChangePwd && (
        <ForcePasswordChangeModal
          lotNumber={currentUser.lotNumber}
          onSuccess={() => {
            setMustChangePwd(false)
            appendLog({
              user: currentUser.lotNumber,
              action: 'CAMBIAR_CONTRASENA',
              details: 'Cambio de clave obligatorio en primer ingreso',
              timestamp: new Date().toLocaleString('es-CO'),
            }).catch(console.error)
          }}
          onLogout={() => {
            void trackPortalEvent('portal_logout', { role: currentUser?.role || 'unknown' })
            clearPortalSession()
            setCurrentUser(null)
            setMustChangePwd(false)
            setActiveTab('news')
          }}
        />
      )}

      {isMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 border-0 bg-emerald-950/[0.14] p-0 backdrop-blur-[2px] transition-opacity md:hidden cursor-pointer w-full h-full"
          aria-label="Cerrar menú"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-gradient-to-b from-white/92 via-pt-50/20 to-amber-50/15 backdrop-blur supports-[backdrop-filter]:from-white/85 border-r border-pt-100/50 z-50 transform transition-transform duration-300 ease-out md:relative md:translate-x-0 flex flex-col shadow-sm shadow-pt-100/20 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-pt-100/50 flex justify-between items-center gap-2 bg-white/55">
          <div className="flex items-center gap-3 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 object-contain shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-pt-800 leading-tight">
              Portal Comunitario
              <span className="block text-sm sm:text-base text-pt-900/90">{TENANT.name}</span>
            </h1>
          </div>
          <button
            type="button"
            className="md:hidden bg-white/60 border border-pt-100/40 p-2 rounded-xl"
            onClick={() => setIsMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-4 flex-1 space-y-1.5 overflow-y-auto">
          {menu.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void trackPortalEvent('portal_nav_click', {
                  to_tab: String(item.id).slice(0, 40),
                })
                setActiveTab(item.id)
                setIsMenuOpen(false)
              }}
              className={`w-full flex items-center px-4 py-3.5 rounded-xl text-sm font-bold transition-colors ring-1 ${
                activeTab === item.id
                  ? 'bg-gradient-to-r from-pt-600/15 to-blue-600/15 ring-pt-100/50 text-pt-800'
                  : 'text-stone-800 hover:bg-white/70 hover:text-stone-900 ring-transparent hover:ring-pt-100/40'
              }`}
            >
              <item.icon
                className={`w-5 h-5 mr-3 ${
                  activeTab === item.id ? 'text-pt-700' : 'text-stone-500'
                }`}
              />{' '}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-6 bg-gradient-to-t from-pt-50/30 to-transparent border-t border-pt-100/40 space-y-3">
          <div className="flex items-start gap-3 mb-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pt-200 to-blue-200 flex items-center justify-center font-black text-pt-900 shrink-0 text-xs overflow-hidden">
              <AvatarDisplay
                avatarId={currentUserRow?.avatar}
                imageOptions={avatarImageOptions}
                fallbackText={currentUser.shortLot}
                className="text-sm leading-none"
                imgClassName="h-10 w-10 object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-stone-900 leading-tight truncate">{currentUser.lotNumber}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-600 mt-0.5">
                {currentUser.role === 'superadmin'
                  ? 'Super editor'
                  : currentUser.role === 'admin'
                    ? 'Editor del conjunto'
                    : 'Vecino'}
              </p>
            </div>
          </div>
          <ChangePasswordPanel
            lotNumber={currentUser.lotNumber}
            showAlert={showAlert}
            logAction={logAction}
          />
          <button
            type="button"
            onClick={() => {
              void trackPortalEvent('portal_logout', { role: currentUser?.role || 'unknown' })
              clearPortalSession()
              setCurrentUser(null)
              setActiveTab('news')
            }}
            className="w-full bg-white/60 border border-pt-100/40 text-stone-800 py-3 rounded-xl font-bold flex items-center justify-center hover:bg-red-50/80 hover:text-red-600 transition-colors text-xs shadow-sm"
          >
            <LogOut className="w-4 h-4 mr-2" /> Salir
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen min-h-0 overflow-hidden relative">
        <header className="bg-gradient-to-r from-white/90 via-pt-50/25 to-amber-50/20 backdrop-blur supports-[backdrop-filter]:from-white/80 border-b border-pt-100/45 p-4 flex items-center justify-between md:hidden shrink-0 z-30 sticky top-0">
          <button type="button" onClick={() => setIsMenuOpen(true)} className="mr-4 bg-white/60 border border-pt-100/40 p-2 rounded-lg">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain shrink-0" />
            <h1 className="font-black text-stone-800 text-xs leading-tight text-center max-w-[180px] sm:max-w-[220px]">
              {SITE_BRAND_TITLE}
            </h1>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pt-100 to-blue-100 text-pt-800 flex items-center justify-center font-black text-xs shadow-sm overflow-hidden">
            <AvatarDisplay
              avatarId={currentUserRow?.avatar}
              imageOptions={avatarImageOptions}
              fallbackText={currentUser?.shortLot}
              className="text-xs leading-none"
              imgClassName="h-9 w-9 object-cover"
            />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth flex flex-col min-h-0">
          <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col min-h-0">
            <div className="flex-1">
              {activeTab === 'news' && (
                <NewsView
                  currentUser={currentUser}
                  db={db}
                  addNewsPost={addNewsPost}
                  updateNewsPost={updateNewsPost}
                  deleteNewsPost={deleteNewsPost}
                  setNewsPostSuppressed={setNewsPostSuppressed}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                  newsDraftFromFund={newsDraftFromFund}
                  onConsumeNewsDraftFromFund={consumeNewsDraftFromFund}
                  setActiveTab={setActiveTab}
                />
              )}
              {activeTab === 'dashboard' && (
                <DashboardView
                  currentUser={currentUser}
                  db={db}
                  setActiveTab={setActiveTab}
                  upsertPortalEvent={upsertPortalEvent}
                  deletePortalEvent={deletePortalEvent}
                  savePublicSettings={savePublicSettings}
                  updateUserProfile={updateUserProfile}
                  addNewsPost={addNewsPost}
                  logAction={logAction}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                />
              )}
              {activeTab === 'initiatives' && (
                <InitiativesView
                  currentUser={currentUser}
                  db={db}
                  saveInitiative={saveInitiative}
                  convertInitiativeToFund={convertInitiativeToFund}
                  deleteInitiative={deleteInitiative}
                  setInitiativeSuppressed={setInitiativeSuppressed}
                  logAction={logAction}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                />
              )}
              {activeTab === 'proposals' && (
                <ProposalsView
                  currentUser={currentUser}
                  db={db}
                  saveInitiative={saveInitiative}
                  deleteInitiative={deleteInitiative}
                  logAction={logAction}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                />
              )}
              {activeTab === 'muro' && (
                <MuroComunitarioView
                  currentUser={currentUser}
                  db={db}
                  addSharingPost={addSharingPost}
                  deleteSharingPost={deleteSharingPost}
                  logAction={logAction}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                />
              )}
              {activeTab === 'funds' && (
                <FundsView
                  currentUser={currentUser}
                  db={db}
                  updateFundStatus={updateFundStatus}
                  updateFundRaisedGoal={updateFundRaisedGoal}
                  addFund={addFund}
                  deleteFund={deleteFund}
                  logAction={logAction}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                  openNewsComposerFromFund={openNewsComposerFromFund}
                />
              )}
              {activeTab === 'services' && (
                <DirectoriesView
                  currentUser={currentUser}
                  db={db}
                  upsertDirectoryRow={upsertDirectoryRow}
                  deleteDirectoryRow={deleteDirectoryRow}
                  logAction={logAction}
                  type="services"
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                />
              )}
              {activeTab === 'community' && (
                <DirectoriesView
                  currentUser={currentUser}
                  db={db}
                  upsertDirectoryRow={upsertDirectoryRow}
                  deleteDirectoryRow={deleteDirectoryRow}
                  logAction={logAction}
                  type="community"
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                />
              )}
              {activeTab === 'naturaleza' && (
                <NaturalezaView
                  currentUser={currentUser}
                  db={db}
                  recordGuideInteraction={recordGuideInteraction}
                  toggleGuideReaction={toggleGuideReaction}
                />
              )}
              {activeTab === 'map' && (
                <MapView
                  currentUser={currentUser}
                  db={db}
                  upsertMapLayer={upsertMapLayer}
                  deleteMapLayer={deleteMapLayer}
                  logAction={logAction}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                />
              )}
              {activeTab === 'profile' && (
                <ProfileView
                  currentUser={currentUser}
                  db={db}
                  showAlert={showAlert}
                  logAction={logAction}
                  avatarImageOptions={avatarImageOptions}
                />
              )}
              {activeTab === 'adminUsers' && isAdminLike(currentUser) && (
                <AdministerUsersView
                  currentUser={currentUser}
                  db={db}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                  logAction={logAction}
                  updateUserProfile={updateUserProfile}
                  forceUserPlainPassword={forceUserPlainPassword}
                  setUserBlockedStatus={setUserBlockedStatus}
                  savePublicSettings={savePublicSettings}
                  getStorageUsage={getStorageUsage}
                  avatarImageOptions={avatarImageOptions}
                />
              )}
              {activeTab === 'logs' && currentUser.role === 'superadmin' && (
                <LogsView db={db} />
              )}
            </div>
            <PortalFooter />
          </div>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <PortalApp />
    </ErrorBoundary>
  )
}
