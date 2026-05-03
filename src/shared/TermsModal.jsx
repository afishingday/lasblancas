import { useState, useRef } from 'react'
import { FileText } from 'lucide-react'
import { TENANT } from '../tenant.config.js'

export default function TermsModal({ onAccept, accepting }) {
  const [scrolled, setScrolled] = useState(false)
  const bodyRef = useRef(null)
  const { legal } = TENANT

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setScrolled(true)
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-stone-100 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h2 className="text-lg font-black text-stone-900">Términos y Condiciones</h2>
            <p className="text-xs text-stone-500 font-medium">
              Versión {legal.termsVersion} · Actualizado {legal.termsUpdatedAt}
            </p>
          </div>
        </div>
        <div
          ref={bodyRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-stone-600 leading-relaxed"
        >
          {legal.sections.map((section, i) => (
            <div key={i}>
              <h3 className="font-black text-stone-900 mb-1">{i + 1}. {section.title}</h3>
              <p>{section.body}</p>
            </div>
          ))}
          <p className="text-xs text-stone-400 pt-3 border-t border-stone-100">
            Titular: {legal.ownerName} · Contacto: {legal.contact}
          </p>
        </div>
        <div className="p-5 border-t border-stone-100 shrink-0 space-y-2">
          {!scrolled && (
            <p className="text-xs text-stone-400 text-center font-medium">
              Desplázate hasta el final para habilitar la aceptación
            </p>
          )}
          <button
            type="button"
            onClick={onAccept}
            disabled={!scrolled || accepting}
            className={`w-full py-3 rounded-xl font-black text-sm transition-all ${
              scrolled && !accepting
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md hover:opacity-90 active:opacity-80'
                : 'bg-stone-100 text-stone-400 cursor-not-allowed'
            }`}
          >
            {accepting ? 'Guardando…' : 'He leído y acepto los términos'}
          </button>
        </div>
      </div>
    </div>
  )
}
