import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Download, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react'
import { Card, Button, Modal, Input, RupiahInput, Select, FormField, Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect } from '../common'
import { FormSection, FieldRow } from '../common/FormSection'
import { inventoryService } from '../../services/inventoryService'
import { useProject } from '../../context/ProjectContext'
import { exportService } from '../../services/exportService'
import { formatRupiah } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'

// Generate kode barang otomatis: BRG-001, BRG-002, dst
const generateKodeBarang = (existingData) => {
  const rows = Array.isArray(existingData) ? existingData.filter(Boolean) : []
  if (rows.length === 0) return 'BRG-001'
  const kodes = rows
    .map(d => d?.kode_barang)
    .filter(k => k?.startsWith('BRG-'))
    .map(k => parseInt(k.replace('BRG-', '')) || 0)
  const max = kodes.length > 0 ? Math.max(...kodes) : 0
  return `BRG-${String(max + 1).padStart(3, '0')}`
}

// Generate nomor referensi stok masuk otomatis
const generateNomorPO = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `PO-${y}${m}${d}-${rand}`
}

const generateNomorSK = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `SK-${y}${m}${d}-${rand}`
}

const AUTO_REFRESH_MS = 45000

export default function BarangList() {
  const { activeProject } = useProject()
  const [data, setData] = useState([])
  const [kategori, setKategori] = useState([])
  const [satuan, setSatuan] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [stokMasukModal, setStokMasukModal] = useState(false)
  const [stokKeluarModal, setStokKeluarModal] = useState(false)
  const [selectedBarang, setSelectedBarang] = useState(null)
  const [search, setSearch] = useState('')
  const [filterKategori, setFilterKategori] = useState('all')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [kategoriBaru, setKategoriBaru] = useState(null) // null = input tersembunyi
  const [form, setForm] = useState({
    kode_barang: '', nama_barang: '', kategori_id: '', satuan_id: '',
    harga_beli: '', harga_jual: '', stok_minimal: '10', deskripsi: ''
  })
  const [stokForm, setStokForm] = useState({
    jumlah: '', harga_satuan: '', sumber: '', nomor_referensi: '', catatan: ''
  })
  const [stokKeluarForm, setStokKeluarForm] = useState({
    jumlah: '', tujuan: '', nomor_referensi: '', catatan: ''
  })

  const load = useCallback(async () => {
    if (!activeProject?.id) {
      setData([])
      setKategori([])
      setSatuan([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [barangData, kategoriData, satuanData] = await Promise.all([
        inventoryService.getBarang(activeProject.id),
        inventoryService.getKategori(activeProject.id),
        inventoryService.getSatuan(),
      ])
      setData(Array.isArray(barangData) ? barangData : [])
      setKategori(Array.isArray(kategoriData) ? kategoriData : [])
      setSatuan(Array.isArray(satuanData) ? satuanData : [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [activeProject])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditing(null)
    setForm({
      kode_barang: generateKodeBarang(data), // Auto-generate kode
      nama_barang: '', kategori_id: '', satuan_id: '',
      harga_beli: '', harga_jual: '', stok_minimal: '10', deskripsi: ''
    })
    setModal(true)
  }

  const openEdit = (d) => {
    setEditing(d)
    setForm({
      kode_barang: d.kode_barang, nama_barang: d.nama_barang,
      kategori_id: d.kategori_id, satuan_id: d.satuan_id,
      harga_beli: d.harga_beli, harga_jual: d.harga_jual || '',
      stok_minimal: d.stok_minimal, deskripsi: d.deskripsi || ''
    })
    setModal(true)
  }

  const openStokMasuk = (r) => {
    setSelectedBarang(r)
    setStokForm({
      jumlah: '', harga_satuan: r.harga_beli || '',
      sumber: '', nomor_referensi: generateNomorPO(), catatan: ''
    })
    setStokMasukModal(true)
  }

  const openStokKeluar = (r) => {
    setSelectedBarang(r)
    setStokKeluarForm({
      jumlah: '', tujuan: '', nomor_referensi: generateNomorSK(), catatan: ''
    })
    setStokKeluarModal(true)
  }

  // Satu simpan dalam satu waktu: cegah klik ganda mencatat transaksi dua kali
  const runSave = async (fn) => {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try { await fn() } finally { savingRef.current = false; setSaving(false) }
  }

  const handleTambahKategori = () => runSave(async () => {
    const nama = (kategoriBaru || '').trim()
    if (!nama) return toast.error('Nama kategori wajib diisi')
    if (kategori.some(k => k.nama_kategori.toLowerCase() === nama.toLowerCase()))
      return toast.error('Kategori sudah ada')
    try {
      const k = await inventoryService.createKategori({ project_id: activeProject.id, nama_kategori: nama })
      setKategori(list => [...list, k].sort((a, b) => a.nama_kategori.localeCompare(b.nama_kategori)))
      setForm(f => ({ ...f, kategori_id: String(k.id) }))
      setKategoriBaru(null)
      toast.success('Kategori ditambahkan')
    } catch (e) { toast.error(e.message) }
  })

  const handleSave = () => runSave(async () => {
    if (!form.kode_barang || !form.nama_barang || !form.kategori_id || !form.satuan_id || !form.harga_beli)
      return toast.error('Lengkapi data barang')
    try {
      const payload = {
        ...form,
        project_id: activeProject.id,
        kategori_id: parseInt(form.kategori_id),
        satuan_id: parseInt(form.satuan_id),
        harga_beli: parseFloat(form.harga_beli),
        harga_jual: form.harga_jual ? parseFloat(form.harga_jual) : null,
        stok_minimal: parseInt(form.stok_minimal)
      }
      if (editing) {
        await inventoryService.updateBarang(editing.id, payload)
        toast.success('Barang berhasil diperbarui')
      } else {
        await inventoryService.createBarang(payload)
        toast.success('Barang berhasil ditambahkan')
      }
      setModal(false)
      load()
    } catch (e) { toast.error(e.message) }
  })

  const handleStokMasuk = () => runSave(async () => {
    if (!stokForm.jumlah || !stokForm.harga_satuan) return toast.error('Jumlah dan harga satuan wajib diisi')
    if (!(parseInt(stokForm.jumlah) > 0)) return toast.error('Jumlah harus lebih dari 0')
    if (parseFloat(stokForm.harga_satuan) < 0) return toast.error('Harga satuan tidak boleh negatif')
    try {
      await inventoryService.createStokMasuk({
        project_id: activeProject.id,
        barang_id: selectedBarang.id,
        jumlah: parseInt(stokForm.jumlah),
        harga_satuan: parseFloat(stokForm.harga_satuan),
        total_harga: parseInt(stokForm.jumlah) * parseFloat(stokForm.harga_satuan),
        sumber: stokForm.sumber,
        nomor_referensi: stokForm.nomor_referensi,
        catatan: stokForm.catatan
      })
      syncBus.emitAll('stok', 'barang')
      toast.success('Stok masuk berhasil dicatat')
      setStokMasukModal(false)
      load()
    } catch (e) { toast.error(e.message) }
  })

  const handleStokKeluar = () => runSave(async () => {
    if (!stokKeluarForm.jumlah || !stokKeluarForm.tujuan) return toast.error('Jumlah dan tujuan wajib diisi')
    const jumlah = parseInt(stokKeluarForm.jumlah)
    if (!(jumlah > 0)) return toast.error('Jumlah harus lebih dari 0')
    if (jumlah > Number(selectedBarang?.stok_saat_ini || 0))
      return toast.error(`Stok tidak mencukupi! Tersedia: ${selectedBarang?.stok_saat_ini ?? 0}`)
    try {
      await inventoryService.createStokKeluar({
        project_id: activeProject.id,
        barang_id: selectedBarang.id,
        jumlah,
        tujuan: stokKeluarForm.tujuan,
        nomor_referensi: stokKeluarForm.nomor_referensi,
        catatan: stokKeluarForm.catatan
      })
      syncBus.emitAll('stok', 'barang')
      toast.success('Stok keluar berhasil dicatat')
      setStokKeluarModal(false)
      load()
    } catch (e) { toast.error(e.message) }
  })

  const handleDelete = async () => {
    try {
      await inventoryService.deleteBarang(deleting.id)
      toast.success('Barang berhasil dihapus')
      setDeleting(null)
      load()
    } catch (e) {
      toast.error(e.message)
      setDeleting(null)
    }
  }

  const safeData = Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : []

  const filtered = safeData.filter(d => {
    const namaBarang = (d.nama_barang || '').toLowerCase()
    const kodeBarang = (d.kode_barang || '').toLowerCase()
    const matchSearch = namaBarang.includes(search.toLowerCase()) ||
      kodeBarang.includes(search.toLowerCase())
    const matchKat = filterKategori === 'all' || Number(d.kategori_id) === Number(filterKategori)
    return matchSearch && matchKat
  })

  const stokKritis = filtered.filter(d => Number(d.stok_saat_ini || 0) <= Number(d.stok_minimal || 0)).length
  const nilaiInventaris = filtered.reduce((s, d) => s + Number(d.stok_saat_ini || 0) * parseFloat(d.harga_beli || 0), 0)

  // Auto refresh
  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(), AUTO_REFRESH_MS)

  return (
    <div className="space-y-4">
      <PageHeader title="Inventaris Barang" subtitle={activeProject?.nama_project}
        action={
          <div className="flex gap-2">
            <Button variant="outline" icon={Download} size="sm"
              onClick={() => { exportService.exportInventarisPDF?.(filtered, activeProject?.nama_project); toast.success('PDF diunduh') }}>
              Export PDF
            </Button>
            <Button icon={Plus} onClick={openAdd} disabled={!activeProject}>Tambah Barang</Button>
          </div>
        } />

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-600 mb-1">Total Item</p>
          <p className="text-2xl font-bold text-blue-700">{safeData.length}</p>
        </div>
        <div className={`rounded-xl p-4 ${stokKritis > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <p className={`text-xs mb-1 ${stokKritis > 0 ? 'text-red-600' : 'text-green-600'}`}>Stok Kritis</p>
          <p className={`text-2xl font-bold ${stokKritis > 0 ? 'text-red-700' : 'text-green-700'}`}>{stokKritis}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 col-span-2">
          <p className="text-xs text-purple-600 mb-1">Nilai Inventaris</p>
          <p className="text-xl font-bold text-purple-700">{formatRupiah(nilaiInventaris)}</p>
        </div>
      </div>

      {stokKritis > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">
            <strong>{stokKritis} barang</strong> memiliki stok di bawah batas minimal. Segera lakukan pengisian stok.
          </p>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex-1 min-w-48">
            <SearchBar value={search} onChange={setSearch} placeholder="Cari nama / kode barang..." />
          </div>
          <DropdownSelect
            value={filterKategori}
            onChange={v => setFilterKategori(v)}
            className="min-w-[160px]"
            options={[
              { value: 'all', label: 'Semua Kategori' },
              ...kategori.map(k => ({ value: String(k.id), label: k.nama_kategori })),
            ]}
          />
        </div>

        <Table loading={loading} data={filtered} columns={[
          { header: 'Kode', render: r => <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r?.kode_barang || '-'}</span> },
          { header: 'Nama Barang', render: r => (
            <div>
              <p className="font-medium">{r?.nama_barang || '-'}</p>
              <p className="text-xs text-gray-400">{r?.kategori_barang?.nama_kategori || '-'}</p>
            </div>
          )},
          { header: 'Stok', render: r => (
            <div className="flex items-center gap-1">
              <span className={`font-bold text-sm ${Number(r?.stok_saat_ini || 0) <= Number(r?.stok_minimal || 0) ? 'text-red-600' : 'text-gray-900'}`}>
                {r?.stok_saat_ini ?? 0}
              </span>
              <span className="text-xs text-gray-400">{r?.satuan_barang?.singkatan || '-'}</span>
              {Number(r?.stok_saat_ini || 0) <= Number(r?.stok_minimal || 0) && <AlertTriangle size={12} className="text-red-500" />}
            </div>
          )},
          { header: 'Min', render: r => <span className="text-xs text-gray-400">{r?.stok_minimal ?? 0} {r?.satuan_barang?.singkatan || '-'}</span> },
          { header: 'Harga Beli', render: r => formatRupiah(r?.harga_beli) },
          { header: 'Nilai Stok', render: r => <span className="font-semibold text-blue-600">{formatRupiah(Number(r?.stok_saat_ini || 0) * parseFloat(r?.harga_beli || 0))}</span> },
          { header: 'Aksi', className: 'w-36', render: r => (
            <div className="flex gap-1">
              <button onClick={() => openStokMasuk(r)} className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Stok Masuk">
                <ArrowUp size={14} />
              </button>
              <button onClick={() => openStokKeluar(r)} className="p-1.5 rounded hover:bg-orange-50 text-orange-500" title="Stok Keluar">
                <ArrowDown size={14} />
              </button>
              <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit">
                <Edit2 size={14} />
              </button>
              <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Hapus">
                <Trash2 size={14} />
              </button>
            </div>
          )},
        ]} />
      </Card>

      {/* Modal Tambah/Edit Barang */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Barang' : 'Tambah Barang'} size="md">
        <div className="space-y-5">
          <FormSection title="Identitas Barang">
            <FieldRow cols={2}>
              <FormField label="Kode Barang" help="Otomatis dari sistem">
                <Input value={form.kode_barang} readOnly className="bg-gray-50 cursor-not-allowed text-gray-500" />
              </FormField>
              <FormField label="Stok Minimal" help="Alert jika stok kurang dari ini">
                <Input type="number" min="0" value={form.stok_minimal}
                  onChange={e => setForm(f => ({ ...f, stok_minimal: e.target.value }))} placeholder="10" />
              </FormField>
            </FieldRow>
            <FormField label="Nama Barang" required help="Nama yang mudah dikenali oleh semua pihak">
              <Input value={form.nama_barang}
                onChange={e => setForm(f => ({ ...f, nama_barang: e.target.value }))}
                placeholder="Contoh: Semen Portland 50kg" />
            </FormField>
            <FieldRow cols={2}>
              <FormField label="Kategori" required>
                <DropdownSelect
                  value={form.kategori_id}
                  onChange={v => setForm(f => ({ ...f, kategori_id: v }))}
                  options={[
                    { value: '', label: '-- Pilih Kategori --' },
                    ...kategori.map(k => ({ value: String(k.id), label: k.nama_kategori })),
                  ]}
                />
                {kategoriBaru === null ? (
                  <button type="button" onClick={() => setKategoriBaru('')}
                    className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                    + Kategori baru
                  </button>
                ) : (
                  <div className="mt-1.5 flex gap-1.5">
                    <Input value={kategoriBaru} autoFocus placeholder="Nama kategori"
                      onChange={e => setKategoriBaru(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleTambahKategori(); if (e.key === 'Escape') setKategoriBaru(null) }} />
                    <Button size="sm" onClick={handleTambahKategori} loading={saving}>Tambah</Button>
                    <Button size="sm" variant="secondary" onClick={() => setKategoriBaru(null)}>Batal</Button>
                  </div>
                )}
              </FormField>
              <FormField label="Satuan" required>
                <DropdownSelect
                  value={form.satuan_id}
                  onChange={v => setForm(f => ({ ...f, satuan_id: v }))}
                  options={[
                    { value: '', label: '-- Pilih Satuan --' },
                    ...satuan.map(s => ({ value: String(s.id), label: `${s.nama_satuan} (${s.singkatan})` })),
                  ]}
                />
              </FormField>
            </FieldRow>
          </FormSection>

          <FormSection title="Harga">
            <FieldRow cols={2}>
              <FormField label="Harga Beli (Rp)" required help="Harga pokok saat membeli">
                <RupiahInput value={form.harga_beli}
                  onChange={e => setForm(f => ({ ...f, harga_beli: e.target.value }))}
                  placeholder="Contoh: 75.000" />
              </FormField>
              <FormField label="Harga Jual (Rp)" help="Opsional">
                <RupiahInput value={form.harga_jual}
                  onChange={e => setForm(f => ({ ...f, harga_jual: e.target.value }))}
                  placeholder="Opsional" />
              </FormField>
            </FieldRow>
          </FormSection>

          <FormField label="Deskripsi / Spesifikasi" help="Opsional">
            <textarea className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              rows={2} value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} placeholder="Keterangan teknis..." />
          </FormField>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Batal</Button>
            <Button className="flex-1" onClick={handleSave} loading={saving}>Simpan Barang</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Stok Masuk */}
      <Modal open={stokMasukModal} onClose={() => setStokMasukModal(false)}
        title={`Stok Masuk — ${selectedBarang?.nama_barang}`} size="sm">
        <div className="space-y-3">
          <div className="bg-green-50 rounded-lg p-3 text-sm flex justify-between">
            <span className="text-green-700">Stok saat ini</span>
            <span className="font-bold text-green-800">{selectedBarang?.stok_saat_ini} {selectedBarang?.satuan_barang?.singkatan}</span>
          </div>
          <FormField label="Jumlah Masuk" required>
            <Input type="number" min="1" value={stokForm.jumlah}
              onChange={e => setStokForm(f => ({ ...f, jumlah: e.target.value }))} placeholder="0" />
          </FormField>
          <FormField label="Harga Satuan (Rp)" required>
            <RupiahInput value={stokForm.harga_satuan}
              onChange={e => setStokForm(f => ({ ...f, harga_satuan: e.target.value }))} />
          </FormField>
          {stokForm.jumlah && stokForm.harga_satuan && (
            <div className="bg-blue-50 rounded-lg p-2 text-sm text-center">
              Total: <strong>{formatRupiah(parseInt(stokForm.jumlah || 0) * parseFloat(stokForm.harga_satuan || 0))}</strong>
            </div>
          )}
          <FormField label="Sumber / Supplier">
            <Input value={stokForm.sumber}
              onChange={e => setStokForm(f => ({ ...f, sumber: e.target.value }))}
              placeholder="CV Maju Jaya, PT Supplier..." />
          </FormField>
          <FormField label="No. Referensi">
            <Input value={stokForm.nomor_referensi}
              onChange={e => setStokForm(f => ({ ...f, nomor_referensi: e.target.value }))} />
          </FormField>
          <FormField label="Catatan">
            <Input value={stokForm.catatan}
              onChange={e => setStokForm(f => ({ ...f, catatan: e.target.value }))} />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setStokMasukModal(false)}>Batal</Button>
            <Button onClick={handleStokMasuk} loading={saving}>Simpan Stok Masuk</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Stok Keluar */}
      <Modal open={stokKeluarModal} onClose={() => setStokKeluarModal(false)}
        title={`Stok Keluar — ${selectedBarang?.nama_barang}`} size="sm">
        <div className="space-y-3">
          <div className={`rounded-lg p-3 text-sm flex justify-between ${selectedBarang?.stok_saat_ini <= 0 ? 'bg-red-50' : 'bg-orange-50'}`}>
            <span className="text-orange-700">Stok tersedia</span>
            <span className={`font-bold ${selectedBarang?.stok_saat_ini <= 0 ? 'text-red-700' : 'text-orange-800'}`}>
              {selectedBarang?.stok_saat_ini} {selectedBarang?.satuan_barang?.singkatan}
            </span>
          </div>
          <FormField label="Jumlah Keluar" required>
            <Input type="number" min="1" max={selectedBarang?.stok_saat_ini} value={stokKeluarForm.jumlah}
              onChange={e => setStokKeluarForm(f => ({ ...f, jumlah: e.target.value }))} placeholder="0" />
          </FormField>
          <FormField label="Tujuan / Keperluan" required>
            <Input value={stokKeluarForm.tujuan}
              onChange={e => setStokKeluarForm(f => ({ ...f, tujuan: e.target.value }))}
              placeholder="Lantai 1, Area X, Pekerjaan Y..." />
          </FormField>
          <FormField label="No. Referensi">
            <Input value={stokKeluarForm.nomor_referensi}
              onChange={e => setStokKeluarForm(f => ({ ...f, nomor_referensi: e.target.value }))} />
          </FormField>
          <FormField label="Catatan">
            <Input value={stokKeluarForm.catatan}
              onChange={e => setStokKeluarForm(f => ({ ...f, catatan: e.target.value }))} />
          </FormField>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setStokKeluarModal(false)}>Batal</Button>
            <Button variant="warning" onClick={handleStokKeluar} loading={saving}>Simpan Stok Keluar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Hapus Barang"
        message={`Hapus barang "${deleting?.nama_barang}"? Barang yang sudah punya riwayat stok masuk, stok keluar, permintaan, atau retur tidak bisa dihapus.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)} />
    </div>
  )
}
