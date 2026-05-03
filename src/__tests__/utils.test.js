import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  formatCurrency,
  copDigitsFromInput,
  parseCopIntegerFromDigits,
  fundAmountFromDb,
  mapLegacyFundStatus,
  FUND_STATUS,
  FUND_STATUS_OPTIONS,
  parseYouTubeVideoId,
  getYoutubeVideoIdFromNewsPost,
  safeDateParse,
  getTimeRemainingLabel,
  isVotingClosed,
  checkStrongPassword,
  isAdminLike,
  getAvatarById,
  resolveAvatarDisplay,
  telHrefFromDisplayPhone,
  coerceSurveyOptionId,
  toLocalDatetimeInputValue,
  requestPolishedText,
  surveyOptionIsAffirmative,
  findCameraPortadaSurveyInitiatives,
  buildMergedCameraPortadaVoteMap,
  resolveCameraPortadaAccessFromStores,
} from '../shared/utils.js'

vi.mock('../geminiClient.js', () => ({
  polishSpanishField: vi.fn().mockResolvedValue('texto mejorado'),
}))

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formatea millones en pesos colombianos', () => {
    expect(formatCurrency(1500000)).toMatch(/1[.,]500[.,]000/)
  })

  it('formatea cero como $0', () => {
    expect(formatCurrency(0)).toMatch(/\$\s*0/)
  })

  it('redondea decimales al entero más cercano', () => {
    expect(formatCurrency(1500.9)).toMatch(/1[.,]501/)
  })

  it('retorna $0 para valores no numéricos', () => {
    expect(formatCurrency(NaN)).toMatch(/\$\s*0/)
    expect(formatCurrency(undefined)).toMatch(/\$\s*0/)
  })

  it('maneja números negativos', () => {
    const result = formatCurrency(-500000)
    expect(result).toContain('500')
  })
})

// ---------------------------------------------------------------------------
// copDigitsFromInput
// ---------------------------------------------------------------------------
describe('copDigitsFromInput', () => {
  it('elimina todo excepto dígitos', () => {
    expect(copDigitsFromInput('$1.500.000')).toBe('1500000')
  })

  it('retorna string vacío para entrada vacía', () => {
    expect(copDigitsFromInput('')).toBe('')
  })

  it('retorna string vacío para null/undefined', () => {
    expect(copDigitsFromInput(null)).toBe('')
    expect(copDigitsFromInput(undefined)).toBe('')
  })

  it('mantiene solo los números de una cadena mixta', () => {
    expect(copDigitsFromInput('abc123def456')).toBe('123456')
  })
})

// ---------------------------------------------------------------------------
// parseCopIntegerFromDigits
// ---------------------------------------------------------------------------
describe('parseCopIntegerFromDigits', () => {
  it('convierte string de dígitos a entero', () => {
    expect(parseCopIntegerFromDigits('5000000')).toBe(5000000)
  })

  it('retorna 0 para string vacío', () => {
    expect(parseCopIntegerFromDigits('')).toBe(0)
  })

  it('retorna 0 para undefined', () => {
    expect(parseCopIntegerFromDigits(undefined)).toBe(0)
  })

  it('limpia caracteres no numéricos antes de parsear', () => {
    expect(parseCopIntegerFromDigits('$2.000.000')).toBe(2000000)
  })

  it('respeta el límite de MAX_SAFE_INTEGER', () => {
    const result = parseCopIntegerFromDigits('99999999999999999999')
    expect(result).toBe(Number.MAX_SAFE_INTEGER)
  })
})

// ---------------------------------------------------------------------------
// fundAmountFromDb
// ---------------------------------------------------------------------------
describe('fundAmountFromDb', () => {
  it('retorna el valor redondeado', () => {
    expect(fundAmountFromDb(2500000.7)).toBe(2500001)
  })

  it('retorna 0 para valores negativos', () => {
    expect(fundAmountFromDb(-100)).toBe(0)
  })

  it('retorna 0 para NaN', () => {
    expect(fundAmountFromDb(NaN)).toBe(0)
  })

  it('retorna 0 para undefined', () => {
    expect(fundAmountFromDb(undefined)).toBe(0)
  })

  it('retorna valor exacto para entero válido', () => {
    expect(fundAmountFromDb(5000000)).toBe(5000000)
  })
})

// ---------------------------------------------------------------------------
// mapLegacyFundStatus
// ---------------------------------------------------------------------------
describe('mapLegacyFundStatus', () => {
  it('mapea el estado legacy "Aprobado" a META_ALCANZADA', () => {
    expect(mapLegacyFundStatus('Aprobado')).toBe(FUND_STATUS.META_ALCANZADA)
  })

  it('retorna el mismo valor si ya es un estado válido', () => {
    expect(mapLegacyFundStatus(FUND_STATUS.EN_PROGRESO)).toBe(FUND_STATUS.EN_PROGRESO)
    expect(mapLegacyFundStatus(FUND_STATUS.TERMINADO)).toBe(FUND_STATUS.TERMINADO)
  })

  it('retorna RECOLECCION como fallback para estados desconocidos', () => {
    expect(mapLegacyFundStatus('EstadoRaro')).toBe(FUND_STATUS.RECOLECCION)
    expect(mapLegacyFundStatus(undefined)).toBe(FUND_STATUS.RECOLECCION)
  })

  it('FUND_STATUS_OPTIONS incluye todos los estados', () => {
    expect(FUND_STATUS_OPTIONS).toHaveLength(5)
    expect(FUND_STATUS_OPTIONS).toContain(FUND_STATUS.META_ALCANZADA)
  })
})

// ---------------------------------------------------------------------------
// parseYouTubeVideoId
// ---------------------------------------------------------------------------
describe('parseYouTubeVideoId', () => {
  const VALID_ID = 'dQw4w9WgXcQ'

  it('retorna null para entrada nula o vacía', () => {
    expect(parseYouTubeVideoId(null)).toBeNull()
    expect(parseYouTubeVideoId('')).toBeNull()
  })

  it('reconoce un ID puro de 11 caracteres', () => {
    expect(parseYouTubeVideoId(VALID_ID)).toBe(VALID_ID)
  })

  it('extrae ID de URL youtube.com/watch?v=', () => {
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${VALID_ID}`)).toBe(VALID_ID)
  })

  it('extrae ID de URL youtu.be/', () => {
    expect(parseYouTubeVideoId(`https://youtu.be/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('extrae ID de URL de /shorts/', () => {
    expect(parseYouTubeVideoId(`https://www.youtube.com/shorts/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('extrae ID de URL de /embed/', () => {
    expect(parseYouTubeVideoId(`https://www.youtube.com/embed/${VALID_ID}`)).toBe(VALID_ID)
  })

  it('retorna null para URLs no relacionadas con YouTube', () => {
    expect(parseYouTubeVideoId('https://vimeo.com/12345')).toBeNull()
  })

  it('retorna null para IDs de longitud incorrecta', () => {
    expect(parseYouTubeVideoId('abc123')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getYoutubeVideoIdFromNewsPost
// ---------------------------------------------------------------------------
describe('getYoutubeVideoIdFromNewsPost', () => {
  const VALID_ID = 'dQw4w9WgXcQ'

  it('retorna null para post nulo', () => {
    expect(getYoutubeVideoIdFromNewsPost(null)).toBeNull()
  })

  it('usa el campo youtubeVideoId si es un ID válido', () => {
    expect(getYoutubeVideoIdFromNewsPost({ youtubeVideoId: VALID_ID })).toBe(VALID_ID)
  })

  it('usa youtubeUrl si youtubeVideoId está vacío', () => {
    expect(
      getYoutubeVideoIdFromNewsPost({
        youtubeVideoId: '',
        youtubeUrl: `https://youtu.be/${VALID_ID}`,
      }),
    ).toBe(VALID_ID)
  })
})

// ---------------------------------------------------------------------------
// safeDateParse
// ---------------------------------------------------------------------------
describe('safeDateParse', () => {
  it('retorna isClosed:false y mensaje para fecha nula', () => {
    const result = safeDateParse(null)
    expect(result.isClosed).toBe(false)
    expect(result.formatted).toBe('Sin fecha límite')
  })

  it('retorna isClosed:true para fecha claramente pasada', () => {
    const result = safeDateParse('2020-01-01T00:00:00.000Z')
    expect(result.isClosed).toBe(true)
  })

  it('retorna isClosed:false para fecha claramente futura', () => {
    const result = safeDateParse('2099-12-31T23:59:59.000Z')
    expect(result.isClosed).toBe(false)
  })

  it('retorna mensaje de error para fecha inválida', () => {
    const result = safeDateParse('fecha-invalida')
    expect(result.formatted).toBe('Fecha inválida')
  })
})

// ---------------------------------------------------------------------------
// getTimeRemainingLabel
// ---------------------------------------------------------------------------
describe('getTimeRemainingLabel', () => {
  it('retorna null para fecha nula', () => {
    expect(getTimeRemainingLabel(null)).toBeNull()
  })

  it('retorna null para fecha pasada', () => {
    expect(getTimeRemainingLabel('2020-01-01T00:00:00.000Z')).toBeNull()
  })

  it('muestra días restantes para fechas lejanas', () => {
    const future = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString()
    expect(getTimeRemainingLabel(future)).toMatch(/quedan \d+ día/i)
  })

  it('muestra horas restantes para menos de un día', () => {
    const future = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    expect(getTimeRemainingLabel(future)).toMatch(/quedan 5 h/i)
  })

  it('muestra minutos restantes para menos de una hora', () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    expect(getTimeRemainingLabel(future)).toMatch(/quedan 30 min/i)
  })
})

// ---------------------------------------------------------------------------
// isVotingClosed
// ---------------------------------------------------------------------------
describe('isVotingClosed', () => {
  it('retorna true si votingClosed es true explícitamente', () => {
    expect(isVotingClosed({ votingClosed: true })).toBe(true)
  })

  it('retorna false si votingClosed es false y deadline es futuro', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    expect(isVotingClosed({ votingClosed: false, deadline: future })).toBe(false)
  })

  it('retorna true si el deadline ya pasó', () => {
    expect(isVotingClosed({ deadline: '2020-01-01T00:00:00.000Z' })).toBe(true)
  })

  it('retorna false para objeto sin deadline ni votingClosed', () => {
    expect(isVotingClosed({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkStrongPassword
// ---------------------------------------------------------------------------
describe('checkStrongPassword', () => {
  it('aprueba contraseña con letras, números y 8+ caracteres', () => {
    expect(checkStrongPassword('Portal2024').ok).toBe(true)
  })

  it('rechaza contraseña muy corta', () => {
    const result = checkStrongPassword('Ab1')
    expect(result.ok).toBe(false)
    expect(result.hasLength).toBe(false)
  })

  it('rechaza contraseña sin números', () => {
    const result = checkStrongPassword('Contraseña')
    expect(result.ok).toBe(false)
    expect(result.hasNumber).toBe(false)
  })

  it('rechaza contraseña sin letras', () => {
    const result = checkStrongPassword('12345678')
    expect(result.ok).toBe(false)
    expect(result.hasLetter).toBe(false)
  })

  it('retorna ok:false para string vacío', () => {
    expect(checkStrongPassword('').ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isAdminLike
// ---------------------------------------------------------------------------
describe('isAdminLike', () => {
  it('retorna true para rol admin', () => {
    expect(isAdminLike({ role: 'admin' })).toBe(true)
  })

  it('retorna true para rol superadmin', () => {
    expect(isAdminLike({ role: 'superadmin' })).toBe(true)
  })

  it('retorna false para rol user', () => {
    expect(isAdminLike({ role: 'user' })).toBe(false)
  })

  it('retorna false para usuario null', () => {
    expect(isAdminLike(null)).toBe(false)
    expect(isAdminLike(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getAvatarById
// ---------------------------------------------------------------------------
describe('getAvatarById', () => {
  it('retorna el avatar correcto para ID válido', () => {
    const avatar = getAvatarById('dog')
    expect(avatar).not.toBeNull()
    expect(avatar.emoji).toBe('🐶')
  })

  it('retorna null para ID inexistente', () => {
    expect(getAvatarById('avatar-inexistente')).toBeNull()
  })

  it('retorna null para ID undefined', () => {
    expect(getAvatarById(undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// resolveAvatarDisplay
// ---------------------------------------------------------------------------
describe('resolveAvatarDisplay', () => {
  it('resuelve img: con manifest', () => {
    const d = resolveAvatarDisplay('img:x', {
      imageOptions: [{ id: 'x', src: 'https://example.com/a.png', label: 'A' }],
    })
    expect(d.kind).toBe('image')
    expect(d.src).toBe('https://example.com/a.png')
  })

  it('resuelve URL absoluta', () => {
    const d = resolveAvatarDisplay('https://ex.test/i.jpg')
    expect(d.kind).toBe('image')
    expect(d.src).toBe('https://ex.test/i.jpg')
  })

  it('resuelve emoji id', () => {
    const d = resolveAvatarDisplay('dog', { imageOptions: [] })
    expect(d.kind).toBe('emoji')
    expect(d.emoji).toBe('🐶')
  })
})

// ---------------------------------------------------------------------------
// telHrefFromDisplayPhone
// ---------------------------------------------------------------------------
describe('telHrefFromDisplayPhone', () => {
  it('genera href tel: a partir de número con espacios', () => {
    expect(telHrefFromDisplayPhone('+57 315 429 3038')).toBe('tel:+573154293038')
  })

  it('genera href tel: a partir de número con guiones', () => {
    expect(telHrefFromDisplayPhone('300-123-4567')).toBe('tel:+3001234567')
  })

  it('retorna null para teléfono vacío', () => {
    expect(telHrefFromDisplayPhone('')).toBeNull()
    expect(telHrefFromDisplayPhone(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// coerceSurveyOptionId
// ---------------------------------------------------------------------------
describe('coerceSurveyOptionId', () => {
  const options = [
    { id: 'opt-1', label: 'Sí' },
    { id: 'opt-2', label: 'No' },
  ]

  it('retorna el id del option que coincide', () => {
    expect(coerceSurveyOptionId(options, 'opt-1')).toBe('opt-1')
  })

  it('retorna el valor raw si no hay coincidencia', () => {
    expect(coerceSurveyOptionId(options, 'opt-99')).toBe('opt-99')
  })

  it('maneja options vacío o nulo', () => {
    expect(coerceSurveyOptionId([], 'opt-1')).toBe('opt-1')
    expect(coerceSurveyOptionId(null, 'opt-1')).toBe('opt-1')
  })
})

// ---------------------------------------------------------------------------
// toLocalDatetimeInputValue
// ---------------------------------------------------------------------------
describe('toLocalDatetimeInputValue', () => {
  it('retorna string con formato YYYY-MM-DDTHH:MM para fecha válida', () => {
    const d = new Date(2025, 0, 15, 10, 30) // 15 ene 2025 10:30
    const result = toLocalDatetimeInputValue(d)
    expect(result).toMatch(/^2025-01-15T10:30$/)
  })

  it('retorna string vacío para fecha inválida', () => {
    expect(toLocalDatetimeInputValue('no-es-fecha')).toBe('')
  })

  it('acepta timestamp numérico', () => {
    const ts = new Date(2025, 5, 1, 8, 0).getTime()
    const result = toLocalDatetimeInputValue(ts)
    expect(result).toMatch(/^2025-06-01T08:00$/)
  })
})

// ---------------------------------------------------------------------------
// requestPolishedText (async, usa Gemini mockeado)
// ---------------------------------------------------------------------------
describe('requestPolishedText', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna string vacío para texto vacío', async () => {
    expect(await requestPolishedText('fund_name', '')).toBe('')
    expect(await requestPolishedText('fund_name', '   ')).toBe('')
  })

  it('retorna el texto mejorado de Gemini', async () => {
    const result = await requestPolishedText('fund_name', 'poda de zonas verdes')
    expect(result).toBe('texto mejorado')
  })
})

// ---------------------------------------------------------------------------
// Cámara portada: encuesta histórica en iniciativas
// ---------------------------------------------------------------------------
describe('surveyOptionIsAffirmative', () => {
  const options = [
    { id: 1, text: 'Sí, ya tengo acceso' },
    { id: 2, text: 'No, aún no' },
  ]
  it('identifica Sí y No por texto', () => {
    expect(surveyOptionIsAffirmative(options, 1)).toBe(true)
    expect(surveyOptionIsAffirmative(options, 2)).toBe(false)
  })
})

describe('buildMergedCameraPortadaVoteMap', () => {
  it('usa initiative id desde tenant cuando está configurado', () => {
    const initiatives = [
      {
        id: 99,
        isProposal: false,
        title: 'Otro tema',
        survey: {
          question: '?',
          options: [
            { id: 'a', text: 'Sí' },
            { id: 'b', text: 'No' },
          ],
          votes: [{ lot: 'Lote1A', optionId: 'b', timestamp: 'x' }],
        },
      },
      {
        id: 7,
        isProposal: false,
        title: 'Cámara',
        survey: {
          question: '¿Acceso?',
          options: [
            { id: 1, text: 'Sí' },
            { id: 2, text: 'No' },
          ],
          votes: [{ lot: 'Lote2B', optionId: 1, timestamp: 'x' }],
        },
      },
    ]
    const map = buildMergedCameraPortadaVoteMap(initiatives, { cameraPortadaSurveyInitiativeIds: [7] })
    expect(map.get('LOTE2B')).toBe(true)
    expect(map.has('LOTE1A')).toBe(false)
  })

  it('resuelve usuario: prioridad al campo en perfil sobre encuesta', () => {
    const user = { lot: 'Lote3A', cameraPortadaAccess: false }
    const map = new Map([['LOTE3A', true]])
    expect(resolveCameraPortadaAccessFromStores(user, map)).toBe(false)
  })

  it('resuelve desde mapa si no hay campo en usuario', () => {
    const user = { lot: 'Lote3A' }
    const map = new Map([['LOTE3A', true]])
    expect(resolveCameraPortadaAccessFromStores(user, map)).toBe(true)
  })
})

describe('findCameraPortadaSurveyInitiatives (heurística)', () => {
  it('detecta iniciativa por texto cámara + portada y votos', () => {
    const initiatives = [
      {
        id: 1,
        isProposal: false,
        title: 'Encuesta portada',
        survey: {
          question: '¿Acceso a la cámara de la portada?',
          options: [
            { id: 10, text: 'Sí' },
            { id: 20, text: 'No' },
          ],
          votes: [{ lot: 'Lote5A', optionId: 20, timestamp: 't' }],
        },
      },
    ]
    const found = findCameraPortadaSurveyInitiatives(initiatives, { cameraPortadaSurveyInitiativeIds: [] })
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe(1)
    const map = buildMergedCameraPortadaVoteMap(initiatives, { cameraPortadaSurveyInitiativeIds: [] })
    expect(map.get('LOTE5A')).toBe(false)
  })
})
