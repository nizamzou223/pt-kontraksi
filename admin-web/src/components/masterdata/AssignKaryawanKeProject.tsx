import React, { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { formatDate } from '../../utils/formatters'
import { useNotification } from '../../context/NotificationContext'
import Card from '../common/index'
import Badge from '../common/index'
import LoadingSpinner from '../common/index'
import ConfirmDialog from '../common/index'

interface Assignment {
  id: number
  project_id: number
  karyawan_id: number
  tanggal_mulai: string
  tanggal_selesai: string | null
  status_assignment: string
  catatan: string | null
  project: { nama_project: string; kode_project: string } | null
  karyawan: { nama_karyawan: string; jabatan: { nama_jabatan: string } | null } | null
}

const AssignKaryawanKeProject: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [projects, setProjects] = useState<{ id: number; nama_project: string }[]>([])
  const [karyawanList, setKaryawanList] = useState<{ id: number; nama_karyawan: string }[]>([])
  const [form, setForm] = useState({ project_id: '', karyawan_id: '', tanggal_mulai: '', catatan: '' })
  const [saving, setSaving] = useState(false)
  const { success, error } = useNotification()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('project_karyawan')
      .select(`*, project(nama_project, kode_project), karyawan(nama_karyawan, jabatan(nama_jabatan))`)
      .order('created_at', { ascending: false })
    setAssignments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    supabase.from('project').select('id, nama_project').eq('status_project', 'aktif').then(({ data }) => setProjects(data ?? []))
    supabase.from('karyawan').select('id, nama_karyawan').eq('status_aktif', true).order('nama_karyawan').then(({ data }) => setKaryawanList(data ?? []))
  }, [fetchData])

  const handleSave = async () => {
    if (!form.project_id || !form.karyawan_id || !form.tanggal_mulai) { error('Lengkapi data assignment'); return }
    setSaving(true)
    const { error: err } = await supabase.from('project_karyawan').insert({
      project_id: parseInt(form.project_id),
      karyawan_id: parseInt(form.karyawan_id),
      tanggal_mulai: form.tanggal_mulai,
      catatan: form.catatan || null,
    })
    if (err) error('Gagal assign: ' + err.message)
    else { success('Karyawan berhasil di-assign'); fetchData(); setShowForm(false); setForm({ project_id: '', karyawan_id: '', tanggal_mulai: '', catatan: '' }) }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const { error: err } = await supabase.from('project_karyawan').delete().eq('id', deleteTarget.id)
    if (err) error('Gagal menghapus')
    else { success('Assignment dihapus'); fetchData() }
    setDeleteTarget(null)
    setDeleting(false)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Assign Karyawan ke Project</h2>
          <p className="page-subtitle">{assignments.filter(a => a.status_assignment === 'aktif').length} assignment aktif</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary btn-sm"><Plus size={16} /> Assign Karyawan</button>
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Karyawan</th><th>Project</th><th>Jabatan</th><th>Mulai</th><th>Status</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400"><Users className="w-8 h-8 mx-auto mb-2 opacity-30" />Belum ada assignment</td></tr>
                ) : assignments.map(a => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.karyawan?.nama_karyawan ?? '-'}</td>
                    <td>
                      <div>
                        <p className="font-medium">{a.project?.nama_project ?? '-'}</p>
                        <p className="text-xs text-gray-400">{a.project?.kode_project}</p>
                      </div>
                    </td>
                    <td>{a.karyawan?.jabatan?.nama_jabatan ?? '-'}</td>
                    <td>{formatDate(a.tanggal_mulai)}</td>
                    <td><Badge variant={a.status_assignment === 'aktif' ? 'green' : 'gray'}>{a.status_assignment}</Badge></td>
                    <td>
                      <button onClick={() => setDeleteTarget(a)} className="btn-icon text-red-500"><Trash2 size={14} /></button>
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
              <h3 className="text-lg font-semibold">Assign Karyawan ke Project</h3>
            </div>
            <div className="modal-body space-y-4">
              <div className="form-group">
                <label className="form-label">Project *</label>
                <select value={form.project_id} onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))} className="form-select">
                  <option value="">-- Pilih Project --</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.nama_project}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Karyawan *</label>
                <select value={form.karyawan_id} onChange={e => setForm(p => ({ ...p, karyawan_id: e.target.value }))} className="form-select">
                  <option value="">-- Pilih Karyawan --</option>
                  {karyawanList.map(k => <option key={k.id} value={k.id}>{k.nama_karyawan}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Mulai *</label>
                <input type="date" value={form.tanggal_mulai} onChange={e => setForm(p => ({ ...p, tanggal_mulai: e.target.value }))} className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea value={form.catatan} onChange={e => setForm(p => ({ ...p, catatan: e.target.value }))} className="form-textarea" rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowForm(false)} className="btn-outline">Batal</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <span className="loading-spinner w-4 h-4" /> : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Assignment"
        message={`Hapus assignment "${deleteTarget?.karyawan?.nama_karyawan}" dari "${deleteTarget?.project?.nama_project}"?`}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </>
  )
}

export default AssignKaryawanKeProject
