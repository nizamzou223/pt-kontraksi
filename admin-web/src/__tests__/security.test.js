import { describe, it, expect } from 'vitest'
import {
  escapeHtml, resolveWebUser, validatePassword, WEB_ALLOWED_ROLES,
} from '../utils/security'

describe('escapeHtml — pencegahan XSS pada jendela cetak', () => {
  it('menetralkan tag <script>', () => {
    const out = escapeHtml('<script>alert(document.cookie)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toBe('&lt;script&gt;alert(document.cookie)&lt;/script&gt;')
  })
  it('menetralkan atribut yang keluar dari tanda kutip', () => {
    const out = escapeHtml('" onerror="alert(1)')
    expect(out).not.toContain('"')
    expect(out).toContain('&quot;')
  })
  it('menetralkan payload <img onerror>', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).not.toMatch(/<img/)
  })
  it('menetralkan petik tunggal, backtick dan ampersand', () => {
    expect(escapeHtml("'")).toBe('&#39;')
    expect(escapeHtml('`')).toBe('&#96;')
    expect(escapeHtml('A & B')).toBe('A &amp; B')
  })
  it('tidak double-decode: & di awal di-escape sekali', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
  it('null/undefined menjadi string kosong, angka menjadi string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(3273010101010001)).toBe('3273010101010001')
  })
  it('teks biasa tidak berubah', () => {
    expect(escapeHtml('Budi Santoso')).toBe('Budi Santoso')
  })
})

describe('resolveWebUser — akses fail-closed (dulu fallback role admin)', () => {
  it('baris tidak ada → ditolak (BUKAN admin)', () => {
    expect(resolveWebUser(null)).toEqual({ ok: false, reason: 'not_registered' })
    expect(resolveWebUser(undefined).ok).toBe(false)
  })
  it('akun nonaktif → ditolak', () => {
    expect(resolveWebUser({ role: 'admin', status_aktif: false }))
      .toEqual({ ok: false, reason: 'inactive' })
  })
  it.each(['mandor', 'staff', 'superuser', '', undefined, 'ADMIN'])(
    'peran %j → ditolak untuk Admin Web', (role) => {
      const r = resolveWebUser({ role, status_aktif: true })
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('role_denied')
    })
  it.each(WEB_ALLOWED_ROLES)('peran %s aktif → diizinkan', (role) => {
    const row = { email: 'x@y.z', role, status_aktif: true }
    expect(resolveWebUser(row)).toEqual({ ok: true, user: row })
  })
  it('status_aktif null (default DB) tetap dianggap aktif', () => {
    expect(resolveWebUser({ role: 'hr', status_aktif: null }).ok).toBe(true)
  })
  it('hanya admin & hr yang boleh', () => {
    expect([...WEB_ALLOWED_ROLES].sort()).toEqual(['admin', 'hr'])
  })
})

describe('validatePassword', () => {
  it('menolak < 8 karakter', () => {
    expect(validatePassword('abc123')).toMatch(/8 karakter/)
    expect(validatePassword('')).toMatch(/8 karakter/)
    expect(validatePassword(undefined)).toMatch(/8 karakter/)
  })
  it('menolak tanpa huruf / tanpa angka', () => {
    expect(validatePassword('12345678')).toMatch(/huruf/)
    expect(validatePassword('abcdefgh')).toMatch(/angka/)
  })
  it('menerima password yang memenuhi syarat', () => {
    expect(validatePassword('Kalipelus2026')).toBeNull()
    expect(validatePassword('a1b2c3d4')).toBeNull()
  })
})
