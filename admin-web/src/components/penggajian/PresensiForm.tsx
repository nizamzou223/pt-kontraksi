import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Clock, CheckCircle } from 'lucide-react'
import { supabase } from '../../services/supabaseClient'
import { useNotification } from '../../context/NotificationContext'
import { hitungDurasiKerja } from '../../utils/calculations'
import { STATUS_KEHADIRAN } from '../../utils/constants'
import Card from '../common/index'
import { z } from 'zod'

// Schema lokal — tidak import dari validators agar bebas dari field email/no_hp
const presensiSchema = z.object({
  project_id: z.number().min(1, 'Pilih project'),
  karyawan_id: z.number().min(1, 'Pilih karyawan'),
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  jam_masuk: z.string().optional().or(z.literal('')),
  jam_keluar: z.string().optional().or(z.literal('')),
  status_kehadiran: z.string().default('hadir'),
  uang_makan: z.number().min(0).default(0),
  uang_transport: z.number().min(0).default(0),
  upah_luar_kota: z.number().min(0).default(0),
  metode_input: z.string().default('manual'),
  catatan: z.string().optional().or(z.literal('')),
})
type PresensiFormData = z.infer<typeof presensiSchema>

// ─── Logika lembur otomatis ───────────────────────────────────────────────────
// Aturan:
//   0–8 jam   → kerja biasa (tidak ada lembur)
//   8–16 jam  → 8 jam normal + sisanya lembur (tarif lembur = gajiPerJam × 1.5)
//   >16 jam   → hari ke-2 dihitung (setiap kelipatan 8 jam = +1 hari kerja)
//
// Fungsi ini HANYA menghitung, tidak menyimpan.
// Penyimpanan lembur dilakukan di payrollService.hitungGajiMingguan via flag presensi.

export function hitungStatusLembur(durasiJam: number | null): {
  jamNormal: number
  jamLembur: number
  hariKerja: number
} {
  if (!durasiJam || durasiJam <= 0) return { jamNormal: 0, jamLembur: 0, hariKerja: 0 }
  const hariKerja = Math.floor(durasiJam / 8)       // setiap 8 jam = 1 hari
  const sisa = durasiJam % 8
  // Hari ke-1: 8 jam normal. Kelebihan = lembur.
  // Hari ke-2 dst: semua dihitung sebagai hari kerja penuh (8 jam)
  if (hariKerja === 0) {
    return { jamNormal: sisa, jamLembur: 0, hariKerja: 0 }
  }
  // Misal 10 jam: hariKerja=1, sisa=2 → 8 jam normal + 2 jam lembur
  // Misal 16 jam: hariKerja=2, sisa=0 → 2 hari kerja, 0 lembur
  // Misal 18 jam: hariKerja=2, sisa=2 → 2 hari kerja + 2 jam lembur
  return {
    jamNormal: hariKerja * 8,
    jamLembur: sisa,
    hariKerja,
  }
}

const PresensiForm: React.FC = () => {
  const { success, error } = useNotification()
  const [projects, setProjects] = useState<{ id: number; nama_project: string }[]>([])
  const [karyawanList, setKaryawanList] = useState<{
    id: number
    nama_karyawan: string
    jabatan: { uang_makan: number; uang_transport: number } | null
  }[]>([])
  const [savedCount, setSavedCount] = useState(0)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<PresensiFormData>({
    resolver: zodResolver(presensiSchema),
    defaultValues: {
      tanggal: new Date().toISOString().split('T')[0],
      status_kehadiran: 'hadir',
      uang_makan: 0,
      uang_transport: 0,
      upah_luar_kota: 0,
      metode_input: 'manual',
    },
  })

  const watchKaryawan = watch('karyawan_id')
  const watchProject = watch('project_id')
  const watchJamMasuk = watch('jam_masuk')
  const watchJamKeluar = watch('jam_keluar')

  useEffect(() => {
    supabase.from('project').select('id, nama_project').eq('status_project', 'aktif').then(({ data }) => setProjects(data ?? []))
  }, [])

  useEffect(() => {
    if (!watchProject) return
    supabase
      .from('project_karyawan')
      .select(`karyawan_id, karyawan(id, nama_karyawan, jabatan(uang_makan, uang_transport))`)
      .eq('project_id', watchProject)
      .eq('status_assignment', 'aktif')
      .then(({ data }) => {
        const list = (data ?? []).map((a: Record<string, unknown>) => {
          const k = a.karyawan as { id: number; nama_karyawan: string; jabatan: { uang_makan: number; uang_transport: number }[] | null }
          return {
            id: k.id,
            nama_karyawan: k.nama_karyawan,
            jabatan: k.jabatan?.[0] ?? null,
          }
        })
        setKaryawanList(list)
      })
  }, [watchProject])

  useEffect(() => {
    const karyawan = karyawanList.find(k => k.id === watchKaryawan)
    if (karyawan?.jabatan) {
      setValue('uang_makan', karyawan.jabatan.uang_makan)
      setValue('uang_transport', karyawan.jabatan.uang_transport)
    }
  }, [watchKaryawan, karyawanList, setValue])

  const durasi = watchJamMasuk && watchJamKeluar ? hitungDurasiKerja(watchJamMasuk, watchJamKeluar) : null
  const statusLembur = hitungStatusLembur(durasi)

  const onSubmit = async (data: PresensiFormData) => {
    const payload = {
      ...data,
      jam_masuk: data.jam_masuk || null,
      jam_keluar: data.jam_keluar || null,
      durasi_jam: durasi,
      upah_luar_kota: data.upah_luar_kota || 0,
    }
    // Constraint unik di presensi cuma (karyawan_id, tanggal) -- lihat
    // FIX_PRESENSI_UNIQUE_CONSTRAINT.sql
    const { error: err } = await supabase.from('presensi').upsert(payload, { onConflict: 'karyawan_id,tanggal' })
    if (err) { error('Gagal menyimpan presensi: ' + err.message); return }
    success('Presensi berhasil disimpan')
    setSavedCount(p => p + 1)
    const projectId = data.project_id
    const tgl = data.tanggal
    reset({ tanggal: tgl, project_id: projectId, status_kehadiran: 'hadir', uang_makan: 0, uang_transport: 0, upah_luar_kota: 0, metode_input: 'manual' })
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2 className="page-title">Input Presensi</h2>
          <p className="page-subtitle">Catat kehadiran karyawan per project</p>
        </div>
        {savedCount > 0 && (
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
            <CheckCircle size={16} />
            {savedCount} presensi tersimpan
          </div>
        )}
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-group">
              <label className="form-label">Project *</label>
              <select {...register('project_id', { valueAsNumber: true })} className="form-select">
                <option value="">-- Pilih Project --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.nama_project}</option>)}
              </select>
              {errors.project_id && <p className="form-error">{errors.project_id.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Karyawan *</label>
              <select {...register('karyawan_id', { valueAsNumber: true })} className="form-select" disabled={!watchProject}>
                <option value="">-- Pilih Karyawan --</option>
                {karyawanList.map(k => <option key={k.id} value={k.id}>{k.nama_karyawan}</option>)}
              </select>
              {errors.karyawan_id && <p className="form-error">{errors.karyawan_id.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label">Tanggal *</label>
              <input {...register('tanggal')} type="date" className="form-input" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-group">
              <label className="form-label">Status Kehadiran *</label>
              <select {...register('status_kehadiran')} className="form-select">
                {Object.entries(STATUS_KEHADIRAN).map(([k, v]) => (
                  <option key={k} value={k}>{(v as {label:string}).label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Jam Masuk</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input {...register('jam_masuk')} type="time" className="form-input pl-9" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Jam Keluar</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input {...register('jam_keluar')} type="time" className="form-input pl-9" />
              </div>
            </div>
          </div>

          {/* Ringkasan durasi & lembur otomatis */}
          {durasi !== null && durasi > 0 && (
            <div className={`border rounded-xl px-4 py-3 space-y-1 ${statusLembur.jamLembur > 0 || statusLembur.hariKerja > 1 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`text-sm font-medium ${statusLembur.jamLembur > 0 || statusLembur.hariKerja > 1 ? 'text-amber-700' : 'text-blue-700'}`}>
                Total kerja: <span className="font-bold">{durasi} jam</span>
                {statusLembur.hariKerja >= 1 && (
                  <span className="ml-2">→ <strong>{statusLembur.hariKerja} hari kerja</strong>{statusLembur.jamLembur > 0 ? ` + ${statusLembur.jamLembur.toFixed(1)} jam lembur` : ''}</span>
                )}
              </p>
              {statusLembur.jamLembur > 0 && (
                <p className="text-xs text-amber-600">⚠️ Lembur {statusLembur.jamLembur.toFixed(1)} jam akan dihitung otomatis saat generate gaji mingguan</p>
              )}
              {statusLembur.hariKerja >= 2 && (
                <p className="text-xs text-amber-600">⚠️ Shift panjang: dihitung sebagai {statusLembur.hariKerja} hari kerja</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="form-group">
              <label className="form-label">Uang Makan (Rp)</label>
              <input {...register('uang_makan', { valueAsNumber: true })} type="number" min={0} className="form-input" />
            </div>
            <div className="form-group">
              <label className="form-label">Uang Transport (Rp)</label>
              <input {...register('uang_transport', { valueAsNumber: true })} type="number" min={0} className="form-input" />
            </div>
            <div className="form-group">
              <label className="form-label">Upah Luar Kota (Rp)</label>
              <input {...register('upah_luar_kota', { valueAsNumber: true })} type="number" min={0} className="form-input" placeholder="0 jika dalam kota" />
              <p className="text-xs text-gray-400 mt-0.5">Input manual per presensi</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Metode Input</label>
              <select {...register('metode_input')} className="form-select">
                <option value="manual">Manual</option>
                <option value="qr_code">QR Code</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Catatan</label>
              <textarea {...register('catatan')} className="form-textarea" rows={2} placeholder="Catatan tambahan..." />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => reset()} className="btn-outline">Reset</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? <span className="loading-spinner w-4 h-4" /> : 'Simpan Presensi'}
            </button>
          </div>
        </form>
      </Card>
    </>
  )
}

export default PresensiForm
