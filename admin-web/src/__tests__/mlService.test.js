import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase palsu: mencatat setiap panggilan berantai, hasil diatur per tabel lewat h.tables / h.errors.
const h = vi.hoisted(() => ({ calls: [], tables: {}, errors: {}, writes: [] }))
vi.mock('../services/supabaseClient', () => {
  const builder = (table) => {
    const st = { table, ops: [], range: null, single: false, head: false }
    const result = () => {
      if (h.errors[table]) return { data: null, error: h.errors[table], count: null }
      let rows = h.tables[table] ?? []
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
      if (st.single) return { data: rows[0] ?? { id: 1 }, error: null }
      return { data: rows, error: null, count: (h.tables[table] ?? []).length }
    }
    const b = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'then') return (res) => Promise.resolve(result()).then(res)
        if (prop === 'range') return (a, z) => { st.range = [a, z]; return b }
        if (prop === 'single') return () => { st.single = true; return b }
        if (['insert', 'update', 'upsert', 'delete'].includes(prop))
          return (arg, opts) => { h.writes.push({ table, op: prop, arg, opts }); st.write = true; return b }
        return (...args) => { h.calls.push({ table, method: String(prop), args }); return b }
      },
    })
    return b
  }
  const client = { from: builder }
  return { default: client, supabase: client }
})

import {
  fetchAll, isMissingTable, buildMaterialItems, loadMaterialData, hitungAkurasi, saveAnomalies,
  saveForecastRun, reviewAnomaly, getReviewedKeys, listAnomalies,
} from '../services/mlService'
import supabase from '../services/supabaseClient'

beforeEach(() => { h.calls.length = 0; h.writes.length = 0; h.tables = {}; h.errors = {} })

const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.ml_anomali' in the schema cache" }

describe('fetchAll & penanganan tabel belum dibuat', () => {
  it('membaca SEMUA baris lewat beberapa halaman (batas API 1.000 baris)', async () => {
    h.tables.presensi = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }))
    const rows = await fetchAll((a, b) => supabase.from('presensi').select('id').range(a, b))
    expect(rows).toHaveLength(2500)
    expect(rows[2499].id).toBe(2500)
  })
  it('isMissingTable mengenali kode/pesan Postgres & PostgREST', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable(MISSING)).toBe(true)
    expect(isMissingTable({ message: 'relation "ml_anomali" does not exist' })).toBe(true)
    expect(isMissingTable({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingTable(null)).toBe(false)
  })
  it('tabel ml_* belum ada → Error berkode ML_TABLE_MISSING dengan petunjuk migrasi', async () => {
    h.errors.ml_anomali = MISSING
    await expect(listAnomalies()).rejects.toMatchObject({ code: 'ML_TABLE_MISSING', message: expect.stringContaining('MIGRATION_ML_SISTEM_CERDAS.sql') })
  })
  it('getReviewedKeys tidak melempar error bila tabel belum ada (analisis tetap jalan)', async () => {
    h.errors.ml_anomali = MISSING
    expect((await getReviewedKeys()).size).toBe(0)
  })
  it('error lain (bukan tabel hilang) tetap dilempar apa adanya', async () => {
    h.errors.ml_anomali = { code: '42501', message: 'permission denied for table ml_anomali' }
    await expect(getReviewedKeys()).rejects.toThrow(/permission denied/)
  })
})

describe('buildMaterialItems (baris DB → masukan pipeline)', () => {
  const barang = [{ id: 1, nama_barang: 'Semen', kode_barang: 'SMN', stok_saat_ini: 40, stok_minimal: 10, satuan_barang: { singkatan: 'sak' } }, { id: 2, nama_barang: 'Pasir', stok_saat_ini: 0, stok_minimal: 0 }]
  const keluar = [
    { barang_id: 1, jumlah: 5, created_at: '2026-09-01T08:00:00' }, { barang_id: 1, jumlah: 3, created_at: '2026-09-03T08:00:00' },
    { barang_id: 1, jumlah: 7, created_at: '2026-09-15T08:00:00' },
  ]
  const presensi = [
    { karyawan_id: 1, tanggal: '2026-09-01', status_kehadiran: 'hadir', metode_input: 'qr_code' },
    { karyawan_id: 2, tanggal: '2026-09-02', status_kehadiran: 'hadir', metode_input: 'manual' },
    { karyawan_id: 1, tanggal: '2026-09-03', status_kehadiran: 'hadir', metode_input: 'qr_code' },    // karyawan sama → dihitung 1
    { karyawan_id: 3, tanggal: '2026-09-02', status_kehadiran: 'alfa', metode_input: 'otomatis' },    // otomatis → dikecualikan
  ]
  const r = buildMaterialItems({ barang, keluar, presensi, from: '2026-08-31', to: '2026-09-20' })

  it('deret mingguan terisi 0 eksplisit dan sejajar dengan daftar minggu', () => {
    expect(r.weeks).toEqual(['2026-08-31', '2026-09-07', '2026-09-14'])
    expect(r.items[0].values).toEqual([8, 0, 7])
    expect(r.items[1].values).toEqual([0, 0, 0])            // barang tanpa transaksi tetap ada
    r.items.forEach((it) => expect(it.values).toHaveLength(r.weeks.length))
  })
  it('stok, satuan, dan stok minimal terbawa', () => {
    expect(r.items[0]).toMatchObject({ nama: 'Semen', satuan: 'sak', stok: 40, stok_minimal: 10 })
    expect(r.items[1].satuan).toBe('')
  })
  it('tenaga kerja aktif = karyawan berbeda yang hadir per minggu, tanpa presensi otomatis', () => {
    expect(r.items[0].exog).toEqual([2, 0, 0])
    expect(r.meta.exogTersedia).toBe(true); expect(r.meta.nPresensi).toBe(3)
  })
})

describe('loadMaterialData', () => {
  it('MENGECUALIKAN minggu berjalan yang belum lengkap (batas atas = Senin minggu ini)', async () => {
    h.tables.barang = [{ id: 1, nama_barang: 'A', stok_saat_ini: 1, stok_minimal: 0 }]
    h.tables.stok_keluar = []; h.tables.presensi = []
    const out = await loadMaterialData(7, { weeks: 12, today: new Date('2026-09-25T10:00:00Z') }) // Jumat
    const lt = h.calls.filter((c) => c.method === 'lt').map((c) => c.args)
    expect(lt).toContainEqual(['created_at', '2026-09-21'])
    expect(lt).toContainEqual(['tanggal', '2026-09-21'])
    expect(out.weeks).toHaveLength(12)
    expect(out.weeks.at(-1)).toBe('2026-09-14')            // minggu lengkap terakhir
  })
})

describe('hitungAkurasi (ramalan tersimpan vs realisasi)', () => {
  const fc = (dibuat, minggu, h_, barang, yhat) => ({ dibuat_pada: dibuat, minggu_target: minggu, horizon: h_, barang_id: barang, yhat })
  it('menghitung MAE/WAPE/bias dan mengabaikan minggu yang belum selesai', () => {
    const rows = [fc('2026-08-31', '2026-09-07', 1, 1, 10), fc('2026-08-31', '2026-09-14', 2, 1, 10), fc('2026-08-31', '2026-09-21', 3, 1, 10)]
    const actual = new Map([['1|2026-09-07', 8], ['1|2026-09-14', 14]])
    const { runs } = hitungAkurasi(rows, actual, '2026-09-14')
    expect(runs).toHaveLength(1)
    expect(runs[0].n).toBe(2)                              // minggu 09-21 belum lengkap → tidak dinilai
    expect(runs[0].mae).toBeCloseTo((2 + 4) / 2)
    expect(runs[0].wape).toBeCloseTo(6 / 22)
    expect(runs[0].bias).toBeCloseTo((2 - 4) / 2)
    expect(runs[0].perHorizon.map((x) => x.h)).toEqual([1, 2])
  })
  it('minggu tanpa transaksi dianggap realisasi 0', () => {
    const { runs } = hitungAkurasi([fc('2026-08-31', '2026-09-07', 1, 1, 5)], new Map(), '2026-09-14')
    expect(runs[0].mae).toBe(5); expect(runs[0].wape).toBeNull()
  })
  it('drift: memburuk bila galat run terbaru > 130% rata-rata sebelumnya; stabil bila tidak', () => {
    const mk = (tgl, err) => [fc(tgl, '2026-09-07', 1, 1, 10 + err)]
    const actual = new Map([['1|2026-09-07', 10]])
    const stabil = hitungAkurasi([...mk('2026-06-01', 2), ...mk('2026-07-01', 2), ...mk('2026-08-01', 2)], actual, '2026-09-14')
    expect(stabil.drift.status).toBe('stabil')
    const buruk = hitungAkurasi([...mk('2026-06-01', 2), ...mk('2026-07-01', 2), ...mk('2026-08-01', 6)], actual, '2026-09-14')
    expect(buruk.drift.status).toBe('memburuk')
    expect(hitungAkurasi(mk('2026-08-01', 2), actual, '2026-09-14').drift.status).toBe('belum_cukup')
  })
})

describe('saveAnomalies — tidak menimpa keputusan admin', () => {
  const item = (id, tabel = 'presensi') => ({ key: `${tabel}:${id}`, sumber_tabel: tabel, sumber_id: id, karyawan_id: 1, project_id: 1, tanggal: '2026-09-01', skor: 0.87654321, tingkat: 'tinggi', alasan: [{ kode: 'X', teks: 'alasan' }], metode: ['aturan bisnis'] })

  it('baris yang sudah ditinjau admin dilewati; yang masih "baru" diperbarui; yang belum ada ditambahkan', async () => {
    h.tables.ml_anomali = [
      { id: 1, sumber_tabel: 'presensi', sumber_id: 1, status_tinjauan: 'valid' },
      { id: 2, sumber_tabel: 'presensi', sumber_id: 2, status_tinjauan: 'baru' },
    ]
    const r = await saveAnomalies([item(1), item(2), item(3)])
    expect(r).toEqual({ inserted: 1, updated: 1, dilewati: 1 })
    const up = h.writes.find((w) => w.op === 'upsert')
    expect(up.arg.map((x) => x.sumber_id).sort()).toEqual([2, 3])          // id 1 (valid) TIDAK ikut ditulis
    expect(up.opts).toEqual({ onConflict: 'sumber_tabel,sumber_id' })
    expect(up.arg.every((x) => !('status_tinjauan' in x))).toBe(true)      // kolom status tidak disentuh
    expect(up.arg[0].skor).toBe(0.8765)                                    // dibulatkan 4 desimal
  })
  it('daftar kosong tidak menulis apa pun', async () => {
    expect(await saveAnomalies([])).toEqual({ inserted: 0, updated: 0, dilewati: 0 })
    expect(h.writes).toHaveLength(0)
  })
  it('tabel belum dibuat → ML_TABLE_MISSING', async () => {
    h.errors.ml_anomali = MISSING
    await expect(saveAnomalies([item(1)])).rejects.toMatchObject({ code: 'ML_TABLE_MISSING' })
  })
})

describe('reviewAnomaly', () => {
  it('menolak status tidak valid', async () => {
    await expect(reviewAnomaly(1, 'hapus', '', 1)).rejects.toThrow(/tidak valid/)
    expect(h.writes).toHaveLength(0)
  })
  it('menyimpan status, catatan, peninjau & waktu', async () => {
    await reviewAnomaly(5, 'bukan_anomali', 'disetujui manajer', 9)
    const w = h.writes.find((x) => x.op === 'update')
    expect(w.arg).toMatchObject({ status_tinjauan: 'bukan_anomali', catatan: 'disetujui manajer', ditinjau_oleh: 9 })
    expect(typeof w.arg.ditinjau_pada).toBe('string')
  })
})

describe('saveForecastRun', () => {
  const hasil = {
    ok: true, parameter: { horizon: 2 }, weeks: ['2026-09-07', '2026-09-14'], modelTerbaik: 'gbm_exog', cakupanInterval: { picp: 0.8 },
    evaluasi: [{ id: 'gbm_exog', nama: 'GB + tenaga kerja', kelompok: 'global', mae: 1, rmse: 2, wape: 0.3, mase: 0.8, bias: 0, meanRank: 1, wins: 3, perHorizon: [{ h: 1 }] }],
    items: [
      { id: 11, modelNama: 'GB', mase: 0.7, forecast: [{ minggu: '2026-09-21', yhat: 5.123, low: 3, high: 8 }, { minggu: '2026-09-28', yhat: 6, low: 2, high: 9 }],
        rekomendasi: { reorderPoint: 12, safetyStock: 3, orderQty: 9, stockoutWeek: '2026-09-28', risiko: 'kritis', alasan: ['a'] } },
    ],
  }
  it('menyimpan registri model, ramalan per minggu, dan rekomendasi', async () => {
    h.tables.ml_model_registry = [{ id: 42 }]
    const r = await saveForecastRun(hasil, 7, { today: new Date('2026-09-25T00:00:00Z') })
    expect(r).toMatchObject({ saved: true, modelId: 42, nForecast: 2, nRekomendasi: 1 })
    const reg = h.writes.find((w) => w.table === 'ml_model_registry' && w.op === 'upsert')
    expect(reg.arg).toMatchObject({ jenis: 'forecast', nama_model: 'GB + tenaga kerja', versi: '2026-09-25', aktif: true })
    const fc = h.writes.find((w) => w.table === 'ml_forecast')
    expect(fc.arg).toHaveLength(2)
    expect(fc.arg[0]).toMatchObject({ model_id: 42, project_id: 7, barang_id: 11, dibuat_pada: '2026-09-25', minggu_target: '2026-09-21', horizon: 1, yhat: 5.12, yhat_bawah: 3, yhat_atas: 8 })
    const rek = h.writes.find((w) => w.table === 'ml_rekomendasi_pengadaan')
    expect(rek.arg[0]).toMatchObject({ barang_id: 11, risiko: 'kritis', jumlah_disarankan: 9, perkiraan_habis: '2026-09-28' })
  })
  it('tabel belum dibuat → ML_TABLE_MISSING', async () => {
    h.errors.ml_model_registry = MISSING
    await expect(saveForecastRun(hasil, 7)).rejects.toMatchObject({ code: 'ML_TABLE_MISSING' })
  })
})

describe('modul TIDAK menulis ke tabel operasional', () => {
  it('seluruh penulisan hanya ke tabel ml_*', async () => {
    h.tables.ml_model_registry = [{ id: 1 }]; h.tables.ml_anomali = []
    await saveForecastRun({ ok: true, parameter: {}, weeks: ['2026-09-07'], modelTerbaik: 'a', cakupanInterval: {}, evaluasi: [{ id: 'a', nama: 'A' }], items: [] }, 1)
    await saveAnomalies([{ key: 'presensi:1', sumber_tabel: 'presensi', sumber_id: 1, tanggal: '2026-09-01', skor: 0.9, tingkat: 'tinggi', alasan: [], metode: [] }])
    await reviewAnomaly(1, 'valid', '', 1)
    for (const w of h.writes) expect(w.table).toMatch(/^ml_/)
  })
})
