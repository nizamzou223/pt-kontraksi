import { generateNomorPO } from '../../utils/autoFill'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, Download, History } from 'lucide-react'
import { Card, Button, Modal, Input, RupiahInput, Select, FormField, Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { exportService } from '../../services/exportService'
import { useProject } from '../../context/ProjectContext'
import { formatTanggal, formatRupiah } from '../../utils/formatters'
import { FormSection, FieldRow, CalcPreview } from '../common/FormSection'
import { syncBus } from '../../utils/syncBus'

export default function StokMasuk() {
  const { activeProject } = useProject()
  const [data, setData] = useState([])
  const [barang, setBarang] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [search, setSearch] = useState('')
  const [historyBarang, setHistoryBarang] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [form, setForm] = useState({ barang_id: '', jumlah: '', harga_satuan: '', sumber: '', nomor_referensi: '', bon_subkon: '', catatan: '', nomor_polisi: '', nama_supir: '', nomor_surat: '' })

  const load = useCallback(async () => {
    if (!activeProject?.id) return
    setLoading(true)
    try {
      const [stokData, barangData] = await Promise.all([
        inventoryService.getStokMasuk(activeProject.id),
        inventoryService.getBarang(activeProject.id),
      ])
      setData(stokData)
      setBarang(barangData)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [activeProject?.id])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.barang_id) return toast.error('Pilih barang')
    if (!form.jumlah || form.jumlah <= 0) return toast.error('Jumlah harus lebih dari 0')
    if (!form.harga_satuan) return toast.error('Harga satuan wajib diisi')
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      await inventoryService.createStokMasuk({
        project_id: activeProject.id,
        barang_id: parseInt(form.barang_id),
        jumlah: parseInt(form.jumlah),
        harga_satuan: parseFloat(form.harga_satuan),
        sumber: form.sumber,
        nomor_referensi: form.nomor_referensi,
        bon_subkon: form.bon_subkon,
        catatan: form.catatan,
        nomor_polisi: form.nomor_polisi,
        nama_supir: form.nama_supir,
        nomor_surat: form.nomor_surat,
      })
      syncBus.emitAll('stok')
      toast.success('Stok masuk berhasil dicatat')
      setModal(false)
      setForm({ barang_id: '', jumlah: '', harga_satuan: '', sumber: '', nomor_referensi: generateNomorPO(), bon_subkon: '', catatan: '', nomor_polisi: '', nama_supir: '', nomor_surat: '' })
      load()
    } catch (e) { toast.error(e.message) } finally { savingRef.current = false; setSaving(false) }
  }

  const filtered = data.filter(d =>
    d.barang?.nama_barang?.toLowerCase().includes(search.toLowerCase()) ||
    d.nomor_referensi?.toLowerCase().includes(search.toLowerCase())
  )

  const totalNilai = filtered.reduce((s, d) => s + parseFloat(d.total_harga || 0), 0)

  const riwayatBarang = historyBarang
    ? data.filter(d => d.barang_id === historyBarang.barang_id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : []
  const riwayatTotalQty = riwayatBarang.reduce((s, d) => s + parseFloat(d.jumlah || 0), 0)
  const riwayatTotalNilai = riwayatBarang.reduce((s, d) => s + parseFloat(d.total_harga || 0), 0)

  if (!activeProject) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <p>Pilih project terlebih dahulu</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader title="Stok Masuk" subtitle={`${activeProject.nama_project}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" icon={Download} size="sm"
              onClick={() => { exportService.exportStokMasukExcel(filtered, activeProject?.nama_project); toast.success('Excel diunduh') }}>
              Export Excel
            </Button>
            <Button icon={Plus} onClick={() => setModal(true)}>Tambah Stok Masuk</Button>
          </div>
        } />

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-600 mb-1">Total Transaksi</p><p className="text-2xl font-bold text-green-700">{filtered.length}</p></div>
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-600 mb-1">Total Nilai Masuk</p><p className="text-xl font-bold text-blue-700">{formatRupiah(totalNilai)}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-xs text-purple-600 mb-1">Jenis Barang</p><p className="text-2xl font-bold text-purple-700">{new Set(filtered.map(d => d.barang_id)).size}</p></div>
      </div>

      <Card>
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cari barang / nomor referensi..." /></div>
        <Table loading={loading} data={filtered} columns={[
          { header: 'Tanggal', render: r => formatTanggal(r.created_at) },
          { header: 'Barang', render: r => (
            <button type="button" className="text-left hover:underline decoration-dashed" title="Lihat riwayat barang ini" onClick={() => setHistoryBarang(r)}>
              <p className="font-medium">{r.barang?.nama_barang}</p>
              <p className="text-xs text-gray-400">{r.barang?.kode_barang}</p>
            </button>
          ) },
          { header: 'Jumlah', render: r => <span className="font-semibold text-green-600">+{r.jumlah} {r.barang?.satuan_barang?.singkatan}</span> },
          { header: 'Harga Satuan', render: r => formatRupiah(r.harga_satuan) },
          { header: 'Total Harga', render: r => <span className="font-bold">{formatRupiah(r.total_harga)}</span> },
          { header: 'Sumber', render: r => r.sumber || '-' },
          { header: 'No. Referensi', render: r => r.nomor_referensi || '-' },
          { header: 'Bon', render: r => r.bon_subkon || '-' },
          { header: 'No. Polisi', render: r => r.nomor_polisi || '-' },
          { header: 'Supir', render: r => r.nama_supir || '-' },
          { header: 'No. Surat', render: r => r.nomor_surat || '-' },
          { header: 'Riwayat', className: 'w-10', render: r => (
            <button type="button" onClick={() => setHistoryBarang(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Riwayat barang ini">
              <History size={14} />
            </button>
          ) },
        ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Tambah Stok Masuk">
        <div className="space-y-4">
          <FormField label="Barang" required>
            <DropdownSelect
              searchable
              value={form.barang_id}
              onChange={v => { const b = barang.find(x => x.id === parseInt(v)); setForm(f => ({ ...f, barang_id: v, harga_satuan: b?.harga_beli || '' })) }}
              options={[
                { value: '', label: 'Pilih barang...' },
                ...barang.map(b => ({ value: String(b.id), label: `${b.nama_barang} (Stok: ${b.stok_saat_ini} ${b.satuan_barang?.singkatan})` })),
              ]}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Jumlah" required><Input type="number" min="1" value={form.jumlah} onChange={e => setForm(f => ({ ...f, jumlah: e.target.value }))} placeholder="0" /></FormField>
            <FormField label="Harga Satuan" required><RupiahInput value={form.harga_satuan} onChange={e => setForm(f => ({ ...f, harga_satuan: e.target.value }))} placeholder="0" /></FormField>
          </div>
          {form.jumlah && form.harga_satuan && (
            <div className="bg-green-50 rounded-lg p-3 text-sm">
              <span className="text-green-600">Total: </span>
              <span className="font-bold text-green-700">{formatRupiah(parseFloat(form.jumlah) * parseFloat(form.harga_satuan))}</span>
            </div>
          )}
          <FormField label="Sumber"><Input value={form.sumber} onChange={e => setForm(f => ({ ...f, sumber: e.target.value }))} placeholder="Supplier, pembelian, dll" /></FormField>
          <FormField label="No. Referensi"><Input value={form.nomor_referensi} readOnly className="bg-gray-50 cursor-not-allowed text-gray-500" /></FormField>
          <FormField label="Bon"><Input value={form.bon_subkon} onChange={e => setForm(f => ({ ...f, bon_subkon: e.target.value }))} placeholder="Nomor bon sub kontraktor" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Nomor Polisi"><Input value={form.nomor_polisi} onChange={e => setForm(f => ({ ...f, nomor_polisi: e.target.value }))} placeholder="Contoh: B 1234 XYZ" /></FormField>
            <FormField label="Supir"><Input value={form.nama_supir} onChange={e => setForm(f => ({ ...f, nama_supir: e.target.value }))} placeholder="Nama supir" /></FormField>
          </div>
          <FormField label="Nomor Surat"><Input value={form.nomor_surat} onChange={e => setForm(f => ({ ...f, nomor_surat: e.target.value }))} placeholder="Nomor surat jalan/pengantar" /></FormField>
          <FormField label="Catatan"><Input value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Catatan tambahan" /></FormField>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>Batal</Button>
            <Button onClick={handleSave} loading={saving}>Simpan</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!historyBarang} onClose={() => setHistoryBarang(null)}
        title={`Riwayat Stok Masuk — ${historyBarang?.barang?.nama_barang || ''}`} size="lg">
        {historyBarang && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-xl p-3"><p className="text-xs text-green-600 mb-1">Total Transaksi</p><p className="text-xl font-bold text-green-700">{riwayatBarang.length}</p></div>
              <div className="bg-blue-50 rounded-xl p-3"><p className="text-xs text-blue-600 mb-1">Total Qty Masuk</p><p className="text-xl font-bold text-blue-700">{riwayatTotalQty} {historyBarang.barang?.satuan_barang?.singkatan}</p></div>
              <div className="bg-purple-50 rounded-xl p-3"><p className="text-xs text-purple-600 mb-1">Total Nilai</p><p className="text-lg font-bold text-purple-700">{formatRupiah(riwayatTotalNilai)}</p></div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <Table data={riwayatBarang} emptyMessage="Belum ada riwayat" columns={[
                { header: 'Tanggal', render: r => formatTanggal(r.created_at) },
                { header: 'Jumlah', render: r => <span className="font-semibold text-green-600">+{r.jumlah} {r.barang?.satuan_barang?.singkatan}</span> },
                { header: 'Harga Satuan', render: r => formatRupiah(r.harga_satuan) },
                { header: 'Total Harga', render: r => <span className="font-bold">{formatRupiah(r.total_harga)}</span> },
                { header: 'Sumber', render: r => r.sumber || '-' },
                { header: 'No. Referensi', render: r => r.nomor_referensi || '-' },
              ]} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}