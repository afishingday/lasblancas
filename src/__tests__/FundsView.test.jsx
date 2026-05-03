import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FundsView from '../features/funds/FundsView.jsx'

vi.mock('../analytics.js', () => ({ trackPortalEvent: vi.fn() }))
vi.mock('../geminiClient.js', () => ({
  isGeminiConfigured: vi.fn().mockReturnValue(false),
  fetchGeminiProjectDescriptionFromTitle: vi.fn().mockResolvedValue(null),
  getLastGeminiDetail: vi.fn().mockReturnValue(''),
  requestPolishedText: vi.fn().mockResolvedValue(''),
}))
vi.mock('../firestore/uploadEntityImage.js', () => ({
  uploadEntityCoverImage: vi.fn().mockResolvedValue('https://img.test/cover.jpg'),
  MAX_ENTITY_IMAGE_BYTES: 512 * 1024,
}))
vi.mock('../firestore/uploadNewsImage.js', () => ({
  isNewsFallbackImageUrl: vi.fn().mockReturnValue(false),
  MAX_IMAGE_SOURCE_BYTES: 15 * 1024 * 1024,
}))
vi.mock('../fundHistoricRaised.js', () => ({
  sumFundsRaisedTotal: vi.fn().mockReturnValue(7500000),
}))

const ADMIN_USER = { lotNumber: 'Lote2B', shortLot: 'L2B', role: 'admin' }
const REGULAR_USER = { lotNumber: 'Lote1A', shortLot: 'L1A', role: 'user' }

const MOCK_FUND = {
  id: 'fp-001',
  name: 'Poda de zonas verdes',
  description: 'Mantenimiento de las áreas comunes del conjunto.',
  goal: 5000000,
  raised: 2500000,
  status: 'En recolección de fondos',
  requiresBudget: true,
  date: '15/01/2025',
}

const defaultProps = (overrides = {}) => ({
  currentUser: REGULAR_USER,
  db: { funds: [] },
  updateFundStatus: vi.fn().mockResolvedValue(undefined),
  updateFundRaisedGoal: vi.fn().mockResolvedValue(undefined),
  addFund: vi.fn().mockResolvedValue(undefined),
  deleteFund: vi.fn().mockResolvedValue(undefined),
  logAction: vi.fn(),
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
  openNewsComposerFromFund: vi.fn(),
  ...overrides,
})

describe('FundsView — estado vacío', () => {
  it('muestra mensaje de estado vacío cuando no hay proyectos', () => {
    render(<FundsView {...defaultProps()} />)
    expect(screen.getByText(/No hay proyectos ni fondos registrados/i)).toBeInTheDocument()
  })

  it('muestra el encabezado "Proyectos y Fondos"', () => {
    render(<FundsView {...defaultProps()} />)
    expect(screen.getByRole('heading', { name: /Proyectos y Fondos/i })).toBeInTheDocument()
  })

  it('muestra el recaudo total calculado', () => {
    render(<FundsView {...defaultProps()} />)
    expect(screen.getByText(/Recaudo total registrado en proyectos/i)).toBeInTheDocument()
  })
})

describe('FundsView — control de acceso por rol', () => {
  it('el admin ve el botón "Crear Proyecto"', () => {
    render(<FundsView {...defaultProps({ currentUser: ADMIN_USER })} />)
    expect(screen.getByRole('button', { name: /Crear Proyecto/i })).toBeInTheDocument()
  })

  it('el usuario regular NO ve el botón "Crear Proyecto"', () => {
    render(<FundsView {...defaultProps({ currentUser: REGULAR_USER })} />)
    expect(screen.queryByRole('button', { name: /Crear Proyecto/i })).not.toBeInTheDocument()
  })

  it('el admin ve botones de editar y eliminar en cada proyecto', () => {
    render(<FundsView {...defaultProps({ currentUser: ADMIN_USER, db: { funds: [MOCK_FUND] } })} />)
    expect(screen.getByRole('button', { name: /Editar proyecto/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Eliminar proyecto/i })).toBeInTheDocument()
  })

  it('el usuario regular NO ve botones de editar ni eliminar', () => {
    render(<FundsView {...defaultProps({ currentUser: REGULAR_USER, db: { funds: [MOCK_FUND] } })} />)
    expect(screen.queryByRole('button', { name: /Editar proyecto/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar proyecto/i })).not.toBeInTheDocument()
  })
})

describe('FundsView — tarjeta de proyecto', () => {
  it('muestra el nombre y descripción del proyecto', () => {
    render(<FundsView {...defaultProps({ db: { funds: [MOCK_FUND] } })} />)
    expect(screen.getByText('Poda de zonas verdes')).toBeInTheDocument()
    expect(screen.getByText(/Mantenimiento de las áreas comunes/i)).toBeInTheDocument()
  })

  it('muestra el estado del proyecto para el usuario regular', () => {
    render(<FundsView {...defaultProps({ db: { funds: [MOCK_FUND] } })} />)
    expect(screen.getByText(/En recolección de fondos/i)).toBeInTheDocument()
  })

  it('muestra la fecha de publicación del proyecto', () => {
    render(<FundsView {...defaultProps({ db: { funds: [MOCK_FUND] } })} />)
    expect(screen.getByText(/15\/01\/2025/i)).toBeInTheDocument()
  })
})

describe('FundsView — acciones del admin', () => {
  it('abre el formulario de creación al hacer click en "Crear Proyecto"', async () => {
    const user = userEvent.setup()
    render(<FundsView {...defaultProps({ currentUser: ADMIN_USER })} />)

    await user.click(screen.getByRole('button', { name: /Crear Proyecto/i }))

    expect(screen.getByText(/Nuevo Proyecto o Fondo/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Ej: Poda de zonas verdes/i)).toBeInTheDocument()
  })

  it('muestra el diálogo de confirmación al eliminar un proyecto', async () => {
    const user = userEvent.setup()
    const showConfirm = vi.fn()
    render(
      <FundsView
        {...defaultProps({ currentUser: ADMIN_USER, db: { funds: [MOCK_FUND] }, showConfirm })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Eliminar proyecto/i }))

    expect(showConfirm).toHaveBeenCalledOnce()
    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Poda de zonas verdes'),
      expect.any(Function),
    )
  })

  it('muestra formulario en modo edición al hacer click en "Editar proyecto"', async () => {
    const user = userEvent.setup()
    render(<FundsView {...defaultProps({ currentUser: ADMIN_USER, db: { funds: [MOCK_FUND] } })} />)

    await user.click(screen.getByRole('button', { name: /Editar proyecto/i }))

    expect(screen.getByText(/Editar Proyecto o Fondo/i)).toBeInTheDocument()
    // El nombre del fondo debe pre-cargarse en el formulario
    expect(screen.getByDisplayValue('Poda de zonas verdes')).toBeInTheDocument()
  })

  it('llama a addFund al enviar el formulario de creación con datos válidos', async () => {
    const user = userEvent.setup()
    const addFund = vi.fn().mockResolvedValue(undefined)
    render(<FundsView {...defaultProps({ currentUser: ADMIN_USER, addFund })} />)

    await user.click(screen.getByRole('button', { name: /Crear Proyecto/i }))
    await user.type(screen.getByPlaceholderText(/Ej: Poda de zonas verdes/i), 'Arreglo de vías')
    await user.type(
      screen.getByPlaceholderText(/Describe el alcance/i),
      'Mantenimiento de las vías internas.',
    )
    await user.type(screen.getByPlaceholderText('2000000'), '8000000')
    await user.click(screen.getByRole('button', { name: /Crear proyecto/i }))

    await waitFor(() => expect(addFund).toHaveBeenCalledOnce())
    expect(addFund).toHaveBeenCalledWith(expect.objectContaining({ name: 'Arreglo de vías' }))
  })
})
