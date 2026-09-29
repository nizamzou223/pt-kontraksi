import { describe, it, expect, vi } from 'vitest'

// Supabase palsu: setiap tabel mengembalikan data tetap; semua metode query dapat dirantai.
const fixtures = {}
vi.mock('../services/supabaseClient', () => {
  const builder = (table) => {
    const result = () => ({ data: fixtures[table], error: null })
    const b = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'then') return (res) => Promise.resolve(result()).then(res) // await
        if (prop === 'single' || prop === 'maybeSingle')
          return () => Promise.resolve({ data: fixtures[table], error: null })
        return () => b // select/eq/gte/lte/not/gt/order/like ...
      },
    })
    return b
  }
  const client = { from: builder }
  return { supabase: client, default: client }
})

import { payrollService, hariHadirDariDurasi, hitungKomponenJam } from '../services/payrollService'

const karyawan = { id: 1, gaji_harian_override: null, jabatan: { gaji_harian: 160000 } }
const setup = (presensi, lembur = [], kasbon = []) => {
  fixtures.presensi = presensi
  fixtures.lembur = lembur
  fixtures.kasbon = kasbon
  fixtures.karyawan = karyawan
}
const hadir = (durasi_jam, extra = {}) => ({
  tanggal: '2026-01-05', status_kehadiran: 'hadir', durasi_jam, project_id: 1,
  project: { nama_project: 'Proyek A', kode_project: 'PA' },
  uang_makan: 0, uang_transport: 0, upah_luar_kota: 0, ...extra,
})

describe('hariHadirDariDurasi', () => {
  it.each([
    [0, 1], [1, 1], [4, 1], [7.9, 1], [8, 1], [12, 1], [16, 2], [24, 3],
  ])('%s jam → %s hari', (jam, hari) => expect(hariHadirDariDurasi(jam)).toBe(hari))
  it('input tidak valid dianggap 1 hari', () => {
    expect(hariHadirDariDurasi(undefined)).toBe(1)
    expect(hariHadirDariDurasi('abc')).toBe(1)
  })
})

describe('hitungGajiMingguan — presensi kurang dari 8 jam (regresi)', () => {
  it('SATU hari 5 jam tetap menghasilkan rekap draft dengan gaji per jam', async () => {
    setup([hadir(5)])
    const r = await payrollService.hitungGajiMingguan(1, '2026-01-05', '2026-01-11')
    expect(r.status).toBe('draft')               // dulu: null → rekap tidak tersimpan
    expect(r.total_hari_hadir).toBe(1)           // dulu: 0
    expect(r.total_gaji_pokok).toBe(100000)      // 5 jam × (160000/8)
    expect(r.gaji_bersih).toBe(100000)
    expect(r.total_uang_lembur).toBe(0)          // < 8 jam bukan lembur
  })

  it('beberapa hari pendek: gaji dijumlah, hari hadir = jumlah presensi', async () => {
    setup([hadir(4), hadir(6, { tanggal: '2026-01-06' })])
    const r = await payrollService.hitungGajiMingguan(1, '2026-01-05', '2026-01-11')
    expect(r.status).toBe('draft')
    expect(r.total_hari_hadir).toBe(2)
    expect(r.total_gaji_pokok).toBe(200000)      // 10 jam × 20000
  })

  it('uang makan/transport ikut masuk walau < 8 jam', async () => {
    setup([hadir(3, { uang_makan: 15000, uang_transport: 10000 })])
    const r = await payrollService.hitungGajiMingguan(1, '2026-01-05', '2026-01-11')
    expect(r.gaji_kotor).toBe(60000 + 15000 + 10000)
  })

  it('hari 10 jam: 1 hari + 2 jam lembur (perilaku lama tidak berubah)', async () => {
    setup([hadir(10)])
    const r = await payrollService.hitungGajiMingguan(1, '2026-01-05', '2026-01-11')
    expect(r.total_hari_hadir).toBe(1)
    expect(r.total_gaji_pokok).toBe(160000)
    expect(r.total_uang_lembur).toBe(40000)
  })

  it('campuran hari penuh dan pendek', async () => {
    setup([hadir(8), hadir(3, { tanggal: '2026-01-06' })])
    const r = await payrollService.hitungGajiMingguan(1, '2026-01-05', '2026-01-11')
    expect(r.total_hari_hadir).toBe(2)
    expect(r.total_gaji_pokok).toBe(160000 + 60000)
  })

  it('tanpa presensi hadir → status null (tidak ada rekap)', async () => {
    setup([])
    const r = await payrollService.hitungGajiMingguan(1, '2026-01-05', '2026-01-11')
    expect(r.status).toBeNull()
  })

  it('kasbon dipotong dari gaji hari pendek, bersih tidak negatif', async () => {
    setup([hadir(5)], [], [{ id: 1, sisa_kasbon: 500000, tanggal_kasbon: '2026-01-01', jumlah_kasbon: 500000 }])
    const r = await payrollService.hitungGajiMingguan(1, '2026-01-05', '2026-01-11')
    expect(r.total_potongan_kasbon).toBe(100000)
    expect(r.gaji_bersih).toBe(0)
  })
})

describe('hitungKomponenJam (dipakai gaji mingguan)', () => {
  it('< 8 jam dibayar proporsional, bukan lembur', () => {
    expect(hitungKomponenJam(5, 160000)).toMatchObject({ gajiPokok: 100000, jamLembur: 0, gajiLembur: 0 })
  })
})
