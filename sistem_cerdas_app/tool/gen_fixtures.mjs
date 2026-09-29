// Membuat fixture referensi dari kode JS asli (admin-web/src/ml) untuk menguji kesetiaan porting Dart.
//
//   cd admin-web
//   npx vite-node ../sistem_cerdas_app/tool/gen_fixtures.mjs
//
// Keluaran: sistem_cerdas_app/test/fixtures/{material,workforce}.json
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateMaterialDemand } from '../../admin-web/src/ml/synthetic.js'
import { generateWorkforce } from '../../admin-web/src/ml/syntheticWorkforce.js'
import { runForecastPipeline } from '../../admin-web/src/ml/forecastPipeline.js'
import { defaultModels } from '../../admin-web/src/ml/forecasters.js'
import { detectAnomalies } from '../../admin-web/src/ml/anomalyDetector.js'

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures')
mkdirSync(out, { recursive: true })

// ── Peramalan ── (tanpa pembanding "RF lama" karena memakai pustaka pihak ketiga)
const mat = generateMaterialDemand({ items: 18, weeks: 52, seed: 7, endWeek: '2026-09-21' })
const models = defaultModels({ withExog: true }).filter((m) => m.id !== 'rf_lama')
const fc = runForecastPipeline({
  weeks: mat.weeks, items: mat.items, horizon: 4, nOrigins: 5, leadTimeWeeks: 1, serviceLevel: 95, useExog: true, models,
})
writeFileSync(path.join(out, 'material.json'), JSON.stringify({
  weeks: mat.weeks,
  items: mat.items.map(({ id, nama, satuan, values, stok, stok_minimal }) => ({ id, nama, satuan, values, stok, stok_minimal })),
  workers: mat.workers,
  ref: {
    modelTerbaik: fc.modelTerbaik,
    cakupan: fc.cakupanInterval,
    evaluasi: fc.evaluasi.map(({ id, mase, rmse, wape, bias, mae, wins, meanRank }) => ({ id, mase, rmse, wape, bias, mae, wins, meanRank })),
    items: fc.items.map((it) => ({
      id: it.id, modelId: it.modelId, mase: it.mase ?? null, pola: it.pola.category,
      forecast: it.forecast.map(({ minggu, yhat, low, high }) => ({ minggu, yhat, low, high })),
      rek: { safetyStock: it.rekomendasi.safetyStock, reorderPoint: it.rekomendasi.reorderPoint, orderQty: it.rekomendasi.orderQty,
        stockoutWeek: it.rekomendasi.stockoutWeek, risiko: it.rekomendasi.risiko, alasan: it.rekomendasi.alasan },
    })),
  },
}))

// ── Anomali ──
const wf = generateWorkforce({ employees: 30, days: 60, seed: 21, difficulty: 'sulit', startDate: '2026-07-27' })
const ringkas = (res) => res.items.map((i) => ({
  key: i.key, skor: i.skor, tingkat: i.tingkat, kode: i.alasan.map((a) => a.kode), teks: i.alasan.map((a) => a.teks), metode: i.metode,
}))
const tanpaIf = detectAnomalies({ ...wf, threshold: 0.5, methods: { rules: true, stats: true, iforest: false } })
const semua = detectAnomalies({ ...wf, threshold: 0.5, methods: { rules: true, stats: true, iforest: true } })
writeFileSync(path.join(out, 'workforce.json'), JSON.stringify({
  data: { karyawan: wf.karyawan, presensi: wf.presensi, lembur: wf.lembur, kasbon: wf.kasbon, today: wf.today },
  labels: [...wf.labels],
  ref: { tanpaIf: ringkas(tanpaIf), semua: ringkas(semua), ringkasanSemua: semua.ringkasan },
}))
console.log('fixture ditulis ke', out, '| barang:', fc.items.length, '| model terbaik:', fc.modelTerbaik, '| anomali (tanpa IF / semua):', tanpaIf.items.length, semua.items.length)
