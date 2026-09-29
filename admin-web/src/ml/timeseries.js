// Utilitas deret waktu mingguan untuk peramalan kebutuhan material.
// Semua tanggal diproses sebagai tanggal kalender UTC (YYYY-MM-DD) agar hasil tidak
// bergantung zona waktu peramban.
import { mean } from './stats'

const DAY = 86_400_000

const toUtc = (dateStr) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10)

/** Senin awal minggu (ISO) dari tanggal / timestamp — hasil 'YYYY-MM-DD'. */
export function weekStart(dateStr) {
  const ms = toUtc(dateStr)
  const dow = (new Date(ms).getUTCDay() + 6) % 7 // Senin = 0
  return fmt(ms - dow * DAY)
}

export const addWeeks = (weekStr, n) => fmt(toUtc(weekStr) + n * 7 * DAY)

/** Daftar Senin dari minggu `from` sampai minggu `to` (inklusif). */
export function weekRange(from, to) {
  const out = []
  for (let w = weekStart(from); w <= weekStart(to); w = addWeeks(w, 1)) out.push(w)
  return out
}

/**
 * Menjumlahkan baris transaksi menjadi deret mingguan, minggu tanpa transaksi diisi 0 EKSPLISIT.
 * @param rows  [{[dateKey]: 'YYYY-MM-DD…', [valueKey]: number}]
 * @returns {{weeks: string[], values: number[]}}
 */
export function weeklySeries(rows, { dateKey = 'created_at', valueKey = 'jumlah', from, to } = {}) {
  const dated = rows.filter((r) => r[dateKey])
  if (!dated.length && !(from && to)) return { weeks: [], values: [] }
  const firstDate = from || dated.reduce((m, r) => (r[dateKey] < m ? r[dateKey] : m), dated[0][dateKey])
  const lastDate = to || dated.reduce((m, r) => (r[dateKey] > m ? r[dateKey] : m), dated[0][dateKey])
  const weeks = weekRange(firstDate, lastDate)
  const index = new Map(weeks.map((w, i) => [w, i]))
  const values = new Array(weeks.length).fill(0)
  for (const r of dated) {
    const i = index.get(weekStart(r[dateKey]))
    if (i !== undefined) values[i] += Number(r[valueKey]) || 0
  }
  return { weeks, values }
}

/**
 * Klasifikasi pola permintaan (Syntetos–Boylan):
 *   ADI = rata-rata interval antar permintaan, CV² = kuadrat koefisien variasi ukuran permintaan.
 *   ambang ADI 1,32 dan CV² 0,49 → smooth / erratic / intermittent / lumpy.
 */
export function intermittency(values) {
  const nz = values.filter((v) => v > 0)
  if (nz.length < 2) return { adi: nz.length ? values.length : Infinity, cv2: 0, nonZero: nz.length, category: 'jarang' }
  const adi = values.length / nz.length
  const m = mean(nz)
  const varNz = nz.reduce((s, v) => s + (v - m) ** 2, 0) / nz.length
  const cv2 = m > 0 ? varNz / (m * m) : 0
  const category = adi < 1.32 ? (cv2 < 0.49 ? 'smooth' : 'erratic') : (cv2 < 0.49 ? 'intermittent' : 'lumpy')
  return { adi, cv2, nonZero: nz.length, category }
}

/** Skala MASE: rata-rata |selisih| pada data latih (pembanding naive satu langkah). */
export function naiveScale(train) {
  if (train.length < 2) return 0
  let s = 0
  for (let i = 1; i < train.length; i++) s += Math.abs(train[i] - train[i - 1])
  return s / (train.length - 1)
}
