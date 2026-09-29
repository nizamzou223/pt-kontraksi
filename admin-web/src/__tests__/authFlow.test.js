import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase client palsu: hanya resetPasswordForEmail yang dipakai layanan ini.
const resetMock = vi.fn()
vi.mock('../services/supabaseClient', () => ({
  supabaseUrl: 'https://proj.supabase.co',
  supabaseAnonKey: 'anon-key',
  supabase: { auth: { resetPasswordForEmail: (...a) => resetMock(...a) } },
  default: { auth: { resetPasswordForEmail: (...a) => resetMock(...a) } },
}))

import { authService } from '../services/authService'
import { parseRecoveryUrl, classifyResetError } from '../utils/recovery'
import { passwordProblem, validatePassword } from '../utils/security'
import { AUTH_STRINGS, fmt, authText } from '../i18n/authStrings'

describe('parseRecoveryUrl — membaca tautan reset dari Supabase', () => {
  it('tautan recovery valid → ok + token', () => {
    const r = parseRecoveryUrl('#access_token=abc.def.ghi&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery')
    expect(r).toEqual({ status: 'ok', accessToken: 'abc.def.ghi' })
  })
  it('tautan kedaluwarsa (otp_expired) → expired', () => {
    const r = parseRecoveryUrl('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    expect(r).toEqual({ status: 'expired' })
  })
  it('error lain → invalid', () => {
    expect(parseRecoveryUrl('#error=access_denied&error_code=unexpected_failure')).toEqual({ status: 'invalid' })
  })
  it('error juga dibaca dari query string', () => {
    expect(parseRecoveryUrl('', '?error=access_denied&error_description=link+expired')).toEqual({ status: 'expired' })
  })
  it('TIDAK menerima token bertipe lain (mis. magiclink / signup) di halaman reset', () => {
    expect(parseRecoveryUrl('#access_token=abc&type=magiclink').status).toBe('invalid')
    expect(parseRecoveryUrl('#access_token=abc&type=signup').status).toBe('invalid')
    expect(parseRecoveryUrl('#access_token=abc').status).toBe('invalid')
  })
  it('tanpa token sama sekali → invalid', () => {
    expect(parseRecoveryUrl('', '')).toEqual({ status: 'invalid' })
    expect(parseRecoveryUrl(undefined, undefined)).toEqual({ status: 'invalid' })
  })
  it('kode PKCE (?code=) tidak dipakai klien ini → invalid, bukan crash', () => {
    expect(parseRecoveryUrl('', '?code=xyz').status).toBe('invalid')
  })
})

describe('classifyResetError', () => {
  it.each([
    [422, { error_code: 'same_password' }, 'same_password'],
    [422, { msg: 'New password should be different from the old password.' }, 'same_password'],
    [422, { error_code: 'weak_password' }, 'weak'],
    [401, { msg: 'invalid JWT' }, 'expired'],
    [403, { error_code: 'session_not_found' }, 'expired'],
    [429, {}, 'rate_limit'],
    [500, { msg: 'boom' }, 'failed'],
    [500, null, 'failed'],
  ])('HTTP %s %j → %s', (status, body, expected) => {
    expect(classifyResetError(status, body)).toBe(expected)
  })
})

describe('authService.requestPasswordReset', () => {
  beforeEach(() => resetMock.mockReset())
  it('meminta reset dengan redirect ke /reset-password', async () => {
    resetMock.mockResolvedValue({ error: null })
    globalThis.window = { location: { origin: 'https://app.example.com' } }
    await authService.requestPasswordReset('a@b.co')
    expect(resetMock).toHaveBeenCalledWith('a@b.co', { redirectTo: 'https://app.example.com/reset-password' })
  })
  it('HTTP 429 → code rate_limit', async () => {
    resetMock.mockResolvedValue({ error: { status: 429, message: 'x' } })
    globalThis.window = { location: { origin: 'https://x' } }
    await expect(authService.requestPasswordReset('a@b.co')).rejects.toMatchObject({ code: 'rate_limit' })
  })
  it('pesan "security purposes… after 45 seconds" → rate_limit', async () => {
    resetMock.mockResolvedValue({ error: { status: 400, message: 'For security purposes, you can only request this after 45 seconds.' } })
    globalThis.window = { location: { origin: 'https://x' } }
    await expect(authService.requestPasswordReset('a@b.co')).rejects.toMatchObject({ code: 'rate_limit' })
  })
  it('error lain → code failed', async () => {
    resetMock.mockResolvedValue({ error: { status: 500, message: 'Error sending recovery email' } })
    globalThis.window = { location: { origin: 'https://x' } }
    await expect(authService.requestPasswordReset('a@b.co')).rejects.toMatchObject({ code: 'failed' })
  })
})

describe('authService.resetPasswordWithToken', () => {
  const okRes = { ok: true, status: 200, json: async () => ({}) }
  beforeEach(() => { globalThis.fetch = vi.fn() })

  it('memanggil PUT /auth/v1/user dengan token recovery & apikey', async () => {
    fetch.mockResolvedValue(okRes)
    await authService.resetPasswordWithToken('TOKEN123', 'Baru12345')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://proj.supabase.co/auth/v1/user')
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer TOKEN123')
    expect(init.headers.apikey).toBe('anon-key')
    expect(JSON.parse(init.body)).toEqual({ password: 'Baru12345' })
  })
  it('token kedaluwarsa (401) → code expired', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ msg: 'invalid JWT' }) })
    await expect(authService.resetPasswordWithToken('t', 'Baru12345')).rejects.toMatchObject({ code: 'expired' })
  })
  it('password sama dengan yang lama → code same_password', async () => {
    fetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error_code: 'same_password' }) })
    await expect(authService.resetPasswordWithToken('t', 'Lama12345')).rejects.toMatchObject({ code: 'same_password' })
  })
  it('jaringan putus → code network', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(authService.resetPasswordWithToken('t', 'Baru12345')).rejects.toMatchObject({ code: 'network' })
  })
  it('body error tidak bisa di-parse tidak membuat crash', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('bukan json') } })
    await expect(authService.resetPasswordWithToken('t', 'Baru12345')).rejects.toMatchObject({ code: 'failed' })
  })
  it('revokeRecoveryToken memanggil logout scope lokal & tidak melempar error', async () => {
    fetch.mockRejectedValue(new Error('offline'))
    await expect(authService.revokeRecoveryToken('TOKEN')).resolves.toBeUndefined()
    fetch.mockResolvedValue({ ok: true })
    await authService.revokeRecoveryToken('TOKEN')
    expect(fetch.mock.calls.at(-1)[0]).toBe('https://proj.supabase.co/auth/v1/logout?scope=local')
  })
})

describe('passwordProblem / validatePassword', () => {
  it.each([['abc', 'short'], ['abcdefgh', 'noDigit'], ['12345678', 'noLetter'], ['Abcdefg1', null], [undefined, 'short']])(
    '%j → %s', (pw, code) => expect(passwordProblem(pw)).toBe(code))
  it('validatePassword tetap mengembalikan pesan Indonesia (kompatibel)', () => {
    expect(validatePassword('abcdefgh')).toMatch(/angka/)
    expect(validatePassword('Abcdefg1')).toBeNull()
  })
})

describe('i18n halaman autentikasi', () => {
  const idKeys = Object.keys(AUTH_STRINGS.id).sort()
  const enKeys = Object.keys(AUTH_STRINGS.en).sort()
  it('kunci Indonesia dan Inggris identik (tidak ada terjemahan yang hilang)', () => {
    expect(enKeys).toEqual(idKeys)
  })
  it('tidak ada teks kosong', () => {
    for (const lang of ['id', 'en']) for (const [k, v] of Object.entries(AUTH_STRINGS[lang])) expect(v, `${lang}.${k}`).toBeTruthy()
  })
  it('placeholder {…} sama di kedua bahasa', () => {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',')
    for (const k of idKeys) expect(ph(AUTH_STRINGS.en[k]), k).toBe(ph(AUTH_STRINGS.id[k]))
  })
  it('kode error login semuanya punya terjemahan', () => {
    for (const c of ['invalid_credentials', 'email_not_confirmed', 'rate_limit', 'network', 'user_not_found', 'generic', 'not_registered', 'inactive', 'role_denied'])
      for (const lang of ['id', 'en']) expect(AUTH_STRINGS[lang][`err_${c}`], `${lang}.err_${c}`).toBeTruthy()
  })
  it('fmt mengganti placeholder & membiarkan yang tidak dikenal', () => {
    expect(fmt('Kirim ulang dalam {n} detik', { n: 42 })).toBe('Kirim ulang dalam 42 detik')
    expect(fmt('Halo {x}', {})).toBe('Halo {x}')
  })
  it('bahasa tak dikenal jatuh ke Indonesia', () => {
    expect(authText('fr')).toBe(AUTH_STRINGS.id)
  })
})
