import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Download, CheckCircle, Calendar, TrendingUp } from 'lucide-react'
import { Card, Table, PageHeader, SearchBar, Button, DropdownSelect } from '../common'
import { payrollService } from '../../services/payrollService'
import { projectService } from '../../services/projectService'
import { exportService } from '../../services/exportService'
import { formatTanggal, formatRupiah } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'
import { BankBadge } from '../ui/BankPicker'

const AUTO_REFRESH_MS = 60000

export default function PembayaranOtomatis() {
  const [data, setData] = useState([])
  const [karyawan, setKaryawan] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterKaryawan, setFilterKaryawan] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, k] = await Promise.all([
        payrollService.getPembayaranOtomatis({}),
        projectService.getKaryawan({ status_aktif: true }),
      ])
      setData(d)
      setKaryawan(k)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  // Sync real-time: reload saat halaman lain mengubah data
  useEffect(() => {
    const unsubs = [syncBus.on('gaji', () => load(true)), syncBus.on('kasbon', () => load(true))]
    return () => unsubs.forEach(fn => fn())
  }, [load])


  const filtered = data.filter(d => {
    const matchSearch = d.karyawan?.nama_karyawan?.toLowerCase().includes(search.toLowerCase())
    const matchK = filterKaryawan === 'all' || d.karyawan_id === parseInt(filterKaryawan)
    return matchSearch && matchK
  })

  const totalDibayar = filtered.reduce((s, d) => s + parseFloat(d.gaji_bersih || 0), 0)
  const totalKasbon = filtered.reduce((s, d) => s + parseFloat(d.total_potongan_kasbon || 0), 0)

  // Auto refresh
  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(), AUTO_REFRESH_MS)

  return (
    <div className="space-y-4">
      <PageHeader title="Riwayat Pembayaran"
        subtitle="Semua gaji yang sudah dibayar — otomatis tercatat setelah Bayar Semua"
        action={
          <Button variant="outline" icon={Download} size="sm"
            onClick={() => {
              exportService.exportExcel(filtered, [
                { header: 'Karyawan', render: r => r.karyawan?.nama_karyawan },
                { header: 'Periode', render: r => `${r.periode_mulai} s/d ${r.periode_selesai}` },
                { header: 'Hari Hadir', key: 'total_hari_hadir' },
                { header: 'Gaji Bersih', key: 'gaji_bersih' },
                { header: 'Kasbon Dipotong', key: 'total_potongan_kasbon' },
                { header: 'Metode', key: 'metode_pembayaran' },
                { header: 'Tanggal Bayar', key: 'tanggal_pembayaran' },
              ], 'riwayat-pembayaran')
              toast.success('Excel diunduh')
            }}>Export Excel</Button>
        } />

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={24} className="text-green-600" />
          <div>
            <p className="text-xs text-green-600">Total Terbayar</p>
            <p className="text-lg font-bold text-green-700">{formatRupiah(totalDibayar)}</p>
          </div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 flex items-center gap-3">
          <TrendingUp size={24} className="text-red-500" />
          <div>
            <p className="text-xs text-red-600">Total Kasbon Dipotong</p>
            <p className="text-lg font-bold text-red-700">{formatRupiah(totalKasbon)}</p>
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 flex items-center gap-3">
          <Calendar size={24} className="text-blue-600" />
          <div>
            <p className="text-xs text-blue-600">Total Transaksi</p>
            <p className="text-2xl font-bold text-blue-700">{filtered.length}</p>
          </div>
        </div>
      </div>

      <Card>
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Cari karyawan..." />
          </div>
          <DropdownSelect
            value={filterKaryawan}
            onChange={v => setFilterKaryawan(v)}
            className="min-w-[180px]"
            options={[
              { value: 'all', label: 'Semua Karyawan' },
              ...karyawan.map(k => ({ value: String(k.id), label: k.nama_karyawan })),
            ]}
          />
        </div>

        {filtered.length === 0 && !loading ? (
          <div className="text-center py-16 text-gray-400">
            <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Belum ada riwayat pembayaran</p>
            <p className="text-sm mt-1">Pembayaran akan muncul setelah klik "Bayar Semua" di halaman Gaji Mingguan</p>
          </div>
        ) : (
          <Table loading={loading} data={filtered} columns={[
            { header: 'Karyawan', render: r => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center text-xs font-bold text-green-600">
                  {r.karyawan?.nama_karyawan?.[0]}
                </div>
                <div>
                  <p className="font-medium">{r.karyawan?.nama_karyawan}</p>
                </div>
              </div>
            )},
            { header: 'Periode', render: r => (
              <span className="text-xs">{formatTanggal(r.periode_mulai)} – {formatTanggal(r.periode_selesai)}</span>
            )},
            { header: 'Hari', render: r => <span className="font-medium">{r.total_hari_hadir} hari</span> },
            { header: 'Gaji Bersih', render: r => <span className="font-bold text-green-700">{formatRupiah(r.gaji_bersih)}</span> },
            { header: 'Kasbon Dipotong', render: r => r.total_potongan_kasbon > 0
              ? <span className="text-red-500">−{formatRupiah(r.total_potongan_kasbon)}</span>
              : <span className="text-gray-400">-</span>
            },
            { header: 'Metode', render: r => (
              <BankBadge value={r.metode_pembayaran} />
            )},
            { header: 'Tgl Bayar', render: r => (
              <div className="flex items-center gap-1">
                <CheckCircle size={12} className="text-green-500" />
                <span className="text-sm">{formatTanggal(r.tanggal_pembayaran)}</span>
              </div>
            )},
          ]} />
        )}
      </Card>
    </div>
  )
}
