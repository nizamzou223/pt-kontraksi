import React, { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Tag } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { useNotification } from '../../context/NotificationContext'
import { z } from 'zod'

const golonganSchema = z.object({
  nama_jabatan: z.string().min(2, 'Nama golongan minimal 2 karakter').max(100),
  deskripsi: z.string().optional().or(z.literal('')),
})
type GolonganFormData = z.infer<typeof golonganSchema>

interface GolonganFormProps {
  editData?: {
    id: number
    nama_jabatan: string
    gaji_harian: number
    uang_makan: number
    uang_transport: number
    tunjangan_lainnya: number
    deskripsi?: string
  } | null
  onClose: () => void
  onSaved: () => void
}

const GolonganForm: React.FC<GolonganFormProps> = ({ editData, onClose, onSaved }) => {
  const { success, error } = useNotification()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<GolonganFormData>({
    resolver: zodResolver(golonganSchema),
  })

  useEffect(() => {
    if (editData) reset({ nama_jabatan: editData.nama_jabatan, deskripsi: editData.deskripsi ?? '' })
  }, [editData, reset])

  const onSubmit = async (data: GolonganFormData) => {
    const payload = { nama_jabatan: data.nama_jabatan, deskripsi: data.deskripsi || null }
    if (editData) {
      const { error: err } = await supabase.from('jabatan').update(payload).eq('id', editData.id)
      if (err) { error('Gagal memperbarui golongan: ' + err.message); return }
      success('Golongan berhasil diperbarui')
    } else {
      const { error: err } = await supabase.from('jabatan').insert({
        ...payload, gaji_harian: 0, uang_makan: 0, uang_transport: 0, tunjangan_lainnya: 0,
      })
      if (err) { error('Gagal menambah golongan: ' + err.message); return }
      success('Golongan berhasil ditambahkan')
    }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Tag size={15} className="text-indigo-600" />
            </div>
            <h3 className="text-lg font-semibold">{editData ? 'Edit Golongan' : 'Tambah Golongan'}</h3>
          </div>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body space-y-5">

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-700">
              <p className="font-semibold mb-0.5">ℹ️ Golongan = Label Peran / Kelompok Kerja</p>
              <p className="text-xs text-indigo-600 mt-1">Gaji harian setiap karyawan diatur langsung di halaman <strong>Karyawan</strong>, bukan di sini.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">
                Nama Golongan <span className="text-red-500">*</span>
              </label>
              <input
                {...register('nama_jabatan')}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="Contoh: Mandor, Tukang, Helper, Supervisor, Safety Officer..."
              />
              {errors.nama_jabatan && <p className="text-xs text-red-500">{errors.nama_jabatan.message}</p>}
              <p className="text-xs text-gray-400">Nama golongan harus unik</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">Deskripsi <span className="text-gray-400 font-normal">(opsional)</span></label>
              <textarea
                {...register('deskripsi')}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                rows={3}
                placeholder="Tugas dan tanggung jawab golongan ini..."
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-outline">Batal</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? <span className="loading-spinner w-4 h-4" /> : editData ? 'Simpan Perubahan' : 'Tambah Golongan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default GolonganForm
