import { today } from '../../utils/autoFill'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, Check, X, Trash2 } from 'lucide-react'
import { Card, Button, Modal, Input, FormField, Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect } from '../common'
import { inventoryService } from '../../services/inventoryService'
import { projectService } from '../../services/projectService'
import { useProject } from '../../context/ProjectContext'
import { useAuth } from '../../context/AuthContext'
import { formatTanggal, getStatusColor, formatNamaStatus } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'

export default function ReturBarang() {
  const { activeProject } = useProject()
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [barangDikirim, setBarangDikirim] = useState([])
  const [karyawan, setKaryawan] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ barang_id: '', jumlah_retur: '', pengembali_id: '', tanggal_retur: today(), nomor_surat: '', catatan: '' })

  const load = useCallback(async () => {
    if (!activeProject) return
    setLoading(true)
    try {
      const [returData, barangData, karyawanData] = await Promise.all([
        inventoryService.getRetur(activeProject.id),
        inventoryService.getBarangDikirimKeProject(activeProject.id),
        projectService.getKaryawanByProject(activeProject.id),
      ])
      setData(returData); setBarangDikirim(barangData); setKaryawan(karyawanData.map(pk => pk.karyawan).filter(Boolean))
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [activeProject])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.barang_id || !form.jumlah_retur) return toast.error('Lengkapi data retur')
    const qty = parseInt(form.jumlah_retur)
    if (!(qty > 0)) return toast.error('Jumlah retur harus lebih dari 0')
    const dikirim = barangDikirim.find(b => String(b.barang_id) === form.barang_id)?.total_dikirim
    if (dikirim != null && qty > dikirim) return toast.error(`Jumlah retur melebihi barang yang dikirim (${dikirim})`)
    try {
      await inventoryService.createRetur({ project_id: activeProject.id, barang_id: parseInt(form.barang_id), jumlah_retur: parseInt(form.jumlah_retur), pengembali_id: form.pengembali_id ? parseInt(form.pengembali_id) : null, tanggal_retur: form.tanggal_retur, nomor_surat: form.nomor_surat || null, catatan: form.catatan })
      syncBus.emitAll('stok', 'barang')
      toast.success('Retur diajukan'); setModal(false); load()
    } catch (e) { toast.error(e.message) }
  }

  // Kunci per baris agar klik ganda tidak memproses retur dua kali
  const busyRef = useRef(new Set())
  const [processing, setProcessing] = useState(new Set())
  const runOnce = async (id, fn) => {
    if (busyRef.current.has(id)) return
    busyRef.current.add(id); setProcessing(new Set(busyRef.current))
    try { await fn() } finally { busyRef.current.delete(id); setProcessing(new Set(busyRef.current)) }
  }

  const handleApprove = (id) => runOnce(id, async () => {
    try { await inventoryService.approveRetur(id, user?.karyawan_id); syncBus.emitAll('stok', 'barang'); toast.success('Retur disetujui & stok diperbarui'); load() }
    catch (e) { toast.error(e.message); load() }
  })

  const handleReject = (id) => runOnce(id, async () => {
    try { await inventoryService.rejectRetur(id); toast.success('Retur ditolak'); load() }
    catch (e) { toast.error(e.message); load() }
  })

  const handleDelete = async () => {
    try { await inventoryService.deleteRetur(deleting.id); toast.success('Retur dihapus'); setDeleting(null); load() }
    catch (e) { toast.error(e.message) }
  }

  const filtered = data.filter(d => (d.barang?.nama_barang || '').toLowerCase().includes(search.toLowerCase()) && (filterStatus === 'all' || d.status_retur === filterStatus))
  const pending = data.filter(d => d.status_retur === 'pending').length
  const approvalRate = data.length ? Math.round((data.filter(d => d.status_retur === 'disetujui').length / data.length) * 100) : 0
  const suratBarangDipilih = barangDikirim.find(b => String(b.barang_id) === form.barang_id)?.suratList || []

  return (
    <div className="space-y-4">
      <PageHeader title="Retur / Sisa Barang" subtitle={activeProject?.nama_project}
        action={<Button icon={Plus} onClick={() => { setForm({ barang_id: '', jumlah_retur: '', pengembali_id: '', tanggal_retur: today(), nomor_surat: '', catatan: '' }); setModal(true) }} disabled={!activeProject}>Buat Retur</Button>} />

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-yellow-50 rounded-xl p-4"><p className="text-xs text-yellow-600 mb-1">Pending</p><p className="text-2xl font-bold text-yellow-700">{pending}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-600 mb-1">Disetujui</p><p className="text-2xl font-bold text-green-700">{data.filter(d => d.status_retur === 'disetujui').length}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-600 mb-1">Ditolak</p><p className="text-2xl font-bold text-red-700">{data.filter(d => d.status_retur === 'ditolak').length}</p></div>
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
          { header: 'Pengembali', render: r => r.karyawan?.nama_karyawan || <span className="text-gray-400">-</span> },
          { header: 'Jumlah Retur', render: r => <span className="font-bold">{r.jumlah_retur} {r.barang?.satuan_barang?.singkatan}</span> },
          { header: 'Tanggal', render: r => formatTanggal(r.tanggal_retur) },
          { header: 'No. Surat', render: r => <span className="text-xs">{r.nomor_surat || '-'}</span> },
          { header: 'Status', render: r => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status_retur)}`}>{formatNamaStatus(r.status_retur)}</span> },
          { header: 'Catatan', render: r => <span className="text-xs text-gray-400">{r.catatan || '-'}</span> },
          {
            header: 'Aksi', className: 'w-28', render: r => (
              <div className="flex gap-1">
                {r.status_retur === 'pending' && <>
                  <button onClick={() => handleApprove(r.id)} disabled={processing.has(r.id)} className="p-1.5 rounded hover:bg-green-50 text-green-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Setujui"><Check size={14} /></button>
                  <button onClick={() => handleReject(r.id)} disabled={processing.has(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Tolak"><X size={14} /></button>
                </>}
                {r.status_retur !== 'disetujui' && <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Hapus"><Trash2 size={14} /></button>}
              </div>
            )
          },
        ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Buat Retur / Sisa Barang" size="sm">
        <div className="space-y-4">
          <FormField label="Barang" required>
            <DropdownSelect
              searchable
              value={form.barang_id}
              onChange={v => setForm(f => ({ ...f, barang_id: v, nomor_surat: '' }))}
              options={[
                { value: '', label: barangDikirim.length ? 'Pilih barang...' : 'Belum ada barang yang dikirim ke project ini' },
                ...barangDikirim.map(b => ({ value: String(b.barang_id), label: `${b.barang?.nama_barang} (Dikirim: ${b.total_dikirim} ${b.barang?.satuan_barang?.singkatan})` })),
              ]}
            />
          </FormField>
          <FormField label="Jumlah Sisa / Retur" required><Input type="number" value={form.jumlah_retur} onChange={e => setForm(f => ({ ...f, jumlah_retur: e.target.value }))} placeholder="0" min="1" /></FormField>
          <FormField label="Pengembali">
            <DropdownSelect
              searchable
              value={form.pengembali_id}
              onChange={v => setForm(f => ({ ...f, pengembali_id: v }))}
              options={[
                { value: '', label: 'Pilih pengembali...' },
                ...karyawan.map(k => ({ value: String(k.id), label: k.nama_karyawan })),
              ]}
            />
          </FormField>
          <FormField label="Tanggal"><Input type="date" value={form.tanggal_retur} onChange={e => setForm(f => ({ ...f, tanggal_retur: e.target.value }))} /></FormField>
          <FormField label="Nomor Surat">
            <DropdownSelect
              searchable
              value={form.nomor_surat}
              onChange={v => setForm(f => ({ ...f, nomor_surat: v }))}
              options={[
                { value: '', label: suratBarangDipilih.length ? 'Pilih nomor surat...' : 'Pilih barang dahulu / belum ada surat jalan' },
                ...suratBarangDipilih.map(s => ({ value: s, label: s })),
              ]}
            />
          </FormField>
          <FormField label="Catatan"><Input value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Alasan retur / sisa barang..." /></FormField>
          <div className="flex gap-2 justify-end"><Button variant="secondary" onClick={() => setModal(false)}>Batal</Button><Button onClick={handleSave}>Ajukan Retur</Button></div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} title="Hapus Retur" message="Hapus retur barang ini?" onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  )
}
