// Aturan akun login aplikasi mobile: hanya jabatan MANDOR yang boleh punya akun.
// Jabatan lain (tukang, pekerja, dst.) tidak memiliki akun login — mereka hanya presensi lewat QR.

const norm = (s) => String(s || '').toLowerCase()

/** Apakah nama jabatan termasuk kelompok mandor? */
export function isJabatanMandor(namaJabatan) {
  return /\bmandor\b/.test(norm(namaJabatan))
}

/**
 * Peran akun yang boleh dibuat untuk sebuah jabatan.
 *  - bukan mandor            → boleh: [] (tidak bisa membuat akun)
 *  - "Mandor Gudang"         → ['mandor_gudang'] (terkunci)
 *  - "Mandor Proyek"         → ['mandor']        (terkunci)
 *  - "Mandor" (umum)         → ['mandor', 'mandor_gudang'] (admin memilih)
 */
export function peranAkunUntukJabatan(namaJabatan) {
  if (!isJabatanMandor(namaJabatan)) return []
  const n = norm(namaJabatan)
  if (n.includes('gudang')) return ['mandor_gudang']
  if (n.includes('proyek')) return ['mandor']
  return ['mandor', 'mandor_gudang']
}

/** Peran bawaan untuk jabatan (null bila jabatan tidak boleh punya akun). */
export function peranBawaan(namaJabatan) {
  return peranAkunUntukJabatan(namaJabatan)[0] ?? null
}
