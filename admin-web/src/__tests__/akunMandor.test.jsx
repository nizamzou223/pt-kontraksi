// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { isJabatanMandor, peranAkunUntukJabatan, peranBawaan } from '../utils/akunMobile'

const h = vi.hoisted(() => ({ signUp: vi.fn(), usersInsert: vi.fn(), created: vi.fn() }))

vi.mock('../services/supabaseClient', () => {
  const chain = () => new Proxy({}, {
    get(_t, p) {
      if (p === 'then') return (res) => Promise.resolve({ data: null, error: null }).then(res)
      if (p === 'maybeSingle') return () => Promise.resolve({ data: null, error: null })
      if (p === 'insert') return (row) => { h.usersInsert(row); return chain() }
      return () => chain()
    },
  })
  const client = { from: () => chain(), auth: { signUp: (...a) => { h.signUp(...a); return Promise.resolve({ error: null }) } } }
  return { default: client, supabase: client }
})
vi.mock('../services/projectService', () => ({
  projectService: {
    getKaryawan: async () => [],
    getJabatan: async () => [
      { id: 1, nama_jabatan: 'Tukang Batu' },
      { id: 2, nama_jabatan: 'Mandor Proyek' },
      { id: 3, nama_jabatan: 'Mandor Gudang' },
      { id: 4, nama_jabatan: 'Mandor' },
    ],
    getDepartemen: async () => [],
    createKaryawan: async (p) => { h.created(p); return { id: 99 } },
  },
}))
vi.mock('../services/exportService', () => ({ exportService: {} }))

import KaryawanList from '../components/masterdata/KaryawanList'

describe('aturan akun mandor (util)', () => {
  it('hanya jabatan mandor yang boleh punya akun', () => {
    expect(isJabatanMandor('Mandor Proyek')).toBe(true)
    expect(isJabatanMandor('mandor')).toBe(true)
    expect(isJabatanMandor('Tukang Batu')).toBe(false)
    expect(isJabatanMandor('Pekerja Harian')).toBe(false)
    expect(isJabatanMandor(undefined)).toBe(false)
    expect(peranAkunUntukJabatan('Tukang Batu')).toEqual([])
    expect(peranBawaan('Tukang Batu')).toBeNull()
  })
  it('peran mengikuti nama jabatan', () => {
    expect(peranAkunUntukJabatan('Mandor Gudang')).toEqual(['mandor_gudang'])
    expect(peranAkunUntukJabatan('Mandor Proyek')).toEqual(['mandor'])
    expect(peranAkunUntukJabatan('Mandor')).toEqual(['mandor', 'mandor_gudang'])
  })
})

// Pembuatan akun mobile HANYA lewat Pengaturan → Akun Mobile (Mandor) — lihat
// MandorManagement.jsx. Form Tambah Karyawan tidak lagi membuat akun sama sekali,
// untuk menghindari dua jalur yang mudah membingungkan (satu sumber kebenaran).
describe('form Tambah Karyawan — tidak ada lagi bagian akun', () => {
  beforeEach(() => { h.signUp.mockClear(); h.usersInsert.mockClear(); h.created.mockClear() })
  afterEach(cleanup)

  const bukaForm = async () => {
    render(<KaryawanList />)
    fireEvent.click(await screen.findByText('Tambah Karyawan'))
    await screen.findByText('Pilih golongan...')
  }
  const pilihGolongan = async (nama) => {
    fireEvent.click(screen.getAllByText('Pilih golongan...')[0])
    fireEvent.click(await screen.findByText(nama))
  }

  it('golongan apa pun (termasuk Mandor) tidak pernah menampilkan form akun', async () => {
    await bukaForm()
    expect(screen.queryByTestId('akun-mandor')).toBeNull()
    expect(screen.queryByText('Email Login')).toBeNull()
    await pilihGolongan('Mandor Proyek')
    expect(screen.queryByTestId('akun-mandor')).toBeNull()
    expect(screen.queryByText('Email Login')).toBeNull()
  })

  it('golongan Mandor menampilkan petunjuk ke Pengaturan → Akun Mobile, golongan lain tidak', async () => {
    await bukaForm()
    await pilihGolongan('Mandor Proyek')
    expect(screen.getByText(/Pengaturan → Akun Mobile/)).toBeTruthy()
    fireEvent.click(screen.getAllByText('Mandor Proyek')[0])
    fireEvent.click(await screen.findByText('Tukang Batu'))
    expect(screen.queryByText(/Pengaturan → Akun Mobile/)).toBeNull()
  })

  it('menyimpan karyawan golongan Mandor TIDAK pernah membuat akun', async () => {
    await bukaForm()
    fireEvent.change(screen.getByPlaceholderText('Nama lengkap karyawan'), { target: { value: 'Sari' } })
    fireEvent.change(screen.getAllByRole('textbox').find(el => /16/.test(el.getAttribute('placeholder') || '')), { target: { value: '3201012345678902' } })
    await pilihGolongan('Mandor Gudang')
    fireEvent.click(screen.getByText('Simpan Data'))
    await waitFor(() => expect(h.created).toHaveBeenCalled())
    expect(h.signUp).not.toHaveBeenCalled()
  })

  it('menyimpan karyawan non-mandor juga tidak pernah membuat akun', async () => {
    await bukaForm()
    fireEvent.change(screen.getByPlaceholderText('Nama lengkap karyawan'), { target: { value: 'Budi' } })
    const nik = screen.getAllByRole('textbox').find(el => /nik|16/i.test(el.getAttribute('placeholder') || ''))
    fireEvent.change(nik, { target: { value: '3201012345678901' } })
    await pilihGolongan('Tukang Batu')
    fireEvent.click(screen.getByText('Simpan Data'))
    await waitFor(() => expect(h.created).toHaveBeenCalled())
    expect(h.signUp).not.toHaveBeenCalled()
  })
})
