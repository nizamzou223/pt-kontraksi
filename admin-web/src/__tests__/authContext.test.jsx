// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ authCb: null, fromSpy: null, signOut: null, row: null }))

vi.mock('../services/supabaseClient', () => {
  h.fromSpy = vi.fn()
  h.signOut = vi.fn(async () => ({}))
  const chain = () => ({ select: () => chain(), eq: () => chain(), maybeSingle: async () => ({ data: h.row, error: null }) })
  const client = {
    from: (t) => { h.fromSpy(t); return chain() },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: '1', email: 'admin@kalipelus.com' } } } }),
      onAuthStateChange: (cb) => { h.authCb = cb; return { data: { subscription: { unsubscribe() {} } } } },
      signOut: h.signOut,
    },
  }
  return { default: client, supabase: client }
})

import { AuthProvider, useAuth } from '../context/AuthContext'

function Probe() {
  const { user, loading } = useAuth()
  return <div data-testid="p">{loading ? 'loading' : user ? `user:${user.email}` : 'anon'}</div>
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(50) })

beforeEach(() => {
  vi.useFakeTimers()
  h.fromSpy.mockClear(); h.signOut.mockClear()
  h.row = { email: 'admin@kalipelus.com', role: 'admin', status_aktif: true }
})
afterEach(() => { cleanup(); vi.useRealTimers() })

async function mountLoggedIn() {
  render(<AuthProvider><Probe /></AuthProvider>)
  await flush()
  expect(screen.getByTestId('p').textContent).toBe('user:admin@kalipelus.com')
  h.fromSpy.mockClear()
}

describe('AuthContext — tidak macet saat tab dibuka kembali', () => {
  it('callback onAuthStateChange TIDAK mengembalikan Promise (async di dalamnya = deadlock Supabase)', async () => {
    await mountLoggedIn()
    const ret = h.authCb('SIGNED_IN', { user: { id: '1', email: 'admin@kalipelus.com' } })
    expect(ret).toBeUndefined()
    expect(h.authCb.constructor.name).not.toBe('AsyncFunction')
  })

  it('SIGNED_IN untuk user yang SAMA (terjadi tiap tab kembali aktif) → tidak query ulang', async () => {
    await mountLoggedIn()
    for (let i = 0; i < 5; i++) h.authCb('SIGNED_IN', { user: { id: '1', email: 'ADMIN@kalipelus.com' } })
    await flush()
    expect(h.fromSpy).not.toHaveBeenCalled()
  })

  it('TOKEN_REFRESHED untuk user yang sama → tidak query ulang', async () => {
    await mountLoggedIn()
    h.authCb('TOKEN_REFRESHED', { user: { id: '1', email: 'admin@kalipelus.com' } })
    await flush()
    expect(h.fromSpy).not.toHaveBeenCalled()
  })

  it('SIGNED_IN user BERBEDA → profil diambil di LUAR callback (ditunda)', async () => {
    await mountLoggedIn()
    h.row = { email: 'hrd@kalipelus.com', role: 'hr', status_aktif: true }
    h.authCb('SIGNED_IN', { user: { id: '2', email: 'hrd@kalipelus.com' } })
    expect(h.fromSpy).not.toHaveBeenCalled()      // belum ada query di dalam callback
    await flush()
    expect(h.fromSpy).toHaveBeenCalledWith('users')
    expect(screen.getByTestId('p').textContent).toBe('user:hrd@kalipelus.com')
  })

  it('SIGNED_OUT mengosongkan user', async () => {
    await mountLoggedIn()
    act(() => { h.authCb('SIGNED_OUT', null) })
    await flush()
    expect(screen.getByTestId('p').textContent).toBe('anon')
  })

  it('akun tidak berhak (mandor) yang login belakangan tetap ditolak & di-sign-out (fail-closed)', async () => {
    await mountLoggedIn()
    h.row = { email: 'mandor@kalipelus.com', role: 'mandor', status_aktif: true }
    h.authCb('SIGNED_IN', { user: { id: '3', email: 'mandor@kalipelus.com' } })
    await flush()
    expect(h.signOut).toHaveBeenCalled()
    expect(screen.getByTestId('p').textContent).toBe('anon')
  })
})
