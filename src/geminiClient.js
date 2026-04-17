/**
 * Cliente Gemini (Google AI). Usa VITE_GEMINI_API_KEY.
 * Misma idea que cuadernomagico/js/gemini.js: un solo modelo estable (v1beta), sin IDs -preview/fecha,
 * y reintentos con backoff ante cualquier fallo de red o HTTP.
 * @see C:\Users\usuario\Documents\Proyectos Personales Luis\cuadernomagico\js\gemini.js
 */

/** Modelo fijo por defecto (igual que CuadernoMagico). */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

/** Pausas entre reintentos (ms): mismos escalones que cuadernomagico/js/gemini.js (delays). */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]

/** Intentos máximos por petición (cuadernomagico: while (retries < 5)). */
const MAX_FETCH_ATTEMPTS = 5

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let lastGeminiDetail = ''

export function getLastGeminiDetail() {
  return lastGeminiDetail
}

function getApiKey() {
  return (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
}

function getModelId() {
  let v = String(import.meta.env.VITE_GEMINI_MODEL || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/^models\//i, '')
    .trim()
  if (!v) return DEFAULT_GEMINI_MODEL
  const lower = v.toLowerCase()
  // Cualquier variante 1.5-pro suele fallar en v1beta (generateContent); no solo el id exacto.
  if (lower.includes('gemini-1.5-pro') || lower.includes('-preview') || v.includes('@')) {
    return DEFAULT_GEMINI_MODEL
  }
  return v
}

function parseJsonFromResponse(data) {
  const c = data?.candidates?.[0]
  if (!c) return null
  if (c.finishReason && c.finishReason !== 'STOP' && c.finishReason !== 'MAX_TOKENS') {
    lastGeminiDetail = `Bloqueo o fin inesperado: ${c.finishReason}`
  }
  const raw = c.content?.parts?.[0]?.text
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        return null
      }
    }
    return null
  }
}

/**
 * @param {{ systemText: string, userText: string, jsonShapeHint: string, temperature?: number }} opts
 * @returns {Promise<{ data: any, ok: boolean }>}
 */
async function generateJsonWithFallback(opts) {
  lastGeminiDetail = ''
  const apiKey = getApiKey()
  if (!apiKey) {
    lastGeminiDetail = 'Falta VITE_GEMINI_API_KEY en .env'
    return { data: null, ok: false }
  }

  const model = getModelId()
  const fullUser = `${opts.systemText}\n\n${opts.userText}\n\n${opts.jsonShapeHint}`
  const temperature =
    typeof opts.temperature === 'number' && opts.temperature >= 0 && opts.temperature <= 2 ? opts.temperature : 0.35

  // Misma forma que cuadernomagico fetchJSON: contents.parts (sin role), responseMimeType json.
  const body = {
    contents: [{ parts: [{ text: fullUser }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delayMs = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]
      await sleep(delayMs)
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`
        lastGeminiDetail = `${model}: ${msg}`
        console.warn('[Gemini]', lastGeminiDetail)
        if (attempt < MAX_FETCH_ATTEMPTS - 1) {
          console.warn('[Gemini] reintento', attempt + 1, '/', MAX_FETCH_ATTEMPTS)
          continue
        }
        return { data: null, ok: false }
      }
      const parsed = parseJsonFromResponse(data)
      if (parsed) {
        lastGeminiDetail = ''
        return { data: parsed, ok: true }
      }
      lastGeminiDetail = `${model}: respuesta sin JSON válido`
      console.warn('[Gemini]', lastGeminiDetail, data)
      if (attempt < MAX_FETCH_ATTEMPTS - 1) {
        console.warn('[Gemini] reintento (parseo)', attempt + 1, '/', MAX_FETCH_ATTEMPTS)
        continue
      }
      return { data: null, ok: false }
    } catch (e) {
      lastGeminiDetail = `${model}: ${e instanceof Error ? e.message : String(e)}`
      console.warn('[Gemini] fetch', lastGeminiDetail)
      if (attempt < MAX_FETCH_ATTEMPTS - 1) {
        console.warn('[Gemini] reintento tras error de red', attempt + 1, '/', MAX_FETCH_ATTEMPTS)
        continue
      }
      return { data: null, ok: false }
    }
  }
  return { data: null, ok: false }
}

const POLISH_KINDS = {
  news_title: 'Mejora este título de noticia para el portal de un conjunto residencial en Colombia: más claro, profesional y atractivo, sin exagerar. Máximo 120 caracteres.',
  news_excerpt: 'Mejora este resumen corto de noticia: tono cercano pero formal, una o dos frases.',
  news_content:
    'Mejora este cuerpo de noticia: párrafos claros, tono comunitario y profesional. Conserva hechos; no inventes datos.',
  initiative_title: 'Mejora el título de esta iniciativa vecinal en Colombia: claro y motivador. Máximo 140 caracteres.',
  initiative_excerpt:
    'Mejora la justificación/contexto de una iniciativa en un conjunto residencial: 2–4 frases, tono formal y cercano.',
  initiative_question:
    'Mejora la redacción de esta pregunta de encuesta para vecinos: neutra, clara y sin sesgo. Una sola pregunta bien formulada.',
  fund_name: 'Mejora el nombre de este proyecto comunitario: breve y profesional.',
  fund_description:
    'Mejora la descripción de un proyecto de obra o gestión en un conjunto residencial en Colombia: 2–4 oraciones claras. No inventes cifras.',
  event_title:
    'Mejora el título de este evento comunitario en un conjunto residencial en Colombia: claro, respetuoso y concreto. Máximo 120 caracteres.',
  event_notes:
    'Mejora estas notas de evento para residentes: tono formal y cercano, con instrucciones claras y sin inventar datos.',
  directory_category:
    'Corrige ortografía y estandariza este nombre de categoría para un directorio comunitario en Colombia. Devuelve un nombre corto (1 a 3 palabras), claro y consistente.',
}

/**
 * @param {keyof typeof POLISH_KINDS} kind
 * @param {string} draft
 * @returns {Promise<string|null>}
 */
export async function polishSpanishField(kind, draft) {
  const instruction = POLISH_KINDS[kind]
  if (!instruction || !draft?.trim()) return null

  const { data, ok } = await generateJsonWithFallback({
    systemText: `${instruction} El usuario escribe en español.`,
    userText: `Texto a mejorar:\n"""${draft.trim()}"""`,
    jsonShapeHint: 'Responde únicamente un objeto JSON con exactamente esta forma: {"text":"aquí va el texto mejorado"}. Sin markdown ni texto fuera del JSON.',
  })
  if (!ok || !data) return null
  const text = typeof data.text === 'string' ? data.text.trim() : ''
  return text || null
}

/**
 * Una sola llamada para pulir título y/o descripción del muro de propuestas (más rápido y estable que dos polish).
 * @param {{ title?: string, excerpt?: string }} draft
 * @returns {Promise<{ title: string, excerpt: string } | null>}
 */
export async function polishProposalWallDraft(draft) {
  const titleIn = String(draft?.title ?? '').trim()
  const excerptIn = String(draft?.excerpt ?? '').trim()
  if (!titleIn && !excerptIn) return null

  const { data, ok } = await generateJsonWithFallback({
    systemText:
      'Eres editor para el muro de propuestas de un conjunto residencial en Colombia. Mejora ortografía y redacción sin cambiar el sentido ni inventar hechos, montos ni fechas.',
    userText: `Título (puede estar vacío):\n"""${titleIn}"""\n\nDescripción breve (puede estar vacía):\n"""${excerptIn}"""`,
    jsonShapeHint:
      'Responde únicamente JSON con exactamente esta forma: {"title":"...","excerpt":"..."}. Reglas: si el título de entrada estaba vacío, devuelve title como "". Si la descripción de entrada estaba vacía, devuelve excerpt como "". Si había título, máximo 120 caracteres. Si había descripción, 2–4 frases cortas y claras. No pongas el título dentro de excerpt ni al revés.',
  })
  if (!ok || !data) return null
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  const excerpt = typeof data.excerpt === 'string' ? data.excerpt.trim() : ''
  return { title, excerpt }
}

/** Sugiere opciones de encuesta a partir de la pregunta. */
export async function fetchGeminiSurveyOptions(question) {
  if (!question?.trim()) return null
  const { data, ok } = await generateJsonWithFallback({
    systemText:
      'Eres asistente para encuestas vecinales. Devuelve 3 u opciones de respuesta cortas, cada una empezando con un emoji adecuado.',
    userText: `Pregunta de encuesta: "${question.trim()}"`,
    jsonShapeHint:
      'Responde únicamente JSON: {"suggestedOptions":["opción1","opción2","opción3"]} (puede haber 4 strings). Sin markdown.',
  })
  if (!ok || !data?.suggestedOptions?.length) return null
  return { suggestedOptions: data.suggestedOptions }
}

/**
 * Descripción a partir del título (proyecto en fondos o propuesta en el muro).
 * @param {string} title
 * @param {{ mode?: 'project' | 'proposal' }} [options]
 */
export async function fetchGeminiProjectDescriptionFromTitle(title, options = {}) {
  if (!title?.trim()) return null
  const mode = options.mode === 'proposal' ? 'proposal' : 'project'
  const systemText =
    mode === 'proposal'
      ? 'Redacta en español una descripción breve de la propuesta vecinal para un conjunto residencial en Colombia: qué se busca, beneficio para la comunidad y tono respetuoso. No inventes montos ni fechas.'
      : "Redacta en español una descripción breve del proyecto para el conjunto residencial 'Las Blancas'."
  const label = mode === 'proposal' ? 'Título de la propuesta' : 'Título del proyecto'
  const { data, ok } = await generateJsonWithFallback({
    systemText,
    userText: `${label}: "${title.trim()}"`,
    jsonShapeHint:
      'Responde únicamente JSON con una sola clave de texto largo. Forma preferida: {"description":"2 o 3 oraciones formales, sin inventar montos ni fechas"}. Alternativas aceptables: {"text":"..."} o {"descripcion":"..."} (mismo contenido).',
  })
  if (!ok || !data) return null
  const raw =
    data.description ??
    data.descripcion ??
    data.text ??
    (typeof data.excerpt === 'string' ? data.excerpt : null)
  const description = raw != null ? String(raw).trim() : ''
  if (!description) return null
  return { description }
}

/**
 * Borrador de noticia cuando el proyecto alcanza la meta de recaudo (tono vecinal, agradecimiento, siguiente fase).
 * @param {{ name?: string, goal?: number, raised?: number, description?: string }} fund
 * @returns {Promise<{ title: string, excerpt: string, content: string } | null>}
 */
export async function fetchGeminiFundMetaReachedNews(fund) {
  const name = String(fund?.name ?? '').trim()
  if (!name) return null
  const goal = Math.round(Number(fund?.goal) || 0)
  const raised = Math.round(Number(fund?.raised) || 0)
  const desc = String(fund?.description ?? '').trim().slice(0, 1200)

  const { data, ok } = await generateJsonWithFallback({
    temperature: 0.72,
    systemText:
      'Eres redactor/a para el portal vecinal del conjunto Las Blancas (Colombia). Las decisiones son comunitarias; no escribas como empresa ni uses la palabra administración. Tono cálido, claro y breve.',
    userText: `Proyecto: "${name}".
Meta de recaudo acordada (COP, entero): ${goal}.
Recaudado registrado (COP, entero): ${raised}.
Contexto del proyecto (puede estar vacío):\n"""${desc}"""

La comunidad acaba de cumplir la meta de recaudo. Redacta una noticia para el muro de inicio.`,
    jsonShapeHint:
      'Responde SOLO JSON con esta forma exacta: {"title":"...","excerpt":"...","content":"..."}. ' +
        'title: máximo 90 caracteres, festivo y claro (ej. agradecer, celebrar juntos). ' +
        'excerpt: 1 o 2 frases, máximo 220 caracteres, con gratitud al compromiso de los vecinos y mención breve de que ya están listos para la siguiente fase o para comenzar (obra o gestión según encaje). ' +
        'content: 2 a 4 párrafos cortos en español; mezcla con naturalidad: agradecimiento por el apoyo y el compromiso de los lotes, orgullo colectivo, que gracias a todos se alcanzó la meta, invitación a estar atentos a próximos pasos o avisos. ' +
        'Incluye al menos una variación de estilo entre: "estamos listos para comenzar", "gracias por su apoyo", "gracias por el compromiso" (no las repitas todas seguidas ni como lista). ' +
        'No inventes cifras distintas a meta y recaudado; no prometas fechas concretas.',
  })
  if (!ok || !data) return null
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  const excerpt = typeof data.excerpt === 'string' ? data.excerpt.trim() : ''
  const content = typeof data.content === 'string' ? data.content.trim() : ''
  if (!title || !excerpt || !content) return null
  return { title, excerpt, content }
}

/**
 * Interpreta en lenguaje natural cómo filtrar y ordenar directorios (servicios o comunidad).
 * @param {'services' | 'community'} mode
 * @param {string} userInstruction
 * @param {string} dataSummary
 * @returns {Promise<{ sortBy: 'name' | 'lot' | 'label', filter: string } | null>}
 */
export async function fetchGeminiDirectoryPreferences(mode, userInstruction, dataSummary) {
  if (!userInstruction?.trim()) return null
  const modeHint =
    mode === 'services'
      ? 'Directorio de servicios: cada fila tiene categoría (Salud, Seguridad, Mantenimiento, Domicilios u otras), nombre del contacto y descripción.'
      : 'Directorio de vecinos: cada fila tiene lote (ej. Lote1A), nombre y profesión u oficio.'

  const { data, ok } = await generateJsonWithFallback({
    systemText: `${modeHint} El usuario escribe en español.`,
    userText: `Valores presentes en los datos (resumen):\n${dataSummary}\n\nInstrucción del usuario:\n"""${userInstruction.trim()}"""`,
    jsonShapeHint:
      'Responde solo JSON: {"sortBy":"name"|"lot"|"label","filter":string}. sortBy: name = ordenar por nombre del contacto A-Z; lot = en comunidad ordenar por lote; en servicios ordenar por categoría y luego nombre; label = en comunidad ordenar por profesión y luego nombre; en servicios equivale a ordenar por categoría y nombre. filter: en servicios el nombre exacto de una categoría a mostrar, o cadena vacía para todas; en comunidad palabra clave que debe aparecer en lote, nombre o profesión (vacía = todos).',
  })
  if (!ok || !data) return null
  const sortBy = ['name', 'lot', 'label'].includes(data.sortBy) ? data.sortBy : 'name'
  const filter = typeof data.filter === 'string' ? data.filter.trim() : ''
  return { sortBy, filter }
}

export function isGeminiConfigured() {
  return Boolean(getApiKey())
}
