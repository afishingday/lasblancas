import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginView from '../features/login/LoginView.jsx'

vi.mock('../firestore/portalData.js', () => ({
  updateUserPlainPassword: vi.fn().mockResolvedValue(undefined),
}))

const mockDb = {
  users: [
    { lot: 'Lote1A', password: 'Pass1234', role: 'user', blocked: false },
    { lot: 'Lote2B', password: 'Admin456', role: 'admin', blocked: false },
    { lot: 'Lote3C', password: 'Pass1234', role: 'user', blocked: true },
  ],
}

const renderLogin = (onLogin = vi.fn()) => {
  return render(<LoginView db={mockDb} onLogin={onLogin} />)
}

describe('LoginView — pantalla de ingreso', () => {
  it('muestra el título del portal', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: /Portal Comunitario Las Blancas/i })).toBeInTheDocument()
  })

  it('muestra el campo de usuario y contraseña', () => {
    renderLogin()
    expect(screen.getByPlaceholderText(/Usuario/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Contraseña/i)).toBeInTheDocument()
  })

  it('muestra error cuando el usuario no existe', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText(/Usuario/i), 'LoteInexistente')
    await user.type(screen.getByPlaceholderText(/Contraseña/i), 'cualquiera')
    await user.click(screen.getByRole('button', { name: /Ingresar al Portal/i }))

    expect(screen.getByText(/Usuario no encontrado/i)).toBeInTheDocument()
  })

  it('muestra error cuando la contraseña es incorrecta', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText(/Usuario/i), 'Lote1A')
    await user.type(screen.getByPlaceholderText(/Contraseña/i), 'clave-incorrecta')
    await user.click(screen.getByRole('button', { name: /Ingresar al Portal/i }))

    expect(screen.getByText(/Contraseña incorrecta/i)).toBeInTheDocument()
  })

  it('muestra error cuando el usuario está bloqueado', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText(/Usuario/i), 'Lote3C')
    await user.type(screen.getByPlaceholderText(/Contraseña/i), 'Pass1234')
    await user.click(screen.getByRole('button', { name: /Ingresar al Portal/i }))

    expect(screen.getByText(/bloqueado/i)).toBeInTheDocument()
  })

  it('llama a onLogin con los datos correctos al ingresar exitosamente', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn()
    renderLogin(onLogin)

    await user.type(screen.getByPlaceholderText(/Usuario/i), 'Lote1A')
    await user.type(screen.getByPlaceholderText(/Contraseña/i), 'Pass1234')
    await user.click(screen.getByRole('button', { name: /Ingresar al Portal/i }))

    expect(onLogin).toHaveBeenCalledOnce()
    expect(onLogin).toHaveBeenCalledWith(
      expect.objectContaining({ lotNumber: 'Lote1A', role: 'user' }),
    )
  })

  it('login es insensible a mayúsculas en el nombre del lote', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn()
    renderLogin(onLogin)

    await user.type(screen.getByPlaceholderText(/Usuario/i), 'lote1a')
    await user.type(screen.getByPlaceholderText(/Contraseña/i), 'Pass1234')
    await user.click(screen.getByRole('button', { name: /Ingresar al Portal/i }))

    expect(onLogin).toHaveBeenCalledOnce()
  })
})

describe('LoginView — modo cambiar contraseña', () => {
  it('cambia al modo de cambio de contraseña al hacer click en el enlace', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByText(/¿Quieres cambiar tu contraseña\?/i))

    expect(screen.getByText('Cambiar contraseña')).toBeInTheDocument()
    expect(screen.getByText(/Volver al ingreso/i)).toBeInTheDocument()
  })

  it('regresa al modo de login al hacer click en "Volver al ingreso"', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByText(/¿Quieres cambiar tu contraseña\?/i))
    await user.click(screen.getByText(/Volver al ingreso/i))

    expect(screen.getByRole('button', { name: /Ingresar al Portal/i })).toBeInTheDocument()
  })
})
