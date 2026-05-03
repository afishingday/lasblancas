import { useState, useMemo, useCallback } from 'react'
import { Download, ExternalLink, Fish, Eye } from 'lucide-react'

import pdfFlora from '../../assets/pdf/Flora Cañon del Rio Porce.pdf?url'
import pdfPeces from '../../assets/pdf/Peces Cañon del Rio Porce.pdf?url'
import pdfAnfibios from '../../assets/pdf/Anfibios y Reptiles Cañon del Rio Porce.pdf?url'
import pdfMamiferos from '../../assets/pdf/Mamiferos Cañon del Rio Porce.pdf?url'

import iconFlor from '../../assets/icons/Flor (1).png'
import iconRana from '../../assets/icons/Rana.png'
import iconMono from '../../assets/icons/Mono.png'
import iconGuacamaya from '../../assets/icons/Guacamaya.png'

import { TENANT } from '../../tenant.config.js'

const REACTIONS = [
  { emoji: '🌿', label: 'Increíble' },
  { emoji: '😍', label: 'Me encanta' },
  { emoji: '🤩', label: 'Asombroso' },
  { emoji: '👏', label: 'Excelente' },
]

const GUIAS = [
  {
    id: 'flora',
    title: 'Flora',
    subtitle: 'Guía ilustrada de plantas',
    description:
      'Árboles nativos, epífitas, lianas y plantas medicinales que cubren las laderas y riberas del Cañón del Río Porce.',
    pdfUrl: pdfFlora,
    filename: 'flora-canon-rio-porce.pdf',
    icon: iconFlor,
    FallbackIcon: null,
    headerGradient: 'from-emerald-500 to-green-600',
    borderColor: 'border-emerald-200/70',
    tagClass: 'bg-emerald-100 text-emerald-700',
    tagLabel: 'Botánica',
    btnGradient: 'from-emerald-500 to-green-600',
    activeReactionClass: 'bg-emerald-100 ring-emerald-300 text-emerald-900',
  },
  {
    id: 'peces',
    title: 'Peces',
    subtitle: 'Guía ilustrada de ictiofauna',
    description:
      'Especies nativas, migratorias y endémicas que habitan las aguas del Río Porce: uno de los sistemas fluviales más ricos de Antioquia.',
    pdfUrl: pdfPeces,
    filename: 'peces-canon-rio-porce.pdf',
    icon: null,
    FallbackIcon: Fish,
    headerGradient: 'from-blue-500 to-cyan-600',
    borderColor: 'border-blue-200/70',
    tagClass: 'bg-blue-100 text-blue-700',
    tagLabel: 'Ictiología',
    btnGradient: 'from-blue-500 to-cyan-600',
    activeReactionClass: 'bg-blue-100 ring-blue-300 text-blue-900',
  },
  {
    id: 'anfibios',
    title: 'Anfibios y Reptiles',
    subtitle: 'Guía ilustrada de herpetofauna',
    description:
      'Ranas, salamandras, serpientes y lagartos del cañón: una herpetofauna que refleja la riqueza ambiental del territorio.',
    pdfUrl: pdfAnfibios,
    filename: 'anfibios-reptiles-canon-rio-porce.pdf',
    icon: iconRana,
    FallbackIcon: null,
    headerGradient: 'from-amber-500 to-orange-500',
    borderColor: 'border-amber-200/70',
    tagClass: 'bg-amber-100 text-amber-700',
    tagLabel: 'Herpetología',
    btnGradient: 'from-amber-500 to-orange-500',
    activeReactionClass: 'bg-amber-100 ring-amber-300 text-amber-900',
  },
  {
    id: 'mamiferos',
    title: 'Mamíferos',
    subtitle: 'Guía ilustrada de mamíferos',
    description:
      'Desde pequeños roedores hasta primates y felinos silvestres: los mamíferos que comparten el bosque con nuestra comunidad.',
    pdfUrl: pdfMamiferos,
    filename: 'mamiferos-canon-rio-porce.pdf',
    icon: iconMono,
    FallbackIcon: null,
    headerGradient: 'from-violet-500 to-purple-600',
    borderColor: 'border-violet-200/70',
    tagClass: 'bg-violet-100 text-violet-700',
    tagLabel: 'Mastozoología',
    btnGradient: 'from-violet-500 to-purple-600',
    activeReactionClass: 'bg-violet-100 ring-violet-300 text-violet-900',
  },
]

function readStoredReactions(lotNumber) {
  try { return JSON.parse(localStorage.getItem(`lb_guide_reactions_${lotNumber}`) || '{}') }
  catch { return {} }
}

function writeStoredReactions(lotNumber, data) {
  try { localStorage.setItem(`lb_guide_reactions_${lotNumber}`, JSON.stringify(data)) }
  catch {}
}

async function downloadPdf(pdfUrl, filename) {
  try {
    const res = await fetch(pdfUrl)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    queueMicrotask(() => URL.revokeObjectURL(url))
  } catch {
    const a = document.createElement('a')
    a.href = pdfUrl
    a.download = filename
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

function StatChip({ icon: Icon, value, label }) {
  return (
    <span className="flex items-center gap-1 text-stone-400">
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span className="tabular-nums font-bold">{value}</span>
      <span className="font-medium">{label}</span>
    </span>
  )
}

function GuiaCard({ guia, stats, myReactions, onView, onDownload, onReaction }) {
  const { FallbackIcon } = guia
  const views = Math.max(0, stats.views || 0)
  const downloads = Math.max(0, stats.downloads || 0)

  return (
    <div className={`rounded-3xl border ${guia.borderColor} bg-white shadow-sm overflow-hidden flex flex-col`}>
      <div className={`bg-gradient-to-br ${guia.headerGradient} p-5 flex items-center gap-4`}>
        <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 border border-white/20">
          {guia.icon ? (
            <img src={guia.icon} alt="" className="w-10 h-10 object-contain drop-shadow-sm" />
          ) : FallbackIcon ? (
            <FallbackIcon className="w-9 h-9 text-white" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-black text-white leading-tight">{guia.title}</h3>
          <p className="text-white/75 text-xs font-medium mt-0.5">{guia.subtitle}</p>
          {(views > 0 || downloads > 0) && (
            <div className="flex items-center gap-3 mt-2 text-[11px] text-white/60">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" aria-hidden /> {views}
              </span>
              <span className="flex items-center gap-1">
                <Download className="w-3 h-3" aria-hidden /> {downloads}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        <span className={`self-start px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${guia.tagClass}`}>
          {guia.tagLabel}
        </span>

        <p className="text-stone-600 text-sm leading-relaxed flex-1">{guia.description}</p>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs border-t border-stone-100 pt-3">
          <StatChip icon={Eye} value={views} label="vistas" />
          <span className="text-stone-200 select-none">·</span>
          <StatChip icon={Download} value={downloads} label="descargas" />
        </div>

        {/* Reactions */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">¿Qué te pareció?</p>
          <div className="flex flex-wrap gap-2">
            {REACTIONS.map(({ emoji, label }) => {
              const count = Math.max(0, stats.reactions?.[emoji] || 0)
              const active = myReactions.includes(emoji)
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReaction(emoji)}
                  title={label}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-all duration-150 select-none ${
                    active
                      ? `ring-1 shadow-sm scale-105 ${guia.activeReactionClass}`
                      : 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:scale-105 active:scale-95'
                  }`}
                >
                  <span role="img" aria-label={label}>{emoji}</span>
                  {count > 0 && (
                    <span className="text-xs tabular-nums leading-none">{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <a
            href={guia.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onView}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r ${guia.btnGradient} text-white text-xs font-black shadow-sm hover:opacity-90 active:opacity-80 transition-opacity`}
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            Ver PDF
          </a>
          <button
            type="button"
            onClick={onDownload}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-800 text-xs font-black hover:bg-stone-50 active:bg-stone-100 transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" />
            Descargar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NaturalezaView({ currentUser, db, recordGuideInteraction, toggleGuideReaction }) {
  const lotNumber = currentUser?.lotNumber || 'guest'

  const guideStatsRow = useMemo(
    () => (db?.settings || []).find((s) => String(s.id) === 'guideStats') ?? {},
    [db?.settings],
  )

  const [myReactions, setMyReactions] = useState(() => readStoredReactions(lotNumber))

  const handleReaction = useCallback(
    (guideId, emoji) => {
      const prev = myReactions[guideId] || []
      const hasReacted = prev.includes(emoji)
      const next = {
        ...myReactions,
        [guideId]: hasReacted ? prev.filter((e) => e !== emoji) : [...prev, emoji],
      }
      setMyReactions(next)
      writeStoredReactions(lotNumber, next)
      void toggleGuideReaction?.(guideId, emoji, hasReacted ? -1 : 1).catch(console.error)
    },
    [myReactions, lotNumber, toggleGuideReaction],
  )

  const handleView = useCallback(
    (guideId) => {
      void recordGuideInteraction?.(guideId, 'views').catch(console.error)
    },
    [recordGuideInteraction],
  )

  const handleDownload = useCallback(
    (guia) => {
      void downloadPdf(guia.pdfUrl, guia.filename).then(() => {
        void recordGuideInteraction?.(guia.id, 'downloads').catch(console.error)
      })
    },
    [recordGuideInteraction],
  )

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-green-900 p-6 md:p-10 text-white relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-emerald-300 text-[11px] font-black uppercase tracking-widest mb-2">
              Cañón del Río Porce · Biodiversidad
            </p>
            <h2 className="text-3xl md:text-4xl font-black mb-3 leading-tight">
              Flora y Fauna de{' '}
              <span className="text-emerald-300">{TENANT.name}</span>
            </h2>
            <p className="text-emerald-100/90 text-sm md:text-base leading-relaxed">
              El Cañón del Río Porce alberga una biodiversidad excepcional. Estas guías ilustradas, elaboradas por expertos, son tu herramienta para conocer y proteger las especies que conviven con nuestra comunidad.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <img src={iconGuacamaya} alt="" className="w-16 h-16 object-contain drop-shadow-lg opacity-90" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {GUIAS.map((guia) => (
          <GuiaCard
            key={guia.id}
            guia={guia}
            stats={guideStatsRow[guia.id] || {}}
            myReactions={myReactions[guia.id] || []}
            onView={() => handleView(guia.id)}
            onDownload={() => handleDownload(guia)}
            onReaction={(emoji) => handleReaction(guia.id, emoji)}
          />
        ))}
      </div>

      <p className="text-center text-xs text-stone-400 pb-2">
        Guías elaboradas para el Cañón del Río Porce · {TENANT.name}
      </p>
    </div>
  )
}
