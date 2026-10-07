import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Package, TrendingUp, TrendingDown, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart2, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, Button, Select, Input, Table, PageHeader, AlertInPage, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { projectService } from '../../services/projectService'
import { formatRupiah, formatTanggal } from '../../utils/formatters'
import { today } from '../../utils/autoFill'
import supabase from '../../services/supabaseClient'
import { syncBus } from '../../utils/syncBus'

const thisMonth = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`
}

export default function LaporanInventaris() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [barang, setBarang] = useState([])
  const [stokMasuk, setStokMasuk] = useState([])
  const [stokKeluar, setStokKeluar] = useState([])
  const [stokKritis, setStokKritis] = useState([])
  const [loading, setLoading] = useState(false)
  const [periodeStart, setPeriodeStart] = useState(thisMonth())
  const [periodeEnd, setPeriodeEnd] = useState(today())

  useEffect(() => {
    projectService.getProjects().then(setProjects).catch(e => toast.error(e.message))
  }, [])

  const load = async () => {
    if (!selectedProject) return toast.error('Pilih project terlebih dahulu')
    setLoading(true)
    try {
      const pid = parseInt(selectedProject)
      // Barang sekarang katalog global (gudang pusat, lihat FIX_GUDANG_PUSAT.sql)
      // -- tidak lagi "milik" satu project. Laporan ini tetap per-project dengan
      // membatasi tampilan ke barang yang benar-benar bergerak (stok masuk/keluar)
      // di project & periode terpilih, bukan seluruh katalog perusahaan.
      const [brg, sm, sk, kritis] = await Promise.all([
        supabase.from('barang')
          .select('*, kategori_barang(nama_kategori), satuan_barang(nama_satuan, singkatan)')
          .order('nama_barang')
          .then(r => r.data || []),
        // Stok masuk di periode
        supabase.from('stok_masuk')
          .select('*, barang(nama_barang, kode_barang, satuan_barang(singkatan))')
          .eq('project_id', pid)
          .gte('created_at', periodeStart)
          .lte('created_at', periodeEnd + 'T23:59:59')
          .then(r => r.data || []),
        // Stok keluar di periode
        supabase.from('stok_keluar')
          .select('*, barang(nama_barang, kode_barang, satuan_barang(singkatan))')
          .eq('project_id', pid)
          .gte('created_at', periodeStart)
          .lte('created_at', periodeEnd + 'T23:59:59')
          .then(r => r.data || []),
        inventoryService.getStokKritis(),
      ])
      const barangIdsBergerak = new Set([...sm, ...sk].map(r => r.barang_id))
      setBarang(brg.filter(b => barangIdsBergerak.has(b.id)))
      setStokMasuk(sm)
      setStokKeluar(sk)
      setStokKritis(kritis)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  const project = projects.find(p => p.id === parseInt(selectedProject))

  // Aggregates
  const totalNilaiMasuk = stokMasuk.reduce((s, r) => s + parseFloat(r.total_harga || 0), 0)
  const totalItemMasuk  = stokMasuk.reduce((s, r) => s + parseInt(r.jumlah || 0), 0)
  const totalItemKeluar = stokKeluar.reduce((s, r) => s + parseInt(r.jumlah || 0), 0)
  const totalNilaiStok  = barang.reduce((s, b) => s + parseFloat(b.stok_saat_ini || 0) * parseFloat(b.harga_beli || 0), 0)

  // Chart: top 10 barang by stok
  const chartBarang = [...barang]
    .sort((a, b) => b.stok_saat_ini - a.stok_saat_ini)
    .slice(0, 10)
    .map(b => ({
      name: b.nama_barang?.slice(0, 12),
      stok: b.stok_saat_ini,
      minimal: b.stok_minimal,
    }))

  // Movement per barang
  const movementByBarang = {}
  stokMasuk.forEach(sm => {
    const id = sm.barang_id
    if (!movementByBarang[id]) movementByBarang[id] = { nama: sm.barang?.nama_barang, masuk: 0, keluar: 0 }
    movementByBarang[id].masuk += sm.jumlah || 0
  })
  stokKeluar.forEach(sk => {
    const id = sk.barang_id
    if (!movementByBarang[id]) movementByBarang[id] = { nama: sk.barang?.nama_barang, masuk: 0, keluar: 0 }
    movementByBarang[id].keluar += sk.jumlah || 0
  })
  const movementList = Object.values(movementByBarang).sort((a, b) => (b.masuk + b.keluar) - (a.masuk + a.keluar))

  const exportCSV = () => {
    const rows = barang.map(b => ({
      'Kode': b.kode_barang, 'Nama Barang': b.nama_barang,
      'Kategori': b.kategori_barang?.nama_kategori,
      'Satuan': b.satuan_barang?.singkatan,
      'Stok Saat Ini': b.stok_saat_ini, 'Stok Minimal': b.stok_minimal,
      'Harga Beli': b.harga_beli, 'Status': b.stok_saat_ini <= b.stok_minimal ? 'KRITIS' : 'Normal',
    }))
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => `"${v ?? ''}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `inventaris-${project?.kode_project}-${periodeStart}.csv`
    a.click()
    toast.success('CSV diunduh')
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Laporan Inventaris" subtitle="Kondisi stok, mutasi masuk/keluar, dan stok kritis per project" />

      {/* Filter */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Project</label>
            <DropdownSelect
              value={selectedProject}
              onChange={v => setSelectedProject(v)}
              options={[
                { value: '', label: 'Pilih project...' },
                ...projects.map(p => ({ value: String(p.id), label: `${p.nama_project} (${p.kode_project})` })),
              ]}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Dari</label>
            <Input type="date" value={periodeStart} onChange={e => setPeriodeStart(e.target.value)} className="w-auto" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Sampai</label>
            <Input type="date" value={periodeEnd} onChange={e => setPeriodeEnd(e.target.value)} className="w-auto" />
          </div>
          <div className="flex gap-2">
            <Button onClick={load} loading={loading} icon={BarChart2}>Tampilkan</Button>
            {barang.length > 0 && <Button variant="outline" icon={Download} onClick={exportCSV}>Export CSV</Button>}
          </div>
        </div>
      </Card>

      {barang.length > 0 && (
        <>
          {/* Banner project */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-emerald-200 text-xs font-bold uppercase tracking-widest">{project?.kode_project}</span>
                <h2 className="text-2xl font-extrabold mt-1">{project?.nama_project}</h2>
                <p className="text-emerald-200 text-sm mt-1">{formatTanggal(periodeStart)} — {formatTanggal(periodeEnd)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-emerald-200 text-xs">Nilai Stok</p>
                <p className="text-2xl font-extrabold">{formatRupiah(totalNilaiStok)}</p>
                <p className="text-emerald-200 text-xs mt-0.5">{barang.length} jenis barang</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
            {[
              { label: 'Jenis Barang', val: barang.length, color: 'bg-blue-50 border-blue-100 text-blue-700', icon: Package },
              { label: 'Stok Masuk', val: `${totalItemMasuk} item`, color: 'bg-green-50 border-green-100 text-green-700', icon: ArrowDownRight, sub: formatRupiah(totalNilaiMasuk) },
              { label: 'Stok Keluar', val: `${totalItemKeluar} item`, color: 'bg-red-50 border-red-100 text-red-700', icon: ArrowUpRight },
              { label: 'Stok Kritis (Gudang Pusat)', val: stokKritis.length, color: stokKritis.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-500', icon: AlertTriangle },
            ].map((s, i) => (
              <div key={i} className={`rounded-2xl border p-4 flex items-center gap-3 transition-all hover:shadow-md ${s.color} animate-slideUp`}>
                <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <s.icon size={16} className="opacity-80" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70">{s.label}</p>
                  <p className="text-xl font-extrabold">{s.val}</p>
                  {s.sub && <p className="text-xs opacity-60">{s.sub}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Stok kritis alert */}
          {stokKritis.length > 0 && (
            <AlertInPage
              type="warning"
              title={`${stokKritis.length} barang stok kritis (gudang pusat — seluruh project)`}
              message={stokKritis.slice(0,4).map(b => `${b.nama_barang} (${b.stok_saat_ini}/${b.stok_minimal})`).join(', ') + (stokKritis.length > 4 ? ` +${stokKritis.length-4} lainnya` : '')}
            />
          )}

          {/* Chart stok */}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Mutasi */}
            {movementList.length > 0 && (
              <Card title="Mutasi Barang di Periode Ini">
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {movementList.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
                      <span className="text-sm font-semibold flex-1 truncate">{m.nama}</span>
                      <span className="text-xs text-green-600 font-bold">+{m.masuk}</span>
                      <span className="text-xs text-gray-300">|</span>
                      <span className="text-xs text-red-500 font-bold">-{m.keluar}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Stok kritis detail */}
            <Card title={`Stok Kritis — Gudang Pusat (${stokKritis.length})`}>
              {stokKritis.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-gray-300 text-sm">Semua stok aman ✓</div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {stokKritis.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-red-50 rounded-xl">
                      <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                        <Package size={13} className="text-red-500" />
                      </div>
                      <span className="text-sm font-semibold flex-1 truncate">{b.nama_barang}</span>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold text-red-600">{b.stok_saat_ini}</p>
                        <p className="text-xs text-gray-400">min: {b.stok_minimal} {b.satuan_barang?.singkatan}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Tabel semua barang */}
          <Card title={`Daftar Semua Barang (${barang.length})`}>
            <Table
              data={barang}
              columns={[
                { header: 'Kode', render: r => <span className="font-mono text-xs text-gray-400">{r.kode_barang}</span> },
                {
                  header: 'Nama Barang', render: r => (
                    <div>
                      <p className="font-semibold text-sm">{r.nama_barang}</p>
                      <p className="text-xs text-gray-400">{r.kategori_barang?.nama_kategori}</p>
                    </div>
                  )
                },
                {
                  header: 'Stok', render: r => (
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-extrabold ${r.stok_saat_ini <= r.stok_minimal ? 'text-red-600' : 'text-green-600'}`}>
                        {r.stok_saat_ini}
                      </span>
                      <span className="text-xs text-gray-400">{r.satuan_barang?.singkatan}</span>
                    </div>
                  )
                },
                { header: 'Min', render: r => <span className="text-xs text-gray-400">{r.stok_minimal}</span> },
                { header: 'Harga Beli', render: r => <span className="text-sm">{formatRupiah(r.harga_beli)}</span> },
                { header: 'Nilai Stok', render: r => <span className="font-semibold text-sm">{formatRupiah(parseFloat(r.stok_saat_ini||0) * parseFloat(r.harga_beli||0))}</span> },
                {
                  header: 'Status', render: r => r.stok_saat_ini <= r.stok_minimal
                    ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold"><AlertTriangle size={10}/> Kritis</span>
                    : <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Normal</span>
                },
              ]}
            />
          </Card>
        </>
      )}

      {!selectedProject && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-300">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center">
            <Package size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-400">Pilih project dan klik Tampilkan</p>
        </div>
      )}
    </div>
  )
}
