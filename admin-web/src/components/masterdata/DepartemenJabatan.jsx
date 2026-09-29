import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Building } from 'lucide-react'
import { Card, Button, Modal, Input, Textarea, FormField, Table, PageHeader, ConfirmDialog, SearchBar } from '../common'
import { projectService } from '../../services/projectService'
import { formatTanggal } from '../../utils/formatters'

// ======================== DEPARTEMEN ========================
export function DepartemenList() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [form, setForm] = useState({ nama_departemen: '', deskripsi: '' })
  const [search, setSearch] = useState('')

  const load = async () => { setLoading(true); try { setData(await projectService.getDepartemen()) } catch (e) { toast.error(e.message) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm({ nama_departemen: '', deskripsi: '' }); setModal(true) }
  const openEdit = (d) => { setEditing(d); setForm({ nama_departemen: d.nama_departemen, deskripsi: d.deskripsi || '' }); setModal(true) }

  const handleSave = async () => {
    if (!form.nama_departemen.trim()) return toast.error('Nama departemen wajib diisi')
    try {
      if (editing) { await projectService.updateDepartemen(editing.id, form); toast.success('Departemen diperbarui') }
      else { await projectService.createDepartemen(form); toast.success('Departemen ditambahkan') }
      setModal(false); load()
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    try { await projectService.deleteDepartemen(deleting.id); toast.success('Departemen dihapus'); setDeleting(null); load() }
    catch (e) { toast.error(e.message) }
  }

  const filtered = data.filter(d => d.nama_departemen.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <PageHeader title="Departemen" subtitle="Kelola departemen perusahaan"
        action={<Button icon={Plus} onClick={openAdd}>Tambah Departemen</Button>} />
      <Card>
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cari departemen..." /></div>
        <Table loading={loading} data={filtered} columns={[
          { header: 'Nama Departemen', key: 'nama_departemen', render: r => <span className="font-medium text-gray-900">{r.nama_departemen}</span> },
          { header: 'Deskripsi', key: 'deskripsi', render: r => r.deskripsi || <span className="text-gray-400">-</span> },
          { header: 'Dibuat', render: r => formatTanggal(r.created_at) },
          {
            header: 'Aksi', className: 'w-28', render: r => (
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Edit2 size={14} /></button>
                <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
              </div>
            )
          },
        ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Departemen' : 'Tambah Departemen'} size="sm">
        <div className="space-y-4">
          <FormField label="Nama Departemen" required>
            <Input value={form.nama_departemen} onChange={e => setForm(f => ({ ...f, nama_departemen: e.target.value }))} placeholder="Contoh: Sipil, MEP, Safety..." />
          </FormField>
          <FormField label="Deskripsi">
            <Textarea value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} placeholder="Deskripsi departemen..." />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(false)}>Batal</Button>
            <Button onClick={handleSave}>Simpan</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} title="Hapus Departemen" message={`Hapus departemen "${deleting?.nama_departemen}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  )
}

// ======================== GOLONGAN ========================
export function JabatanList() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ nama_jabatan: '', deskripsi: '' })

  const load = async () => { setLoading(true); try { setData(await projectService.getJabatan()) } catch (e) { toast.error(e.message) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm({ nama_jabatan: '', deskripsi: '' }); setModal(true) }
  const openEdit = (d) => {
    setEditing(d)
    setForm({ nama_jabatan: d.nama_jabatan, deskripsi: d.deskripsi || '' })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.nama_jabatan.trim()) return toast.error('Nama golongan wajib diisi')
    try {
      const payload = { nama_jabatan: form.nama_jabatan.trim(), deskripsi: form.deskripsi }
      if (editing) { await projectService.updateJabatan(editing.id, payload); toast.success('Golongan diperbarui') }
      else { await projectService.createJabatan(payload); toast.success('Golongan ditambahkan') }
      setModal(false); load()
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    try { await projectService.deleteJabatan(deleting.id); toast.success('Golongan dihapus'); setDeleting(null); load() }
    catch (e) { toast.error(e.message) }
  }

  const filtered = data.filter(d => d.nama_jabatan.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-4">
      <PageHeader title="Golongan" subtitle="Kelola golongan / peran karyawan"
        action={<Button icon={Plus} onClick={openAdd}>Tambah Golongan</Button>} />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-600 mb-1">Total Golongan</p><p className="text-2xl font-bold text-blue-700">{data.length}</p></div>
        <div className="bg-indigo-50 rounded-xl p-4"><p className="text-xs text-indigo-600 mb-1">Gaji & tunjangan diatur per karyawan</p><p className="text-sm font-medium text-indigo-700">Lihat halaman Karyawan</p></div>
      </div>

      <Card>
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cari golongan..." /></div>
        <Table loading={loading} data={filtered} columns={[
          { header: 'Nama Golongan', render: r => <span className="font-medium text-gray-900">{r.nama_jabatan}</span> },
          { header: 'Deskripsi', render: r => r.deskripsi || <span className="text-gray-400">-</span> },
          {
            header: 'Aksi', className: 'w-24', render: r => (
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Edit2 size={14} /></button>
                {r.is_deletable !== false && <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>}
              </div>
            )
          },
        ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Golongan' : 'Tambah Golongan'} size="sm">
        <div className="space-y-4">
          <FormField label="Nama Golongan" required>
            <Input value={form.nama_jabatan} onChange={e => setForm(f => ({ ...f, nama_jabatan: e.target.value }))} placeholder="Mandor, Tukang, Helper..." />
          </FormField>
          <FormField label="Deskripsi">
            <Textarea value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} placeholder="Deskripsi golongan..." />
          </FormField>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(false)}>Batal</Button>
            <Button onClick={handleSave}>Simpan</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} title="Hapus Golongan" message={`Hapus golongan "${deleting?.nama_jabatan}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  )
}
