import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { projectSchema, ProjectFormData } from '../../utils/validators'
import { useNotification } from '../../context/NotificationContext'

interface ProjectFormProps {
  editData?: Record<string, unknown> | null
  onClose: () => void
  onSaved: () => void
}

const ProjectForm: React.FC<ProjectFormProps> = ({ editData, onClose, onSaved }) => {
  const { success, error } = useNotification()
  const [karyawanList, setKaryawanList] = useState<{ id: number; nama_karyawan: string }[]>([])

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: { status_project: 'aktif' },
  })

  useEffect(() => {
    supabase.from('karyawan').select('id, nama_karyawan').eq('status_aktif', true).order('nama_karyawan').then(({ data }) => setKaryawanList(data ?? []))
    if (editData) {
      reset({
        kode_project: editData.kode_project as string,
        nama_project: editData.nama_project as string,
        deskripsi: (editData.deskripsi as string) ?? '',
        lokasi: (editData.lokasi as string) ?? '',
        project_manager_id: (editData.project_manager_id as number) ?? null,
        budget_total: (editData.budget_total as number) ?? null,
        tanggal_mulai: editData.tanggal_mulai as string,
        tanggal_selesai: (editData.tanggal_selesai as string) ?? '',
        status_project: editData.status_project as string,
      })
    }
  }, [editData, reset])

  const onSubmit = async (data: ProjectFormData) => {
    const payload = {
      ...data,
      tanggal_selesai: data.tanggal_selesai || null,
      lokasi: data.lokasi || null,
      project_manager_id: data.project_manager_id || null,
    }
    if (editData) {
      const { error: err } = await supabase.from('project').update(payload).eq('id', editData.id as number)
      if (err) { error('Gagal memperbarui: ' + err.message); return }
      success('Project berhasil diperbarui')
    } else {
      const { error: err } = await supabase.from('project').insert(payload)
      if (err) { error('Gagal menambahkan: ' + err.message); return }
      success('Project berhasil ditambahkan')
    }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="text-lg font-semibold">{editData ? 'Edit Project' : 'Tambah Project'}</h3>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Kode Project *</label>
                <input {...register('kode_project')} className="form-input" placeholder="PRJ-001" />
                {errors.kode_project && <p className="form-error">{errors.kode_project.message}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select {...register('status_project')} className="form-select">
                  <option value="aktif">Aktif</option>
                  <option value="selesai">Selesai</option>
                  <option value="ditunda">Ditunda</option>
                  <option value="batal">Batal</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Nama Project *</label>
              <input {...register('nama_project')} className="form-input" placeholder="Pembangunan Gedung A" />
              {errors.nama_project && <p className="form-error">{errors.nama_project.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Lokasi</label>
              <input {...register('lokasi')} className="form-input" placeholder="Jl. Contoh No. 1, Jakarta" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Tanggal Mulai *</label>
                <input {...register('tanggal_mulai')} type="date" className="form-input" />
                {errors.tanggal_mulai && <p className="form-error">{errors.tanggal_mulai.message}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Selesai</label>
                <input {...register('tanggal_selesai')} type="date" className="form-input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Budget Total (Rp)</label>
                <input {...register('budget_total', { valueAsNumber: true })} type="number" min={0} className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Project Manager</label>
                <select {...register('project_manager_id', { valueAsNumber: true })} className="form-select">
                  <option value="">-- Pilih PM --</option>
                  {karyawanList.map(k => <option key={k.id} value={k.id}>{k.nama_karyawan}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Deskripsi</label>
              <textarea {...register('deskripsi')} className="form-textarea" rows={3} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-outline">Batal</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? <span className="loading-spinner w-4 h-4" /> : editData ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectForm
