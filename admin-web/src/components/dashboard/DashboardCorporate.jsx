import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
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
  const [stats, setStats] = useState({ totalKaryawan: 0, totalProjectAktif: 0, presensiHariIni: 0, hadirHariIni: 0, belumAbsenHariIni: 0, totalKasbon: 0 })
  const [gajiTrend, setGajiTrend] = useState([])
  const [kehadiranStats, setKehadiranStats] = useState({ hadir: 0, sakit: 0, izin: 0, cuti: 0, libur: 0, alfa: 0 })
  const [recentGaji, setRecentGaji] = useState([])
  const [totalPendingGaji, setTotalPendingGaji] = useState(0)
  const [stokKritis, setStokKritis] = useState([])
  const [loading, setLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      // Pastikan hari-hari lewat yang belum tercatat sudah ditandai 'alfa'
      // dulu sebelum statistik dihitung, supaya datanya akurat.
      await payrollService.autoMarkAlfa().catch((e) => console.warn('[autoMarkAlfa]', e.message))

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
        periode_mulai: g.periode_mulai,
        gaji_bersih: parseFloat(g.gaji_bersih),
        gaji_kotor: parseFloat(g.gaji_kotor),
      })))
      setKehadiranStats(kehadiranData)
      setRecentGaji(gajiMingguanData.slice(0, 5))
      setTotalPendingGaji(gajiMingguanData.length)
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

  // Hadir / Alfa (tidak tercatat) dipisah biar jelas, sisanya (izin/sakit/cuti/libur) digabung
  const kehadiranPie = (() => {
    const hadir = kehadiranStats.hadir || 0
    const alfa = kehadiranStats.alfa || 0
    const lainnya = (kehadiranStats.sakit || 0) + (kehadiranStats.izin || 0) + (kehadiranStats.cuti || 0) + (kehadiranStats.libur || 0)
    return [
      hadir > 0 && { name: 'Hadir', value: hadir },
      alfa > 0 && { name: 'Alfa (Tidak Tercatat)', value: alfa },
      lainnya > 0 && { name: 'Izin/Sakit/Cuti/Libur', value: lainnya },
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
        <StatCard label="Hadir Hari Ini" value={`${stats.hadirHariIni}/${stats.totalKaryawan}`} icon={CheckCircle} color="purple" sub={stats.belumAbsenHariIni > 0 ? `${stats.belumAbsenHariIni} belum absen` : 'Semua sudah absen'} />
        <StatCard label="Total Kasbon Outstanding" value={formatRupiah(stats.totalKasbon)} icon={DollarSign} color="amber" sub="Belum lunas" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gaji Trend */}
        <Card title="Trend Gaji Mingguan" subtitle="Total gaji seluruh karyawan per minggu (periode mulai hari Minggu)">
          {gajiTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={gajiTrend} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="periode_mulai" tick={{ fontSize: 10 }} tickFormatter={v => formatTanggal(v)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}jt`} />
                <Tooltip formatter={v => formatRupiah(v)} labelFormatter={l => `Minggu mulai ${formatTanggal(l)}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="gaji_bersih" fill="#4f6fc7" name="Gaji Bersih" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gaji_kotor" fill="#93c5fd" name="Gaji Kotor" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[240px] flex items-center justify-center text-sm text-gray-400">
              Belum ada data gaji mingguan untuk ditampilkan
            </div>
          )}
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
        <Card title="Gaji Pending Verifikasi" action={<span className="text-xs text-blue-600 font-medium">{totalPendingGaji} rekap</span>}>
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
            {totalPendingGaji > recentGaji.length && (
              <p className="text-xs text-gray-400 text-center pt-1">
                Menampilkan {recentGaji.length} dari {totalPendingGaji} — lihat semua di menu Gaji Mingguan
              </p>
            )}
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
                  <p className="text-xs text-gray-500">{b.kode_barang}</p>
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
