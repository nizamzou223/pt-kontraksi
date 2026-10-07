import { usePolling } from '../../utils/pageActivity'
import { generateNomorSK } from '../../utils/autoFill'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Plus, Download, ArrowUpRight, Package, AlertTriangle } from 'lucide-react'
import { Card, Button, Modal, Input, Textarea, Select, FormField, Table, PageHeader, SearchBar, AlertInPage, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { exportService } from '../../services/exportService'
import { useProject } from '../../context/ProjectContext'
import { formatTanggal, formatRupiah } from '../../utils/formatters'
import { FormSection } from '../common/FormSection'
import { syncBus } from '../../utils/syncBus'

const AUTO_REFRESH_MS = 45000
const broadcastRefresh = () => window.dispatchEvent(new Event('dataRefreshed'))

export default function StokKeluar() {
  const { activeProject } = useProject()
  const [data, setData] = useState([])
  const [barang, setBarang] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    barang_id: '',
    jumlah: '',
    tujuan: '',
    nomor_referensi: generateNomorSK(),
    nomor_bon: '',
    catatan_bon: '',
    nomor_rekap: '',
    catatan: '',
  })

  const load = useCallback(async (silent = false) => {
    if (!activeProject?.id) return
    if (!silent) setLoading(true)
    try {
      const [stokData, barangData] = await Promise.all([
        inventoryService.getStokKeluar(activeProject.id),
        inventoryService.getBarang(),
      ])
      setData(stokData)
      setBarang(barangData)
      broadcastRefresh()
    } catch (e) { if (!silent) toast.error(e.message) }
    finally { if (!silent) setLoading(false) }
  }, [activeProject?.id])

  useEffect(() => { load() }, [load])
  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(true), AUTO_REFRESH_MS)

  const resetForm = () => setForm({
    barang_id: '', jumlah: '', tujuan: '',
    nomor_referensi: generateNomorSK(),
    nomor_bon: '', catatan_bon: '', nomor_rekap: '', catatan: '',
  })

  const handleSave = async () => {
    if (!form.barang_id) return toast.error('Pilih barang')
    if (!form.jumlah || parseInt(form.jumlah) <= 0) return toast.error('Jumlah harus lebih dari 0')
    if (!form.tujuan) return toast.error('Isi keterangan tujuan')

    setSaving(true)
    try {
      await inventoryService.createStokKeluar({
        project_id: activeProject.id,
        barang_id: parseInt(form.barang_id),
        jumlah: parseInt(form.jumlah),
        tujuan: form.tujuan,
        nomor_referensi: form.nomor_referensi,
        nomor_bon: form.nomor_bon,
        catatan_bon: form.catatan_bon,
        nomor_rekap: form.nomor_rekap,
        catatan: form.catatan,
      })
      syncBus.emitAll('stok')
      toast.success('✓ Stok keluar berhasil dicatat')
      setModal(false)
      resetForm()
      load()
    } catch (e) { toast.error(e.message, { duration: 6000 }); load(true) } finally { setSaving(false) }
  }

  const selectedBarang = barang.find(b => b.id === parseInt(form.barang_id))
  const stokKritis = parseInt(form.jumlah) > 0 && selectedBarang && parseInt(form.jumlah) > selectedBarang.stok_saat_ini

  const filtered = data.filter(d =>
    d.barang?.nama_barang?.toLowerCase().includes(search.toLowerCase()) ||
    d.tujuan?.toLowerCase().includes(search.toLowerCase()) ||
    d.nomor_bon?.toLowerCase().includes(search.toLowerCase()) ||
    d.nomor_rekap?.toLowerCase().includes(search.toLowerCase())
  )

  if (!activeProject) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <p className="text-sm font-medium">Pilih project terlebih dahulu</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stok Keluar"
        subtitle={`${activeProject.nama_project} · ${data.length} transaksi`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" icon={Download} size="sm"
              onClick={() => {
                exportService.exportExcel(filtered, [
                  { header: 'Tanggal', render: r => formatTanggal(r.created_at) },
                  { header: 'Barang', render: r => r.barang?.nama_barang },
                  { header: 'Jumlah', key: 'jumlah' },
                  { header: 'Tujuan', key: 'tujuan' },
                  { header: 'No. Ref', key: 'nomor_referensi' },
                  { header: 'No. Bon', key: 'nomor_bon' },
                  { header: 'Catatan Bon', key: 'catatan_bon' },
                  { header: 'No. Rekap', key: 'nomor_rekap' },
                  { header: 'Catatan', key: 'catatan' },
                ], 'stok-keluar')
                toast.success('Excel diunduh')
              }}>
              Export
            </Button>
            <Button icon={Plus} onClick={() => { resetForm(); setModal(true) }}>
              Catat Stok Keluar
            </Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <ArrowUpRight size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs text-red-600 font-semibold">Total Transaksi</p>
            <p className="text-2xl font-extrabold text-red-700">{filtered.length}</p>
          </div>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <Package size={18} className="text-orange-600" />
          </div>
          <div>
            <p className="text-xs text-orange-600 font-semibold">Jenis Barang</p>
            <p className="text-2xl font-extrabold text-orange-700">{new Set(filtered.map(d => d.barang_id)).size}</p>
          </div>
        </div>
      </div>

      <Card>
        <div className="mb-4">
          <SearchBar value={search} onChange={setSearch} placeholder="Cari barang / tujuan..." />
        </div>
        <Table
          loading={loading}
          data={filtered}
          emptyMessage="Belum ada transaksi stok keluar"
          columns={[
            { header: 'Tanggal', render: r => <span className="text-sm">{formatTanggal(r.created_at)}</span> },
            {
              header: 'Barang', render: r => (
                <div>
                  <p className="font-semibold text-sm">{r.barang?.nama_barang}</p>
                  <p className="text-xs text-gray-400">{r.barang?.kode_barang}</p>
                </div>
              )
            },
            {
              header: 'Jumlah', render: r => (
                <span className="font-bold text-red-600">
                  -{r.jumlah} {r.barang?.satuan_barang?.singkatan}
                </span>
              )
            },
            {
              header: 'Tujuan / Project',
              render: r => {
                // Coba parse project dari tujuan yang mengandung [Nama Project]
                const match = r.tujuan?.match(/^\[(.+?)\](.*)$/)
                if (match) {
                  return (
                    <div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mb-0.5">
                        📁 {match[1]}
                      </span>
                      {match[2]?.trim() && <p className="text-xs text-gray-500">{match[2].trim()}</p>}
                    </div>
                  )
                }
                return <span className="text-sm text-gray-600">{r.tujuan}</span>
              }
            },
            { header: 'No. Ref', render: r => <span className="text-xs font-mono text-gray-400">{r.nomor_referensi || '—'}</span> },
            {
              header: 'Bon / Rekap',
              render: r => (
                <div className="text-xs space-y-0.5">
                  {r.nomor_bon && <p className="font-medium text-gray-700">Bon: {r.nomor_bon}</p>}
                  {r.nomor_rekap && <p className="text-indigo-600 font-medium">Rekap: {r.nomor_rekap}</p>}
                  {r.catatan_bon && <p className="text-gray-400 italic truncate max-w-[160px]">{r.catatan_bon}</p>}
                  {!r.nomor_bon && !r.nomor_rekap && <span className="text-gray-300">—</span>}
                </div>
              )
            },
            { header: 'Catatan', render: r => <span className="text-xs text-gray-400">{r.catatan || '—'}</span> },
          ]}
        />
      </Card>

      {/* Modal Catat Stok Keluar */}
      <Modal open={modal} onClose={() => setModal(false)} title="Catat Stok Keluar" size="sm">
        <div className="space-y-4">

          <FormField label="Barang" required>
            <DropdownSelect
              searchable
              value={form.barang_id}
              onChange={v => setForm(f => ({ ...f, barang_id: v }))}
              options={[
                { value: '', label: 'Pilih barang...' },
                ...barang.map(b => ({ value: String(b.id), label: `${b.nama_barang} (Stok: ${b.stok_saat_ini} ${b.satuan_barang?.singkatan})` })),
              ]}
            />
          </FormField>

          {/* Info stok tersedia */}
          {selectedBarang && (
            <div className={`flex items-center gap-2 rounded-xl p-3 text-sm border ${
              selectedBarang.stok_saat_ini <= selectedBarang.stok_minimal
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-blue-50 border-blue-100 text-blue-700'
            }`}>
              <Package size={14} className="flex-shrink-0" />
              <span>
                Stok tersedia: <strong>{selectedBarang.stok_saat_ini} {selectedBarang.satuan_barang?.singkatan}</strong>
                {selectedBarang.stok_saat_ini <= selectedBarang.stok_minimal && (
                  <span className="ml-2 font-bold">⚠️ STOK KRITIS!</span>
                )}
              </span>
            </div>
          )}

          <FormField label="Jumlah" required>
            <Input
              type="number" min="1"
              max={selectedBarang?.stok_saat_ini}
              value={form.jumlah}
              onChange={e => setForm(f => ({ ...f, jumlah: e.target.value }))}
              placeholder="0"
            />
          </FormField>

          {/* Stok tidak cukup */}
          {stokKritis && (
            <AlertInPage type="error" message={`Jumlah melebihi stok! Stok tersedia hanya ${selectedBarang.stok_saat_ini} ${selectedBarang.satuan_barang?.singkatan}.`} />
          )}

          <FormField label="Tujuan / Keperluan" required help="Misal: Gudang A, Lantai 3, nama pekerja, dll">
            <Input
              value={form.tujuan}
              onChange={e => setForm(f => ({ ...f, tujuan: e.target.value }))}
              placeholder="Lokasi / keperluan..."
            />
          </FormField>

          <FormField label="No. Referensi">
            <Input value={form.nomor_referensi} readOnly className="bg-gray-50 text-gray-400 cursor-default" />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="No. Bon">
              <Input value={form.nomor_bon} onChange={e => setForm(f => ({ ...f, nomor_bon: e.target.value }))} placeholder="Nomor bon..." />
            </FormField>
            <FormField label="No. Rekap">
              <Input value={form.nomor_rekap} onChange={e => setForm(f => ({ ...f, nomor_rekap: e.target.value }))} placeholder="Nomor rekap..." />
            </FormField>
          </div>

          <FormField label="Catatan Bon" help="Laporan / keterangan bon sub konstruksi">
            <Textarea value={form.catatan_bon} onChange={e => setForm(f => ({ ...f, catatan_bon: e.target.value }))} placeholder="Isi laporan atau keterangan bon sub konstruksi..." rows={3} />
          </FormField>

          <FormField label="Catatan">
            <Input value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Catatan tambahan..." />
          </FormField>

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Batal</Button>
            <Button variant="danger" className="flex-1" onClick={handleSave} loading={saving} disabled={stokKritis}>
              Catat Keluar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
