import { createPortal } from 'react-dom'

// Durasi animasi "Berhasil Keluar" sebelum sesi benar-benar diakhiri
export const LOGOUT_ANIM_MS = 1900

// Overlay layar penuh setelah konfirmasi logout: centang hijau tergambar,
// salam perpisahan, dan bilah progres menuju halaman login.
// `closing` = fase memudar setelah sesi berakhir (halaman login sudah di belakang).
export default function LogoutSuccessOverlay({ userName, closing = false }) {
  const nama = (userName || '').split(/[\s@]/)[0] || 'Admin'

  return createPortal(
    <div
      className="lo-overlay"
      role="status"
      aria-live="assertive"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'radial-gradient(ellipse at center, rgba(30,41,82,0.78) 0%, rgba(15,23,42,0.88) 100%)',
        backdropFilter: 'blur(10px)',
        animation: closing ? 'loFadeOut .35s ease-in forwards' : 'loFadeIn .25s ease-out both',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 340, textAlign: 'center',
        background: 'white', borderRadius: 24, padding: '34px 26px 26px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)', position: 'relative', overflow: 'hidden',
        animation: 'loCardIn .5s cubic-bezier(0.34,1.56,0.64,1) both',
      }}>
        {/* Kilau melintas */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 35%, rgba(64,89,173,0.07) 50%, transparent 65%)',
          animation: 'loShimmer 1.6s .4s ease-in-out both',
        }} />

        {/* Ikon centang + riak */}
        <div style={{ position: 'relative', width: 84, height: 84, margin: '0 auto 18px' }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid rgba(16,185,129,0.45)',
              animation: `loRipple 1.4s ${0.45 + i * 0.35}s ease-out both`,
            }} />
          ))}
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: 'linear-gradient(145deg, #34d399, #059669)',
            boxShadow: '0 10px 30px rgba(5,150,105,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'loPop .55s .1s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white"
              strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="22" strokeDashoffset="22"
                style={{ animation: 'loDraw .45s .45s ease-out forwards' }} />
            </svg>
          </div>
          {/* Ikon pintu keluar kecil */}
          <div style={{
            position: 'absolute', right: -4, bottom: -2, width: 30, height: 30, borderRadius: '50%',
            background: '#1F3864', border: '3px solid white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'loPop .4s .7s cubic-bezier(0.34,1.56,0.64,1) both',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'loSlide 1s 1s ease-in-out infinite' }}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </div>
        </div>

        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#059669', margin: 0, animation: 'loUp .4s .55s ease-out both' }}>
          Logout Berhasil
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '6px 0 4px', animation: 'loUp .4s .65s ease-out both' }}>
          Sampai jumpa, {nama}! <span style={{ display: 'inline-block', transformOrigin: '70% 70%', animation: 'loWave 1s .9s ease-in-out 2' }}>👋</span>
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0, animation: 'loUp .4s .75s ease-out both' }}>
          Sesi Anda telah diakhiri dengan aman.
        </p>

        {/* Progres menuju halaman login */}
        <div style={{ marginTop: 22, animation: 'loUp .4s .85s ease-out both' }}>
          <div style={{ height: 6, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999,
              background: 'linear-gradient(90deg, #4059ad, #10b981)',
              transformOrigin: 'left', animation: `loProgress ${LOGOUT_ANIM_MS - 300}ms .2s linear both`,
            }} />
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Mengarahkan ke halaman login…</p>
        </div>
      </div>

      <style>{`
        @keyframes loFadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes loFadeOut  { from{opacity:1} to{opacity:0} }
        @keyframes loCardIn   { 0%{opacity:0;transform:scale(.8) translateY(24px)} 70%{transform:scale(1.02) translateY(-3px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes loPop      { 0%{opacity:0;transform:scale(.3)} 70%{transform:scale(1.12)} 100%{opacity:1;transform:scale(1)} }
        @keyframes loDraw     { to{stroke-dashoffset:0} }
        @keyframes loRipple   { 0%{transform:scale(.9);opacity:.9} 100%{transform:scale(1.9);opacity:0} }
        @keyframes loUp       { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes loWave     { 0%,100%{transform:rotate(0)} 25%{transform:rotate(18deg)} 75%{transform:rotate(-12deg)} }
        @keyframes loSlide    { 0%,100%{transform:translateX(0)} 50%{transform:translateX(2px)} }
        @keyframes loShimmer  { from{transform:translateX(-100%)} to{transform:translateX(200%)} }
        @keyframes loProgress { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @media (prefers-reduced-motion: reduce) {
          .lo-overlay *, .lo-overlay { animation-duration: .01ms !important; animation-delay: 0s !important; }
        }
      `}</style>
    </div>,
    document.body,
  )
}
