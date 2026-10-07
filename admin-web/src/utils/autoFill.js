// ============================================================
// AUTO-FILL HELPERS
// ============================================================

export const today = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}

// Generate kode project: PRJ-YYYY-NNN
export const generateKodeProject = (existingData = []) => {
  const year = new Date().getFullYear()
  const prefix = `PRJ-${year}-`
  const nums = existingData
    .map(d => d.kode_project || '')
    .filter(k => k.startsWith(prefix))
    .map(k => parseInt(k.replace(prefix, '')) || 0)
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

// Generate kode barang: BRG-NNN
export const generateKodeBarang = (existingData = []) => {
  const nums = existingData
    .map(d => d.kode_barang || '')
    .filter(k => k.startsWith('BRG-'))
    .map(k => parseInt(k.replace('BRG-', '')) || 0)
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `BRG-${String(max + 1).padStart(3, '0')}`
}

// Generate nomor PO stok masuk: PO-YYYYMMDD-NNN
export const generateNomorPO = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 900) + 100)
  return `PO-${y}${m}${d}-${rand}`
}

// Generate nomor SK stok keluar: SK-YYYYMMDD-NNN
export const generateNomorSK = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 900) + 100)
  return `SK-${y}${m}${d}-${rand}`
}

// Hitung durasi lembur dalam jam
export const hitungDurasiLembur = (jamMulai, jamSelesai) => {
  if (!jamMulai || !jamSelesai) return 0
  const [h1, m1] = jamMulai.split(':').map(Number)
  const [h2, m2] = jamSelesai.split(':').map(Number)
  const totalMenit = (h2 * 60 + m2) - (h1 * 60 + m1)
  return Math.max(0, parseFloat((totalMenit / 60).toFixed(2)))
}

// Hitung tarif lembur dari gaji harian
export const hitungTarifLembur = (gajiHarian) => {
  return Math.round(gajiHarian / 8)
}
