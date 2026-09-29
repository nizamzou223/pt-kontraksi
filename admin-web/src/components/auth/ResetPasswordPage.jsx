import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck, ArrowLeft, Check, KeyRound, Link2Off } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useLang } from '../../context/LanguageContext'
import { authService } from '../../services/authService'
import { parseRecoveryUrl } from '../../utils/recovery'
import { passwordProblem } from '../../utils/security'
import { authText } from '../../i18n/authStrings'
import { AuthControls, Field, BrandMark, authPalette, AUTH_CSS } from './authShared'

const PW_MESSAGES = { short: 'pwShort', noLetter: 'pwNoLetter', noDigit: 'pwNoDigit' }

// Halaman tujuan tautan "lupa password" dari email.
// Token recovery dibaca dari fragmen URL, langsung dihapus dari address bar, dan hanya
// disimpan di memori komponen (tidak di localStorage, tidak memengaruhi sesi login mana pun).
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { isDark } = useTheme()
  const { lang } = useLang()
  const t = authText(lang)
  const p = authPalette(isDark)

  const [parsed] = useState(() => parseRecoveryUrl(window.location.hash, window.location.search))
  const [token, setToken] = useState(parsed.status === 'ok' ? parsed.accessToken : null)
  const [phase, setPhase] = useState(parsed.status === 'ok' ? 'ready' : parsed.status) // ready | expired | invalid | done
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errKey, setErrKey] = useState('')
  const [shake, setShake] = useState(false)

  // Hapus token dari address bar & riwayat sesegera mungkin
  useEffect(() => {
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // Setelah berhasil: arahkan ke login
  useEffect(() => {
    if (phase !== 'done') return undefined
    const id = setTimeout(() => navigate('/login', { replace: true }), 4000)
    return () => clearTimeout(id)
  }, [phase, navigate])

  const rules = [
    pw.length >= 8,
    /[A-Za-z]/.test(pw),
    /\d/.test(pw),
  ]
  const strength = rules.filter(Boolean).length + (pw.length >= 12 && rules.every(Boolean) ? 1 : 0)
  const strengthColor = ['#e06a6a', '#e8a23a', '#c9b437', '#3fae8a', '#2f9474'][strength]

  const fail = (key) => { setErrKey(key); setShake(true); setTimeout(() => setShake(false), 600) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrKey('')
    const problem = passwordProblem(pw)
    if (problem) return fail(PW_MESSAGES[problem])
    if (pw !== confirm) return fail('pwMismatch')
    setSaving(true)
    try {
      await authService.resetPasswordWithToken(token, pw)
      authService.revokeRecoveryToken(token)
      setToken(null); setPw(''); setConfirm('')
      setPhase('done')
    } catch (err) {
      if (err.code === 'expired') { setToken(null); setPhase('expired') }
      else if (err.code === 'same_password') fail('samePw')
      else if (err.code === 'weak') fail('weakPw')
      else if (err.code === 'network') fail('resetNetwork')
      else fail('resetFail')
    } finally {
      setSaving(false)
    }
  }

  const goLogin = () => navigate('/login', { replace: true })
  const primaryStyle = {
    minHeight: 52,
    background: 'linear-gradient(120deg, #364b8c 0%, #4f6fc7 55%, #5b9bd5 100%)',
    boxShadow: '0 10px 26px rgba(79,111,199,0.34), inset 0 1px 0 rgba(255,255,255,0.18)',
  }
  const primaryClass = `lp-btn relative w-full rounded-2xl font-extrabold text-[14px] text-white overflow-hidden
    flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.985]
    disabled:opacity-60 disabled:cursor-not-allowed`

  const statusCard = (icon, title, body, action) => (
    <div className="text-center" style={{ animation: 'lpFadeUp .45s ease-out both' }}>
      <span className="inline-flex w-14 h-14 rounded-2xl items-center justify-center"
        style={{ background: p.chipBg, color: p.chipText }}>{icon}</span>
      <h2 className="mt-4 text-[1.4rem] font-extrabold tracking-tight" style={{ color: p.title }}>{title}</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: p.sub }}>{body}</p>
      {action}
    </div>
  )

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 pt-[72px] sm:p-6 overflow-hidden"
      style={{ background: p.pageBg, transition: 'background .4s ease' }}>
      <AuthControls />

      <div role="main" className="relative w-full max-w-[440px]"
        style={{ animation: 'lpEnter .7s .05s cubic-bezier(0.22,1,0.36,1) backwards' }}>
        <div className="rounded-[32px] overflow-hidden px-7 sm:px-10 py-10"
          style={{ background: p.shellBg, boxShadow: p.shellShadow, transition: 'background .4s ease' }}>

          <div className="text-center mb-7">
            <div className="lp-logo-anim relative inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-3"
              style={{ background: 'linear-gradient(145deg,#364b8c,#5b9bd5)', boxShadow: '0 10px 26px rgba(79,111,199,0.32)' }}>
              <BrandMark size={38} />
              <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center font-black text-[8px]"
                style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#2e3d6e', border: `2px solid ${p.shellBg}` }}>KP</span>
            </div>
            <p className="text-[16px] font-extrabold" style={{ color: p.title }}>PT Krakatau Indah</p>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: p.muted }}>{t.brandSub}</p>
          </div>

          {phase === 'ready' && (
            <div style={{ animation: 'lpFadeUp .45s ease-out both' }}>
              <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: p.chipBg, color: p.chipText }}>
                <KeyRound size={22} />
              </span>
              <h1 className="mt-4 text-[1.55rem] font-extrabold tracking-tight leading-tight" style={{ color: p.title }}>{t.resetTitle}</h1>
              <p className="mt-1.5 text-[13.5px]" style={{ color: p.sub }}>{t.resetSub}</p>

              <form onSubmit={handleSubmit} noValidate className="mt-6" style={{ display: 'grid', gap: 16 }}>
                <div aria-live="assertive">
                  {errKey && (
                    <div role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl text-[12.5px] font-semibold"
                      style={{ background: p.errBg, border: `1px solid ${p.errBorder}`, color: p.errText, animation: 'lpSlideDown .25s ease-out' }}>
                      <AlertCircle size={15} className="flex-shrink-0 mt-px" />
                      <span>{t[errKey]}</span>
                    </div>
                  )}
                </div>

                <div className={shake ? 'login-shake' : ''} style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <Field id="new-password" label={t.newPw} icon={Lock} name="new-password" p={p}
                      type={showPw ? 'text' : 'password'} autoComplete="new-password" autoFocus
                      value={pw} error={!!errKey && errKey !== 'pwMismatch'}
                      onChange={(e) => { setPw(e.target.value); setErrKey('') }} placeholder={t.passwordPh}
                      right={
                        <button type="button" onClick={() => setShowPw((v) => !v)}
                          aria-label={showPw ? t.hidePw : t.showPw}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors"
                          style={{ color: p.icon }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = p.iconHover)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = p.icon)}>
                          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      } />
                    {/* indikator kekuatan */}
                    <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
                      {[1, 2, 3, 4].map((n) => (
                        <span key={n} className="h-1.5 flex-1 rounded-full transition-colors"
                          style={{ background: pw && strength >= n ? strengthColor : p.divider }} />
                      ))}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]" style={{ color: p.muted }}>
                      {[t.pwRule.split(', ')[0], lang === 'en' ? 'Letters' : 'Huruf', lang === 'en' ? 'Numbers' : 'Angka'].map((label, i) => (
                        <li key={i} className="inline-flex items-center gap-1 font-semibold"
                          style={{ color: rules[i] ? p.okText : p.muted }}>
                          <Check size={12} style={{ opacity: rules[i] ? 1 : 0.35 }} /> {label}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Field id="confirm-password" label={t.confirmPw} icon={Lock} name="confirm-password" p={p}
                    type={showPw ? 'text' : 'password'} autoComplete="new-password"
                    value={confirm} error={errKey === 'pwMismatch'}
                    onChange={(e) => { setConfirm(e.target.value); setErrKey('') }} placeholder={t.confirmPh} />
                </div>

                <button type="submit" disabled={saving} className={primaryClass} style={primaryStyle}>
                  <span className="lp-sheen" aria-hidden="true" />
                  {saving ? <><Loader2 size={17} className="animate-spin" />{t.saving}</> : <><ShieldCheck size={16} /><span>{t.savePw}</span></>}
                </button>
              </form>
            </div>
          )}

          {phase === 'done' && statusCard(
            <Check size={28} />, t.resetOk, t.resetOkSub,
            <button type="button" onClick={goLogin} className={`${primaryClass} mt-7`} style={primaryStyle}>
              <span className="lp-sheen" aria-hidden="true" /><span>{t.goLogin}</span>
            </button>,
          )}

          {(phase === 'expired' || phase === 'invalid') && statusCard(
            <Link2Off size={26} />,
            phase === 'expired' ? t.expiredTitle : t.invalidTitle,
            phase === 'expired' ? t.expiredSub : t.invalidSub,
            <>
              <button type="button" onClick={goLogin} className={`${primaryClass} mt-7`} style={primaryStyle}>
                <span className="lp-sheen" aria-hidden="true" /><span>{t.requestNew}</span>
              </button>
              <button type="button" onClick={goLogin} className="lp-link mt-5 inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: p.accent }}>
                <ArrowLeft size={15} /> {t.backToLogin}
              </button>
            </>,
          )}

          <div className="mt-8 pt-5 flex items-center justify-center gap-1.5 text-[10.5px]" style={{ borderTop: `1px solid ${p.divider}`, color: p.footer }}>
            <ShieldCheck size={11} style={{ color: p.accent }} /> {t.secure}
          </div>
        </div>
      </div>

      <style>{AUTH_CSS}</style>
    </div>
  )
}
