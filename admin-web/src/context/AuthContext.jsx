import { createContext, useContext, useState, useEffect, useRef } from 'react'
import supabase from '../services/supabaseClient'
import { resolveWebUser, ACCESS_DENIED_MESSAGES } from '../utils/security'

const AuthContext = createContext(null)

// Error dengan kode stabil agar UI dapat menampilkan pesan sesuai bahasa yang dipilih
function authError(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const userRef = useRef(null)
  const initDone = useRef(false)

  // Ambil profil dari public.users. FAIL-CLOSED: bila baris tidak ada, nonaktif,
  // atau perannya bukan admin/hr, kembalikan { denied } — bukan role 'admin'.
  const fetchUser = async (supabaseUser) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', supabaseUser.email)
        .maybeSingle()
      if (error) return { denied: 'not_registered' }
      const res = resolveWebUser(data)
      return res.ok ? { user: res.user } : { denied: res.reason }
    } catch {
      return { denied: 'not_registered' }
    }
  }

  // Terapkan hasil fetchUser: user sah → set state, ditolak → sign out.
  const applyFetched = async (result, isMounted = () => true) => {
    if (!isMounted()) return
    if (result.user) {
      userRef.current = result.user
      setUser(result.user)
    } else {
      userRef.current = null
      setUser(null)
      await supabase.auth.signOut()
    }
  }

  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        // Cek session langsung dari storage dulu — ini yang paling reliable saat refresh
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          await applyFetched(await fetchUser(session.user), () => mounted)
        } else {
          if (mounted) {
            userRef.current = null
            setUser(null)
          }
        }
      } catch (e) {
        console.error('Auth init error:', e)
        if (mounted) setUser(null)
      } finally {
        if (mounted) {
          initDone.current = true
          setLoading(false)
        }
      }
    }

    init()

    // Listener hanya untuk update setelah login/logout — bukan untuk init
    // PENTING: callback ini TIDAK boleh async / meng-await panggilan Supabase lain. Supabase
    // memanggilnya saat memegang kunci internal; query di dalamnya menunggu kunci yang sama
    // → deadlock. Itu yang membuat web "mati" beberapa detik setiap kali tab dibuka kembali
    // (Supabase memuat ulang token → memancarkan SIGNED_IN/TOKEN_REFRESHED). Solusi: tunda
    // pekerjaan berat ke luar callback (setTimeout 0) dan abaikan event untuk user yang sama.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || !initDone.current) return

      if (event === 'SIGNED_OUT') {
        userRef.current = null
        setUser(null)
        return
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        // Saat tab kembali aktif Supabase memancarkan SIGNED_IN lagi untuk sesi yang SAMA:
        // tidak perlu query ulang profil / render ulang seluruh aplikasi.
        const same = userRef.current?.email && session.user.email &&
          userRef.current.email.toLowerCase() === session.user.email.toLowerCase()
        if (same) return
        setTimeout(async () => {
          if (!mounted) return
          await applyFetched(await fetchUser(session.user), () => mounted)
        }, 0)
      }
    })

    const timeout = setTimeout(() => {
      if (mounted && !initDone.current) {
        initDone.current = true
        setLoading(false)
      }
    }, 8000)

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Translate Supabase error messages to Indonesian
      const msg = error.message?.toLowerCase() || ''
      if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('wrong')) {
        throw authError('invalid_credentials', 'Email atau password salah. Periksa kembali dan coba lagi.')
      } else if (msg.includes('email not confirmed')) {
        throw authError('email_not_confirmed', 'Email belum dikonfirmasi. Periksa inbox email Anda.')
      } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
        throw authError('rate_limit', 'Terlalu banyak percobaan login. Tunggu beberapa menit.')
      } else if (msg.includes('network') || msg.includes('fetch')) {
        throw authError('network', 'Koneksi gagal. Periksa internet Anda.')
      } else if (msg.includes('user not found') || msg.includes('no user')) {
        throw authError('user_not_found', 'Akun dengan email ini tidak ditemukan.')
      } else {
        throw authError('generic', 'Login gagal. Silakan coba lagi.')
      }
    }
    // Verifikasi hak akses sebelum dianggap login berhasil
    const fetched = await fetchUser(data.user)
    if (!fetched.user) {
      await supabase.auth.signOut()
      throw authError(fetched.denied || 'not_registered', ACCESS_DENIED_MESSAGES[fetched.denied] || ACCESS_DENIED_MESSAGES.not_registered)
    }
    return data
  }

  const logout = async () => {
    userRef.current = null
    setUser(null)
    await supabase.auth.signOut()
  }

  const isAdmin  = () => user?.role === 'admin'
  const isHR     = () => ['admin', 'hr'].includes(user?.role)
  const isMandor = () => ['admin', 'hr', 'mandor'].includes(user?.role)

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isHR, isMandor }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
