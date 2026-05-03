import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileView from '../features/profile/ProfileView.jsx'

vi.mock('../firestore/portalData.js', () => ({
  updateUserPlainPassword: vi.fn().mockResolvedValue(undefined),
  updateUserProfile: vi.fn().mockResolvedValue(undefined),
  forceUserPlainPassword: vi.fn().mockResolvedValue(undefined),
  setUserBlockedStatus: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../portalSession.js', () => ({
  savePortalSession: vi.fn(),
}))

const REGULAR_USER = { lotNumber: 'Lote1A', shortLot: 'L1A', role: 'user' }

const MOCK_DB = {
  users: [
    { lot: 'Lote1A', role: 'user', blocked: false, fincaName: 'La Esperanza', avatar: 'dog' },
    { lot: 'Lote2B', role: 'admin', blocked: false },
    { lot: 'Lote3C', role: 'user', blocked: true },
  ],
}

const defaultProps = (overrides = {}) => ({
  currentUser: REGULAR_USER,
  db: MOCK_DB,
  showAlert: vi.fn(),
  logAction: vi.fn(),
  ...overrides,
})

describe('ProfileView — pantalla principal', () => {
  it('muestra el encabezado "Perfil"', () => {
    render(<ProfileView {...defaultProps()} />)
    expect(screen.getByRole('heading', { name: /Perfil/i })).toBeInTheDocument()
  })

  it('muestra el número de lote del usuario', () => {
    render(<ProfileView {...defaultProps()} />)
    expect(screen.getByText(/Lote1A/i)).toBeInTheDocument()
  })

  it('muestra el campo de nombre de finca', () => {
    render(<ProfileView {...defaultProps()} />)
    expect(screen.getByPlaceholderText(/La Esperanza/i)).toBeInTheDocument()
  })

  it('pre-carga el nombre de finca existente', () => {
    render(<ProfileView {...defaultProps()} />)
    expect(screen.getByDisplayValue('La Esperanza')).toBeInTheDocument()
  })

  it('muestra los botones de categoría de avatar', () => {
    render(<ProfileView {...defaultProps()} />)
    expect(screen.getByRole('button', { name: /animales/i })).toBeInTheDocument()
  })

  it('muestra el botón "Guardar perfil"', () => {
    render(<ProfileView {...defaultProps()} />)
    expect(screen.getByRole('button', { name: /Guardar perfil/i })).toBeInTheDocument()
  })
})

describe('ProfileView — cambio de contraseña inline', () => {
  it('muestra los campos de cambio de contraseña', () => {
    render(<ProfileView {...defaultProps()} />)
    const currentFields = screen.getAllByPlaceholderText(/Contraseña actual/i)
    expect(currentFields.length).toBeGreaterThan(0)
    const newFields = screen.getAllByPlaceholderText(/^Nueva contraseña$/)
    expect(newFields.length).toBeGreaterThan(0)
  })

  it('llama a showAlert si las contraseñas no coinciden', async () => {
    const user = userEvent.setup()
    const showAlert = vi.fn()
    render(<ProfileView {...defaultProps({ showAlert })} />)

    await user.type(screen.getAllByPlaceholderText(/Contraseña actual/i)[0], 'Pass1234')
    await user.type(screen.getAllByPlaceholderText(/^Nueva contraseña$/)[0], 'NuevaClave1')
    await user.type(screen.getAllByPlaceholderText(/Repetir nueva contraseña/i)[0], 'NuevaClave2')
    await user.click(screen.getByRole('button', { name: /Guardar nueva contraseña/i }))

    expect(showAlert).toHaveBeenCalledWith(expect.stringMatching(/no coinciden/i))
  })

  it('llama a showAlert si la nueva contraseña es débil', async () => {
    const user = userEvent.setup()
    const showAlert = vi.fn()
    render(<ProfileView {...defaultProps({ showAlert })} />)

    await user.type(screen.getAllByPlaceholderText(/Contraseña actual/i)[0], 'Pass1234')
    await user.type(screen.getAllByPlaceholderText(/^Nueva contraseña$/)[0], 'abc')
    await user.type(screen.getAllByPlaceholderText(/Repetir nueva contraseña/i)[0], 'abc')
    await user.click(screen.getByRole('button', { name: /Guardar nueva contraseña/i }))

    expect(showAlert).toHaveBeenCalledWith(expect.stringMatching(/mínimo 8 caracteres/i))
  })
})

describe('ProfileView — guardado de perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama a updateUserProfile al guardar el perfil', async () => {
    const portalData = await import('../firestore/portalData.js')
    const user = userEvent.setup()
    const showAlert = vi.fn()
    render(<ProfileView {...defaultProps({ showAlert })} />)

    const input = screen.getByPlaceholderText(/La Esperanza/i)
    await user.clear(input)
    await user.type(input, 'Nueva Finca')
    await user.click(screen.getByRole('button', { name: /Guardar perfil/i }))

    await waitFor(() => expect(portalData.updateUserProfile).toHaveBeenCalled())
    expect(portalData.updateUserProfile).toHaveBeenCalledWith(
      'Lote1A',
      expect.objectContaining({ fincaName: 'Nueva Finca' }),
    )
  })

  it('muestra alerta de éxito al guardar el perfil', async () => {
    const user = userEvent.setup()
    const showAlert = vi.fn()
    render(<ProfileView {...defaultProps({ showAlert })} />)

    await user.click(screen.getByRole('button', { name: /Guardar perfil/i }))

    await waitFor(() =>
      expect(showAlert).toHaveBeenCalledWith(expect.stringMatching(/Perfil actualizado/i)),
    )
  })
})
