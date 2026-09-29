import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, User, Mail, Shield, BadgeCheck, Briefcase, MapPin,
  Moon, Sun, Languages, Lock, LogOut, ChevronRight, Eye, EyeOff,
  Building2, Tag, CheckCircle, XCircle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useLang } from '../../context/LanguageContext'
import supabase from '../../services/supabaseClient'
import { authService } from '../../services/authService'
import { validatePassword } from '../../utils/security'
import toast from 'react-hot-toast'

// ── Color helpers based on theme ─────────────────────────────────
function useColors() {
  const { isDark } = useTheme()
  return {
    bg:     isDark ? '#0D1421' : '#F4F7FF',
    card:   isDark ? '#182033' : '#FFFFFF',
    border: isDark ? '#2A3650' : '#E0E7FF',
    text:   isDark ? '#DDE6F5' : '#2f3a5c',
    sub:    isDark ? '#8A9AB8' : '#64748B',
    muted:  isDark ? '#4E5F7C' : '#94A3B8',
    input:  isDark ? '#0D1421' : '#F8FAFF',
    inputBorder: isDark ? '#334155' : '#CBD5E1',
    brand:  '#4f6fc7',
    brandLight: isDark ? '#2e3d6e' : '#EFF6FF',
    brandText:  isDark ? '#60A5FA' : '#4f6fc7',
  }
}

// ── Info row ─────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, c, valueColor }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
      <div style={{
        width: 34, height: 34, borderRadius: '9px', flexShrink: 0,
        background: c.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} color={c.brandText} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '10px', color: c.sub, fontWeight: 500, marginBottom: '2px' }}>{label}</p>
        <p style={{ fontSize: '13px', fontWeight: 600, color: valueColor || c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ── Section card ─────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, c, children }) {
  return (
    <div style={{
      background: c.card,
      borderRadius: '16px',
      border: `1px solid ${c.border}`,
      padding: '16px',
      marginBottom: '14px',
      animation: 'slideUp 0.25s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{
          width: 30, height: 30, borderRadius: '8px',
          background: c.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} color={c.brandText} />
        </div>
        <p style={{ fontSize: '12px', fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </p>
      </div>
      {children}
    </div>
  )
}

// ── Toggle switch ────────────────────────────────────────────────
function ToggleRow({ icon: Icon, label, sub, checked, onToggle, c, iconBg, iconColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
        background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} color={iconColor} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: c.text }}>{label}</p>
        <p style={{ fontSize: '11px', color: c.sub }}>{sub}</p>
      </div>
      <button
        onClick={onToggle}
        style={{
          width: 48, height: 26, borderRadius: '13px', border: 'none',
          cursor: 'pointer', padding: '3px',
          background: checked ? '#4f6fc7' : '#CBD5E1',
          transition: 'background 0.25s',
          position: 'relative', flexShrink: 0,
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
          position: 'absolute', top: 3,
          left: checked ? 'calc(100% - 23px)' : '3px',
          transition: 'left 0.25s cubic-bezier(0.22,1,0.36,1)',
        }} />
      </button>
    </div>
  )
}

// ── Language pill ────────────────────────────────────────────────
function LangPill({ label, active, c }) {
  return (
    <span style={{
      padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: 700,
      background: active ? '#4f6fc7' : 'transparent',
      color: active ? 'white' : c.brandText,
      transition: 'all 0.2s',
    }}>
      {label}
    </span>
  )
}

// ── Password change form ─────────────────────────────────────────
function PasswordSection({ c, s }) {
  const [open, setOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confPw, setConfPw] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setError('')
    { const pwErr = validatePassword(newPw); if (pwErr) { setError(pwErr); return } }
    if (newPw !== confPw) { setError(s.passwordMismatch); return }
    setLoading(true)
    try {
      await authService.updatePassword(newPw, oldPw)
      toast.success(s.passwordChanged)
      setOpen(false)
      setOldPw(''); setNewPw(''); setConfPw('')
    } catch (e) {
      setError(e.message || s.passwordError)
    } finally {
      setLoading(false)
    }
  }

  const inp = (value, onChange, placeholder, show, setShow) => (
    <div style={{ position: 'relative', marginBottom: '12px' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 40px 10px 12px', borderRadius: '10px',
          border: `1px solid ${c.inputBorder}`, background: c.input,
          color: c.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box',
        }}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: c.muted }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '6px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
          background: c.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={17} color={c.brandText} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: c.text }}>{s.changePassword}</p>
          <p style={{ fontSize: '11px', color: c.sub }}>{s.changePasswordSub}</p>
        </div>
        <ChevronRight size={15} color={c.muted} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{
          marginTop: '12px', padding: '14px', borderRadius: '12px',
          background: c.input, border: `1px solid ${c.inputBorder}`,
          animation: 'slideDown 0.2s ease-out',
        }}>
          {inp(oldPw, setOldPw, s.passwordCurrent, showOld, setShowOld)}
          {inp(newPw, setNewPw, s.passwordNew, showNew, setShowNew)}
          {inp(confPw, setConfPw, s.passwordConfirm, showNew, setShowNew)}
          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <XCircle size={13} /> {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { setOpen(false); setError(''); setOldPw(''); setNewPw(''); setConfPw('') }}
              style={{
                flex: 1, padding: '9px', borderRadius: '10px',
                border: `1.5px solid ${c.border}`, background: 'transparent',
                color: c.sub, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >{s.cancel}</button>
            <button
              onClick={handleSave}
              disabled={loading}
              style={{
                flex: 1, padding: '9px', borderRadius: '10px', border: 'none',
                background: loading ? '#93C5FD' : '#4f6fc7',
                color: 'white', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '...' : s.save}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Logout confirm dialog ────────────────────────────────────────
function LogoutDialog({ open, onConfirm, onCancel, userName, c, s }) {
  const [confirming, setConfirming] = useState(false)
  if (!open) return null

  const doConfirm = async () => {
    setConfirming(true)
    await onConfirm()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 360,
        background: c.card, borderRadius: '24px', overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)', border: `1px solid ${c.border}`,
        animation: 'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '28px 28px 20px', textAlign: 'center',
          background: 'linear-gradient(145deg, #2f3a5c 0%, #2e3d6e 60%, #364b8c 100%)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <LogOut size={28} color="#dc2626" />
          </div>
          <p style={{ color: 'rgba(148,163,184,1)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '4px' }}>Konfirmasi</p>
          <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 900, margin: 0 }}>Keluar dari Sistem?</h2>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', borderRadius: '12px',
            background: c.brandLight, border: `1px solid ${c.border}`, marginBottom: '16px',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4059ad, #5b9bd5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 900, fontSize: '13px',
            }}>
              {userName?.[0]?.toUpperCase() || 'A'}
            </div>
            <div>
              <p style={{ fontSize: '10px', color: c.brandText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1px' }}>Sesi Aktif</p>
              <p style={{ fontSize: '13px', fontWeight: 800, color: c.text, margin: 0 }}>{userName || 'Admin'}</p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <span style={{ padding: '3px 8px', borderRadius: '100px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>
                Online
              </span>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: c.sub, textAlign: 'center', lineHeight: 1.6, marginBottom: '20px' }}>
            Anda akan keluar dan sesi ini akan diakhiri.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onCancel}
              disabled={confirming}
              style={{
                flex: 1, padding: '11px', borderRadius: '12px',
                border: `1.5px solid ${c.border}`, background: c.card,
                fontSize: '13px', fontWeight: 700, color: c.sub, cursor: 'pointer',
              }}
            >Batalkan</button>
            <button
              onClick={doConfirm}
              disabled={confirming}
              style={{
                flex: 1, padding: '11px', borderRadius: '12px', border: 'none',
                background: confirming ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#b91c1c)',
                fontSize: '13px', fontWeight: 700, color: 'white', cursor: confirming ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {confirming
                ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Keluar...</>
                : <><LogOut size={13} /> Ya, Keluar</>
              }
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Main profile page ────────────────────────────────────────────
export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { isDark, toggle: toggleTheme } = useTheme()
  const { isEnglish, toggle: toggleLang, s } = useLang()
  const c = useColors()

  const [extUser, setExtUser] = useState(null)
  const [showLogout, setShowLogout] = useState(false)

  // Fetch extended user data with karyawan + project joins
  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('users')
      .select('*, karyawan(*, jabatan(*), departemen(*)), project(*)')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }) => { if (data) setExtUser(data) })
  }, [user?.email])

  const displayUser = extUser || user
  const karyawan = extUser?.karyawan
  const project  = extUser?.project
  const initial  = displayUser?.nama_lengkap?.[0]?.toUpperCase() || 'A'

  const roleLabel = {
    admin: 'Administrator',
    hr: 'HR / Personalia',
    mandor: 'Mandor',
    staff: 'Staff',
  }[displayUser?.role] || displayUser?.role || 'Admin'

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', paddingBottom: 40 }}>

      {/* Back link */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', fontWeight: 600, color: c.sub, textDecoration: 'none',
          padding: '6px 12px', borderRadius: '10px', border: `1px solid ${c.border}`,
          background: c.card, transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#4f6fc7'; e.currentTarget.style.borderColor = '#93C5FD' }}
          onMouseLeave={e => { e.currentTarget.style.color = c.sub; e.currentTarget.style.borderColor = c.border }}
        >
          <ArrowLeft size={14} />
          {s.backToDashboard}
        </Link>
      </div>

      {/* ── Avatar header ── */}
      <div style={{
        borderRadius: '20px',
        background: 'linear-gradient(135deg, #364b8c 0%, #4059ad 55%, #4f6fc7 100%)',
        boxShadow: '0 10px 40px rgba(79,111,199,0.35)',
        padding: '24px',
        marginBottom: '14px',
        animation: 'slideUp 0.3s ease-out',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          {/* Avatar */}
          <div style={{
            width: 76, height: 76, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #60a5fa, #6784d8)',
            border: '2.5px solid rgba(255,255,255,0.3)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', fontWeight: 900, color: 'white',
            animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {initial}
          </div>

          <div style={{ flex: 1 }}>
            <p style={{ color: 'white', fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>
              {displayUser?.nama_lengkap || 'Admin'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              <span style={{
                padding: '3px 12px', borderRadius: '20px',
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.25)',
                color: 'white', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize',
              }}>
                {roleLabel}
              </span>
              {displayUser?.status_aktif !== false && (
                <span style={{
                  padding: '3px 10px', borderRadius: '20px',
                  background: 'rgba(34,197,94,0.25)', border: '1px solid rgba(34,197,94,0.4)',
                  color: '#bbf7d0', fontSize: '11px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  {s.active}
                </span>
              )}
            </div>
            {karyawan?.nik && (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', marginTop: '6px' }}>
                NIK: {karyawan.nik}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Account info ── */}
      <SectionCard title={s.accountInfo} icon={User} c={c}>
        <div style={{ borderTop: `1px solid ${c.border}` }}>
          <InfoRow icon={User}      label={s.fullName} value={displayUser?.nama_lengkap} c={c} />
          <div style={{ borderTop: `1px solid ${c.border}` }} />
          <InfoRow icon={Mail}      label={s.email}    value={displayUser?.email}        c={c} />
          <div style={{ borderTop: `1px solid ${c.border}` }} />
          <InfoRow icon={Shield}    label={s.role}     value={roleLabel}                 c={c} valueColor={c.brandText} />
          {karyawan?.nik && <>
            <div style={{ borderTop: `1px solid ${c.border}` }} />
            <InfoRow icon={BadgeCheck} label={s.nik}  value={karyawan.nik}              c={c} />
          </>}
          <div style={{ borderTop: `1px solid ${c.border}` }} />
          <InfoRow icon={CheckCircle} label={s.status}
            value={displayUser?.status_aktif !== false ? s.active : s.inactive}
            c={c}
            valueColor={displayUser?.status_aktif !== false ? '#16a34a' : '#dc2626'} />
        </div>
      </SectionCard>

      {/* ── Karyawan info ── */}
      {karyawan && (
        <SectionCard title={s.employeeInfo} icon={BadgeCheck} c={c}>
          <div style={{ borderTop: `1px solid ${c.border}` }}>
            {karyawan.jabatan?.nama_jabatan && <>
              <InfoRow icon={Briefcase} label={s.position}   value={karyawan.jabatan.nama_jabatan} c={c} />
              <div style={{ borderTop: `1px solid ${c.border}` }} />
            </>}
            {karyawan.departemen?.nama_departemen && <>
              <InfoRow icon={Building2} label={s.department} value={karyawan.departemen.nama_departemen} c={c} />
              <div style={{ borderTop: `1px solid ${c.border}` }} />
            </>}
            {karyawan.no_telepon && (
              <InfoRow icon={BadgeCheck} label="No. Telepon" value={karyawan.no_telepon} c={c} />
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Project ── */}
      {project && (
        <SectionCard title={s.projectInfo} icon={Briefcase} c={c}>
          <div style={{ borderTop: `1px solid ${c.border}` }}>
            <InfoRow icon={Briefcase} label={s.projectName} value={project.nama_project} c={c} />
            <div style={{ borderTop: `1px solid ${c.border}` }} />
            <InfoRow icon={Tag}       label={s.projectCode} value={project.kode_project} c={c} />
            {project.lokasi && <>
              <div style={{ borderTop: `1px solid ${c.border}` }} />
              <InfoRow icon={MapPin}  label={s.location}    value={project.lokasi}       c={c} />
            </>}
          </div>
        </SectionCard>
      )}

      {/* ── Settings ── */}
      <SectionCard title={s.settings} icon={Sun} c={c}>
        <ToggleRow
          icon={isDark ? Moon : Sun}
          label={s.darkMode}
          sub={isDark ? s.darkModeOn : s.darkModeOff}
          checked={isDark}
          onToggle={toggleTheme}
          c={c}
          iconBg={isDark ? '#1E2D4A' : '#EFF6FF'}
          iconColor={isDark ? '#60A5FA' : '#4f6fc7'}
        />

        <div style={{ borderTop: `1px solid ${c.border}`, margin: '4px 0' }} />

        {/* Language */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
            background: isDark ? '#1A3320' : '#ECFDF5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Languages size={17} color={isDark ? '#4ADE80' : '#16A34A'} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: c.text }}>{s.language}</p>
            <p style={{ fontSize: '11px', color: c.sub }}>{s.languageName}</p>
          </div>
          <button
            onClick={toggleLang}
            style={{
              display: 'flex', alignItems: 'center', gap: '2px',
              padding: '3px 4px', borderRadius: '20px', cursor: 'pointer',
              background: isDark ? '#1A3320' : '#ECFDF5',
              border: `1px solid ${isDark ? '#166534' : '#BBF7D0'}`,
            }}
          >
            <LangPill label="ID" active={!isEnglish} c={c} />
            <LangPill label="EN" active={isEnglish}  c={c} />
          </button>
        </div>
      </SectionCard>

      {/* ── Security ── */}
      <SectionCard title={s.security} icon={Lock} c={c}>
        <PasswordSection c={c} s={s} />
      </SectionCard>

      {/* ── Logout button ── */}
      <button
        onClick={() => setShowLogout(true)}
        style={{
          width: '100%', padding: '14px', borderRadius: '14px',
          border: `1.5px solid #FCA5A5`,
          background: isDark ? '#1F0A0A' : '#FEF2F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          cursor: 'pointer', transition: 'all 0.15s',
          fontSize: '14px', fontWeight: 700, color: '#DC2626',
          animation: 'slideUp 0.35s ease-out',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = isDark ? '#2D0E0E' : '#FEE2E2'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(220,38,38,0.2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = isDark ? '#1F0A0A' : '#FEF2F2'; e.currentTarget.style.boxShadow = 'none' }}
      >
        <LogOut size={17} />
        {s.logout}
      </button>

      {/* Version */}
      <p style={{ textAlign: 'center', fontSize: '11px', color: c.muted, marginTop: '20px' }}>
        {s.appVersion}
      </p>

      <LogoutDialog
        open={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={async () => { await logout(); setShowLogout(false) }}
        userName={displayUser?.nama_lengkap || displayUser?.email}
        c={c} s={s}
      />
    </div>
  )
}
