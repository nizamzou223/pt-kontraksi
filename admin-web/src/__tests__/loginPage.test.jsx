// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react'

const h = vi.hoisted(() => ({ navigate: null, login: null, setUser: null, initialUser: null }))

vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }))
vi.mock('../services/supabaseClient', () => ({ supabaseUrl: 'x', supabaseAnonKey: 'y', default: {}, supabase: {} }))
vi.mock('../context/AuthContext', async () => {
  const React = await import('react')
  return {
    useAuth: () => {
      const [user, setUser] = React.useState(h.initialUser)
      h.setUser = setUser
      return { user, loading: false, login: (...args) => h.login(...args) }
    },
  }
})

import { ThemeProvider } from '../context/ThemeContext'
import { LanguageProvider } from '../context/LanguageContext'
import LoginPage from '../components/auth/LoginPage'

const mount = () => render(<ThemeProvider><LanguageProvider><LoginPage /></LanguageProvider></ThemeProvider>)
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const fill = () => {
  fireEvent.change(document.getElementById('login-email'), { target: { value: 'admin@kalipelus.com' } })
  fireEvent.change(document.getElementById('login-password'), { target: { value: 'Kalipelus2026' } })
}
const submit = () => fireEvent.submit(document.querySelector('form'))

beforeEach(() => {
  vi.useFakeTimers()
  h.navigate = vi.fn()
  h.initialUser = null
  localStorage.clear()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('LoginPage — animasi login BERHASIL', () => {
  it('layar sukses TETAP tampil walau listener auth mengisi `user` lebih dulu (balapan)', async () => {
    // Meniru jaringan nyata: listener selesai duluan → user terisi SEBELUM login() resolve
    h.login = vi.fn(async () => {
      h.setUser({ email: 'admin@kalipelus.com', role: 'admin' })
      await new Promise((r) => setTimeout(r, 80))   // login() baru selesai 80 ms SETELAH user terisi (siklus render berbeda)
      return { user: { email: 'admin@kalipelus.com', user_metadata: { nama_lengkap: 'Admin Utama' } } }
    })
    mount(); fill()
    await act(async () => { submit() })
    await advance(300)
    expect(h.navigate).not.toHaveBeenCalled()             // dulu: langsung pindah → animasi hilang
    expect(screen.getByText('Selamat Datang!')).toBeTruthy()
    expect(screen.getByText('Admin Utama')).toBeTruthy()
  })

  it('setelah animasi (3,2 dtk) baru pindah ke dashboard — sekali saja', async () => {
    h.login = vi.fn(async () => {
      h.setUser({ email: 'a@b.co', role: 'admin' })
      await new Promise((r) => setTimeout(r, 80))
      return { user: { email: 'a@b.co', user_metadata: {} } }
    })
    mount(); fill()
    await act(async () => { submit() })
    await advance(3_000)
    expect(h.navigate).not.toHaveBeenCalled()
    await advance(400)
    expect(h.navigate).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith('/')
  })

  it('user yang SUDAH login lalu membuka /login diarahkan langsung ke dashboard', async () => {
    h.initialUser = { email: 'a@b.co', role: 'admin' }
    h.login = vi.fn()
    mount()
    await advance(50)
    expect(h.navigate).toHaveBeenCalledWith('/')
  })
})

describe('LoginPage — animasi login GAGAL', () => {
  const failWith = (code) => {
    h.login = vi.fn(async () => { const e = new Error('x'); e.code = code; throw e })
  }

  it('menampilkan pesan error + getar seluruh form + fokus ke password', async () => {
    failWith('invalid_credentials')
    mount(); fill()
    await act(async () => { submit() })
    await advance(100)
    expect(screen.getByRole('alert').textContent).toMatch(/salah/i)
    expect(document.querySelector('.login-shake')).toBeTruthy()
    expect(document.querySelector('.lp-alert-icon')).toBeTruthy()          // ikon bergoyang
    expect(document.querySelector('.lp-field-error')).toBeTruthy()         // kolom berdenyut merah
    expect(document.activeElement.id).toBe('login-password')
    expect(h.navigate).not.toHaveBeenCalled()
    expect(screen.queryByText('Selamat Datang!')).toBeNull()
  })

  it('getar berhenti setelah selesai dan bisa berulang pada percobaan berikutnya', async () => {
    failWith('invalid_credentials')
    mount(); fill()
    await act(async () => { submit() })
    await advance(100)
    expect(document.querySelector('.login-shake')).toBeTruthy()
    await advance(800)
    expect(document.querySelector('.login-shake')).toBeNull()
    await act(async () => { submit() })
    await advance(100)
    expect(document.querySelector('.login-shake')).toBeTruthy()            // muncul lagi
  })

  it('setelah gagal, login berikutnya yang sukses tetap menampilkan layar sukses', async () => {
    failWith('invalid_credentials')
    mount(); fill()
    await act(async () => { submit() })
    await advance(100)
    h.login = vi.fn(async () => {
      h.setUser({ email: 'a@b.co', role: 'admin' })
      return { user: { email: 'a@b.co', user_metadata: { nama_lengkap: 'Budi' } } }
    })
    await act(async () => { submit() })
    await advance(300)
    expect(h.navigate).not.toHaveBeenCalled()
    expect(screen.getByText('Selamat Datang!')).toBeTruthy()
  })

  it('field kosong: pesan wajib diisi + getar, tanpa memanggil login()', async () => {
    h.login = vi.fn()
    mount()
    await act(async () => { submit() })
    await advance(100)
    expect(h.login).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/wajib diisi/i)
    expect(document.querySelector('.login-shake')).toBeTruthy()
  })

  it('pesan error mengikuti bahasa (Inggris)', async () => {
    localStorage.setItem('lang_code', 'en')
    failWith('rate_limit')
    mount(); fill()
    await act(async () => { submit() })
    await advance(100)
    expect(screen.getByRole('alert').textContent).toMatch(/Too many sign-in attempts/)
  })
})
