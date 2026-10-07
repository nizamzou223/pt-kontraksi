import { useState } from 'react'
import { Sun, Moon, Languages } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useLang } from '../../context/LanguageContext'
import { authText } from '../../i18n/authStrings'
import logoKrakatau from '../../assets/logo-krakatau.png'

// ── Palet halaman autentikasi (terang / gelap) ──────────────────────────────
export function authPalette(dark) {
  return dark
    ? {
        pageBg: 'linear-gradient(145deg, #0a101d 0%, #0e1526 35%, #111a2f 70%, #0c1322 100%)',
        shellBg: '#141c2f',
        shellShadow: '0 40px 100px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
        title: '#e6ecfa', sub: '#93a0bd', label: '#8a9ab8', muted: '#6b7898', icon: '#5b6a8d', iconHover: '#8ea6e6',
        inputBg: '#0d1421', inputBgFocus: '#101a2c', inputBorder: '#2a3650', inputText: '#e6ecfa',
        focusRing: '0 0 0 4px rgba(124,154,234,0.16), 0 4px 14px rgba(0,0,0,0.25)', accent: '#7c9aea',
        chipBg: '#1b2742', chipText: '#8ea6e6', divider: '#232f49', footer: '#5f6e91',
        errBg: '#2a1a22', errBorder: '#5a2a34', errText: '#f0a0a0', warn: '#e0b25a',
        okBg: '#12281f', okBorder: '#1f5a43', okText: '#6fd6a6',
        ctrlBg: 'rgba(20,28,47,0.85)', ctrlBorder: '#2a3650', ctrlText: '#c5d0ea', ctrlActive: '#4f6fc7',
        glow: 'linear-gradient(90deg, #4f6fc7, #3a4f8f)', bgFx: 0.55,
      }
    : {
        pageBg: 'linear-gradient(145deg, #eef3fe 0%, #f3f5ff 30%, #f2f8ff 65%, #e3ecfb 100%)',
        shellBg: '#ffffff',
        shellShadow: '0 40px 100px rgba(79,111,199,0.16), 0 10px 30px rgba(48,63,120,0.08)',
        title: '#2b3450', sub: '#6b7691', label: '#6b7691', muted: '#9aa4bd', icon: '#b3bdd6', iconHover: '#4f6fc7',
        inputBg: '#f6f8fd', inputBgFocus: '#ffffff', inputBorder: '#e6eaf2', inputText: '#2b3450',
        focusRing: '0 0 0 4px rgba(79,111,199,0.10), 0 4px 14px rgba(79,111,199,0.08)', accent: '#4f6fc7',
        chipBg: '#eef2fb', chipText: '#4f6fc7', divider: '#eef1f8', footer: '#b3bdd6',
        errBg: '#fdf3f3', errBorder: '#f3cccc', errText: '#c25050', warn: '#c58a1c',
        okBg: '#effaf5', okBorder: '#c4ebd9', okText: '#2f9474',
        ctrlBg: 'rgba(255,255,255,0.85)', ctrlBorder: '#e6eaf2', ctrlText: '#4b5675', ctrlActive: '#4f6fc7',
        glow: 'linear-gradient(90deg, #4f6fc7, #6aaee0)', bgFx: 1,
      }
}

// ── Kontrol pojok kanan atas: bahasa (ID/EN) + mode gelap — sama seperti di aplikasi mobile ──
export function AuthControls() {
  const { isDark, toggle: toggleTheme } = useTheme()
  const { lang, toggle: toggleLang } = useLang()
  const p = authPalette(isDark)
  const t = authText(lang)
  const seg = (code) => {
    const active = lang === code
    return (
      <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide transition-colors"
        style={{ background: active ? p.ctrlActive : 'transparent', color: active ? '#fff' : p.ctrlText }}>
        {code.toUpperCase()}
      </span>
    )
  }
  const base = {
    background: p.ctrlBg, border: `1px solid ${p.ctrlBorder}`, backdropFilter: 'blur(10px)',
    boxShadow: '0 4px 16px rgba(20,30,70,0.08)', color: p.ctrlText,
  }
  return (
    <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
      <button type="button" onClick={toggleLang}
        aria-label={`${t.langLabel}: ${lang === 'id' ? 'Bahasa Indonesia' : 'English'}`} title={t.langLabel}
        className="flex items-center gap-1.5 pl-2.5 pr-1 h-10 rounded-full transition-shadow hover:shadow-md"
        style={base}>
        <Languages size={15} />
        <span className="flex items-center">{seg('id')}{seg('en')}</span>
      </button>
      <button type="button" onClick={toggleTheme}
        aria-label={isDark ? t.toLight : t.toDark} title={isDark ? t.toLight : t.toDark}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:shadow-md active:scale-95"
        style={base}>
        {isDark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </div>
  )
}

// ── Kolom input dengan ikon, label, dan status fokus ────────────────────────
export function Field({ id, label, icon: Icon, right, error, p, ...inputProps }) {
  const [focus, setFocus] = useState(false)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: p.label }}>
        {label}
      </label>
      <div className="relative">
        <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors"
          style={{ color: focus ? p.accent : p.icon }} />
        <input id={id} {...inputProps}
          onFocus={(e) => { setFocus(true); inputProps.onFocus?.(e) }}
          onBlur={(e) => { setFocus(false); inputProps.onBlur?.(e) }}
          aria-invalid={error ? 'true' : undefined}
          className={`w-full pl-11 pr-11 text-[14px] rounded-2xl outline-none transition-all duration-200${error ? ' lp-field-error' : ''}`}
          style={{
            minHeight: 50,
            background: focus ? p.inputBgFocus : p.inputBg,
            border: `1.5px solid ${error ? '#e8a3a3' : focus ? p.accent : p.inputBorder}`,
            color: p.inputText,
            boxShadow: focus ? p.focusRing : 'none',
          }} />
        {right}
      </div>
    </div>
  )
}

// ── Logo PT Krakatau Indah (dipakai di panel merek & header mobile) ──
export function BrandMark({ size = 44 }) {
  return (
    <img src={logoKrakatau} alt="PT Krakatau Indah" width={size} height={size}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: '50%' }} />
  )
}


// Keyframes & gaya bersama halaman autentikasi
export const AUTH_CSS = `
  @keyframes lpEnter     { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lpFadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lpSlideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  .lp-sheen { position:absolute; inset:0; pointer-events:none; transform:translateX(-120%);
              background:linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%); }
  .lp-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 32px rgba(79,111,199,0.42), inset 0 1px 0 rgba(255,255,255,0.2) !important; }
  .lp-btn:hover:not(:disabled) .lp-sheen { transform:translateX(120%); transition: transform .8s ease; }
  .lp-arrow { transition: transform .2s ease; }
  .lp-btn:hover:not(:disabled) .lp-arrow { transform: translateX(3px); }
  .lp-btn:focus-visible, .lp-link:focus-visible { outline: 3px solid rgba(79,111,199,0.4); outline-offset: 2px; }
  .lp-link { transition: color .15s ease, opacity .15s ease; }
  .lp-link:hover:not(:disabled) { opacity: .8; text-decoration: underline; }
  .login-shake { animation: loginShake 0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
  @keyframes loginShake  { 10%,90%{transform:translateX(-2px)} 20%,80%{transform:translateX(4px)} 30%,50%,70%{transform:translateX(-9px)} 40%,60%{transform:translateX(9px)} 100%{transform:translateX(0)} }
  @keyframes lpErrorPop  { 0%{opacity:0;transform:translateY(-10px) scale(0.94)} 100%{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes lpRedGlow   { 0%{box-shadow:0 0 0 0 rgba(224,106,106,0.5)} 100%{box-shadow:0 0 0 16px rgba(224,106,106,0)} }
  @keyframes lpWiggle    { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-16deg)} 75%{transform:rotate(16deg)} }
  .lp-alert-icon  { animation: lpWiggle .55s ease .2s 2; transform-origin: 50% 60%; }
  .lp-field-error { animation: lpRedGlow 1.1s ease-out 1; }

  /* ── Animasi tambahan ── */
  @keyframes lpLogoIn   { 0%{opacity:0;transform:scale(0.4) rotate(-18deg)} 65%{transform:scale(1.08) rotate(4deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
  @keyframes lpFloat    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  @keyframes lpSpin     { to{transform:rotate(360deg)} }
  @keyframes lpPing     { 0%{transform:scale(0.9);opacity:0.55} 100%{transform:scale(1.9);opacity:0} }
  @keyframes lpAurora   { 0%,100%{background-position:0% 30%} 50%{background-position:100% 70%} }
  @keyframes lpOrbA     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(38px,-26px) scale(1.12)} }
  @keyframes lpOrbB     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-34px,30px) scale(0.92)} }
  @keyframes lpRise     { 0%{transform:translateY(0) scale(0.6);opacity:0} 15%{opacity:0.9} 100%{transform:translateY(-420px) scale(1.1);opacity:0} }
  @keyframes lpTwinkle  { 0%,100%{fill-opacity:0.10} 50%{fill-opacity:0.85} }
  @keyframes lpShine    { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes lpSheenIdle{ 0%,60%{transform:translateX(-120%)} 100%{transform:translateX(120%)} }
  .lp-logo-anim { animation: lpLogoIn .85s .1s cubic-bezier(0.34,1.56,0.64,1) both, lpFloat 5s 1.2s ease-in-out infinite; }
  .lp-ring      { position:absolute; inset:-7px; border-radius:20px; border:1.5px dashed rgba(255,255,255,0.42); animation: lpSpin 14s linear infinite; pointer-events:none; }
  .lp-ping      { position:absolute; inset:0; border-radius:16px; border:2px solid rgba(255,255,255,0.45); animation: lpPing 2.6s ease-out infinite; pointer-events:none; }
  .lp-orb       { position:absolute; border-radius:50%; filter:blur(38px); pointer-events:none; }
  .lp-dot       { position:absolute; bottom:12%; width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,0.85); pointer-events:none; animation: lpRise 7s ease-in infinite; }
  .lp-twinkle   { animation: lpTwinkle 3.4s ease-in-out infinite; fill:#fde68a; }
  .lp-shine     { background:linear-gradient(100deg,#ffffff 30%,#bfd6ff 45%,#ffffff 60%); background-size:200% 100%;
                  -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
                  animation: lpShine 5s linear infinite; }
  .lp-btn:not(:disabled) .lp-sheen { animation: lpSheenIdle 5s ease-in-out 1.5s infinite; }
  .lp-feat      { transition: transform .25s ease, background .25s ease; }
  .lp-feat:hover{ transform: translateY(-4px); background: rgba(255,255,255,0.17) !important; }
`
