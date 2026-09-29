// Pipeline peramalan end-to-end (murni; dapat berjalan di Web Worker maupun Node):
//   evaluasi rolling-origin → pilih model → latih ulang pada seluruh data → ramalan + interval
//   → rekomendasi pengadaan.
import { mean } from './stats'
import { addWeeks, intermittency } from './timeseries'
import { defaultModels } from './forecasters'
import { rollingOrigin, summarize, bestModelId, pickModelPerItem, calibrateIntervals, applyInterval, evaluateCoverage } from './evaluation'
import { recommendReplenishment } from './inventoryPolicy'

export const SERVICE_Z = { 90: 1.28, 95: 1.65, 99: 2.33 }

/**
 * @param weeks  daftar Senin (urut naik) — panjang = panjang values
 * @param items  [{ id, nama, satuan?, values, exog?, stok, stok_minimal }]
 */
export function runForecastPipeline({
  weeks, items, horizon = 4, nOrigins = 8, minTrain = 20,
  leadTimeWeeks = 1, serviceLevel = 95, models, useExog = false, onProgress,
}) {
  const usable = items.filter((it) => it.values.length === weeks.length)
  const modelList = models || defaultModels({ withExog: useExog && usable.every((i) => i.exog) })
  if (weeks.length < minTrain + horizon + 2) {
    return { ok: false, alasan: `Riwayat terlalu pendek (${weeks.length} minggu). Diperlukan minimal ${minTrain + horizon + 2} minggu untuk evaluasi yang sah.` }
  }

  // 1) Evaluasi (model hanya melihat data sebelum titik asal)
  const records = rollingOrigin({ items: usable, models: modelList, horizon, nOrigins, minTrain, onProgress: (p, nama) => onProgress?.(p * 0.85, `Evaluasi: ${nama}`) })
  const summary = summarize(records, modelList)
  const globalBest = bestModelId(summary)
  const { choice } = pickModelPerItem(summary, records)

  // 2) Latih ulang model yang dipakai pada SELURUH data → ramalan minggu depan
  const needed = [...new Set(choice.values())]
  const trainAll = usable.map((it) => ({ id: it.id, train: it.values, exog: it.exog }))
  const forecasts = new Map()
  needed.forEach((mid, i) => {
    onProgress?.(0.85 + (0.13 * (i + 1)) / needed.length, `Ramalan: ${modelList.find((m) => m.id === mid)?.nama}`)
    forecasts.set(mid, modelList.find((m) => m.id === mid).fitPredict(trainAll, horizon))
  })

  // 3) Interval & rekomendasi
  const startWeek = addWeeks(weeks[weeks.length - 1], 1)
  const calCache = new Map()
  const cal = (mid) => { if (!calCache.has(mid)) calCache.set(mid, calibrateIntervals(records, mid)); return calCache.get(mid) }
  const rmseByModel = new Map(summary.models.map((m) => [m.id, m.rmse]))

  const hasil = usable.map((it) => {
    const mid = choice.get(it.id)
    const yhat = forecasts.get(mid).get(it.id)
    const m = mean(it.values)
    const c = cal(mid)
    const band = yhat.map((v, i) => ({ minggu: addWeeks(startWeek, i), yhat: v, ...applyInterval(v, m, c[i + 1]) }))
    // galat 1 minggu barang ini pada model terpilih; bila tak ada, pakai RMSE global model tsb
    const own = records.filter((r) => r.modelId === mid && r.itemId === it.id && r.h === 1)
    const sigma = own.length >= 3 ? Math.sqrt(mean(own.map((r) => (r.y - r.yhat) ** 2))) : (rmseByModel.get(mid) || 0)
    const rekomendasi = recommendReplenishment({
      forecast: yhat, sigmaWeekly: sigma, stock: it.stok ?? 0, minStock: it.stok_minimal ?? 0,
      leadTimeWeeks, z: SERVICE_Z[serviceLevel] ?? 1.65, startWeek, unit: it.satuan || '',
    })
    return {
      id: it.id, nama: it.nama, satuan: it.satuan, stok: it.stok, stok_minimal: it.stok_minimal,
      values: it.values, pola: intermittency(it.values),
      modelId: mid, modelNama: modelList.find((x) => x.id === mid)?.nama,
      mase: summary.perItem.get(it.id)?.get(mid),
      forecast: band, rekomendasi,
    }
  })

  return {
    ok: true,
    parameter: { horizon, nOrigins, leadTimeWeeks, serviceLevel, nItems: usable.length, nWeeks: weeks.length, startWeek },
    evaluasi: summary.models,
    modelTerbaik: globalBest,
    cakupanInterval: evaluateCoverage(records, globalBest),
    items: hasil,
    weeks,
  }
}
