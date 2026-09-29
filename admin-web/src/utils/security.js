// Helper keamanan murni (tanpa dependensi) — mudah diuji unit.

// Peran yang boleh masuk ke Admin Web. Peran lain (mandor, staff) hanya
// boleh memakai Mandor App.
export const WEB_ALLOWED_ROLES = ['admin', 'hr']

/**
 * Escape karakter HTML sebelum data dimasukkan ke template string HTML
 * (mis. jendela cetak kartu). Mencegah XSS tersimpan lewat nama karyawan dsb.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
}

/**
 * Tentukan apakah baris public.users boleh memakai Admin Web.
 * Fail-closed: baris kosong / nonaktif / peran tak dikenal => ditolak.
 * (Sebelumnya fallback-nya memberi role 'admin'.)
 */
export function resolveWebUser(row) {
  if (!row) return { ok: false, reason: 'not_registered' }
  if (row.status_aktif === false) return { ok: false, reason: 'inactive' }
  if (!WEB_ALLOWED_ROLES.includes(row.role)) return { ok: false, reason: 'role_denied' }
  return { ok: true, user: row }
}

export const ACCESS_DENIED_MESSAGES = {
  not_registered: 'Akun Anda belum terdaftar di sistem. Hubungi administrator.',
  inactive: 'Akun Anda dinonaktifkan. Hubungi administrator.',
  role_denied: 'Akses ditolak. Akun Anda tidak memiliki izin untuk Admin Web.',
}

export const PASSWORD_MIN_LENGTH = 8

/**
 * Kode masalah password: 'short' | 'noLetter' | 'noDigit' | null (valid).
 * Dipisah dari pesan agar bisa diterjemahkan (ID/EN) di UI.
 */
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN_LENGTH) return 'short'
  if (!/[A-Za-z]/.test(pw)) return 'noLetter'
  if (!/\d/.test(pw)) return 'noDigit'
  return null
}

const PASSWORD_MESSAGES_ID = {
  short: `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`,
  noLetter: 'Password harus mengandung huruf.',
  noDigit: 'Password harus mengandung angka.',
}

/**
 * Validasi kekuatan password. Mengembalikan pesan error (Indonesia), atau null jika valid.
 * Aturan: minimal 8 karakter, mengandung huruf dan angka.
 */
export function validatePassword(pw) {
  const code = passwordProblem(pw)
  return code ? PASSWORD_MESSAGES_ID[code] : null
}
