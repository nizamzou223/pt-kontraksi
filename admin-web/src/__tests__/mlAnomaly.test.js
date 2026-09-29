import { describe, it, expect } from 'vitest'
import { IsolationForest, cFactor } from '../ml/isolationForest'
import { presensiRules, lemburRules, kasbonRules, buildContext, toHours, BATAS } from '../ml/anomalyRules'
import { detectAnomalies, tingkatDari } from '../ml/anomalyDetector'
import { generateWorkforce } from '../ml/syntheticWorkforce'
import { evaluateAnomalyMethods, sweepThreshold } from '../ml/anomalyEvaluation'
import { mulberry32, gaussian, rocAuc } from '../ml/stats'

const kar = [
  { id: 1, nama_karyawan: 'Budi', gaji_harian: 150000, status_aktif: true, tanggal_bergabung: '2026-01-05', jabatan_id: 1 },
  { id: 2, nama_karyawan: 'Sari', gaji_harian: 150000, status_aktif: false, tanggal_bergabung: '2026-01-05', jabatan_id: 1 },
]
const ctxOf = (o = {}) => buildContext({ karyawan: kar, presensi: [], lembur: [], kasbon: [], today: '2026-09-25', ...o })
const kodes = (arr) => arr.map((f) => f.kode)

describe('Isolation Forest', () => {
  it('c(n) sesuai rumus', () => {
    expect(cFactor(1)).toBe(0); expect(cFactor(2)).toBe(1)
    expect(cFactor(256)).toBeCloseTo(10.24, 1)
  })
  it('titik pencilan mendapat skor jauh lebih tinggi daripada titik normal (AUC > 0,95)', () => {
    const rand = mulberry32(3)
    const normal = Array.from({ length: 300 }, () => [gaussian(rand), gaussian(rand)])
    const out = [[8, 8], [-9, 7], [10, -8], [0, 12], [-11, -10]]
    const X = [...normal, ...out]
    const s = new IsolationForest({ seed: 1 }).fit(X).score(X)
    const y = X.map((_, i) => (i >= 300 ? 1 : 0))
    expect(rocAuc(s, y)).toBeGreaterThan(0.95)
    expect(Math.min(...s.slice(300))).toBeGreaterThan(0.6)
  })
  it('deterministik untuk benih yang sama & skor selalu dalam (0,1)', () => {
    const X = Array.from({ length: 80 }, (_, i) => [i % 7, (i * 3) % 11])
    const a = new IsolationForest({ seed: 9 }).fit(X).score(X), b = new IsolationForest({ seed: 9 }).fit(X).score(X)
    expect(a).toEqual(b); a.forEach((v) => { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1) })
  })
})

describe('aturan bisnis — presensi', () => {
  const base = { id: 1, karyawan_id: 1, tanggal: '2026-09-01', jam_masuk: '07:30:00', jam_keluar: '16:00:00', durasi_jam: 8.5, status_kehadiran: 'hadir', metode_input: 'qr_code' }
  it('presensi normal tidak menghasilkan temuan', () => expect(presensiRules(base, ctxOf())).toEqual([]))
  it('jam keluar sebelum masuk → tinggi', () => {
    const f = presensiRules({ ...base, jam_masuk: '17:00:00', jam_keluar: '08:00:00', durasi_jam: 8 }, ctxOf())
    expect(kodes(f)).toContain('KELUAR_SEBELUM_MASUK'); expect(f[0].tingkat).toBe('tinggi')
  })
  it('durasi tak konsisten dengan selisih jam', () => {
    expect(kodes(presensiRules({ ...base, jam_keluar: '10:30:00' }, ctxOf()))).toContain('DURASI_TIDAK_KONSISTEN')
  })
  it('durasi ekstrem (> 16 jam) dan terlalu singkat', () => {
    expect(kodes(presensiRules({ ...base, jam_masuk: '05:00:00', jam_keluar: '23:00:00', durasi_jam: 18 }, ctxOf()))).toContain('DURASI_EKSTREM')
    expect(kodes(presensiRules({ ...base, jam_keluar: '07:45:00', durasi_jam: 0.25 }, ctxOf()))).toContain('DURASI_TERLALU_SINGKAT')
  })
  it('karyawan nonaktif, sebelum bergabung, dan tanggal masa depan', () => {
    expect(kodes(presensiRules({ ...base, karyawan_id: 2 }, ctxOf()))).toContain('PRESENSI_KARYAWAN_NONAKTIF')
    expect(kodes(presensiRules({ ...base, tanggal: '2025-12-31' }, ctxOf()))).toContain('PRESENSI_SEBELUM_BERGABUNG')
    expect(kodes(presensiRules({ ...base, tanggal: '2026-12-01' }, ctxOf()))).toContain('PRESENSI_MASA_DEPAN')
  })
  it('presensi OTOMATIS (alfa otomatis) diabaikan — bukan observasi nyata', () => {
    expect(presensiRules({ ...base, metode_input: 'otomatis', karyawan_id: 2, durasi_jam: 30 }, ctxOf())).toEqual([])
  })
  it('pola jam manual identik berulang', () => {
    const rows = Array.from({ length: BATAS.pola_jam_identik }, (_, i) => ({ ...base, id: 100 + i, tanggal: `2026-09-${String(i + 1).padStart(2, '0')}`, metode_input: 'manual' }))
    const ctx = ctxOf({ presensi: rows })
    expect(kodes(presensiRules(rows[0], ctx))).toContain('POLA_JAM_IDENTIK')
  })
  it('toHours', () => { expect(toHours('07:30:00')).toBe(7.5); expect(toHours(null)).toBeNull(); expect(toHours('xx')).toBeNull() })
})

describe('aturan bisnis — lembur & kasbon', () => {
  const lb = { id: 1, karyawan_id: 1, tanggal: '2026-09-01', durasi_jam: 2, tarif_lembur: 28125, total_lembur: 56250, catatan: 'Lembur manual', status_persetujuan: 'disetujui' }
  const hadir = { id: 1, karyawan_id: 1, tanggal: '2026-09-01', status_kehadiran: 'hadir', metode_input: 'qr_code' }
  it('lembur wajar dengan presensi → tidak ada temuan', () => {
    expect(lemburRules(lb, ctxOf({ presensi: [hadir], lembur: [lb] }))).toEqual([])
  })
  it('lembur tanpa presensi hadir → tinggi', () => {
    expect(kodes(lemburRules(lb, ctxOf({ lembur: [lb] })))).toContain('LEMBUR_TANPA_PRESENSI')
  })
  it('lembur > 4 jam (sedang) dan > 8 jam (tinggi) sesuai PP 35/2021', () => {
    const c = ctxOf({ presensi: [hadir] })
    expect(kodes(lemburRules({ ...lb, durasi_jam: 5, total_lembur: 5 * 28125 }, c))).toContain('LEMBUR_HARIAN_BERLEBIH')
    expect(kodes(lemburRules({ ...lb, durasi_jam: 9, total_lembur: 9 * 28125 }, c))).toContain('LEMBUR_HARIAN_EKSTREM')
  })
  it('akumulasi lembur mingguan > 18 jam menandai baris yang melampaui batas', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ ...lb, id: 10 + i, tanggal: `2026-09-0${i + 1}`, durasi_jam: 4, total_lembur: 4 * 28125 }))
    const ctx = ctxOf({ lembur: rows })
    expect(ctx.lemburMingguanLewat.has(14)).toBe(true)     // kumulatif 20 jam
    expect(ctx.lemburMingguanLewat.has(13)).toBe(false)    // 16 jam masih wajar
  })
  it('total lembur tidak sesuai durasi × tarif', () => {
    expect(kodes(lemburRules({ ...lb, total_lembur: 90000 }, ctxOf({ presensi: [hadir] })))).toContain('LEMBUR_TOTAL_TIDAK_SESUAI')
  })
  it('lembur OTOMATIS (turunan presensi) diabaikan', () => {
    expect(lemburRules({ ...lb, catatan: 'Otomatis dari presensi (10 jam kerja)', durasi_jam: 9 }, ctxOf())).toEqual([])
  })
  it('kasbon: besar, sangat besar, sisa > jumlah, lunas tapi ada sisa, nonaktif, berulang', () => {
    const kb = { id: 1, karyawan_id: 1, jumlah_kasbon: 500000, sisa_kasbon: 500000, tanggal_kasbon: '2026-09-01', status_lunas: false }
    const c = ctxOf({ kasbon: [kb] })
    expect(kasbonRules(kb, c)).toEqual([])
    expect(kodes(kasbonRules({ ...kb, jumlah_kasbon: 150000 * 30, sisa_kasbon: 1 }, c))).toContain('KASBON_BESAR')
    expect(kodes(kasbonRules({ ...kb, jumlah_kasbon: 150000 * 60, sisa_kasbon: 1 }, c))).toContain('KASBON_SANGAT_BESAR')
    expect(kodes(kasbonRules({ ...kb, sisa_kasbon: 600000 }, c))).toContain('KASBON_SISA_LEBIH_BESAR')
    expect(kodes(kasbonRules({ ...kb, status_lunas: true }, c))).toContain('KASBON_LUNAS_ADA_SISA')
    expect(kodes(kasbonRules({ ...kb, karyawan_id: 2 }, c))).toContain('KASBON_KARYAWAN_NONAKTIF')
    const tiga = [1, 2, 3].map((n) => ({ ...kb, id: 20 + n, tanggal_kasbon: `2026-09-0${n}` }))
    expect(kodes(kasbonRules(tiga[2], ctxOf({ kasbon: tiga })))).toContain('KASBON_BERULANG')
    expect(kodes(kasbonRules(tiga[0], ctxOf({ kasbon: tiga })))).not.toContain('KASBON_BERULANG')
  })
})

describe('detektor hibrida', () => {
  const ds = generateWorkforce({ employees: 30, days: 60, seed: 21 })

  it('tingkat keparahan dari skor', () => {
    expect(tingkatDari(0.8)).toBe('tinggi'); expect(tingkatDari(0.6)).toBe('sedang'); expect(tingkatDari(0.4)).toBe('rendah')
  })
  it('setiap penanda memiliki skor, tingkat, dan alasan yang dapat dibaca', () => {
    const r = detectAnomalies({ ...ds, threshold: 0.5 })
    expect(r.items.length).toBeGreaterThan(0)
    for (const it of r.items) {
      expect(it.skor).toBeGreaterThanOrEqual(0.5); expect(it.skor).toBeLessThanOrEqual(1)
      expect(['tinggi', 'sedang', 'rendah']).toContain(it.tingkat)
      expect(it.alasan.length).toBeGreaterThan(0)
      it.alasan.forEach((a) => { expect(typeof a.teks).toBe('string'); expect(a.teks.length).toBeGreaterThan(10) })
    }
    for (let i = 1; i < r.items.length; i++) expect(r.items[i - 1].skor).toBeGreaterThanOrEqual(r.items[i].skor)   // terurut
  })
  it('deterministik untuk data & benih yang sama', () => {
    const a = detectAnomalies({ ...ds }), b = detectAnomalies({ ...ds })
    expect(a.items.map((i) => [i.key, i.skor])).toEqual(b.items.map((i) => [i.key, i.skor]))
  })
  it('presensi otomatis & lembur otomatis dikecualikan dan dilaporkan pada ringkasan', () => {
    const extra = { ...ds, presensi: [...ds.presensi, { id: 99999, project_id: 1, karyawan_id: 1, tanggal: '2026-08-01', status_kehadiran: 'alfa', metode_input: 'otomatis', durasi_jam: 40 }],
      lembur: [...ds.lembur, { id: 99999, project_id: 1, karyawan_id: 1, tanggal: '2026-08-01', durasi_jam: 12, tarif_lembur: 1, total_lembur: 1, catatan: 'Otomatis dari presensi (20 jam kerja)' }] }
    const r = detectAnomalies(extra)
    expect(r.items.some((i) => i.key === 'presensi:99999' || i.key === 'lembur:99999')).toBe(false)
    expect(r.ringkasan.dikecualikan).toEqual({ presensi_otomatis: 1, lembur_otomatis: 1 })
  })
  it('umpan balik: penanda yang sudah ditinjau "bukan anomali" tidak muncul lagi', () => {
    const first = detectAnomalies({ ...ds })
    const target = first.items[0].key
    const again = detectAnomalies({ ...ds, reviewed: new Set([target]) })
    expect(again.items.some((i) => i.key === target)).toBe(false)
    expect(again.ringkasan.disembunyikan).toBe(1)
  })
  it('anomali gaji: pencilan terhadap rekan sejabatan pada minggu yang sama', () => {
    const gaji = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, karyawan_id: 1, periode_mulai: '2026-09-07', gaji_kotor: 900000 + i * 10000, gaji_bersih: 900000, total_potongan_kasbon: 0, total_hari_hadir: 6 }))
    gaji.push({ id: 99, karyawan_id: 1, periode_mulai: '2026-09-07', gaji_kotor: 4_500_000, gaji_bersih: 4_500_000, total_potongan_kasbon: 0, total_hari_hadir: 6 })
    const r = detectAnomalies({ karyawan: kar, gaji, threshold: 0.4 })
    expect(r.items.map((i) => i.sumber_id)).toContain(99)
    expect(r.items.find((i) => i.sumber_id === 99).alasan.some((a) => a.kode === 'STAT_GAJI')).toBe(true)
  })
  it('data normal murni menghasilkan sangat sedikit penanda palsu (< 3% dari presensi)', () => {
    const clean = generateWorkforce({ employees: 30, days: 60, seed: 5, anomalyRate: 0 })
    const bersih = { ...clean, presensi: clean.presensi.filter((p) => !clean.labels.has(`presensi:${p.id}`)) }
    const r = detectAnomalies({ ...bersih, threshold: 0.5 })
    const fpPresensi = r.items.filter((i) => i.sumber_tabel === 'presensi').length
    expect(fpPresensi / bersih.presensi.length).toBeLessThan(0.03)
  })
})

describe('evaluasi metode pada data sintetis berlabel', () => {
  const ds = generateWorkforce({ employees: 30, days: 60, seed: 21 })
  const ev = evaluateAnomalyMethods(ds, { threshold: 0.5 })
  const by = Object.fromEntries(ev.hasil.map((h) => [h.id, h]))

  it('hibrida: recall tinggi & presisi memadai; AUC tinggi', () => {
    expect(by.hibrida.recall).toBeGreaterThan(0.85)
    expect(by.hibrida.precision).toBeGreaterThan(0.75)
    expect(by.hibrida.auc).toBeGreaterThan(0.95)
  })
  it('hibrida menangkap anomali halus yang LOLOS dari aturan bisnis', () => {
    expect(by.hibrida.recall).toBeGreaterThan(by.aturan.recall)                  // tambahan statistik + iForest menaikkan recall
    for (const t of ['jam_masuk_aneh', 'durasi_singkat']) {
      const a = by.aturan.perTipe[t], h = by.hibrida.perTipe[t]
      expect(h.terdeteksi / h.n).toBeGreaterThan(0.8)
      expect(a.terdeteksi / a.n).toBeLessThan(0.3)                               // aturan saja tidak cukup
    }
  })
  it('setiap metode tunggal punya AUC di atas acak', () => {
    for (const id of ['aturan', 'statistik', 'iforest']) expect(by[id].auc).toBeGreaterThan(0.7)
  })
  it('tercantum semua jenis anomali yang disuntikkan', () => {
    const tipe = Object.keys(by.hibrida.perTipe)
    for (const t of ['durasi_ekstrem', 'keluar_sebelum_masuk', 'lembur_ekstrem', 'kasbon_besar', 'karyawan_nonaktif']) expect(tipe).toContain(t)
  })
})

describe('benchmark tingkat SULIT (variasi sah menyerupai anomali)', () => {
  const ds = generateWorkforce({ employees: 30, days: 60, seed: 21, difficulty: 'sulit' })
  const ev = evaluateAnomalyMethods(ds, { threshold: 0.5 })
  const by = Object.fromEntries(ev.hasil.map((h) => [h.id, h]))

  it('tidak lagi trivial: presisi hibrida < 1 (ada positif palsu dari variasi sah) namun tetap wajar', () => {
    expect(by.hibrida.precision).toBeLessThan(1)
    expect(by.hibrida.precision).toBeGreaterThan(0.65)
    expect(by.hibrida.recall).toBeGreaterThan(0.85)
    expect(by.hibrida.f1).toBeGreaterThan(0.75)
  })
  it('peringkat skor hibrida (AUC) lebih baik daripada metode tunggal mana pun', () => {
    for (const id of ['aturan', 'statistik', 'iforest']) expect(by.hibrida.auc).toBeGreaterThan(by[id].auc)
    expect(by.hibrida.auc).toBeGreaterThan(0.95)
  })
  it('sapuan ambang: menaikkan ambang menaikkan presisi dan menurunkan recall (pertukaran nyata)', () => {
    const sw = sweepThreshold(ds, { thresholds: [0.5, 0.7, 0.9] })
    expect(sw.rows[2].recall).toBeLessThan(sw.rows[0].recall)
    expect(sw.rows[2].precision).toBeGreaterThanOrEqual(sw.rows[0].precision)
    expect(sw.best.f1).toBeGreaterThanOrEqual(sw.rows[0].f1)
  })
  it('lantai skala mencegah hari kerja panjang yang sah (10–11,5 jam) ditandai secara statistik', () => {
    const sah = ds.presensi.filter((p) => !ds.labels.has('presensi:' + p.id) && p.durasi_jam >= 10 && p.durasi_jam <= 11.5)
    expect(sah.length).toBeGreaterThan(5)
    const r = detectAnomalies({ ...ds, methods: { rules: false, stats: true, iforest: false }, threshold: 0.5 })
    const flagged = new Set(r.items.map((i) => i.key))
    const fp = sah.filter((p) => flagged.has('presensi:' + p.id)).length
    expect(fp / sah.length).toBeLessThan(0.5)
  })
})
