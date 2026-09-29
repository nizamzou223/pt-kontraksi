import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Users, Briefcase, DollarSign, Package, Clock, AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react'
import { StatCard, LoadingSpinner, Card } from '../common'
import { projectService } from '../../services/projectService'
import { payrollService } from '../../services/payrollService'
import { reportService } from '../../services/auditService'
import { formatRupiah, formatTanggal, getStatusColor, formatNamaStatus } from '../../utils/formatters'
import { BULAN } from '../../utils/constants'
import { syncBus } from '../../utils/syncBus'

const COLORS = ['#10b981', '#ef4444', '#6784d8', '#f59e0b', '#8b5cf6', '#6b7280']

export default function DashboardCorporate() {
  const [stats, setStats] = useState({ totalKaryawan: 0, totalProjectAktif: 0, presensiHariIni: 0, totalKasbon: 0 })
  const [gajiTrend, setGajiTrend] = useState([])
  const [kehadiranStats, setKehadiranStats] = useState({ hadir: 0, sakit: 0, izin: 0, cuti: 0, libur: 0, alfa: 0 })
  const [recentGaji, setRecentGaji] = useState([])
  const [stokKritis, setStokKritis] = useState([])
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const [statsData, gajiData, kehadiranData, gajiMingguanData, stokData] = await Promise.all([
        projectService.getDashboardStats(),
        reportService.getGajiTrend(now.getMonth() + 1, now.getFullYear()),
        reportService.getKehadiranStats(null, now.getMonth() + 1, now.getFullYear()),
        payrollService.getGajiMingguan({ status: 'draft' }),
        reportService.getStokKritisSemua(),
      ])
      setStats(statsData)
      setGajiTrend(gajiData.map(g => ({
        periode: g.periode_mulai,
        gaji_bersih: parseFloat(g.gaji_bersih),
        gaji_kotor: parseFloat(g.gaji_kotor),
      })))
      setKehadiranStats(kehadiranData)
      setRecentGaji(gajiMingguanData.slice(0, 5))
      setStokKritis(stokData.slice(0, 5))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // Auto refresh tiap 30 detik — hanya saat tab terlihat & dashboard sedang dibuka
  usePolling(() => loadDashboard(), 30000)

  // Merge semua non-hadir menjadi satu bucket "Tidak Hadir"
  const kehadiranPie = (() => {
    const hadir = kehadiranStats.hadir || 0
    const tidakHadir = Object.entries(kehadiranStats)
      .filter(([k]) => k !== 'hadir')
      .reduce((s, [, v]) => s + (v || 0), 0)
    return [
      hadir > 0 && { name: 'Hadir', value: hadir },
      tidakHadir > 0 && { name: 'Tidak Hadir', value: tidakHadir },
    ].filter(Boolean)
  })()

  if (loading) return <LoadingSpinner text="Memuat dashboard..." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard Corporate</h1>
        <p className="text-sm text-gray-500">Ringkasan operasional PT Krakatau Indah</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Karyawan Aktif" value={stats.totalKaryawan} icon={Users} color="blue" sub="Karyawan aktif" />
        <StatCard label="Project Aktif" value={stats.totalProjectAktif} icon={Briefcase} color="green" sub="Project berjalan" />
        <StatCard label="Presensi Hari Ini" value={stats.presensiHariIni} icon={CheckCircle} color="purple" sub={formatTanggal(new Date().toISOString())} />
        <StatCard label="Total Kasbon Outstanding" value={formatRupiah(stats.totalKasbon)} icon={DollarSign} color="amber" sub="Belum lunas" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gaji Trend */}
        <Card title="Trend Gaji Mingguan">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={gajiTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="periode" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}jt`} />
              <Tooltip formatter={v => formatRupiah(v)} labelFormatter={l => `Mulai: ${formatTanggal(l)}`} />
              <Bar dataKey="gaji_bersih" fill="#4f6fc7" name="Gaji Bersih" radius={[4, 4, 0, 0]} />
              <Bar dataKey="gaji_kotor" fill="#93c5fd" name="Gaji Kotor" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Kehadiran */}
        <Card title={`Statistik Kehadiran - ${BULAN[new Date().getMonth()]}`}>
          {kehadiranPie.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={kehadiranPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                    {kehadiranPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {kehadiranPie.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">Belum ada data kehadiran</p>}
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Gaji */}
        <Card title="Gaji Pending Verifikasi" action={<span className="text-xs text-blue-600 font-medium">{recentGaji.length} rekap</span>}>
          <div className="space-y-3">
            {recentGaji.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Tidak ada gaji pending</p>
            ) : recentGaji.map(g => (
              <div key={g.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{g.karyawan?.nama_karyawan}</p>
                  <p className="text-xs text-gray-500">{formatTanggal(g.periode_mulai)} - {formatTanggal(g.periode_selesai)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{formatRupiah(g.gaji_bersih)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(g.status)}`}>{formatNamaStatus(g.status)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Stok Kritis */}
        <Card title="Alert Stok Kritis" action={stokKritis.length > 0 && <span className="text-xs text-red-600 font-medium">{stokKritis.length} item</span>}>
          <div className="space-y-3">
            {stokKritis.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 justify-center py-4">
                <CheckCircle size={16} />
                <span className="text-sm">Semua stok aman</span>
              </div>
            ) : stokKritis.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.nama_barang}</p>
                  <p className="text-xs text-gray-500">{b.project?.nama_project}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold text-red-600">{b.stok_saat_ini} {b.satuan_barang?.singkatan}</p>
                  <p className="text-gray-400">min: {b.stok_minimal}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
