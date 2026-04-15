/**
 * Cliente Gemini (Google AI). Usa VITE_GEMINI_API_KEY.
 * Evita `responseSchema` (a veces falla según modelo/cuenta); pide JSON por instrucciones y varios modelos de respaldo.
 * Modelo principal alineado con cuadernomagico: gemini-2.5-flash (estable en v1beta). Reintentos con backoff ante 429/502/503.
 */

const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']

/** Pausas entre reintentos (ms), estilo cuadernomagico: backoff ante límites o errores transitorios. */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]

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

function getModelOverride() {
  return (import.meta.env.VITE_GEMINI_MODEL || '').trim()
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
 * @param {{ systemText: string, userText: string, jsonShapeHint: string }} opts
 * @returns {Promise<{ data: any, ok: boolean }>}
 */
async function generateJsonWithFallback(opts) {
  lastGeminiDetail = ''
  const apiKey = getApiKey()
  if (!apiKey) {
    lastGeminiDetail = 'Falta VITE_GEMINI_API_KEY en .env'
    return { data: null, ok: false }
  }

  const models = getModelOverride() ? [getModelOverride()] : MODEL_FALLBACKS
  const fullUser = `${opts.systemText}\n\n${opts.userText}\n\n${opts.jsonShapeHint}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: fullUser }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  }

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const maxAttempts = 1 + RETRY_DELAYS_MS.length
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1])
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
          const modelMissing =
            res.status === 404 || /not found|not supported|is not found/i.test(String(msg))
          const retryable =
            !modelMissing && [429, 500, 502, 503].includes(res.status)
          if (retryable && attempt < maxAttempts - 1) {
            console.warn('[Gemini] reintento', model, res.status)
            continue
          }
          console.warn('[Gemini]', lastGeminiDetail)
          break
        }
        const parsed = parseJsonFromResponse(data)
        if (parsed) {
          lastGeminiDetail = ''
          return { data: parsed, ok: true }
        }
        lastGeminiDetail = `${model}: respuesta sin JSON válido`
        console.warn('[Gemini]', lastGeminiDetail, data)
        break
      } catch (e) {
        lastGeminiDetail = `${model}: ${e instanceof Error ? e.message : String(e)}`
        if (attempt < maxAttempts - 1) {
          console.warn('[Gemini] reintento tras error de red', model)
          continue
        }
        console.warn('[Gemini] fetch', lastGeminiDetail)
        break
      }
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
      'Responde únicamente JSON: {"description":"2 o 3 oraciones formales, sin inventar montos ni fechas"}.',
  })
  if (!ok || !data?.description) return null
  return { description: String(data.description).trim() }
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
