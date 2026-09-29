import { usePolling, usePageActive, useTabVisible } from '../../utils/pageActivity'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Package, TrendingUp, DollarSign, RefreshCw } from 'lucide-react'
import { Card, Table, PageHeader, SearchBar, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { useProject } from '../../context/ProjectContext'
import { formatRupiah } from '../../utils/formatters'

const AUTO_REFRESH_MS = 20000

const getStokStatus = (b) => {
  if (b.stok_saat_ini === 0) return { label: 'Habis', color: 'bg-red-100 text-red-800', order: 0 }
  if (b.stok_saat_ini <= b.stok_minimal) return { label: 'Kritis', color: 'bg-orange-100 text-orange-800', order: 1 }
  if (b.stok_saat_ini <= b.stok_minimal * 1.5) return { label: 'Rendah', color: 'bg-yellow-100 text-yellow-800', order: 2 }
  return { label: 'Aman', color: 'bg-green-100 text-green-800', order: 3 }
}

export default function MonitoringStok() {
  const { activeProject } = useProject()
  const [barang, setBarang] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [countdown, setCountdown] = useState(AUTO_REFRESH_MS / 1000)
  const [lastUpdated, setLastUpdated] = useState(null)
  const countdownRef = useRef(null)

  const load = useCallback(async (silent = false) => {
    if (!activeProject?.id) return
    if (!silent) setLoading(true)
    try {
      const data = await inventoryService.getBarang(activeProject.id)
      setBarang(data)
      setLastUpdated(new Date())
      setCountdown(AUTO_REFRESH_MS / 1000)
    } catch (e) { if (!silent) toast.error(e.message) }
    finally { if (!silent) setLoading(false) }
  }, [activeProject?.id])

  useEffect(() => { load() }, [load])

  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(true), AUTO_REFRESH_MS)

  // Hitung mundur hanya berdetak saat tab terlihat & halaman aktif (hemat render)
  const pageActive = usePageActive()
  const tabVisible = useTabVisible()
  useEffect(() => {
    if (!(pageActive && tabVisible)) return undefined
    countdownRef.current = setInterval(() => {
      setCountdown(c => c <= 1 ? AUTO_REFRESH_MS / 1000 : c - 1)
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [pageActive, tabVisible])

  const stokHabis = barang.filter(b => b.stok_saat_ini === 0).length
  const stokKritis = barang.filter(b => b.stok_saat_ini > 0 && b.stok_saat_ini <= b.stok_minimal).length
  const stokRendah = barang.filter(b => b.stok_saat_ini > b.stok_minimal && b.stok_saat_ini <= b.stok_minimal * 1.5).length
  const stokAman = barang.filter(b => b.stok_saat_ini > b.stok_minimal * 1.5).length
  const totalNilai = barang.reduce((s, b) => s + (b.stok_saat_ini * parseFloat(b.harga_beli || 0)), 0)
  const totalAlert = stokHabis + stokKritis

  const filtered = barang
    .filter(b => {
      const q = search.toLowerCase()
      const matchSearch = b.nama_barang?.toLowerCase().includes(q) || b.kode_barang?.toLowerCase().includes(q)
      if (filter === 'habis') return matchSearch && b.stok_saat_ini === 0
      // Kartu "Kritis / Habis" menghitung keduanya, jadi daftar juga menampilkan keduanya
      if (filter === 'kritis') return matchSearch && b.stok_saat_ini <= b.stok_minimal
      if (filter === 'rendah') return matchSearch && b.stok_saat_ini > b.stok_minimal && b.stok_saat_ini <= b.stok_minimal * 1.5
      if (filter === 'aman') return matchSearch && b.stok_saat_ini > b.stok_minimal * 1.5
      return matchSearch
    })
    .sort((a, b) => getStokStatus(a).order - getStokStatus(b).order)

  const handleStatClick = (newFilter) => {
    setFilter(f => f === newFilter ? 'all' : newFilter)
  }

  if (!activeProject) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <p className="text-sm font-medium">Pilih project terlebih dahulu</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monitoring Stok"
        subtitle={`${activeProject.nama_project} • Auto refresh ${AUTO_REFRESH_MS / 1000} detik`}
        action={
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{lastUpdated ? `${countdown}d` : 'Memuat...'}</span>
          </button>
        }
      />

      {/* Stat Cards — klik untuk filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Package size={20} className="text-blue-600" />}
          bg="bg-blue-50 border-blue-100"
          label="Total Item"
          value={barang.length}
          textColor="text-blue-700"
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <StatCard
          icon={<AlertTriangle size={20} className="text-red-600" />}
          bg="bg-red-50 border-red-100"
          label="Kritis / Habis"
          value={totalAlert}
          textColor="text-red-700"
          active={filter === 'kritis'}
          onClick={() => handleStatClick('kritis')}
          badge={totalAlert > 0 ? '!' : null}
        />
        <StatCard
          icon={<TrendingUp size={20} className="text-green-600" />}
          bg="bg-green-50 border-green-100"
          label="Stok Aman"
          value={stokAman}
          textColor="text-green-700"
          active={filter === 'aman'}
          onClick={() => handleStatClick('aman')}
        />
        <StatCard
          icon={<DollarSign size={20} className="text-purple-600" />}
          bg="bg-purple-50 border-purple-100"
          label="Total Nilai"
          value={formatRupiah(totalNilai)}
          textColor="text-purple-700"
          valueSm
        />
      </div>

      {/* Alert banner */}
      {totalAlert > 0 && (
        <div
          className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-center gap-3 cursor-pointer hover:bg-red-100 transition-colors"
          onClick={() => handleStatClick('kritis')}
        >
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">
            <strong>{stokHabis > 0 ? `${stokHabis} item habis` : ''}{stokHabis > 0 && stokKritis > 0 ? ', ' : ''}{stokKritis > 0 ? `${stokKritis} item kritis` : ''}</strong>
            {' '}— segera lakukan pengadaan.
          </p>
          <span className="text-xs text-red-500 font-medium whitespace-nowrap">Lihat →</span>
        </div>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Cari nama / kode barang..." />
          </div>
          <DropdownSelect
            value={filter}
            onChange={v => setFilter(v)}
            className="sm:min-w-[150px]"
            options={[
              { value: 'all', label: `Semua (${barang.length})` },
              { value: 'habis', label: `Habis (${stokHabis})` },
              { value: 'kritis', label: `Kritis (${stokKritis})` },
              { value: 'rendah', label: `Rendah (${stokRendah})` },
              { value: 'aman', label: `Aman (${stokAman})` },
            ]}
          />
        </div>

        <Table
          loading={loading}
          data={filtered}
          emptyMessage="Tidak ada barang yang cocok"
          rowClassName={r => {
            const s = getStokStatus(r)
            if (s.label === 'Habis') return 'bg-red-50/60'
            if (s.label === 'Kritis') return 'bg-orange-50/40'
            return ''
          }}
          columns={[
            {
              header: 'Barang',
              render: r => (
                <div>
                  <p className="font-semibold text-sm">{r.nama_barang}</p>
                  <p className="text-xs text-gray-400">{r.kode_barang} · {r.kategori_barang?.nama_kategori}</p>
                </div>
              )
            },
            {
              header: 'Stok Saat Ini',
              render: r => {
                const s = getStokStatus(r)
                const colorMap = { Habis: 'text-red-700', Kritis: 'text-orange-600', Rendah: 'text-yellow-600', Aman: 'text-green-600' }
                return (
                  <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-extrabold ${colorMap[s.label]}`}>{r.stok_saat_ini}</span>
                    <span className="text-xs text-gray-400">{r.satuan_barang?.singkatan}</span>
                  </div>
                )
              }
            },
            {
              header: 'Stok Minimal',
              render: r => <span className="text-sm text-gray-500">{r.stok_minimal} {r.satuan_barang?.singkatan}</span>
            },
            {
              header: 'Level Stok',
              render: r => {
                const target = (r.stok_minimal || 1) * 2
                const pct = Math.min(100, Math.round((r.stok_saat_ini / target) * 100))
                const s = getStokStatus(r)
                const barColor = { Habis: 'bg-red-500', Kritis: 'bg-orange-500', Rendah: 'bg-yellow-400', Aman: 'bg-green-500' }[s.label]
                return (
                  <div className="min-w-[100px]">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{pct}%</span>
                      <span className="text-gray-300">target {target} {r.satuan_barang?.singkatan}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-2 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              }
            },
            {
              header: 'Nilai Stok',
              render: r => <span className="text-sm font-medium text-gray-700">{formatRupiah(r.stok_saat_ini * parseFloat(r.harga_beli || 0))}</span>
            },
            {
              header: 'Status',
              render: r => {
                const s = getStokStatus(r)
                return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${s.color}`}>{s.label}</span>
              }
            },
          ]}
        />

        {!loading && filtered.length > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-right">
            Menampilkan {filtered.length} dari {barang.length} item
            {lastUpdated && ` · Diperbarui ${lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        )}
      </Card>
    </div>
  )
}

function StatCard({ icon, bg, label, value, textColor, active, onClick, badge, valueSm }) {
  return (
    <div
      onClick={onClick}
      className={`border rounded-2xl p-4 flex items-center gap-3 transition-all duration-150
        ${bg}
        ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-100' : ''}
        ${active && onClick ? 'ring-2 ring-offset-1 ring-current shadow-sm' : ''}
      `}
    >
      <div className="w-10 h-10 bg-white/60 rounded-xl flex items-center justify-center flex-shrink-0 relative">
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{badge}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${textColor} opacity-80`}>{label}</p>
        <p className={`font-extrabold ${textColor} ${valueSm ? 'text-sm leading-tight mt-0.5' : 'text-2xl'}`}>{value}</p>
      </div>
    </div>
  )
}
