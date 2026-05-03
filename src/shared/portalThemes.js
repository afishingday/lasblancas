/**
 * Paletas de color del portal. Cada tema define CSS custom properties (--pt-*)
 * que se aplican en tiempo real sobre document.documentElement.
 * Los valores son RGB en formato "R G B" (sin rgb()) para que Tailwind pueda
 * usar alpha modifiers: bg-pt-600/80 → rgb(var(--pt-600) / 0.8).
 *
 * Todas las combinaciones dark-text/light-bg y white-text/dark-bg respetan WCAG AA.
 */

export const PORTAL_THEMES = [
  {
    id: 'bosque',
    name: 'Bosque Esmeralda',
    preview: '#059669',
    vars: {
      '--pt-50':  '236 253 245',
      '--pt-100': '209 250 229',
      '--pt-200': '167 243 208',
      '--pt-500': '16 185 129',
      '--pt-600': '5 150 105',
      '--pt-700': '4 120 87',
      '--pt-800': '6 95 70',
      '--pt-900': '6 78 59',
    },
  },
  {
    id: 'cielo',
    name: 'Cielo Azul',
    preview: '#0284c7',
    vars: {
      '--pt-50':  '240 249 255',
      '--pt-100': '224 242 254',
      '--pt-200': '186 230 253',
      '--pt-500': '14 165 233',
      '--pt-600': '2 132 199',
      '--pt-700': '3 105 161',
      '--pt-800': '7 89 133',
      '--pt-900': '12 74 110',
    },
  },
  {
    id: 'indigo',
    name: 'Índigo Profundo',
    preview: '#4f46e5',
    vars: {
      '--pt-50':  '238 242 255',
      '--pt-100': '224 231 255',
      '--pt-200': '199 210 254',
      '--pt-500': '99 102 241',
      '--pt-600': '79 70 229',
      '--pt-700': '67 56 202',
      '--pt-800': '55 48 163',
      '--pt-900': '49 46 129',
    },
  },
  {
    id: 'violeta',
    name: 'Violeta Creativo',
    preview: '#7c3aed',
    vars: {
      '--pt-50':  '245 243 255',
      '--pt-100': '237 233 254',
      '--pt-200': '221 214 254',
      '--pt-500': '139 92 246',
      '--pt-600': '124 58 237',
      '--pt-700': '109 40 217',
      '--pt-800': '91 33 182',
      '--pt-900': '76 29 149',
    },
  },
  {
    id: 'tierra',
    name: 'Tierra Cálida',
    preview: '#be185d',
    vars: {
      '--pt-50':  '253 242 248',
      '--pt-100': '252 231 243',
      '--pt-200': '251 207 232',
      '--pt-500': '236 72 153',
      '--pt-600': '219 39 119',
      '--pt-700': '190 24 93',
      '--pt-800': '157 23 77',
      '--pt-900': '131 24 67',
    },
  },
]

export const DEFAULT_THEME_ID = 'bosque'

export function getTheme(id) {
  return PORTAL_THEMES.find((t) => t.id === id) ?? PORTAL_THEMES[0]
}

export function applyTheme(id) {
  const theme = getTheme(id)
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([key, val]) => root.style.setProperty(key, val))
}
