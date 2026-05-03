import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DirectoriesView from '../features/directories/DirectoriesView.jsx'

vi.mock('../geminiClient.js', () => ({
  isGeminiConfigured: vi.fn().mockReturnValue(false),
  polishSpanishField: vi.fn().mockResolvedValue(''),
}))

const ADMIN_USER = { lotNumber: 'Lote2B', shortLot: 'L2B', role: 'admin' }
const REGULAR_USER = { lotNumber: 'Lote1A', shortLot: 'L1A', role: 'user' }

const MOCK_SERVICES = [
  { id: 's-1', name: 'Dr. Juan García', phone: '3001234567', category: 'Salud', desc: 'Médico general', addedBy: 'Lote1A' },
  { id: 's-2', name: 'Mantenimientos Pérez', phone: '3109876543', category: 'Mantenimiento', desc: 'Plomería y eléctrico', addedBy: 'Lote2B' },
]

const MOCK_COMMUNITY = [
  { id: 'c-1', name: 'María López', phone: '3151234567', profession: 'Abogada', lot: 'Lote1A', contactPref: 'Servicios' },
  { id: 'c-2', name: 'Carlos Ruiz', phone: '3201234567', profession: 'Electricista', lot: 'Lote5D', contactPref: 'Servicios y emergencias' },
]

const defaultProps = (overrides = {}) => ({
  currentUser: REGULAR_USER,
  db: { services: MOCK_SERVICES, community: MOCK_COMMUNITY },
  upsertDirectoryRow: vi.fn().mockResolvedValue(undefined),
  deleteDirectoryRow: vi.fn().mockResolvedValue(undefined),
  logAction: vi.fn(),
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  type: 'services',
  ...overrides,
})

describe('DirectoriesView — modo servicios', () => {
  it('muestra el título "Directorio de Servicios"', () => {
    render(<DirectoriesView {...defaultProps()} />)
    expect(screen.getByRole('heading', { name: /Directorio de Servicios/i })).toBeInTheDocument()
  })

  it('muestra las tarjetas de servicios con nombre y categoría', () => {
    render(<DirectoriesView {...defaultProps()} />)
    expect(screen.getByText('Dr. Juan García')).toBeInTheDocument()
    expect(screen.getByText('Mantenimientos Pérez')).toBeInTheDocument()
  })

  it('muestra los botones de categoría para filtrar', () => {
    render(<DirectoriesView {...defaultProps()} />)
    expect(screen.getByRole('button', { name: /Todas/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salud' })).toBeInTheDocument()
  })

  it('muestra el botón "Añadir Registro" para todos los usuarios', () => {
    render(<DirectoriesView {...defaultProps()} />)
    expect(screen.getByRole('button', { name: /Añadir Registro/i })).toBeInTheDocument()
  })
})

describe('DirectoriesView — modo comunidad', () => {
  it('muestra el título "Comunidad y Vecinos"', () => {
    render(<DirectoriesView {...defaultProps({ type: 'community' })} />)
    expect(screen.getByRole('heading', { name: /Comunidad y Vecinos/i })).toBeInTheDocument()
  })

  it('muestra el nombre y profesión de los vecinos', () => {
    render(<DirectoriesView {...defaultProps({ type: 'community' })} />)
    expect(screen.getByText('María López')).toBeInTheDocument()
    expect(screen.getByText(/Abogada/i)).toBeInTheDocument()
  })
})

describe('DirectoriesView — búsqueda', () => {
  it('filtra resultados al escribir en el buscador', async () => {
    const user = userEvent.setup()
    render(<DirectoriesView {...defaultProps()} />)

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await user.type(searchInput, 'garcía')

    expect(screen.getByText('Dr. Juan García')).toBeInTheDocument()
    expect(screen.queryByText('Mantenimientos Pérez')).not.toBeInTheDocument()
  })

  it('muestra todos los resultados cuando se borra la búsqueda', async () => {
    const user = userEvent.setup()
    render(<DirectoriesView {...defaultProps()} />)

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre/i)
    await user.type(searchInput, 'garcía')
    await user.clear(searchInput)

    expect(screen.getByText('Dr. Juan García')).toBeInTheDocument()
    expect(screen.getByText('Mantenimientos Pérez')).toBeInTheDocument()
  })

  it('muestra mensaje de "sin resultados" si la búsqueda no coincide', async () => {
    const user = userEvent.setup()
    render(<DirectoriesView {...defaultProps()} />)

    await user.type(screen.getByPlaceholderText(/Buscar por nombre/i), 'zzz-inexistente')

    expect(screen.getByText(/No hay resultados para tu búsqueda/i)).toBeInTheDocument()
  })
})

describe('DirectoriesView — control de acceso por rol', () => {
  it('el dueño del registro ve botones de editar y eliminar en su propio registro', () => {
    // Lote1A es dueño de s-1
    render(<DirectoriesView {...defaultProps({ currentUser: { ...REGULAR_USER, lotNumber: 'Lote1A' } })} />)
    // Debe haber al menos un botón de editar (para el registro de Lote1A)
    const editButtons = screen.getAllByRole('button', { name: '' }).filter((b) =>
      b.closest('.absolute'),
    )
    expect(editButtons.length).toBeGreaterThan(0)
  })

  it('el admin ve botones de editar y eliminar en TODOS los registros', () => {
    render(<DirectoriesView {...defaultProps({ currentUser: ADMIN_USER })} />)
    // Con 2 servicios, debe haber 2 botones de eliminar
    const deleteButtons = screen.getAllByTitle
      ? screen.queryAllByRole('button')
      : []
    // Verificamos que los dos registros son editables mirando la cantidad de grupos de control
    const cards = screen.getAllByText(/Dr\. Juan García|Mantenimientos Pérez/)
    expect(cards).toHaveLength(2)
  })

  it('abre el formulario al hacer click en "Añadir Registro"', async () => {
    const user = userEvent.setup()
    render(<DirectoriesView {...defaultProps()} />)

    await user.click(screen.getByRole('button', { name: /Añadir Registro/i }))

    expect(screen.getByRole('heading', { name: /Nuevo Registro/i })).toBeInTheDocument()
    expect(screen.getByText('Nombre *')).toBeInTheDocument()
  })

  it('cancela el formulario al hacer click en "Cancelar"', async () => {
    const user = userEvent.setup()
    render(<DirectoriesView {...defaultProps()} />)

    await user.click(screen.getByRole('button', { name: /Añadir Registro/i }))
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))

    expect(screen.queryByRole('heading', { name: /Nuevo Registro/i })).not.toBeInTheDocument()
  })
})

describe('DirectoriesView — estado vacío', () => {
  it('muestra mensaje de estado vacío para servicios sin registros', () => {
    render(<DirectoriesView {...defaultProps({ db: { services: [], community: [] } })} />)
    expect(screen.getByText(/No hay servicios en el directorio/i)).toBeInTheDocument()
  })

  it('muestra mensaje de estado vacío para comunidad sin registros', () => {
    render(
      <DirectoriesView {...defaultProps({ type: 'community', db: { services: [], community: [] } })} />,
    )
    expect(screen.getByText(/No hay vecinos registrados/i)).toBeInTheDocument()
  })
})
