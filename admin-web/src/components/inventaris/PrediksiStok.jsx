import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Brain, AlertTriangle, PackageX, RefreshCw, BarChart2 } from 'lucide-react'
import { Card, Table, PageHeader, DropdownSelect, Modal } from '../common'
import { predictionService } from '../../services/predictionService'

const HORIZON_OPTIONS = [
  { value: '2', label: '2 minggu ke depan' },
  { value: '4', label: '4 minggu ke depan' },
  { value: '8', label: '8 minggu ke depan' },
]

function getStatus(r) {
  if (r.insufficientData) return { label: 'Data Kurang', color: 'bg-gray-100 text-gray-600', order: 3 }
  if (r.akanHabis) return { label: 'Berpotensi Habis', color: 'bg-red-100 text-red-800', order: 0 }
  if (r.akanKritis) return { label: 'Berpotensi Kritis', color: 'bg-orange-100 text-orange-800', order: 1 }
  return { label: 'Aman', color: 'bg-green-100 text-green-800', order: 2 }
}

export default function PrediksiStok() {
  const [horizon, setHorizon] = useState('4')
  const [hasil, setHasil] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await predictionService.prediksiSemuaBarang({ horizon: parseInt(horizon) })
      setHasil(data)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [horizon])

  useEffect(() => { load() }, [load])

  const totalKritis = hasil.filter(r => r.akanKritis).length
  const totalHabis = hasil.filter(r => r.akanHabis).length
  const totalDianalisis = hasil.filter(r => !r.insufficientData).length

  const sorted = [...hasil].sort((a, b) => getStatus(a).order - getStatus(b).order)

  const chartData = detail ? buildChartData(detail) : []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prediksi Stok"
        subtitle="Machine Learning · Random Forest Regressor — proyeksi kebutuhan barang dari histori pemakaian"
        action={
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={<Brain size={20} className="text-blue-600" />} bg="bg-blue-50 border-blue-100"
          label="Barang Dianalisis" value={totalDianalisis} textColor="text-blue-700" />
        <StatCard icon={<AlertTriangle size={20} className="text-orange-600" />} bg="bg-orange-50 border-orange-100"
          label="Berpotensi Kritis" value={totalKritis} textColor="text-orange-700" />
        <StatCard icon={<PackageX size={20} className="text-red-600" />} bg="bg-red-50 border-red-100"
          label="Berpotensi Habis" value={totalHabis} textColor="text-red-700" />
      </div>

      {(totalKritis + totalHabis) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            Model memproyeksikan <strong>{totalKritis + totalHabis} barang</strong> akan mendekati atau melewati stok minimal dalam {horizon} minggu ke depan — pertimbangkan pengadaan lebih awal.
          </p>
        </div>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row gap-2 mb-4 sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">Proyeksi dihitung dari histori pemakaian (stok keluar) 26 minggu terakhir per barang.</p>
          <DropdownSelect value={horizon} onChange={setHorizon} className="sm:min-w-[190px]" options={HORIZON_OPTIONS} />
        </div>

        <Table
          loading={loading}
          data={sorted}
          emptyMessage="Belum ada data barang pada project ini"
          columns={[
            {
              header: 'Barang',
              render: r => (
                <div>
                  <p className="font-semibold text-sm">{r.barang.nama_barang}</p>
                  <p className="text-xs text-gray-400">{r.barang.kode_barang}</p>
                </div>
              )
            },
            {
              header: 'Rata-rata / Minggu',
              render: r => <span className="text-sm text-gray-600">{r.rataRataPerMinggu.toFixed(1)} {r.barang.satuan_barang?.singkatan}</span>
            },
            {
              header: `Prediksi Kebutuhan (${horizon}mgg)`,
              render: r => (
                <span className="text-sm font-bold text-blue-700">
                  {r.totalPrediksiKebutuhan} {r.barang.satuan_barang?.singkatan}
                </span>
              )
            },
            {
              header: 'Stok Saat Ini',
              render: r => <span className="text-sm text-gray-700">{r.barang.stok_saat_ini} {r.barang.satuan_barang?.singkatan}</span>
            },
            {
              header: 'Proyeksi Stok Akhir',
              render: r => {
                const s = getStatus(r)
                const color = s.label === 'Aman' ? 'text-green-600' : s.label === 'Data Kurang' ? 'text-gray-400' : 'text-red-600'
                return <span className={`text-sm font-bold ${color}`}>{r.proyeksiStokAkhir} {r.barang.satuan_barang?.singkatan}</span>
              }
            },
            {
              header: 'Status',
              render: r => {
                const s = getStatus(r)
                return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span>
              }
            },
            {
              header: '',
              render: r => (
                <button onClick={() => setDetail(r)} title="Lihat grafik prediksi"
                  className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                  <BarChart2 size={16} />
                </button>
              )
            },
          ]}
        />
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Grafik Prediksi Pemakaian" size="lg">
        {detail && (
          <div className="space-y-3">
            <div>
              <p className="font-bold text-gray-800">{detail.barang.nama_barang}</p>
              <p className="text-xs text-gray-400">
                Metode: {detail.metode} · Stok saat ini: {detail.barang.stok_saat_ini} {detail.barang.satuan_barang?.singkatan}
              </p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="historis" name="Histori Pemakaian" stroke="#4f6fc7" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
                  <Line type="monotone" dataKey="prediksi" name="Prediksi (ML)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {detail.insufficientData && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500">
                  Histori pemakaian barang ini masih terlalu sedikit untuk melatih model Random Forest secara andal, sehingga prediksi memakai rata-rata sederhana. Prediksi akan lebih akurat setelah tercatat lebih banyak transaksi stok keluar.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// Gabungkan histori + prediksi jadi satu deret untuk chart, dengan titik
// sambung (histori terakhir) supaya garis prediksi terlihat menyambung.
function buildChartData(detail) {
  const { series, prediksi } = detail
  const histLabels = series.map((_, i) => `M-${series.length - i}`)
  const rows = series.map((v, i) => ({ label: histLabels[i], historis: v, prediksi: null }))
  if (rows.length) rows[rows.length - 1].prediksi = rows[rows.length - 1].historis
  prediksi.forEach((v, i) => rows.push({ label: `P+${i + 1}`, historis: null, prediksi: v }))
  return rows
}

function StatCard({ icon, bg, label, value, textColor }) {
  return (
    <div className={`border rounded-2xl p-4 flex items-center gap-3 ${bg}`}>
      <div className="w-10 h-10 bg-white/60 rounded-xl flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${textColor} opacity-80`}>{label}</p>
        <p className={`font-extrabold text-2xl ${textColor}`}>{value}</p>
      </div>
    </div>
  )
}
