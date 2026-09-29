import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase palsu yang MENCATAT setiap operasi, supaya jumlah query & tulis bisa diuji.
const log = []
const fx = {}
vi.mock('../services/supabaseClient', () => {
  const builder = (table) => {
    const filters = [] // hormati .in(kolom, nilai) seperti API asli
    const rows = () => (fx[table] ?? []).filter((r) => filters.every(([c, v]) => v.includes(r[c])))
    const b = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'in') return (col, vals) => { filters.push([col, vals]); return b }
        if (prop === 'then') return (res) => Promise.resolve({ data: rows(), error: null }).then(res)
        if (['insert', 'update', 'delete'].includes(prop))
          return (arg) => { log.push({ op: prop, table, arg }); return b }
        if (prop === 'single' || prop === 'maybeSingle')
          return () => Promise.resolve({ data: Array.isArray(fx[table]) ? fx[table][0] : fx[table], error: null })
        return () => b
      },
    })
    return b
  }
  const client = { from: (t) => { log.push({ op: 'from', table: t }); return builder(t) } }
  return { supabase: client, default: client }
})

import { payrollService, rekapBerubah } from '../services/payrollService'

const P1 = '2026-01-05', P2 = '2026-01-11'
const kar = (id) => ({ id, gaji_harian_override: null, jabatan: { gaji_harian: 160000 } })
const presensi = (kid, jam) => ({
  karyawan_id: kid, tanggal: P1, status_kehadiran: 'hadir', durasi_jam: jam, project_id: 1,
  project: { nama_project: 'Proyek A', kode_project: 'PA' }, uang_makan: 0, uang_transport: 0, upah_luar_kota: 0,
})
const ops = (op) => log.filter((l) => l.op === op)
const seed = (n, jam = 5) => {
  const ids = Array.from({ length: n }, (_, i) => i + 1)
  fx.karyawan = ids.map(kar)
  fx.presensi = ids.map((id) => presensi(id, jam))
  fx.lembur = []
  fx.kasbon = []
  fx.rekap_gaji_mingguan = []
  return ids
}

beforeEach(() => { log.length = 0; for (const k of Object.keys(fx)) delete fx[k] })

describe('hitungDanSimpanGajiMingguanBatch — jumlah request', () => {
  it('50 karyawan: hanya 5 query baca + 1 insert massal (dulu ±300 request)', async () => {
    const ids = seed(50)
    const r = await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    expect(ops('from')).toHaveLength(5 + 1)               // 5 baca + 1 tabel insert
    expect(ops('insert')).toHaveLength(1)
    expect(ops('insert')[0].arg).toHaveLength(50)
    expect(ops('update')).toHaveLength(0)
    expect(r).toEqual({ berhasil: 50, diubah: 50 })
  })

  it('120 karyawan dipecah 3 kelompok (batas 1000 baris API tidak terlampaui)', async () => {
    const ids = seed(120)
    await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    const reads = ops('from').filter((l) => l.table !== 'rekap_gaji_mingguan' || true)
    expect(reads.length).toBe(3 * 5 + 1)
    expect(ops('insert')[0].arg).toHaveLength(120)
  })

  it('daftar kosong tidak melakukan request', async () => {
    const r = await payrollService.hitungDanSimpanGajiMingguanBatch([], P1, P2)
    expect(r).toEqual({ berhasil: 0, diubah: 0 })
    expect(log).toHaveLength(0)
  })

  it('id ganda diproses sekali', async () => {
    seed(3)
    await payrollService.hitungDanSimpanGajiMingguanBatch([1, 1, 2, 3, 3], P1, P2)
    expect(ops('insert')[0].arg).toHaveLength(3)
  })
})

describe('hitungDanSimpanGajiMingguanBatch — hasil & penulisan', () => {
  it('presensi 5 jam ikut tersimpan (regresi bug gaji < 8 jam)', async () => {
    const ids = seed(1, 5)
    await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    const row = ops('insert')[0].arg[0]
    expect(row).toMatchObject({ status: 'draft', total_hari_hadir: 1, total_gaji_pokok: 100000, gaji_bersih: 100000 })
    expect(row).not.toHaveProperty('total_jam_kerja') // kolom yang tidak ada di tabel
  })

  it('hasil tidak berubah → TIDAK ada tulis (tidak memicu event realtime sia-sia)', async () => {
    const ids = seed(2, 5)
    await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    const inserted = ops('insert')[0].arg
    log.length = 0
    fx.rekap_gaji_mingguan = inserted.map((p, i) => ({ ...p, id: 100 + i }))
    const r = await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    expect(ops('insert')).toHaveLength(0)
    expect(ops('update')).toHaveLength(0)
    expect(ops('delete')).toHaveLength(0)
    expect(r).toEqual({ berhasil: 2, diubah: 0 })
  })

  it('durasi berubah → hanya baris itu yang di-update', async () => {
    const ids = seed(2, 5)
    await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    const inserted = ops('insert')[0].arg
    log.length = 0
    fx.rekap_gaji_mingguan = inserted.map((p, i) => ({ ...p, id: 100 + i }))
    fx.presensi = [presensi(1, 5), presensi(2, 7)]      // karyawan 2: 5 → 7 jam
    const r = await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    expect(ops('update')).toHaveLength(1)
    expect(ops('update')[0].arg).toMatchObject({ total_gaji_pokok: 140000 })
    expect(r.diubah).toBe(1)
  })

  it('gaji berstatus dibayar tidak disentuh', async () => {
    const ids = seed(1, 5)
    fx.rekap_gaji_mingguan = [{ id: 7, karyawan_id: 1, status: 'dibayar', gaji_bersih: 1 }]
    const r = await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    expect(ops('insert')).toHaveLength(0)
    expect(ops('update')).toHaveLength(0)
    expect(r.diubah).toBe(0)
  })

  it('tanpa presensi & ada draft lama → draft dihapus', async () => {
    const ids = seed(1, 5)
    fx.presensi = []
    fx.rekap_gaji_mingguan = [{ id: 9, karyawan_id: 1, status: 'draft', gaji_bersih: 100000 }]
    const r = await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    expect(ops('delete')).toHaveLength(1)
    expect(r).toEqual({ berhasil: 0, diubah: 1 })
  })

  it('tanpa presensi & tanpa draft → tidak ada tulis', async () => {
    const ids = seed(1, 5)
    fx.presensi = []
    const r = await payrollService.hitungDanSimpanGajiMingguanBatch(ids, P1, P2)
    expect(ops('insert')).toHaveLength(0)
    expect(ops('delete')).toHaveLength(0)
    expect(r).toEqual({ berhasil: 0, diubah: 0 })
  })
})

describe('rekapBerubah', () => {
  const base = { status: 'draft', total_hari_hadir: 1, total_gaji_pokok: 100000, gaji_bersih: 100000, project_details: { a: 1, b: 2 } }
  it('angka desimal string dari DB dianggap sama', () => {
    expect(rekapBerubah({ ...base, gaji_bersih: '100000.00' }, base)).toBe(false)
  })
  it('urutan key project_details tidak berpengaruh', () => {
    expect(rekapBerubah({ ...base, project_details: { b: 2, a: 1 } }, base)).toBe(false)
  })
  it('nilai berbeda terdeteksi', () => {
    expect(rekapBerubah({ ...base, gaji_bersih: 90000 }, base)).toBe(true)
    expect(rekapBerubah({ ...base, status: 'tidak_hadir' }, base)).toBe(true)
    expect(rekapBerubah({ ...base, project_details: { a: 9 } }, base)).toBe(true)
  })
})
