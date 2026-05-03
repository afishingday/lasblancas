import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  PlusCircle,
  Search,
  ListFilter,
  ArrowDownAZ,
  Edit,
  Trash2,
  Phone,
  Users,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { isAdminLike } from '../../shared/utils.js'
import { polishSpanishField, isGeminiConfigured } from '../../geminiClient.js'

const DirectoriesView = ({
  currentUser,
  db,
  upsertDirectoryRow,
  deleteDirectoryRow,
  logAction,
  type,
  showAlert,
  showConfirm,
}) => {
  const BASE_SERVICE_CATEGORIES = useMemo(
    () => [
      'Salud',
      'Seguridad',
      'Mantenimiento',
      'Domicilios',
      'Entes Municipales',
      'Servicios públicos',
      'Legal',
    ],
    [],
  )
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [professionKeyword, setProfessionKeyword] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [categoryAiBusy, setCategoryAiBusy] = useState(false)
  const [customServiceCategories, setCustomServiceCategories] = useState([])

  const isServices = type === 'services'
  const title = isServices ? 'Directorio de Servicios' : 'Comunidad y Vecinos'
  const table = isServices ? db.services || [] : db.community || []
  const defaultForm = isServices
    ? { name: '', phone: '', category: '', desc: '' }
    : { name: '', phone: '', profession: '', contactPref: 'Servicios' }
  const [form, setForm] = useState(defaultForm)

  const tableKey = isServices ? 'services' : 'community'

  useEffect(() => {
    setSearch('')
    setSortBy('name')
    setCategoryFilter('')
    setProfessionKeyword('')
    setCategoryDraft('')
    setCategoryAiBusy(false)
    setCustomServiceCategories([])
  }, [type])

  const categoriesInData = useMemo(() => {
    const set = new Set()
    table.forEach((i) => {
      const c = (i.category || '').trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [table])
  const serviceCategories = useMemo(() => {
    const ordered = []
    const seen = new Set()
    const source = [...BASE_SERVICE_CATEGORIES, ...categoriesInData, ...customServiceCategories]
    source.forEach((cat) => {
      const c = String(cat || '').trim()
      if (!c) return
      const key = c.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      ordered.push(c)
    })
    return ordered
  }, [BASE_SERVICE_CATEGORIES, categoriesInData, customServiceCategories])

  const normalizeCategoryForMatch = useCallback((value) => {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.replace(/(es|s)$/i, ''))
      .join(' ')
      .trim()
  }, [])

  const toCategoryLabel = useCallback((value) => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }, [])

  const findSimilarCategory = useCallback(
    (candidate) => {
      const normCandidate = normalizeCategoryForMatch(candidate)
      if (!normCandidate) return ''
      return (
        serviceCategories.find((cat) => {
          const normCat = normalizeCategoryForMatch(cat)
          if (!normCat) return false
          if (normCat === normCandidate) return true
          if (normCat.length >= 6 && normCandidate.length >= 6) {
            return normCat.includes(normCandidate) || normCandidate.includes(normCat)
          }
          return false
        }) || ''
      )
    },
    [normalizeCategoryForMatch, serviceCategories],
  )

  const handleAddCategoryWithAi = async () => {
    const raw = String(categoryDraft || '').trim()
    if (!raw) {
      showAlert('Escribe el nombre de la categoría que deseas agregar.')
      return
    }
    if (!isGeminiConfigured()) {
      showAlert('Configura VITE_GEMINI_API_KEY en .env para corregir categorías con IA.')
      return
    }
    setCategoryAiBusy(true)
    try {
      const polished = await polishSpanishField('directory_category', raw)
      const candidate = toCategoryLabel(polished || raw)
      if (!candidate) {
        showAlert('No se pudo interpretar la categoría. Intenta con otra redacción.')
        return
      }
      const similar = findSimilarCategory(candidate)
      if (similar) {
        setForm((prev) => ({ ...prev, category: similar }))
        showAlert(`Esta categoría ya existe o es muy similar a "${similar}". Se seleccionó automáticamente.`)
        return
      }
      setCustomServiceCategories((prev) => [...prev, candidate])
      setForm((prev) => ({ ...prev, category: candidate }))
      setCategoryDraft('')
      showAlert(`Categoría añadida: ${candidate}`)
    } catch (err) {
      console.error(err)
      showAlert('No se pudo procesar la categoría con IA. Intenta nuevamente.')
    } finally {
      setCategoryAiBusy(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editId) {
      const merged = table.map((i) => (i.id === editId ? { ...i, ...form } : i)).find((i) => i.id === editId)
      if (merged)
        upsertDirectoryRow(tableKey, merged).catch((err) => {
          console.error(err)
          showAlert('No se pudo actualizar el registro.')
        })
      logAction(isServices ? 'EDITAR_SERVICIO' : 'EDITAR_COMUNIDAD', `Editó: ${form.name}`)
      showAlert('¡Registro actualizado exitosamente!')
    } else {
      const newRowId = crypto.randomUUID()
      upsertDirectoryRow(tableKey, {
        id: newRowId,
        addedBy: currentUser.lotNumber,
        lot: currentUser.lotNumber,
        ...form,
      }).catch((err) => {
        console.error(err)
        showAlert('No se pudo añadir el registro.')
      })
      logAction(isServices ? 'CREAR_SERVICIO' : 'CREAR_COMUNIDAD', `Creó: ${form.name}`)
      showAlert('¡Nuevo registro añadido al directorio!')
    }
    setShowForm(false)
    setEditId(null)
    setForm(defaultForm)
  }
  const startEdit = (item) => {
    setForm(item)
    setEditId(item.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const handleDelete = (id) => {
    showConfirm(
      '¿Estás seguro que deseas eliminar permanentemente este registro del directorio?',
      () => {
        deleteDirectoryRow(tableKey, id).catch((err) => {
          console.error(err)
          showAlert('No se pudo eliminar el registro.')
        })
        logAction(isServices ? 'ELIMINAR_SERVICIO' : 'ELIMINAR_COMUNIDAD', 'Eliminó registro')
        showAlert('El registro ha sido eliminado.')
      },
    )
  }

  const filteredSorted = useMemo(() => {
    const qRaw = search.toLowerCase().trim()
    const words = qRaw ? qRaw.split(/\s+/).filter(Boolean) : []
    const matchesSearch = (i) => {
      if (words.length === 0) return true
      const hay = [
        i.name,
        i.category,
        i.profession,
        i.lot,
        i.desc,
        i.contactPref,
        i.phone,
        i.addedBy,
      ]
        .map((f) => String(f || '').toLowerCase())
        .join(' ')
      return words.every((w) => hay.includes(w))
    }

    let rows = table.filter(matchesSearch)

    if (isServices && categoryFilter) {
      rows = rows.filter((i) => (i.category || '') === categoryFilter)
    }
    if (!isServices && professionKeyword.trim()) {
      const pk = professionKeyword.trim().toLowerCase()
      rows = rows.filter((i) =>
        [i.profession, i.lot, i.name].some((f) => String(f || '').toLowerCase().includes(pk)),
      )
    }

    const cmpLot = (a, b) =>
      String(a.lot || '').localeCompare(String(b.lot || ''), 'es', { numeric: true, sensitivity: 'base' })
    const cmpCat = (a, b) =>
      String(a.category || '').localeCompare(String(b.category || ''), 'es', { sensitivity: 'base' })
    const cmpProf = (a, b) =>
      String(a.profession || '').localeCompare(String(b.profession || ''), 'es', { sensitivity: 'base' })
    const cmpName = (a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' })

    const sorted = [...rows]
    if (sortBy === 'name') sorted.sort(cmpName)
    else if (sortBy === 'lot') {
      if (isServices) sorted.sort((a, b) => cmpCat(a, b) || cmpName(a, b))
      else sorted.sort((a, b) => cmpLot(a, b) || cmpName(a, b))
    } else {
      if (isServices) sorted.sort((a, b) => cmpCat(a, b) || cmpName(a, b))
      else sorted.sort((a, b) => cmpProf(a, b) || cmpName(a, b))
    }
    return sorted
  }, [table, search, isServices, categoryFilter, professionKeyword, sortBy])

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-stone-800">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm)
            if (showForm) {
              setEditId(null)
              setForm(defaultForm)
            }
          }}
          className="bg-stone-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-sm"
        >
          {showForm ? (
            'Cancelar'
          ) : (
            <>
              <PlusCircle className="w-4 h-4 mr-2" /> Añadir Registro
            </>
          )}
        </button>
      </div>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" />
        <input
          type="text"
          placeholder="Buscar por nombre o palabra clave..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 p-4 rounded-xl border border-stone-200 outline-none focus:border-emerald-700 bg-white"
        />
      </div>

      <div className="rounded-3xl border border-emerald-100/70 bg-gradient-to-br from-amber-50/40 via-white to-emerald-50/50 p-5 md:p-6 shadow-sm shadow-emerald-100/30 space-y-5">
        {isServices && (
          <>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-stone-600 flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-emerald-600" />
                Categoría
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter('')}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                  !categoryFilter
                    ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                    : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                }`}
              >
                Todas
              </button>
              {serviceCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                    categoryFilter === cat
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-white text-stone-800 border-stone-200 hover:border-emerald-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </>
        )}

        <div className={isServices ? 'border-t border-stone-200/80 pt-4' : ''}>
          <span className="text-xs font-black uppercase tracking-widest text-stone-600 flex items-center gap-2 mb-3">
            <ArrowDownAZ className="w-4 h-4 text-emerald-600" />
            Ordenar
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                sortBy === 'name'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
              }`}
            >
              Por nombre
            </button>
            <button
              type="button"
              onClick={() => setSortBy('lot')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                sortBy === 'lot'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
              }`}
            >
              {isServices ? 'Por categoría' : 'Por lote'}
            </button>
            {!isServices && (
              <button
                type="button"
                onClick={() => setSortBy('label')}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold border ${
                  sortBy === 'label'
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                }`}
              >
                Por profesión
              </button>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-sm animate-in slide-in-from-top-4">
          <h3 className="font-bold text-xl mb-6">{editId ? 'Modificar Registro' : 'Nuevo Registro'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-bold mb-1.5 text-stone-800">Nombre *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5 text-stone-800">Teléfono *</label>
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
              />
            </div>
            {isServices ? (
              <>
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-stone-800">Categoría *</label>
                  <select
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
                  >
                    <option value="">Selecciona...</option>
                    {serviceCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-800 mb-2">
                      Agregar categoría con IA
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={categoryDraft}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        placeholder="Ej.: planeacion municipal"
                        className="flex-1 border border-amber-200 p-2.5 rounded-lg bg-white outline-none focus:border-amber-400 text-sm"
                      />
                      <button
                        type="button"
                        disabled={categoryAiBusy}
                        onClick={() => void handleAddCategoryWithAi()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                      >
                        {categoryAiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Añadir
                      </button>
                    </div>
                    <p className="text-[11px] text-stone-600 mt-1.5">
                      Se corrige ortografía y se evita crear categorías repetidas o similares.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-stone-800">Descripción breve</label>
                  <input
                    value={form.desc}
                    onChange={(e) => setForm({ ...form, desc: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
                  />
                </div>
              </>
            ) : (
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-bold mb-1.5 text-stone-800">Profesión u Oficio *</label>
                  <input
                    required
                    value={form.profession}
                    onChange={(e) => setForm({ ...form, profession: e.target.value })}
                    className="w-full border p-3 rounded-xl bg-stone-50 outline-none focus:border-emerald-700"
                  />
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-stone-600 mb-2">
                    Preferencia de contacto
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, contactPref: 'Servicios' })}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${
                        (form.contactPref || 'Servicios') === 'Servicios'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Solo servicios
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, contactPref: 'Servicios y emergencias' })}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${
                        form.contactPref === 'Servicios y emergencias'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-stone-800 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Servicios y emergencias
                    </button>
                  </div>
                  <p className="text-xs text-stone-600 mt-2">
                    Esto solo informa a los vecinos cómo prefieres que te contacten.
                  </p>
                </div>
              </div>
            )}
            <div className="md:col-span-2 flex justify-end pt-2">
              <button type="submit" className="bg-stone-900 text-white px-8 py-3 rounded-xl font-bold">
                {editId ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSorted.map((item) => {
          const ownerId = isServices ? item.addedBy : item.lot
          const canEdit = isAdminLike(currentUser) || currentUser.lotNumber === ownerId
          return (
            <div
              key={item.id}
              className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm relative pt-10 mt-2 flex flex-col"
            >
              <span className="absolute -top-3 left-6 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg text-[10px] font-black uppercase border border-emerald-200">
                {isServices ? item.category : item.lot}
              </span>
              {canEdit && (
                <div className="absolute top-3 right-3 flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              <h4 className="text-xl font-bold text-stone-900 mb-1">{item.name}</h4>
              <p className="text-emerald-600 text-xs font-bold uppercase tracking-wider mb-5">
                {isServices ? item.desc : `${item.profession}${item.contactPref ? ` · ${item.contactPref}` : ''}`}
              </p>
              <div className="mt-auto">
                <a
                  href={`tel:${item.phone}`}
                  className="flex justify-center items-center w-full bg-stone-50 py-3 rounded-xl font-bold border border-stone-200 text-stone-800 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                >
                  <Phone className="w-4 h-4 mr-2" /> {item.phone}
                </a>
              </div>
            </div>
          )
        })}
      </div>

      {table.length === 0 && !showForm && (
        <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-12 text-center">
          {isServices ? (
            <Phone className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          ) : (
            <Users className="w-12 h-12 text-stone-500 mx-auto mb-4" />
          )}
          <p className="text-stone-800 font-bold text-lg mb-1">
            {isServices ? 'No hay servicios en el directorio' : 'No hay vecinos registrados en la comunidad'}
          </p>
          <p className="text-stone-600 text-sm max-w-md mx-auto">
            {isServices
              ? 'Añade contactos útiles (salud, mantenimiento, etc.) con el botón «Añadir registro».'
              : 'Comparte oficios y datos de contacto con «Añadir registro».'}
          </p>
        </div>
      )}
      {table.length > 0 && filteredSorted.length === 0 && (
        <p className="text-center text-stone-600 font-medium py-8">No hay resultados para tu búsqueda o filtros.</p>
      )}
    </div>
  )
}

export default DirectoriesView
