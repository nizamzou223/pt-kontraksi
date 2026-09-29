import { describe, it, expect } from 'vitest'
import { quantile, median, mad, robustZ, rocAuc, binaryMetrics, mulberry32 } from '../ml/stats'
import { weekStart, weekRange, addWeeks, weeklySeries, intermittency, naiveScale } from '../ml/timeseries'
import { naive, movingAverage, ses, croston, tsb, rfLama, createGlobalModel, localModel, defaultModels } from '../ml/forecasters'
import { GradientBoosting } from '../ml/gbm'
import { rollingOrigin, summarize, bestModelId, pickModelPerItem, calibrateIntervals, applyInterval, evaluateCoverage } from '../ml/evaluation'
import { recommendReplenishment } from '../ml/inventoryPolicy'
import { runForecastPipeline } from '../ml/forecastPipeline'
import { generateMaterialDemand } from '../ml/synthetic'

describe('stats', () => {
  it('kuantil, median, MAD', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75)
    expect(median([5, 1, 3])).toBe(3)
    expect(mad([1, 2, 3, 4, 100])).toBe(1)              // tahan terhadap pencilan
  })
  it('skor-z robust: pencilan besar, nilai normal ≈ 0, MAD nol → fallback', () => {
    const data = [8, 8, 8.5, 7.5, 8, 8.2, 7.8]
    const med = median(data), m = mad(data, med)
    expect(Math.abs(robustZ(8, med, m))).toBeLessThan(0.5)
    expect(robustZ(16, med, m)).toBeGreaterThan(5)
    expect(robustZ(10, 8, 0, 1)).toBe(2)
    expect(robustZ(10, 8, 0, 0)).toBe(0)
  })
  it('ROC-AUC: pemisahan sempurna = 1, acak ≈ 0,5, terbalik = 0, skor kembar ditangani', () => {
    expect(rocAuc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1])).toBe(1)
    expect(rocAuc([0.9, 0.8, 0.2, 0.1], [0, 0, 1, 1])).toBe(0)
    expect(rocAuc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBe(0.5)
    expect(rocAuc([0.1, 0.2], [1, 1])).toBeNaN()
  })
  it('presisi/recall/F1', () => {
    const m = binaryMetrics([1, 1, 0, 0, 1], [1, 0, 0, 1, 1])
    expect(m).toMatchObject({ tp: 2, fp: 1, fn: 1, tn: 1 })
    expect(m.precision).toBeCloseTo(2 / 3); expect(m.recall).toBeCloseTo(2 / 3)
  })
  it('generator acak berbenih: deterministik', () => {
    const a = mulberry32(5), b = mulberry32(5)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('timeseries', () => {
  it('weekStart: Senin sebagai awal minggu (Minggu masuk minggu sebelumnya)', () => {
    expect(weekStart('2026-09-21')).toBe('2026-09-21')   // Senin
    expect(weekStart('2026-09-27')).toBe('2026-09-21')   // Minggu
    expect(weekStart('2026-09-28T10:00:00')).toBe('2026-09-28')
    expect(addWeeks('2026-09-21', 2)).toBe('2026-10-05')
    expect(weekRange('2026-09-22', '2026-10-06')).toEqual(['2026-09-21', '2026-09-28', '2026-10-05'])
  })
  it('weeklySeries: minggu tanpa transaksi diisi 0 eksplisit', () => {
    const rows = [
      { created_at: '2026-09-21T08:00:00', jumlah: 5 },
      { created_at: '2026-09-23T08:00:00', jumlah: 3 },
      { created_at: '2026-10-06T08:00:00', jumlah: 7 },
    ]
    const s = weeklySeries(rows)
    expect(s.weeks).toEqual(['2026-09-21', '2026-09-28', '2026-10-05'])
    expect(s.values).toEqual([8, 0, 7])
  })
  it('weeklySeries dengan from/to mengisi minggu di luar data', () => {
    const s = weeklySeries([{ created_at: '2026-09-22', jumlah: 4 }], { from: '2026-09-14', to: '2026-09-28' })
    expect(s.values).toEqual([0, 4, 0])
  })
  it('klasifikasi pola permintaan Syntetos–Boylan', () => {
    expect(intermittency([10, 11, 9, 10, 12, 10, 11, 9]).category).toBe('smooth')
    expect(intermittency([1, 30, 2, 25, 1, 40, 3, 20]).category).toBe('erratic')
    expect(intermittency([0, 5, 0, 0, 5, 0, 0, 5, 0, 5]).category).toBe('intermittent')
    expect(intermittency([0, 1, 0, 0, 0, 40, 0, 0, 0, 3, 0, 0]).category).toBe('lumpy')
  })
  it('naiveScale', () => expect(naiveScale([1, 3, 2, 6])).toBeCloseTo((2 + 1 + 4) / 3))
})

describe('model peramalan', () => {
  it('naive, moving average, SES pada deret konstan', () => {
    expect(naive([3, 3, 3], 3)).toEqual([3, 3, 3])
    expect(movingAverage(4)([1, 2, 3, 4, 5, 6], 2)).toEqual([4.5, 4.5])
    ses([7, 7, 7, 7, 7], 2).forEach((v) => expect(v).toBeCloseTo(7))
  })
  it('Croston: nilai sesuai perhitungan tangan; SBA mengoreksi bias', () => {
    const s = [0, 0, 5, 0, 0, 5, 0, 0, 5]
    expect(croston(0.1)(s, 1)[0]).toBeCloseTo(5 / 3, 6)
    expect(croston(0.1, { sba: true })(s, 1)[0]).toBeCloseTo((5 / 3) * 0.95, 6)
    expect(croston(0.1)([0, 0, 0], 2)).toEqual([0, 0])
  })
  it('TSB pada permintaan konstan → mendekati nilai itu; turun bila permintaan berhenti', () => {
    expect(tsb()([4, 4, 4, 4, 4, 4], 1)[0]).toBeCloseTo(4, 5)
    const stopped = tsb(0.1, 0.2)([5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0], 1)[0]
    expect(stopped).toBeLessThan(2)                     // peka terhadap obsolescence, Croston tidak
    expect(croston(0.1)([5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0], 1)[0]).toBeGreaterThan(stopped)
  })
  it('RF lama: fallback rata-rata bila data pendek; hasil bulat & tak negatif', () => {
    expect(rfLama([1, 2, 3], 2)).toEqual([2, 2])
    const out = rfLama([5, 0, 8, 0, 6, 0, 9, 0, 7, 0, 8, 0], 3)
    out.forEach((v) => { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0) })
  })
  it('Gradient Boosting mempelajari fungsi sederhana & deterministik', () => {
    const rand = mulberry32(1)
    const X = Array.from({ length: 200 }, () => [rand() * 10, rand()])
    const y = X.map(([a]) => 2 * a + 1)
    const g1 = new GradientBoosting({ nEstimators: 120, seed: 3 }).fit(X, y)
    const g2 = new GradientBoosting({ nEstimators: 120, seed: 3 }).fit(X, y)
    const pred = g1.predict(X)
    const mse = pred.reduce((s, p, i) => s + (p - y[i]) ** 2, 0) / y.length
    const varY = y.reduce((s, v) => s + (v - 11) ** 2, 0) / y.length
    expect(1 - mse / varY).toBeGreaterThan(0.95)        // R² tinggi
    expect(g2.predict(X)).toEqual(pred)
  })
  it('model global: keluaran tak negatif, panjang = horizon, barang nol → nol, deterministik', () => {
    const d = generateMaterialDemand({ items: 6, weeks: 40, seed: 3 })
    const items = d.items.map((i) => ({ id: i.id, train: i.values, exog: i.exog }))
    items.push({ id: 999, train: new Array(40).fill(0) })
    for (const learner of ['rf', 'gbm']) {
      const m = createGlobalModel({ id: learner, nama: learner, learner })
      const a = m.fitPredict(items, 4), b = m.fitPredict(items, 4)
      for (const [, v] of a) { expect(v).toHaveLength(4); v.forEach((x) => expect(x).toBeGreaterThanOrEqual(0)) }
      expect(a.get(999)).toEqual([0, 0, 0, 0])
      expect(Object.fromEntries(a)).toEqual(Object.fromEntries(b))
    }
  })
})

describe('evaluasi rolling-origin', () => {
  const series = Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? 10 : 2))
  const items = [{ id: 1, nama: 'A', values: series }]

  it('TIDAK ada kebocoran data: model hanya menerima data sebelum titik asal', () => {
    const seen = []
    const spy = { id: 'spy', nama: 'spy', kelompok: 'lokal', fitPredict(its, h) {
      its.forEach((it) => seen.push(it.train.length))
      return new Map(its.map((it) => [it.id, new Array(h).fill(0)]))
    } }
    const recs = rollingOrigin({ items, models: [spy], horizon: 4, nOrigins: 6, minTrain: 20 })
    expect(seen).toEqual([30, 31, 32, 33, 34, 35, 36].slice(-6))           // titik asal berurutan, <= n − horizon
    for (const r of recs) {
      expect(r.y).toBe(series[r.origin + r.h - 1])                       // y = realisasi minggu target
      expect(r.origin + r.h - 1).toBeGreaterThanOrEqual(r.origin)         // target selalu SETELAH data latih
    }
  })
  it('data latih adalah awalan persis dari deret asli (tidak diacak)', () => {
    let ok = true
    const m = { id: 'chk', nama: 'chk', kelompok: 'lokal', fitPredict(its, h) {
      its.forEach((it) => { if (JSON.stringify(it.train) !== JSON.stringify(series.slice(0, it.train.length))) ok = false })
      return new Map(its.map((it) => [it.id, new Array(h).fill(1)]))
    } }
    rollingOrigin({ items, models: [m], horizon: 3, nOrigins: 5, minTrain: 20 })
    expect(ok).toBe(true)
  })
  it('metrik: MAE, RMSE, bias, WAPE, MASE dihitung benar', () => {
    const fixed = localModel('f', 'F', () => [5, 5])
    const it = [{ id: 1, nama: 'A', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }]
    const recs = rollingOrigin({ items: it, models: [fixed], horizon: 2, nOrigins: 1, minTrain: 3 })
    // origin = 8 → y = [9, 10], yhat = [5, 5] → e = [-4, -5]
    const m = summarize(recs, [fixed]).models[0]
    expect(m.mae).toBeCloseTo(4.5); expect(m.rmse).toBeCloseTo(Math.sqrt((16 + 25) / 2))
    expect(m.bias).toBeCloseTo(-4.5); expect(m.wape).toBeCloseTo(9 / 19)
    expect(m.mase).toBeCloseTo(4.5 / 1)                   // skala naive deret 1..8 = 1
  })
  it('peringkat & kemenangan; model terbaik memiliki MASE terkecil', () => {
    const good = localModel('good', 'Bagus', (t, h) => new Array(h).fill(t[t.length - 5] ?? 0)) // musiman periode 5
    const bad = localModel('bad', 'Buruk', (t, h) => new Array(h).fill(100))
    const recs = rollingOrigin({ items, models: [good, bad], horizon: 1, nOrigins: 8, minTrain: 20 })
    const s = summarize(recs, [good, bad])
    expect(bestModelId(s)).toBe('good')
    expect(s.models.find((m) => m.id === 'good').wins).toBe(1)
    expect(s.models.find((m) => m.id === 'good').meanRank).toBe(1)
  })
  it('pilih model per barang: memakai model global kecuali pemenang lokal jelas lebih baik', () => {
    const a = localModel('a', 'A', (t, h) => new Array(h).fill(2))
    const b = localModel('b', 'B', (t, h) => new Array(h).fill(2.05))
    const recs = rollingOrigin({ items, models: [a, b], horizon: 1, nOrigins: 8, minTrain: 20 })
    const s = summarize(recs, [a, b])
    const { globalBest, choice } = pickModelPerItem(s, recs, { margin: 0.5 })
    expect(choice.get(1)).toBe(globalBest)
  })
  it('interval empiris: batas bawah ≤ ŷ ≤ batas atas dan tak pernah negatif', () => {
    const recs = rollingOrigin({ items, models: [localModel('ma', 'MA', movingAverage(4))], horizon: 3, nOrigins: 8, minTrain: 20 })
    const cal = calibrateIntervals(recs, 'ma')
    for (const h of [1, 2, 3]) {
      const { low, high } = applyInterval(4, 3.6, cal[h])
      expect(low).toBeGreaterThanOrEqual(0); expect(low).toBeLessThanOrEqual(4); expect(high).toBeGreaterThanOrEqual(4)
    }
  })
  it('cakupan interval (PICP) mendekati nominal pada data sintetis', () => {
    const d = generateMaterialDemand({ items: 10, weeks: 60, seed: 11 })
    const its = d.items.map((i) => ({ id: i.id, nama: i.nama, values: i.values }))
    const m = localModel('ma', 'MA', movingAverage(4))
    const recs = rollingOrigin({ items: its, models: [m], horizon: 2, nOrigins: 20, minTrain: 20 })
    const cov = evaluateCoverage(recs, 'ma')
    expect(cov.nominal).toBeCloseTo(0.8)
    expect(cov.picp).toBeGreaterThan(0.6); expect(cov.picp).toBeLessThan(0.97)
  })
})

describe('kebijakan persediaan', () => {
  const base = { forecast: [10, 10, 10, 10], sigmaWeekly: 2, leadTimeWeeks: 1, z: 1.65, startWeek: '2026-09-28', unit: 'sak' }
  it('stok pengaman, titik pemesanan ulang, jumlah pesanan (hitungan tangan)', () => {
    const r = recommendReplenishment({ ...base, stock: 25 })
    expect(r.safetyStock).toBe(4)                      // ceil(1,65 × 2 × √1)
    expect(r.reorderPoint).toBe(14)                    // 10 + 4
    expect(r.orderQty).toBe(19)                        // ceil(40 + 4 − 25)
    expect(r.stockoutWeek).toBe('2026-10-12')          // kumulatif 30 ≥ 25 pada minggu ke-3
    expect(r.risiko).toBe('waspada')
  })
  it('tingkat risiko: habis / kritis / waspada / aman', () => {
    expect(recommendReplenishment({ ...base, stock: 0 }).risiko).toBe('habis')
    expect(recommendReplenishment({ ...base, stock: 12 }).risiko).toBe('kritis')
    expect(recommendReplenishment({ ...base, stock: 30 }).risiko).toBe('waspada')
    const aman = recommendReplenishment({ ...base, stock: 100 })
    expect(aman.risiko).toBe('aman'); expect(aman.orderQty).toBe(0); expect(aman.stockoutWeek).toBeNull()
  })
  it('waktu tunggu lebih lama & tingkat layanan lebih tinggi → titik pesan lebih besar', () => {
    const a = recommendReplenishment({ ...base, stock: 50 })
    const b = recommendReplenishment({ ...base, stock: 50, leadTimeWeeks: 3 })
    const c = recommendReplenishment({ ...base, stock: 50, z: 2.33 })
    expect(b.reorderPoint).toBeGreaterThan(a.reorderPoint)
    expect(c.safetyStock).toBeGreaterThan(a.safetyStock)
  })
  it('tanpa kebutuhan → aman dengan alasan yang jelas; alasan selalu berupa teks', () => {
    const r = recommendReplenishment({ ...base, forecast: [0, 0, 0, 0], stock: 5 })
    expect(r.risiko).toBe('aman'); expect(r.alasan[0]).toMatch(/Tidak ada pemakaian/)
    expect(recommendReplenishment({ ...base, stock: 12 }).alasan.every((s) => typeof s === 'string' && s.length > 0)).toBe(true)
  })
})

describe('pipeline peramalan end-to-end', () => {
  const d = generateMaterialDemand({ items: 8, weeks: 48, seed: 5 })
  const run = () => runForecastPipeline({
    weeks: d.weeks, items: d.items, horizon: 4, nOrigins: 4, minTrain: 24,
    leadTimeWeeks: 2, serviceLevel: 95,
  })

  it('menghasilkan evaluasi 9 model, model terbaik, ramalan berinterval & rekomendasi', () => {
    const r = run()
    expect(r.ok).toBe(true)
    expect(r.evaluasi).toHaveLength(9)
    expect(r.evaluasi.some((m) => m.id === 'rf_lama')).toBe(true)             // pembanding metode lama ikut dievaluasi
    expect(r.evaluasi.map((m) => m.id)).toContain(r.modelTerbaik)
    expect(r.items).toHaveLength(8)
    for (const it of r.items) {
      expect(it.forecast).toHaveLength(4)
      for (const f of it.forecast) { expect(f.low).toBeLessThanOrEqual(f.yhat + 1e-9); expect(f.high).toBeGreaterThanOrEqual(f.yhat - 1e-9); expect(f.low).toBeGreaterThanOrEqual(0) }
      expect(['habis', 'kritis', 'waspada', 'aman']).toContain(it.rekomendasi.risiko)
      expect(it.rekomendasi.alasan.length).toBeGreaterThan(0)
    }
  }, 120_000)

  it('deterministik: dua kali jalan menghasilkan angka yang sama', () => {
    const a = run(), b = run()
    expect(JSON.stringify(a.items.map((i) => i.forecast))).toBe(JSON.stringify(b.items.map((i) => i.forecast)))
  }, 240_000)

  it('menolak riwayat yang terlalu pendek dengan penjelasan', () => {
    const short = generateMaterialDemand({ items: 3, weeks: 15, seed: 1 })
    const r = runForecastPipeline({ weeks: short.weeks, items: short.items })
    expect(r.ok).toBe(false); expect(r.alasan).toMatch(/terlalu pendek/)
  })
})
