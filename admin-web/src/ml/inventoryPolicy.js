// Kebijakan persediaan berbasis ramalan: stok pengaman, titik pemesanan ulang, jumlah pesanan,
// perkiraan tanggal habis, dan tingkat risiko — beserta ALASAN yang dapat dibaca admin.
import { addWeeks } from './timeseries'

const fmt = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 })

/**
 * @param forecast     ramalan mingguan (h=1..H)
 * @param sigmaWeekly  simpangan galat ramalan 1 minggu (RMSE) → dasar stok pengaman
 * @param leadTimeWeeks waktu tunggu pengadaan (minggu)
 * @param z            faktor tingkat layanan (1,28 = 90%; 1,65 = 95%; 2,33 = 99%)
 * @param startWeek    Senin minggu ramalan pertama (YYYY-MM-DD) untuk perkiraan tanggal habis
 */
export function recommendReplenishment({ forecast, sigmaWeekly = 0, stock, minStock = 0, leadTimeWeeks = 1, z = 1.65, startWeek, unit = '' }) {
  const H = forecast.length
  const L = Math.max(1, Math.ceil(leadTimeWeeks))
  const at = (i) => forecast[Math.min(i, H - 1)] ?? 0 // di luar horizon: pakai ramalan terakhir
  const demandLT = Array.from({ length: L }, (_, i) => at(i)).reduce((s, v) => s + v, 0)
  const totalH = forecast.reduce((s, v) => s + v, 0)

  const safetyStock = Math.ceil(z * sigmaWeekly * Math.sqrt(L))
  const reorderPoint = Math.ceil(demandLT + safetyStock)
  const orderQty = Math.max(0, Math.ceil(totalH + safetyStock - stock))

  let cum = 0, stockoutIdx = -1
  for (let i = 0; i < H; i++) { cum += forecast[i]; if (stock - cum <= 0) { stockoutIdx = i; break } }
  const stockoutWeek = stockoutIdx >= 0 ? addWeeks(startWeek, stockoutIdx) : null

  const u = unit ? ` ${unit}` : ''
  const alasan = []
  let risiko = 'aman'
  if (totalH <= 0 && demandLT <= 0) {
    alasan.push('Tidak ada pemakaian yang diperkirakan pada horizon ini.')
  } else {
    if (stock <= 0) { risiko = 'habis'; alasan.push('Stok saat ini sudah habis sementara kebutuhan masih diperkirakan ada.') }
    else if (stock <= reorderPoint) {
      risiko = 'kritis'
      alasan.push(`Stok ${fmt(stock)}${u} ≤ titik pemesanan ulang ${fmt(reorderPoint)}${u} (kebutuhan ${L} minggu waktu tunggu ${fmt(demandLT)} + stok pengaman ${fmt(safetyStock)}).`)
    } else if (stock < totalH + safetyStock) {
      risiko = 'waspada'
      alasan.push(`Stok ${fmt(stock)}${u} tidak cukup untuk ${H} minggu ke depan (perkiraan ${fmt(totalH)}${u} + pengaman ${fmt(safetyStock)}${u}).`)
    } else {
      alasan.push(`Stok ${fmt(stock)}${u} mencukupi kebutuhan ${H} minggu (perkiraan ${fmt(totalH)}${u}).`)
    }
    if (stockoutWeek) alasan.push(`Stok diperkirakan habis pada minggu ${stockoutWeek}.`)
    if (minStock > 0 && stock - totalH < minStock) alasan.push(`Sisa stok akhir horizon (${fmt(Math.max(0, stock - totalH))}${u}) di bawah stok minimal ${fmt(minStock)}${u}.`)
    if (orderQty > 0) alasan.push(`Disarankan memesan ±${fmt(orderQty)}${u}.`)
  }

  return { safetyStock, reorderPoint, orderQty, stockoutWeek, risiko, alasan, demandLT, totalForecast: totalH }
}

export const RISK_ORDER = { habis: 0, kritis: 1, waspada: 2, aman: 3 }
