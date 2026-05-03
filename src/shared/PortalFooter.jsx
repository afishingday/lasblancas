import { SITE_BRAND_TITLE } from './utils.js'

export default function PortalFooter() {
  const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
  const appBuild = typeof __APP_BUILD_STAMP__ === 'string' ? __APP_BUILD_STAMP__ : 'build-desconocido'

  return (
    <footer className="text-center text-[11px] sm:text-xs text-stone-600 space-y-2 py-6 px-4 border-t border-emerald-100/50 bg-gradient-to-t from-amber-50/35 via-white/70 to-emerald-50/25 backdrop-blur">
      <p className="text-stone-600 leading-relaxed max-w-2xl mx-auto text-[10px] sm:text-[11px]">
        Portal informativo y voluntario: no somos propiedad horizontal ni administración. Los aportes publicados no son
        obligatorios. El acceso a este sitio no reemplaza acuerdos legales ni de convivencia fuera de la plataforma.
      </p>
      <p className="text-stone-700 leading-relaxed">
        Creado por Luis Montoya ·{' '}
        <a href="tel:+573016394349" className="text-emerald-700 font-semibold hover:underline">
          301 639 4349
        </a>
        {' · '}
        <a
          href="https://www.instagram.com/afishingday/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 font-semibold hover:underline"
        >
          @afishingday
        </a>
      </p>
      <p className="text-stone-500">© 2026 {SITE_BRAND_TITLE}. Todos los derechos reservados.</p>
      <p className="text-[10px] text-stone-400">
        Version {appVersion} · Build {appBuild}
      </p>
    </footer>
  )
}
