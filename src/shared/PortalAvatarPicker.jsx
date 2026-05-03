import { PORTAL_AVATAR_ICONS, avatarValueFromImageId } from '../avatarImages.js'

/**
 * Selector de imagen de perfil: muestra la galería de src/assets/icons/ (auto-descubierta via import.meta.glob).
 * Valor en Firestore: `img:<id>` (ej. `img:1`).
 */
export default function PortalAvatarPicker({ value, onChange }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-stone-800">Imagen de perfil</span>
        {PORTAL_AVATAR_ICONS.length > 0 && (
          <span className="text-[10px] font-bold bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full">
            {PORTAL_AVATAR_ICONS.length} disponibles
          </span>
        )}
      </div>

      {PORTAL_AVATAR_ICONS.length === 0 ? (
        <p className="text-xs text-stone-500 italic">
          Agrega imágenes PNG/JPG en <span className="font-mono text-stone-700">src/assets/icons/</span> para que aparezcan aquí.
        </p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {PORTAL_AVATAR_ICONS.map((icon) => {
            const val = avatarValueFromImageId(icon.id)
            const selected = value === val
            return (
              <button
                key={icon.id}
                type="button"
                onClick={() => onChange(val)}
                className={`relative aspect-square overflow-hidden rounded-xl border-2 transition-all ${
                  selected
                    ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-md'
                    : 'border-transparent hover:border-emerald-200 hover:shadow-sm'
                }`}
              >
                <img src={icon.src} alt={icon.label} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute bottom-0.5 left-1 text-[10px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                  {icon.id}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-xs font-bold text-stone-500 hover:text-stone-800 underline"
        >
          Quitar imagen
        </button>
      )}
    </div>
  )
}
