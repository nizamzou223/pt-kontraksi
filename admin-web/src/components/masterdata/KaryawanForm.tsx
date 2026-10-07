import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, User, DollarSign } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { useNotification } from '../../context/NotificationContext'
import { z } from 'zod'

const karyawanSchema = z.object({
  nama_karyawan: z.string().min(2, 'Nama minimal 2 karakter').max(150),
  jabatan_id: z.number({ invalid_type_error: 'Pilih golongan' }).min(1, 'Pilih golongan'),
  departemen_id: z.number().optional().nullable(),
  gaji_harian_override: z.number({ invalid_type_error: 'Masukkan gaji harian' }).min(1, 'Gaji harian wajib diisi'),
  tanggal_bergabung: z.string().min(1, 'Tanggal bergabung wajib diisi'),
  status_aktif: z.boolean().default(true),
})
type KaryawanFormData = z.infer<typeof karyawanSchema>

interface KaryawanFormProps {
  editData?: Record<string, unknown> | null
  onClose: () => void
  onSaved: () => void
}

const KaryawanForm: React.FC<KaryawanFormProps> = ({ editData, onClose, onSaved }) => {
  const { success, error } = useNotification()
  const [golonganList, setGolonganList] = useState<{ id: number; nama_jabatan: string }[]>([])
  const [departemenList, setDepartemenList] = useState<{ id: number; nama_departemen: string }[]>([])

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<KaryawanFormData>({
    resolver: zodResolver(karyawanSchema),
    defaultValues: { status_aktif: true, gaji_harian_override: 0 },
  })

  useEffect(() => {
    Promise.all([
      supabase.from('jabatan').select('id, nama_jabatan').order('nama_jabatan'),
      supabase.from('departemen').select('id, nama_departemen').order('nama_departemen'),
    ]).then(([{ data: jab }, { data: dep }]) => {
      setGolonganList(jab ?? [])
      setDepartemenList(dep ?? [])
    })

    if (editData) {
      reset({
        nama_karyawan:        editData.nama_karyawan as string,
        jabatan_id:           editData.jabatan_id as number,
        departemen_id:        (editData.departemen_id as number) ?? null,
        gaji_harian_override: (editData.gaji_harian_override as number) ?? 0,
        tanggal_bergabung:    editData.tanggal_bergabung as string,
        status_aktif:         editData.status_aktif as boolean,
      })
    }
  }, [editData, reset])

  const onSubmit = async (data: KaryawanFormData) => {
    const payload = {
      nama_karyawan:           data.nama_karyawan,
      jabatan_id:              data.jabatan_id,
      departemen_id:           data.departemen_id || null,
      gaji_harian_override:    data.gaji_harian_override,
      uang_makan_override:     0,
      uang_transport_override: 0,
      tanggal_bergabung:       data.tanggal_bergabung,
      status_aktif:            data.status_aktif,
      email:                   null,
      no_hp:                   null,
    }
    if (editData) {
      const { error: err } = await supabase.from('karyawan').update(payload).eq('id', editData.id as number)
      if (err) { error('Gagal memperbarui: ' + err.message); return }
      success('Karyawan berhasil diperbarui')
    } else {
      const { error: err } = await supabase.from('karyawan').insert(payload)
      if (err) { error('Gagal menambahkan: ' + err.message); return }
      success('Karyawan berhasil ditambahkan')
    }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <User size={15} className="text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold">{editData ? 'Edit Karyawan' : 'Tambah Karyawan'}</h3>
          </div>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body space-y-6">

            {/* Data Diri */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <User size={14} className="text-blue-500" />
                <p className="text-sm font-bold text-gray-700">Data Diri</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">
                  Nama Lengkap <span className="text-red-500">*</span>
                </label>
                <input {...register('nama_karyawan')}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Contoh: Budi Santoso" />
                {errors.nama_karyawan && <p className="text-xs text-red-500">{errors.nama_karyawan.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Golongan <span className="text-red-500">*</span>
                  </label>
                  <select {...register('jabatan_id', { valueAsNumber: true })}
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="">-- Pilih Golongan --</option>
                    {golonganList.map(g => <option key={g.id} value={g.id}>{g.nama_jabatan}</option>)}
                  </select>
                  {errors.jabatan_id && <p className="text-xs text-red-500">{errors.jabatan_id.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Departemen</label>
                  <select {...register('departemen_id', { valueAsNumber: true })}
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="">-- Pilih Departemen --</option>
                    {departemenList.map(d => <option key={d.id} value={d.id}>{d.nama_departemen}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    Tanggal Bergabung <span className="text-red-500">*</span>
                  </label>
                  <input {...register('tanggal_bergabung')} type="date"
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  {errors.tanggal_bergabung && <p className="text-xs text-red-500">{errors.tanggal_bergabung.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">Status</label>
                  <select {...register('status_aktif', { setValueAs: v => v === 'true' || v === true })}
                    className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="true">Aktif</option>
                    <option value="false">Non Aktif</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Gaji */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <DollarSign size={14} className="text-green-500" />
                <p className="text-sm font-bold text-gray-700">Gaji Harian</p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700">
                <p className="font-semibold">Cara hitung gaji:</p>
                <p className="mt-0.5">Gaji per jam = Gaji Harian ÷ 8 jam. Uang makan & transport diisi saat input presensi harian.</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">
                  Gaji Harian (Rp) <span className="text-red-500">*</span>
                </label>
                <input {...register('gaji_harian_override', { valueAsNumber: true })}
                  type="number" min={0}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="Contoh: 250000" />
                {errors.gaji_harian_override && <p className="text-xs text-red-500">{errors.gaji_harian_override.message}</p>}
                <p className="text-xs text-gray-400">Nilai ini khusus karyawan ini — bukan dari golongan</p>
              </div>
            </div>

            {/* Info Pembayaran */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
              Metode pembayaran gaji: <strong>Tunai</strong>
            </div>

          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-outline">Batal</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? <span className="loading-spinner w-4 h-4" /> : editData ? 'Simpan Perubahan' : 'Tambah Karyawan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default KaryawanForm
