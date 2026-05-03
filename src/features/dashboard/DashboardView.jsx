import { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard,
  CheckCircle2,
  TrendingUp,
  Phone,
  Calendar,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart2,
  Sparkles,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  LayoutList,
} from 'lucide-react'
import {
  isAdminLike,
  isVotingClosed,
  formatCurrency,
  formatPortalEventWhen,
  startOfLocalToday,
  toLocalDatetimeInputValue,
  fundAmountFromDb,
  copDigitsFromInput,
  parseCopIntegerFromDigits,
  DEFAULT_INICIO_PUBLIC,
  EVENT_KIND_LABELS,
  telHrefFromDisplayPhone,
  requestPolishedText,
  portalUserLot,
  buildMergedCameraPortadaVoteMap,
  resolveCameraPortadaAccessFromStores,
} from '../../shared/utils.js'
import { isGeminiConfigured } from '../../geminiClient.js'
import { trackPortalEvent } from '../../analytics.js'
import { TENANT } from '../../tenant.config.js'
import { sumFundsRaisedTotal } from '../../fundHistoricRaised.js'
import { getNavIdsForEditor, isNavIdAlwaysVisible, PORTAL_NAV_ITEMS } from '../../portalNavConfig.js'

const DashboardView = ({
  currentUser,
  db,
  setActiveTab,
  upsertPortalEvent,
  deletePortalEvent,
  savePublicSettings,
  updateUserProfile,
  addNewsPost,
  logAction,
  showAlert,
  showConfirm,
}) => {
  const activePolls = (db.initiatives || []).filter((i) => !i?.isProposal && !isVotingClosed(i)).length
  const totalRaisedInProjects = sumFundsRaisedTotal(db.funds || [])
  const currentUserRow = useMemo(
    () => (db.users || []).find((u) => portalUserLot(u) === String(currentUser?.lotNumber)),
    [db.users, currentUser?.lotNumber],
  )
  const greetingFamilyName = (currentUserRow?.fincaName || '').trim() || currentUser?.lotNumber

  const upcomingEvents = useMemo(() => {
    const t0 = startOfLocalToday()
    return (db.events || [])
      .filter((e) => e?.startsAt && Date.parse(e.startsAt) >= t0)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  }, [db.events])
  const [upcomingIdx, setUpcomingIdx] = useState(0)

  useEffect(() => {
    if (upcomingEvents.length === 0) {
      setUpcomingIdx(0)
      return
    }
    setUpcomingIdx((idx) => Math.min(idx, upcomingEvents.length - 1))
  }, [upcomingEvents.length])

  const nextEvent = upcomingEvents[upcomingIdx] || null

  const [coHolidays, setCoHolidays] = useState([])
  const [holidaysErr, setHolidaysErr] = useState(null)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState(null)
  const [eventAiBusy, setEventAiBusy] = useState(false)
  const [eventForm, setEventForm] = useState({
    title: '',
    kind: 'ordinary',
    startsAt: '',
    location: '',
    notes: '',
  })
  const [editInicioInfo, setEditInicioInfo] = useState(false)
  const [infoSaving, setInfoSaving] = useState(false)
  const [cameraAccessSaving, setCameraAccessSaving] = useState(false)
  const [cameraAccessFilter, setCameraAccessFilter] = useState('all')
  const [infoDraft, setInfoDraft] = useState({
    workerName: '',
    workerPhone: '',
    adminFeeDigits: '',
    paymentAlias: '',
    paymentBankName: '',
    paymentAccountNumber: '',
    paymentReceiptEmail: '',
  })
  const [navOrder, setNavOrder] = useState([])
  const [navHidden, setNavHidden] = useState(() => new Set())
  const [navSaving, setNavSaving] = useState(false)
  const [navEditorOpen, setNavEditorOpen] = useState(false)

  const settingsRow = useMemo(
    () => (db.settings || []).find((s) => String(s.id) === 'public'),
    [db.settings],
  )
  const cameraVoteMap = useMemo(
    () => buildMergedCameraPortadaVoteMap(db.initiatives, TENANT),
    [db.initiatives],
  )
  const cameraAccessTri = useMemo(
    () => resolveCameraPortadaAccessFromStores(currentUserRow || {}, cameraVoteMap),
    [currentUserRow, cameraVoteMap],
  )
  const cameraAccessAnswer = cameraAccessTri === true ? 'yes' : cameraAccessTri === false ? 'no' : null
  const cameraAccessRows = useMemo(() => {
    return (db.users || [])
      .map((u) => ({
        lot: portalUserLot(u),
        hasAccess: resolveCameraPortadaAccessFromStores(u, cameraVoteMap),
      }))
      .filter((row) => row.lot)
      .sort((a, b) => a.lot.localeCompare(b.lot, 'es-CO', { numeric: true, sensitivity: 'base' }))
  }, [db.users, cameraVoteMap])
  const cameraAccessStats = useMemo(() => {
    const yes = cameraAccessRows.filter((row) => row.hasAccess === true).length
    const no = cameraAccessRows.filter((row) => row.hasAccess === false).length
    const pending = cameraAccessRows.filter((row) => row.hasAccess == null).length
    return { yes, no, pending, total: cameraAccessRows.length }
  }, [cameraAccessRows])
  const cameraAccessFilteredRows = useMemo(() => {
    if (cameraAccessFilter === 'yes') return cameraAccessRows.filter((row) => row.hasAccess === true)
    if (cameraAccessFilter === 'no') return cameraAccessRows.filter((row) => row.hasAccess === false)
    if (cameraAccessFilter === 'pending') return cameraAccessRows.filter((row) => row.hasAccess == null)
    return cameraAccessRows
  }, [cameraAccessRows, cameraAccessFilter])
  const inicioPublic = useMemo(() => {
    const fee = fundAmountFromDb(settingsRow?.adminFeeCOP)
    return {
      workerName: (settingsRow?.workerName || '').trim() || DEFAULT_INICIO_PUBLIC.workerName,
      workerPhone: (settingsRow?.workerPhone || '').trim() || DEFAULT_INICIO_PUBLIC.workerPhone,
      adminFeeCOP: fee > 0 ? fee : DEFAULT_INICIO_PUBLIC.adminFeeCOP,
      paymentAlias: (settingsRow?.paymentAlias || '').trim() || DEFAULT_INICIO_PUBLIC.paymentAlias,
      paymentBankName:
        (settingsRow?.paymentBankName || '').trim() || DEFAULT_INICIO_PUBLIC.paymentBankName,
      paymentAccountNumber:
        (settingsRow?.paymentAccountNumber || '').trim() || DEFAULT_INICIO_PUBLIC.paymentAccountNumber,
      paymentReceiptEmail:
        (settingsRow?.paymentReceiptEmail || '').trim() || DEFAULT_INICIO_PUBLIC.paymentReceiptEmail,
    }
  }, [settingsRow])

  const editorNavIds = useMemo(() => getNavIdsForEditor(currentUser?.role), [currentUser?.role])
  const navIdLabel = (id) => PORTAL_NAV_ITEMS.find((n) => n.id === id)?.label || id

  useEffect(() => {
    const custom = Array.isArray(settingsRow?.portalNavOrder) ? settingsRow.portalNavOrder : null
    const merged = custom?.length
      ? [...custom.filter((id) => editorNavIds.includes(id)), ...editorNavIds.filter((id) => !custom.includes(id))]
      : [...editorNavIds]
    setNavOrder(merged)
    setNavHidden(new Set(settingsRow?.portalNavHidden || []))
  }, [settingsRow, editorNavIds])

  const moveNavId = (id, dir) => {
    setNavOrder((prev) => {
      const i = prev.indexOf(id)
      if (i < 0) return prev
      const j = dir === 'up' ? i - 1 : i + 1
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[i]
      next[i] = next[j]
      next[j] = t
      return next
    })
  }

  const toggleNavVisibility = (id) => {
    if (isNavIdAlwaysVisible(id)) return
    setNavHidden((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const saveNavLayout = async () => {
    setNavSaving(true)
    try {
      await savePublicSettings({
        portalNavOrder: navOrder,
        portalNavHidden: Array.from(navHidden),
      })
      showAlert('Orden y visibilidad de las secciones guardados. Los accesos se actualizan al instante en el portal.')
    } catch (e) {
      console.error(e)
      showAlert('No se pudo guardar. Revisa permisos de Firestore en la colección settings.')
    } finally {
      setNavSaving(false)
    }
  }

  const resetNavLayout = () => {
    setNavOrder([...editorNavIds])
    setNavHidden(new Set())
  }

  useEffect(() => {
    let cancelled = false
    fetch('https://date.nager.at/api/v3/PublicHolidays/2026/CO')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setCoHolidays(data)
      })
      .catch(() => {
        if (!cancelled) setHolidaysErr('No se pudieron cargar los feriados en línea.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveEvent = async (e) => {
    e.preventDefault()
    if (!eventForm.title.trim()) return showAlert('Escribe el título del evento.')
    if (!eventForm.startsAt) return showAlert('Indica fecha y hora del evento.')
    if (!eventForm.location.trim()) return showAlert('Indica el lugar o enlace.')
    const id = editingEventId || `ev-${Date.now()}`
    const row = {
      id,
      title: eventForm.title.trim(),
      kind: eventForm.kind,
      startsAt: new Date(eventForm.startsAt).toISOString(),
      location: eventForm.location.trim(),
      notes: eventForm.notes.trim() || '',
      createdAt: Date.now(),
      createdBy: currentUser?.lotNumber,
    }
    try {
      await upsertPortalEvent(row)
      logAction(editingEventId ? 'EDITAR_EVENTO' : 'CREAR_EVENTO', `${editingEventId ? 'Editó' : 'Creó'} evento: ${row.title}`)
      setEditingEventId(null)
      setEventForm({ title: '', kind: 'ordinary', startsAt: '', location: '', notes: '' })
      showAlert('Evento guardado. Aparecerá en el resumen y en la agenda de eventos.')
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar el evento.')
    }
  }

  const handleEventAiPolish = async () => {
    if (!eventForm.title.trim() && !eventForm.notes.trim()) {
      showAlert('Escribe título o notas para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setEventAiBusy(true)
    try {
      const [title, notes] = await Promise.all([
        requestPolishedText('event_title', eventForm.title),
        requestPolishedText('event_notes', eventForm.notes),
      ])
      setEventForm((prev) => ({
        ...prev,
        title: title || prev.title,
        notes: notes || prev.notes,
      }))
      showAlert('Sugerencias de redacción del evento aplicadas.')
    } finally {
      setEventAiBusy(false)
    }
  }

  const requestDeleteEvent = (ev) => {
    showConfirm(`¿Eliminar el evento "${ev.title}"?`, async () => {
      try {
        await deletePortalEvent(ev.id)
        logAction('ELIMINAR_EVENTO', `Eliminó evento #${ev.id}`)
        showAlert('Evento eliminado.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar el evento.')
      }
    })
  }

  const startEditEvent = (ev) => {
    setEditingEventId(ev.id)
    setEventsOpen(true)
    setEventForm({
      title: ev.title || '',
      kind: ev.kind || 'ordinary',
      startsAt: toLocalDatetimeInputValue(ev.startsAt),
      location: ev.location || '',
      notes: ev.notes || '',
    })
  }

  const convertEventToNews = (ev) => {
    showConfirm(`¿Convertir el evento "${ev.title}" en noticia del muro?`, async () => {
      try {
        const post = {
          id: Date.now(),
          title: `Evento: ${ev.title}`,
          excerpt: ev.notes?.trim() || `Próximo evento en ${ev.location}.`,
          content: `${ev.notes?.trim() || 'Evento comunitario programado.'}\n\nFecha: ${formatPortalEventWhen(ev.startsAt)}\nLugar: ${ev.location}`,
          category: 'Eventos',
          images: [],
          coverIndex: 0,
          author: currentUser?.lotNumber,
          date: new Date().toLocaleDateString('es-CO'),
        }
        await addNewsPost(post)
        logAction('EVENTO_A_NOTICIA', `Convirtió evento #${ev.id} a noticia`)
        showAlert('Evento convertido en noticia del muro.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo convertir el evento en noticia.')
      }
    })
  }

  const handleCameraAccessAnswer = async (hasAccess) => {
    if (!currentUser?.lotNumber) return showAlert('No se encontró tu lote para guardar la respuesta.')
    setCameraAccessSaving(true)
    try {
      await updateUserProfile(currentUser.lotNumber, {
        cameraPortadaAccess: Boolean(hasAccess),
        cameraPortadaAccessUpdatedAt: Date.now(),
      })
      logAction(
        'ACTUALIZAR_ACCESO_CAMARA_PORTADA',
        `${currentUser.lotNumber} respondió acceso cámara portada: ${hasAccess ? 'SI' : 'NO'}`,
      )
      showAlert(
        hasAccess
          ? '¡Gracias! Registramos que ya tienes acceso a la cámara de la portada.'
          : 'Respuesta guardada. Cuando tengas acceso, por favor vuelve y cámbiala a "Sí".',
      )
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar tu respuesta. Inténtalo de nuevo.')
    } finally {
      setCameraAccessSaving(false)
    }
  }

  const toggleCameraAccessFilter = (nextFilter) => {
    setCameraAccessFilter((prev) => (prev === nextFilter ? 'all' : nextFilter))
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-stone-800">Hola, Familia {greetingFamilyName} 👋</h1>
          <p className="text-stone-600 mt-2 font-medium">Resumen rápido de {TENANT.name}.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-emerald-600 text-white p-8 rounded-3xl shadow-sm relative overflow-hidden lg:col-span-2 ring-1 ring-emerald-500/20">
          <div className="relative z-10">
            <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white mb-4">
              <CheckCircle2 className="w-3 h-3 mr-1.5" /> Asamblea Virtual
            </span>
            <h3 className="text-2xl font-black mb-3">Tus opiniones construyen comunidad</h3>
            <p className="text-emerald-50 mb-6 max-w-md">
              Ingresa a la sección de iniciativas para revisar los proyectos actuales, votar o proponer nuevas ideas de
              mejora.
            </p>
            <button
              type="button"
              onClick={() => {
                void trackPortalEvent('dashboard_cta_click', { cta: 'go_initiatives' })
                setActiveTab('initiatives')
              }}
              className="bg-white/90 text-emerald-800 px-6 py-3 rounded-xl font-bold shadow-sm transition-transform hover:scale-105 border border-white/30"
            >
              Ir a Votaciones ({activePolls} Activas)
            </button>
          </div>
          <BarChart2 className="absolute -bottom-6 -right-6 w-56 h-56 text-emerald-500/30 transform -rotate-12" />
        </div>

        <div className="space-y-6 flex flex-col">
          <button
            type="button"
            onClick={() => {
              void trackPortalEvent('dashboard_cta_click', { cta: 'go_funds' })
              setActiveTab('funds')
            }}
            className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/40 border border-emerald-100/30 hover:border-emerald-200 cursor-pointer transition-all flex-1 flex flex-col justify-center text-left w-full p-6 rounded-3xl shadow-sm hover:shadow-md"
          >
            <h3 className="text-stone-600 font-bold mb-1 flex items-center text-xs uppercase tracking-widest">
              <TrendingUp className="w-4 h-4 mr-2 text-blue-600" /> Proyectos y Fondos
            </h3>
            <p className="text-xs text-stone-500 mb-1">Recaudo total en proyectos:</p>
            <p className="text-2xl font-black text-blue-700">{formatCurrency(totalRaisedInProjects)}</p>
            <p className="text-[10px] text-stone-500 mt-2 leading-snug">
              Suma del dinero registrado como recaudado en cada proyecto del conjunto.
            </p>
          </button>
          <div className="bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/50 ring-1 ring-amber-100/50 border border-amber-100/40 rounded-3xl p-6 shadow-sm flex-1 flex flex-col justify-center gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-amber-600 font-bold flex items-center text-xs uppercase tracking-widest">
                <Calendar className="w-4 h-4 mr-2" /> Próximo evento comunitario
              </h3>
              {upcomingEvents.length > 1 && (
                <div className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setUpcomingIdx((i) => (i > 0 ? i - 1 : upcomingEvents.length - 1))}
                    className="p-1.5 rounded-md text-amber-700 hover:bg-amber-50"
                    aria-label="Evento anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-black text-amber-800 px-1 min-w-[2.5rem] text-center">
                    {upcomingIdx + 1}/{upcomingEvents.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUpcomingIdx((i) => (i < upcomingEvents.length - 1 ? i + 1 : 0))}
                    className="p-1.5 rounded-md text-amber-700 hover:bg-amber-50"
                    aria-label="Evento siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {nextEvent ? (
              <>
                <p className="font-black text-stone-800 text-lg leading-snug">{nextEvent.title}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800/90">
                  {EVENT_KIND_LABELS[nextEvent.kind] || EVENT_KIND_LABELS.other}
                </p>
                <p className="text-stone-700 font-bold text-sm">{formatPortalEventWhen(nextEvent.startsAt)}</p>
                <p className="text-stone-600 text-xs flex items-start gap-1">
                  <MapPin className="w-3 h-3 mr-1 shrink-0 mt-0.5" /> {nextEvent.location}
                </p>
              </>
            ) : (
              <p className="text-stone-700 text-sm">
                Aún no hay eventos programados a partir de hoy. Si puedes editar el resumen, crea asambleas o
                reuniones en el panel de abajo.
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-blue-100 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 p-5 md:p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-blue-700">Acceso cámara de portada</h3>
            <p className="text-sm text-stone-700 mt-2">
              ¿Actualmente tienes acceso a la cámara de vigilancia de la portada?
            </p>
            <details className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-blue-800">
                Instrucciones para activar acceso
              </summary>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-xs text-stone-700">
                <li>Descargar la app Hik-Connect.</li>
                <li>Crear una cuenta (con número de celular o correo).</li>
                <li>Contactar a la persona encargada de la cámara en el grupo de WhatsApp de {TENANT.name}.</li>
                <li>Escanear el código QR compartido y usar la clave que les asignen.</li>
              </ol>
            </details>
            <p className="text-xs text-stone-600 mt-1">
              Si respondes «No», cuando ya tengas acceso por favor vuelve y cambia tu respuesta a «Sí».
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={cameraAccessSaving}
              onClick={() => void handleCameraAccessAnswer(true)}
              className={`inline-flex items-center rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                cameraAccessAnswer === 'yes'
                  ? 'border-emerald-300 bg-emerald-600 text-white'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              } disabled:opacity-60`}
            >
              <Eye className="w-4 h-4 mr-1.5" /> Sí
            </button>
            <button
              type="button"
              disabled={cameraAccessSaving}
              onClick={() => void handleCameraAccessAnswer(false)}
              className={`inline-flex items-center rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                cameraAccessAnswer === 'no'
                  ? 'border-red-300 bg-red-600 text-white'
                  : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
              } disabled:opacity-60`}
            >
              <EyeOff className="w-4 h-4 mr-1.5" /> No
            </button>
          </div>
        </div>
        {isAdminLike(currentUser) && (
          <div className="mt-5 border-t border-blue-100 pt-4">
            <p className="mb-2 text-[10px] font-medium normal-case tracking-normal text-stone-500">
              Si hubo una votación en Iniciativas antes de este formulario, sus votos se reflejan aquí hasta que cada
              lote guarde respuesta con los botones Sí/No (la respuesta del perfil tiene prioridad).
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider">
              <button
                type="button"
                onClick={() => toggleCameraAccessFilter('yes')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'yes'
                    ? 'border-emerald-300 bg-emerald-600 text-white'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Sí: {cameraAccessStats.yes}
              </button>
              <button
                type="button"
                onClick={() => toggleCameraAccessFilter('no')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'no'
                    ? 'border-red-300 bg-red-600 text-white'
                    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                No: {cameraAccessStats.no}
              </button>
              <button
                type="button"
                onClick={() => toggleCameraAccessFilter('pending')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'pending'
                    ? 'border-stone-300 bg-stone-700 text-white'
                    : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                Sin responder: {cameraAccessStats.pending}
              </button>
              <button
                type="button"
                onClick={() => setCameraAccessFilter('all')}
                className={`rounded-lg border px-2.5 py-1 transition-colors ${
                  cameraAccessFilter === 'all'
                    ? 'border-blue-300 bg-blue-600 text-white'
                    : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                Total lotes: {cameraAccessStats.total}
              </button>
            </div>
            <details className="mt-3 rounded-2xl border border-stone-200 bg-white" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase tracking-wide text-stone-700 border-b border-stone-200 bg-stone-50">
                Ver listado detallado por lote
              </summary>
              <div className="max-h-60 overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-stone-50 border-b border-stone-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-black uppercase tracking-wide text-stone-600">Lote</th>
                      <th className="px-3 py-2 text-left font-black uppercase tracking-wide text-stone-600">
                        Acceso cámara portada
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cameraAccessFilteredRows.map((row) => (
                      <tr key={`camera-access-${row.lot}`} className="border-b border-stone-100 last:border-0">
                        <td className="px-3 py-2 font-mono font-bold text-stone-800">{row.lot}</td>
                        <td className="px-3 py-2">
                          {row.hasAccess === true ? (
                            <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">
                              Sí
                            </span>
                          ) : row.hasAccess === false ? (
                            <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-bold text-red-700">
                              No
                            </span>
                          ) : (
                            <span className="inline-flex rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 font-bold text-stone-600">
                              Sin responder
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {cameraAccessFilteredRows.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-4 text-center text-stone-500">
                          No hay lotes para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </section>

      <div className="rounded-3xl border border-emerald-100/40 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/30 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
            <Phone className="w-4 h-4" /> Cuota del conjunto y pagos
          </h3>
          {isAdminLike(currentUser) && (
            <button
              type="button"
              onClick={() => {
                if (editInicioInfo) {
                  setEditInicioInfo(false)
                } else {
                  setInfoDraft({
                    workerName: inicioPublic.workerName,
                    workerPhone: inicioPublic.workerPhone,
                    adminFeeDigits: copDigitsFromInput(String(inicioPublic.adminFeeCOP)),
                    paymentAlias: inicioPublic.paymentAlias,
                    paymentBankName: inicioPublic.paymentBankName,
                    paymentAccountNumber: inicioPublic.paymentAccountNumber,
                    paymentReceiptEmail: inicioPublic.paymentReceiptEmail,
                  })
                  setEditInicioInfo(true)
                }
              }}
              className="text-xs font-black uppercase tracking-wide bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg border border-white/30"
            >
              {editInicioInfo ? 'Cerrar edición' : 'Editar información'}
            </button>
          )}
        </div>
        <div className="p-5 md:p-6 space-y-4">
          {editInicioInfo && isAdminLike(currentUser) ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!infoDraft.workerName.trim()) return showAlert('Indica el nombre del trabajador.')
                if (!infoDraft.workerPhone.trim()) return showAlert('Indica el teléfono.')
                const fee = parseCopIntegerFromDigits(infoDraft.adminFeeDigits)
                if (fee <= 0) return showAlert('La cuota debe ser mayor a cero (solo números).')
                if (!infoDraft.paymentAlias.trim())
                  return showAlert('Indica la llave alfanumérica para transferencias.')
                if (!infoDraft.paymentBankName.trim() || !infoDraft.paymentAccountNumber.trim())
                  return showAlert('Indica banco y número de cuenta para consignaciones.')
                if (!infoDraft.paymentReceiptEmail.trim() || !infoDraft.paymentReceiptEmail.includes('@'))
                  return showAlert('Indica un correo válido para recibir comprobantes.')
                setInfoSaving(true)
                savePublicSettings({
                  workerName: infoDraft.workerName.trim(),
                  workerPhone: infoDraft.workerPhone.trim(),
                  adminFeeCOP: fee,
                  paymentAlias: infoDraft.paymentAlias.trim(),
                  paymentBankName: infoDraft.paymentBankName.trim(),
                  paymentAccountNumber: infoDraft.paymentAccountNumber.trim(),
                  paymentReceiptEmail: infoDraft.paymentReceiptEmail.trim(),
                })
                  .then(() => {
                    logAction('EDITAR_INFO_RESUMEN', 'Actualizó cuota, contacto y cuentas de pago')
                    showAlert('Cambios guardados correctamente.')
                    setEditInicioInfo(false)
                  })
                  .catch((err) => {
                    console.error(err)
                    showAlert('No se pudo guardar. Revisa permisos de Firestore en la colección settings.')
                  })
                  .finally(() => setInfoSaving(false))
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Trabajador del conjunto</label>
                  <input
                    value={infoDraft.workerName}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, workerName: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Teléfono</label>
                  <input
                    value={infoDraft.workerPhone}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, workerPhone: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Llave alfanumérica</label>
                  <input
                    value={infoDraft.paymentAlias}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentAlias: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono"
                    placeholder="@usuario"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Banco</label>
                  <input
                    value={infoDraft.paymentBankName}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentBankName: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Número de cuenta</label>
                  <input
                    value={infoDraft.paymentAccountNumber}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentAccountNumber: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Correo para enviar comprobante
                  </label>
                  <input
                    type="email"
                    value={infoDraft.paymentReceiptEmail}
                    onChange={(e) => setInfoDraft((d) => ({ ...d, paymentReceiptEmail: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="comunidadlasblancas@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Cuota mensual del conjunto (COP)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={infoDraft.adminFeeDigits}
                    onChange={(e) =>
                      setInfoDraft((d) => ({ ...d, adminFeeDigits: copDigitsFromInput(e.target.value) }))
                    }
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-mono font-bold tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={infoSaving}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {infoSaving ? 'Guardando…' : 'Guardar datos'}
              </button>
            </form>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-stone-100 bg-stone-50/90 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-600 mb-1">
                  Trabajador {TENANT.name}
                </p>
                <p className="text-lg font-black text-stone-900">{inicioPublic.workerName}</p>
                <a
                  href={telHrefFromDisplayPhone(inicioPublic.workerPhone) || undefined}
                  className="mt-2 inline-flex items-center text-emerald-700 font-bold text-base hover:underline"
                >
                  <Phone className="w-4 h-4 mr-2 shrink-0" />
                  {inicioPublic.workerPhone}
                </a>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800 mb-1">
                  Cuota para cubrir salario
                </p>
                <p className="text-2xl font-black text-emerald-800">{formatCurrency(inicioPublic.adminFeeCOP)}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">Formas de pago</p>
                <p className="text-xs text-stone-700">Puedes pagar por cualquiera de estos dos medios:</p>
                <p className="text-sm text-stone-800">
                  <span className="font-black">Llave (alfanumérica):</span>{' '}
                  <span className="font-mono font-bold">{inicioPublic.paymentAlias}</span>
                </p>
                <p className="text-sm text-stone-800">
                  <span className="font-black">{inicioPublic.paymentBankName}:</span>{' '}
                  <span className="font-mono font-bold">{inicioPublic.paymentAccountNumber}</span>
                </p>
                <p className="text-sm text-stone-800">
                  <span className="font-black">Enviar comprobante a:</span>{' '}
                  <span className="font-semibold">{inicioPublic.paymentReceiptEmail}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-black text-stone-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" /> Feriados en Colombia (2026)
          </h3>
          <a
            href="https://date.nager.at/"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-emerald-700 hover:underline shrink-0"
          >
            Fuente: Nager.Date (API pública) →
          </a>
        </div>
        {holidaysErr && <p className="text-sm text-amber-800 mb-2">{holidaysErr}</p>}
        <ul className="max-h-40 overflow-y-auto text-sm text-stone-800 space-y-1.5 pr-1">
          {coHolidays.map((h) => (
            <li key={h.date + h.name} className="flex gap-2">
              <span className="font-mono text-xs text-stone-600 shrink-0 w-[5.5rem]">{h.date}</span>
              <span>{h.localName || h.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {isAdminLike(currentUser) && (
        <div className="rounded-3xl border border-sky-200 bg-sky-50/50 p-6">
          <button
            type="button"
            onClick={() => setNavEditorOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left font-black text-sky-900 text-lg"
          >
            <span className="flex items-center gap-2">
              <LayoutList className="w-5 h-5" /> Secciones del menú
            </span>
            <ChevronDown className={`w-5 h-5 transition-transform ${navEditorOpen ? 'rotate-180' : ''}`} />
          </button>
          {navEditorOpen && (
            <div className="mt-5 space-y-4 text-sm text-stone-800">
              <p className="text-stone-600 leading-snug">
                Activa o desactiva secciones del menú lateral y el orden en que aparecen (como en otros portales
                comunitarios). <span className="font-bold text-stone-800">Perfil</span> siempre queda visible para
                que cada quien pueda actualizar su clave.
              </p>
              <ul className="space-y-2">
                {navOrder.map((id) => {
                  const locked = isNavIdAlwaysVisible(id)
                  const isOff = !locked && navHidden.has(id)
                  return (
                    <li
                      key={id}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border border-sky-100/80 bg-white/90 px-3 py-2 ${
                        isOff ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1 font-bold text-stone-900 text-xs sm:text-sm">
                        {navIdLabel(id)}
                        {locked && <span className="ml-2 text-[10px] font-bold text-sky-700">(siempre visible)</span>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveNavId(id, 'up')}
                          className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                          aria-label="Subir"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveNavId(id, 'down')}
                          className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                          aria-label="Bajar"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <label
                          className={`inline-flex items-center gap-2 text-[11px] font-bold ${
                            locked ? 'text-stone-400 cursor-not-allowed' : 'text-stone-700 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={locked || !navHidden.has(id)}
                            disabled={locked}
                            onChange={() => toggleNavVisibility(id)}
                            className="h-3.5 w-3.5 rounded border-stone-300"
                          />
                          {locked ? 'Activa' : isOff ? 'Desactivada' : 'Activa'}
                        </label>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={navSaving}
                  onClick={() => void saveNavLayout()}
                  className="px-4 py-2.5 rounded-xl bg-sky-700 text-white text-xs font-black hover:bg-sky-800 disabled:opacity-50"
                >
                  {navSaving ? 'Guardando…' : 'Guardar menú'}
                </button>
                <button
                  type="button"
                  onClick={resetNavLayout}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-xs font-bold text-stone-700 hover:bg-stone-50"
                >
                  Valores predeterminados
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAdminLike(currentUser) && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6">
          <button
            type="button"
            onClick={() => setEventsOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left font-black text-emerald-900 text-lg"
          >
            <span>Eventos comunitarios (edición)</span>
            <ChevronDown className={`w-5 h-5 transition-transform ${eventsOpen ? 'rotate-180' : ''}`} />
          </button>
          {eventsOpen && (
            <div className="mt-6 space-y-6">
              <p className="text-sm text-stone-800">
                Crea asambleas, reuniones extraordinarias o días especiales. Se muestran en orden cronológico; el
                bloque amarillo del resumen toma el próximo a partir de hoy.
              </p>
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                <button
                  type="button"
                  onClick={() => void handleEventAiPolish()}
                  disabled={eventAiBusy}
                  className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                  {eventAiBusy ? 'Procesando…' : 'Sugerir redacción (IA)'}
                </button>
                <p className="mt-1.5 text-xs text-stone-700">
                  Mejora solo título y notas. Fecha, tipo y lugar siguen siendo manuales.
                </p>
              </div>
              <form onSubmit={saveEvent} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/80 rounded-2xl p-4 border border-emerald-100">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Título *</label>
                  <input
                    value={eventForm.title}
                    onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Ej: Asamblea general ordinaria"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Tipo *</label>
                  <select
                    value={eventForm.kind}
                    onChange={(e) => setEventForm((f) => ({ ...f, kind: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold"
                  >
                    {Object.entries(EVENT_KIND_LABELS).map(([k, lab]) => (
                      <option key={k} value={k}>
                        {lab}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Fecha y hora *</label>
                  <input
                    type="datetime-local"
                    value={eventForm.startsAt}
                    onChange={(e) => setEventForm((f) => ({ ...f, startsAt: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Lugar o enlace *</label>
                  <input
                    value={eventForm.location}
                    onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Ej: Kiosco principal / Meet…"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-700 mb-1">Notas (opcional)</label>
                  <textarea
                    value={eventForm.notes}
                    onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Orden del día, documentos, etc."
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-800"
                  >
                    {editingEventId ? 'Guardar cambios del evento' : 'Guardar evento'}
                  </button>
                  {editingEventId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEventId(null)
                        setEventForm({ title: '', kind: 'ordinary', startsAt: '', location: '', notes: '' })
                      }}
                      className="ml-2 bg-white border border-stone-200 text-stone-800 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-stone-50"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
              </form>

              <div>
                <h4 className="text-sm font-black text-stone-800 mb-2">Eventos registrados</h4>
                {(db.events || []).length === 0 ? (
                  <p className="text-sm text-stone-600">Ninguno aún.</p>
                ) : (
                  <ul className="space-y-2">
                    {[...(db.events || [])]
                      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
                      .map((ev) => (
                        <li
                          key={ev.id}
                          className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 bg-white rounded-xl border border-stone-100 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-stone-900">{ev.title}</p>
                            <p className="text-xs text-stone-600 truncate">
                              {formatPortalEventWhen(ev.startsAt)} · {ev.location}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:justify-end text-xs font-bold">
                            <button
                              type="button"
                              onClick={() => startEditEvent(ev)}
                              className="text-emerald-700 hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => convertEventToNews(ev)}
                              className="text-blue-700 hover:underline"
                            >
                              Convertir en noticia
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteEvent(ev)}
                              className="text-red-600 hover:underline"
                            >
                              Eliminar
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DashboardView
