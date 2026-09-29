// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({ setUser: null, calls: 0, anonDenied: true, authed: false }))

// Meniru database SETELAH RLS: permintaan tanpa login ditolak, dengan login mengembalikan proyek.
vi.mock('../services/supabaseClient', () => {
  const chain = () => new Proxy({}, {
    get(_t, p) {
      if (p === 'then') return (res) => {
        h.calls++
        const out = h.authed ? { data: [{ id: 5, nama_project: 'Gedung A', kode_project: 'A', status_project: 'aktif' }], error: null } : { data: null, error: { message: 'permission denied for table project' } }
        return Promise.resolve(out).then(res)
      }
      return () => chain()
    },
  })
  const client = { from: () => chain() }
  return { default: client, supabase: client }
})
vi.mock('../context/AuthContext', async () => {
  const React = await import('react')
  return { useAuth: () => { const [user, setUser] = React.useState(null); h.setUser = setUser; return { user, loading: false } } }
})

import { ProjectProvider, useProject } from '../context/ProjectContext'

function Probe() {
  const { projects, activeProject } = useProject()
  return <div data-testid="p">{`n=${projects.length};aktif=${activeProject?.nama_project ?? '-'}`}</div>
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(50) })
const mount = () => render(<ProjectProvider><Probe /></ProjectProvider>)

beforeEach(() => { vi.useFakeTimers(); h.calls = 0; h.authed = false; localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('ProjectProvider — proyek dimuat SETELAH login (regresi RLS)', () => {
  it('sebelum login tidak melakukan permintaan (yang pasti ditolak RLS)', async () => {
    mount(); await flush()
    expect(h.calls).toBe(0)
    expect(screen.getByTestId('p').textContent).toBe('n=0;aktif=-')
  })

  it('login lewat halaman (tanpa reload) → proyek dimuat & proyek aktif terpilih', async () => {
    mount(); await flush()
    h.authed = true
    act(() => h.setUser({ email: 'admin@kalipelus.com', role: 'admin' }))
    await flush()
    expect(screen.getByTestId('p').textContent).toBe('n=1;aktif=Gedung A')      // dulu: n=0 → navbar "Pilih Project"
    expect(localStorage.getItem('kp_active_project_id')).toBe('5')
  })

  it('logout mengosongkan proyek (tidak membocorkan data akun sebelumnya)', async () => {
    mount(); await flush()
    h.authed = true
    act(() => h.setUser({ email: 'a@b.co' })); await flush()
    expect(screen.getByTestId('p').textContent).toBe('n=1;aktif=Gedung A')
    act(() => h.setUser(null)); await flush()
    expect(screen.getByTestId('p').textContent).toBe('n=0;aktif=-')
  })

  it('sesi yang sudah ada saat aplikasi dibuka (reload) langsung memuat proyek', async () => {
    h.authed = true
    const { rerender } = mount()
    act(() => h.setUser({ email: 'a@b.co' })); await flush()
    rerender(<ProjectProvider><Probe /></ProjectProvider>); await flush()
    expect(screen.getByTestId('p').textContent).toContain('Gedung A')
  })

  it('akun berganti → proyek dimuat ulang', async () => {
    h.authed = true
    mount(); await flush()
    act(() => h.setUser({ email: 'a@b.co' })); await flush()
    const before = h.calls
    act(() => h.setUser({ email: 'c@d.co' })); await flush()
    expect(h.calls).toBeGreaterThan(before)
  })
})
