import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useLang } from '../../context/LanguageContext'
import { authService } from '../../services/authService'
import { authText, fmt } from '../../i18n/authStrings'
import { AuthControls, Field, BrandMark, authPalette, AUTH_CSS } from './authShared'
import {
  Lock, Eye, EyeOff, AlertCircle, Loader2, LogIn, Mail, QrCode, Wallet, Package,
  BarChart3, ShieldCheck, ArrowRight, ArrowLeft, KeyRound, MailCheck, Send, RefreshCw, Info,
} from 'lucide-react'

// ── Jam berjalan (tone="light" untuk latar gelap) ──
function LiveClock({ tone = 'dark', lang = 'id' }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const pad = n => String(n).padStart(2, '0')
  const en = lang === 'en'
  const days = en ? ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'] : ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
  const months = en ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] : ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
  const light = tone === 'light'
  const c = light
    ? { main: '#ffffff', colon: 'rgba(255,255,255,0.65)', sec: '#bfd6ff', date: 'rgba(255,255,255,0.75)' }
    : { main: '#2e3d6e', colon: '#4f6fc7', sec: '#8ea6e6', date: '#6b7691' }
  return (
    <div className={light ? 'select-none' : 'text-center mb-6 select-none'}>
      <div className="inline-flex items-end gap-1 font-mono font-black"
        style={{ fontSize: light ? '2rem' : '2.6rem', color: c.main, letterSpacing: '0.04em', lineHeight: 1 }}>
        <span>{pad(time.getHours())}</span>
        <span className="clock-colon" style={{ color: c.colon, fontSize: light ? '1.7rem' : '2.2rem' }}>:</span>
        <span>{pad(time.getMinutes())}</span>
        <span className="clock-colon" style={{ color: c.colon, fontSize: '1.2rem', marginBottom: 2 }}>:</span>
        <span style={{ fontSize: light ? '1.2rem' : '1.6rem', color: c.sec, marginBottom: 2 }}>{pad(time.getSeconds())}</span>
      </div>
      <p className="text-xs font-semibold mt-1.5 tracking-widest" style={{ color: c.date }}>
        {days[time.getDay()]}, {time.getDate()} {months[time.getMonth()]} {time.getFullYear()}
      </p>
    </div>
  )
}

// ── Background konstruksi kaya ──
function BgParticles() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice"
      style={{ pointerEvents: 'none' }}>
      <defs>
        <pattern id="blueprintGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(103,132,216,0.06)" strokeWidth="1"/>
          <path d="M 30 0 L 30 60 M 0 30 L 60 30" fill="none" stroke="rgba(103,132,216,0.03)" strokeWidth="0.5"/>
        </pattern>
        <radialGradient id="orbA" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="orbB" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="orbC" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.28"/>
          <stop offset="100%" stopColor="#bae6fd" stopOpacity="0"/>
        </radialGradient>
        <clipPath id="screen"><rect width="1440" height="900"/></clipPath>
      </defs>
      <g clipPath="url(#screen)">
        {/* Grid */}
        <rect width="1440" height="900" fill="url(#blueprintGrid)"/>

        {/* Orbs latar belakang */}
        <ellipse cx="1200" cy="120" rx="320" ry="280" fill="url(#orbA)" style={{animation:'orbA 11s ease-in-out infinite'}}/>
        <ellipse cx="160" cy="780" rx="280" ry="240" fill="url(#orbC)" style={{animation:'orbB 13s ease-in-out infinite'}}/>
        <ellipse cx="720" cy="450" rx="200" ry="170" fill="url(#orbB)" style={{animation:'orbC 9s ease-in-out infinite'}}/>

        {/* ═══ KIRI ATAS: Tower Crane ═══ */}
        <g style={{animation:'floatV 9s ease-in-out infinite'}} transform="translate(60,30)">
          {/* Tiang vertikal */}
          <rect x="56" y="60" width="10" height="300" fill="rgba(79,111,199,0.16)" rx="2"/>
          {/* Lattice tiang */}
          {[0,40,80,120,160,200,240].map((y,i)=>(
            <g key={i}>
              <line x1="56" y1={60+y} x2="66" y2={60+y+20} stroke="rgba(79,111,199,0.1)" strokeWidth="1.2"/>
              <line x1="66" y1={60+y} x2="56" y2={60+y+20} stroke="rgba(79,111,199,0.1)" strokeWidth="1.2"/>
            </g>
          ))}
          {/* Lengan horizontal (jib) */}
          <rect x="-40" y="54" width="160" height="8" fill="rgba(79,111,199,0.2)" rx="2"/>
          {[-30,-10,10,30,50,70,90].map((x,i)=>(
            <line key={i} x1={x+5} y1="54" x2={x} y2="62" stroke="rgba(79,111,199,0.1)" strokeWidth="1"/>
          ))}
          {/* Counter-jib */}
          <rect x="66" y="54" width="54" height="7" fill="rgba(79,111,199,0.12)" rx="1"/>
          {/* Kabel */}
          <line x1="10" y1="58" x2="61" y2="100" stroke="rgba(79,111,199,0.16)" strokeWidth="1.2"/>
          <line x1="40" y1="58" x2="61" y2="100" stroke="rgba(79,111,199,0.16)" strokeWidth="1.2"/>
          {/* Hook berayun */}
          <g style={{animation:'hookSwing 6s ease-in-out infinite', transformOrigin:'10px 58px'}}>
            <line x1="10" y1="58" x2="10" y2="180" stroke="rgba(79,111,199,0.14)" strokeWidth="1.2" strokeDasharray="3 2"/>
            <rect x="3" y="180" width="14" height="8" fill="none" stroke="rgba(79,111,199,0.22)" strokeWidth="1.5" rx="2"/>
            <path d="M10 188 L7 194 L13 194 Z" fill="none" stroke="rgba(79,111,199,0.18)" strokeWidth="1.2"/>
          </g>
          {/* Kabine */}
          <rect x="50" y="46" width="18" height="13" fill="rgba(79,111,199,0.12)" rx="2"/>
          <rect x="53" y="49" width="6" height="5" fill="rgba(147,197,253,0.18)" rx="1"/>
          {/* Counterweight */}
          <rect x="112" y="56" width="20" height="11" fill="rgba(79,111,199,0.18)" rx="2"/>
          {/* Base */}
          <rect x="48" y="358" width="30" height="6" fill="rgba(79,111,199,0.18)" rx="1"/>
          <rect x="38" y="362" width="50" height="5" fill="rgba(79,111,199,0.12)" rx="1"/>
        </g>

        {/* ═══ KIRI BAWAH: Excavator ═══ */}
        <g style={{animation:'floatV 11s ease-in-out infinite', animationDelay:'1s'}} transform="translate(40,680)">
          {/* Badan */}
          <rect x="8" y="24" width="80" height="32" fill="rgba(79,111,199,0.12)" rx="4"/>
          {/* Kabin */}
          <rect x="44" y="10" width="38" height="26" fill="rgba(79,111,199,0.16)" rx="3"/>
          {/* Kaca */}
          <rect x="48" y="14" width="16" height="10" fill="rgba(147,197,253,0.2)" rx="2"/>
          {/* Arm bergerak */}
          <g style={{animation:'excavArm 5s ease-in-out infinite', transformOrigin:'78px 20px'}}>
            <rect x="78" y="10" width="44" height="7" fill="rgba(79,111,199,0.18)" rx="2" transform="rotate(-18 78 13)"/>
            <rect x="112" y="2" width="32" height="6" fill="rgba(79,111,199,0.15)" rx="2" transform="rotate(12 112 5)"/>
            <path d="M138 10 L148 7 L150 17 L138 18 Z" fill="rgba(79,111,199,0.2)" transform="rotate(8 144 12)"/>
          </g>
          {/* Track */}
          <rect x="4" y="54" width="88" height="10" fill="rgba(79,111,199,0.18)" rx="5"/>
          {[14,28,42,56,70].map((x,i)=>(
            <circle key={i} cx={x} cy="59" r="4" fill="none" stroke="rgba(79,111,199,0.16)" strokeWidth="1.5"/>
          ))}
        </g>

        {/* ═══ KANAN ATAS: Gedung sedang dibangun ═══ */}
        <g style={{animation:'floatV 10s ease-in-out infinite', animationDelay:'0.5s'}} transform="translate(1240,30)">
          {/* Lantai 1 */}
          <rect x="0" y="100" width="120" height="80" fill="rgba(79,111,199,0.09)" rx="2" stroke="rgba(79,111,199,0.12)" strokeWidth="1"/>
          {/* Lantai 2 */}
          <rect x="6" y="58" width="108" height="44" fill="rgba(79,111,199,0.07)" rx="2" stroke="rgba(79,111,199,0.1)" strokeWidth="1"/>
          {/* Lantai 3 — scaffolding dashed */}
          <rect x="12" y="22" width="96" height="38" fill="none" stroke="rgba(79,111,199,0.14)" strokeWidth="1.5" strokeDasharray="6 3" rx="1"/>
          {/* Tiang scaffolding */}
          {[12,36,60,84,108].map((x,i)=>(
            <line key={i} x1={x} y1="14" x2={x} y2="100" stroke="rgba(79,111,199,0.12)" strokeWidth="1.2"/>
          ))}
          {/* Plat scaffolding */}
          {[32,52,72,90].map((y,i)=>(
            <line key={i} x1="8" y1={y} x2="112" y2={y} stroke="rgba(79,111,199,0.1)" strokeWidth="1"/>
          ))}
          {/* Jendela Lt1 */}
          {[10,42,74].map((x,i)=>(
            <rect key={i} x={x} y="115" width="22" height="26" fill="rgba(147,197,253,0.18)" rx="1"/>
          ))}
          {/* Jendela Lt2 */}
          {[18,52,82].map((x,i)=>(
            <rect key={i} x={x} y="68" width="18" height="18" fill="rgba(147,197,253,0.14)" rx="1"/>
          ))}
          {/* Pintu */}
          <rect x="46" y="150" width="28" height="30" fill="rgba(79,111,199,0.16)" rx="1"/>
          {/* Tanah */}
          <rect x="-6" y="178" width="132" height="5" fill="rgba(79,111,199,0.12)" rx="1"/>
        </g>

        {/* ═══ KANAN TENGAH: Sepasang Gear ═══ */}
        <g transform="translate(1300,400)">
          {/* Gear besar */}
          <g style={{animation:'gearCW 20s linear infinite', transformOrigin:'0px 0px'}}>
            <circle cx="0" cy="0" r="42" fill="none" stroke="rgba(103,132,216,0.14)" strokeWidth="5"/>
            <circle cx="0" cy="0" r="20" fill="rgba(103,132,216,0.07)"/>
            <circle cx="0" cy="0" r="8" fill="rgba(103,132,216,0.14)"/>
            {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg,i)=>(
              <rect key={i} x="-3.5" y="-47" width="7" height="14" fill="rgba(103,132,216,0.18)" rx="2"
                transform={`rotate(${deg})`}/>
            ))}
          </g>
          {/* Gear kecil — berkaitan di sisi kiri gear besar */}
          <g transform="translate(-68,0)" style={{animation:'gearCCW 11s linear infinite', transformOrigin:'0px 0px'}}>
            <circle cx="0" cy="0" r="24" fill="none" stroke="rgba(103,132,216,0.11)" strokeWidth="3.5"/>
            <circle cx="0" cy="0" r="10" fill="rgba(103,132,216,0.05)"/>
            <circle cx="0" cy="0" r="4" fill="rgba(103,132,216,0.12)"/>
            {[0,45,90,135,180,225,270,315].map((deg,i)=>(
              <rect key={i} x="-2.5" y="-27" width="5" height="10" fill="rgba(103,132,216,0.15)" rx="1.5"
                transform={`rotate(${deg})`}/>
            ))}
          </g>
        </g>

        {/* ═══ KANAN BAWAH: Truk Mixer ═══ */}
        <g style={{animation:'truckShake 0.18s ease-in-out infinite'}} transform="translate(1060,720)">
          {/* Badan */}
          <rect x="20" y="18" width="130" height="44" fill="rgba(79,111,199,0.11)" rx="4"/>
          {/* Kabin */}
          <rect x="128" y="6" width="52" height="40" fill="rgba(79,111,199,0.16)" rx="4"/>
          {/* Kaca */}
          <rect x="136" y="11" width="26" height="16" fill="rgba(147,197,253,0.24)" rx="2"/>
          {/* Drum mixer */}
          <g style={{animation:'drumSpin 3s linear infinite', transformOrigin:'75px 36px'}}>
            <ellipse cx="75" cy="36" rx="34" ry="24" fill="rgba(79,111,199,0.1)" stroke="rgba(79,111,199,0.18)" strokeWidth="2"/>
            {[0,60,120,180,240,300].map((deg,i)=>(
              <line key={i} x1="75" y1="36"
                x2={75+32*Math.cos(deg*Math.PI/180)} y2={36+22*Math.sin(deg*Math.PI/180)}
                stroke="rgba(79,111,199,0.13)" strokeWidth="1.5"/>
            ))}
            <circle cx="75" cy="36" r="7" fill="rgba(79,111,199,0.18)"/>
          </g>
          {/* Roda */}
          {[38,80,122,150].map((x,i)=>(
            <g key={i}>
              <circle cx={x} cy="66" r="13" fill="none" stroke="rgba(79,111,199,0.18)" strokeWidth="3"/>
              <circle cx={x} cy="66" r="5" fill="rgba(79,111,199,0.14)"/>
            </g>
          ))}
          {/* Knalpot */}
          <rect x="174" y="1" width="4" height="18" fill="rgba(79,111,199,0.14)" rx="2"/>
          {/* Asap */}
          {[0,1,2].map(i=>(
            <circle key={i} cx={175+i*2} cy={-5-i*9} r={4+i*1.5}
              fill="rgba(148,163,184,0.12)"
              style={{animation:`smokePuff 2s ${i*0.5}s ease-out infinite`}}/>
          ))}
        </g>

        {/* ═══ TENGAH ATAS: Blueprint Denah ═══ */}
        <g style={{animation:'floatD 14s ease-in-out infinite'}} transform="translate(580,18)">
          <rect x="0" y="0" width="108" height="80" fill="rgba(79,111,199,0.05)" stroke="rgba(79,111,199,0.14)" strokeWidth="1.5" rx="3"/>
          <rect x="8" y="8" width="42" height="28" fill="none" stroke="rgba(79,111,199,0.18)" strokeWidth="1.2"/>
          <rect x="56" y="8" width="42" height="28" fill="none" stroke="rgba(79,111,199,0.18)" strokeWidth="1.2"/>
          <rect x="8" y="42" width="90" height="28" fill="none" stroke="rgba(79,111,199,0.18)" strokeWidth="1.2"/>
          <path d="M44 60 Q44 50 56 42" fill="none" stroke="rgba(79,111,199,0.14)" strokeWidth="1"/>
          <line x1="44" y1="60" x2="56" y2="60" stroke="rgba(79,111,199,0.16)" strokeWidth="1.2"/>
          <line x1="0" y1="88" x2="108" y2="88" stroke="rgba(79,111,199,0.1)" strokeWidth="1"/>
          <line x1="0" y1="84" x2="0" y2="92" stroke="rgba(79,111,199,0.13)" strokeWidth="1.2"/>
          <line x1="108" y1="84" x2="108" y2="92" stroke="rgba(79,111,199,0.13)" strokeWidth="1.2"/>
          <text x="54" y="84" textAnchor="middle" fill="rgba(79,111,199,0.2)" fontSize="8" fontFamily="monospace">18.500 m</text>
        </g>

        {/* ═══ TENGAH BAWAH: Safety Cone + Material ═══ */}
        <g style={{animation:'floatV 12s ease-in-out infinite', animationDelay:'2s'}} transform="translate(560,760)">
          {/* Cone 1 */}
          <polygon points="22,0 40,44 4,44" fill="rgba(251,191,36,0.2)" stroke="rgba(251,191,36,0.35)" strokeWidth="1.5"/>
          <rect x="7" y="16" width="30" height="3" fill="rgba(255,255,255,0.3)"/>
          <rect x="10" y="28" width="24" height="3" fill="rgba(255,255,255,0.28)"/>
          <rect x="2" y="44" width="40" height="5" fill="rgba(79,111,199,0.14)" rx="1"/>
          {/* Cone 2 */}
          <polygon points="76,0 92,38 60,38" fill="rgba(251,191,36,0.15)" stroke="rgba(251,191,36,0.28)" strokeWidth="1.5"/>
          <rect x="63" y="13" width="26" height="2.5" fill="rgba(255,255,255,0.25)"/>
          <rect x="66" y="23" width="20" height="2.5" fill="rgba(255,255,255,0.22)"/>
          <rect x="58" y="38" width="36" height="4" fill="rgba(79,111,199,0.12)" rx="1"/>
          {/* Tumpukan bata */}
          {[0,1,2].map(row=>(
            [0,1,2,3].map(col=>(
              <rect key={`${row}-${col}`}
                x={120 + col*22 + (row%2)*11} y={30+row*9}
                width="20" height="7"
                fill="rgba(79,111,199,0.09)" stroke="rgba(79,111,199,0.14)" strokeWidth="0.5" rx="1"/>
            ))
          ))}
        </g>

        {/* ═══ HELM KIRI TENGAH ═══ */}
        <g style={{animation:'helmetFloat 8s ease-in-out infinite'}} transform="translate(80,390)">
          <path d="M10 34 Q10 5 44 5 Q78 5 78 34 L78 42 L10 42 Z" fill="rgba(251,191,36,0.2)" stroke="rgba(251,191,36,0.36)" strokeWidth="1.8"/>
          <rect x="5" y="38" width="78" height="9" fill="rgba(251,191,36,0.16)" stroke="rgba(251,191,36,0.3)" strokeWidth="1.5" rx="2"/>
          <path d="M26 24 Q44 17 62 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.8"/>
        </g>

        {/* ═══ HELM KANAN TENGAH ═══ */}
        <g style={{animation:'helmetFloat 10s ease-in-out infinite', animationDelay:'2.5s'}} transform="translate(1340,550)">
          <path d="M6 22 Q6 3 28 3 Q50 3 50 22 L50 28 L6 28 Z" fill="rgba(79,111,199,0.16)" stroke="rgba(79,111,199,0.26)" strokeWidth="1.5"/>
          <rect x="3" y="25" width="50" height="6" fill="rgba(79,111,199,0.13)" stroke="rgba(79,111,199,0.22)" strokeWidth="1" rx="1"/>
        </g>

        {/* ═══ BAUT / BOLT di 4 sudut area kosong ═══ */}
        {[{x:280,y:200},{x:1150,y:200},{x:280,y:680},{x:1150,y:680}].map((p,i)=>(
          <g key={i} style={{animation:`boltFloat 9s ${i*1.8}s ease-in-out infinite`}} transform={`translate(${p.x},${p.y})`}>
            <circle cx="0" cy="0" r="9" fill="none" stroke="rgba(79,111,199,0.13)" strokeWidth="2"/>
            <circle cx="0" cy="0" r="3.5" fill="rgba(79,111,199,0.11)"/>
            {[0,60,120,180,240,300].map((deg,j)=>(
              <line key={j} x1={4.5*Math.cos(deg*Math.PI/180)} y1={4.5*Math.sin(deg*Math.PI/180)}
                x2={9*Math.cos(deg*Math.PI/180)} y2={9*Math.sin(deg*Math.PI/180)}
                stroke="rgba(79,111,199,0.13)" strokeWidth="1.5"/>
            ))}
          </g>
        ))}

        {/* ═══ PARTIKEL DEBU ═══ */}
        {[
          {cx:180,cy:650,r:3,d:'0s'},{cx:240,cy:600,r:2,d:'0.7s'},
          {cx:1280,cy:680,r:3.5,d:'0.3s'},{cx:1200,cy:720,r:2.5,d:'1.1s'},
          {cx:480,cy:80,r:2,d:'0.5s'},{cx:960,cy:60,r:3,d:'1.4s'},
          {cx:120,cy:460,r:2.5,d:'2s'},{cx:1380,cy:400,r:2,d:'0.9s'},
        ].map((p,i)=>(
          <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="rgba(148,163,184,0.22)"
            style={{animation:`dustFloat 4.5s ${p.d} ease-in-out infinite`}}/>
        ))}

        {/* ═══ GARIS DIMENSI TENGAH ═══ */}
        <g style={{animation:'floatD 16s ease-in-out infinite reverse', opacity:0.7}}>
          <line x1="320" y1="490" x2="580" y2="490" stroke="rgba(79,111,199,0.1)" strokeWidth="1"/>
          <line x1="320" y1="485" x2="320" y2="495" stroke="rgba(79,111,199,0.13)" strokeWidth="1.2"/>
          <line x1="580" y1="485" x2="580" y2="495" stroke="rgba(79,111,199,0.13)" strokeWidth="1.2"/>
          <text x="450" y="486" textAnchor="middle" fill="rgba(79,111,199,0.16)" fontSize="9" fontFamily="monospace">24.500 m</text>
        </g>

        {/* ═══ PIPA DI TENGAH KANAN ═══ */}
        <g style={{animation:'floatV 13s ease-in-out infinite', animationDelay:'3s'}} transform="translate(960,810)">
          {[0,1].map(row=>(
            <g key={row}>
              <ellipse cx="15" cy={10+row*16} rx="12" ry="7" fill="none" stroke="rgba(79,111,199,0.18)" strokeWidth="1.5"/>
              <rect x="3" y={3+row*16} width="100" height="14" fill="rgba(79,111,199,0.08)" stroke="rgba(79,111,199,0.14)" strokeWidth="1"/>
              <ellipse cx="115" cy={10+row*16} rx="12" ry="7" fill="none" stroke="rgba(79,111,199,0.18)" strokeWidth="1.5"/>
            </g>
          ))}
        </g>
      </g>

      <style>{`
        @keyframes orbA       {0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-18px,22px) scale(1.04)}}
        @keyframes orbB       {0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(22px,-15px) scale(0.96)}}
        @keyframes orbC       {0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-10px,18px) scale(1.06)}}
        @keyframes floatV     {0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        @keyframes floatD     {0%,100%{transform:translate(0,0)}50%{transform:translate(8px,-10px)}}
        @keyframes hookSwing  {0%,100%{transform:rotate(0deg)}25%{transform:rotate(6deg)}75%{transform:rotate(-6deg)}}
        @keyframes excavArm   {0%,100%{transform:rotate(0deg)}50%{transform:rotate(-12deg)}}
        @keyframes gearCW     {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes gearCCW    {from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
        @keyframes drumSpin   {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes truckShake {0%,100%{transform:translate(1060px,720px)}50%{transform:translate(1060px,722px)}}
        @keyframes smokePuff  {0%{transform:scale(1);opacity:0.5}100%{transform:scale(1.8) translateY(-12px);opacity:0}}
        @keyframes dustFloat  {0%,100%{transform:translate(0,0);opacity:0.35}50%{transform:translate(7px,-11px);opacity:0.7}}
        @keyframes helmetFloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-10px) rotate(3deg)}}
        @keyframes boltFloat  {0%,100%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(3px,-7px) rotate(25deg)}}
      `}</style>
    </svg>
  )
}
// ── Confetti meledak saat sukses ──
function Confetti() {
  const pieces = [
    {x:-60,y:-50,c:'#fbbf24',r:8,shape:'circle',delay:'0s'},
    {x:55,y:-60,c:'#10b981',r:6,shape:'rect',delay:'0.05s'},
    {x:-50,y:55,c:'#6784d8',r:7,shape:'circle',delay:'0.1s'},
    {x:58,y:50,c:'#ef4444',r:5,shape:'rect',delay:'0.03s'},
    {x:5,y:-70,c:'#8b5cf6',r:6,shape:'circle',delay:'0.15s'},
    {x:72,y:-5,c:'#06b6d4',r:5,shape:'star',delay:'0.08s'},
    {x:-72,y:5,c:'#f59e0b',r:4,shape:'rect',delay:'0.18s'},
    {x:25,y:68,c:'#ec4899',r:6,shape:'circle',delay:'0.12s'},
    {x:-30,y:72,c:'#14b8a6',r:5,shape:'star',delay:'0.06s'},
    {x:68,y:35,c:'#f97316',r:4,shape:'circle',delay:'0.2s'},
    {x:-65,y:-25,c:'#a78bfa',r:5,shape:'rect',delay:'0.09s'},
    {x:20,y:-75,c:'#34d399',r:4,shape:'circle',delay:'0.17s'},
  ]
  return (
    <>
      {pieces.map((p,i) => (
        <div key={i} className="absolute pointer-events-none"
          style={{
            left: '50%', top: '50%',
            width: p.r*2, height: p.r*2,
            borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'star' ? '2px' : '2px',
            background: p.c,
            transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) rotate(${p.x * 2}deg)`,
            animation: `confettiBurst 0.9s ${p.delay} cubic-bezier(0.22,1,0.36,1) both`,
            opacity: 0,
          }}
        />
      ))}
    </>
  )
}

// ── Alert nama admin yang dramatis ──
function AdminWelcomeAlert({ name, visible, t }) {
  const initial = name?.[0]?.toUpperCase() || 'A'
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      {/* Backdrop blur */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(6px)',
        animation: visible ? 'backdropIn 0.4s ease-out forwards' : 'none',
      }} />

      {/* Card alert utama */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '380px',
        margin: '0 16px',
        animation: visible ? 'alertCardIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
        opacity: 0,
      }}>
        {/* Cahaya di belakang card */}
        <div style={{
          position: 'absolute',
          inset: '-20px',
          background: 'radial-gradient(ellipse at center, rgba(103,132,216,0.3) 0%, transparent 70%)',
          animation: 'glowPulse 1.5s ease-in-out infinite',
          borderRadius: '40px',
        }} />

        {/* Main card */}
        <div style={{
          position: 'relative',
          borderRadius: '28px',
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.97)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.5)',
        }}>

          {/* Header gradient */}
          <div style={{
            padding: '32px 28px 24px',
            background: 'linear-gradient(145deg, #26304f 0%, #364b8c 50%, #364b8c 100%)',
            position: 'relative',
            overflow: 'hidden',
            textAlign: 'center',
          }}>
            {/* Shimmer effect header */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)',
              animation: 'shimmerMove 2s ease-in-out infinite',
            }} />
            {/* Ring dekorasi */}
            <div style={{
              position: 'absolute', top: '-30px', right: '-30px',
              width: '120px', height: '120px',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
            }} />

            {/* Avatar admin besar */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: '14px' }}>
              {/* Ring animasi berputar */}
              <div style={{
                position: 'absolute', inset: '-8px',
                borderRadius: '50%',
                border: '2px dashed rgba(99,179,237,0.5)',
                animation: 'spinSlow 6s linear infinite',
              }} />
              <div style={{
                position: 'absolute', inset: '-16px',
                borderRadius: '50%',
                border: '1.5px solid rgba(255,255,255,0.1)',
                animation: 'spinSlow 10s linear infinite reverse',
              }} />
              {/* Ripple rings */}
              {[0,1,2].map(i => (
                <div key={i} style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(96,165,250,0.4)',
                  animation: `rippleRing 2s ${i * 0.5}s ease-out infinite`,
                }} />
              ))}
              {/* Avatar circle */}
              <div style={{
                width: '76px', height: '76px',
                borderRadius: '50%',
                background: 'linear-gradient(145deg, #4059ad, #6aaee0)',
                border: '3px solid rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: '900',
                color: 'white',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                position: 'relative',
                animation: 'avatarPop 0.5s 0.2s cubic-bezier(0.34,1.56,0.64,1) both',
              }}>
                {initial}
              </div>
              {/* Badge centang */}
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: '24px', height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: '2px solid white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'badgePop 0.4s 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
                opacity: 0,
              }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6.5L5 9L9.5 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="12" strokeDashoffset="0"
                    style={{ animation: 'drawCheck 0.35s 0.7s ease-out both', strokeDashoffset: 12 }} />
                </svg>
              </div>
            </div>

            {/* Teks header */}
            <div style={{ animation: 'fadeUp 0.4s 0.3s ease-out both', opacity: 0 }}>
              <p style={{ color: 'rgba(148,163,184,1)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '4px' }}>
                {t.authOk}
              </p>
              <h2 style={{ color: 'white', fontSize: '22px', fontWeight: 900, lineHeight: 1.2, margin: 0 }}>
                {t.welcomeTitle}
              </h2>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 28px 28px', textAlign: 'center' }}>
            {/* Confetti relatif ke body */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Confetti />
              {/* Chip nama */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 20px',
                borderRadius: '100px',
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                border: '1.5px solid #bfdbfe',
                boxShadow: '0 4px 16px rgba(103,132,216,0.15)',
                animation: 'chipIn 0.5s 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                opacity: 0,
              }}>
                <div style={{
                  width: '32px', height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4059ad, #5b9bd5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 900, fontSize: '13px',
                  flexShrink: 0,
                }}>
                  {initial}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: '9px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1px' }}>
                    {t.roleLabel}
                  </p>
                  <p style={{ fontSize: '15px', fontWeight: 900, color: '#364b8c', margin: 0, letterSpacing: '-0.01em' }}>
                    {name}
                  </p>
                </div>
              </div>
            </div>

            <p style={{
              fontSize: '13px', color: '#64748b', fontWeight: 500,
              animation: 'fadeUp 0.4s 0.55s ease-out both', opacity: 0,
              marginBottom: '20px',
            }}>
              {t.welcomeMsg1}<br/>{t.welcomeMsg2}
            </p>

            {/* Progress bar */}
            <div style={{
              height: '4px',
              borderRadius: '100px',
              background: '#e0e7ff',
              overflow: 'hidden',
              animation: 'fadeUp 0.4s 0.6s ease-out both',
              opacity: 0,
            }}>
              <div style={{
                height: '100%',
                borderRadius: '100px',
                background: 'linear-gradient(90deg, #4059ad, #6aaee0, #10b981)',
                backgroundSize: '200% 100%',
                animation: 'progressFill 2.4s 0.65s linear forwards, shimmerBar 1s 0.65s linear infinite',
                width: '0%',
              }} />
            </div>

            {/* Dots loading */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '12px',
              animation: 'fadeUp 0.4s 0.7s ease-out both', opacity: 0,
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  background: '#93c5fd',
                  animation: `dotBounce 1s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ikon fitur di panel merek (teks diambil dari i18n) ──
const FEATURE_ICONS = [QrCode, Wallet, Package, BarChart3]

// ── Siluet kota + tower crane di dasar panel merek ──
function Skyline() {
  return (
    <svg className="absolute bottom-0 left-0 w-full pointer-events-none" viewBox="0 0 600 190"
      preserveAspectRatio="xMidYMax slice" aria-hidden="true" style={{ height: '30%', zIndex: 0 }}>
      <defs>
        <linearGradient id="skyFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {[[0,110,58,80],[52,78,48,112],[96,120,44,70],[136,60,62,130],[194,96,50,94],[240,126,44,64],
        [280,70,58,120],[334,104,46,86],[376,50,54,140],[426,112,48,78],[470,84,60,106],[526,118,74,72]]
        .map(([x, y, w, h], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill="url(#skyFade)" rx="3" />
            {[0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((c) => (
              y + 12 + r * 18 < y + h - 8 && (
                <rect key={`${r}-${c}`} x={x + 8 + c * ((w - 16) / 3)} y={y + 12 + r * 18}
                  className={(i + r * 2 + c) % 4 === 0 ? 'lp-twinkle' : undefined}
                  style={(i + r * 2 + c) % 4 === 0 ? { animationDelay: (((i * 7 + r * 3 + c * 5) % 11) * 0.45) + 's' } : undefined}
                  width={Math.max(4, (w - 16) / 3 - 6)} height="7" rx="1.5" fill="#fff" fillOpacity="0.10" />
              )
            )))}
          </g>
        ))}
      <g stroke="#fff" strokeOpacity="0.28" strokeWidth="2" fill="none">
        <line x1="440" y1="190" x2="440" y2="6" />
        <line x1="428" y1="190" x2="428" y2="6" />
        {[20, 46, 72, 98, 124, 150].map((y) => <path key={y} d={`M428 ${y + 26} L440 ${y}`} strokeWidth="1.3" />)}
        <line x1="352" y1="10" x2="520" y2="10" strokeWidth="3" />
        <path d="M352 10 L440 -14 L520 10" strokeWidth="1.4" />
        <g className="lp-hook">
          <line x1="372" y1="10" x2="372" y2="70" strokeDasharray="3 3" strokeWidth="1.4" />
          <rect x="365" y="70" width="14" height="9" rx="2" fill="#fff" fillOpacity="0.22" />
        </g>
      </g>
      <rect x="0" y="186" width="600" height="4" fill="#fff" fillOpacity="0.16" />
    </svg>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth()
  const { isDark } = useTheme()
  const { lang } = useLang()
  const t = authText(lang)
  const p = authPalette(isDark)
  const navigate = useNavigate()

  const [view, setView] = useState('login') // 'login' | 'forgot' | 'sent'
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shakeError, setShakeError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')     // pesan yang sudah diterjemahkan
  const [errCode, setErrCode] = useState('')       // kode error → diterjemahkan ulang saat bahasa berganti
  const [success, setSuccess] = useState(false)
  const [successName, setSuccessName] = useState('')
  const [capsOn, setCapsOn] = useState(false)

  // lupa password
  const [resetEmail, setResetEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [forgotErr, setForgotErr] = useState('')
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Selama form sedang diproses/animasi sukses berjalan, JANGAN redirect otomatis. Verifikasi profil
  // di login() dan di listener auth berbalapan: bila listener menang, 'user' terisi sebelum
  // setSuccess(true) dan layar sukses terlewat. Redirect hanya oleh timer animasi.
  const submittingRef = useRef(false)
  const navTimerRef = useRef(null)
  useEffect(() => { if (user && !authLoading && !success && !submittingRef.current) navigate('/') }, [user, authLoading, navigate, success])
  useEffect(() => () => clearTimeout(navTimerRef.current), [])
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const triggerShake = () => {
    setShakeError(true)
    setTimeout(() => setShakeError(false), 600)
  }

  // Pesan error mengikuti bahasa aktif walau bahasa diganti setelah error muncul
  const loginError = errCode ? (t[`err_${errCode}`] || t.err_generic) : errorMsg

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg(''); setErrCode('')
    if (!form.email || !form.password) {
      setErrorMsg(t.requiredBoth)
      triggerShake()
      return
    }
    setLoading(true)
    submittingRef.current = true
    try {
      const data = await login(form.email, form.password)
      const adminName = data?.user?.user_metadata?.nama_lengkap
        || data?.user?.email?.split('@')[0]
        || 'Admin'
      setSuccessName(adminName)
      setSuccess(true)
      navTimerRef.current = setTimeout(() => navigate('/'), 3200)
    } catch (err) {
      submittingRef.current = false
      if (err.code) setErrCode(err.code); else setErrorMsg(err.message || t.loginFailed)
      triggerShake()
      // arahkan kursor ke password & blok isinya agar langsung bisa diketik ulang
      setTimeout(() => { const el = document.getElementById('login-password'); el?.focus(); el?.select?.() }, 60)
    } finally {
      setLoading(false)
    }
  }

  const openForgot = () => {
    setForgotErr('')
    setResetEmail(form.email)
    setView('forgot')
  }

  const handleForgot = async (e) => {
    e?.preventDefault()
    setForgotErr('')
    const em = (view === 'sent' ? sentTo : resetEmail).trim().toLowerCase()
    if (!em) { setForgotErr(t.emailRequired); return }
    if (!EMAIL_RE.test(em)) { setForgotErr(t.emailInvalid); return }
    setSending(true)
    try {
      await authService.requestPasswordReset(em)
      setSentTo(em)
      setView('sent')
      setCooldown(60)
    } catch (err) {
      if (err.code === 'rate_limit') { setForgotErr(t.tooMany); setCooldown((c) => c || 60) }
      else setForgotErr(t.sendFail)
    } finally {
      setSending(false)
    }
  }

  const checkCaps = (ev) => setCapsOn(!!ev.getModifierState?.('CapsLock'))
  const [sentPre, sentPost] = t.sentBody.split('{email}')

  const brandMark = (size) => <BrandMark size={size} />
  const primaryBtnStyle = {
    minHeight: 52,
    background: 'linear-gradient(120deg, #364b8c 0%, #4f6fc7 55%, #5b9bd5 100%)',
    boxShadow: '0 10px 26px rgba(79,111,199,0.34), inset 0 1px 0 rgba(255,255,255,0.18)',
  }
  const primaryBtnClass = `lp-btn relative w-full rounded-2xl font-extrabold text-[14px] text-white overflow-hidden
    flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.985]
    disabled:opacity-60 disabled:cursor-not-allowed`

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 pt-[72px] sm:p-6 overflow-hidden"
      style={{ background: p.pageBg, isolation: 'isolate', transition: 'background .4s ease' }}>

      <AuthControls />

      <div className="hidden sm:block" style={{ opacity: p.bgFx }}><BgParticles /></div>

      {success && <AdminWelcomeAlert name={successName} visible={success} t={t} />}

      {/* Bukan <main>: CSS global aplikasi punya aturan `main {…}` untuk layout dashboard */}
      <div role="main" className="relative w-full max-w-[460px] lg:max-w-[1040px]"
        style={{ animation: 'lpEnter .7s .05s cubic-bezier(0.22,1,0.36,1) backwards', ...(success ? { filter: 'blur(2px)' } : null) }}>

        <div className="grid lg:grid-cols-[1.08fr_0.92fr] rounded-[32px] overflow-hidden"
          style={{ background: p.shellBg, isolation: 'isolate', boxShadow: p.shellShadow, transition: 'background .4s ease, box-shadow .4s ease' }}>

          {/* ─── PANEL MEREK (desktop) ─── */}
          <section className="relative hidden lg:flex flex-col justify-between p-11 text-white overflow-hidden lg:rounded-l-[32px]"
            style={{ background: 'linear-gradient(155deg, #2e3d6e 0%, #364b8c 32%, #4059ad 60%, #4f86b8 88%, #5b9bd5 100%)', minHeight: 700, backgroundSize: '220% 220%', animation: 'lpAurora 18s ease-in-out infinite' }}>

            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)',
              backgroundSize: '22px 22px', maskImage: 'linear-gradient(180deg, #000 0%, transparent 70%)',
              WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 70%)',
            }} />
            <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.16), transparent 68%)' }} />
            <div className="absolute top-1/3 -left-24 w-64 h-64 rounded-full pointer-events-none"
              style={{ border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'inset 0 0 60px rgba(255,255,255,0.05)' }} />

            <div className="lp-orb" style={{ width: 260, height: 260, top: '8%', right: '-8%', background: 'rgba(147,197,253,0.30)', animation: 'lpOrbA 14s ease-in-out infinite' }} />
            <div className="lp-orb" style={{ width: 220, height: 220, bottom: '18%', left: '-10%', background: 'rgba(129,140,248,0.28)', animation: 'lpOrbB 17s ease-in-out infinite' }} />
            {[8, 22, 37, 52, 66, 80, 91].map((left, i) => (
              <span key={left} className="lp-dot" style={{ left: left + '%', animationDelay: (i * 0.9) + 's', animationDuration: (6 + (i % 3) * 1.6) + 's' }} />
            ))}

            <div className="relative z-10">
              <div className="flex items-center gap-3.5" style={{ animation: 'lpFadeUp .6s .1s ease-out both' }}>
                <div className="lp-logo-anim relative w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.16)', border: '1.5px solid rgba(255,255,255,0.30)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px rgba(20,30,70,0.25)' }}>
                  <span className="lp-ring" aria-hidden="true" />
                  <span className="lp-ping" aria-hidden="true" />
                  {brandMark(34)}
                  <span className="absolute -top-1.5 -right-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center font-black text-[7.5px]"
                    style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#2e3d6e', border: '2px solid rgba(255,255,255,0.85)' }}>KP</span>
                </div>
                <div>
                  <p className="text-[17px] font-extrabold leading-tight">PT Krakatau Indah</p>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.68)' }}>{t.brandSub}</p>
                </div>
              </div>

              <h1 className="mt-12 text-[2.15rem] leading-[1.15] font-extrabold tracking-tight" style={{ animation: 'lpFadeUp .6s .2s ease-out both' }}>
                {t.heroTitle1}<br /><span className="lp-shine">{t.heroTitle2}</span>
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed max-w-[380px]" style={{ color: 'rgba(255,255,255,0.78)', animation: 'lpFadeUp .6s .3s ease-out both' }}>
                {t.heroDesc}
              </p>

              <ul className="mt-8 grid grid-cols-2 gap-3 max-w-[470px]">
                {FEATURE_ICONS.map((Icon, i) => (
                  <li key={i} className="lp-feat rounded-2xl p-3.5"
                    style={{
                      background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)',
                      backdropFilter: 'blur(8px)', animation: `lpFadeUp .6s ${0.4 + i * 0.08}s ease-out both`,
                    }}>
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center mb-2" style={{ background: 'rgba(255,255,255,0.18)' }}>
                      <Icon size={16} />
                    </span>
                    <p className="text-[12.5px] font-bold leading-tight">{t[`feat${i + 1}Title`]}</p>
                    <p className="text-[11px] mt-1 leading-snug" style={{ color: 'rgba(255,255,255,0.68)' }}>{t[`feat${i + 1}Desc`]}</p>
                  </li>
                ))}
              </ul>
            </div>

            <Skyline />

            <div className="relative z-10 flex items-end justify-between" style={{ animation: 'lpFadeUp .6s .8s ease-out both' }}>
              <LiveClock tone="light" lang={lang} />
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10.5px] font-semibold"
                style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.24)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                {t.version}
              </span>
            </div>
          </section>

          {/* ─── PANEL FORM ─── */}
          <section className="relative flex flex-col justify-center px-7 sm:px-11 py-10 rounded-[32px] lg:rounded-l-none lg:rounded-r-[32px]"
            style={{ background: p.shellBg, transition: 'background .4s ease' }}>

            {/* merek ringkas (mobile) */}
            <div className="lg:hidden text-center mb-7">
              <div className="lp-logo-anim relative inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-3"
                style={{ background: 'linear-gradient(145deg,#364b8c,#5b9bd5)', boxShadow: '0 10px 26px rgba(79,111,199,0.32)' }}>
                {brandMark(38)}
                <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center font-black text-[8px]"
                  style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#2e3d6e', border: `2px solid ${p.shellBg}` }}>KP</span>
              </div>
              <p className="text-[16px] font-extrabold" style={{ color: p.title }}>PT Krakatau Indah</p>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: p.muted }}>{t.brandSub}</p>
            </div>

            <div key={view} style={{ animation: 'lpFadeUp .45s ease-out both' }}>

              {/* ══════════ VIEW: LOGIN ══════════ */}
              {view === 'login' && (
                <div className={shakeError ? 'login-shake' : ''}>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold"
                    style={{ background: p.chipBg, color: p.chipText }}>
                    <ShieldCheck size={12} /> {t.adminBadge}
                  </span>
                  <h2 className="mt-3 text-[1.65rem] font-extrabold tracking-tight leading-tight" style={{ color: p.title }}>{t.welcomeBack}</h2>
                  <p className="mt-1.5 text-[13.5px]" style={{ color: p.sub }}>{t.welcomeSub}</p>

                  <form onSubmit={handleSubmit} noValidate className="mt-7" style={{ display: 'grid', gap: 18, animation: 'lpFadeUp .55s .2s ease-out both' }}>
                    <div aria-live="assertive">
                      {loginError && (
                        <div role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl text-[12.5px] font-semibold"
                          style={{ background: p.errBg, border: `1px solid ${p.errBorder}`, color: p.errText, animation: 'lpErrorPop .45s cubic-bezier(0.34,1.56,0.64,1) both, lpRedGlow 1.4s ease-out 1' }}>
                          <AlertCircle size={15} className="lp-alert-icon flex-shrink-0 mt-px" />
                          <span>{loginError}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <Field id="login-email" label={t.email} icon={Mail} type="email" name="email" p={p}
                        autoComplete="username" autoFocus inputMode="email" spellCheck={false}
                        value={form.email} error={!!loginError}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder={t.emailPh} />
                    </div>

                    <div>
                      <Field id="login-password" label={t.password} icon={Lock} name="password" p={p}
                        type={showPass ? 'text' : 'password'} autoComplete="current-password"
                        value={form.password} error={!!loginError}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        onKeyUp={checkCaps} onKeyDown={checkCaps} onBlur={() => setCapsOn(false)}
                        placeholder={t.passwordPh}
                        right={
                          <button type="button" onClick={() => setShowPass((v) => !v)}
                            aria-label={showPass ? t.hidePw : t.showPw}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors"
                            style={{ color: p.icon }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = p.iconHover)}
                            onMouseLeave={(e) => (e.currentTarget.style.color = p.icon)}>
                            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        } />
                      <div className="mt-2 flex items-center justify-between gap-3 min-h-[20px]">
                        {capsOn ? (
                          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: p.warn }}>
                            <AlertCircle size={12} /> {t.capsOn}
                          </p>
                        ) : <span />}
                        <button type="button" onClick={openForgot}
                          className="lp-link text-[12.5px] font-bold" style={{ color: p.accent }}>
                          {t.forgot}
                        </button>
                      </div>
                    </div>

                    <button type="submit" disabled={loading} className={primaryBtnClass} style={primaryBtnStyle}>
                      <span className="lp-sheen" aria-hidden="true" />
                      {loading ? (
                        <><Loader2 size={17} className="animate-spin" />{t.verifying}</>
                      ) : (
                        <><LogIn size={16} /><span>{t.signIn}</span><ArrowRight size={16} className="lp-arrow" /></>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {/* ══════════ VIEW: LUPA PASSWORD ══════════ */}
              {view === 'forgot' && (
                <>
                  <span className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: p.chipBg, color: p.chipText }}>
                    <KeyRound size={22} />
                  </span>
                  <h2 className="mt-4 text-[1.65rem] font-extrabold tracking-tight leading-tight" style={{ color: p.title }}>{t.forgotTitle}</h2>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: p.sub }}>{t.forgotSub}</p>

                  <form onSubmit={handleForgot} noValidate className="mt-7" style={{ display: 'grid', gap: 18, animation: 'lpFadeUp .55s .2s ease-out both' }}>
                    <div aria-live="assertive">
                      {forgotErr && (
                        <div role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl text-[12.5px] font-semibold"
                          style={{ background: p.errBg, border: `1px solid ${p.errBorder}`, color: p.errText, animation: 'lpSlideDown .25s ease-out' }}>
                          <AlertCircle size={15} className="flex-shrink-0 mt-px" />
                          <span>{forgotErr}</span>
                        </div>
                      )}
                    </div>
                    <Field id="reset-email" label={t.email} icon={Mail} type="email" name="email" p={p}
                      autoComplete="email" autoFocus inputMode="email" spellCheck={false}
                      value={resetEmail} error={!!forgotErr}
                      onChange={(e) => setResetEmail(e.target.value)} placeholder={t.emailPh} />

                    <button type="submit" disabled={sending || cooldown > 0} className={primaryBtnClass} style={primaryBtnStyle}>
                      <span className="lp-sheen" aria-hidden="true" />
                      {sending ? (
                        <><Loader2 size={17} className="animate-spin" />{t.sending}</>
                      ) : cooldown > 0 ? (
                        <span>{fmt(t.resendIn, { n: cooldown })}</span>
                      ) : (
                        <><Send size={16} /><span>{t.sendLink}</span></>
                      )}
                    </button>

                    <p className="flex items-start gap-2 text-[12px] leading-relaxed px-3.5 py-3 rounded-2xl"
                      style={{ background: p.chipBg, color: p.sub }}>
                      <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: p.accent }} />
                      <span>{t.mobileNote}</span>
                    </p>
                  </form>

                  <button type="button" onClick={() => setView('login')}
                    className="lp-link mt-6 inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: p.accent }}>
                    <ArrowLeft size={15} /> {t.backToLogin}
                  </button>
                </>
              )}

              {/* ══════════ VIEW: EMAIL TERKIRIM ══════════ */}
              {view === 'sent' && (
                <>
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: p.okBg, border: `1px solid ${p.okBorder}`, color: p.okText }}>
                    <MailCheck size={26} />
                  </span>
                  <h2 className="mt-4 text-[1.65rem] font-extrabold tracking-tight leading-tight" style={{ color: p.title }}>{t.sentTitle}</h2>
                  <p className="mt-2 text-[13.5px] leading-relaxed break-words" style={{ color: p.sub }}>
                    {sentPre}<b style={{ color: p.title }}>{sentTo}</b>{sentPost}
                  </p>
                  <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: p.muted }}>{t.sentHint}</p>

                  {forgotErr && (
                    <div role="alert" className="mt-4 flex items-start gap-2.5 px-3.5 py-3 rounded-2xl text-[12.5px] font-semibold"
                      style={{ background: p.errBg, border: `1px solid ${p.errBorder}`, color: p.errText }}>
                      <AlertCircle size={15} className="flex-shrink-0 mt-px" /><span>{forgotErr}</span>
                    </div>
                  )}

                  <button type="button" onClick={handleForgot} disabled={sending || cooldown > 0}
                    className={`${primaryBtnClass} mt-6`} style={primaryBtnStyle}>
                    <span className="lp-sheen" aria-hidden="true" />
                    {sending ? (
                      <><Loader2 size={17} className="animate-spin" />{t.sending}</>
                    ) : cooldown > 0 ? (
                      <span>{fmt(t.resendIn, { n: cooldown })}</span>
                    ) : (
                      <><RefreshCw size={16} /><span>{t.resend}</span></>
                    )}
                  </button>

                  <button type="button" onClick={() => { setView('login'); setForgotErr('') }}
                    className="lp-link mt-6 inline-flex items-center gap-1.5 text-[13px] font-bold" style={{ color: p.accent }}>
                    <ArrowLeft size={15} /> {t.backToLogin}
                  </button>
                </>
              )}
            </div>

            <div className="mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-3 text-[10.5px] text-center sm:text-left"
              style={{ borderTop: `1px solid ${p.divider}`, color: p.footer }}>
              <span>© {new Date().getFullYear()} PT Krakatau Indah</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={11} style={{ color: p.accent }} /> {t.secure}
              </span>
            </div>
          </section>
        </div>

        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-3/4 h-9 rounded-full blur-2xl opacity-30 pointer-events-none"
          style={{ background: p.glow }} />
      </div>

      <style>{`
        ${AUTH_CSS}
        @keyframes lpHook      { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(5deg)} }
        .lp-hook  { transform-origin: 372px 10px; animation: lpHook 6s ease-in-out infinite; }

        /* Alert overlay animations */
        @keyframes backdropIn     { from{opacity:0} to{opacity:1} }
        @keyframes alertCardIn    { 0%{opacity:0;transform:scale(0.7) translateY(30px)} 70%{transform:scale(1.03) translateY(-4px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes glowPulse      { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes shimmerMove    { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        @keyframes spinSlow       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes rippleRing     { 0%{transform:scale(0.85);opacity:0.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes avatarPop      { 0%{opacity:0;transform:scale(0.3)} 70%{transform:scale(1.1)} 100%{opacity:1;transform:scale(1)} }
        @keyframes badgePop       { 0%{opacity:0;transform:scale(0)} 70%{transform:scale(1.2)} 100%{opacity:1;transform:scale(1)} }
        @keyframes drawCheck      { from{stroke-dashoffset:12} to{stroke-dashoffset:0} }
        @keyframes fadeUp         { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes chipIn         { 0%{opacity:0;transform:scale(0.6) translateY(8px)} 70%{transform:scale(1.05)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes confettiBurst  { 0%{opacity:0;transform:translate(calc(-50% + 0px),calc(-50% + 0px)) scale(0) rotate(0deg)} 50%{opacity:1} 100%{opacity:0;transform:translate(calc(var(--tx,30px)),calc(var(--ty,-30px))) scale(1) rotate(180deg)} }
        @keyframes progressFill   { from{width:0%} to{width:100%} }
        @keyframes shimmerBar     { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes dotBounce      { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-6px);opacity:1} }
      `}</style>
    </div>
  )
}
