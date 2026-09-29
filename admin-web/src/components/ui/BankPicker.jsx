// BankPicker — badge tampilan metode pembayaran gaji
// Pembayaran gaji sekarang hanya tunai; daftar bank di sini hanya dipakai
// untuk menampilkan riwayat pembayaran lama yang masih tersimpan sebagai transfer bank.
const BANKS = [
  // Transfer bank (legacy — tidak bisa dipilih lagi, hanya untuk riwayat lama)
  { code: 'bca',     name: 'BCA',          fullName: 'Bank Central Asia',     color: '#0066AE', bg: '#EEF5FB', icon: '🏦', type: 'transfer' },
  { code: 'bni',     name: 'BNI',          fullName: 'Bank Negara Indonesia',  color: '#F05A28', bg: '#FEF3EE', icon: '🏛️', type: 'transfer' },
  { code: 'bri',     name: 'BRI',          fullName: 'Bank Rakyat Indonesia',  color: '#005BAC', bg: '#EEF4FC', icon: '🏦', type: 'transfer' },
  { code: 'mandiri', name: 'Mandiri',       fullName: 'Bank Mandiri',           color: '#003D79', bg: '#EEF2F8', icon: '🏛️', type: 'transfer' },
  { code: 'bsi',     name: 'BSI',          fullName: 'Bank Syariah Indonesia', color: '#006633', bg: '#EDF5EE', icon: '🕌', type: 'transfer' },
  { code: 'cimb',    name: 'CIMB Niaga',   fullName: 'CIMB Niaga',             color: '#AE0002', bg: '#FDEDF0', icon: '🏦', type: 'transfer' },
  { code: 'permata', name: 'Permata',       fullName: 'Bank Permata',           color: '#C8102E', bg: '#FDEEF1', icon: '💎', type: 'transfer' },
  { code: 'btn',     name: 'BTN',          fullName: 'Bank Tabungan Negara',   color: '#003087', bg: '#EEF1F9', icon: '🏠', type: 'transfer' },
  { code: 'danamon', name: 'Danamon',       fullName: 'Bank Danamon',           color: '#E30613', bg: '#FDEDF0', icon: '🏦', type: 'transfer' },
  { code: 'bjb',     name: 'BJB',          fullName: 'Bank Jabar Banten',      color: '#0E6B3A', bg: '#EDF5F0', icon: '🏦', type: 'transfer' },
  // Non-bank
  { code: 'tunai',   name: 'Tunai',        fullName: 'Pembayaran Tunai',       color: '#16A34A', bg: '#F0FDF4', icon: '💵', type: 'tunai' },
  { code: 'cek',     name: 'Cek/Giro',    fullName: 'Cek atau Bilyet Giro',   color: '#7C3AED', bg: '#F5F3FF', icon: '📄', type: 'cek'   },
]

function fromValue(value) {
  if (!value || value === 'tunai') return BANKS.find(b => b.code === 'tunai')
  if (value === 'cek') return BANKS.find(b => b.code === 'cek')
  const code = value.replace('transfer_', '')
  return BANKS.find(b => b.code === code) ?? BANKS.find(b => b.code === 'tunai')
}

// ── Badge ringkas (untuk tabel / list riwayat pembayaran) ──────
export function BankBadge({ value }) {
  const bank = fromValue(value)
  if (!bank) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: bank.bg, color: bank.color }}>
      <span>{bank.icon}</span>
      <span>{bank.name}</span>
    </span>
  )
}
