import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Package, AlertTriangle, ArrowDownRight, ArrowUpRight, Download, RefreshCw, Boxes } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, ComposedChart } from 'recharts'
import { Card, Button, Table, PageHeader, AlertInPage, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { projectService } from '../../services/projectService'
import { useProject } from '../../context/ProjectContext'
import { exportService } from '../../services/exportService'
import { formatTanggal, formatRupiah } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'

const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

// Bangun kartu stok bulanan satu barang (stok awal/masuk/keluar/stok akhir per bulan)
// dihitung mundur dari stok_saat_ini (live) memakai seluruh riwayat transaksi.
function buildKartuStok(barangId, stokSaatIni, allMasuk, allKeluar, tahun) {
  const txns = [
    ...allMasuk.filter(t => t.barang_id === barangId).map(t => ({ date: new Date(t.created_at), qty: parseFloat(t.jumlah || 0) })),
    ...allKeluar.filter(t => t.barang_id === barangId).map(t => ({ date: new Date(t.created_at), qty: -parseFloat(t.jumlah || 0) })),
  ].sort((a, b) => a.date - b.date)
  const netAll = txns.reduce((s, t) => s + t.qty, 0)
  const stokBaseline = parseFloat(stokSaatIni || 0) - netAll // stok sebelum transaksi pertama tercatat

  const rows = []
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(tahun, m, 1)
    const monthEnd = new Date(tahun, m + 1, 1)
    const stokAwal = stokBaseline + txns.filter(t => t.date < monthStart).reduce((s, t) => s + t.qty, 0)
    const txMonth = txns.filter(t => t.date >= monthStart && t.date < monthEnd)
    const masuk = txMonth.filter(t => t.qty > 0).reduce((s, t) => s + t.qty, 0)
    const keluar = -txMonth.filter(t => t.qty < 0).reduce((s, t) => s + t.qty, 0)
    rows.push({ bulan: m, stokAwal, masuk, keluar, stokAkhir: stokAwal + masuk - keluar })
  }
  return rows
}

export default function LaporanBarang() {
  const { projects: ctxProjects, activeProject } = useProject()
  const [fetchedProjects, setFetchedProjects] = useState([])
  const projects = ctxProjects.length ? ctxProjects : fetchedProjects
  const [selectedProject, setSelectedProject] = useState(activeProject?.id ? String(activeProject.id) : '')
  const [selectedBarang, setSelectedBarang] = useState('') // '' = keseluruhan
  const [tahun, setTahun] = useState(currentYear)
  const [barang, setBarang] = useState([])
  const [allMasuk, setAllMasuk] = useState([])
  const [allKeluar, setAllKeluar] = useState([])
  const [stokKritis, setStokKritis] = useState([])
  const [loading, setLoading] = useState(false)

  // Cadangan bila daftar project dari context belum/gagal dimuat
  useEffect(() => {
    if (ctxProjects.length) return
    projectService.getProjects().then(setFetchedProjects).catch(e => toast.error(e.message))
  }, [ctxProjects.length])

  // Default ke project aktif (dipilih di header) agar laporan langsung tampil
  useEffect(() => {
    if (!selectedProject && activeProject?.id) setSelectedProject(String(activeProject.id))
  }, [activeProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!selectedProject) return
    setLoading(true)
    try {
      const pid = parseInt(selectedProject)
      const [brg, sm, sk, kritis] = await Promise.all([
        inventoryService.getBarang(pid),
        inventoryService.getStokMasuk(pid),
        inventoryService.getStokKeluar(pid),
        inventoryService.getStokKritis(pid),
      ])
      setBarang(brg)
      setAllMasuk(sm)
      setAllKeluar(sk)
      setStokKritis(kritis)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [selectedProject])

  // Auto-muat begitu project dipilih — barang & data langsung tersedia tanpa klik tombol
  useEffect(() => { load() }, [load])

  // Sinkron real-time: refresh otomatis saat ada stok masuk/keluar/barang baru dari halaman lain
  // (hanya saat tab terlihat & halaman aktif; bila tersembunyi ditandai lalu dimuat saat dibuka lagi)
  const requestLoad = usePolling(() => load(), 0)
  useEffect(() => {
    if (!selectedProject) return
    return syncBus.on('stok', () => requestLoad())
  }, [selectedProject, requestLoad])

  const project = projects.find(p => p.id === parseInt(selectedProject))
  const barangDetail = barang.find(b => b.id === parseInt(selectedBarang))

  // ── Mode keseluruhan: rekap bulanan lintas semua barang ──
  const rekapBulanan = BULAN.map((label, m) => {
    const monthStart = new Date(tahun, m, 1)
    const monthEnd = new Date(tahun, m + 1, 1)
    const masukBulan = allMasuk.filter(r => { const d = new Date(r.created_at); return d >= monthStart && d < monthEnd })
    const keluarBulan = allKeluar.filter(r => { const d = new Date(r.created_at); return d >= monthStart && d < monthEnd })
    return {
      bulan: label,
      trxMasuk: masukBulan.length,
      qtyMasuk: masukBulan.reduce((s, r) => s + parseFloat(r.jumlah || 0), 0),
      trxKeluar: keluarBulan.length,
      qtyKeluar: keluarBulan.reduce((s, r) => s + parseFloat(r.jumlah || 0), 0),
    }
  })
  const totalQtyMasukTahun = rekapBulanan.reduce((s, r) => s + r.qtyMasuk, 0)
  const totalQtyKeluarTahun = rekapBulanan.reduce((s, r) => s + r.qtyKeluar, 0)

  const chartBarang = [...barang]
    .sort((a, b) => b.stok_saat_ini - a.stok_saat_ini)
    .slice(0, 10)
    .map(b => ({ name: b.nama_barang?.slice(0, 12), stok: b.stok_saat_ini, minimal: b.stok_minimal }))

  // ── Mode per barang: kartu stok bulanan ──
  const kartuStok = barangDetail ? buildKartuStok(barangDetail.id, barangDetail.stok_saat_ini, allMasuk, allKeluar, tahun) : []
  const totalMasukTahunBarang = kartuStok.reduce((s, r) => s + r.masuk, 0)
  const totalKeluarTahunBarang = kartuStok.reduce((s, r) => s + r.keluar, 0)
  const bulanIni = new Date().getMonth(), tahunIni = new Date().getFullYear()
  const bulanSekarang = tahun === tahunIni ? kartuStok[bulanIni] : null
  const bulanLalu = tahun === tahunIni ? (bulanIni > 0 ? kartuStok[bulanIni - 1] : null) : null

  const masukBarangTahun = allMasuk.filter(r => r.barang_id === barangDetail?.id && new Date(r.created_at).getFullYear() === tahun)
  const keluarBarangTahun = allKeluar.filter(r => r.barang_id === barangDetail?.id && new Date(r.created_at).getFullYear() === tahun)

  const exportCSV = async () => {
    if (selectedBarang && barangDetail) {
      const rows = kartuStok.map(r => ({ ...r, bulanLabel: BULAN[r.bulan] }))
      await exportService.exportKartuStokExcel(rows, barangDetail, tahun, {
        masuk: masukBarangTahun, keluar: keluarBarangTahun, projectName: project?.nama_project,
      })
      return toast.success('Excel diunduh')
    }
    if (barang.length === 0) return toast.error('Tidak ada data untuk diekspor')
    await exportService.exportLaporanBarangBulananExcel(rekapBulanan, project?.nama_project, tahun, { barang })
    toast.success('Excel diunduh')
  }

  return (
    <div className="space-y-5">
      <PageHeader title="History Barang" subtitle="Stok masuk, keluar & sisa per bulan — per barang atau keseluruhan, sinkron otomatis dengan Stok Masuk/Keluar" />

      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Project</label>
            <DropdownSelect
              value={selectedProject}
              onChange={v => { setSelectedProject(v); setSelectedBarang('') }}
              options={[
                { value: '', label: 'Pilih project...' },
                ...projects.map(p => ({ value: String(p.id), label: `${p.nama_project} (${p.kode_project})` })),
              ]}
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Barang</label>
            <DropdownSelect
              searchable
              value={selectedBarang}
              onChange={v => setSelectedBarang(v)}
              options={[
                { value: '', label: 'Keseluruhan Stok' },
                ...barang.map(b => ({ value: String(b.id), label: b.nama_barang })),
              ]}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Tahun</label>
            <DropdownSelect
              value={String(tahun)}
              onChange={v => setTahun(parseInt(v))}
              options={YEAR_OPTIONS.map(y => ({ value: String(y), label: String(y) }))}
              className="min-w-[110px]"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" icon={RefreshCw} onClick={load} loading={loading} disabled={!selectedProject}>Refresh</Button>
            {barang.length > 0 && <Button variant="outline" icon={Download} onClick={exportCSV}>Export Excel</Button>}
          </div>
        </div>
      </Card>

      {!selectedProject && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-300">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center">
            <Package size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-400">Pilih project untuk melihat laporan</p>
        </div>
      )}

      {selectedProject && !selectedBarang && (
        <>
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-emerald-200 text-xs font-bold uppercase tracking-widest">{project?.kode_project}</span>
                <h2 className="text-2xl font-extrabold mt-1">{project?.nama_project}</h2>
                <p className="text-emerald-200 text-sm mt-1">Rekap tahun {tahun} — {barang.length} jenis barang</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-emerald-200 text-xs">Qty Masuk / Keluar {tahun}</p>
                <p className="text-xl font-extrabold">+{totalQtyMasukTahun} / -{totalQtyKeluarTahun}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
            {[
              { label: 'Jenis Barang', val: barang.length, color: 'bg-blue-50 border-blue-100 text-blue-700', icon: Package },
              { label: `Qty Masuk ${tahun}`, val: totalQtyMasukTahun, color: 'bg-green-50 border-green-100 text-green-700', icon: ArrowDownRight },
              { label: `Qty Keluar ${tahun}`, val: totalQtyKeluarTahun, color: 'bg-red-50 border-red-100 text-red-700', icon: ArrowUpRight },
              { label: 'Stok Kritis', val: stokKritis.length, color: stokKritis.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-500', icon: AlertTriangle },
            ].map((s, i) => (
              <div key={i} className={`rounded-2xl border p-4 flex items-center gap-3 transition-all hover:shadow-md ${s.color} animate-slideUp`}>
                <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <s.icon size={16} className="opacity-80" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70">{s.label}</p>
                  <p className="text-xl font-extrabold">{s.val}</p>
                </div>
              </div>
            ))}
          </div>

          {stokKritis.length > 0 && (
            <AlertInPage
              type="warning"
              title={`${stokKritis.length} barang stok kritis`}
              message={stokKritis.slice(0,4).map(b => `${b.nama_barang} (${b.stok_saat_ini}/${b.stok_minimal})`).join(', ') + (stokKritis.length > 4 ? ` +${stokKritis.length-4} lainnya` : '')}
            />
          )}

          <Card title={`Rekap Bulanan ${tahun} — Perbandingan Masuk & Keluar`}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rekapBulanan} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="qtyMasuk" name="Qty Masuk" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="qtyKeluar" name="Qty Keluar" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={`Tabel Rekap Bulanan ${tahun}`}>
            <Table data={rekapBulanan} columns={[
              { header: 'Bulan', render: r => <span className="font-semibold">{r.bulan} {tahun}</span> },
              { header: 'Transaksi Masuk', render: r => r.trxMasuk },
              { header: 'Qty Masuk', render: r => <span className="font-semibold text-green-600">+{r.qtyMasuk}</span> },
              { header: 'Transaksi Keluar', render: r => r.trxKeluar },
              { header: 'Qty Keluar', render: r => <span className="font-semibold text-red-500">-{r.qtyKeluar}</span> },
            ]} />
            <p className="text-xs text-gray-400 mt-2">*Qty digabung lintas satuan barang. Pilih satu barang di atas untuk kartu stok bulanan yang detail (stok awal/akhir).</p>
          </Card>

          <Card title="Kondisi Stok per Barang (Top 10)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartBarang} margin={{ top: 0, right: 5, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="stok" name="Stok Saat Ini" fill="#34d399" radius={[4,4,0,0]} />
                <Bar dataKey="minimal" name="Stok Minimal" fill="#fca5a5" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={`Daftar Semua Barang (${barang.length})`}>
            <Table
              data={barang}
              columns={[
                { header: 'Kode', render: r => <span className="font-mono text-xs text-gray-400">{r.kode_barang}</span> },
                { header: 'Nama Barang', render: r => (
                  <button type="button" className="text-left hover:underline decoration-dashed" onClick={() => setSelectedBarang(String(r.id))}>
                    <p className="font-semibold text-sm">{r.nama_barang}</p>
                    <p className="text-xs text-gray-400">{r.kategori_barang?.nama_kategori}</p>
                  </button>
                ) },
                { header: 'Stok', render: r => (
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-extrabold ${r.stok_saat_ini <= r.stok_minimal ? 'text-red-600' : 'text-green-600'}`}>{r.stok_saat_ini}</span>
                    <span className="text-xs text-gray-400">{r.satuan_barang?.singkatan}</span>
                  </div>
                ) },
                { header: 'Min', render: r => <span className="text-xs text-gray-400">{r.stok_minimal}</span> },
                { header: 'Status', render: r => r.stok_saat_ini <= r.stok_minimal
                  ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold"><AlertTriangle size={10}/> Kritis</span>
                  : <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Normal</span> },
              ]}
            />
          </Card>
        </>
      )}

      {barangDetail && (
        <>
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-blue-200 text-xs font-bold uppercase tracking-widest">{barangDetail.kode_barang}</span>
                <h2 className="text-2xl font-extrabold mt-1">{barangDetail.nama_barang}</h2>
                <p className="text-blue-200 text-sm mt-1">{barangDetail.kategori_barang?.nama_kategori} · Kartu stok tahun {tahun}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-blue-200 text-xs">Stok Saat Ini (live)</p>
                <p className="text-2xl font-extrabold">{barangDetail.stok_saat_ini} {barangDetail.satuan_barang?.singkatan}</p>
                <p className="text-blue-200 text-xs mt-0.5">min: {barangDetail.stok_minimal}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
            {[
              { label: `Masuk ${tahun}`, val: `${totalMasukTahunBarang} ${barangDetail.satuan_barang?.singkatan||''}`, color: 'bg-green-50 border-green-100 text-green-700', icon: ArrowDownRight },
              { label: `Keluar ${tahun}`, val: `${totalKeluarTahunBarang} ${barangDetail.satuan_barang?.singkatan||''}`, color: 'bg-red-50 border-red-100 text-red-700', icon: ArrowUpRight },
              { label: 'Transaksi Masuk', val: masukBarangTahun.length, color: 'bg-blue-50 border-blue-100 text-blue-700', icon: Boxes },
              { label: 'Transaksi Keluar', val: keluarBarangTahun.length, color: 'bg-orange-50 border-orange-100 text-orange-700', icon: Boxes },
            ].map((s, i) => (
              <div key={i} className={`rounded-2xl border p-4 flex items-center gap-3 transition-all hover:shadow-md ${s.color} animate-slideUp`}>
                <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <s.icon size={16} className="opacity-80" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70">{s.label}</p>
                  <p className="text-xl font-extrabold">{s.val}</p>
                </div>
              </div>
            ))}
          </div>

          {bulanSekarang && bulanLalu && (
            <Card title="Perbandingan Bulan Ini vs Bulan Lalu">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-400 mb-1">{BULAN[bulanIni-1]} {tahun}</p>
                  <p className="text-lg font-bold text-gray-700">{bulanLalu.stokAkhir} {barangDetail.satuan_barang?.singkatan}</p>
                  <p className="text-xs text-gray-400">stok akhir</p>
                </div>
                <div className="flex items-center justify-center">
                  <span className={`text-2xl font-extrabold ${bulanSekarang.stokAkhir >= bulanLalu.stokAkhir ? 'text-green-600' : 'text-red-500'}`}>
                    {bulanSekarang.stokAkhir >= bulanLalu.stokAkhir ? '▲' : '▼'} {Math.abs(bulanSekarang.stokAkhir - bulanLalu.stokAkhir)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">{BULAN[bulanIni]} {tahun} (berjalan)</p>
                  <p className="text-lg font-bold text-gray-700">{bulanSekarang.stokAkhir} {barangDetail.satuan_barang?.singkatan}</p>
                  <p className="text-xs text-gray-400">stok akhir</p>
                </div>
              </div>
            </Card>
          )}

          <Card title={`Kartu Stok Bulanan ${tahun}`}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={kartuStok.map(r => ({ ...r, bulan: BULAN[r.bulan] }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="masuk" name="Masuk" fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="keluar" name="Keluar" fill="#ef4444" radius={[3,3,0,0]} />
                <Line type="monotone" dataKey="stokAkhir" name="Stok Akhir" stroke="#2563eb" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-3">
              <Table data={kartuStok} columns={[
                { header: 'Bulan', render: r => (
                  <span className={`font-semibold ${tahun === tahunIni && r.bulan === bulanIni ? 'text-blue-600' : ''}`}>
                    {BULAN[r.bulan]} {tahun}{tahun === tahunIni && r.bulan === bulanIni ? ' (berjalan)' : ''}
                  </span>
                ) },
                { header: 'Stok Awal', render: r => <span className="text-gray-600">{r.stokAwal}</span> },
                { header: 'Masuk', render: r => <span className="font-semibold text-green-600">+{r.masuk}</span> },
                { header: 'Keluar', render: r => <span className="font-semibold text-red-500">-{r.keluar}</span> },
                { header: 'Stok Akhir', render: r => <span className="font-bold">{r.stokAkhir} {barangDetail.satuan_barang?.singkatan}</span> },
              ]} rowClassName={r => tahun === tahunIni && r.bulan === bulanIni ? 'bg-blue-50/50' : ''} />
            </div>
          </Card>

          <Card title={`Riwayat Masuk ${tahun} (${masukBarangTahun.length})`}>
            <div className="max-h-80 overflow-y-auto">
              <Table data={masukBarangTahun} emptyMessage="Belum ada stok masuk di tahun ini" columns={[
                { header: 'Tanggal', render: r => <span className="whitespace-nowrap">{formatTanggal(r.created_at)}</span> },
                { header: 'Jumlah', render: r => <span className="font-semibold text-green-600 whitespace-nowrap">+{r.jumlah} {barangDetail.satuan_barang?.singkatan}</span> },
                { header: 'Harga Satuan', render: r => formatRupiah(r.harga_satuan) },
                { header: 'Total', render: r => <span className="font-semibold">{formatRupiah(r.total_harga)}</span> },
                { header: 'Supplier / Sumber', render: r => r.sumber || '-' },
                { header: 'No. Referensi', render: r => <span className="font-mono text-xs">{r.nomor_referensi || '-'}</span> },
                { header: 'Catatan', render: r => <span className="text-xs text-gray-500">{r.catatan || '-'}</span> },
              ]} />
            </div>
          </Card>
          <Card title={`Riwayat Keluar ${tahun} (${keluarBarangTahun.length})`}>
            <div className="max-h-80 overflow-y-auto">
              <Table data={keluarBarangTahun} emptyMessage="Belum ada stok keluar di tahun ini" columns={[
                { header: 'Tanggal', render: r => <span className="whitespace-nowrap">{formatTanggal(r.created_at)}</span> },
                { header: 'Jumlah', render: r => <span className="font-semibold text-red-500 whitespace-nowrap">-{r.jumlah} {barangDetail.satuan_barang?.singkatan}</span> },
                { header: 'Tujuan', render: r => r.tujuan || '-' },
                { header: 'No. Referensi', render: r => <span className="font-mono text-xs">{r.nomor_referensi || '-'}</span> },
                { header: 'Catatan', render: r => <span className="text-xs text-gray-500">{r.catatan || '-'}</span> },
              ]} />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
