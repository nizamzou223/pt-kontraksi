// Evaluasi peramalan dengan validasi ROLLING-ORIGIN (berbasis urutan waktu, bukan acak).
//
// Pada tiap titik asal t model HANYA melihat data sebelum t, lalu diuji pada minggu t … t+H−1.
// Dengan begitu tidak ada kebocoran data masa depan (data leakage) — sumber klaim akurasi palsu
// yang paling umum pada penelitian deret waktu.
import { mean, quantile } from './stats'
import { naiveScale } from './timeseries'

/**
 * @param items   [{ id, nama, values: number[], exog?: number[] }]  — semua sama panjang & sejajar minggu
 * @param models  daftar model (lihat forecasters.js)
 * @returns records [{ modelId, itemId, origin, h, y, yhat, scale, itemMean }]
 */
export function rollingOrigin({ items, models, horizon = 4, nOrigins = 8, minTrain = 20, onProgress }) {
  const n = items[0]?.values.length || 0
  const lastOrigin = n - horizon
  const firstOrigin = Math.max(minTrain, lastOrigin - nOrigins + 1)
  const records = []
  let step = 0
  const totalSteps = (lastOrigin - firstOrigin + 1) * models.length

  for (let t = firstOrigin; t <= lastOrigin; t++) {
    const trainItems = items.map((it) => ({ id: it.id, train: it.values.slice(0, t), exog: it.exog ? it.exog.slice(0, t) : undefined }))
    const scales = new Map(trainItems.map((it) => [it.id, { scale: naiveScale(it.train), mean: mean(it.train) }]))
    for (const model of models) {
      const preds = model.fitPredict(trainItems, horizon)
      for (const it of items) {
        const yhat = preds.get(it.id) || []
        const { scale, mean: itemMean } = scales.get(it.id)
        for (let h = 1; h <= horizon; h++) {
          records.push({ modelId: model.id, itemId: it.id, origin: t, h, y: it.values[t + h - 1], yhat: yhat[h - 1] ?? 0, scale, itemMean })
        }
      }
      onProgress?.(++step / totalSteps, model.nama, t)
    }
  }
  return records
}

// ───────────────────────── Metrik ─────────────────────────
function metricsOf(recs) {
  if (!recs.length) return { n: 0, mae: NaN, rmse: NaN, wape: NaN, mase: NaN, bias: NaN }
  let ae = 0, se = 0, sy = 0, err = 0, maseSum = 0, maseN = 0
  for (const r of recs) {
    const e = r.yhat - r.y
    ae += Math.abs(e); se += e * e; sy += Math.abs(r.y); err += e
    if (r.scale > 0) { maseSum += Math.abs(e) / r.scale; maseN++ }
  }
  return {
    n: recs.length,
    mae: ae / recs.length,
    rmse: Math.sqrt(se / recs.length),
    wape: sy > 0 ? ae / sy : NaN,          // WAPE cocok untuk data intermiten (sMAPE/MAPE meledak pada nol)
    mase: maseN ? maseSum / maseN : NaN,   // <1 = lebih baik daripada naive pada data latih
    bias: err / recs.length,               // >0 = cenderung meramal berlebih
  }
}

const groupBy = (arr, keyFn) => {
  const m = new Map()
  for (const x of arr) { const k = keyFn(x); (m.get(k) || m.set(k, []).get(k)).push(x) }
  return m
}

/** Ringkasan per model: metrik agregat, peringkat rata-rata per barang, jumlah barang yang dimenangkan. */
export function summarize(records, models) {
  const byModel = groupBy(records, (r) => r.modelId)
  const perItem = new Map() // itemId → Map(modelId → mase)
  for (const [modelId, recs] of byModel) {
    for (const [itemId, rs] of groupBy(recs, (r) => r.itemId)) {
      if (!perItem.has(itemId)) perItem.set(itemId, new Map())
      perItem.get(itemId).set(modelId, metricsOf(rs).mase)
    }
  }
  const rankSum = new Map(), wins = new Map(), rankN = new Map()
  for (const [, mm] of perItem) {
    const ranked = [...mm.entries()].filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[1] - b[1])
    ranked.forEach(([id], i) => { rankSum.set(id, (rankSum.get(id) || 0) + i + 1); rankN.set(id, (rankN.get(id) || 0) + 1) })
    if (ranked.length) wins.set(ranked[0][0], (wins.get(ranked[0][0]) || 0) + 1)
  }
  const rows = models.map((m) => {
    const recs = byModel.get(m.id) || []
    return {
      id: m.id, nama: m.nama, kelompok: m.kelompok,
      ...metricsOf(recs),
      meanRank: rankN.get(m.id) ? rankSum.get(m.id) / rankN.get(m.id) : NaN,
      wins: wins.get(m.id) || 0,
      perHorizon: [...groupBy(recs, (r) => r.h).entries()].sort((a, b) => a[0] - b[0]).map(([h, rs]) => ({ h, ...metricsOf(rs) })),
    }
  })
  return { models: rows, perItem }
}

/** Model global terbaik = MASE terkecil (seri → RMSE). Hanya model dengan nilai MASE yang sah. */
export function bestModelId(summary) {
  const ok = summary.models.filter((m) => Number.isFinite(m.mase))
  ok.sort((a, b) => a.mase - b.mase || a.rmse - b.rmse)
  return ok[0]?.id
}

/**
 * Model terpilih per barang: pemenang lokal HANYA dipakai bila jelas lebih baik (≥ margin) daripada
 * model global terbaik dan datanya cukup; selain itu tetap model global → mengurangi "selection noise".
 */
export function pickModelPerItem(summary, records, { margin = 0.05, minOrigins = 4 } = {}) {
  const globalBest = bestModelId(summary)
  const originsPerItem = new Map()
  for (const r of records) {
    if (!originsPerItem.has(r.itemId)) originsPerItem.set(r.itemId, new Set())
    originsPerItem.get(r.itemId).add(r.origin)
  }
  const choice = new Map()
  for (const [itemId, mm] of summary.perItem) {
    const gb = mm.get(globalBest)
    const ranked = [...mm.entries()].filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[1] - b[1])
    const [bestId, bestVal] = ranked[0] || []
    const enough = (originsPerItem.get(itemId)?.size || 0) >= minOrigins
    choice.set(itemId, enough && bestId && Number.isFinite(gb) && bestVal < gb * (1 - margin) ? bestId : globalBest)
  }
  return { globalBest, choice }
}

// ───────────────────────── Interval ketidakpastian ─────────────────────────
/**
 * Kalibrasi interval empiris: kuantil galat (y − ŷ) yang dinormalisasi dengan rata-rata pemakaian barang,
 * per horizon. Tanpa asumsi distribusi normal — cocok untuk data intermiten yang miring.
 */
export function calibrateIntervals(records, modelId, { lo = 0.1, hi = 0.9 } = {}) {
  const rs = records.filter((r) => r.modelId === modelId && r.itemMean > 0)
  const out = {}
  for (const [h, group] of groupBy(rs, (r) => r.h)) {
    const errs = group.map((r) => (r.y - r.yhat) / r.itemMean)
    out[h] = { lo: quantile(errs, lo), hi: quantile(errs, hi), n: errs.length }
  }
  return out
}

export function applyInterval(yhat, itemMean, cal) {
  if (!cal) return { low: yhat, high: yhat }
  return { low: Math.max(0, yhat + cal.lo * itemMean), high: Math.max(yhat, yhat + cal.hi * itemMean) }
}

/**
 * Uji cakupan: kalibrasi pada titik asal awal (60%), uji pada sisanya → PICP (proporsi realisasi
 * yang jatuh di dalam interval) dan lebar interval rata-rata (relatif terhadap rata-rata pemakaian).
 */
export function evaluateCoverage(records, modelId, { split = 0.6, lo = 0.1, hi = 0.9 } = {}) {
  const rs = records.filter((r) => r.modelId === modelId && r.itemMean > 0)
  const origins = [...new Set(rs.map((r) => r.origin))].sort((a, b) => a - b)
  if (origins.length < 3) return { picp: NaN, width: NaN, nominal: hi - lo, n: 0 }
  const cut = origins[Math.max(0, Math.floor(origins.length * split) - 1)]
  const cal = calibrateIntervals(rs.filter((r) => r.origin <= cut), modelId, { lo, hi })
  const test = rs.filter((r) => r.origin > cut)
  let inside = 0, width = 0, n = 0
  for (const r of test) {
    const c = cal[r.h]; if (!c) continue
    const { low, high } = applyInterval(r.yhat, r.itemMean, c)
    if (r.y >= low && r.y <= high) inside++
    width += (high - low) / r.itemMean; n++
  }
  return { picp: n ? inside / n : NaN, width: n ? width / n : NaN, nominal: hi - lo, n }
}
