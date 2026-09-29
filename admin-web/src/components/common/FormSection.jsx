/**
 * FORM DESIGN SYSTEM
 * Layout vertikal konsisten untuk semua form.
 * Setiap grup field memiliki label jelas, hint, dan error state.
 */

// ─── FormSection: grup fields dengan judul seksi ─────────────────────────────
export function FormSection({ title, subtitle, icon: Icon, children, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {(title || subtitle) && (
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          {Icon && (
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Icon size={14} className="text-blue-600" />
            </div>
          )}
          <div>
            {title && <p className="text-sm font-bold text-gray-800">{title}</p>}
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

// ─── FieldRow: 1-3 kolom dalam satu baris ────────────────────────────────────
export function FieldRow({ cols = 2, children, className = '' }) {
  const gridClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
  }[cols] || 'grid-cols-1 sm:grid-cols-2'
  return (
    <div className={`grid ${gridClass} gap-4 ${className}`}>
      {children}
    </div>
  )
}

// ─── InfoBox: highlight info/warning di dalam form ───────────────────────────
export function InfoBox({ type = 'info', title, children }) {
  const styles = {
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    error:   'bg-red-50 border-red-200 text-red-800',
  }
  const icons = { info: 'ℹ️', warning: '⚠️', success: '✓', error: '✕' }
  return (
    <div className={`border rounded-xl px-4 py-3 text-sm ${styles[type]}`}>
      <p className="font-semibold mb-0.5">{icons[type]} {title}</p>
      {children && <div className="text-xs mt-1 opacity-80">{children}</div>}
    </div>
  )
}

// ─── CalcPreview: preview kalkulasi otomatis ──────────────────────────────────
export function CalcPreview({ rows, total, totalLabel = 'Total', className = '' }) {
  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5 ${className}`}>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Perhitungan Otomatis</p>
      {rows.map(([label, val, highlight], i) => (
        <div key={i} className={`flex justify-between text-sm ${highlight ? 'text-red-600' : 'text-gray-600'}`}>
          <span>{label}</span>
          <span className="font-medium">{val}</span>
        </div>
      ))}
      {total !== undefined && (
        <div className="border-t pt-2 flex justify-between font-bold text-base">
          <span className="text-gray-800">{totalLabel}</span>
          <span className="text-blue-700">{total}</span>
        </div>
      )}
    </div>
  )
}

export default { FormSection, FieldRow, InfoBox, CalcPreview }
