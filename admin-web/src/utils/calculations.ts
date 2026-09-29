/**
 * calculations.ts — utility kalkulasi gaji
 * PENTING: hitungGaji() di sini hanya untuk preview/estimasi di UI.
 * Kalkulasi resmi yang disimpan ke DB selalu menggunakan hitungKomponenJam()
 * dari payrollService.js (berbasis per-jam, bukan flat hari).
 * Kedua fungsi harus konsisten — jangan gunakan hitungGaji() untuk simpan ke DB.
 */

export interface PayrollInput {
  hariHadir: number
  gajiHarian: number
  uangMakan: number
  uangTransport: number
  totalLembur: number
  totalKasbon: number
  potonganLainnya?: number
}

export interface PayrollResult {
  gajiPokok: number
  tunjangan: number
  totalLembur: number
  gajiKotor: number
  totalPotongan: number
  gajiBersih: number
}

/**
 * Preview estimasi gaji — digunakan hanya untuk tampilan UI.
 * Kalkulasi sesungguhnya ada di payrollService.hitungGajiMingguan()
 */
export const hitungGaji = (input: PayrollInput): PayrollResult => {
  const gajiPokok    = input.hariHadir * input.gajiHarian
  const tunjangan    = input.uangMakan + input.uangTransport
  const gajiKotor    = gajiPokok + tunjangan + input.totalLembur
  const totalPotongan = input.totalKasbon + (input.potonganLainnya ?? 0)
  const gajiBersih   = Math.max(0, gajiKotor - totalPotongan)

  return { gajiPokok, tunjangan, totalLembur: input.totalLembur, gajiKotor, totalPotongan, gajiBersih }
}

/**
 * Hitung komponen gaji per jam — KONSISTEN dengan payrollService.hitungKomponenJam()
 * Gunakan ini jika butuh breakdown jam di TypeScript component.
 */
export const hitungKomponenJam = (durasiJam: number, gajiHarian: number) => {
  const jam        = Math.max(0, durasiJam)
  const gh         = Math.max(0, gajiHarian)
  const gajiPerJam = gh / 8

  if (jam <= 0) return { jamNormal: 0, jamLembur: 0, hariKerja: 0, gajiPokok: 0, gajiLembur: 0 }

  const hariKerja = Math.floor(jam / 8)
  const sisa      = jam % 8

  if (hariKerja === 0) {
    return { jamNormal: jam, jamLembur: 0, hariKerja: 0, gajiPokok: jam * gajiPerJam, gajiLembur: 0 }
  }

  return {
    jamNormal:  hariKerja * 8,
    jamLembur:  sisa,
    hariKerja,
    gajiPokok:  hariKerja * gh,
    gajiLembur: sisa > 0 ? sisa * gajiPerJam : 0,
  }
}

export const hitungDurasiLembur = (jamMulai: string, jamSelesai: string): number => {
  const [mulaiH, mulaiM]   = jamMulai.split(':').map(Number)
  const [selesaiH, selesaiM] = jamSelesai.split(':').map(Number)
  const mulaiMenit   = mulaiH * 60 + mulaiM
  const selesaiMenit = selesaiH * 60 + selesaiM
  const durasiMenit  = selesaiMenit > mulaiMenit
    ? selesaiMenit - mulaiMenit
    : (24 * 60 - mulaiMenit) + selesaiMenit
  return Math.round((durasiMenit / 60) * 100) / 100
}

export const hitungDurasiKerja = (jamMasuk: string, jamKeluar: string): number => {
  return hitungDurasiLembur(jamMasuk, jamKeluar)
}

export const getMondayOfWeek = (date: Date = new Date()): Date => {
  const d   = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff))
}

export const getSaturdayOfWeek = (date: Date = new Date()): Date => {
  const monday   = getMondayOfWeek(date)
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  return saturday
}

export const dateToString = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const getWeekRange = (date: Date = new Date()) => {
  const monday   = getMondayOfWeek(date)
  const saturday = getSaturdayOfWeek(date)
  return { start: dateToString(monday), end: dateToString(saturday) }
}

export const processStatusPembayaran = (
  gajiBersih: number,
  totalKasbon: number,
): 'paid' | 'partial' | 'pending' => {
  if (gajiBersih <= 0 && totalKasbon > 0) return 'partial'
  if (gajiBersih > 0) return 'paid'
  return 'pending'
}
