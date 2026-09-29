import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { useNotification } from '../../context/NotificationContext'
import Card from '../common/index'
import ConfirmDialog from '../common/index'
import LoadingSpinner from '../common/index'

interface Departemen {
  id: number
  nama_departemen: string
  deskripsi: string | null
  created_at: string
}

const DepartemenList: React.FC = () => {
  const [list, setList] = useState<Departemen[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState<Departemen | null>(null)
  const [formData, setFormData] = useState({ nama_departemen: '', deskripsi: '' })
  const [deleteTarget, setDeleteTarget] = useState<Departemen | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { success, error } = useNotification()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('departemen').select('*').order('nama_departemen')
    setList(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openEdit = (d: Departemen) => {
    setEditData(d)
    setFormData({ nama_departemen: d.nama_departemen, deskripsi: d.deskripsi ?? '' })
    setShowForm(true)
  }

  const openAdd = () => {
    setEditData(null)
    setFormData({ nama_departemen: '', deskripsi: '' })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.nama_departemen.trim()) { error('Nama departemen wajib diisi'); return }
    setSaving(true)
    if (editData) {
      const { error: err } = await supabase.from('departemen').update(formData).eq('id', editData.id)
      if (err) error('Gagal memperbarui')
      else { success('Departemen diperbarui'); fetchData(); setShowForm(false) }
    } else {
      const { error: err } = await supabase.from('departemen').insert(formData)
      if (err) error('Gagal menambahkan')
      else { success('Departemen ditambahkan'); fetchData(); setShowForm(false) }
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: err } = await supabase.from('departemen').delete().eq('id', deleteTarget.id)
    if (err) error('Gagal menghapus')
    else { success('Departemen dihapus'); fetchData() }
    setDeleteTarget(null)
    setDeleting(false)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Manajemen Departemen</h2>
          <p className="page-subtitle">{list.length} departemen terdaftar</p>
        </div>
        <button onClick={openAdd} className="btn-primary btn-sm"><Plus size={16} /> Tambah Departemen</button>
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>No</th><th>Nama Departemen</th><th>Deskripsi</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">Belum ada departemen</td></tr>
                ) : list.map((d, i) => (
                  <tr key={d.id}>
                    <td className="text-gray-400">{i + 1}</td>
                    <td className="font-medium">{d.nama_departemen}</td>
                    <td className="text-gray-500">{d.deskripsi ?? '-'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(d)} className="btn-icon"><Pencil size={14} /></button>
                        <button onClick={() => setDeleteTarget(d)} className="btn-icon text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-lg font-semibold">{editData ? 'Edit Departemen' : 'Tambah Departemen'}</h3>
              <button onClick={() => setShowForm(false)} className="btn-icon"><X size={18} /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="form-group">
                <label className="form-label">Nama Departemen *</label>
                <input value={formData.nama_departemen} onChange={e => setFormData(p => ({ ...p, nama_departemen: e.target.value }))} className="form-input" placeholder="HRD, Teknik, dll" />
              </div>
              <div className="form-group">
                <label className="form-label">Deskripsi</label>
                <textarea value={formData.deskripsi} onChange={e => setFormData(p => ({ ...p, deskripsi: e.target.value }))} className="form-textarea" rows={3} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowForm(false)} className="btn-outline">Batal</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <span className="loading-spinner w-4 h-4" /> : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Departemen"
        message={`Hapus departemen "${deleteTarget?.nama_departemen}"?`}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </>
  )
}

export default DepartemenList
