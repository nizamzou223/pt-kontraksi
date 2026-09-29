// Kumpulan model peramalan kebutuhan material.
//
// Antarmuka seragam untuk semua model:
//   model = { id, nama, kelompok, fitPredict(items, horizon) → Map(itemId → number[horizon]) }
//   items = [{ id, train: number[], exog?: number[] }]   (train = pemakaian mingguan sampai titik asal)
//
// Model lokal   : dilatih per barang (baseline statistik, Croston/SBA/TSB, RF lama).
// Model global  : satu model untuk SEMUA barang (dinormalisasi per barang) → memanfaatkan data
//                 bersama sehingga tidak kekurangan sampel pada barang yang datanya pendek.
import { RandomForestRegression } from 'ml-random-forest'
import { mean } from './stats'
import { GradientBoosting, RandomForest } from './gbm'

const nonNeg = (a) => a.map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0))
const flat = (v, h) => new Array(h).fill(v)

// ───────────────────────── Model statistik (peramal lokal) ─────────────────────────
export const naive = (train, h) => flat(train.length ? train[train.length - 1] : 0, h)

export const movingAverage = (k) => (train, h) => flat(mean(train.slice(-k)), h)

/** Simple Exponential Smoothing; alpha dipilih dari grid dengan meminimalkan SSE satu langkah. */
export function ses(train, h) {
  if (!train.length) return flat(0, h)
  const init = mean(train.slice(0, Math.min(4, train.length)))
  let bestSse = Infinity, bestLevel = init
  for (let a = 0.05; a <= 0.951; a += 0.05) {
    let level = init, sse = 0
    for (const y of train) { sse += (y - level) ** 2; level = a * y + (1 - a) * level }
    if (sse < bestSse) { bestSse = sse; bestLevel = level }
  }
  return flat(bestLevel, h)
}

/** Croston (1972) untuk permintaan intermiten: ramalan = ukuran permintaan / interval permintaan. */
export function croston(alpha = 0.1, { sba = false } = {}) {
  return (train, h) => {
    let z = null, p = null, q = 1
    for (const y of train) {
      if (y > 0) {
        if (z === null) { z = y; p = q } else { z = alpha * y + (1 - alpha) * z; p = alpha * q + (1 - alpha) * p }
        q = 1
      } else q++
    }
    if (z === null) return flat(0, h)
    const f = z / p
    return flat(sba ? f * (1 - alpha / 2) : f, h) // SBA: koreksi bias Syntetos–Boylan (2005)
  }
}

/** TSB (Teunter–Syntetos–Babai 2011): probabilitas permintaan diperbarui SETIAP periode → peka obsolescence. */
export function tsb(alpha = 0.1, beta = 0.1) {
  return (train, h) => {
    const nz = train.filter((v) => v > 0)
    if (!nz.length) return flat(0, h)
    let z = nz[0]
    let p = nz.length / train.length
    for (const y of train) {
      p = p + beta * ((y > 0 ? 1 : 0) - p)
      if (y > 0) z = alpha * y + (1 - alpha) * z
    }
    return flat(p * z, h)
  }
}

// ───────────── Random Forest LAMA (meniru services/predictionService.js) ─────────────
// Disertakan HANYA sebagai pembanding "sebelum": lag 4, 60 pohon, hasil dibulatkan, dan
// bila data terlalu sedikit memakai rata-rata — persis perilaku fitur Prediksi Stok saat ini.
export function rfLama(train, h) {
  const lag = 4
  const nonZero = train.filter((v) => v > 0).length
  if (train.length < lag + 3 || nonZero < 3) return flat(Math.round(mean(train)), h)
  const X = [], y = []
  for (let i = lag; i < train.length; i++) { X.push(train.slice(i - lag, i)); y.push(train[i]) }
  const rf = new RandomForestRegression({ nEstimators: 60, maxFeatures: 0.8, replacement: true, seed: 42 })
  rf.train(X, y)
  let win = train.slice(-lag)
  const out = []
  for (let i = 0; i < h; i++) {
    const v = Math.round(Math.max(0, rf.predict([win])[0]))
    out.push(v)
    win = [...win.slice(1), v]
  }
  return out
}

// ───────────────────────── Model global (RF / Gradient Boosting) ─────────────────────────
const LAGS = 4
const SINCE_CAP = 12

/** Fitur satu titik prediksi dari riwayat `hist` (skala asli) — dinormalisasi oleh skala barang `s`. */
export function featureRow(hist, s, exogLag = null, exogScale = 1) {
  const n = hist.length
  const at = (k) => (n - k >= 0 ? hist[n - k] : 0)
  const row = []
  for (let k = 1; k <= LAGS; k++) row.push(at(k) / s)
  const last4 = hist.slice(-4), last8 = hist.slice(-8)
  row.push(mean(last4) / s, mean(last8) / s)
  let since = 0
  for (let i = n - 1; i >= 0 && hist[i] === 0 && since < SINCE_CAP; i--) since++
  row.push(since / SINCE_CAP)
  row.push(last8.length ? last8.filter((v) => v > 0).length / last8.length : 0)
  if (exogLag !== null) row.push(exogLag / (exogScale || 1))
  row.push(Math.log1p(s))
  return row
}

const itemScale = (train) => Math.max(mean(train), 1e-6)

/**
 * @param learner 'rf' | 'gbm'
 * @param useExog memakai tenaga kerja aktif (jumlah pekerja hadir minggu sebelumnya) sebagai fitur
 */
export function createGlobalModel({ id, nama, learner = 'gbm', useExog = false, maxWeeks = 104 }) {
  return {
    id, nama, kelompok: 'global',
    fitPredict(items, horizon) {
      const X = [], y = []
      const meta = new Map()
      for (const it of items) {
        const train = it.train.slice(-maxWeeks)
        const exog = useExog && it.exog ? it.exog.slice(-maxWeeks) : null
        const s = itemScale(train)
        const es = exog ? Math.max(mean(exog), 1e-6) : 1
        meta.set(it.id, { s, es, exogLast: exog ? exog[exog.length - 1] : null })
        if (mean(train) === 0) continue // barang tak pernah dipakai: tidak ada informasi belajar
        for (let t = LAGS; t < train.length; t++) {
          X.push(featureRow(train.slice(0, t), s, exog ? exog[t - 1] : null, es))
          y.push(train[t] / s)
        }
      }

      let predictRow
      if (X.length < 12) {
        const m = mean(y) || 0
        predictRow = () => m
      } else if (learner === 'rf') {
        const rf = new RandomForest({ nEstimators: 60, maxDepth: 8, minLeaf: 3, maxFeatures: 0.8, seed: 42 }).fit(X, y)
        predictRow = (row) => rf.predictOne(row)
      } else {
        const gb = new GradientBoosting({ nEstimators: 80, learningRate: 0.1, maxDepth: 3, minLeaf: 5, subsample: 0.8, seed: 42 }).fit(X, y)
        predictRow = (row) => gb.predictOne(row)
      }

      const out = new Map()
      for (const it of items) {
        const { s, es, exogLast } = meta.get(it.id)
        const hist = it.train.slice(-maxWeeks)
        if (mean(hist) === 0) { out.set(it.id, flat(0, horizon)); continue }
        const preds = []
        for (let k = 0; k < horizon; k++) {
          const row = featureRow(hist, s, exogLast, es)
          const v = Math.max(0, predictRow(row) * s)
          preds.push(v)
          hist.push(v) // rekursif: ramalan dipakai sebagai lag berikutnya
        }
        out.set(it.id, nonNeg(preds))
      }
      return out
    },
  }
}

/** Membungkus fungsi per-barang menjadi model dengan antarmuka seragam. */
export const localModel = (id, nama, fn) => ({
  id, nama, kelompok: 'lokal',
  fitPredict(items, horizon) {
    const out = new Map()
    for (const it of items) out.set(it.id, nonNeg(fn(it.train, horizon)))
    return out
  },
})

/** Daftar model yang dibandingkan pada evaluasi. */
export function defaultModels({ withExog = false } = {}) {
  const models = [
    localModel('naive', 'Naive (nilai terakhir)', naive),
    localModel('ma4', 'Rata-rata bergerak 4 minggu', movingAverage(4)),
    localModel('ses', 'Exponential Smoothing (SES)', ses),
    localModel('croston', 'Croston', croston(0.1)),
    localModel('sba', 'Croston-SBA', croston(0.1, { sba: true })),
    localModel('tsb', 'TSB', tsb(0.1, 0.1)),
    localModel('rf_lama', 'Random Forest lag-4 (metode lama)', rfLama),
    createGlobalModel({ id: 'rf_global', nama: 'Random Forest global', learner: 'rf' }),
    createGlobalModel({ id: 'gbm_global', nama: 'Gradient Boosting global', learner: 'gbm' }),
  ]
  if (withExog) {
    models.push(createGlobalModel({ id: 'gbm_exog', nama: 'Gradient Boosting global + tenaga kerja', learner: 'gbm', useExog: true }))
  }
  return models
}
