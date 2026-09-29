import supabase, { supabaseUrl, supabaseAnonKey } from './supabaseClient'
import { resolveWebUser } from '../utils/security'
import { classifyResetError } from '../utils/recovery'

export const authService = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async logout() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  async getCurrentUser() {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return null

    const { data, error } = await supabase
      .from('users')
      .select('*, karyawan(*), project(*)')
      .eq('email', user.email)
      .maybeSingle()

    // Fail-closed: error / tidak terdaftar / nonaktif / peran tak berhak => null
    if (error) return null
    const res = resolveWebUser(data)
    return res.ok ? res.user : null
  },

  // Ganti password sendiri. Password lama diverifikasi ulang (re-auth) supaya
  // sesi yang tercuri tidak cukup untuk mengambil alih akun.
  async updatePassword(newPassword, oldPassword) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) throw new Error('Sesi tidak valid. Silakan login ulang.')
    if (!oldPassword) throw new Error('Password saat ini wajib diisi.')
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    })
    if (reauthErr) throw new Error('Password saat ini salah.')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  },

  // Admin mengganti password akun lain. Wajib lewat Edge Function karena
  // butuh service_role yang TIDAK boleh ada di browser.
  async adminSetPassword(email, password) {
    const { data, error } = await supabase.functions.invoke('admin-set-password', {
      body: { email, password },
    })
    if (error) throw new Error(data?.error || error.message || 'Gagal mengganti password')
    if (data?.error) throw new Error(data.error)
    return data
  },

  // ── Lupa password ─────────────────────────────────────────────
  // Mengirim email berisi tautan reset. Supabase SENGAJA tidak memberi tahu apakah
  // email terdaftar (mencegah enumerasi akun), jadi UI selalu menampilkan pesan yang sama.
  // Melempar Error dengan .code = 'rate_limit' | 'failed'.
  async requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      const limited = error.status === 429 || /rate limit|security purposes|after \d+ seconds/i.test(error.message || '')
      const e = new Error(error.message)
      e.code = limited ? 'rate_limit' : 'failed'
      throw e
    }
  },

  // Menyimpan password baru memakai token recovery dari tautan email.
  // Sengaja memanggil REST langsung (bukan supabase.auth.setSession) supaya sesi klien
  // bersama TIDAK berubah: AuthContext tidak ikut memproses sesi recovery (mis. akun mandor
  // yang tidak berhak masuk web), dan token tidak tersimpan di localStorage.
  // Melempar Error dengan .code = 'same_password' | 'weak' | 'expired' | 'rate_limit' | 'failed'.
  async resetPasswordWithToken(accessToken, newPassword) {
    let res
    try {
      res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      })
    } catch {
      const e = new Error('network'); e.code = 'network'; throw e
    }
    if (res.ok) return
    let body = null
    try { body = await res.json() } catch { /* body kosong */ }
    const e = new Error(body?.msg || body?.message || `HTTP ${res.status}`)
    e.code = classifyResetError(res.status, body)
    throw e
  },

  // Cabut token recovery setelah dipakai (best-effort; token tidak pernah disimpan di klien).
  async revokeRecoveryToken(accessToken) {
    try {
      await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
      })
    } catch { /* abaikan */ }
  },
}
