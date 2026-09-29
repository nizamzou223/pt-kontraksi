import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Wallet, TrendingDown, Download, RefreshCw, Receipt, Coins } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, Button, Table, PageHeader, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { projectService } from '../../services/projectService'
import { exportService } from '../../services/exportService'
import { useProject } from '../../context/ProjectContext'
import { formatRupiah, formatTanggal } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'

const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

export default function LaporanUang() {
  const { projects: ctxProjects, activeProject } = useProject()
  const [fetchedProjects, setFetchedProjects] = useState([])
  const projects = ctxProjects.length ? ctxProjects : fetchedProjects
  const [selectedProject, setSelectedProject] = useState(activeProject?.id ? String(activeProject.id) : '')
  const [selectedBarang, setSelectedBarang] = useState('') // '' = keseluruhan
  const [tahun, setTahun] = useState(currentYear)
  const [barang, setBarang] = useState([])
  const [allMasuk, setAllMasuk] = useState([])
  const [loading, setLoading] = useState(false)
  const [bulanFilter, setBulanFilter] = useState('') // '' = semua bulan (rincian pembelian)

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
      const [brg, sm] = await Promise.all([
        inventoryService.getBarang(pid),
        inventoryService.getStokMasuk(pid),
      ])
      setBarang(brg)
      setAllMasuk(sm)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [selectedProject])

  // Auto-muat begitu project dipilih
  useEffect(() => { load() }, [load])

  // Sinkron real-time dengan Stok Masuk (nilai pembelian ikut update otomatis)
  // (hanya saat tab terlihat & halaman aktif; bila tersembunyi ditandai lalu dimuat saat dibuka lagi)
  const requestLoad = usePolling(() => load(), 0)
  useEffect(() => {
    if (!selectedProject) return
    return syncBus.on('stok', () => requestLoad())
  }, [selectedProject, requestLoad])

  const project = projects.find(p => p.id === parseInt(selectedProject))
  const barangDetail = barang.find(b => b.id === parseInt(selectedBarang))

  const masukTahun = allMasuk.filter(r => new Date(r.created_at).getFullYear() === tahun)

  // ── Mode keseluruhan: rekap bulanan nilai pembelian ──
  const rekapBulanan = BULAN.map((label, m) => {
    const monthStart = new Date(tahun, m, 1)
    const monthEnd = new Date(tahun, m + 1, 1)
    const rows = allMasuk.filter(r => { const d = new Date(r.created_at); return d >= monthStart && d < monthEnd })
    const nilai = rows.reduce((s, r) => s + parseFloat(r.total_harga || 0), 0)
    // Ringkas barang yang dibeli bulan ini: nama + total qty + total nilai
    const perBarang = {}
    rows.forEach(r => {
      const k = r.barang_id
      if (!perBarang[k]) perBarang[k] = { nama: r.barang?.nama_barang || '-', satuan: r.barang?.satuan_barang?.singkatan || '', qty: 0, nilai: 0 }
      perBarang[k].qty += Number(r.jumlah || 0)
      perBarang[k].nilai += parseFloat(r.total_harga || 0)
    })
    const barangDibeli = Object.values(perBarang).sort((a, b) => b.nilai - a.nilai)
    return { idx: m, bulan: label, trx: rows.length, nilai, rataRata: rows.length > 0 ? nilai / rows.length : 0, barangDibeli }
  })
  const rincianPembelian = bulanFilter === ''
    ? masukTahun
    : masukTahun.filter(r => new Date(r.created_at).getMonth() === parseInt(bulanFilter))
  const totalRincian = rincianPembelian.reduce((s, r) => s + parseFloat(r.total_harga || 0), 0)
  const totalNilaiTahun = rekapBulanan.reduce((s, r) => s + r.nilai, 0)
  const totalNilaiStok  = barang.reduce((s, b) => s + parseFloat(b.stok_saat_ini || 0) * parseFloat(b.harga_beli || 0), 0)
  const rataRataTransaksi = masukTahun.length > 0 ? totalNilaiTahun / masukTahun.length : 0

  const belanjaPerBarang = {}
  masukTahun.forEach(r => {
    const id = r.barang_id
    if (!belanjaPerBarang[id]) belanjaPerBarang[id] = { nama: r.barang?.nama_barang, qty: 0, nilai: 0 }
    belanjaPerBarang[id].qty += r.jumlah || 0
    belanjaPerBarang[id].nilai += parseFloat(r.total_harga || 0)
  })
  const topBelanja = Object.values(belanjaPerBarang).sort((a, b) => b.nilai - a.nilai).slice(0, 10)
  const chartBelanja = topBelanja.map(b => ({ name: b.nama?.slice(0, 12), nilai: Math.round(b.nilai) }))

  const nilaiStokPerBarang = [...barang]
    .map(b => ({ ...b, nilai_stok: parseFloat(b.stok_saat_ini || 0) * parseFloat(b.harga_beli || 0) }))
    .sort((a, b) => b.nilai_stok - a.nilai_stok)

  // ── Mode per barang: rekap bulanan nilai pembelian barang ini ──
  const rekapBulananBarang = BULAN.map((label, m) => {
    const monthStart = new Date(tahun, m, 1)
    const monthEnd = new Date(tahun, m + 1, 1)
    const rows = allMasuk.filter(r => r.barang_id === barangDetail?.id && new Date(r.created_at) >= monthStart && new Date(r.created_at) < monthEnd)
    const qty = rows.reduce((s, r) => s + parseFloat(r.jumlah || 0), 0)
    const nilai = rows.reduce((s, r) => s + parseFloat(r.total_harga || 0), 0)
    return { bulan: m, qty, nilai, hargaRata: qty > 0 ? nilai / qty : 0 }
  })
  const masukBarangTahun = allMasuk.filter(r => r.barang_id === barangDetail?.id && new Date(r.created_at).getFullYear() === tahun)
  const totalNilaiBarangTahun = rekapBulananBarang.reduce((s, r) => s + r.nilai, 0)
  const totalQtyBarangTahun = rekapBulananBarang.reduce((s, r) => s + r.qty, 0)
  const rataHargaBarang = totalQtyBarangTahun > 0 ? totalNilaiBarangTahun / totalQtyBarangTahun : 0
  const nilaiStokBarang = parseFloat(barangDetail?.stok_saat_ini || 0) * parseFloat(barangDetail?.harga_beli || 0)
  const bulanIni = new Date().getMonth(), tahunIni = new Date().getFullYear()

  const exportExcel = async () => {
    try {
      if (selectedBarang && barangDetail) {
        await exportService.exportLaporanUangExcel({
          projectName: project?.nama_project, tahun, barang: barangDetail,
          rekap: rekapBulananBarang.map(r => ({ ...r, bulanLabel: `${BULAN[r.bulan]} ${tahun}` })),
          rincian: masukBarangTahun,
        })
        return toast.success('Excel diunduh')
      }
      if (barang.length === 0) return toast.error('Tidak ada data untuk diekspor')
      await exportService.exportLaporanUangExcel({
        projectName: project?.nama_project, tahun,
        rekap: rekapBulanan.map(r => ({ ...r, bulanLabel: `${r.bulan} ${tahun}` })),
        rincian: masukTahun, nilaiStok: nilaiStokPerBarang,
      })
      toast.success('Excel diunduh')
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="History Uang" subtitle="Nilai pembelian & nilai stok per bulan — per barang atau keseluruhan, sinkron otomatis dengan Stok Masuk" />

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
                { value: '', label: 'Keseluruhan' },
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
            {barang.length > 0 && <Button variant="outline" icon={Download} onClick={exportExcel}>Export Excel</Button>}
          </div>
        </div>
      </Card>

      {!selectedProject && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-300">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center">
            <Wallet size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-400">Pilih project untuk melihat laporan</p>
        </div>
      )}

      {selectedProject && !selectedBarang && (
        <>
          <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-amber-200 text-xs font-bold uppercase tracking-widest">{project?.kode_project}</span>
                <h2 className="text-2xl font-extrabold mt-1">{project?.nama_project}</h2>
                <p className="text-amber-200 text-sm mt-1">Rekap nilai tahun {tahun}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-amber-200 text-xs">Total Nilai Stok (live)</p>
                <p className="text-2xl font-extrabold">{formatRupiah(totalNilaiStok)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger">
            {[
              { label: `Nilai Pembelian ${tahun}`, val: formatRupiah(totalNilaiTahun), color: 'bg-green-50 border-green-100 text-green-700', icon: TrendingDown },
              { label: 'Nilai Stok Saat Ini', val: formatRupiah(totalNilaiStok), color: 'bg-purple-50 border-purple-100 text-purple-700', icon: Wallet },
              { label: 'Rata-rata / Transaksi', val: formatRupiah(rataRataTransaksi), color: 'bg-blue-50 border-blue-100 text-blue-700', icon: Receipt },
            ].map((s, i) => (
              <div key={i} className={`rounded-2xl border p-4 flex items-center gap-3 transition-all hover:shadow-md ${s.color} animate-slideUp`}>
                <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <s.icon size={16} className="opacity-80" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70">{s.label}</p>
                  <p className="text-lg font-extrabold">{s.val}</p>
                </div>
              </div>
            ))}
          </div>

          <Card title={`Tren Pembelian Bulanan ${tahun}`}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rekapBulanan} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => formatRupiah(v)} />
                <Bar dataKey="nilai" name="Nilai Pembelian" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={`Tabel Rekap Bulanan ${tahun}`}>
            <Table data={rekapBulanan} columns={[
              { header: 'Bulan', render: r => <span className="font-semibold">{r.bulan} {tahun}</span> },
              { header: 'Jumlah Transaksi', render: r => r.trx },
              { header: 'Nilai Pembelian', render: r => <span className="font-bold text-amber-700">{formatRupiah(r.nilai)}</span> },
              { header: 'Dibelikan Untuk', render: r => r.barangDibeli.length === 0 ? <span className="text-gray-300">-</span> : (
                <div className="space-y-0.5">
                  {r.barangDibeli.slice(0, 3).map((b, i) => (
                    <div key={i} className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">{b.nama}</span> · {b.qty} {b.satuan} · {formatRupiah(b.nilai)}
                    </div>
                  ))}
                  {r.barangDibeli.length > 3 && <div className="text-xs text-gray-400">+{r.barangDibeli.length - 3} barang lain</div>}
                </div>
              ) },
              { header: '', render: r => r.trx > 0 && (
                <button type="button" className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                  onClick={() => { setBulanFilter(String(r.idx)); document.getElementById('rincian-pembelian')?.scrollIntoView({ behavior: 'smooth' }) }}>
                  Lihat rincian
                </button>
              ) },
            ]} />
          </Card>

          <div id="rincian-pembelian">
            <Card title={`Rincian Pembelian ${bulanFilter === '' ? tahun : `${BULAN[parseInt(bulanFilter)]} ${tahun}`} (${rincianPembelian.length} transaksi · ${formatRupiah(totalRincian)})`}>
              <div className="mb-3 max-w-[200px]">
                <DropdownSelect
                  value={bulanFilter}
                  onChange={v => setBulanFilter(v)}
                  options={[{ value: '', label: 'Semua bulan' }, ...BULAN.map((b, i) => ({ value: String(i), label: `${b} ${tahun}` }))]}
                />
              </div>
              <div className="max-h-[28rem] overflow-y-auto">
                <Table data={rincianPembelian} emptyMessage="Belum ada pembelian pada periode ini" columns={[
                  { header: 'Tanggal', render: r => <span className="whitespace-nowrap">{formatTanggal(r.created_at)}</span> },
                  { header: 'Barang', render: r => (
                    <button type="button" className="text-left hover:underline decoration-dashed" onClick={() => setSelectedBarang(String(r.barang_id))}>
                      <span className="font-semibold text-sm block">{r.barang?.nama_barang || '-'}</span>
                      <span className="font-mono text-xs text-gray-400">{r.barang?.kode_barang}</span>
                    </button>
                  ) },
                  { header: 'Jumlah', render: r => <span className="font-semibold whitespace-nowrap">{r.jumlah} {r.barang?.satuan_barang?.singkatan}</span> },
                  { header: 'Harga Satuan', render: r => formatRupiah(r.harga_satuan) },
                  { header: 'Total', render: r => <span className="font-bold text-amber-700">{formatRupiah(r.total_harga)}</span> },
                  { header: 'Supplier / Sumber', render: r => r.sumber || '-' },
                  { header: 'No. Referensi', render: r => <span className="font-mono text-xs">{r.nomor_referensi || '-'}</span> },
                  { header: 'Catatan', render: r => <span className="text-xs text-gray-500">{r.catatan || '-'}</span> },
                ]} />
              </div>
            </Card>
          </div>

          {chartBelanja.length > 0 && (
            <Card title={`Top 10 Barang berdasarkan Nilai Pembelian ${tahun}`}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartBelanja} margin={{ top: 0, right: 5, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => formatRupiah(v)} />
                  <Bar dataKey="nilai" name="Nilai Pembelian" fill="#f59e0b" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card title={`Nilai Stok per Barang (${nilaiStokPerBarang.length})`}>
            <Table
              data={nilaiStokPerBarang}
              columns={[
                { header: 'Kode', render: r => <span className="font-mono text-xs text-gray-400">{r.kode_barang}</span> },
                { header: 'Nama Barang', render: r => (
                  <button type="button" className="text-left hover:underline decoration-dashed" onClick={() => setSelectedBarang(String(r.id))}>
                    <span className="font-semibold text-sm">{r.nama_barang}</span>
                  </button>
                ) },
                { header: 'Harga Beli', render: r => formatRupiah(r.harga_beli) },
                { header: 'Stok', render: r => <span className="text-sm">{r.stok_saat_ini} {r.satuan_barang?.singkatan}</span> },
                { header: 'Nilai Stok', render: r => <span className="font-bold text-purple-700">{formatRupiah(r.nilai_stok)}</span> },
              ]}
            />
          </Card>
        </>
      )}

      {barangDetail && (
        <>
          <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-amber-200 text-xs font-bold uppercase tracking-widest">{barangDetail.kode_barang}</span>
                <h2 className="text-2xl font-extrabold mt-1">{barangDetail.nama_barang}</h2>
                <p className="text-amber-200 text-sm mt-1">Rekap nilai tahun {tahun}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-amber-200 text-xs">Nilai Stok Saat Ini</p>
                <p className="text-2xl font-extrabold">{formatRupiah(nilaiStokBarang)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger">
            {[
              { label: `Dibelanjakan ${tahun}`, val: formatRupiah(totalNilaiBarangTahun), color: 'bg-green-50 border-green-100 text-green-700', icon: TrendingDown },
              { label: 'Harga Rata-rata', val: formatRupiah(rataHargaBarang), color: 'bg-blue-50 border-blue-100 text-blue-700', icon: Coins },
              { label: 'Nilai Stok Saat Ini', val: formatRupiah(nilaiStokBarang), color: 'bg-purple-50 border-purple-100 text-purple-700', icon: Wallet },
            ].map((s, i) => (
              <div key={i} className={`rounded-2xl border p-4 flex items-center gap-3 transition-all hover:shadow-md ${s.color} animate-slideUp`}>
                <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <s.icon size={16} className="opacity-80" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70">{s.label}</p>
                  <p className="text-lg font-extrabold">{s.val}</p>
                </div>
              </div>
            ))}
          </div>

          <Card title={`Rekap Bulanan ${tahun} — ${barangDetail.nama_barang}`}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rekapBulananBarang.map(r => ({ ...r, bulan: BULAN[r.bulan] }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => formatRupiah(v)} />
                <Bar dataKey="nilai" name="Nilai Pembelian" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3">
              <Table data={rekapBulananBarang} columns={[
                { header: 'Bulan', render: r => (
                  <span className={`font-semibold ${tahun === tahunIni && r.bulan === bulanIni ? 'text-amber-600' : ''}`}>
                    {BULAN[r.bulan]} {tahun}{tahun === tahunIni && r.bulan === bulanIni ? ' (berjalan)' : ''}
                  </span>
                ) },
                { header: 'Qty Dibeli', render: r => <span className="font-semibold">{r.qty}</span> },
                { header: 'Nilai Dibeli', render: r => <span className="font-bold text-amber-700">{formatRupiah(r.nilai)}</span> },
                { header: 'Harga Rata-rata', render: r => formatRupiah(r.hargaRata) },
              ]} rowClassName={r => tahun === tahunIni && r.bulan === bulanIni ? 'bg-amber-50/50' : ''} />
            </div>
          </Card>

          <Card title={`Riwayat Pembelian ${tahun} (${masukBarangTahun.length})`}>
            <div className="max-h-96 overflow-y-auto">
              <Table data={masukBarangTahun} emptyMessage="Belum ada pembelian di tahun ini" columns={[
                { header: 'Tanggal', render: r => formatTanggal(r.created_at) },
                { header: 'Barang', render: () => <span className="font-semibold text-sm">{barangDetail.nama_barang}</span> },
                { header: 'Jumlah', render: r => <span className="font-semibold">{r.jumlah} {barangDetail.satuan_barang?.singkatan}</span> },
                { header: 'Harga Satuan', render: r => formatRupiah(r.harga_satuan) },
                { header: 'Total Harga', render: r => <span className="font-bold text-amber-700">{formatRupiah(r.total_harga)}</span> },
                { header: 'Supplier / Sumber', render: r => r.sumber || '-' },
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
