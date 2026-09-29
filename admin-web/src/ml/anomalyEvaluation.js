// Evaluasi detektor anomali pada data sintetis berlabel: perbandingan metode (ablasi) dengan
// presisi, recall, F1, dan ROC-AUC; serta recall per jenis anomali yang disuntikkan.
import { detectAnomalies } from './anomalyDetector'
import { rocAuc, binaryMetrics } from './stats'

export const VARIAN = [
  { id: 'aturan', nama: 'Aturan bisnis saja', methods: { rules: true, stats: false, iforest: false } },
  { id: 'statistik', nama: 'Statistik robust saja', methods: { rules: false, stats: true, iforest: false } },
  { id: 'iforest', nama: 'Isolation Forest saja', methods: { rules: false, stats: false, iforest: true } },
  { id: 'hibrida', nama: 'Hibrida (aturan + statistik + Isolation Forest)', methods: { rules: true, stats: true, iforest: true } },
]

export function evaluateAnomalyMethods(dataset, { threshold = 0.5, seed = 42 } = {}) {
  const { labels } = dataset
  const hasil = VARIAN.map((v) => {
    const res = detectAnomalies({ ...dataset, methods: v.methods, returnAll: true, threshold, seed })
    const actual = res.items.map((i) => (labels.has(i.key) ? 1 : 0))
    const predicted = res.items.map((i) => (i.skor >= threshold ? 1 : 0))
    // AUC memakai skor mentah Isolation Forest untuk varian iforest (resolusi lebih halus)
    const scores = res.items.map((i) => (v.id === 'iforest' ? i.skorIforest ?? 0 : i.skor))
    const perTipe = {}
    res.items.forEach((i, idx) => {
      const t = labels.get(i.key); if (!t) return
      perTipe[t] = perTipe[t] || { n: 0, terdeteksi: 0 }
      perTipe[t].n++; if (predicted[idx]) perTipe[t].terdeteksi++
    })
    return { id: v.id, nama: v.nama, auc: rocAuc(scores, actual), ...binaryMetrics(predicted, actual), perTipe }
  })
  return { hasil, nRecords: labels.size, threshold }
}

/**
 * Sapuan ambang skor: presisi/recall/F1 pada berbagai ambang untuk satu varian (default: hibrida).
 * Menunjukkan pertukaran presisi–recall dan ambang dengan F1 terbaik (dasar memilih sensitivitas).
 */
export function sweepThreshold(dataset, { variant = 'hibrida', thresholds = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9], seed = 42 } = {}) {
  const v = VARIAN.find((x) => x.id === variant)
  const res = detectAnomalies({ ...dataset, methods: v.methods, returnAll: true, threshold: 0, seed })
  const actual = res.items.map((i) => (dataset.labels.has(i.key) ? 1 : 0))
  const rows = thresholds.map((t) => ({ threshold: t, ...binaryMetrics(res.items.map((i) => (i.skor >= t ? 1 : 0)), actual) }))
  const best = rows.reduce((b, r) => (r.f1 > b.f1 ? r : b), rows[0])
  return { rows, best }
}
