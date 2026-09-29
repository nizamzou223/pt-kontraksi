import { AlertTriangle, Info, XCircle, Database, FlaskConical } from 'lucide-react'

export const fmt = (n, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: digits })
export const pct = (n, digits = 0) => (n === null || n === undefined || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(digits).replace('.', ',')}%`)
export const tgl = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

const RISK = {
  habis:   { label: 'Habis',   cls: 'bg-red-50 text-red-700 border-red-200' },
  kritis:  { label: 'Kritis',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  waspada: { label: 'Waspada', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  aman:    { label: 'Aman',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}
export const RiskBadge = ({ risiko }) => {
  const r = RISK[risiko] || RISK.aman
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${r.cls}`}>{r.label}</span>
}

const TINGKAT = {
  tinggi: { label: 'Tinggi', cls: 'bg-red-50 text-red-700 border-red-200' },
  sedang: { label: 'Sedang', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  rendah: { label: 'Rendah', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
}
export const TingkatBadge = ({ tingkat }) => {
  const t = TINGKAT[tingkat] || TINGKAT.rendah
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${t.cls}`}>{t.label}</span>
}

const TONES = {
  info:    { cls: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Info },
  warn:    { cls: 'bg-amber-50 border-amber-200 text-amber-800', Icon: AlertTriangle },
  danger:  { cls: 'bg-red-50 border-red-200 text-red-800', Icon: XCircle },
  success: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', Icon: Info },
}
export function Notice({ tone = 'info', title, children, action, className = '' }) {
  const { cls, Icon } = TONES[tone] || TONES.info
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${cls} ${className}`}>
      <Icon size={17} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-bold">{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {action}
    </div>
  )
}

export const SetupNotice = () => (
  <Notice tone="warn" title="Tabel Sistem Cerdas belum dibuat" className="mb-4">
    Hasil analisis tetap dapat dijalankan dan dilihat, tetapi <b>belum dapat disimpan</b>. Jalankan berkas{' '}
    <code className="px-1 py-0.5 rounded bg-amber-100">MIGRATION_ML_SISTEM_CERDAS.sql</code> di Supabase SQL Editor
    (setelah <code className="px-1 py-0.5 rounded bg-amber-100">SECURITY_HARDENING.sql</code>).
  </Notice>
)

export const DemoBanner = () => (
  <Notice tone="warn" title="Mode demo — data sintetis" className="mb-4">
    Angka di bawah dibangkitkan komputer (bukan data perusahaan) untuk memperagakan cara kerja sistem.
    Hasil evaluasinya hanya menunjukkan mekanisme, <b>bukan</b> kinerja pada data nyata.
  </Notice>
)

export function SourceToggle({ value, onChange, className = '' }) {
  const opt = (v, label, Icon) => (
    <button type="button" onClick={() => onChange(v)} aria-pressed={value === v}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${value === v ? 'bg-blue-700 text-white shadow-sm' : 'text-gray-600 hover:bg-blue-50'}`}>
      <Icon size={14} /> {label}
    </button>
  )
  return (
    <div className={`inline-flex gap-1 p-1 rounded-2xl bg-gray-100 ${className}`} role="group" aria-label="Sumber data">
      {opt('sistem', 'Data sistem', Database)}
      {opt('demo', 'Data demo', FlaskConical)}
    </div>
  )
}

export function ProgressBar({ p, label }) {
  const v = Math.max(0, Math.min(1, p || 0))
  return (
    <div role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1.5">
        <span className="truncate pr-3">{label || 'Memproses...'}</span><span>{Math.round(v * 100)}%</span>
      </div>
      <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width: `${v * 100}%`, background: 'linear-gradient(90deg,#4f6fc7,#5b9bd5)' }} />
      </div>
    </div>
  )
}

export function TabBar({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 border-b border-gray-100 mb-5 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${value === t.id ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          {t.label}{t.badge !== undefined && t.badge !== null && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export const downloadCsv = (nama, header, rows) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = nama; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
