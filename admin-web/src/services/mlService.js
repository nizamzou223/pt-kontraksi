// Akses data Sistem Cerdas: memuat data operasional (baca-saja), menyimpan hasil ke tabel ml_*,
// dan alur tinjauan anomali. TIDAK mengubah data operasional apa pun.
//
// Bila tabel ml_* belum dibuat (MIGRATION_ML_SISTEM_CERDAS.sql belum dijalankan), fungsi penyimpanan
// melempar Error dengan .code = 'ML_TABLE_MISSING' agar UI dapat menampilkan petunjuk — analisis
// tetap dapat dijalankan dan ditampilkan tanpa penyimpanan.
import supabase from './supabaseClient'
import { weekStart, addWeeks, weekRange, weeklySeries } from '../ml/timeseries'
import { mean } from '../ml/stats'

const PAGE = 1000

export const isMissingTable = (err) =>
  !!err && (err.code === '42P01' || err.code === 'PGRST205' || /could not find the table|relation .* does not exist|does not exist/i.test(err.message || ''))

function wrap(err) {
  const missing = isMissingTable(err)
  const e = new Error(missing ? 'Tabel Sistem Cerdas belum dibuat. Jalankan MIGRATION_ML_SISTEM_CERDAS.sql di Supabase SQL Editor.' : err.message)
  e.code = missing ? 'ML_TABLE_MISSING' : err.code
  return e
}

/** Membaca SEMUA baris (API dibatasi 1.000 baris per permintaan) lewat .range(). */
export async function fetchAll(build) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw wrap(error)
    if (data?.length) rows.push(...data)
    if (!data || data.length < PAGE) break
  }
  return rows
}

const isoDate = (d) => new Date(d).toISOString().slice(0, 10)
const addDays = (dateStr, n) => new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)

// ───────────────────────── Peramalan material ─────────────────────────
/**
 * Deret pemakaian mingguan per barang untuk satu proyek. Minggu berjalan (belum lengkap) DIKECUALIKAN
 * karena mengecilkan nilai terakhir dan membiaskan ramalan.
 */
export async function loadMaterialData(projectId, { weeks = 52, today = new Date() } = {}) {
  const thisWeek = weekStart(isoDate(today))
  const from = addWeeks(thisWeek, -weeks)
  const to = addDays(thisWeek, -1) // Minggu terakhir yang sudah lengkap

  const [barang, keluar, presensi] = await Promise.all([
    fetchAll((a, b) => supabase.from('barang')
      .select('id, nama_barang, kode_barang, stok_saat_ini, stok_minimal, satuan_barang(singkatan)')
      .eq('project_id', projectId).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('stok_keluar')
      .select('id, barang_id, jumlah, created_at')
      .eq('project_id', projectId).gte('created_at', from).lt('created_at', thisWeek).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('presensi')
      .select('id, karyawan_id, tanggal, status_kehadiran, metode_input')
      .eq('project_id', projectId).gte('tanggal', from).lt('tanggal', thisWeek).order('id').range(a, b)),
  ])
  return buildMaterialItems({ barang, keluar, presensi, from, to })
}

/** Murni (mudah diuji): baris DB → struktur masukan pipeline peramalan. */
export function buildMaterialItems({ barang, keluar, presensi, from, to }) {
  const weeksList = weekRange(from, to)
  const byBarang = new Map()
  for (const r of keluar) { if (!byBarang.has(r.barang_id)) byBarang.set(r.barang_id, []); byBarang.get(r.barang_id).push(r) }

  // tenaga kerja aktif per minggu (fitur eksogen): karyawan berbeda yang hadir; presensi otomatis dikecualikan
  const hadir = presensi.filter((p) => (p.status_kehadiran || 'hadir') === 'hadir' && p.metode_input !== 'otomatis')
  const idx = new Map(weeksList.map((w, i) => [w, i]))
  const sets = weeksList.map(() => new Set())
  for (const p of hadir) { const i = idx.get(weekStart(p.tanggal)); if (i !== undefined) sets[i].add(p.karyawan_id) }
  const exog = sets.map((s) => s.size)

  const items = barang.map((b) => {
    const { values } = weeklySeries(byBarang.get(b.id) || [], { dateKey: 'created_at', valueKey: 'jumlah', from, to })
    return {
      id: b.id, nama: b.nama_barang, kode: b.kode_barang, satuan: b.satuan_barang?.singkatan || '',
      values, exog, stok: Number(b.stok_saat_ini) || 0, stok_minimal: Number(b.stok_minimal) || 0,
    }
  })
  return { weeks: weeksList, items, meta: { from, to, nTransaksi: keluar.length, nPresensi: hadir.length, exogTersedia: exog.some((v) => v > 0) } }
}

// ───────────────────────── Data kepegawaian ─────────────────────────
/**
 * Memuat data untuk deteksi anomali. `historyDays` menambah riwayat SEBELUM periode agar baseline
 * statistik per karyawan stabil; hasil nanti hanya dilaporkan untuk tanggal ≥ from.
 */
export async function loadWorkforceData({ projectId = null, from, to, historyDays = 60 }) {
  const histFrom = addDays(from, -historyDays)
  const proj = (q) => (projectId ? q.eq('project_id', projectId) : q)
  const [kar, presensi, lembur, kasbon, gaji] = await Promise.all([
    fetchAll((a, b) => supabase.from('karyawan')
      .select('id, nama_karyawan, status_aktif, tanggal_bergabung, jabatan_id, gaji_harian_override, jabatan(gaji_harian)').order('id').range(a, b)),
    fetchAll((a, b) => proj(supabase.from('presensi')
      .select('id, project_id, karyawan_id, tanggal, jam_masuk, jam_keluar, durasi_jam, status_kehadiran, metode_input, catatan')
      .gte('tanggal', histFrom).lte('tanggal', to)).order('id').range(a, b)),
    fetchAll((a, b) => proj(supabase.from('lembur')
      .select('id, project_id, karyawan_id, tanggal, jam_mulai, jam_selesai, durasi_jam, tarif_lembur, total_lembur, status_persetujuan, catatan')
      .gte('tanggal', histFrom).lte('tanggal', to)).order('id').range(a, b)),
    fetchAll((a, b) => proj(supabase.from('kasbon')
      .select('id, project_id, karyawan_id, jumlah_kasbon, sisa_kasbon, tanggal_kasbon, status_lunas')
      .gte('tanggal_kasbon', histFrom).lte('tanggal_kasbon', to)).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('rekap_gaji_mingguan')
      .select('id, karyawan_id, periode_mulai, gaji_kotor, gaji_bersih, total_potongan_kasbon, total_hari_hadir')
      .gte('periode_mulai', histFrom).lte('periode_mulai', to).order('id').range(a, b)),
  ])
  return {
    karyawan: kar.map((k) => ({
      id: k.id, nama_karyawan: k.nama_karyawan, status_aktif: k.status_aktif, tanggal_bergabung: k.tanggal_bergabung, jabatan_id: k.jabatan_id,
      gaji_harian: Number(k.gaji_harian_override || k.jabatan?.gaji_harian || 0),
    })),
    presensi, lembur, kasbon, gaji, today: to, range: { from, to, histFrom },
  }
}

// ───────────────────────── Penyimpanan hasil peramalan ─────────────────────────
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

export async function saveForecastRun(hasil, projectId, { today = new Date() } = {}) {
  const dibuat = isoDate(today)
  const best = hasil.evaluasi.find((m) => m.id === hasil.modelTerbaik)
  const registry = {
    jenis: 'forecast', nama_model: best?.nama || hasil.modelTerbaik, versi: dibuat, aktif: true,
    hyperparameter: hasil.parameter,
    metrik: { evaluasi: hasil.evaluasi.map(({ id, nama, kelompok, mae, rmse, wape, mase, bias, meanRank, wins }) => ({ id, nama, kelompok, mae, rmse, wape, mase, bias, meanRank, wins })), cakupanInterval: hasil.cakupanInterval },
    data_dari: hasil.weeks[0], data_sampai: hasil.weeks[hasil.weeks.length - 1],
  }
  const { data: model, error: e1 } = await supabase.from('ml_model_registry').upsert(registry, { onConflict: 'jenis,nama_model,versi' }).select('id').single()
  if (e1) throw wrap(e1)
  await supabase.from('ml_model_registry').update({ aktif: false }).eq('jenis', 'forecast').neq('id', model.id)

  const fc = [], rek = []
  for (const it of hasil.items) {
    it.forecast.forEach((f, i) => fc.push({
      model_id: model.id, project_id: projectId, barang_id: it.id, dibuat_pada: dibuat, minggu_target: f.minggu, horizon: i + 1,
      yhat: round2(f.yhat), yhat_bawah: round2(f.low), yhat_atas: round2(f.high),
    }))
    const r = it.rekomendasi
    rek.push({
      model_id: model.id, project_id: projectId, barang_id: it.id, dibuat_pada: dibuat,
      titik_pemesanan_ulang: r.reorderPoint, stok_pengaman: r.safetyStock, jumlah_disarankan: r.orderQty,
      perkiraan_habis: r.stockoutWeek, risiko: r.risiko, alasan: { alasan: r.alasan, model: it.modelNama, mase: it.mase ?? null },
    })
  }
  for (const part of chunk(fc, 500)) {
    const { error } = await supabase.from('ml_forecast').upsert(part, { onConflict: 'model_id,barang_id,dibuat_pada,minggu_target' })
    if (error) throw wrap(error)
  }
  for (const part of chunk(rek, 500)) {
    const { error } = await supabase.from('ml_rekomendasi_pengadaan').upsert(part, { onConflict: 'barang_id,dibuat_pada' })
    if (error) throw wrap(error)
  }
  return { saved: true, modelId: model.id, nForecast: fc.length, nRekomendasi: rek.length }
}
const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null)

// ───────────────────────── Anomali: simpan, daftar, tinjau ─────────────────────────
export async function saveAnomalies(items) {
  if (!items.length) return { inserted: 0, updated: 0, dilewati: 0 }
  const existing = []
  for (const tabel of [...new Set(items.map((i) => i.sumber_tabel))]) {
    const ids = items.filter((i) => i.sumber_tabel === tabel).map((i) => i.sumber_id)
    for (const part of chunk(ids, 200)) {
      const { data, error } = await supabase.from('ml_anomali').select('id, sumber_tabel, sumber_id, status_tinjauan').eq('sumber_tabel', tabel).in('sumber_id', part)
      if (error) throw wrap(error)
      existing.push(...(data || []))
    }
  }
  const status = new Map(existing.map((e) => [`${e.sumber_tabel}:${e.sumber_id}`, e.status_tinjauan]))
  // Yang sudah ditinjau admin TIDAK ditimpa; yang masih 'baru' diperbarui skornya.
  const rows = items.filter((i) => !status.has(i.key) || status.get(i.key) === 'baru').map((i) => ({
    sumber_tabel: i.sumber_tabel, sumber_id: i.sumber_id, karyawan_id: i.karyawan_id, project_id: i.project_id,
    tanggal: i.tanggal, skor: Math.round(i.skor * 10000) / 10000, tingkat: i.tingkat, alasan: i.alasan, metode: i.metode,
  }))
  for (const part of chunk(rows, 300)) {
    const { error } = await supabase.from('ml_anomali').upsert(part, { onConflict: 'sumber_tabel,sumber_id' })
    if (error) throw wrap(error)
  }
  const updated = rows.filter((r) => status.has(`${r.sumber_tabel}:${r.sumber_id}`)).length
  return { inserted: rows.length - updated, updated, dilewati: items.length - rows.length }
}

export async function listAnomalies({ status = 'baru', tingkat = null, sumber = null, limit = 500 } = {}) {
  let q = supabase.from('ml_anomali')
    .select('*, karyawan(nama_karyawan), project(nama_project)')
    .order('skor', { ascending: false }).limit(limit)
  if (status && status !== 'semua') q = q.eq('status_tinjauan', status)
  if (tingkat) q = q.eq('tingkat', tingkat)
  if (sumber) q = q.eq('sumber_tabel', sumber)
  const { data, error } = await q
  if (error) throw wrap(error)
  return data || []
}

export const STATUS_TINJAUAN = ['valid', 'bukan_anomali', 'diabaikan']

export async function reviewAnomaly(id, status, catatan, userId) {
  if (!STATUS_TINJAUAN.includes(status)) throw new Error('Status tinjauan tidak valid')
  const { data, error } = await supabase.from('ml_anomali').update({
    status_tinjauan: status, catatan: catatan || null, ditinjau_oleh: userId ?? null, ditinjau_pada: new Date().toISOString(),
  }).eq('id', id).select().single()
  if (error) throw wrap(error)
  return data
}

/** Kunci 'tabel:id' yang sudah ditinjau "bukan anomali"/"diabaikan" → ditekan pada analisis berikutnya. */
export async function getReviewedKeys() {
  try {
    const rows = await fetchAll((a, b) => supabase.from('ml_anomali').select('id, sumber_tabel, sumber_id, status_tinjauan')
      .in('status_tinjauan', ['bukan_anomali', 'diabaikan']).order('id').range(a, b))
    return new Set(rows.map((r) => `${r.sumber_tabel}:${r.sumber_id}`))
  } catch (e) {
    if (e.code === 'ML_TABLE_MISSING') return new Set()
    throw e
  }
}

// ───────────────────────── Pemantauan: prediksi vs realisasi ─────────────────────────
/**
 * Murni: membandingkan ramalan tersimpan dengan pemakaian aktual.
 * @param forecastRows [{ dibuat_pada, minggu_target, horizon, barang_id, yhat }]
 * @param actual Map('barang_id|minggu' → jumlah)
 * @param lastCompleteWeek Senin minggu terakhir yang sudah lengkap (minggu target setelahnya belum dapat dinilai)
 */
export function hitungAkurasi(forecastRows, actual, lastCompleteWeek) {
  const runs = new Map()
  for (const f of forecastRows) {
    if (f.minggu_target > lastCompleteWeek) continue
    const y = actual.get(`${f.barang_id}|${f.minggu_target}`) ?? 0
    const r = runs.get(f.dibuat_pada) || { dibuat_pada: f.dibuat_pada, n: 0, ae: 0, sy: 0, err: 0, byH: new Map() }
    const e = Number(f.yhat) - y
    r.n++; r.ae += Math.abs(e); r.sy += y; r.err += e
    const h = r.byH.get(f.horizon) || { n: 0, ae: 0, sy: 0 }
    h.n++; h.ae += Math.abs(e); h.sy += y; r.byH.set(f.horizon, h)
    runs.set(f.dibuat_pada, r)
  }
  const out = [...runs.values()].sort((a, b) => (a.dibuat_pada < b.dibuat_pada ? -1 : 1)).map((r) => ({
    dibuat_pada: r.dibuat_pada, n: r.n, mae: r.ae / r.n, bias: r.err / r.n, wape: r.sy > 0 ? r.ae / r.sy : null,
    perHorizon: [...r.byH.entries()].sort((a, b) => a[0] - b[0]).map(([h, v]) => ({ h, mae: v.ae / v.n, wape: v.sy > 0 ? v.ae / v.sy : null })),
  }))
  // Deteksi pergeseran (drift): galat run terbaru jauh melampaui rata-rata run sebelumnya
  let drift = { status: 'belum_cukup', pesan: 'Perlu minimal 3 eksekusi yang sudah bisa dinilai untuk memantau pergeseran akurasi.' }
  const wapes = out.map((r) => r.wape).filter((v) => v !== null)
  if (wapes.length >= 3) {
    const prev = mean(wapes.slice(0, -1)), last = wapes[wapes.length - 1]
    drift = last > prev * 1.3
      ? { status: 'memburuk', pesan: `Galat (WAPE) eksekusi terbaru ${(last * 100).toFixed(0)}% naik >30% dari rata-rata sebelumnya (${(prev * 100).toFixed(0)}%). Pertimbangkan melatih ulang / meninjau data.` }
      : { status: 'stabil', pesan: `Galat (WAPE) eksekusi terbaru ${(last * 100).toFixed(0)}% — stabil terhadap rata-rata sebelumnya (${(prev * 100).toFixed(0)}%).` }
  }
  return { runs: out, drift }
}

export async function forecastVsActual(projectId, { today = new Date() } = {}) {
  const thisWeek = weekStart(isoDate(today))
  const lastComplete = addWeeks(thisWeek, -1)
  const fc = await fetchAll((a, b) => supabase.from('ml_forecast')
    .select('dibuat_pada, minggu_target, horizon, barang_id, yhat').eq('project_id', projectId).order('id').range(a, b))
  if (!fc.length) return { runs: [], drift: { status: 'belum_cukup', pesan: 'Belum ada ramalan tersimpan. Jalankan analisis lalu simpan hasilnya.' } }
  const minWeek = fc.reduce((m, f) => (f.minggu_target < m ? f.minggu_target : m), fc[0].minggu_target)
  const rows = await fetchAll((a, b) => supabase.from('stok_keluar')
    .select('id, barang_id, jumlah, created_at').eq('project_id', projectId).gte('created_at', minWeek).lt('created_at', thisWeek).order('id').range(a, b))
  const actual = new Map()
  for (const r of rows) { const k = `${r.barang_id}|${weekStart(r.created_at)}`; actual.set(k, (actual.get(k) || 0) + (Number(r.jumlah) || 0)) }
  return hitungAkurasi(fc, actual, lastComplete)
}

// ───────────────────────── Ringkasan untuk halaman beranda AI ─────────────────────────
export async function ringkasanHub() {
  const out = { anomaliBaru: null, rekomendasi: null, tersedia: true }
  const a = await supabase.from('ml_anomali').select('id', { count: 'exact', head: true }).eq('status_tinjauan', 'baru')
  if (a.error) { if (isMissingTable(a.error)) return { ...out, tersedia: false }; throw wrap(a.error) }
  out.anomaliBaru = a.count || 0
  const last = await supabase.from('ml_rekomendasi_pengadaan').select('dibuat_pada').order('dibuat_pada', { ascending: false }).limit(1)
  if (last.error) throw wrap(last.error)
  if (last.data?.length) {
    const tgl = last.data[0].dibuat_pada
    const { data, error } = await supabase.from('ml_rekomendasi_pengadaan').select('risiko').eq('dibuat_pada', tgl)
    if (error) throw wrap(error)
    const c = { habis: 0, kritis: 0, waspada: 0, aman: 0 }
    for (const r of data || []) if (r.risiko in c) c[r.risiko]++
    out.rekomendasi = { tanggal: tgl, ...c, total: (data || []).length }
  }
  return out
}
