/**
 * PREDICTION SERVICE — Prediksi kebutuhan/stok barang ke depan
 * menggunakan Machine Learning (Random Forest Regressor).
 *
 * Alur:
 *  1. Ambil histori transaksi stok_keluar (pemakaian barang) per project.
 *  2. Agregasi jadi deret waktu mingguan per barang.
 *  3. Bentuk data supervised: X = pemakaian `lag` minggu terakhir, y = pemakaian minggu berikutnya.
 *  4. Latih RandomForestRegression (ml-random-forest) per barang.
 *  5. Forecast beberapa minggu ke depan secara rekursif (hasil prediksi jadi lag berikutnya).
 *  6. Proyeksikan stok akhir = stok saat ini − total prediksi kebutuhan, untuk deteksi dini stok kritis/habis.
 */
import { RandomForestRegression as RFRegressor } from 'ml-random-forest'
import supabase from './supabaseClient'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const DEFAULT_HISTORY_WEEKS = 26
const DEFAULT_LAG = 4
const DEFAULT_HORIZON = 4
const MIN_NONZERO_SAMPLES = 3

// ── Agregasi transaksi stok_keluar jadi deret mingguan (oldest → newest) ────
function aggregateWeekly(rows, weeks) {
  const now = Date.now()
  const buckets = Array(weeks).fill(0)
  for (const row of rows) {
    const t = new Date(row.created_at).getTime()
    if (Number.isNaN(t)) continue
    const weeksAgo = Math.floor((now - t) / MS_PER_WEEK)
    const idx = weeks - 1 - weeksAgo
    if (idx >= 0 && idx < weeks) buckets[idx] += Number(row.jumlah) || 0
  }
  return buckets
}

// ── Bentuk dataset supervised dari deret waktu (sliding window) ────────────
function buildSupervised(series, lag) {
  const X = [], y = []
  for (let i = lag; i < series.length; i++) {
    X.push(series.slice(i - lag, i))
    y.push(series[i])
  }
  return { X, y }
}

// ── Latih Random Forest Regressor lalu forecast beberapa periode ke depan ──
function trainAndForecast(series, { lag = DEFAULT_LAG, horizon = DEFAULT_HORIZON } = {}) {
  const nonZero = series.filter(v => v > 0).length

  // Data historis terlalu sedikit/jarang untuk melatih model yang berarti —
  // fallback ke rata-rata pemakaian supaya tetap ada estimasi (bukan machine
  // learning, tapi mencegah training gagal/overfit pada data hampir kosong).
  if (series.length < lag + MIN_NONZERO_SAMPLES || nonZero < MIN_NONZERO_SAMPLES) {
    const avg = series.length ? series.reduce((s, v) => s + v, 0) / series.length : 0
    return {
      metode: 'rata-rata (data historis belum cukup)',
      insufficientData: true,
      prediksi: Array(horizon).fill(Math.round(avg)),
    }
  }

  const { X, y } = buildSupervised(series, lag)
  const rf = new RFRegressor({
    nEstimators: 60,
    maxFeatures: 0.8,
    replacement: true,
    seed: 42,
  })
  rf.train(X, y)

  // Forecast rekursif: hasil prediksi minggu ke-n dipakai sebagai lag untuk minggu ke-n+1
  let window = series.slice(-lag)
  const prediksi = []
  for (let i = 0; i < horizon; i++) {
    const pred = Math.max(0, rf.predict([window])[0])
    const rounded = Math.round(pred)
    prediksi.push(rounded)
    window = [...window.slice(1), rounded]
  }
  return { metode: 'Random Forest Regressor', insufficientData: false, prediksi }
}

export const predictionService = {
  // Prediksi kebutuhan & proyeksi stok untuk SEMUA barang pada satu project.
  // Hanya 2 query DB total (bukan N+1) — training RF per barang dilakukan di memori.
  async prediksiSemuaBarang(projectId, opts = {}) {
    const { historyWeeks = DEFAULT_HISTORY_WEEKS, lag = DEFAULT_LAG, horizon = DEFAULT_HORIZON } = opts
    const since = new Date(Date.now() - historyWeeks * MS_PER_WEEK).toISOString()

    const [{ data: barangList, error: e1 }, { data: keluarRows, error: e2 }] = await Promise.all([
      supabase.from('barang')
        .select('id, nama_barang, kode_barang, stok_saat_ini, stok_minimal, satuan_barang(singkatan)')
        .eq('project_id', projectId).order('nama_barang'),
      supabase.from('stok_keluar')
        .select('barang_id, jumlah, created_at')
        .eq('project_id', projectId).gte('created_at', since),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)

    const byBarang = new Map()
    for (const row of keluarRows || []) {
      if (!byBarang.has(row.barang_id)) byBarang.set(row.barang_id, [])
      byBarang.get(row.barang_id).push(row)
    }

    return (barangList || []).map(b => {
      const series = aggregateWeekly(byBarang.get(b.id) || [], historyWeeks)
      const hasil = trainAndForecast(series, { lag, horizon })
      const totalPrediksiKebutuhan = hasil.prediksi.reduce((s, v) => s + v, 0)
      const proyeksiStokAkhir = Math.max(0, (b.stok_saat_ini || 0) - totalPrediksiKebutuhan)
      const rataRataPerMinggu = series.length ? series.reduce((s, v) => s + v, 0) / series.length : 0

      return {
        barang: b,
        series,
        rataRataPerMinggu,
        ...hasil,
        totalPrediksiKebutuhan,
        proyeksiStokAkhir,
        akanHabis: !hasil.insufficientData && proyeksiStokAkhir <= 0 && totalPrediksiKebutuhan > 0,
        akanKritis: !hasil.insufficientData && proyeksiStokAkhir > 0 && proyeksiStokAkhir <= (b.stok_minimal || 0),
      }
    })
  },
}
