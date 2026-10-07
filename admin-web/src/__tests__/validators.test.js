import { describe, it, expect } from 'vitest'
import { karyawanSchema, kasbonSchema, loginSchema } from '../utils/validators'

const karyawanOk = {
  nama_karyawan: 'Budi Santoso', jabatan_id: 1,
  tanggal_bergabung: '2026-01-01', status_aktif: true,
}

describe('karyawanSchema — validasi input', () => {
  it('menerima data valid', () => expect(karyawanSchema.safeParse(karyawanOk).success).toBe(true))
  it('menolak nama terlalu pendek / terlalu panjang', () => {
    expect(karyawanSchema.safeParse({ ...karyawanOk, nama_karyawan: 'A' }).success).toBe(false)
    expect(karyawanSchema.safeParse({ ...karyawanOk, nama_karyawan: 'A'.repeat(151) }).success).toBe(false)
  })
  it('menolak email tidak valid', () => {
    expect(karyawanSchema.safeParse({ ...karyawanOk, email: 'bukan-email' }).success).toBe(false)
  })
})

describe('kasbonSchema', () => {
  const ok = { project_id: 1, karyawan_id: 1, jumlah_kasbon: 100000, tanggal_kasbon: '2026-01-01' }
  it('valid', () => expect(kasbonSchema.safeParse(ok).success).toBe(true))
  it('menolak jumlah nol atau negatif', () => {
    expect(kasbonSchema.safeParse({ ...ok, jumlah_kasbon: 0 }).success).toBe(false)
    expect(kasbonSchema.safeParse({ ...ok, jumlah_kasbon: -5 }).success).toBe(false)
  })
  it('menolak angka yang dikirim sebagai string (type confusion)', () => {
    expect(kasbonSchema.safeParse({ ...ok, jumlah_kasbon: '100000' }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('menolak email salah format', () => {
    expect(loginSchema.safeParse({ email: 'admin', password: 'abcdef' }).success).toBe(false)
  })
  it('valid', () => {
    expect(loginSchema.safeParse({ email: 'admin@kalipelus.com', password: 'abcdef' }).success).toBe(true)
  })
})
