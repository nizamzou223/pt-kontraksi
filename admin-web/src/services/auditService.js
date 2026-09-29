import supabase from './supabaseClient'

export const auditService = {
  async log(userId, projectId, aksi, tabelTarget, idTarget, dataBefore, dataAfter) {
    await supabase.from('audit_log').insert({
      user_id: userId, project_id: projectId, aksi, tabel_target: tabelTarget,
      id_target: idTarget, data_sebelum: dataBefore, data_sesudah: dataAfter,
    })
  },

  async getAuditLog(filters = {}) {
    let query = supabase.from('audit_log')
      .select('*, users!user_id(nama_lengkap, email), project(nama_project)')
      .order('created_at', { ascending: false }).limit(200)
    if (filters.user_id) query = query.eq('user_id', filters.user_id)
    if (filters.aksi) query = query.ilike('aksi', `%${filters.aksi}%`)
    if (filters.tabel_target) query = query.eq('tabel_target', filters.tabel_target)
    if (filters.tanggal_dari) query = query.gte('created_at', filters.tanggal_dari)
    if (filters.tanggal_sampai) query = query.lte('created_at', filters.tanggal_sampai + 'T23:59:59')
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getUserActivity(bulan, tahun) {
    const start = `${tahun}-${String(bulan).padStart(2, '0')}-01`
    const end = new Date(tahun, bulan, 0).toISOString().split('T')[0]
    const { data, error } = await supabase.from('audit_log')
      .select('user_id, aksi, created_at, users!user_id(nama_lengkap)')
      .gte('created_at', start).lte('created_at', end + 'T23:59:59')
    if (error) throw error
    return data
  }
}

export const reportService = {
  async getGajiTrend(bulan, tahun) {
    const start = `${tahun}-${String(bulan - 2).padStart(2, '0')}-01`
    const { data } = await supabase.from('rekap_gaji_mingguan')
      .select('periode_mulai, gaji_bersih, gaji_kotor, total_potongan_kasbon')
      .gte('periode_mulai', start).order('periode_mulai')
    return data || []
  },

  async getKehadiranStats(projectId, bulan, tahun) {
    const start = `${tahun}-${String(bulan).padStart(2, '0')}-01`
    const end = new Date(tahun, bulan, 0).toISOString().split('T')[0]
    let query = supabase.from('presensi')
      .select('status_kehadiran, tanggal')
      .gte('tanggal', start).lte('tanggal', end)
    if (projectId) query = query.eq('project_id', projectId)
    const { data } = await query
    const stats = { hadir: 0, sakit: 0, izin: 0, cuti: 0, libur: 0, alfa: 0 }
    data?.forEach(p => { if (stats[p.status_kehadiran] !== undefined) stats[p.status_kehadiran]++ })
    return stats
  },

  async getLemburStats(bulan, tahun) {
    const start = `${tahun}-${String(bulan).padStart(2, '0')}-01`
    const end = new Date(tahun, bulan, 0).toISOString().split('T')[0]
    const { data } = await supabase.from('lembur')
      .select('total_lembur, durasi_jam, tanggal, status_persetujuan')
      .gte('tanggal', start).lte('tanggal', end)
    return data || []
  },

  // Fix: ambil semua barang lalu filter di JS, bukan column-vs-column di REST
  async getStokKritisSemua() {
    const { data, error } = await supabase.from('barang')
      .select('*, project(nama_project, kode_project), satuan_barang(singkatan)')
      .order('stok_saat_ini', { ascending: true })
    if (error) {
      console.error('getStokKritisSemua error:', error)
      return []
    }
    return (data || []).filter(b => b.stok_saat_ini <= b.stok_minimal)
  },
}