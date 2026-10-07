import supabase from './supabaseClient'
import { today } from '../utils/autoFill'

const parseError = (error) => {
  const msg = error?.message || ''
  if (msg.includes('foreign key')) return 'Golongan atau departemen yang dipilih tidak valid.'
  if (msg.includes('not-null') || msg.includes('null value')) return 'Ada kolom wajib yang tidak diisi.'
  if (msg.includes('violates')) return 'Data tidak dapat disimpan karena konflik dengan data lain.'
  if (msg.includes('duplicate') || msg.includes('unique')) return 'Data sudah ada, gunakan nilai yang berbeda.'
  return msg || 'Terjadi kesalahan, coba lagi.'
}

export const projectService = {
  // === DEPARTEMEN ===
  async getDepartemen() {
    const { data, error } = await supabase.from('departemen').select('*').order('nama_departemen')
    if (error) throw new Error(parseError(error))
    return data
  },
  async createDepartemen(payload) {
    const { data, error } = await supabase.from('departemen').insert(payload).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async updateDepartemen(id, payload) {
    const { data, error } = await supabase.from('departemen').update(payload).eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async deleteDepartemen(id) {
    const { count } = await supabase.from('karyawan').select('id', { count: 'exact' }).eq('departemen_id', id)
    if (count > 0) throw new Error(`Departemen tidak bisa dihapus karena masih digunakan oleh ${count} karyawan.`)
    const { error } = await supabase.from('departemen').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // === JABATAN ===
  async getJabatan() {
    const { data, error } = await supabase.from('jabatan').select('*').order('nama_jabatan')
    if (error) throw new Error(parseError(error))
    return data
  },
  async createJabatan(payload) {
    const { data, error } = await supabase.from('jabatan').insert(payload).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async updateJabatan(id, payload) {
    const { data, error } = await supabase.from('jabatan')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async deleteJabatan(id) {
    const { count } = await supabase.from('karyawan').select('id', { count: 'exact' }).eq('jabatan_id', id)
    if (count > 0) throw new Error(`Jabatan tidak bisa dihapus karena masih digunakan oleh ${count} karyawan.`)
    const { error } = await supabase.from('jabatan').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // === KARYAWAN ===
  async getKaryawan(filters = {}) {
    let query = supabase.from('karyawan')
      .select('*, jabatan(*), departemen(*)')
      .order('nama_karyawan')
    if (filters.status_aktif !== undefined) query = query.eq('status_aktif', filters.status_aktif)
    if (filters.departemen_id) query = query.eq('departemen_id', filters.departemen_id)
    if (filters.jabatan_id) query = query.eq('jabatan_id', filters.jabatan_id)
    const { data, error } = await query
    if (error) throw new Error(parseError(error))
    return data
  },
  async getKaryawanById(id) {
    const { data, error } = await supabase.from('karyawan')
      .select('*, jabatan(*), departemen(*), karyawan_qr_code(*)')
      .eq('id', id).single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async createKaryawan(payload) {
    const { data, error } = await supabase.from('karyawan')
      .insert(payload).select('*, jabatan(*), departemen(*)').single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async updateKaryawan(id, payload) {
    const { data, error } = await supabase.from('karyawan')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id).select('*, jabatan(*), departemen(*)').single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async deleteKaryawan(id) {
    // Hard delete — hapus permanen beserta relasi (ON DELETE CASCADE di DB)
    const { error } = await supabase.from('karyawan')
      .delete()
      .eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // === QR CODE ===
  async getQRCode(karyawanId) {
    const { data, error } = await supabase.from('karyawan_qr_code')
      .select('*').eq('karyawan_id', karyawanId).single()
    if (error && error.code !== 'PGRST116') throw new Error(parseError(error))
    return data
  },
  async upsertQRCode(payload) {
    const { data, error } = await supabase.from('karyawan_qr_code')
      .upsert(payload, { onConflict: 'karyawan_id' }).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  // Insert-only — tolak jika karyawan sudah punya QR (permanen)
  async insertQRCode(payload) {
    const { data, error } = await supabase.from('karyawan_qr_code')
      .insert(payload).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  // === PROJECT ===
  async getProjects(filters = {}) {
    let query = supabase.from('project')
      .select('*, karyawan!project_manager_id(nama_karyawan)')
      .order('status_project', { ascending: true })
      .order('tanggal_mulai', { ascending: false })
    if (filters.status_project) query = query.eq('status_project', filters.status_project)
    const { data, error } = await query
    if (error) throw new Error(parseError(error))
    return data
  },
  async getProjectById(id) {
    const { data, error } = await supabase.from('project')
      .select('*, karyawan!project_manager_id(nama_karyawan)')
      .eq('id', id).single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async createProject(payload) {
    const { data, error } = await supabase.from('project').insert(payload).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async updateProject(id, payload) {
    const { data, error } = await supabase.from('project')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async deleteProject(id) {
    // Cek apakah ada data terkait
    const { count: presensiCount } = await supabase.from('presensi')
      .select('id', { count: 'exact' }).eq('project_id', id)
    if (presensiCount > 0)
      throw new Error(`Project tidak bisa dihapus karena memiliki ${presensiCount} data presensi. Ubah status project menjadi "selesai" saja.`)
    await supabase.from('project_karyawan').delete().eq('project_id', id)
    // kategori_barang sekarang global (gudang pusat, lihat FIX_GUDANG_PUSAT.sql)
    // -- sudah tidak ada project_id, dan memang tidak boleh ikut terhapus
    // hanya karena satu project dihapus (dipakai bersama project lain).
    const { error } = await supabase.from('project').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // === PROJECT KARYAWAN ===
  async getKaryawanByProject(projectId) {
    const { data, error } = await supabase.from('project_karyawan')
      .select('*, karyawan(*, jabatan(*))')
      .eq('project_id', projectId).eq('status_assignment', 'aktif')
    if (error) throw new Error(parseError(error))
    return data
  },
  async getProjectsByKaryawan(karyawanId) {
    const { data, error } = await supabase.from('project_karyawan')
      .select('*, project(*)')
      .eq('karyawan_id', karyawanId).eq('status_assignment', 'aktif')
    if (error) throw new Error(parseError(error))
    return data
  },
  async assignKaryawan(payload) {
    const { data, error } = await supabase.from('project_karyawan')
      .upsert(payload, { onConflict: 'project_id,karyawan_id' }).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async unassignKaryawan(projectId, karyawanId) {
    const { error } = await supabase.from('project_karyawan')
      .update({ status_assignment: 'nonaktif', tanggal_selesai: new Date().toISOString().split('T')[0] })
      .eq('project_id', projectId).eq('karyawan_id', karyawanId)
    if (error) throw new Error(parseError(error))
  },

  // === STATS ===
  async getDashboardStats() {
    const [karyawan, project, presensi, kasbon] = await Promise.all([
      supabase.from('karyawan').select('id', { count: 'exact' }).eq('status_aktif', true),
      supabase.from('project').select('id', { count: 'exact' }).eq('status_project', 'aktif'),
      supabase.from('presensi').select('status_kehadiran').eq('tanggal', today()),
      supabase.from('kasbon').select('sisa_kasbon').eq('status_lunas', false),
    ])
    const totalKaryawan = karyawan.count || 0
    const presensiRows = presensi.data || []
    const hadirHariIni = presensiRows.filter(p => p.status_kehadiran === 'hadir' || p.status_kehadiran === 'belum_lengkap').length
    const belumAbsenHariIni = Math.max(0, totalKaryawan - presensiRows.length)
    return {
      totalKaryawan,
      totalProjectAktif: project.count || 0,
      presensiHariIni: presensiRows.length,
      hadirHariIni,
      belumAbsenHariIni,
      totalKasbon: kasbon.data?.reduce((s, k) => s + parseFloat(k.sisa_kasbon || 0), 0) || 0,
    }
  }
} 