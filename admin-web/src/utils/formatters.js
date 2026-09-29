// formatters.js
export const formatRupiah = (value) => {
  if (!value && value !== 0) return '-'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value)
}

export const formatTanggal = (date) => {
  if (!date) return '-'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
}

export const formatTanggalInput = (date) => {
  if (!date) return ''
  return new Date(date).toISOString().split('T')[0]
}

export const formatWaktu = (time) => {
  if (!time) return '-'
  return time.substring(0, 5)
}

export const formatPercentage = (val, total) => {
  if (!total || total === 0) return '0%'
  return `${Math.round((val / total) * 100)}%`
}

export const formatNamaStatus = (status) => {
  const map = {
    aktif: 'Aktif', nonaktif: 'Non-aktif', selesai: 'Selesai',
    // Presensi: hanya 2 status, semua selain hadir = Tidak Hadir
    hadir: 'Hadir',
    alfa: 'Tidak Hadir', sakit: 'Tidak Hadir', izin: 'Tidak Hadir',
    cuti: 'Tidak Hadir', libur: 'Tidak Hadir', tidak_hadir: 'Tidak Hadir',
    pending: 'Pending', disetujui: 'Disetujui', ditolak: 'Ditolak',
    draft: 'Draft', final: 'Final', dibayar: 'Dibayar', paid: 'Lunas', partial: 'Sebagian',
    potong_gaji: 'Potong Gaji', manual: 'Manual', qr_code: 'QR Code',
  }
  return map[status] || status
}

// Presensi: label mengikuti alur scan mandor_app (Sedang Bekerja = sudah scan masuk,
// Selesai = sudah scan masuk & keluar), terpisah dari formatNamaStatus/getStatusColor
// generik supaya tidak mengubah domain lain yang memakai status 'hadir'/'disetujui'.
export const formatPresensiStatus = (status, jamMasuk) => {
  if (status === 'belum_lengkap' && jamMasuk) return 'Sedang Bekerja'
  if (status === 'hadir') return 'Selesai'
  if (status === 'belum_input') return 'Belum Input'
  return 'Tidak Hadir'
}

export const getPresensiStatusColor = (status, jamMasuk) => {
  if (status === 'belum_lengkap' && jamMasuk) return 'bg-blue-100 text-blue-800'
  if (status === 'hadir') return 'bg-green-100 text-green-800'
  if (status === 'belum_input') return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export const getStatusColor = (status) => {
  const map = {
    aktif: 'bg-green-100 text-green-800', nonaktif: 'bg-gray-100 text-gray-800',
    selesai: 'bg-blue-100 text-blue-800', hadir: 'bg-green-100 text-green-800',
    // semua selain hadir = merah
    alfa: 'bg-red-100 text-red-800', sakit: 'bg-red-100 text-red-800',
    izin: 'bg-red-100 text-red-800', cuti: 'bg-red-100 text-red-800',
    libur: 'bg-red-100 text-red-800', tidak_hadir: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800', disetujui: 'bg-green-100 text-green-800',
    ditolak: 'bg-red-100 text-red-800', draft: 'bg-gray-100 text-gray-800',
    final: 'bg-blue-100 text-blue-800', dibayar: 'bg-green-100 text-green-800',
    paid: 'bg-green-100 text-green-800', partial: 'bg-yellow-100 text-yellow-800',
  }
  return map[status] || 'bg-gray-100 text-gray-800'
}
