// constants.js
// STATUS_KEHADIRAN di database: hanya 'hadir' dan 'alfa' (tidak hadir)
// Di UI ditampilkan sebagai 'Hadir' / 'Tidak Hadir'
export const STATUS_KEHADIRAN = ['hadir', 'alfa']
export const STATUS_PROJECT = ['aktif', 'selesai', 'ditangguhkan']
export const STATUS_ASSIGNMENT = ['aktif', 'nonaktif']
export const STATUS_PERSETUJUAN = ['pending', 'disetujui', 'ditolak']
export const STATUS_GAJI = ['draft', 'final', 'dibayar']
export const STATUS_PEMBAYARAN = ['pending', 'partial', 'paid']
// Pembayaran gaji hanya tunai (transfer bank dihapus)
export const METODE_PEMBAYARAN = ['tunai']
export const ROLES = ['admin', 'hr', 'mandor', 'staff']

export const HARI_KERJA = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

// Gunakan tanggal lokal (bukan UTC) agar tidak loncat hari di timezone WIB (UTC+7)
const toLocalDate = (d) => {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const getWeekRange = (date = new Date()) => {
  const d = new Date(date)
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  return {
    start: toLocalDate(monday),
    end: toLocalDate(saturday),
  }
}

export const getCurrentWeek = () => getWeekRange(new Date())