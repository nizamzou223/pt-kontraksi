// Daftar tugas ML murni. Dijalankan di Web Worker (peramban) agar halaman tidak membeku,
// atau langsung (Node / pengujian / peramban tanpa Worker).
import { runForecastPipeline } from './forecastPipeline'
import { detectAnomalies } from './anomalyDetector'
import { generateMaterialDemand } from './synthetic'
import { generateWorkforce } from './syntheticWorkforce'
import { evaluateAnomalyMethods, sweepThreshold } from './anomalyEvaluation'

export const TASKS = {
  forecast: (p, onProgress) => runForecastPipeline({ ...p, onProgress }),
  anomali: (p) => detectAnomalies(p),
  demoMaterial: (p) => generateMaterialDemand(p),
  // Map tidak selalu aman lintas-thread → label dikirim sebagai larik pasangan
  demoWorkforce: (p) => { const d = generateWorkforce(p); return { ...d, labels: [...d.labels] } },
  evalAnomali: ({ threshold = 0.5, ...gen }) => {
    const ds = generateWorkforce(gen)
    return {
      evaluasi: evaluateAnomalyMethods(ds, { threshold }),
      sweep: sweepThreshold(ds),
      data: { presensi: ds.presensi.length, lembur: ds.lembur.length, kasbon: ds.kasbon.length, anomali: ds.labels.size, difficulty: gen.difficulty || 'mudah' },
    }
  },
}
