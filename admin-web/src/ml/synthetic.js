// Generator data SINTETIS berbenih — untuk pengujian unit, eksperimen offline, dan "Mode Demo".
// Data ini BUKAN data perusahaan; selalu diberi label "sintetis" di antarmuka.
import { mulberry32, gaussian } from './stats'
import { addWeeks } from './timeseries'

const NAMA_MATERIAL = [
  ['Semen 50 kg', 'sak'], ['Pasir Cor', 'm³'], ['Besi Beton D13', 'batang'], ['Batu Split 1/2', 'm³'],
  ['Paku 5 cm', 'kg'], ['Cat Tembok Interior', 'pail'], ['Keramik 40x40', 'dus'], ['Kawat Bendrat', 'roll'],
  ['Triplek 12 mm', 'lembar'], ['Kayu Kaso 5/7', 'batang'], ['Bata Merah', 'buah'], ['Besi Beton D10', 'batang'],
  ['Pipa PVC 3"', 'batang'], ['Kabel NYM 3x2.5', 'roll'], ['Lem Keramik', 'kg'], ['Mata Gerinda', 'buah'],
  ['Sarung Tangan Kerja', 'pasang'], ['Sekrup Baja Ringan', 'kotak'], ['Waterproofing', 'pail'], ['Plafon Gypsum', 'lembar'],
  ['Bekisting Multiplek', 'lembar'], ['Genteng Metal', 'lembar'], ['Kusen Aluminium', 'set'], ['Granit 60x60', 'dus'],
]

/**
 * Deret pemakaian mingguan material sebuah proyek konstruksi.
 * Permintaan mengikuti fase proyek (naik → puncak → turun), dipengaruhi jumlah pekerja minggu lalu,
 * dengan empat tipe pola: smooth, erratic, intermittent, lumpy.
 */
export function generateMaterialDemand({ items = 18, weeks = 52, seed = 7, endWeek = '2026-09-21' } = {}) {
  const rand = mulberry32(seed)
  const weekList = Array.from({ length: weeks }, (_, i) => addWeeks(endWeek, i - (weeks - 1)))

  // Jumlah pekerja aktif: kurva fase proyek + derau; libur Idulfitri (minggu 19–20) turun tajam
  const phase = (t) => {
    const up = 1 / (1 + Math.exp(-(t - weeks * 0.22) / 3))
    const down = 1 / (1 + Math.exp((t - weeks * 0.85) / 2.5))
    return 6 + 34 * up * down
  }
  const lebaran = (t) => (t === 19 || t === 20 ? 0.15 : 1)
  const workers = weekList.map((_, t) => Math.max(0, Math.round((phase(t) + 2 * gaussian(rand)) * lebaran(t))))
  const meanWorkers = workers.reduce((s, v) => s + v, 0) / weeks

  const tipeCycle = ['smooth', 'smooth', 'erratic', 'intermittent', 'intermittent', 'lumpy']
  const out = []
  for (let k = 0; k < items; k++) {
    const [nama, satuan] = NAMA_MATERIAL[k % NAMA_MATERIAL.length]
    const tipe = tipeCycle[k % tipeCycle.length]
    const base = 4 + Math.floor(rand() * 40)
    const values = weekList.map((_, t) => {
      const ratio = (t > 0 ? workers[t - 1] : workers[0]) / meanWorkers // pekerja minggu lalu → kebutuhan minggu ini
      let v = 0
      if (tipe === 'smooth') v = base * ratio * (1 + 0.12 * gaussian(rand))
      else if (tipe === 'erratic') v = base * ratio * Math.exp(0.7 * gaussian(rand))
      else if (tipe === 'intermittent') v = rand() < Math.min(0.9, 0.3 * ratio) ? base * 1.5 * (1 + 0.2 * gaussian(rand)) : 0
      else v = rand() < Math.min(0.9, 0.18 * ratio) ? base * 3 * Math.exp(0.9 * gaussian(rand)) : 0
      return Math.max(0, Math.round(v))
    })
    const avg = values.reduce((s, v) => s + v, 0) / weeks
    out.push({
      id: k + 1,
      nama: items > NAMA_MATERIAL.length && k >= NAMA_MATERIAL.length ? `${nama} (${Math.floor(k / NAMA_MATERIAL.length) + 1})` : nama,
      satuan, tipe, values,
      exog: workers,
      stok: Math.round(avg * (0.5 + rand() * 4)),
      stok_minimal: Math.max(1, Math.round(avg * 0.6)),
    })
  }
  return { weeks: weekList, workers, items: out }
}
