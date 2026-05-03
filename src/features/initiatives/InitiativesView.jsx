import { useState, useEffect, useRef, useMemo } from 'react'
import {
  User,
  Calendar,
  Clock,
  PlusCircle,
  Edit3,
  Trash2,
  BarChart2,
  Sparkles,
  Loader2,
  Rocket,
  ArrowLeft,
  Check,
  Shield,
  ChevronDown,
  EyeOff,
  Eye,
} from 'lucide-react'
import {
  isAdminLike,
  isVotingClosed,
  safeDateParse,
  getTimeRemainingLabel,
  toLocalDatetimeInputValue,
  formatCurrency,
  FUND_STATUS,
  coerceSurveyOptionId,
  requestPolishedText,
} from '../../shared/utils.js'
import {
  fetchGeminiSurveyOptions,
  fetchGeminiDuplicateCheck,
  isGeminiConfigured,
  getLastGeminiDetail,
} from '../../geminiClient.js'
import { trackPortalEvent } from '../../analytics.js'
import { uploadEntityCoverImage, MAX_ENTITY_IMAGE_BYTES } from '../../firestore/uploadEntityImage.js'
import { isNewsFallbackImageUrl, MAX_IMAGE_SOURCE_BYTES } from '../../firestore/uploadNewsImage.js'
import { ImageCropDialog } from '../../shared/ImageCropDialog.jsx'

const SuperadminVotesPanel = ({ post, db, saveInitiative, logAction, showAlert }) => {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState([])

  const opts = post.survey?.options || []
  const votesKey = JSON.stringify(post.survey?.votes || [])

  useEffect(() => {
    if (!open) return
    setDraft((post.survey?.votes || []).map((r) => ({ ...r })))
  }, [open, post.id, votesKey])

  const lotChoices = useMemo(() => {
    const set = new Set()
    ;(db.users || []).forEach((u) => {
      if (u?.lot) set.add(String(u.lot))
    })
    ;(post.survey?.votes || []).forEach((v) => {
      if (v?.lot) set.add(String(v.lot))
    })
    draft.forEach((r) => {
      if (r?.lot) set.add(String(r.lot).trim())
    })
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }, [db.users, post.survey?.votes, draft])

  const syncDraftFromServer = () => {
    setDraft((post.survey?.votes || []).map((r) => ({ ...r })))
  }

  const persist = async () => {
    if (!opts.length) {
      showAlert('Esta iniciativa no tiene opciones de encuesta.')
      return
    }
    const byLot = new Map()
    for (const row of draft) {
      const lot = String(row.lot || '').trim()
      if (!lot) continue
      const optionId = coerceSurveyOptionId(opts, row.optionId)
      if (!opts.some((o) => String(o.id) === String(optionId))) {
        showAlert(`La opción elegida no es válida para el lote ${lot}.`)
        return
      }
      const ts =
        row.timestamp?.trim() ||
        new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
      byLot.set(lot.toUpperCase(), { lot, optionId, timestamp: ts })
    }
    const votes = Array.from(byLot.values())
    setSaving(true)
    try {
      const updated = {
        ...post,
        survey: { ...post.survey, votes },
      }
      await saveInitiative(updated)
      logAction('SUPERADMIN_VOTOS', `Editó votos manualmente en iniciativa #${post.id}`)
      showAlert('Votación guardada. Los cambios ya están aplicados.')
      setOpen(false)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar la votación.')
    } finally {
      setSaving(false)
    }
  }

  if (!post.survey) return null

  return (
    <div className="mt-6 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left font-black text-amber-950 hover:bg-amber-100/50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0 text-sm sm:text-base">
          <Shield className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-amber-700" aria-hidden />
          <span className="leading-snug">Gestionar votación manualmente (superadmin)</span>
        </span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-amber-800 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-amber-100 space-y-4">
          <datalist id={`superadmin-vote-lots-${post.id}`}>
            {lotChoices.map((lot) => (
              <option key={lot} value={lot} />
            ))}
          </datalist>
          <p className="text-xs text-amber-950/80 font-medium leading-relaxed pt-3">
            Asigna o corrige el voto de cada lote. Solo puede haber un voto por lote: si repites un lote, prevalece la
            última fila. Los cambios se guardan en la nube para toda la comunidad.
          </p>
          <div className="rounded-xl border border-amber-100 bg-white/90 overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="border-b border-stone-100 text-left text-[10px] font-black uppercase tracking-wider text-stone-600">
                  <th className="px-3 py-2.5">Lote</th>
                  <th className="px-3 py-2.5">Opción</th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {draft.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-stone-600 font-medium text-xs">
                      No hay votos. Usa &quot;Añadir fila&quot; para registrar votos en nombre de los lotes.
                    </td>
                  </tr>
                ) : (
                  draft.map((row, idx) => (
                    <tr key={idx} className="align-middle">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          list={`superadmin-vote-lots-${post.id}`}
                          value={row.lot || ''}
                          onChange={(e) =>
                            setDraft((d) => d.map((r, i) => (i === idx ? { ...r, lot: e.target.value } : r)))
                          }
                          placeholder="Ej: LOTE29"
                          className="w-full max-w-[11rem] border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white outline-none focus:border-amber-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={String(row.optionId ?? '')}
                          onChange={(e) =>
                            setDraft((d) =>
                              d.map((r, i) =>
                                i === idx ? { ...r, optionId: coerceSurveyOptionId(opts, e.target.value) } : r,
                              ),
                            )
                          }
                          className="w-full min-w-[8rem] border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white outline-none focus:border-amber-500"
                        >
                          {opts.map((o) => (
                            <option key={String(o.id)} value={String(o.id)}>
                              {o.text}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setDraft((d) => d.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                          aria-label="Quitar fila"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft((d) => [
                  ...d,
                  {
                    lot: '',
                    optionId: opts[0]?.id ?? '',
                    timestamp: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
                  },
                ])
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-amber-300 bg-white text-amber-900 text-xs font-black uppercase tracking-wide hover:bg-amber-50"
            >
              <PlusCircle className="w-4 h-4" /> Añadir fila
            </button>
            <button
              type="button"
              onClick={syncDraftFromServer}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-stone-200 bg-white text-stone-800 text-xs font-bold hover:bg-stone-50"
            >
              Descartar cambios locales
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void persist()}
              className="inline-flex flex-1 items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black uppercase tracking-wide hover:bg-amber-700 disabled:opacity-50 sm:ml-auto min-w-[10rem]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Guardar votación
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const InitiativesView = ({
  currentUser,
  db,
  saveInitiative,
  convertInitiativeToFund,
  deleteInitiative,
  setInitiativeSuppressed,
  logAction,
  showAlert,
  showConfirm,
}) => {
  const LIGHTING_APPROVAL_LOTS = useMemo(
    () => [
      '14B', '28B', '3B', '4B', '11A', '1B', '2B', '36B', '2A', '27B',
      '26B', '23B', '18A', '9B', '10A', '8A', '30B', '38B', '18B', '32B', '6A',
    ].map((lot) => `Lote${lot}`),
    [],
  )
  const canManageInitiatives = isAdminLike(currentUser)
  const isSyncingLightingVotesRef = useRef(false)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [editingSurveys, setEditingSurveys] = useState({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingInitiativeId, setEditingInitiativeId] = useState(null)
  const createFormRef = useRef(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [copyAiBusy, setCopyAiBusy] = useState(false)
  const [isSubmittingInitiative, setIsSubmittingInitiative] = useState(false)
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [activeCoverCropFile, setActiveCoverCropFile] = useState(null)
  const [newSurvey, setNewSurvey] = useState({
    title: '',
    excerpt: '',
    question: '',
    deadline: '',
    requiresBudget: false,
    budgetAmount: '',
    expectedQuotaPerLotCOP: '',
    options: [
      { id: 1, text: '' },
      { id: 2, text: '' },
    ],
  })
  const surveyInitiatives = useMemo(
    () =>
      (db.initiatives || []).filter(
        (i) => !i?.isProposal && (canManageInitiatives || !i?.adminSuppressed),
      ),
    [db.initiatives, canManageInitiatives],
  )

  useEffect(() => {
    if (!canManageInitiatives) return
    const targetDate = new Date(2026, 3, 12).toLocaleDateString('es-CO')
    const illuminationSurvey = surveyInitiatives.find((row) =>
      String(row?.title || '')
        .toLowerCase()
        .includes('ilumin'),
    )
    if (!illuminationSurvey) return
    if (String(illuminationSurvey.date || '').trim() === targetDate) return

    void saveInitiative({
      ...illuminationSurvey,
      date: targetDate,
    }).catch((err) => {
      console.error('No se pudo ajustar la fecha de publicación de la encuesta de iluminación:', err)
    })
  }, [canManageInitiatives, surveyInitiatives, saveInitiative])

  useEffect(() => {
    if (!canManageInitiatives || isSyncingLightingVotesRef.current) return
    const illuminationSurvey = surveyInitiatives.find((row) =>
      String(row?.title || '')
        .toLowerCase()
        .includes('ilumin'),
    )
    if (!illuminationSurvey) return

    const options = illuminationSurvey.survey?.options || []
    if (options.length === 0) return
    const normalizeOptionText = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    const yesOption =
      options.find((opt) => {
        const txt = normalizeOptionText(opt?.text)
        return /\bsi\b/.test(txt) && !/\bno\b/.test(txt)
      }) ||
      options.find((opt) => normalizeOptionText(opt?.text).startsWith('si ')) ||
      options[0]
    if (!yesOption?.id) return

    const prevVotes = illuminationSurvey.survey?.votes || []
    const byLot = new Map()
    prevVotes.forEach((vote) => {
      const lot = String(vote?.lot || '').trim()
      if (!lot) return
      byLot.set(lot.toUpperCase(), vote)
    })

    let changed = false
    LIGHTING_APPROVAL_LOTS.forEach((lot) => {
      const lotNorm = String(lot).toUpperCase()
      const existing = byLot.get(lotNorm)
      if (!existing || String(existing.optionId) !== String(yesOption.id)) {
        byLot.set(lotNorm, {
          lot,
          optionId: yesOption.id,
          timestamp:
            existing?.timestamp || new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        })
        changed = true
      }
    })
    if (!changed) return

    const nextVotes = Array.from(byLot.values())
    isSyncingLightingVotesRef.current = true
    void saveInitiative({
      ...illuminationSurvey,
      survey: {
        ...illuminationSurvey.survey,
        votes: nextVotes,
      },
    })
      .catch((err) => {
        console.error('No se pudo sincronizar votos de iluminación:', err)
      })
      .finally(() => {
        isSyncingLightingVotesRef.current = false
      })
  }, [canManageInitiatives, surveyInitiatives, saveInitiative, LIGHTING_APPROVAL_LOTS])

  const handleVote = (initiativeId) => {
    const init = db.initiatives?.find((i) => i.id === initiativeId)
    if (!init) return
    if (isVotingClosed(init))
      return showAlert('La fecha límite para votar en esta iniciativa ya ha pasado.')

    const optionId = selectedOptions[initiativeId]
    if (!optionId) return showAlert('Por favor, selecciona una opción antes de votar.')

    const timestamp = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
    const updatedInitiatives = db.initiatives.map((i) => {
      if (i.id === initiativeId) {
        const votes = i.survey?.votes || []
        const existingIdx = votes.findIndex((v) => v.lot === currentUser.lotNumber)
        let newVotes = [...votes]
        if (existingIdx >= 0) {
          newVotes[existingIdx] = { lot: currentUser.lotNumber, optionId, timestamp }
          logAction('VOTO_MODIFICADO', `Modificó voto en #${initiativeId}`)
        } else {
          newVotes.push({ lot: currentUser.lotNumber, optionId, timestamp })
          logAction('VOTO_EMITIDO', `Votó en #${initiativeId}`)
        }
        return { ...i, survey: { ...i.survey, votes: newVotes } }
      }
      return i
    })

    const updated = updatedInitiatives.find((i) => i.id === initiativeId)
    if (updated)
      saveInitiative(updated)
        .then(() => {
          void trackPortalEvent('vote_submit', {
            initiative_id: String(initiativeId).slice(0, 40),
          })
        })
        .catch((err) => {
          console.error(err)
          showAlert('No se pudo guardar el voto.')
        })
    setEditingSurveys((p) => ({ ...p, [initiativeId]: false }))
  }

  const handleConvertToProject = (initiative) => {
    showConfirm(
      `¿Estás seguro que deseas convertir "${initiative.title}" en un proyecto en ejecución? Esto creará el proyecto en Proyectos y Fondos y marcará esta votación como convertida.`,
      async () => {
        const votes = initiative.survey?.votes || []
        let winnerText = 'Sin votos'
        if (votes.length > 0) {
          const counts = {}
          votes.forEach((v) => {
            counts[v.optionId] = (counts[v.optionId] || 0) + 1
          })
          const winnerId = Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b))
          winnerText =
            initiative.survey?.options?.find((o) => o.id === winnerId)?.text || winnerText
        }

        const newProject = {
          id: `fp-${crypto.randomUUID()}`,
          name: initiative.title,
          description: `${initiative.excerpt}\n\n[Origen: Votación finalizada. Opción más votada: "${winnerText}"]`,
          date: (initiative?.date || '').trim() || new Date().toLocaleDateString('es-CO'),
          requiresBudget: initiative.survey?.requiresBudget || false,
          goal: initiative.survey?.requiresBudget ? Number(initiative.survey?.budgetAmount) || 0 : 0,
          raised: 0,
          status: FUND_STATUS.RECOLECCION,
          image:
            initiative.image && !isNewsFallbackImageUrl(initiative.image) ? initiative.image : null,
          expectedQuotaPerLotCOP: Number(initiative.survey?.expectedQuotaPerLotCOP) || 0,
          createdAt: Date.now(),
        }

        try {
          await convertInitiativeToFund(initiative, newProject)
          logAction('CONVERTIR_PROYECTO', `Convirtió iniciativa #${initiative.id} en Proyecto`)
          showAlert(
            "La votación se convirtió en proyecto. Revísalo en la pestaña «Proyectos y Fondos».",
          )
        } catch (err) {
          console.error(err)
          showAlert('No se pudo convertir la iniciativa en proyecto. Revisa permisos de Firestore y la consola.')
        }
      },
    )
  }

  const startEditInitiative = (initiative) => {
    setEditingInitiativeId(initiative.id)
    setShowCreateForm(true)
    setCoverImageFile(null)
    setActiveCoverCropFile(null)
    setNewSurvey({
      title: initiative.title || '',
      excerpt: initiative.excerpt || '',
      question: initiative.survey?.question || '',
      deadline: initiative.deadline || '',
      requiresBudget: initiative.survey?.requiresBudget || false,
      budgetAmount: initiative.survey?.budgetAmount ? String(initiative.survey.budgetAmount) : '',
      expectedQuotaPerLotCOP: initiative.survey?.expectedQuotaPerLotCOP
        ? String(initiative.survey.expectedQuotaPerLotCOP)
        : '',
      options: (initiative.survey?.options || []).map((o, idx) => ({
        id: o.id ?? Date.now() + idx,
        text: o.text || '',
      })),
    })
  }

  const handleCoverPicked = (f) => {
    if (!f) return
    if (f.size > MAX_IMAGE_SOURCE_BYTES) {
      showAlert(
        `La foto supera los ${Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024))} MB y no se puede procesar.`,
      )
      return
    }
    setActiveCoverCropFile(f)
  }

  const handleCoverCropConfirm = (croppedFile) => {
    setCoverImageFile(croppedFile)
    setActiveCoverCropFile(null)
  }

  const handleCoverCropCancel = () => {
    setActiveCoverCropFile(null)
  }

  const cancelCreateOrEdit = () => {
    setShowCreateForm(false)
    setEditingInitiativeId(null)
    setCoverImageFile(null)
    setActiveCoverCropFile(null)
    setNewSurvey({
      title: '',
      excerpt: '',
      question: '',
      deadline: '',
      requiresBudget: false,
      budgetAmount: '',
      expectedQuotaPerLotCOP: '',
      options: [
        { id: 1, text: '' },
        { id: 2, text: '' },
      ],
    })
  }

  const handleDeleteInitiative = (initiative) => {
    showConfirm(`¿Eliminar la votación "${initiative.title}"? Esta acción no se puede deshacer.`, async () => {
      try {
        await deleteInitiative(initiative.id)
        logAction('ELIMINAR_ENCUESTA', `Eliminó iniciativa #${initiative.id}`)
        showAlert('Votación eliminada correctamente.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar la votación.')
      }
    })
  }

  const handleToggleSuppressed = (post) => {
    const nextHidden = !post.adminSuppressed
    showConfirm(
      nextHidden
        ? `¿Ocultar "${post.title}"? Los vecinos no podrán verla ni votar hasta que la vuelvas a mostrar.`
        : `¿Volver a mostrar "${post.title}" a todos los vecinos?`,
      async () => {
        try {
          await setInitiativeSuppressed(post.id, nextHidden)
          logAction(
            nextHidden ? 'OCULTAR_VOTACION' : 'MOSTRAR_VOTACION',
            `${nextHidden ? 'Ocultó' : 'Mostró'} votación #${post.id}`,
          )
        } catch (err) {
          console.error(err)
          showAlert('No se pudo actualizar la visibilidad de la votación.')
        }
      },
    )
  }

  const handleFinalizeInitiative = (initiative) => {
    showConfirm(`¿Finalizar ahora la votación "${initiative.title}"? Los residentes ya no podrán votar ni modificar voto.`, async () => {
      try {
        const closedAt = toLocalDatetimeInputValue(new Date(Date.now() - 120_000))
        await saveInitiative({
          ...initiative,
          deadline: closedAt,
          votingClosed: true,
        })
        logAction('FINALIZAR_ENCUESTA', `Finalizó manualmente iniciativa #${initiative.id}`)
        showAlert('La votación quedó finalizada. Usa «Convertir en proyecto» cuando quieras llevarla a Proyectos y Fondos.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo finalizar la votación.')
      }
    })
  }

  const triggerAIAssistant = async () => {
    if (!newSurvey.question.trim())
      return showAlert('Por favor, escribe la pregunta de la encuesta primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setIsAnalyzing(true)
    const aiResponse = await fetchGeminiSurveyOptions(newSurvey.question)
    if (aiResponse?.suggestedOptions?.length > 0) {
      setNewSurvey((p) => ({
        ...p,
        options: aiResponse.suggestedOptions.map((o, idx) => ({ id: Date.now() + idx, text: o })),
      }))
    } else {
      const d = getLastGeminiDetail()
      showAlert(
        d
          ? `No se pudo obtener sugerencias: ${d}`
          : 'No se pudo conectar con la IA de sugerencias. Ingresa las opciones manualmente.',
      )
    }
    setIsAnalyzing(false)
  }

  const triggerSurveyCopyAssistant = async () => {
    if (!newSurvey.title.trim() && !newSurvey.excerpt.trim() && !newSurvey.question.trim()) {
      showAlert('Escribe título, contexto o pregunta para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setCopyAiBusy(true)
    try {
      const [title, excerpt, question] = await Promise.all([
        requestPolishedText('initiative_title', newSurvey.title),
        requestPolishedText('initiative_excerpt', newSurvey.excerpt),
        requestPolishedText('initiative_question', newSurvey.question),
      ])
      setNewSurvey((prev) => ({
        ...prev,
        title: title || prev.title,
        excerpt: excerpt || prev.excerpt,
        question: question || prev.question,
      }))
      showAlert('Sugerencias de redacción aplicadas en la votación.')
    } finally {
      setCopyAiBusy(false)
    }
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    const validOptions = newSurvey.options.filter((o) => o.text.trim() !== '')
    if (validOptions.length < 2)
      return showAlert('Se requiere un mínimo de 2 opciones de respuesta válidas.')
    if (!newSurvey.deadline) return showAlert('Debes seleccionar una fecha y hora de cierre.')
    if (
      newSurvey.requiresBudget &&
      (!newSurvey.budgetAmount || Number.isNaN(Number(newSurvey.budgetAmount)))
    )
      return showAlert('Por favor, ingresa un monto de presupuesto válido en COP.')
    if (
      newSurvey.requiresBudget &&
      newSurvey.expectedQuotaPerLotCOP &&
      Number.isNaN(Number(newSurvey.expectedQuotaPerLotCOP))
    )
      return showAlert('La cuota o aporte esperado por lote debe ser un número válido.')
    if (coverImageFile && coverImageFile.size > MAX_ENTITY_IMAGE_BYTES)
      return showAlert(
        `La imagen de portada no puede superar ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`,
      )

    const editingExisting = editingInitiativeId != null
    const id = editingExisting ? editingInitiativeId : Date.now()
    const prev = editingExisting ? (db.initiatives || []).find((i) => i.id === editingInitiativeId) : null

    const doSave = async () => {
      setIsSubmittingInitiative(true)
      try {
        let imageUrl = null
        if (prev?.image && !isNewsFallbackImageUrl(prev.image)) imageUrl = prev.image
        if (coverImageFile) {
          imageUrl = await uploadEntityCoverImage(coverImageFile, 'initiatives', id)
        }

        const newOptions = validOptions.map((o, i) => ({ id: `opt${i}`, text: o.text }))
        const finalInit = prev
          ? {
              ...prev,
              id,
              title: newSurvey.title,
              excerpt: newSurvey.excerpt,
              deadline: newSurvey.deadline,
              isProposal: false,
              image: imageUrl,
              survey: {
                ...prev.survey,
                question: newSurvey.question,
                requiresBudget: newSurvey.requiresBudget,
                budgetAmount: newSurvey.requiresBudget ? Number(newSurvey.budgetAmount) : null,
                expectedQuotaPerLotCOP:
                  newSurvey.requiresBudget && newSurvey.expectedQuotaPerLotCOP
                    ? Number(newSurvey.expectedQuotaPerLotCOP)
                    : null,
                options: newOptions,
                votes: prev.survey?.votes || [],
              },
            }
          : {
              id,
              title: newSurvey.title,
              excerpt: newSurvey.excerpt,
              author: currentUser.lotNumber,
              date: new Date().toLocaleDateString('es-CO'),
              deadline: newSurvey.deadline,
              convertedToProject: false,
              votingClosed: false,
              isProposal: false,
              image: imageUrl,
              survey: {
                question: newSurvey.question,
                requiresBudget: newSurvey.requiresBudget,
                budgetAmount: newSurvey.requiresBudget ? Number(newSurvey.budgetAmount) : null,
                expectedQuotaPerLotCOP:
                  newSurvey.requiresBudget && newSurvey.expectedQuotaPerLotCOP
                    ? Number(newSurvey.expectedQuotaPerLotCOP)
                    : null,
                options: newOptions,
                votes: [],
              },
            }

        await saveInitiative(finalInit)
        void trackPortalEvent('survey_publish', { mode: editingExisting ? 'edit' : 'new' })
        logAction(editingExisting ? 'EDITAR_ENCUESTA' : 'CREAR_ENCUESTA', `${editingExisting ? 'Editó' : 'Creó'}: ${finalInit.title}`)
        cancelCreateOrEdit()
        showAlert(editingExisting ? 'Votación actualizada correctamente.' : '¡La iniciativa y su encuesta han sido publicadas a la comunidad!')
      } catch (err) {
        console.error(err)
        if (err instanceof Error && err.message === 'ENTITY_IMAGE_TOO_LARGE') {
          showAlert(`La imagen supera ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`)
        } else showAlert('No se pudo publicar la iniciativa.')
      } finally {
        setIsSubmittingInitiative(false)
      }
    }

    if (!editingExisting && isGeminiConfigured() && surveyInitiatives.length > 0) {
      try {
        const result = await fetchGeminiDuplicateCheck(
          newSurvey.title.trim(),
          newSurvey.excerpt.trim(),
          surveyInitiatives.map((i) => ({ title: i.title || '', excerpt: i.excerpt || '' })),
        )
        if (result?.hasSimilar && result.similarTitles.length > 0) {
          const list = result.similarTitles.map((t) => `• ${t}`).join('\n')
          showConfirm(
            `Ya existe una votación similar:\n${list}\n\n¿Deseas publicar tu votación de todas formas?`,
            () => void doSave(),
          )
          return
        }
      } catch { /* silently ignore */ }
    }

    await doSave()
  }

  useEffect(() => {
    if (!showCreateForm) return
    const node = createFormRef.current
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showCreateForm, editingInitiativeId])

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ImageCropDialog
        open={activeCoverCropFile !== null}
        file={activeCoverCropFile}
        title="Recortar portada de la votación"
        onConfirm={handleCoverCropConfirm}
        onCancel={handleCoverCropCancel}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-3xl font-black text-stone-800">Iniciativas y Votaciones</h2>
          <p className="text-stone-600 mt-1">Propón ideas, participa y decide en comunidad.</p>
        </div>
        {canManageInitiatives && (
          <button
            type="button"
            onClick={() => {
              if (showCreateForm) cancelCreateOrEdit()
              else setShowCreateForm(true)
            }}
            className="bg-stone-900 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-stone-800 transition-colors"
          >
            {showCreateForm ? (
              'Cancelar'
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2 text-amber-400" /> Crear/Editar Votación
              </>
            )}
          </button>
        )}
      </div>

      {showCreateForm && (
        <div
          ref={createFormRef}
          className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-sm animate-in slide-in-from-top-4"
        >
          <h3 className="text-xl font-black flex items-center mb-6">
            <Sparkles className="w-5 h-5 text-amber-500 mr-2" /> {editingInitiativeId != null ? 'Editar votación' : 'Creador de Encuestas Asistido'}
          </h3>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <button
              type="button"
              onClick={() => void triggerSurveyCopyAssistant()}
              disabled={copyAiBusy}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {copyAiBusy ? 'Procesando…' : 'Sugerir redacción (IA)'}
            </button>
            <button
              type="button"
              onClick={() => void triggerAIAssistant()}
              disabled={isAnalyzing}
              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {isAnalyzing ? 'Analizando…' : 'Sugerir opciones (IA)'}
            </button>
            <p className="text-xs text-stone-700">La IA se concentra en redacción y opciones, no en fecha ni presupuesto.</p>
          </div>
          <form onSubmit={handleCreateSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Título de la iniciativa *</label>
                <input
                  required
                  value={newSurvey.title}
                  onChange={(e) => setNewSurvey({ ...newSurvey, title: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500"
                  placeholder="Ej: Construcción de parque infantil"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Contexto / justificación *</label>
                <textarea
                  required
                  value={newSurvey.excerpt}
                  onChange={(e) => setNewSurvey({ ...newSurvey, excerpt: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500 h-24"
                  placeholder="Explica los beneficios para la comunidad..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Fecha y Hora de Cierre *</label>
                <input
                  required
                  type="datetime-local"
                  value={newSurvey.deadline}
                  onChange={(e) => setNewSurvey({ ...newSurvey, deadline: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2 bg-stone-50 p-4 rounded-xl border border-stone-100 flex flex-col gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSurvey.requiresBudget}
                    onChange={(e) => setNewSurvey({ ...newSurvey, requiresBudget: e.target.checked })}
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 mr-3"
                  />
                  <span className="font-bold text-stone-800">
                    Esta iniciativa requiere aprobación de presupuesto
                  </span>
                </label>
                {newSurvey.requiresBudget && (
                  <div className="pl-8">
                    <label className="block text-sm font-bold text-stone-700 mb-1.5">Monto estimado (COP) *</label>
                    <input
                      type="number"
                      required
                      value={newSurvey.budgetAmount}
                      onChange={(e) => setNewSurvey({ ...newSurvey, budgetAmount: e.target.value })}
                      className="w-full md:w-1/2 border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500"
                      placeholder="Ej: 5000000"
                    />
                    <label className="block text-sm font-bold text-stone-700 mt-3 mb-1.5">
                      Cuota o aporte esperado por lote (COP) — opcional
                    </label>
                    <input
                      type="number"
                      value={newSurvey.expectedQuotaPerLotCOP}
                      onChange={(e) =>
                        setNewSurvey({ ...newSurvey, expectedQuotaPerLotCOP: e.target.value })
                      }
                      className="w-full md:w-1/2 border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500"
                      placeholder="Ej: 50000"
                    />
                    <p className="text-xs text-stone-600 mt-1">
                      Referencia opcional para estimar el aporte mensual promedio por lote.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-stone-200 rounded-2xl p-4 bg-stone-50/90 mb-2">
              <label className="block text-sm font-bold text-stone-800 mb-2">
                Imagen de portada (opcional, 1 foto; podrás recortarla como en Información de Interés; máx.{' '}
                {Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024))} MB de origen, hasta{' '}
                {Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB al publicar)
              </label>
              <input
                type="file"
                accept="image/*"
                className="w-full text-sm font-medium text-stone-800 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) handleCoverPicked(f)
                }}
              />
              {coverImageFile && (
                <p className="text-xs text-stone-700 mt-2">
                  Seleccionada: {coverImageFile.name} ({Math.round(coverImageFile.size / 1024)} KB). Máx.{' '}
                  {Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB. Si no subes imagen, la tarjeta no mostrará foto.
                </p>
              )}
            </div>

            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
              <label className="mb-2 block text-base font-bold text-blue-900">Pregunta de la encuesta *</label>
              <input
                required
                value={newSurvey.question}
                onChange={(e) => setNewSurvey({ ...newSurvey, question: e.target.value })}
                className="w-full border border-blue-200 p-3 rounded-xl mb-4 font-bold outline-none focus:border-blue-400"
                placeholder="Ej: ¿Estás de acuerdo con el presupuesto?"
              />

              <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <span className="block text-sm font-bold text-blue-800">Opciones de Respuesta</span>
                <span className="text-xs text-stone-700">Puedes sugerir opciones desde el botón superior.</span>
              </div>

              <div className="space-y-3">
                {newSurvey.options.map((opt, idx) => (
                  <div key={opt.id} className="flex gap-2 items-center">
                    <input
                      required
                      value={opt.text}
                      onChange={(e) =>
                        setNewSurvey((p) => ({
                          ...p,
                          options: p.options.map((o) => (o.id === opt.id ? { ...o, text: e.target.value } : o)),
                        }))
                      }
                      className="flex-1 border border-blue-200 p-3 rounded-xl outline-none focus:border-blue-400"
                      placeholder={`Opción ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewSurvey((p) => ({ ...p, options: p.options.filter((o) => o.id !== opt.id) }))
                      }
                      className="text-red-500 p-3 border border-red-200 rounded-xl bg-white hover:bg-red-50"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setNewSurvey((p) => ({ ...p, options: [...p.options, { id: Date.now(), text: '' }] }))}
                className="mt-4 text-blue-600 font-bold text-sm flex items-center"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" /> Añadir opción manual
              </button>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmittingInitiative}
                className="w-full bg-stone-900 text-white p-4 rounded-xl font-bold hover:bg-stone-800 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmittingInitiative ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Publicando…
                  </>
                ) : editingInitiativeId != null ? (
                  'Guardar cambios de votación'
                ) : (
                  'Publicar Iniciativa'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {surveyInitiatives.length === 0 && !showCreateForm && (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center">
          <BarChart2 className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          <p className="text-stone-800 font-bold text-lg mb-1">No hay votaciones disponibles</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Cuando publiquen una votación, aparecerá aquí para que la comunidad participe.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {surveyInitiatives.map((post) => {
          const votingClosed = isVotingClosed(post)
          const { formatted } = safeDateParse(post.deadline)
          const timeRemainingLabel = getTimeRemainingLabel(post.deadline)
          const votes = post.survey?.votes || []
          const userVote = votes.find((v) => v.lot === currentUser.lotNumber)
          const isEditing = editingSurveys[post.id]
          const totalMembers = 89
          const options = post.survey?.options || []
          const optionVoteCounts = options.map((opt) => ({
            ...opt,
            count: votes.filter((v) => String(coerceSurveyOptionId(options, v.optionId)) === String(opt.id)).length,
          }))
          const maxVotesInOption = Math.max(...optionVoteCounts.map((opt) => opt.count), 0)
          const totalVotes = votes.length

          const coverSrc =
            post.image && !isNewsFallbackImageUrl(post.image) ? post.image : null
          return (
            <article
              key={post.id}
              className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/40 border border-emerald-100/30 rounded-3xl shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md"
            >
              {coverSrc ? (
                <div className="relative h-52 sm:h-64 shrink-0 overflow-hidden bg-stone-100">
                  <img
                    src={coverSrc}
                    alt=""
                    className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 ${votingClosed ? 'grayscale opacity-80' : ''}`}
                  />
                  <span
                    className={`absolute top-4 left-4 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${votingClosed ? 'bg-stone-800' : 'bg-emerald-600'}`}
                  >
                    {votingClosed ? 'Votación Finalizada' : 'Activa'}
                  </span>
                </div>
              ) : (
                <div className="relative flex h-14 sm:h-16 shrink-0 items-center px-6 bg-stone-50 border-b border-stone-100">
                  <span
                    className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${votingClosed ? 'bg-stone-800' : 'bg-emerald-600'}`}
                  >
                    {votingClosed ? 'Votación Finalizada' : 'Activa'}
                  </span>
                </div>
              )}
              {post.adminSuppressed && canManageInitiatives && (
                <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-black">
                  <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  Oculta para vecinos
                </div>
              )}
              <div className="p-6 md:p-8 flex-1 flex flex-col gap-4">
                <h3 className="text-2xl font-bold text-stone-800 mb-2">{post.title}</h3>
                <div className="flex items-center text-xs font-bold uppercase tracking-wider text-stone-500 mb-4 gap-4">
                  <span className="flex items-center bg-stone-50 px-3 py-1.5 rounded-lg">
                    <User className="w-3.5 h-3.5 mr-1" />
                    {post.author === currentUser.lotNumber ? 'Tú' : post.author}
                  </span>
                  <span className="flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    {post.date}
                  </span>
                </div>
                <p className="text-stone-700 mb-4 text-sm flex-1">{post.excerpt}</p>
                <p className="text-xs font-bold text-stone-600 mb-4 flex items-center flex-wrap gap-x-2 gap-y-1">
                  <Clock className="w-4 h-4 mr-1.5 text-stone-500" />
                  {votingClosed ? 'Cerró:' : 'Cierra:'} {formatted}
                  {!votingClosed && timeRemainingLabel && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {timeRemainingLabel}
                    </span>
                  )}
                </p>

                {post.survey?.requiresBudget && (
                  <div className="mb-6 bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center w-fit">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest mr-2">
                      Presupuesto Estimado:
                    </span>
                    <span className="text-sm font-black text-emerald-600">
                      {formatCurrency(post.survey.budgetAmount)}
                    </span>
                  </div>
                )}

                {votingClosed || (userVote && !isEditing) ? (
                  <div className="bg-gradient-to-b from-stone-100/90 to-emerald-50/30 rounded-2xl border border-emerald-100/50 mt-auto overflow-hidden">
                    <div className="bg-white p-5 border-b border-stone-200">
                      <div className="flex items-center mb-1">
                        <ArrowLeft className="w-5 h-5 text-stone-600 mr-3 shrink-0" aria-hidden />
                        <span className="font-bold text-stone-800 text-lg">Votos de la encuesta</span>
                      </div>
                      <h4 className="font-medium text-stone-900 text-[15px] leading-snug mt-2 flex items-start">
                        <BarChart2 className="w-4 h-4 text-stone-500 mr-2 shrink-0 mt-0.5" />
                        {post.survey?.question}
                      </h4>
                      <p className="text-xs text-stone-600 mt-2 font-medium">
                        {votes.length} de {totalMembers} miembros votaron.
                      </p>
                    </div>

                    <div className="divide-y divide-stone-100">
                      {optionVoteCounts.map((opt) => {
                        const vts = votes.filter(
                          (v) => String(coerceSurveyOptionId(options, v.optionId)) === String(opt.id),
                        )
                        const isWinner = vts.length > 0 && vts.length === maxVotesInOption
                        const isSelectedByMe = userVote?.optionId === opt.id

                        return (
                          <div key={opt.id} className="bg-white p-4">
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-medium text-stone-900 text-[15px] flex items-start">
                                {isSelectedByMe && (
                                  <div className="bg-emerald-500 rounded-sm w-4 h-4 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                                {opt.text}
                              </span>
                              <div className="flex items-center text-sm font-medium text-stone-600 shrink-0 ml-4">
                                {vts.length} {isWinner && <span className="text-stone-500 ml-1.5 text-sm">★</span>}
                              </div>
                            </div>

                            <details className="mt-2 rounded-lg border border-stone-200 bg-white">
                              <summary className="cursor-pointer px-3 py-2 text-[11px] font-black uppercase tracking-wide text-stone-700">
                                Ver votantes de esta opción ({vts.length})
                              </summary>
                              <div className="space-y-3 pl-6 pr-3 py-3 border-t border-stone-200">
                                {vts.map((v, i) => (
                                  <div key={i} className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-stone-200 overflow-hidden mr-3 shrink-0">
                                      <User className="w-5 h-5 text-stone-500 mx-auto mt-1.5" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[14px] font-bold text-stone-900 leading-tight">
                                        {v.lot === currentUser.lotNumber ? 'Tú' : v.lot}
                                      </span>
                                      <span className="text-xs text-stone-600 mt-0.5">{v.timestamp}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )
                      })}
                    </div>
                    <div className="p-3 bg-stone-50 border-t border-stone-200 flex flex-wrap gap-2 justify-end">
                      {userVote && !votingClosed && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOptions((p) => ({ ...p, [post.id]: userVote.optionId }))
                            setEditingSurveys((p) => ({ ...p, [post.id]: true }))
                          }}
                          className="text-emerald-600 font-bold text-sm px-4 py-2 hover:bg-emerald-100 rounded-lg transition-colors flex items-center"
                        >
                          <Edit3 className="w-4 h-4 mr-2" /> Modificar mi voto
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mt-auto rounded-2xl p-6 border transition-colors ${isEditing ? 'bg-amber-50/50 border-amber-200' : 'bg-blue-50/30 border-blue-100'}`}
                  >
                    <h4 className="font-bold text-stone-900 text-lg mb-2 flex items-start">
                      <BarChart2
                        className={`w-5 h-5 mr-2 shrink-0 mt-0.5 ${isEditing ? 'text-amber-500' : 'text-blue-500'}`}
                      />
                      {post.survey?.question}
                    </h4>
                    <div className="space-y-2 mb-6">
                      {options.map((opt) => {
                        const isSelected = selectedOptions[post.id] === opt.id
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center p-4 bg-white border rounded-xl cursor-pointer transition-all shadow-sm ${isSelected ? (isEditing ? 'border-amber-400' : 'border-blue-400') : 'border-stone-200 hover:border-stone-300'}`}
                          >
                            <input
                              type="radio"
                              name={`vote-${post.id}`}
                              checked={isSelected}
                              onChange={() => setSelectedOptions((p) => ({ ...p, [post.id]: opt.id }))}
                              className={`w-5 h-5 ${isEditing ? 'text-amber-600' : 'text-blue-600'}`}
                            />
                            <span className={`ml-3 font-bold ${isSelected ? 'text-stone-900' : 'text-stone-700'}`}>
                              {opt.text}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <div className="mb-6 rounded-xl border border-emerald-100 bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-800">
                          {votingClosed ? 'Resultados finales' : 'Resultados parciales'}
                        </p>
                        <p className="text-xs font-bold text-stone-600">
                          {totalVotes} voto{totalVotes === 1 ? '' : 's'} registrados
                        </p>
                      </div>
                      <div className="space-y-2">
                        {optionVoteCounts.map((opt) => {
                          const pct = totalVotes > 0 ? Math.round((opt.count / totalVotes) * 100) : 0
                          const isWinner = opt.count > 0 && opt.count === maxVotesInOption
                          return (
                            <div key={`partial-${post.id}-${opt.id}`} className="space-y-1 rounded-lg border border-stone-100 bg-stone-50/40 p-2.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-stone-800">
                                  {opt.text}
                                  {isWinner ? <span className="ml-1 text-amber-600">★</span> : null}
                                </span>
                                <span className="font-black text-stone-700">
                                  {opt.count} ({pct}%)
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-stone-200 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <details className="mt-3 rounded-lg border border-stone-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-[11px] font-black uppercase tracking-wide text-stone-700">
                          Ver detalle de quién votó por opción
                        </summary>
                        <div className="border-t border-stone-200 p-3 space-y-2">
                          {optionVoteCounts.map((opt) => {
                            const vts = votes.filter(
                              (v) => String(coerceSurveyOptionId(options, v.optionId)) === String(opt.id),
                            )
                            return (
                              <div key={`voter-detail-${post.id}-${opt.id}`} className="rounded-md border border-stone-100 bg-stone-50/50 p-2">
                                <p className="text-[11px] font-black text-stone-700 mb-1">{opt.text}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {vts.length > 0 ? (
                                    vts.map((v, idx) => (
                                      <span
                                        key={`voter-chip-${post.id}-${opt.id}-${idx}`}
                                        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                                          v.lot === currentUser.lotNumber
                                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                            : 'border-stone-200 bg-white text-stone-700'
                                        }`}
                                        title={v.timestamp || ''}
                                      >
                                        {v.lot === currentUser.lotNumber ? 'Tú' : v.lot}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[11px] text-stone-500">Sin votos aún en esta opción.</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </details>
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleVote(post.id)}
                        className={`flex-1 text-white font-bold py-3 rounded-xl shadow-sm transition-transform hover:scale-[1.02] ${isEditing ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {isEditing ? 'Guardar Nuevo Voto' : 'Confirmar Voto'}
                      </button>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => setEditingSurveys((p) => ({ ...p, [post.id]: false }))}
                          className="flex-1 bg-white border border-stone-200 rounded-xl font-bold text-stone-700 hover:bg-stone-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {canManageInitiatives && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    {!votingClosed && (
                      <button
                        type="button"
                        onClick={() => handleFinalizeInitiative(post)}
                        className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100"
                      >
                        <Check className="w-4 h-4 mr-1.5" /> Finalizar votación
                      </button>
                    )}
                    {votingClosed && canManageInitiatives && !post.convertedToProject && (
                      <button
                        type="button"
                        onClick={() => handleConvertToProject(post)}
                        className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 shadow-sm"
                      >
                        <Rocket className="w-4 h-4 mr-1.5" /> Convertir en proyecto
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditInitiative(post)}
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900 hover:bg-emerald-100"
                    >
                      <Edit3 className="w-4 h-4 mr-1.5" /> Editar votación
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSuppressed(post)}
                      className={`inline-flex items-center rounded-lg border px-3 py-2 text-xs font-black ${
                        post.adminSuppressed
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                          : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      {post.adminSuppressed ? (
                        <><Eye className="w-4 h-4 mr-1.5" /> Mostrar a vecinos</>
                      ) : (
                        <><EyeOff className="w-4 h-4 mr-1.5" /> Ocultar votación</>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInitiative(post)}
                      className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar votación
                    </button>
                  </div>
                )}

                {currentUser.role === 'superadmin' && post.survey && (
                  <SuperadminVotesPanel
                    post={post}
                    db={db}
                    saveInitiative={saveInitiative}
                    logAction={logAction}
                    showAlert={showAlert}
                  />
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default InitiativesView
