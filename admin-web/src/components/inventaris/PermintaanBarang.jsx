import { today } from '../../utils/autoFill'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, Check, X, Trash2, Package } from 'lucide-react'
import { Card, Button, Modal, Input, Select, FormField, Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { projectService } from '../../services/projectService'
import { useProject } from '../../context/ProjectContext'
import { useAuth } from '../../context/AuthContext'
import { formatTanggal, getStatusColor, formatNamaStatus } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'

export default function PermintaanBarang() {
  const { activeProject } = useProject()
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [barang, setBarang] = useState([])
  const [karyawan, setKaryawan] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ barang_id: '', jumlah_diminta: '', peminta_id: '', tanggal_permintaan: today(), catatan: '' })

  const load = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    try {
      const filters = { project_id: activeProject.id }
      if (filterStatus !== 'all') filters.status_permintaan = filterStatus
      const [permintaanData, barangData, karyawanData] = await Promise.all([
        inventoryService.getPermintaan(activeProject.id, filters),
        inventoryService.getBarang(),
        projectService.getKaryawanByProject(activeProject.id),
      ])
      setData(permintaanData); setBarang(barangData); setKaryawan(karyawanData.map(pk => pk.karyawan).filter(Boolean))
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [activeProject, filterStatus])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.barang_id || !form.jumlah_diminta) return toast.error('Lengkapi data permintaan')
    if (parseInt(form.jumlah_diminta) <= 0) return toast.error('Jumlah harus lebih dari 0')
    const b = barang.find(b => b.id === parseInt(form.barang_id))
    if (b && parseInt(form.jumlah_diminta) > b.stok_saat_ini) return toast.error(`Stok tidak cukup! Tersedia: ${b.stok_saat_ini}`)
    try {
      await inventoryService.createPermintaan({ project_id: activeProject.id, barang_id: parseInt(form.barang_id), jumlah_diminta: parseInt(form.jumlah_diminta), peminta_id: form.peminta_id ? parseInt(form.peminta_id) : null, tanggal_permintaan: form.tanggal_permintaan, catatan: form.catatan, status_permintaan: 'pending' })
      syncBus.emitAll('stok', 'barang')
      toast.success('Permintaan diajukan'); setModal(false); load()
    } catch (e) { toast.error(e.message) }
  }

  // Kunci per baris agar klik ganda tidak memproses permintaan dua kali
  const busyRef = useRef(new Set())
  const [processing, setProcessing] = useState(new Set())
  const runOnce = async (id, fn) => {
    if (busyRef.current.has(id)) return
    busyRef.current.add(id); setProcessing(new Set(busyRef.current))
    try { await fn() } finally { busyRef.current.delete(id); setProcessing(new Set(busyRef.current)) }
  }

  const handleApprove = (id) => runOnce(id, async () => {
    try { await inventoryService.approvePermintaan(id, user?.karyawan_id); syncBus.emitAll('stok', 'barang'); toast.success('Permintaan disetujui & stok diperbarui'); load() }
    catch (e) { toast.error(e.message); load() }
  })

  const handleReject = (id) => runOnce(id, async () => {
    try { await inventoryService.rejectPermintaan(id); toast.success('Permintaan ditolak'); load() }
    catch (e) { toast.error(e.message); load() }
  })

  const handleDelete = async () => {
    try { await inventoryService.deletePermintaan(deleting.id); toast.success('Permintaan dihapus'); setDeleting(null); load() }
    catch (e) { toast.error(e.message) }
  }

  const filtered = data.filter(d => (d.barang?.nama_barang || '').toLowerCase().includes(search.toLowerCase()) && (filterStatus === 'all' || d.status_permintaan === filterStatus))
  const pending = data.filter(d => d.status_permintaan === 'pending').length
  const approvalRate = data.length ? Math.round((data.filter(d => d.status_permintaan === 'disetujui').length / data.length) * 100) : 0

  return (
    <div className="space-y-4">
      <PageHeader title="Permintaan Barang" subtitle={activeProject?.nama_project}
        action={<Button icon={Plus} onClick={() => { setForm({ barang_id: '', jumlah_diminta: '', peminta_id: '', tanggal_permintaan: today(), catatan: '' }); setModal(true) }} disabled={!activeProject}>Buat Permintaan</Button>} />

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-yellow-50 rounded-xl p-4"><p className="text-xs text-yellow-600 mb-1">Pending</p><p className="text-2xl font-bold text-yellow-700">{pending}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-600 mb-1">Disetujui</p><p className="text-2xl font-bold text-green-700">{data.filter(d => d.status_permintaan === 'disetujui').length}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-600 mb-1">Ditolak</p><p className="text-2xl font-bold text-red-700">{data.filter(d => d.status_permintaan === 'ditolak').length}</p></div>
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-600 mb-1">Approval Rate</p><p className="text-2xl font-bold text-blue-700">{approvalRate}%</p></div>
      </div>

      <Card>
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="flex-1 min-w-40"><SearchBar value={search} onChange={setSearch} placeholder="Cari nama barang..." /></div>
          <DropdownSelect
            value={filterStatus}
            onChange={v => setFilterStatus(v)}
            className="w-auto"
            options={[
              { value: 'all', label: 'Semua Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'disetujui', label: 'Disetujui' },
              { value: 'ditolak', label: 'Ditolak' },
            ]}
          />
        </div>
        <Table loading={loading} data={filtered} columns={[
          { header: 'Barang', render: r => <div><p className="font-medium">{r.barang?.nama_barang}</p><p className="text-xs text-gray-400">{r.barang?.kode_barang}</p></div> },
          { header: 'Peminta', render: r => r.karyawan?.nama_karyawan || <span className="text-gray-400">-</span> },
          { header: 'Jumlah', render: r => <span className="font-bold">{r.jumlah_diminta} {r.barang?.satuan_barang?.singkatan}</span> },
          { header: 'Stok Tersedia', render: r => <span className={r.barang?.stok_saat_ini < r.jumlah_diminta ? 'text-red-600 font-medium' : 'text-gray-700'}>{r.barang?.stok_saat_ini} {r.barang?.satuan_barang?.singkatan}</span> },
          { header: 'Tanggal', render: r => formatTanggal(r.tanggal_permintaan) },
          { header: 'Status', render: r => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status_permintaan)}`}>{formatNamaStatus(r.status_permintaan)}</span> },
          { header: 'Catatan', render: r => <span className="text-xs text-gray-400">{r.catatan || '-'}</span> },
          {
            header: 'Aksi', className: 'w-28', render: r => (
              <div className="flex gap-1">
                {r.status_permintaan === 'pending' && <>
                  <button onClick={() => handleApprove(r.id)} disabled={processing.has(r.id)} className="p-1.5 rounded hover:bg-green-50 text-green-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Setujui"><Check size={14} /></button>
                  <button onClick={() => handleReject(r.id)} disabled={processing.has(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Tolak"><X size={14} /></button>
                </>}
                {r.status_permintaan !== 'disetujui' && <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Hapus"><Trash2 size={14} /></button>}
              </div>
            )
          },
        ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Buat Permintaan Barang" size="sm">
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
          {form.barang_id && (() => {
            const b = barang.find(b => b.id === parseInt(form.barang_id))
            return b && <div className={`text-xs rounded-lg p-2 ${b.stok_saat_ini <= b.stok_minimal ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>Stok tersedia: {b.stok_saat_ini} {b.satuan_barang?.singkatan} (min: {b.stok_minimal})</div>
          })()}
          <FormField label="Jumlah Diminta" required><Input type="number" value={form.jumlah_diminta} onChange={e => setForm(f => ({ ...f, jumlah_diminta: e.target.value }))} placeholder="0" min="1" /></FormField>
          <FormField label="Peminta">
            <DropdownSelect
              value={form.peminta_id}
              onChange={v => setForm(f => ({ ...f, peminta_id: v }))}
              options={[
                { value: '', label: 'Pilih peminta...' },
                ...karyawan.map(k => ({ value: String(k.id), label: k.nama_karyawan })),
              ]}
            />
          </FormField>
          <FormField label="Tanggal"><Input type="date" value={form.tanggal_permintaan} onChange={e => setForm(f => ({ ...f, tanggal_permintaan: e.target.value }))} /></FormField>
          <FormField label="Catatan"><Input value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Keperluan permintaan..." /></FormField>
          <div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setModal(false)}>Batal</Button><Button onClick={handleSave}>Ajukan Permintaan</Button></div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} title="Hapus Permintaan" message="Hapus permintaan barang ini?" onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  )
}