import { z } from 'zod'

export const jabatanSchema = z.object({
  nama_jabatan: z.string().min(2, 'Nama jabatan minimal 2 karakter').max(100),
  gaji_harian: z.number().min(0, 'Gaji harian tidak boleh negatif'),
  uang_makan: z.number().min(0).default(0),
  uang_transport: z.number().min(0).default(0),
  tunjangan_lainnya: z.number().min(0).default(0),
  deskripsi: z.string().optional(),
})

export const karyawanSchema = z.object({
  nama_karyawan: z.string().min(2, 'Nama minimal 2 karakter').max(150),
  nik: z.string().regex(/^\d{16}$/, 'NIK harus tepat 16 digit angka'),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  no_hp: z.string().max(15).optional().or(z.literal('')),
  jabatan_id: z.number().min(1, 'Pilih jabatan'),
  departemen_id: z.number().optional().nullable(),
  gaji_harian_override: z.number().optional().nullable(),
  uang_makan_override: z.number().optional().nullable(),
  uang_transport_override: z.number().optional().nullable(),
  no_rekening: z.string().max(30).optional().or(z.literal('')),
  nama_bank: z.string().max(50).optional().or(z.literal('')),
  tanggal_bergabung: z.string().min(1, 'Tanggal bergabung wajib diisi'),
  status_aktif: z.boolean().default(true),
})

export const projectSchema = z.object({
  kode_project: z.string().min(2, 'Kode project minimal 2 karakter').max(50),
  nama_project: z.string().min(3, 'Nama project minimal 3 karakter').max(150),
  deskripsi: z.string().optional(),
  lokasi: z.string().optional().or(z.literal('')),
  project_manager_id: z.number().optional().nullable(),
  budget_total: z.number().min(0).optional().nullable(),
  tanggal_mulai: z.string().min(1, 'Tanggal mulai wajib diisi'),
  tanggal_selesai: z.string().optional().or(z.literal('')),
  status_project: z.string().default('aktif'),
})

export const presensiSchema = z.object({
  project_id: z.number().min(1, 'Pilih project'),
  karyawan_id: z.number().min(1, 'Pilih karyawan'),
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  jam_masuk: z.string().optional().or(z.literal('')),
  jam_keluar: z.string().optional().or(z.literal('')),
  status_kehadiran: z.string().default('hadir'),
  uang_makan: z.number().min(0).default(0),
  uang_transport: z.number().min(0).default(0),
  metode_input: z.string().default('manual'),
  catatan: z.string().optional(),
})

export const lemburSchema = z.object({
  project_id: z.number().min(1, 'Pilih project'),
  karyawan_id: z.number().min(1, 'Pilih karyawan'),
  tanggal: z.string().min(1, 'Tanggal wajib diisi'),
  jam_mulai: z.string().min(1, 'Jam mulai wajib diisi'),
  jam_selesai: z.string().min(1, 'Jam selesai wajib diisi'),
  tarif_lembur: z.number().min(0, 'Tarif lembur tidak boleh negatif'),
  catatan: z.string().optional(),
})

export const kasbonSchema = z.object({
  project_id: z.number().min(1, 'Pilih project'),
  karyawan_id: z.number().min(1, 'Pilih karyawan'),
  jumlah_kasbon: z.number().min(1, 'Jumlah kasbon harus lebih dari 0'),
  tanggal_kasbon: z.string().min(1, 'Tanggal wajib diisi'),
  catatan: z.string().optional(),
})

export const barangSchema = z.object({
  project_id: z.number().min(1, 'Pilih project'),
  kode_barang: z.string().min(2).max(50),
  nama_barang: z.string().min(2).max(150),
  kategori_id: z.number().min(1, 'Pilih kategori'),
  satuan_id: z.number().min(1, 'Pilih satuan'),
  harga_beli: z.number().min(0),
  harga_jual: z.number().min(0).optional().nullable(),
  stok_saat_ini: z.number().min(0).default(0),
  stok_minimal: z.number().min(0).default(10),
  deskripsi: z.string().optional(),
})

export const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
})

export type JabatanFormData = z.infer<typeof jabatanSchema>
export type KaryawanFormData = z.infer<typeof karyawanSchema>
export type ProjectFormData = z.infer<typeof projectSchema>
export type PresensiFormData = z.infer<typeof presensiSchema>
export type LemburFormData = z.infer<typeof lemburSchema>
export type KasbonFormData = z.infer<typeof kasbonSchema>
export type BarangFormData = z.infer<typeof barangSchema>
export type LoginFormData = z.infer<typeof loginSchema>
