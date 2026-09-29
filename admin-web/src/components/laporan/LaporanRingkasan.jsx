import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Users, DollarSign, Clock, CreditCard, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Package, Calendar } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, Button, Input, PageHeader, AlertInPage } from '../common'
import { payrollService } from '../../services/payrollService'
import { reportService } from '../../services/auditService'
import { formatRupiah, formatTanggal } from '../../utils/formatters'
import { today } from '../../utils/autoFill'
import { syncBus } from '../../utils/syncBus'
import supabase from '../../services/supabaseClient'

const thisMonth = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`
}

// KPI Card component
function KPICard({ label, value, sub, icon: Icon, trend, color = 'blue', pulse }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   icon: 'text-blue-500',   border: 'border-blue-100' },
    green:  { bg: 'bg-green-50',  text: 'text-green-700',  icon: 'text-green-500',  border: 'border-green-100' },
    red:    { bg: 'bg-red-50',    text: 'text-red-700',    icon: 'text-red-500',    border: 'border-red-100' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  icon: 'text-amber-500',  border: 'border-amber-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-100' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-100' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-slideUp`}>
      {Icon && (
        <div className={`w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm relative`}>
          <Icon size={18} className={c.icon} />
          {pulse && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-green-400 animate-ping" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-bold uppercase tracking-wide opacity-60 ${c.text}`}>{label}</p>
        <p className={`text-xl font-extrabold ${c.text} mt-0.5`}>{value}</p>
        {sub && <p className={`text-xs opacity-60 mt-0.5 ${c.text}`}>{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`flex-shrink-0 ${trend >= 0 ? 'text-green-500' : 'text-red-400'}`}>
          {trend >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        </div>
      )}
    </div>
  )
}

export default function LaporanRingkasan() {
  const [loading, setLoading] = useState(false)
  const [ringkasan, setRingkasan] = useState(null)
  const [gajiTrend, setGajiTrend] = useState([])
  const [stokKritis, setStokKritis] = useState([])
  const [periodeStart, setPeriodeStart] = useState(thisMonth())
  const [periodeEnd, setPeriodeEnd] = useState(today())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const [ringkasanData, trendData, stokData] = await Promise.all([
        payrollService.getLaporanRingkasan(periodeStart, periodeEnd),
        reportService.getGajiTrend(now.getMonth()+1, now.getFullYear()),
        reportService.getStokKritisSemua(),
      ])
      setRingkasan(ringkasanData)
      setGajiTrend(trendData.map(g => ({
        periode: new Date(g.periode_mulai).toLocaleDateString('id-ID',{day:'numeric',month:'short'}),
        bersih: parseFloat(g.gaji_bersih||0),
      })))
      setStokKritis(stokData.slice(0,6))
    } catch(e) { toast.error(e.message) } finally { setLoading(false) }
  }, [periodeStart, periodeEnd])

  useEffect(() => { load() }, [])

  useEffect(() => {
    const unsubs = [
      syncBus.on('kasbon',   () => load()),
      syncBus.on('gaji',     () => load()),
      syncBus.on('presensi', () => load()),
      syncBus.on('lembur',   () => load()),
      syncBus.on('stok',     () => load()),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [periodeStart, periodeEnd])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan Ringkasan"
        subtitle={`${formatTanggal(periodeStart)} — ${formatTanggal(periodeEnd)}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={periodeStart} onChange={e => setPeriodeStart(e.target.value)} className="w-auto text-xs" />
            <span className="text-gray-400">—</span>
            <Input type="date" value={periodeEnd} onChange={e => setPeriodeEnd(e.target.value)} className="w-auto text-xs" />
            <Button icon={RefreshCw} onClick={load} loading={loading} size="sm">Perbarui</Button>
          </div>
        }
      />

      {ringkasan && (
        <>
          {/* ── BARIS 1: KPI UTAMA ─────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
            <KPICard label="Total Gaji Dibayar" value={formatRupiah(ringkasan.gaji.totalBersih)}
              icon={DollarSign} color="blue" sub={`${ringkasan.gaji.sudahDibayar} rekap`} pulse />
            <KPICard label="Tingkat Kehadiran" value={`${ringkasan.presensi.hadirRate}%`}
              icon={Users} color={ringkasan.presensi.hadirRate >= 80 ? 'green' : ringkasan.presensi.hadirRate >= 60 ? 'amber' : 'red'}
              sub={`${ringkasan.presensi.hadir} hadir / ${ringkasan.presensi.total} total`}
              trend={ringkasan.presensi.hadirRate - 80} />
            <KPICard label="Kasbon Outstanding" value={formatRupiah(ringkasan.kasbon.totalSisa)}
              icon={CreditCard} color={ringkasan.kasbon.outstanding > 0 ? 'amber' : 'green'}
              sub={ringkasan.kasbon.outstanding > 0 ? `${ringkasan.kasbon.outstanding} belum lunas` : '✓ Semua lunas'} />
            <KPICard label="Lembur Disetujui" value={`${ringkasan.lembur.totalJam.toFixed(1)} jam`}
              icon={Clock} color="purple" sub={formatRupiah(ringkasan.lembur.totalNilai)} />
          </div>

          {/* ── BARIS 2: DETAIL CARDS ──────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Kehadiran detail */}
            <Card title="Kehadiran">
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-semibold text-gray-700">{ringkasan.presensi.hadirRate}% hadir</span>
                    <span className="text-gray-400">{ringkasan.presensi.hadir}/{ringkasan.presensi.total}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-1000 ${
                      ringkasan.presensi.hadirRate >= 80 ? 'bg-green-500' : ringkasan.presensi.hadirRate >= 60 ? 'bg-amber-400' : 'bg-red-500'
                    }`} style={{ width: `${ringkasan.presensi.hadirRate}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="text-center p-2 bg-green-50 rounded-xl">
                    <p className="text-2xl font-extrabold text-green-700">{ringkasan.presensi.hadir}</p>
                    <p className="text-xs text-green-500">Hadir</p>
                  </div>
                  <div className="text-center p-2 bg-blue-50 rounded-xl">
                    <p className="text-2xl font-extrabold text-blue-700">{ringkasan.presensi.sedangBekerja}</p>
                    <p className="text-xs text-blue-500">Sedang Bekerja</p>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded-xl">
                    <p className="text-2xl font-extrabold text-red-600">{ringkasan.presensi.tidakHadir}</p>
                    <p className="text-xs text-red-400">Tidak Hadir</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Gaji summary */}
            <Card title="Penggajian Periode Ini">
              <div className="space-y-2.5">
                {[
                  { label: 'Gaji Bersih Dibayar', val: ringkasan.gaji.totalBersih, color: 'text-blue-700 font-bold' },
                  { label: 'Gaji Kotor', val: ringkasan.gaji.totalKotor, color: 'text-gray-600' },
                  { label: 'Total Kasbon Dipotong', val: ringkasan.gaji.totalPotonganKasbon, color: 'text-red-500' },
                  { label: 'Total Hari Kerja', val: null, extra: `${ringkasan.gaji.totalHariKerja} hari`, color: 'text-gray-600' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-500">{item.label}</span>
                    <span className={`text-sm ${item.color}`}>{item.val !== null ? formatRupiah(item.val) : item.extra}</span>
                  </div>
                ))}
                {ringkasan.gaji.draft > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-2.5 py-2 rounded-xl">
                    <AlertTriangle size={12} />
                    <span>{ringkasan.gaji.draft} gaji masih Draft — belum dibayar</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Kasbon & Lembur */}
            <Card title="Kasbon & Lembur">
              <div className="space-y-3">
                <div className="p-3 bg-orange-50 rounded-xl">
                  <p className="text-xs font-bold text-orange-600 uppercase mb-1">Kasbon Periode Ini</p>
                  <p className="text-xl font-extrabold text-orange-700">{ringkasan.kasbon.total}</p>
                  <div className="flex justify-between text-xs text-orange-500 mt-1">
                    <span>{ringkasan.kasbon.outstanding} outstanding</span>
                    <span>{formatRupiah(ringkasan.kasbon.totalSisa)} sisa</span>
                  </div>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl">
                  <p className="text-xs font-bold text-purple-600 uppercase mb-1">Lembur</p>
                  <p className="text-xl font-extrabold text-purple-700">{ringkasan.lembur.disetujui}/{ringkasan.lembur.total}</p>
                  <div className="flex justify-between text-xs text-purple-500 mt-1">
                    <span>disetujui/total</span>
                    <span>{ringkasan.lembur.totalJam.toFixed(1)} jam · {formatRupiah(ringkasan.lembur.totalNilai)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* ── BARIS 3: TREND + STOK KRITIS ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Trend Gaji Bersih (Mingguan)">
              {gajiTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={gajiTrend} margin={{top:5,right:10,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ede9fe" />
                    <XAxis dataKey="periode" tick={{fontSize:10}} />
                    <YAxis tick={{fontSize:10}} tickFormatter={v=>`${(v/1e6).toFixed(1)}jt`} />
                    <Tooltip formatter={v=>formatRupiah(v)} contentStyle={{borderRadius:'12px',fontSize:'12px'}} />
                    <Line type="monotone" dataKey="bersih" stroke="#6366f1" strokeWidth={2.5} dot={{r:3,fill:'#6366f1'}} name="Gaji Bersih" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-300 text-sm">Belum ada data gaji dibayar</div>
              )}
            </Card>

            <Card title={`Stok Kritis${stokKritis.length > 0 ? ` (${stokKritis.length})` : ''}`}>
              {stokKritis.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-300">
                  <CheckCircle size={28} className="text-green-300" />
                  <p className="text-sm text-green-500 font-medium">Semua stok aman ✓</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stokKritis.map((b, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2.5 bg-red-50 rounded-xl animate-slideUp"
                      style={{animationDelay:`${i*40}ms`}}>
                      <Package size={14} className="text-red-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{b.nama_barang}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{b.project?.nama_project?.slice(0,12)}</span>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-extrabold text-red-600">{b.stok_saat_ini}</p>
                        <p className="text-[10px] text-gray-400">min:{b.stok_minimal}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {!ringkasan && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <TrendingUp size={26} className="text-indigo-300" />
          </div>
          <p className="text-sm font-semibold">Klik Perbarui untuk memuat data</p>
        </div>
      )}
    </div>
  )
}
