import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useProject } from '../../context/ProjectContext'
import { useTheme } from '../../context/ThemeContext'
import { useTabVisible, usePolling } from '../../utils/pageActivity'
import { reportService } from '../../services/auditService'
import {
  LayoutDashboard, Briefcase, DollarSign,
  Package, Settings, LogOut, Menu, X, ChevronDown,
  Building2, ChevronRight, CheckCircle, AlertTriangle,
  Info, XCircle, Bell, Wifi, WifiOff, RefreshCw, Clock, BarChart2,
  User, Brain,
} from 'lucide-react'
import logoKrakatau from '../../assets/logo-krakatau.png'

// ─────────────────────────────────────────────
// MENU CONFIG
// ─────────────────────────────────────────────
const menuItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/', children: [] },
  {
    label: 'Master Data', icon: Building2, path: '/master',
    children: [
      { label: 'Departemen', path: '/master/departemen' },
      { label: 'Golongan', path: '/master/jabatan' },
      { label: 'Karyawan', path: '/master/karyawan' },
      { label: 'Project', path: '/master/project' },
      { label: 'QR Code', path: '/master/qrcode' },
    ]
  },
  {
    label: 'Penggajian', icon: DollarSign, path: '/penggajian',
    children: [
      { label: 'Presensi', path: '/penggajian/presensi' },
      { label: 'Lembur', path: '/penggajian/lembur' },
      { label: 'Kasbon', path: '/penggajian/kasbon' },
      { label: 'Gaji Mingguan', path: '/penggajian/gaji-mingguan' },
      { label: 'Gaji Bulanan', path: '/penggajian/gaji-bulanan' },
      { label: 'Pembayaran Otomatis', path: '/penggajian/pembayaran' },
    ]
  },
  {
    label: 'Inventaris', icon: Package, path: '/inventaris',
    children: [
      { label: 'Daftar Barang', path: '/inventaris/barang' },
      { label: 'Stok Masuk', path: '/inventaris/stok-masuk' },
      { label: 'Stok Keluar', path: '/inventaris/stok-keluar' },
      { label: 'Permintaan Barang', path: '/inventaris/permintaan' },
      { label: 'Retur / Sisa Barang', path: '/inventaris/retur' },
      { label: 'Monitoring Stok', path: '/inventaris/monitoring' },
      { label: 'History Barang', path: '/laporan/inventory-barang' },
      { label: 'History Uang', path: '/laporan/inventory-uang' },
      { label: 'Prediksi Stok (ML)', path: '/inventaris/prediksi' },
    ]
  },
  {
    label: 'Laporan', icon: BarChart2, path: '/laporan',
    children: [
      { label: 'Ringkasan Semua', path: '/laporan/ringkasan' },
      { label: 'per Project', path: '/laporan/project' },
      { label: 'per Karyawan', path: '/laporan/karyawan' },
      { label: 'Inventaris', path: '/laporan/inventaris' },
    ]
  },
  {
    label: 'Sistem Cerdas', icon: Brain, path: '/ai',
    children: [
      { label: 'Ringkasan', path: '/ai' },
      { label: 'Peramalan Material', path: '/ai/peramalan' },
      { label: 'Deteksi Anomali', path: '/ai/anomali' },
    ]
  },
  {
    label: 'Pengaturan', icon: Settings, path: '/pengaturan',
    children: [
      { label: 'Manajemen Admin', path: '/pengaturan/users' },
      { label: 'Akun Mobile (Mandor)', path: '/pengaturan/mandor-accounts' },
      { label: 'Audit Log', path: '/pengaturan/audit-log' },
    ]
  },
]

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
// ── Jam sidebar ──────────────────────────────────
function SidebarClock() {
  const [time, setTime] = useState(new Date())
  const { isDark } = useTheme()
  const tabVisible = useTabVisible()
  useEffect(() => {
    if (!tabVisible) return undefined   // tab tersembunyi → jam berhenti, tidak ada render sia-sia
    setTime(new Date())
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [tabVisible])
  const pad = n => String(n).padStart(2, '0')
  const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  return (
    <div className="mx-3 mb-2 px-3 py-2.5 rounded-xl select-none"
      style={{ background: isDark ? 'rgba(79,111,199,0.08)' : 'rgba(103,132,216,0.08)', border: `1px solid ${isDark ? 'rgba(103,132,216,0.15)' : 'rgba(103,132,216,0.15)'}` }}>
      <div className="flex items-center justify-between">
        <div className="font-mono text-lg font-black tracking-widest"
          style={{ color: '#4059ad' }}>
          {pad(time.getHours())}
          <span className="clock-colon" style={{ color: '#6784d8' }}>:</span>
          {pad(time.getMinutes())}
          <span className="clock-colon" style={{ color: '#93c5fd', fontSize: '1rem' }}>:</span>
          <span style={{ fontSize: '1rem', color: '#60a5fa' }}>{pad(time.getSeconds())}</span>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold leading-tight" style={{ color: '#6784d8' }}>{days[time.getDay()]}</p>
          <p className="text-[10px] leading-tight" style={{ color: '#93c5fd' }}>{time.getDate()} {months[time.getMonth()]}</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// LOGOUT CONFIRM DIALOG
// ─────────────────────────────────────────────
function LogoutConfirmDialog({ open, onConfirm, onCancel, userName }) {
  const [confirming, setConfirming] = useState(false)

  const handleConfirm = async () => {
    setConfirming(true)
    await onConfirm()
  }

  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(8px)',
          animation: 'lgBackdropIn 0.25s ease-out forwards',
        }}
      />

      {/* Dialog card */}
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: '360px',
        animation: 'lgCardIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards',
        opacity: 0,
      }}>
        {/* Glow belakang */}
        <div style={{
          position: 'absolute', inset: '-12px',
          borderRadius: '36px',
          background: 'radial-gradient(ellipse, rgba(239,68,68,0.2) 0%, transparent 70%)',
          animation: 'lgGlow 2s ease-in-out infinite',
        }}/>

        <div style={{
          background: 'white',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.4)',
        }}>
          {/* Header merah */}
          <div style={{
            padding: '28px 28px 20px',
            background: 'linear-gradient(145deg, #2f3a5c 0%, #2e3d6e 60%, #364b8c 100%)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Shimmer */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.05) 50%, transparent 65%)',
              animation: 'lgShimmer 3s ease-in-out infinite',
            }}/>
            {/* Lingkaran dekor */}
            <div style={{
              position: 'absolute', top: '-20px', right: '-20px',
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            }}/>

            {/* Icon logout animated */}
            <div style={{
              position: 'relative', display: 'inline-block', marginBottom: '14px',
              animation: 'lgIconBounce 0.5s 0.2s cubic-bezier(0.34,1.56,0.64,1) both',
              opacity: 0,
            }}>
              {/* Ring */}
              {[0,1].map(i => (
                <div key={i} style={{
                  position: 'absolute', inset: `-${8 + i*8}px`,
                  borderRadius: '50%',
                  border: `1.5px solid rgba(239,68,68,${0.3 - i*0.1})`,
                  animation: `lgRipple 2s ${i * 0.6}s ease-out infinite`,
                }}/>
              ))}
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'linear-gradient(145deg, #fee2e2, #fecaca)',
                border: '2px solid rgba(239,68,68,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(239,68,68,0.25)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ animation: 'lgIconWiggle 3s 1s ease-in-out infinite' }}>
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </div>
            </div>

            <div style={{ animation: 'lgFadeUp 0.4s 0.35s ease-out both', opacity: 0 }}>
              <p style={{ color: 'rgba(148,163,184,1)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '4px' }}>
                Konfirmasi Tindakan
              </p>
              <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 900, margin: 0 }}>
                Keluar dari Sistem?
              </h2>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px 24px' }}>
            {/* Chip nama user */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #f8faff, #eff6ff)',
              border: '1px solid #dbeafe', marginBottom: '16px',
              animation: 'lgFadeUp 0.4s 0.45s ease-out both', opacity: 0,
            }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #4059ad, #5b9bd5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 900, fontSize: '13px',
              }}>
                {userName?.[0]?.toUpperCase() || 'A'}
              </div>
              <div>
                <p style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1px' }}>Sesi Aktif</p>
                <p style={{ fontSize: '13px', fontWeight: 800, color: '#364b8c', margin: 0 }}>{userName || 'Admin'}</p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '3px 8px', borderRadius: '100px',
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  fontSize: '10px', color: '#16a34a', fontWeight: 600,
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/>
                  Online
                </span>
              </div>
            </div>

            <p style={{
              fontSize: '13px', color: '#64748b', textAlign: 'center',
              lineHeight: 1.6, marginBottom: '20px',
              animation: 'lgFadeUp 0.4s 0.5s ease-out both', opacity: 0,
            }}>
              Anda akan keluar dan sesi ini akan diakhiri.<br/>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>Pastikan semua pekerjaan sudah tersimpan.</span>
            </p>

            {/* Tombol */}
            <div style={{
              display: 'flex', gap: '10px',
              animation: 'lgFadeUp 0.4s 0.55s ease-out both', opacity: 0,
            }}>
              <button
                onClick={onCancel}
                disabled={confirming}
                style={{
                  flex: 1, padding: '11px', borderRadius: '12px',
                  border: '1.5px solid #e2e8f0', background: 'white',
                  fontSize: '13px', fontWeight: 700, color: '#475569',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              >
                Batalkan
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                style={{
                  flex: 1, padding: '11px', borderRadius: '12px',
                  background: confirming
                    ? '#fca5a5'
                    : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  border: 'none', fontSize: '13px', fontWeight: 700,
                  color: 'white', cursor: confirming ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!confirming) e.currentTarget.style.boxShadow = '0 6px 20px rgba(220,38,38,0.45)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(220,38,38,0.3)' }}
              >
                {confirming ? (
                  <>
                    <div style={{ width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
                    Keluar...
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Ya, Keluar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes lgBackdropIn  { from{opacity:0} to{opacity:1} }
        @keyframes lgCardIn      { 0%{opacity:0;transform:scale(0.75) translateY(20px)} 70%{transform:scale(1.02) translateY(-2px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes lgGlow        { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.05)} }
        @keyframes lgShimmer     { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        @keyframes lgIconBounce  { 0%{opacity:0;transform:scale(0.3) rotate(-20deg)} 70%{transform:scale(1.1) rotate(5deg)} 100%{opacity:1;transform:scale(1) rotate(0deg)} }
        @keyframes lgRipple      { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2);opacity:0} }
        @keyframes lgIconWiggle  { 0%,100%{transform:translateX(0)} 20%{transform:translateX(3px)} 40%{transform:translateX(-3px)} 60%{transform:translateX(2px)} 80%{transform:translateX(-2px)} }
        @keyframes lgFadeUp      { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin          { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

export const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation()
  const { logout, user } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const sd = {
    bg:     isDark ? 'linear-gradient(180deg,#0D1421 0%,#111827 40%,#26304f 100%)' : 'linear-gradient(180deg,#ffffff 0%,#f8faff 40%,#f0f4ff 100%)',
    border: isDark ? '#2A3650' : '#e0e7ff',
    text:   isDark ? '#DDE6F5' : '#2e3d6e',
    sub:    isDark ? '#8A9AB8' : '#475569',
    muted:  isDark ? '#4E5F7C' : '#94a3b8',
    hover:  isDark ? 'rgba(99,130,190,0.12)' : 'rgba(103,132,216,0.06)',
    activeText: isDark ? '#93C5FD' : '#4059ad',
    activeBg:   isDark ? 'rgba(79,111,199,0.15)' : 'rgba(79,111,199,0.1)',
    activeBorder: isDark ? '#6784d8' : '#4059ad',
    childBorder: isDark ? '#3B4D6A' : '#bfdbfe',
    childText:   isDark ? '#8A9AB8' : '#64748b',
    childActiveBg: isDark ? 'rgba(79,111,199,0.18)' : 'rgba(79,111,199,0.1)',
    footerBg:   isDark ? '#182033' : 'transparent',
    clockBg:    isDark ? 'rgba(103,132,216,0.06)' : 'rgba(103,132,216,0.08)',
    clockBorder: isDark ? 'rgba(103,132,216,0.12)' : 'rgba(103,132,216,0.15)',
  }

  const [openMenus, setOpenMenus] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_menus')
      if (saved) return JSON.parse(saved)
    } catch {}
    const init = {}
    menuItems.forEach(item => {
      if (item.children?.some(c => location.pathname.startsWith('/' + c.path.split('/')[1]))) {
        init[item.label] = true
      }
    })
    return init
  })

  const toggleMenu = (label) => {
    setOpenMenus(prev => {
      const next = { ...prev, [label]: !prev[label] }
      try { localStorage.setItem('sidebar_menus', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const isActive = (path) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
  const isChildActive = (item) => item.children?.some(c => location.pathname === c.path)

  return (
    <>
      <aside className={`
        fixed top-0 left-0 h-full w-64 z-30 flex flex-col
        transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `} style={{ background: sd.bg, borderRight: `1px solid ${sd.border}` }}>

        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-none"
          style={{ background: 'linear-gradient(90deg, #4059ad, #5b9bd5, #8ccaf0)' }} />

        {/* ── Header / Logo ── */}
        <div className="relative flex items-center gap-3 px-4 py-4 mt-1"
          style={{ borderBottom: `1px solid ${sd.border}` }}>
          {/* Logo */}
          <div className="relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden"
            style={{ background: 'white', boxShadow: '0 4px 16px rgba(79,111,199,0.3)' }}>
            <img src={logoKrakatau} alt="PT Krakatau Indah" width={34} height={34} style={{ objectFit: 'contain' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm leading-tight" style={{ color: sd.text }}>PT Krakatau Indah</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="pulse-dot" style={{ width: 6, height: 6 }} />
              <p className="text-[10px] font-medium" style={{ color: '#6784d8' }}>Admin System · Live</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: sd.muted }}
            onMouseEnter={e => e.currentTarget.style.background = sd.hover}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={15} />
          </button>
        </div>

        {/* ── Jam realtime ── */}
        <div className="pt-3">
          <SidebarClock />
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {menuItems.map((item, idx) => (
            <div key={item.label} style={{ animationDelay: `${idx * 40}ms` }} className="animate-slideRight">
              {item.children.length === 0 ? (
                <Link
                  to={item.path}
                  onClick={() => window.innerWidth < 1024 && onClose()}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                  style={isActive(item.path) ? {
                    background: sd.activeBg,
                    color: sd.activeText,
                    borderLeft: `3px solid ${sd.activeBorder}`,
                    fontWeight: 700,
                  } : { color: sd.sub }}
                  onMouseEnter={e => { if (!isActive(item.path)) { e.currentTarget.style.background = sd.hover; e.currentTarget.style.color = sd.activeText }}}
                  onMouseLeave={e => { if (!isActive(item.path)) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = sd.sub }}}
                >
                  <item.icon size={17} />
                  {item.label}
                </Link>
              ) : (
                <div>
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                    style={(isChildActive(item) || openMenus[item.label]) ? {
                      color: sd.activeText,
                      background: sd.hover,
                      fontWeight: 600,
                    } : { color: sd.sub }}
                    onMouseEnter={e => { if (!(isChildActive(item) || openMenus[item.label])) { e.currentTarget.style.background = sd.hover; e.currentTarget.style.color = sd.activeText }}}
                    onMouseLeave={e => { if (!(isChildActive(item) || openMenus[item.label])) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = sd.sub }}}
                  >
                    <item.icon size={17} />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown size={13} className={`transition-transform duration-300 ${openMenus[item.label] ? 'rotate-180' : ''}`} />
                  </button>

                  <div className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${openMenus[item.label] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="ml-8 mt-0.5 space-y-0.5 pb-1 pl-3"
                      style={{ borderLeft: `2px solid ${sd.childBorder}` }}>
                      {item.children.map(child => (
                        <Link key={child.path} to={child.path}
                          onClick={() => window.innerWidth < 1024 && onClose()}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all duration-150"
                          style={location.pathname === child.path ? {
                            background: sd.childActiveBg,
                            color: sd.activeText,
                            fontWeight: 700,
                          } : { color: sd.childText }}
                          onMouseEnter={e => { if (location.pathname !== child.path) { e.currentTarget.style.background = sd.hover; e.currentTarget.style.color = sd.activeText }}}
                          onMouseLeave={e => { if (location.pathname !== child.path) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = sd.childText }}}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: location.pathname === child.path ? sd.activeText : sd.muted }} />
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* ── User footer ── */}
        <div className="p-3" style={{ borderTop: `1px solid ${sd.border}` }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all duration-200"
            style={{ cursor: 'default' }}>
            {/* Avatar — clickable to profile */}
            <button
              onClick={() => { navigate('/profile'); window.innerWidth < 1024 && onClose() }}
              title="Lihat Profil"
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 text-white transition-all duration-200"
              style={{ background: 'linear-gradient(135deg, #4059ad, #5b9bd5)', boxShadow: '0 2px 8px rgba(79,111,199,0.3)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 12px rgba(79,111,199,0.5)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,111,199,0.3)'}
            >
              {user?.nama_lengkap?.[0]?.toUpperCase() || 'A'}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: sd.text }}>{user?.nama_lengkap || 'Admin'}</p>
              <p className="text-[10px] capitalize font-semibold" style={{ color: '#6784d8' }}>{user?.role || 'admin'}</p>
            </div>
            <button onClick={() => setShowLogoutConfirm(true)} title="Logout"
              className="p-1.5 rounded-lg transition-all duration-200"
              style={{ color: sd.muted }}
              onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = isDark ? '#2D0E0E' : '#fef2f2' }}
              onMouseLeave={e => { e.currentTarget.style.color = sd.muted; e.currentTarget.style.background = 'transparent' }}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <LogoutConfirmDialog
        open={showLogoutConfirm}
        userName={user?.nama_lengkap || user?.email || 'Admin'}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={async () => { await logout(); setShowLogoutConfirm(false) }}
      />
    </>
  )
}

// ─────────────────────────────────────────────
// REAL-TIME STATUS BAR (connection indicator)
// ─────────────────────────────────────────────
function RealtimeBadge({ lastUpdated }) {
  const [online, setOnline] = useState(navigator.onLine)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Flash badge when lastUpdated changes
  useEffect(() => {
    if (!lastUpdated) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 2000)
    return () => clearTimeout(t)
  }, [lastUpdated])

  return (
    <div className="flex items-center gap-1.5">
      {!online && (
        <div className="flex items-center gap-1 px-2 py-1 bg-red-50 border border-red-200 rounded-full text-red-600 text-xs font-medium animate-slideDown">
          <WifiOff size={11} /> Offline
        </div>
      )}
      {show && online && (
        <div className="flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded-full text-green-600 text-xs font-medium animate-popIn">
          <Wifi size={11} /> Diperbarui
        </div>
      )}
      {online && !show && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span className="pulse-dot" />
          <span className="hidden sm:inline">Live</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────
export const Navbar = ({ onMenuToggle, sidebarOpen }) => {
  const { activeProject, projects, setActiveProject } = useProject()
  const { user } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifItems, setNotifItems] = useState([])
  const notifRef = useRef(null)

  const nb = {
    bg:     isDark ? 'rgba(24,32,51,0.97)' : 'rgba(255,255,255,0.96)',
    border: isDark ? 'rgba(42,54,80,0.9)' : 'rgba(224,231,255,0.8)',
    text:   isDark ? '#DDE6F5' : '#64748b',
    dropBg: isDark ? '#182033' : 'white',
    dropBorder: isDark ? '#2A3650' : '#e5e7eb',
    dropText:   isDark ? '#DDE6F5' : '#374151',
    dropSub:    isDark ? '#8A9AB8' : '#6b7280',
    dropActive: isDark ? 'rgba(79,111,199,0.18)' : '#eff6ff',
    dropActiveText: isDark ? '#93C5FD' : '#4059ad',
  }

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadNotifikasi = useCallback(() => {
    reportService.getNotifikasi().then(setNotifItems).catch(() => {})
  }, [])
  useEffect(() => { loadNotifikasi() }, [loadNotifikasi])
  usePolling(loadNotifikasi, 60000)

  // Listen for custom "dataRefreshed" events from pages
  useEffect(() => {
    const handler = () => setLastUpdated(Date.now())
    window.addEventListener('dataRefreshed', handler)
    return () => window.removeEventListener('dataRefreshed', handler)
  }, [])

  return (
    <header className="h-14 flex items-center px-4 gap-3 sticky top-0 z-10"
      style={{
        background: nb.bg,
        backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${nb.border}`,
        boxShadow: isDark ? '0 1px 8px rgba(0,0,0,0.3)' : '0 1px 8px rgba(79,111,199,0.06)',
      }}>
      {/* Hamburger */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-xl transition-all duration-200"
        title="Toggle menu"
        style={{ color: nb.text }}
        onMouseEnter={e => { e.currentTarget.style.background='rgba(79,111,199,0.1)'; e.currentTarget.style.color='#6784d8' }}
        onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=nb.text }}
      >
        <Menu size={18} />
      </button>

      <div className="flex-1" />

      {/* Real-time indicator */}
      <RealtimeBadge lastUpdated={lastUpdated} />

      {/* Notifikasi */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setNotifOpen(v => !v)}
          title="Notifikasi"
          className="relative p-2 rounded-xl transition-all duration-200"
          style={{ color: nb.text }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(79,111,199,0.1)'; e.currentTarget.style.color='#6784d8' }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=nb.text }}
        >
          <Bell size={18} />
          {notifItems.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
          )}
        </button>

        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 320, background: nb.dropBg, borderRadius: '16px',
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)',
          border: `1px solid ${nb.dropBorder}`, zIndex: 50,
          transition: 'opacity 0.2s, transform 0.2s', transformOrigin: 'top right',
          opacity: notifOpen ? 1 : 0,
          transform: notifOpen ? 'scale(1)' : 'scale(0.95)',
          pointerEvents: notifOpen ? 'auto' : 'none',
        }}>
          <div style={{ padding: '8px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: nb.dropSub, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 10px' }}>
              Notifikasi
            </p>
            {notifItems.length === 0 ? (
              <p style={{ fontSize: '12px', color: nb.dropSub, padding: '14px 10px', textAlign: 'center' }}>
                Tidak ada info baru
              </p>
            ) : notifItems.map(n => (
              <button
                key={n.id}
                onClick={() => { navigate(n.path); setNotifOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '10px',
                  border: 'none', cursor: 'pointer', background: 'transparent',
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                  background: n.severity === 'warning' ? '#f59e0b' : '#6784d8',
                }} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: '13px', color: nb.dropText, marginBottom: '2px' }}>{n.title}</p>
                  <p style={{ fontSize: '12px', color: nb.dropSub }}>{n.message}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Project selector */}
      <div className="relative" ref={dropRef}>
        <button
          onClick={() => setDropOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px', borderRadius: '12px', cursor: 'pointer',
            border: `1px solid ${dropOpen ? '#60a5fa' : (isDark ? '#2A3650' : '#e2e8f0')}`,
            background: dropOpen ? (isDark ? 'rgba(79,111,199,0.15)' : '#eff6ff') : (isDark ? '#182033' : 'transparent'),
            color: dropOpen ? '#6784d8' : nb.text,
            fontSize: '13px', fontWeight: 500, transition: 'all 0.15s',
          }}
        >
          <Briefcase size={13} color="#6784d8" style={{ flexShrink: 0 }} />
          <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeProject?.nama_project || 'Pilih Project'}
          </span>
          <ChevronDown size={13} style={{ transition: 'transform 0.25s', transform: dropOpen ? 'rotate(180deg)' : 'none' }} />
        </button>

        {/* Dropdown */}
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 280, background: nb.dropBg, borderRadius: '16px',
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)',
          border: `1px solid ${nb.dropBorder}`, zIndex: 50,
          transition: 'opacity 0.2s, transform 0.2s', transformOrigin: 'top right',
          opacity: dropOpen ? 1 : 0,
          transform: dropOpen ? 'scale(1)' : 'scale(0.95)',
          pointerEvents: dropOpen ? 'auto' : 'none',
        }}>
          <div style={{ padding: '8px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: nb.dropSub, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '6px 10px' }}>
              Project Aktif
            </p>
            {projects.length === 0 && (
              <p style={{ fontSize: '12px', color: nb.dropSub, padding: '10px', textAlign: 'center' }}>
                Belum ada project aktif
              </p>
            )}
            {projects.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { setActiveProject(p); setDropOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '10px',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: activeProject?.id === p.id ? nb.dropActive : 'transparent',
                  color: activeProject?.id === p.id ? nb.dropActiveText : nb.dropText,
                  fontSize: '13px', fontWeight: activeProject?.id === p.id ? 600 : 500,
                  animationDelay: `${i * 40}ms`,
                }}
                onMouseEnter={e => { if (activeProject?.id !== p.id) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb' }}
                onMouseLeave={e => { if (activeProject?.id !== p.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activeProject?.id === p.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6784d8', flexShrink: 0 }} />}
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: '2px' }}>{p.nama_project}</p>
                    <p style={{ fontSize: '11px', color: nb.dropSub }}>{p.kode_project} · <span style={{ textTransform: 'capitalize' }}>{p.status_project}</span></p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Profile avatar button */}
      <button
        onClick={() => navigate('/profile')}
        title="Profil Saya"
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #4059ad, #5b9bd5)',
          boxShadow: '0 2px 8px rgba(79,111,199,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '13px', fontWeight: 900, flexShrink: 0,
          transition: 'box-shadow 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,111,199,0.5)'; e.currentTarget.style.transform = 'scale(1.06)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,111,199,0.3)'; e.currentTarget.style.transform = 'scale(1)' }}
      >
        {user?.nama_lengkap?.[0]?.toUpperCase() || <User size={16} />}
      </button>
    </header>
  )
}

// ─────────────────────────────────────────────
// LOADING SPINNER
// ─────────────────────────────────────────────
export const LoadingSpinner = ({ text = 'Memuat...' }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="relative w-11 h-11">
      <div className="absolute inset-0 border-[3px] border-blue-100 rounded-full" />
      <div className="absolute inset-0 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
    <p className="text-sm text-gray-400 font-medium">{text}</p>
  </div>
)

// ─────────────────────────────────────────────
// SKELETON LOADER
// ─────────────────────────────────────────────
export const SkeletonRow = ({ cols = 5 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="skeleton h-4 rounded" style={{ width: `${60 + (i % 3) * 20}%`, animationDelay: `${i * 60}ms` }} />
      </td>
    ))}
  </tr>
)

// ─────────────────────────────────────────────
// INLINE ALERT (animated, dismissable)
// ─────────────────────────────────────────────
export const AlertInPage = ({ type = 'info', title, message, onClose, className = '', action }) => {
  const [visible, setVisible] = useState(true)
  const cfg = {
    success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', icon: <CheckCircle size={16} className="text-green-600 flex-shrink-0 mt-0.5" /> },
    error:   { bg: 'bg-red-50 border-red-200',     text: 'text-red-800',   icon: <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" /> },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" /> },
    info:    { bg: 'bg-blue-50 border-blue-200',   text: 'text-blue-800',  icon: <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" /> },
    pending: { bg: 'bg-orange-50 border-orange-300', text: 'text-orange-800', icon: <Clock size={16} className="text-orange-500 flex-shrink-0 mt-0.5 animate-spin" style={{animationDuration:'3s'}} /> },
  }
  const c = cfg[type] || cfg.info
  if (!visible) return null
  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border ${c.bg} ${c.text} animate-slideDown ${className}`}>
      {c.icon}
      <div className="flex-1 min-w-0">
        {title && <p className="font-bold text-sm mb-0.5">{title}</p>}
        {message && <p className="text-sm opacity-85 leading-relaxed">{message}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onClose && (
        <button
          onClick={() => { setVisible(false); onClose?.() }}
          className="p-1 rounded-lg hover:bg-black/10 transition-colors flex-shrink-0"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// CONFIRM DIALOG
// ─────────────────────────────────────────────
export const ConfirmDialog = ({ open, title, message, onConfirm, onCancel, variant = 'danger', loading = false }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={loading ? undefined : onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-modalIn">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${variant === 'danger' ? 'bg-red-100' : 'bg-blue-100'}`}>
          {variant === 'danger'
            ? <AlertTriangle size={22} className="text-red-600 animate-popIn" />
            : <CheckCircle size={22} className="text-blue-600 animate-popIn" />
          }
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1.5">{title}</h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 text-sm rounded-xl border border-gray-200 hover:bg-gray-50 font-medium text-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 text-sm rounded-xl text-white font-semibold transition-all active:scale-95 shadow-md disabled:opacity-60 disabled:cursor-not-allowed
              ${variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
              }`}
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin mx-auto" /> : 'Konfirmasi'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────
export const Modal = ({ open, onClose, title, children, size = 'md' }) => {
  if (!open) return null
  const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div className={`
        relative bg-white w-full ${sizes[size]} flex flex-col
        rounded-t-3xl sm:rounded-2xl shadow-2xl animate-modalIn
        max-h-[92vh]
      `}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={17} />
          </button>
        </div>
        {/* pb-40 ensures native <select> dropdowns always have space to open DOWNWARD */}
        <div className="overflow-y-auto flex-1 p-6 pb-40">{children}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────
export const Badge = ({ status, label, className = '' }) => {
  const classMap = {
    aktif: 'badge-hadir', nonaktif: 'badge-libur',
    hadir: 'badge-hadir', sakit: 'badge-sakit', izin: 'badge-izin',
    cuti: 'badge-cuti', libur: 'badge-libur', alfa: 'badge-alfa',
    pending: 'badge-pending', disetujui: 'badge-hadir', ditolak: 'badge-alfa',
    draft: 'badge-libur', final: 'badge-izin', dibayar: 'badge-hadir',
  }
  const labelMap = {
    aktif: 'Aktif', nonaktif: 'Non-aktif', hadir: 'Hadir', sakit: 'Sakit',
    izin: 'Izin', cuti: 'Cuti', libur: 'Libur', alfa: 'Alfa',
    pending: 'Pending', disetujui: 'Disetujui', ditolak: 'Ditolak',
    draft: 'Draft', final: 'Final', dibayar: 'Dibayar'
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${classMap[status] || 'badge-libur'} ${className}`}>
      {label || labelMap[status] || status}
    </span>
  )
}

// ─────────────────────────────────────────────
// BUTTON
// ─────────────────────────────────────────────
export const Button = ({ children, variant = 'primary', size = 'md', loading, icon: Icon, className = '', ...props }) => {
  const v = {
    primary: 'bg-blue-700 hover:bg-blue-800 text-white shadow-sm shadow-blue-200 active:bg-blue-900',
    secondary: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 active:bg-blue-200',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-200',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-200',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    outline: 'border border-blue-200 hover:bg-blue-50 text-blue-700 hover:border-blue-300',
    ghost: 'hover:bg-blue-50 text-blue-600',
  }
  const s = { sm: 'px-3 py-1.5 text-xs gap-1.5', md: 'px-4 py-2 text-sm gap-2', lg: 'px-5 py-2.5 text-sm gap-2' }
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`
        inline-flex items-center justify-center rounded-xl font-semibold
        transition-all duration-150 active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${v[variant]} ${s[size]} ${className}
      `}
    >
      {loading
        ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : Icon && <Icon size={size === 'sm' ? 13 : 15} />
      }
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────
export const Card = ({ children, className = '', title, subtitle, action }) => (
  <div className={`bg-white rounded-2xl border border-blue-50 shadow-sm ${className}`}
    style={{ boxShadow: '0 1px 6px rgba(79,111,199,0.07)' }}>
    {(title || action) && (
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          {title && <h3 className="font-bold text-gray-900 text-sm">{title}</h3>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className="p-5">{children}</div>
  </div>
)

// ─────────────────────────────────────────────
// STAT CARD with animation
// ─────────────────────────────────────────────
export const StatCard = ({ label, value, sub, icon: Icon, color = 'blue', trend, pulse }) => {
  const colors = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-100',   shadow: 'rgba(79,111,199,0.12)' },
    green:  { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-100',shadow: 'rgba(5,150,105,0.12)' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-100',  shadow: 'rgba(217,119,6,0.12)' },
    red:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-100',    shadow: 'rgba(220,38,38,0.12)' },
    purple: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-100', shadow: 'rgba(109,40,217,0.12)' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`bg-white rounded-2xl border ${c.border} p-5 transition-all duration-200 hover:-translate-y-0.5`}
      style={{ boxShadow: `0 1px 4px ${c.shadow}, 0 4px 16px ${c.shadow}` }}
      onMouseEnter={e => e.currentTarget.style.boxShadow=`0 6px 24px ${c.shadow}`}
      onMouseLeave={e => e.currentTarget.style.boxShadow=`0 1px 4px ${c.shadow}, 0 4px 16px ${c.shadow}`}
    >
      <div className="flex items-start justify-between">
        <div className="animate-countUp">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
          <p className="text-2xl font-extrabold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-3 rounded-2xl ${c.bg} relative`}>
            <Icon size={20} className={c.text} />
            {pulse && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400 animate-ping" />}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FORM FIELD
// ─────────────────────────────────────────────
export const FormField = ({ label, required, error, children, help }) => (
  <div className="space-y-1.5">
    {label && (
      <label className="block text-sm font-semibold text-gray-700">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
    )}
    {children}
    {help && <p className="text-xs text-gray-400">{help}</p>}
    {error && (
      <p className="text-xs text-red-500 flex items-center gap-1 animate-slideDown">
        <AlertTriangle size={11} />{error}
      </p>
    )}
  </div>
)

// ─────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────
export const Input = ({ className = '', ...props }) => (
  <input
    {...props}
    className={`
      w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl
      focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
      disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
      placeholder:text-blue-100
      transition-all duration-150 bg-white
      min-h-[42px] leading-tight
      ${className}
    `}
  />
)

// Input nominal Rupiah: tampil "85.000", nilai yang dikirim ke onChange angka murni "85000".
// Titik dianggap pemisah ribuan (format Indonesia), jadi "85.000" tidak terbaca sebagai 85.
export const RupiahInput = ({ value, onChange, ...props }) => {
  const digits = value === null || value === undefined || value === ''
    ? '' : String(Math.round(Number(value) || 0))
  const display = digits === '' ? '' : Number(digits).toLocaleString('id-ID')
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={e => {
        const raw = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
        onChange?.({ target: { value: raw } })
      }}
    />
  )
}

// ─────────────────────────────────────────────
// SELECT (dropdown always down)
// ─────────────────────────────────────────────
export const Select = ({ children, className = '', ...props }) => (
  <div className="relative w-full">
    <select
      {...props}
      className={`
        w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl
        focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
        disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed bg-white pr-9
        placeholder:text-blue-100
        transition-all duration-150
        min-h-[42px] leading-tight
        ${className}
      `}
    >
      {children}
    </select>
    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
  </div>
)

// ─────────────────────────────────────────────
// DROPDOWN SELECT — portal, selalu terbuka ke bawah (atau ke atas jika mepet)
// ─────────────────────────────────────────────
export function DropdownSelect({ value, onChange, options = [], disabled, placeholder = 'Pilih...', className = '', searchable = false }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const portalRef = useRef(null)
  const inputRef = useRef(null)

  const calcPos = useCallback(() => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const listH = Math.min(options.length * 42 + 10, 256)
    const spaceBelow = window.innerHeight - r.bottom - 8
    const top = spaceBelow >= listH || spaceBelow >= r.top
      ? r.bottom + 2
      : Math.max(8, r.top - listH - 2)
    setPos({ top, left: r.left, width: r.width })
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    calcPos()
    window.addEventListener('scroll', calcPos, true)
    window.addEventListener('resize', calcPos)
    return () => {
      window.removeEventListener('scroll', calcPos, true)
      window.removeEventListener('resize', calcPos)
    }
  }, [open, calcPos])

  useEffect(() => {
    if (!open) return
    const close = e => {
      if (!ref.current?.contains(e.target) && !portalRef.current?.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (open && searchable) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open, searchable])

  const selected = options.find(o => String(o.value) === String(value))
  const filteredOptions = searchable && query
    ? options.filter(o => o.value === '' || o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const handleSelect = (optValue) => {
    onChange(optValue)
    setOpen(false)
    setQuery('')
  }

  if (searchable) {
    return (
      <div ref={ref} className={`relative w-full ${className}`}>
        <div className={[
          'w-full flex items-center gap-2 px-3.5 py-2.5 text-sm border rounded-xl bg-white transition-all min-h-[42px]',
          open ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-gray-300',
          disabled ? 'bg-gray-50 cursor-not-allowed' : '',
        ].join(' ')}>
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            className="flex-1 outline-none bg-transparent text-sm text-gray-800 placeholder-gray-400 min-w-0"
            placeholder={selected && selected.value !== '' ? selected.label : placeholder}
            value={open ? query : (selected && selected.value !== '' ? selected.label : '')}
            onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
            onFocus={() => { if (!disabled) { setOpen(true); setQuery('') } }}
          />
          {value && value !== '' && (
            <button type="button" onClick={() => { handleSelect(''); setQuery('') }}
              className="text-gray-300 hover:text-gray-500 flex-shrink-0">
              <X size={14} />
            </button>
          )}
          <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            onClick={() => !disabled && setOpen(o => !o)} style={{ cursor: 'pointer' }} />
        </div>

        {open && pos && createPortal(
          <div ref={portalRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
            className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredOptions.length === 0
                ? <div className="px-3.5 py-2.5 text-sm text-gray-400">Tidak ditemukan</div>
                : filteredOptions.map((opt, i) => (
                  <button key={`${opt.value}-${i}`} type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={[
                      'w-full text-left px-3.5 py-2.5 text-sm transition-colors',
                      String(opt.value) === String(value)
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50',
                      opt.value === '' ? 'text-gray-400' : '',
                    ].join(' ')}>
                    {opt.label}
                  </button>
                ))
              }
            </div>
          </div>,
          document.body
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className={`relative w-full ${className}`}>
      <button type="button" onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        className={[
          'w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm border rounded-xl',
          'bg-white text-left transition-all min-h-[42px]',
          open ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-gray-300',
          disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'text-gray-800 cursor-pointer',
        ].join(' ')}>
        <span className={!selected || selected.value === '' ? 'text-gray-400 font-normal' : 'font-medium'}>
          {selected && selected.value !== '' ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div ref={portalRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map((opt, i) => (
              <button key={`${opt.value}-${i}`} type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={[
                  'w-full text-left px-3.5 py-2.5 text-sm transition-colors',
                  String(opt.value) === String(value)
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50',
                  opt.value === '' ? 'text-gray-400' : '',
                ].join(' ')}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// TEXTAREA
// ─────────────────────────────────────────────
export const Textarea = ({ className = '', ...props }) => (
  <textarea
    {...props}
    rows={props.rows || 3}
    className={`w-full px-3.5 py-2.5 text-sm border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none placeholder:text-blue-100 transition-all bg-white leading-relaxed ${className}`}
  />
)

// ─────────────────────────────────────────────
// TABLE with skeleton loading
// ─────────────────────────────────────────────
export const Table = ({ columns, data, loading, emptyMessage = 'Tidak ada data', rowClassName }) => {
  if (loading) return (
    <div className="overflow-x-auto rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {[1, 2, 3, 4].map(r => (
            <tr key={r}>
              {columns.map((_, i) => (
                <td key={i} className="px-4 py-3.5">
                  <div className="skeleton h-3.5 rounded-full" style={{ width: `${50 + (i * 13) % 40}%`, animationDelay: `${i * 80}ms` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="overflow-x-auto rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wide ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-16 text-center">
                <div className="flex flex-col items-center gap-2 text-gray-300">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Info size={22} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-400">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          ) : data.map((row, i) => (
            <tr
              key={i}
              className={`hover:bg-blue-50/40 transition-colors duration-100 ${rowClassName ? rowClassName(row) : ''}`}
              style={{ animation: `slideUp 0.2s ease-out ${Math.min(i * 30, 200)}ms both` }}
            >
              {columns.map((col, j) => (
                <td key={j} className={`px-4 py-3.5 text-gray-700 ${col.className || ''}`}>
                  {col.render ? col.render(row, i) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────
// PAGE HEADER
// ─────────────────────────────────────────────
export const PageHeader = ({ title, subtitle, action }) => (
  <div className="flex items-start justify-between mb-6 gap-4 animate-slideDown">
    <div>
      <h1 className="text-xl font-extrabold" style={{color:'#2e3d6e'}}>{title}</h1>
      {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="flex gap-2 flex-wrap justify-end shrink-0">{action}</div>}
  </div>
)

// ─────────────────────────────────────────────
// SEARCH BAR
// ─────────────────────────────────────────────
export const SearchBar = ({ value, onChange, placeholder = 'Cari...' }) => (
  <div className="relative">
    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" strokeWidth="2" /><path d="m21 21-4.35-4.35" strokeWidth="2" />
    </svg>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-4 py-2.5 text-sm border border-blue-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-blue-100"
    />
  </div>
)

// ─────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────
export const EmptyState = ({ message = 'Tidak ada data', icon: Icon }) => (
  <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
    {Icon && <Icon size={38} className="opacity-40" />}
    <p className="text-sm font-medium text-gray-400">{message}</p>
  </div>
)