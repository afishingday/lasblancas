# Portal Comunitario Las Blancas — Contexto para Claude

## Qué es este proyecto

SPA de React para la comunidad campestre Las Blancas (Colombia). Portal privado con login por lote: noticias, votaciones, fondos comunitarios, directorio de servicios, mapa de etapas y perfil. Deployado en Firebase Hosting.

## Stack

| Capa | Tecnología |
|---|---|
| UI | React 19, Vite 8 |
| Estilos | Tailwind CSS 3 + tailwindcss-animate, sin CSS modules |
| Iconos | lucide-react (siempre importar por nombre, e.g. `{ PlusCircle }`) |
| Base de datos | Firebase Firestore (10 colecciones, real-time via `onSnapshot`) |
| Archivos | Firebase Cloud Storage |
| IA | Google Gemini 2.5 Flash via `src/geminiClient.js` |
| Analytics | Firebase GA4 via `src/analytics.js` |
| Deploy | `npm run deploy:hosting` → build + `firebase deploy --only hosting` |

## Arquitectura de carpetas

```
src/
├── App.jsx                        # Orquestador (~290 líneas): estado global, sidebar, modales, tab-routing
├── shared/
│   ├── utils.js                   # Utilidades JS puras (sin React). Importar desde aquí, no desde App.
│   ├── ErrorBoundary.jsx          # Class component, envuelve toda la app
│   └── PortalFooter.jsx           # Footer reutilizable
├── features/
│   ├── login/LoginView.jsx        # Login + cambio de contraseña público
│   ├── news/NewsView.jsx          # Noticias con galería, YouTube, AI
│   ├── dashboard/DashboardView.jsx# Resumen, eventos, configuración pública
│   ├── proposals/ProposalsView.jsx# Muro de propuestas (tipo sugerencias)
│   ├── initiatives/InitiativesView.jsx # Votaciones y encuestas con resultados
│   ├── funds/FundsView.jsx        # Proyectos de recaudo con progreso circular
│   ├── directories/DirectoriesView.jsx # Servicios y directorio vecinal (mismo componente, prop `type`)
│   ├── map/MapView.jsx            # Planos por etapa con lightbox móvil
│   └── profile/ProfileView.jsx    # Perfil, avatar, contraseña. Exporta ChangePasswordPanel y SuperadminPasswordResetPanel
├── firestore/
│   ├── portalData.js              # Todas las funciones CRUD de Firestore
│   ├── uploadEntityImage.js       # Subida de imágenes de entidades (fondos, mapas)
│   └── uploadNewsImage.js        # Subida de imágenes de noticias (galería múltiple)
├── geminiClient.js                # Cliente Gemini: polishSpanishField, fetchGemini*, isGeminiConfigured, getLastGeminiDetail
├── analytics.js                   # trackPortalEvent, setPortalAnalyticsUser
├── brandAssets.js                 # BRAND_LOGO_SRC (imagen del logo)
├── firebase.js                    # Instancia de Firebase (db, storage, analytics)
├── fundHistoricRaised.js          # sumFundsRaisedTotal
├── initialData.js                 # EMPTY_DB, INITIAL_DATA, PORTAL_USERS_CONFIG_VERSION
└── portalSession.js               # savePortalSession, clearPortalSession, readPortalSession
images/
├── etapaa.jpeg                    # Mapa Etapa A (importado en MapView)
└── etapab.jpeg                    # Mapa Etapa B (importado en MapView)
```

## Colecciones de Firestore (`db.*`)

| Colección | Descripción |
|---|---|
| `db.users` | Usuarios: `{ lot, password, role, blocked, avatar, fincaName }` |
| `db.settings` | Configuración pública del portal |
| `db.news` | Noticias: `{ id, title, body, images[], youtubeUrl, ... }` |
| `db.initiatives` | Votaciones/encuestas y propuestas |
| `db.funds` | Proyectos de recaudo: `{ name, goal, raised, status, requiresBudget }` |
| `db.events` | Eventos comunitarios con fecha/hora |
| `db.services` | Directorio de servicios externos |
| `db.community` | Directorio de vecinos con oficio |
| `db.mapLayers` | Planos opcionales (fallback: imágenes locales etapaa/etapab) |
| `db.logs` | Log de acciones de usuarios |

## Roles de usuario

- `'user'` — vecino normal: ve todo, puede votar, agregar al directorio
- `'admin'` — editor: crea/edita noticias, eventos, fondos, iniciativas
- `'superadmin'` — super editor: todo lo anterior + reset de claves + bloqueo de usuarios

Verificar con `isAdminLike(currentUser)` de `src/shared/utils.js` (retorna true para admin y superadmin).

## Convenciones de importación en las features

**Regla principal: las funciones de Firestore se pasan como props desde App.jsx, NO se importan directamente en los views.**

Importaciones directas permitidas en features:
- `trackPortalEvent` desde `../../analytics.js`
- Funciones de Gemini desde `../../geminiClient.js` (`isGeminiConfigured`, `getLastGeminiDetail`, `fetchGemini*`, `polishSpanishField`, `polishProposalWallDraft`)
- `uploadEntityCoverImage`, `MAX_ENTITY_IMAGE_BYTES` desde `../../firestore/uploadEntityImage.js`
- `uploadNewsImageFile`, `isNewsFallbackImageUrl`, `MAX_NEWS_IMAGE_BYTES`, `MAX_NEWS_IMAGES_COUNT`, etc. desde `../../firestore/uploadNewsImage.js`
- `sumFundsRaisedTotal` desde `../../fundHistoricRaised.js`
- Utilitarios desde `../../shared/utils.js`

## Exports especiales

`src/features/profile/ProfileView.jsx` tiene exports nombrados además del default:
```js
import ProfileView, { ChangePasswordPanel, SuperadminPasswordResetPanel } from './features/profile/ProfileView.jsx'
```
`ChangePasswordPanel` y `SuperadminPasswordResetPanel` se renderizan en el **sidebar de App.jsx**, no dentro de ProfileView.

## Routing / navegación

No usa React Router. La navegación es por estado `activeTab` en `PortalApp` (App.jsx). Los tabs posibles: `'news'`, `'dashboard'`, `'initiatives'`, `'proposals'`, `'funds'`, `'services'`, `'community'`, `'map'`, `'profile'`.

Para navegar programáticamente desde un view, se pasa `setActiveTab` como prop (solo DashboardView lo recibe actualmente).

## Autenticación

Custom, sin Firebase Auth. Login: busca `lot` en `db.users`, compara `password` en texto plano. Sesión persistida en `localStorage` via `portalSession.js`. El superadmin puede resetear claves de cualquier usuario.

## Variables de entorno

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_GEMINI_API_KEY          # Opcional. Sin ella los botones de IA muestran aviso.
```

## Patrones de UI / Tailwind

- Paleta principal: `emerald` (primario), `stone` (texto/neutros), `blue` (fondos/estados), `amber` (IA/alertas), `rose` (peligro/superadmin)
- Clase de canvas global: `bg-portal-canvas` (definida en `tailwind.config.cjs`)
- Bordes redondeados: `rounded-xl` (inputs/botones) o `rounded-3xl` (cards)
- Animaciones de entrada: `animate-in fade-in duration-500`, `slide-in-from-top-4`
- Los modales de alerta/confirmación globales se disparan via `showAlert(msg)` / `showConfirm(msg, callback)` — props pasados desde App.jsx a todos los views

## Gemini AI

- Modelo: `gemini-2.5-flash` (fijo en geminiClient.js)
- Siempre verificar `isGeminiConfigured()` antes de llamar a la IA; si falla mostrar aviso con `showAlert`
- `getLastGeminiDetail()` retorna el mensaje de error del último llamado fallido
- `requestPolishedText(fieldType, text)` en `shared/utils.js` — wrapper genérico de copywriting
- Funciones específicas: `fetchGeminiSurveyOptions`, `fetchGeminiProjectDescriptionFromTitle`, `fetchGeminiFundMetaReachedNews`, `polishProposalWallDraft`, `polishSpanishField`

## Versionado (package.json)

Usar versionado semántico `MAJOR.MINOR.PATCH` con esta regla práctica del proyecto:

- Cambio pequeño/puntual: incrementar `PATCH` (último dígito), ej. `0.0.1` → `0.0.2`
- Cambio mediano: incrementar `MINOR` (dígito del medio) y resetear `PATCH`, ej. `0.0.2` → `0.1.0`
- Cambio muy grande: incrementar `MAJOR` (primer dígito) y resetear `MINOR/PATCH`, ej. `0.1.0` → `1.0.0`

## Comandos útiles

```bash
npm run dev              # Servidor de desarrollo
npm run build            # Build de producción (verifica que compile sin errores)
npm run deploy:hosting   # Build + deploy a Firebase Hosting
npm run lint             # ESLint
```

## Lo que NO hacer

- No importar funciones CRUD de `portalData.js` directamente en features (van como props).
- No usar React Router — la navegación es por `activeTab`.
- No agregar Firebase Auth — la autenticación es custom por contraseña en texto plano en Firestore.
- No crear archivos CSS adicionales — todo es Tailwind inline.
- No agregar librerías de componentes (no hay shadcn, MUI, etc.) — UI 100% custom con Tailwind.
- No agregar comentarios explicativos al código salvo que el WHY sea no obvio.
