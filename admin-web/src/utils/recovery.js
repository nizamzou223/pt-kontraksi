// Pembaca URL tautan "lupa password" dari Supabase (murni, tanpa dependensi → mudah diuji).
//
// Tautan email Supabase mengarah ke  <situs>/reset-password  dengan token di FRAGMEN (#):
//   sukses : #access_token=…&refresh_token=…&expires_in=3600&token_type=bearer&type=recovery
//   gagal  : #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired

/**
 * @param {string} hash   window.location.hash
 * @param {string} search window.location.search
 * @returns {{status:'ok', accessToken:string} | {status:'expired'} | {status:'invalid'}}
 */
export function parseRecoveryUrl(hash = '', search = '') {
  const h = new URLSearchParams(String(hash).replace(/^#/, ''))
  const q = new URLSearchParams(String(search).replace(/^\?/, ''))

  const err = h.get('error') || h.get('error_code') || q.get('error') || q.get('error_code')
  if (err) {
    const code = (h.get('error_code') || q.get('error_code') || '').toLowerCase()
    const desc = (h.get('error_description') || q.get('error_description') || '').toLowerCase()
    return code === 'otp_expired' || desc.includes('expired') ? { status: 'expired' } : { status: 'invalid' }
  }

  const accessToken = h.get('access_token')
  // Hanya tautan bertipe recovery yang boleh dipakai di halaman ini.
  if (accessToken && h.get('type') === 'recovery') return { status: 'ok', accessToken }

  return { status: 'invalid' }
}

/** Terjemahkan respons error Supabase (PUT /auth/v1/user) menjadi kode yang stabil. */
export function classifyResetError(httpStatus, body) {
  const code = String(body?.error_code || body?.code || '').toLowerCase()
  const msg = String(body?.msg || body?.message || body?.error_description || '').toLowerCase()
  if (code === 'same_password' || msg.includes('different from the old password')) return 'same_password'
  if (code === 'weak_password' || msg.includes('weak') || msg.includes('at least')) return 'weak'
  if (httpStatus === 401 || httpStatus === 403 || code === 'session_not_found' || code === 'bad_jwt' || msg.includes('jwt') || msg.includes('session')) return 'expired'
  if (httpStatus === 429) return 'rate_limit'
  return 'failed'
}
