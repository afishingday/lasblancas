import { useState, useMemo, useCallback } from 'react'
import { PlusCircle, Sparkles, Edit3, Trash2, BarChart2, Star } from 'lucide-react'
import ReactionBar from '../../shared/ReactionBar.jsx'
import {
  isAdminLike,
  toLocalDatetimeInputValue,
  requestPolishedText,
} from '../../shared/utils.js'
import {
  polishProposalWallDraft,
  fetchGeminiProjectDescriptionFromTitle,
  fetchGeminiDuplicateCheck,
  isGeminiConfigured,
  getLastGeminiDetail,
} from '../../geminiClient.js'
import { trackPortalEvent } from '../../analytics.js'

const ProposalsView = ({
  currentUser,
  db,
  saveInitiative,
  deleteInitiative,
  logAction,
  showAlert,
  showConfirm,
}) => {
  const canManageInitiatives = isAdminLike(currentUser)
  const [showProposalForm, setShowProposalForm] = useState(false)
  const [proposalSaving, setProposalSaving] = useState(false)
  const [proposalAiBusy, setProposalAiBusy] = useState(false)
  const [editingProposalId, setEditingProposalId] = useState(null)
  const [proposalDraft, setProposalDraft] = useState({ title: '', excerpt: '' })
  const [sortBy, setSortBy] = useState('date')

  const projectProposals = useMemo(
    () => (db.initiatives || []).filter((i) => i?.isProposal),
    [db.initiatives],
  )

  const getProposalRatingMeta = useCallback(
    (proposal) => {
      const ratings = Array.isArray(proposal?.ratings) ? proposal.ratings : []
      const normalized = ratings
        .map((row) => ({
          lot: String(row?.lot ?? '').trim(),
          stars: Number(row?.stars),
        }))
        .filter((row) => row.lot && Number.isFinite(row.stars) && row.stars >= 1 && row.stars <= 5)

      const total = normalized.reduce((acc, row) => acc + row.stars, 0)
      const average = normalized.length ? total / normalized.length : 0
      const mine = normalized.find((row) => row.lot === currentUser.lotNumber)?.stars ?? 0

      return {
        average,
        count: normalized.length,
        mine,
      }
    },
    [currentUser.lotNumber],
  )

  const sortedProposals = useMemo(() => {
    const list = [...projectProposals]
    if (sortBy === 'rating') {
      return list.sort((a, b) => {
        const ratingA = getProposalRatingMeta(a).average
        const ratingB = getProposalRatingMeta(b).average
        if (ratingB !== ratingA) return ratingB - ratingA
        return Number(a.id) - Number(b.id)
      })
    }
    return list.sort((a, b) => Number(a.id) - Number(b.id))
  }, [projectProposals, sortBy, getProposalRatingMeta])

  const resetProposalForm = () => {
    setShowProposalForm(false)
    setEditingProposalId(null)
    setProposalDraft({ title: '', excerpt: '' })
  }

  const handleCreateProposal = async (e) => {
    e.preventDefault()
    const titleTrimmed = proposalDraft.title.trim()
    const excerptTrimmed = proposalDraft.excerpt.trim()
    if (!titleTrimmed) return showAlert('Escribe el título de la propuesta.')
    if (!excerptTrimmed) return showAlert('Agrega una breve descripción de la propuesta.')

    const isEditingProposal = editingProposalId != null
    const prev = isEditingProposal ? (db.initiatives || []).find((i) => i.id === editingProposalId) : null
    const proposal = {
      ...(prev || {}),
      id: editingProposalId || Date.now(),
      title: titleTrimmed,
      excerpt: excerptTrimmed,
      author: prev?.author || currentUser.lotNumber,
      date: prev?.date || new Date().toLocaleDateString('es-CO'),
      isProposal: true,
      proposalStatus: 'pendiente',
      convertedToProject: false,
      votingClosed: false,
      image: null,
    }

    const doSave = async () => {
      setProposalSaving(true)
      try {
        await saveInitiative(proposal)
        void trackPortalEvent('proposal_submit', { mode: isEditingProposal ? 'edit' : 'new' })
        logAction(
          isEditingProposal ? 'EDITAR_PROPUESTA' : 'PROPONER_PROYECTO',
          `${isEditingProposal ? 'Editó' : 'Propuso'}: ${proposal.title}`,
        )
        resetProposalForm()
        showAlert(
          isEditingProposal
            ? 'Propuesta actualizada.'
            : 'Propuesta enviada. Quienes coordinan el portal pueden convertirla en votación.',
        )
      } catch (err) {
        console.error(err)
        showAlert('No se pudo guardar la propuesta.')
      } finally {
        setProposalSaving(false)
      }
    }

    if (isEditingProposal) {
      showConfirm(`¿Guardar los cambios en "${titleTrimmed}"?`, () => void doSave())
      return
    }

    if (isGeminiConfigured() && projectProposals.length > 0) {
      setProposalAiBusy(true)
      try {
        const result = await fetchGeminiDuplicateCheck(
          titleTrimmed,
          excerptTrimmed,
          projectProposals.map((p) => ({ title: p.title || '', excerpt: p.excerpt || '' })),
        )
        if (result?.hasSimilar && result.similarTitles.length > 0) {
          const list = result.similarTitles.map((t) => `• ${t}`).join('\n')
          showConfirm(
            `Ya existe una propuesta similar:\n${list}\n\n¿Deseas enviar tu propuesta de todas formas?`,
            () => void doSave(),
          )
          return
        }
      } catch { /* silently ignore */ } finally {
        setProposalAiBusy(false)
      }
    }

    showConfirm(`¿Enviar la propuesta "${titleTrimmed}"?`, () => void doSave())
  }

  const handleProposalAiPolish = async () => {
    const titleIn = proposalDraft.title.trim()
    const excerptIn = proposalDraft.excerpt.trim()
    if (!titleIn && !excerptIn) {
      showAlert('Escribe título o descripción para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setProposalAiBusy(true)
    try {
      const res = await polishProposalWallDraft({ title: proposalDraft.title, excerpt: proposalDraft.excerpt })
      if (!res) {
        const d = getLastGeminiDetail()
        showAlert(d ? `La IA no respondió: ${d}` : 'La IA no devolvió texto. Revisa la clave en .env o inténtalo en unos segundos.')
        return
      }
      setProposalDraft((prev) => {
        const nextTitle = titleIn ? (res.title || prev.title) : prev.title
        const nextExcerpt = excerptIn ? (res.excerpt || prev.excerpt) : prev.excerpt
        return { ...prev, title: nextTitle, excerpt: nextExcerpt }
      })
      const improvedTitle = titleIn && res.title && res.title !== titleIn
      const improvedExcerpt = excerptIn && res.excerpt && res.excerpt !== excerptIn
      if (!improvedTitle && !improvedExcerpt && (titleIn || excerptIn)) {
        showAlert('La IA devolvió el mismo texto o vacío. Prueba acortando o añade un poco más de contexto.')
      } else if (!excerptIn && titleIn) {
        showAlert('Título revisado con IA. Para la descripción vacía, usa «Descripción desde el título».')
      } else {
        showAlert('Sugerencias de redacción aplicadas. Revísalas antes de enviar.')
      }
    } catch (err) {
      console.error(err)
      showAlert(err instanceof Error ? err.message : 'Error al contactar la IA.')
    } finally {
      setProposalAiBusy(false)
    }
  }

  const handleProposalDescriptionFromTitle = async () => {
    if (!proposalDraft.title.trim()) return showAlert('Escribe el título de la propuesta primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setProposalAiBusy(true)
    try {
      const aiResponse = await fetchGeminiProjectDescriptionFromTitle(proposalDraft.title, { mode: 'proposal' })
      if (aiResponse?.description) {
        setProposalDraft((prev) => ({ ...prev, excerpt: aiResponse.description }))
        showAlert('Descripción sugerida a partir del título. Revísala antes de enviar.')
      } else {
        const d = getLastGeminiDetail()
        showAlert(d ? `La IA no respondió: ${d}` : 'No se pudo generar la descripción. Inténtalo de nuevo.')
      }
    } catch (err) {
      console.error(err)
      showAlert(err instanceof Error ? err.message : 'Error al contactar la IA.')
    } finally {
      setProposalAiBusy(false)
    }
  }

  const startEditProposal = (proposal) => {
    setEditingProposalId(proposal.id)
    setProposalDraft({
      title: proposal.title || '',
      excerpt: proposal.excerpt || '',
    })
    setShowProposalForm(true)
  }

  const handleDeleteProposal = (proposal) => {
    showConfirm(`¿Eliminar la propuesta "${proposal.title}"? Esta acción no se puede deshacer.`, async () => {
      try {
        await deleteInitiative(proposal.id)
        logAction('ELIMINAR_PROPUESTA', `Eliminó propuesta #${proposal.id}`)
        showAlert('Propuesta eliminada correctamente.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar la propuesta.')
      }
    })
  }

  const handleConvertProposalToSurvey = (proposal) => {
    showConfirm(
      `¿Convertir "${proposal.title}" en votación? Se publicará de inmediato en la pestaña de Votaciones.`,
      async () => {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const converted = {
          ...proposal,
          isProposal: false,
          proposalStatus: 'convertida',
          convertedToProject: false,
          votingClosed: false,
          deadline: toLocalDatetimeInputValue(tomorrow),
          survey: {
            question: `¿Apruebas la propuesta: "${proposal.title || 'Proyecto'}"?`,
            requiresBudget: false,
            budgetAmount: null,
            options: [
              { id: 'opt0', text: 'Sí, de acuerdo' },
              { id: 'opt1', text: 'No, por ahora no' },
            ],
            votes: [],
          },
        }
        try {
          await saveInitiative(converted)
          void trackPortalEvent('proposal_to_survey', { source: 'proposal_wall' })
          logAction('CONVERTIR_PROPUESTA_ENCUESTA', `Convirtió propuesta #${proposal.id} en votación`)
          showAlert('La propuesta se convirtió en votación y ya aparece en la pestaña Votaciones.')
        } catch (err) {
          console.error(err)
          showAlert('No se pudo convertir la propuesta en votación.')
        }
      },
    )
  }

  const handleRateProposal = async (proposal, stars) => {
    const starsValue = Number(stars)
    if (!Number.isInteger(starsValue) || starsValue < 1 || starsValue > 5) return

    const lot = String(currentUser.lotNumber ?? '').trim()
    if (!lot) return showAlert('No encontramos tu lote para registrar la calificación.')

    const currentRatings = Array.isArray(proposal?.ratings) ? proposal.ratings : []
    const nextRatings = []
    let hasExisting = false

    currentRatings.forEach((row) => {
      const rowLot = String(row?.lot ?? '').trim()
      const rowStars = Number(row?.stars)
      if (!rowLot || !Number.isFinite(rowStars) || rowStars < 1 || rowStars > 5) return
      if (rowLot === lot) {
        nextRatings.push({
          lot,
          stars: starsValue,
          timestamp: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
        })
        hasExisting = true
      } else {
        nextRatings.push({
          lot: rowLot,
          stars: rowStars,
          timestamp: row?.timestamp || null,
        })
      }
    })

    if (!hasExisting) {
      nextRatings.push({
        lot,
        stars: starsValue,
        timestamp: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }),
      })
    }

    try {
      await saveInitiative({
        ...proposal,
        ratings: nextRatings,
      })
      logAction(hasExisting ? 'EDITAR_CALIFICACION_PROPUESTA' : 'CALIFICAR_PROPUESTA', `${lot} calificó propuesta #${proposal.id} con ${starsValue} estrella(s)`)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo guardar tu calificación. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-100 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-stone-900">Muro de Propuestas</h2>
          <p className="text-stone-600 mt-1">Espacio para plantear ideas de mejora que luego pueden pasar a votación.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showProposalForm) resetProposalForm()
            else setShowProposalForm(true)
          }}
          className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <PlusCircle className="w-4 h-4 mr-2" /> {showProposalForm ? 'Cerrar propuesta' : 'Proponer Proyecto'}
        </button>
      </div>

      {showProposalForm && (
        <div className="bg-white p-6 md:p-7 rounded-3xl border border-emerald-100 shadow-sm">
          <h3 className="text-lg font-black text-emerald-900 mb-4">
            {editingProposalId ? 'Editar propuesta de proyecto' : 'Proponer un proyecto para la comunidad'}
          </h3>
          <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => void handleProposalAiPolish()}
              disabled={proposalAiBusy}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {proposalAiBusy ? 'Procesando…' : 'Mejorar lo que escribí (IA)'}
            </button>
            <button
              type="button"
              onClick={() => void handleProposalDescriptionFromTitle()}
              disabled={proposalAiBusy}
              className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              Descripción desde el título
            </button>
            <p className="text-xs text-stone-700 sm:min-w-0 sm:flex-1">
              «Mejorar lo que escribí» pulirá título y texto si ya los tienes. «Descripción desde el título» rellena o
              sustituye la descripción según el título; revísala siempre antes de enviar.
            </p>
          </div>
          <form onSubmit={handleCreateProposal} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-stone-800 mb-1">Título *</label>
              <input
                required
                value={proposalDraft.title}
                onChange={(e) => setProposalDraft((d) => ({ ...d, title: e.target.value }))}
                className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-400"
                placeholder="Ej: Mejorar iluminación en senderos"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-stone-800 mb-1">Descripción breve *</label>
              <textarea
                required
                value={proposalDraft.excerpt}
                onChange={(e) => setProposalDraft((d) => ({ ...d, excerpt: e.target.value }))}
                className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-400 h-24"
                placeholder="Cuéntanos qué se quiere hacer y por qué."
              />
            </div>
            <button
              type="submit"
              disabled={proposalSaving || proposalAiBusy}
              className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {proposalSaving
                ? 'Guardando…'
                : proposalAiBusy
                  ? 'Verificando…'
                  : editingProposalId
                    ? 'Guardar cambios de propuesta'
                    : 'Enviar propuesta'}
            </button>
          </form>
        </div>
      )}

      {projectProposals.length === 0 && !showProposalForm && (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center">
          <BarChart2 className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          <p className="text-stone-800 font-bold text-lg mb-1">No hay propuestas registradas</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Usa el botón «Proponer Proyecto» para abrir el muro y registrar la primera idea de mejora.
          </p>
        </div>
      )}

      {projectProposals.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Ordenar por:</span>
            <button
              type="button"
              onClick={() => setSortBy('date')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-colors ${sortBy === 'date' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-300'}`}
            >
              Fecha
            </button>
            <button
              type="button"
              onClick={() => setSortBy('rating')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-colors ${sortBy === 'rating' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-300'}`}
            >
              Calificación
            </button>
          </div>
          {sortedProposals.map((proposal) => {
            const canEditOwnProposal = proposal.author === currentUser.lotNumber || canManageInitiatives
            const ratingMeta = getProposalRatingMeta(proposal)
            return (
              <article key={proposal.id} className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h4 className="text-xl font-black text-stone-900">{proposal.title}</h4>
                    <p className="text-xs text-stone-600 mt-1">
                      Propuesta por {proposal.author === currentUser.lotNumber ? 'ti' : proposal.author} · {proposal.date}
                    </p>
                  </div>
                  <span className="inline-flex px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Pendiente de encuesta
                  </span>
                </div>
                <p className="text-stone-800 text-sm mt-4 whitespace-pre-wrap">{proposal.excerpt}</p>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-bold text-stone-700">
                      ¿Qué tan importante te parece esta propuesta?
                    </p>
                    <p className="text-xs font-black text-amber-800">
                      Promedio: {ratingMeta.average ? ratingMeta.average.toFixed(1) : '0.0'} / 5
                      {' · '}
                      {ratingMeta.count} voto{ratingMeta.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((stars) => {
                      const active = stars <= (ratingMeta.mine || 0)
                      return (
                        <button
                          key={`${proposal.id}-star-${stars}`}
                          type="button"
                          onClick={() => void handleRateProposal(proposal, stars)}
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                            active
                              ? 'border-amber-300 bg-amber-100 text-amber-600'
                              : 'border-stone-200 bg-white text-stone-400 hover:border-amber-200 hover:text-amber-500'
                          }`}
                          aria-label={`Calificar con ${stars} estrella${stars === 1 ? '' : 's'}`}
                          title={`Calificar con ${stars} estrella${stars === 1 ? '' : 's'}`}
                        >
                          <Star className="h-4 w-4" fill="currentColor" />
                        </button>
                      )
                    })}
                    <span className="ml-1 text-xs font-semibold text-stone-600">
                      Tu voto: {ratingMeta.mine || 0} / 5 (puedes cambiarlo)
                    </span>
                  </div>
                </div>
                <div className="mt-3">
                  <ReactionBar
                    appContext="lasBlancas"
                    contentType="initiative"
                    contentId={proposal.id}
                    userId={currentUser.lotNumber}
                  />
                </div>
                {canEditOwnProposal && (
                  <div className="pt-4 mt-4 border-t border-stone-100 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditProposal(proposal)}
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                    >
                      <Edit3 className="w-4 h-4 mr-1.5" /> Editar propuesta
                    </button>
                    {canManageInitiatives && (
                      <button
                        type="button"
                        onClick={() => handleConvertProposalToSurvey(proposal)}
                        className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"
                      >
                        <Sparkles className="w-4 h-4 mr-1.5 text-amber-300" /> Convertir en encuesta
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteProposal(proposal)}
                      className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar propuesta
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ProposalsView
