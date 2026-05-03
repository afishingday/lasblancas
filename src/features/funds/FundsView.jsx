import { useState, useEffect, useRef } from 'react'
import {
  PlusCircle,
  TrendingUp,
  Sparkles,
  Loader2,
  Newspaper,
  Edit3,
  Trash2,
  Calendar,
  CheckCircle2,
  Info,
} from 'lucide-react'
import {
  isAdminLike,
  formatCurrency,
  fundAmountFromDb,
  copDigitsFromInput,
  parseCopIntegerFromDigits,
  COP_AMOUNT_INPUT_HINT,
  FUND_STATUS,
  FUND_STATUS_OPTIONS,
  mapLegacyFundStatus,
  requestPolishedText,
} from '../../shared/utils.js'
import {
  fetchGeminiProjectDescriptionFromTitle,
  isGeminiConfigured,
  getLastGeminiDetail,
} from '../../geminiClient.js'
import { trackPortalEvent } from '../../analytics.js'
import { uploadEntityCoverImage, MAX_ENTITY_IMAGE_BYTES } from '../../firestore/uploadEntityImage.js'
import { isNewsFallbackImageUrl, MAX_IMAGE_SOURCE_BYTES } from '../../firestore/uploadNewsImage.js'
import { ImageCropDialog } from '../../shared/ImageCropDialog.jsx'
import { sumFundsRaisedTotal } from '../../fundHistoricRaised.js'

function getFundProgressToneClasses(progressPercent) {
  const p = Math.min(100, Math.max(0, Number(progressPercent) || 0))
  if (p >= 90) {
    return {
      ringClass: 'text-emerald-500',
      labelClass: 'text-emerald-700',
      barClass: 'bg-emerald-500',
      raisedClass: 'text-emerald-600',
    }
  }
  if (p >= 70) {
    return {
      ringClass: 'text-blue-500',
      labelClass: 'text-blue-800',
      barClass: 'bg-blue-500',
      raisedClass: 'text-blue-800',
    }
  }
  if (p >= 40) {
    return {
      ringClass: 'text-orange-500',
      labelClass: 'text-orange-800',
      barClass: 'bg-orange-500',
      raisedClass: 'text-orange-800',
    }
  }
  return {
    ringClass: 'text-red-500',
    labelClass: 'text-red-700',
    barClass: 'bg-red-500',
    raisedClass: 'text-red-700',
  }
}

const CircularProgress = ({ percentage, colorClass, textClass, labelPercent }) => {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const label = Math.round(labelPercent != null ? labelPercent : percentage)
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-24 h-24 transform -rotate-90">
        <circle
          className="text-gray-100"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
        <circle
          className={colorClass}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
      </svg>
      <span className={`absolute text-xl font-bold ${textClass}`}>{label}%</span>
    </div>
  )
}

const FundCircularWithCelebration = ({ fundId, percentage, colorClass, textClass }) => {
  const raw = Number(percentage) || 0
  const strokePct = Math.min(100, Math.max(0, raw))
  const isComplete = raw >= 100
  const [burst, setBurst] = useState(false)
  useEffect(() => {
    if (!isComplete) return
    setBurst(true)
    const t = window.setTimeout(() => setBurst(false), 3200)
    return () => window.clearTimeout(t)
  }, [isComplete, fundId])
  return (
    <div className="relative flex items-center justify-center shrink-0">
      <CircularProgress
        percentage={strokePct}
        labelPercent={raw}
        colorClass={colorClass}
        textClass={textClass}
      />
      {burst && (
        <div
          className="absolute inset-[-6px] z-20 flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/95 to-emerald-700/95 text-white shadow-lg ring-4 ring-emerald-200/80 pointer-events-none animate-in zoom-in-95 fade-in duration-300"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-md shrink-0" />
          <span className="mt-1.5 px-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-center leading-tight">
            ¡Meta lograda!
          </span>
        </div>
      )}
    </div>
  )
}

const AdminFundAmountForm = ({ fund, onApply, showAlert }) => {
  const hasBudget = fund.requiresBudget !== false
  const [raised, setRaised] = useState(() => copDigitsFromInput(String(fundAmountFromDb(fund.raised))))
  const [goal, setGoal] = useState(() => copDigitsFromInput(String(fundAmountFromDb(fund.goal))))

  const handleSubmit = (e) => {
    e.preventDefault()
    const raisedNum = parseCopIntegerFromDigits(raised)
    const goalNum = parseCopIntegerFromDigits(goal)
    if (raisedNum < 0) return showAlert('El monto recaudado no es válido.')
    if (goalNum < 0) return showAlert('El valor total no es válido.')
    if (hasBudget && goalNum <= 0)
      return showAlert('La meta de recaudo debe ser mayor a cero (solo números, sin puntos ni comas).')
    void Promise.resolve(onApply(fund.id, { raised: raisedNum, goal: goalNum }))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 p-4 md:p-5 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 to-white space-y-4"
    >
      <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">
        {hasBudget ? 'Actualizar recaudo y meta' : 'Actualizar recaudo y valor total'}
      </p>
      <p className="text-xs text-stone-800 leading-relaxed border-l-4 border-blue-400 pl-3 py-0.5 bg-white/80 rounded-r-lg">
        {COP_AMOUNT_INPUT_HINT}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="min-w-0">
          <label className="block text-xs font-bold text-stone-800 mb-1.5">Recaudado (COP)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={raised}
            onChange={(e) => setRaised(copDigitsFromInput(e.target.value))}
            placeholder="0"
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-base font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white font-mono tracking-tight"
          />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-bold text-stone-800 mb-1.5">
            {hasBudget ? 'Meta de recaudo (COP)' : 'Valor total del proyecto (COP)'}
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={goal}
            onChange={(e) => setGoal(copDigitsFromInput(e.target.value))}
            placeholder={hasBudget ? 'Ej: 5000000' : '0'}
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-base font-bold tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white font-mono tracking-tight"
          />
        </div>
      </div>
      {!hasBudget && (
        <p className="text-xs text-stone-700">
          En proyectos sin meta de recaudo puedes registrar igualmente el valor total de referencia y lo recaudado (por
          ejemplo aportes voluntarios).
        </p>
      )}
      <button
        type="submit"
        className="w-full sm:w-auto bg-blue-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
      >
        Guardar montos
      </button>
    </form>
  )
}

const FundsView = ({
  currentUser,
  db,
  updateFundStatus,
  updateFundRaisedGoal,
  addFund,
  deleteFund,
  logAction,
  showAlert,
  showConfirm,
  openNewsComposerFromFund,
}) => {
  const canManageFunds = isAdminLike(currentUser)
  const isBackfillingFundDatesRef = useRef(false)
  const fundEditFormRef = useRef(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingFundId, setEditingFundId] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [copyAiBusy, setCopyAiBusy] = useState(false)
  const [isSubmittingFund, setIsSubmittingFund] = useState(false)
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [activeCoverCropFile, setActiveCoverCropFile] = useState(null)
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    requiresBudget: true,
    goal: '',
    expectedQuotaPerLot: '',
  })

  useEffect(() => {
    if (!canManageFunds || isBackfillingFundDatesRef.current) return
    const fundsWithoutDate = (db.funds || []).filter((fund) => !String(fund?.date || '').trim())
    if (fundsWithoutDate.length === 0) return

    isBackfillingFundDatesRef.current = true
    Promise.all(
      fundsWithoutDate.map((fund) =>
        addFund({
          ...fund,
          date: Number.isFinite(Number(fund?.createdAt))
            ? new Date(Number(fund.createdAt)).toLocaleDateString('es-CO')
            : new Date().toLocaleDateString('es-CO'),
        }),
      ),
    )
      .catch((err) => {
        console.error('No se pudo completar el backfill de fechas en proyectos:', err)
      })
      .finally(() => {
        isBackfillingFundDatesRef.current = false
      })
  }, [canManageFunds, db.funds, addFund])

  useEffect(() => {
    if (!showCreateForm || !canManageFunds || editingFundId == null) return
    const t = window.setTimeout(() => {
      fundEditFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [showCreateForm, editingFundId, canManageFunds])

  const handleStatusChange = (fund, val) => {
    const prevStatus = fund.status
    if (prevStatus === val) return
    const isMeta = val === FUND_STATUS.META_ALCANZADA
    updateFundStatus(fund.id, val)
      .then(() => {
        logAction('MODIFICAR_PROYECTO', `Cambió estado a: ${val}`)
        if (canManageFunds) {
          showConfirm(
            isMeta
              ? '¿Crear una noticia para celebrar que se reunió la meta? Se abrirá el borrador y la IA propondrá un mensaje para la comunidad (agradecimiento, compromiso de los lotes, que ya están listos para comenzar la siguiente fase). Podrás editarlo todo antes de publicar.'
              : '¿Abrir noticias con un borrador a partir de este proyecto para contar la novedad? Podrás editar todo antes de publicar.',
            () =>
              openNewsComposerFromFund(
                { ...fund, status: val },
                isMeta ? { aiMilestone: true } : {},
              ),
          )
        }
      })
      .catch((err) => {
        console.error(err)
        showAlert('No se pudo actualizar el estado del proyecto.')
      })
  }

  const handleApplyAmounts = (id, { raised, goal }) => {
    const f = (db.funds || []).find((x) => x.id === id)
    return updateFundRaisedGoal(id, raised, goal)
      .then(() => {
        logAction(
          'ACTUALIZAR_FONDOS',
          `${f?.name || id}: recaudo ${formatCurrency(raised)}, meta ${formatCurrency(goal)}`,
        )
        const requiresBudget = f?.requiresBudget !== false
        const stNorm = mapLegacyFundStatus(f?.status)
        const shouldAutoMeta =
          requiresBudget &&
          goal > 0 &&
          raised >= goal &&
          (stNorm === FUND_STATUS.RECOLECCION || stNorm === FUND_STATUS.PENDIENTE)
        const shouldRevertMeta =
          requiresBudget && goal > 0 && raised < goal && stNorm === FUND_STATUS.META_ALCANZADA
        if (shouldAutoMeta) {
          return updateFundStatus(id, FUND_STATUS.META_ALCANZADA).then(() => {
            if (!canManageFunds) {
              showAlert('Montos guardados correctamente.')
              return
            }
            const fundSnapshot = {
              ...f,
              raised,
              goal,
              status: FUND_STATUS.META_ALCANZADA,
            }
            showConfirm(
              'Se marcó «Meta alcanzada» porque el recaudo llegó al 100%. ¿Crear una noticia para la comunidad? La IA redactará un mensaje festivo con variaciones de agradecimiento y de que ya están listos para la siguiente fase (podrás editarlo).',
              () => openNewsComposerFromFund(fundSnapshot, { aiMilestone: true }),
            )
          })
        }
        if (shouldRevertMeta) {
          return updateFundStatus(id, FUND_STATUS.RECOLECCION).then(() => {
            showAlert(
              'El recaudo quedó por debajo de la meta (por un ajuste de montos o porque la meta subió). El proyecto volvió automáticamente a «En recolección de fondos».',
            )
          })
        }
        showAlert('Montos guardados correctamente.')
      })
      .catch((err) => {
        console.error(err)
        showAlert('No se pudo guardar montos.')
      })
  }

  const triggerAIAssistantDesc = async () => {
    if (!newProject.name.trim()) return showAlert('Escribe el nombre del proyecto primero.')
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setIsAnalyzing(true)
    const aiResponse = await fetchGeminiProjectDescriptionFromTitle(newProject.name)
    if (aiResponse?.description) {
      setNewProject((p) => ({ ...p, description: aiResponse.description }))
    } else {
      const d = getLastGeminiDetail()
      showAlert(d ? `La IA no respondió: ${d}` : 'No se pudo conectar con la IA. Ingresa la descripción manualmente.')
    }
    setIsAnalyzing(false)
  }

  const triggerProjectCopyAssistant = async () => {
    if (!newProject.name.trim() && !newProject.description.trim()) {
      showAlert('Escribe nombre o descripción para usar sugerencias de IA.')
      return
    }
    if (!isGeminiConfigured())
      return showAlert('Configura VITE_GEMINI_API_KEY en el archivo .env para usar la IA.')
    setCopyAiBusy(true)
    try {
      const polishedName = await requestPolishedText('fund_name', newProject.name)
      let polishedDesc = await requestPolishedText('fund_description', newProject.description)
      if (!polishedDesc && (polishedName || newProject.name.trim())) {
        const aiResponse = await fetchGeminiProjectDescriptionFromTitle(polishedName || newProject.name)
        polishedDesc = aiResponse?.description?.trim() || ''
      }
      setNewProject((prev) => ({
        ...prev,
        name: polishedName || prev.name,
        description: polishedDesc || prev.description,
      }))
      showAlert('Sugerencias de redacción aplicadas en el proyecto.')
    } finally {
      setCopyAiBusy(false)
    }
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (newProject.requiresBudget) {
      const g = parseCopIntegerFromDigits(newProject.goal)
      if (g <= 0) return showAlert('Ingresa la meta solo con números, sin puntos ni comas (ej.: 5000000).')
    }
    if (coverImageFile && coverImageFile.size > MAX_ENTITY_IMAGE_BYTES)
      return showAlert(
        `La imagen de portada no puede superar ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`,
      )

    const editingExisting = editingFundId != null
    const id = editingExisting ? editingFundId : `fp-${crypto.randomUUID()}`
    const prev = editingExisting ? (db.funds || []).find((f) => f.id === editingFundId) : null
    setIsSubmittingFund(true)
    try {
      let imageUrl = null
      if (prev?.image && !isNewsFallbackImageUrl(prev.image)) imageUrl = prev.image
      if (coverImageFile) {
        imageUrl = await uploadEntityCoverImage(coverImageFile, 'funds', id)
      }

      const expectedQuotaPerLotCOP = parseCopIntegerFromDigits(newProject.expectedQuotaPerLot)
      const publicationDate = (editingExisting && prev?.date ? String(prev.date).trim() : '') || new Date().toLocaleDateString('es-CO')

      const finalProject = editingExisting && prev
        ? (() => {
            const { historicRaisedBaseline: _removed, ...prevRest } = prev
            return {
              ...prevRest,
              id,
              name: newProject.name,
              description: newProject.description,
              requiresBudget: newProject.requiresBudget,
              goal: newProject.requiresBudget ? parseCopIntegerFromDigits(newProject.goal) : 0,
              raised: fundAmountFromDb(prev.raised),
              status: mapLegacyFundStatus(prev.status),
              expectedQuotaPerLotCOP,
              createdAt: prev.createdAt ?? Date.now(),
              date: publicationDate,
              image: imageUrl,
            }
          })()
        : {
            id,
            name: newProject.name,
            description: newProject.description,
            requiresBudget: newProject.requiresBudget,
            goal: newProject.requiresBudget ? parseCopIntegerFromDigits(newProject.goal) : 0,
            raised: 0,
            status: FUND_STATUS.RECOLECCION,
            expectedQuotaPerLotCOP,
            createdAt: Date.now(),
            date: publicationDate,
            image: imageUrl,
          }

      await addFund(finalProject)
      void trackPortalEvent('fund_publish', { mode: editingExisting ? 'edit' : 'new' })
      logAction(editingExisting ? 'EDITAR_PROYECTO' : 'CREAR_PROYECTO', `${editingExisting ? 'Editó' : 'Creó'} proyecto: ${finalProject.name}`)
      setShowCreateForm(false)
      setEditingFundId(null)
      setCoverImageFile(null)
      setNewProject({
        name: '',
        description: '',
        requiresBudget: true,
        goal: '',
        expectedQuotaPerLot: '',
      })
      showAlert(editingExisting ? 'Proyecto actualizado correctamente.' : '¡El nuevo proyecto ha sido creado exitosamente!')
    } catch (err) {
      console.error(err)
      if (err instanceof Error && err.message === 'ENTITY_IMAGE_TOO_LARGE') {
        showAlert(`La imagen supera ${Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB.`)
      } else showAlert('No se pudo crear el proyecto.')
    } finally {
      setIsSubmittingFund(false)
    }
  }

  const startEditFund = (fund) => {
    setEditingFundId(fund.id)
    setShowCreateForm(true)
    setCoverImageFile(null)
    setActiveCoverCropFile(null)
    setNewProject({
      name: fund.name || '',
      description: fund.description || '',
      requiresBudget: fund.requiresBudget !== false,
      goal: fund.requiresBudget !== false ? copDigitsFromInput(String(fundAmountFromDb(fund.goal))) : '',
      expectedQuotaPerLot: copDigitsFromInput(String(fundAmountFromDb(fund.expectedQuotaPerLotCOP))),
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

  const handleDeleteFund = (fund) => {
    showConfirm(`¿Eliminar el proyecto "${fund.name}"? Esta acción no se puede deshacer.`, async () => {
      try {
        await deleteFund(fund.id)
        logAction('ELIMINAR_PROYECTO', `Eliminó proyecto ${fund.id}`)
        showAlert('Proyecto eliminado correctamente.')
      } catch (err) {
        console.error(err)
        showAlert('No se pudo eliminar el proyecto.')
      }
    })
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ImageCropDialog
        open={activeCoverCropFile !== null}
        file={activeCoverCropFile}
        title="Recortar portada del proyecto"
        onConfirm={handleCoverCropConfirm}
        onCancel={handleCoverCropCancel}
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-stone-800">Proyectos y Fondos</h2>
          <p className="text-stone-600 mt-1">Costo, recaudo y estado de los proyectos actuales.</p>
          <p className="text-sm font-bold text-blue-800 mt-2">
            Recaudo total registrado en proyectos: {formatCurrency(sumFundsRaisedTotal(db.funds || []))}
          </p>
        </div>
        {canManageFunds && (
          <button
            type="button"
            onClick={() => {
              if (showCreateForm) {
                setShowCreateForm(false)
                setEditingFundId(null)
                setCoverImageFile(null)
                setActiveCoverCropFile(null)
                setNewProject({
                  name: '',
                  description: '',
                  requiresBudget: true,
                  goal: '',
                  expectedQuotaPerLot: '',
                })
              } else {
                setShowCreateForm(true)
              }
            }}
            className="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold flex items-center shadow-sm hover:bg-blue-700 transition-colors"
          >
            {showCreateForm ? (
              'Cancelar'
            ) : (
              <>
                <PlusCircle className="w-4 h-4 mr-2" /> {editingFundId != null ? 'Editar Proyecto' : 'Crear Proyecto'}
              </>
            )}
          </button>
        )}
      </div>

      {showCreateForm && canManageFunds && (
        <div
          ref={fundEditFormRef}
          className="bg-white p-6 md:p-8 rounded-3xl border border-blue-100 shadow-sm animate-in slide-in-from-top-4 scroll-mt-24"
        >
          <h3 className="text-xl font-black flex items-center mb-6 text-blue-900">
            <TrendingUp className="w-5 h-5 text-blue-500 mr-2" /> {editingFundId != null ? 'Editar Proyecto o Fondo' : 'Nuevo Proyecto o Fondo'}
          </h3>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <button
              type="button"
              onClick={() => void triggerProjectCopyAssistant()}
              disabled={copyAiBusy || isAnalyzing}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {copyAiBusy ? 'Procesando…' : 'Sugerir redacción (IA)'}
            </button>
            <button
              type="button"
              onClick={() => void triggerAIAssistantDesc()}
              disabled={isAnalyzing || copyAiBusy}
              className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {isAnalyzing ? 'Analizando…' : 'Crear descripción desde título'}
            </button>
            <p className="text-xs text-stone-700">La IA se usa solo para copy; montos y estados quedan manuales.</p>
          </div>
          <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">Nombre del proyecto *</label>
                <input
                  required
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500"
                  placeholder="Ej: Poda de zonas verdes"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-bold text-stone-800">Descripción *</label>
                <textarea
                  required
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full border border-stone-200 p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-500 h-24"
                  placeholder="Describe el alcance del proyecto..."
                />
              </div>
              <div className="md:col-span-2 border border-stone-200 rounded-xl p-4 bg-stone-50/90">
                <label className="block text-sm font-bold text-stone-800 mb-2">
                  Imagen de portada (opcional, 1 foto; tras elegirla podrás recortarla como en Información de Interés; máx.{' '}
                  {Math.round(MAX_IMAGE_SOURCE_BYTES / (1024 * 1024))} MB de origen, hasta{' '}
                  {Math.round(MAX_ENTITY_IMAGE_BYTES / 1024)} KB al publicar)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="w-full text-sm font-medium text-stone-800 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:font-bold"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) handleCoverPicked(f)
                  }}
                />
                {coverImageFile && (
                  <p className="text-xs text-stone-700 mt-2">
                    {coverImageFile.name} — si no eliges archivo, el listado no mostrará imagen de portada.
                  </p>
                )}
              </div>
              <div className="md:col-span-2 bg-stone-50 p-4 rounded-xl border border-stone-100 flex flex-col gap-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newProject.requiresBudget}
                    onChange={(e) => setNewProject({ ...newProject, requiresBudget: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 mr-3"
                  />
                  <span className="font-bold text-stone-800">Este proyecto tiene una meta de recaudo económico</span>
                </label>
                {newProject.requiresBudget && (
                  <div className="pl-8 space-y-2">
                    <label className="block text-sm font-bold text-stone-700">Meta de recaudo (COP) *</label>
                    <p className="text-xs text-stone-700 leading-relaxed max-w-xl">{COP_AMOUNT_INPUT_HINT}</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      value={newProject.goal}
                      onChange={(e) =>
                        setNewProject({ ...newProject, goal: copDigitsFromInput(e.target.value) })
                      }
                      className="w-full md:max-w-md border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                      placeholder="2000000"
                    />
                  </div>
                )}
                <div className="pl-0 md:pl-0 pt-2 border-t border-stone-200/80 mt-2 space-y-2">
                  <label className="block text-sm font-bold text-stone-800">
                    Cuota o aporte esperado por lote (COP) — opcional
                  </label>
                  <p className="text-xs text-stone-700 leading-relaxed max-w-2xl">
                    Usualmente: valor del proyecto ÷ promedio de lotes que aportan al mes. Cifra de referencia para
                    consulta; vacío o 0 = no se muestra en la tarjeta.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={newProject.expectedQuotaPerLot}
                    onChange={(e) =>
                      setNewProject({ ...newProject, expectedQuotaPerLot: copDigitsFromInput(e.target.value) })
                    }
                    className="w-full md:max-w-md border border-stone-200 p-3 rounded-xl outline-none focus:border-emerald-500 font-mono font-bold tabular-nums"
                    placeholder="Ej. 50000"
                  />
                </div>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmittingFund}
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmittingFund ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Creando…
                  </>
                ) : editingFundId != null ? (
                  'Guardar cambios del proyecto'
                ) : (
                  'Crear proyecto'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {(db.funds || []).length === 0 && !showCreateForm && (
        <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 px-6 py-12 text-center">
          <TrendingUp className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <p className="text-stone-800 font-bold text-lg mb-1">No hay proyectos ni fondos registrados</p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            Los proyectos de recaudo y obras aparecerán aquí. Si puedes gestionarlos, usa &quot;Crear Proyecto&quot;.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {(db.funds || []).map((fund) => {
          const requiresBudget = fund.requiresBudget !== false
          const goalNum = fundAmountFromDb(fund.goal)
          const raisedNum = fundAmountFromDb(fund.raised)
          const pct = goalNum > 0 ? (raisedNum / goalNum) * 100 : 0
          const fundProgressTone = getFundProgressToneClasses(Math.min(100, pct))
          const fundCover =
            fund.image && !isNewsFallbackImageUrl(fund.image) ? fund.image : null
          const goalLooksLikeDecimalBug =
            requiresBudget &&
            goalNum > 0 &&
            goalNum < 1000 &&
            typeof fund.goal === 'number' &&
            !Number.isInteger(fund.goal)
          const quotaPerLotNum = fundAmountFromDb(fund.expectedQuotaPerLotCOP)
          const publicationDateLabel =
            typeof fund?.date === 'string' && fund.date.trim()
              ? fund.date
              : Number.isFinite(Number(fund?.createdAt))
                ? new Date(Number(fund.createdAt)).toLocaleDateString('es-CO', { dateStyle: 'long' })
                : ''
          return (
            <div
              key={fund.id}
              className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-emerald-100/40 border border-emerald-100/30 rounded-3xl p-5 sm:p-7 md:p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-6 items-stretch"
            >
              {fundCover ? (
                <div className="w-full shrink-0">
                  <div className="rounded-2xl border border-emerald-100/60 bg-gradient-to-b from-emerald-50/70 via-amber-50/25 to-sky-50/40 flex items-center justify-center aspect-[4/3] sm:aspect-[16/10] p-3 sm:p-5">
                    <img
                      src={fundCover}
                      alt=""
                      className="max-h-full max-w-full w-full h-full rounded-lg shadow-sm object-contain"
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex-1 w-full min-w-0 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <h3 className="text-xl sm:text-2xl font-bold text-stone-800 leading-snug">{fund.name}</h3>
                    {publicationDateLabel && (
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-stone-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Publicado: {publicationDateLabel}
                      </p>
                    )}
                  </div>
                  {canManageFunds ? (
                    <select
                      value={mapLegacyFundStatus(fund.status)}
                      onChange={(e) => handleStatusChange(fund, e.target.value)}
                      className="bg-white/70 backdrop-blur border border-emerald-100/50 text-sm font-bold text-stone-800 px-3 py-2 rounded-lg outline-none focus:border-emerald-500 shrink-0 max-w-full sm:max-w-[14rem]"
                    >
                      {FUND_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="inline-block px-4 py-1.5 rounded-lg text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 shrink-0 w-fit">
                      {mapLegacyFundStatus(fund.status)}
                    </span>
                  )}
                </div>
                <p className="text-stone-700 text-sm whitespace-pre-wrap leading-relaxed">{fund.description}</p>
                {quotaPerLotNum > 0 && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/90 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-800 mb-1">
                      Aporte de referencia por lote
                    </p>
                    <p className="text-lg font-black text-blue-950 tabular-nums">{formatCurrency(quotaPerLotNum)}</p>
                    <p className="text-xs text-blue-900/80 mt-1">
                      Cuota de referencia: costo del proyecto ÷ promedio de lotes con aporte mensual.
                    </p>
                  </div>
                )}
                {canManageFunds && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEditFund(fund)}
                      className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
                    >
                      <Edit3 className="w-4 h-4 mr-1.5" /> Editar proyecto
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openNewsComposerFromFund(
                          fund,
                          mapLegacyFundStatus(fund.status) === FUND_STATUS.META_ALCANZADA
                            ? { aiMilestone: true }
                            : {},
                        )
                      }
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100"
                    >
                      <Newspaper className="w-4 h-4 mr-1.5" /> Noticia desde proyecto
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFund(fund)}
                      className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar proyecto
                    </button>
                  </div>
                )}

                {!requiresBudget && (
                  <div className="bg-amber-50/80 px-4 py-2.5 rounded-xl border border-amber-100 text-xs font-bold text-amber-900 flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0" />
                    Este proyecto está marcado sin meta de recaudo; igual puedes ver y editar valores de referencia.
                  </div>
                )}

                {goalLooksLikeDecimalBug && canManageFunds && (
                  <div className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    El valor de la meta parece demasiado bajo (quizá se guardó con punto como decimal). Vuelve a
                    escribir la meta completa solo con números, sin puntos ni comas, y guarda.
                  </div>
                )}

                <div className="rounded-2xl border border-emerald-100/30 bg-white/60 ring-1 ring-emerald-100/25 p-4 md:p-6">
                  <div className="grid grid-cols-1 2xl:grid-cols-12 gap-4 2xl:gap-5 items-stretch">
                    <div className="2xl:col-span-4 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-xl border border-emerald-100/30 shadow-sm p-4 flex flex-col justify-center">
                      {requiresBudget && goalNum > 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4">
                          <div className="relative flex h-[145px] w-[145px] items-center justify-center rounded-full border border-stone-200 bg-white ring-1 ring-emerald-100/60">
                            <FundCircularWithCelebration
                              fundId={fund.id}
                              percentage={pct}
                              colorClass={fundProgressTone.ringClass}
                              textClass={fundProgressTone.labelClass}
                            />
                          </div>
                          <div className="w-full bg-stone-200 rounded-full h-3 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${fundProgressTone.barClass}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="min-h-[170px] flex items-center justify-center">
                          <p className="text-sm font-bold text-stone-600 text-center">Sin meta de recaudo definida</p>
                        </div>
                      )}
                    </div>

                    <div className="2xl:col-span-8 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                        <div className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-xl p-4 md:p-5 border border-emerald-100/30 shadow-sm min-w-0 flex flex-col justify-center">
                          <p className="text-xs font-bold text-stone-600 uppercase mb-2 tracking-wide">Recaudado</p>
                          <p
                            className={`text-lg sm:text-xl lg:text-2xl font-black tabular-nums tracking-tight whitespace-nowrap leading-none ${requiresBudget && goalNum > 0 ? fundProgressTone.raisedClass : 'text-stone-900'}`}
                          >
                            {formatCurrency(raisedNum)}
                          </p>
                        </div>

                        <div className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 rounded-xl p-4 md:p-5 border border-emerald-100/30 shadow-sm min-w-0 flex flex-col justify-center">
                          <p className="text-xs font-bold text-stone-600 uppercase mb-2 tracking-wide">
                            {requiresBudget ? 'Meta de recaudo' : 'Valor total del proyecto'}
                          </p>
                          <p className="text-lg sm:text-xl lg:text-2xl font-black text-stone-900 tabular-nums tracking-tight whitespace-nowrap leading-none">
                            {formatCurrency(goalNum)}
                          </p>
                        </div>
                      </div>

                      {canManageFunds && (
                        <AdminFundAmountForm
                          key={`${fund.id}-${fund.raised}-${fund.goal}`}
                          fund={fund}
                          onApply={handleApplyAmounts}
                          showAlert={showAlert}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FundsView
