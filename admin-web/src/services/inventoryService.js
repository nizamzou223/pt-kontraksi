/**
 * INVENTORY SERVICE - Bug fixes:
 * Bug #6: stok masuk/keluar pakai RPC atomic (tidak ada race condition)
 * Bug #7: deleteBarang blokir jika ada permintaan pending/disetujui
 */
import supabase from './supabaseClient'

const parseError = (error) => {
  const msg = error?.message || ''
  if (msg.includes('foreign key') || msg.includes('violates')) return 'Data tidak bisa dihapus karena masih digunakan.'
  if (msg.includes('duplicate') || msg.includes('unique')) return 'Data sudah ada.'
  if (msg.includes('Stok tidak mencukupi')) return msg
  if (msg.includes('tidak ditemukan')) return msg
  return msg || 'Terjadi kesalahan.'
}

// Supabase membatasi 1000 baris per request; ambil per halaman sampai habis
// agar riwayat & laporan tidak terpotong diam-diam.
const PAGE = 1000
const fetchAll = async (buildQuery) => {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return { data: rows, error: null }
  }
}

// RPC belum dibuat di database (MIGRATION_INVENTORY_FIX.sql belum dijalankan)
const isMissingFn = (error) =>
  error?.code === 'PGRST202' || /could not find the function|function .* does not exist/i.test(error?.message || '')

export const inventoryService = {
  // === KATEGORI ===
  async getKategori(projectId) {
    const { data, error } = await supabase.from('kategori_barang')
      .select('*').eq('project_id', projectId).order('nama_kategori')
    if (error) throw new Error(parseError(error))
    return data
  },
  async createKategori(payload) {
    const { data, error } = await supabase.from('kategori_barang').insert(payload).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async updateKategori(id, payload) {
    const { data, error } = await supabase.from('kategori_barang').update(payload).eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async deleteKategori(id) {
    const { count } = await supabase.from('barang').select('id', { count: 'exact' }).eq('kategori_id', id)
    if (count > 0) throw new Error(`Kategori tidak bisa dihapus karena masih digunakan oleh ${count} barang.`)
    const { error } = await supabase.from('kategori_barang').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // === SATUAN ===
  async getSatuan() {
    const { data, error } = await supabase.from('satuan_barang').select('*').order('nama_satuan')
    if (error) throw new Error(parseError(error))
    return data
  },
  async createSatuan(payload) {
    const { data, error } = await supabase.from('satuan_barang').insert(payload).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  // === BARANG ===
  async getBarang(projectId) {
    const { data, error } = await fetchAll(() => supabase.from('barang')
      .select('*, kategori_barang(nama_kategori), satuan_barang(nama_satuan, singkatan)')
      .eq('project_id', projectId).order('nama_barang').order('id'))
    if (error) throw new Error(parseError(error))
    return data
  },
  async createBarang(payload) {
    const { data, error } = await supabase.from('barang')
      .insert(payload).select('*, kategori_barang(*), satuan_barang(*)').single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async updateBarang(id, payload) {
    const { data, error } = await supabase.from('barang')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id).select('*, kategori_barang(*), satuan_barang(*)').single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async deleteBarang(id) {
    // Riwayat transaksi tidak boleh ikut terhapus (laporan lama akan berubah)
    const hitung = (table, filter) => {
      let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('barang_id', id)
      return filter ? filter(q) : q
    }
    const [masuk, keluar, permintaan, retur] = await Promise.all([
      hitung('stok_masuk'),
      hitung('stok_keluar'),
      hitung('permintaan_barang', q => q.neq('status_permintaan', 'ditolak')),
      hitung('retur_barang', q => q.neq('status_retur', 'ditolak')),
    ])
    const alasan = [
      masuk.count && `${masuk.count} stok masuk`,
      keluar.count && `${keluar.count} stok keluar`,
      permintaan.count && `${permintaan.count} permintaan`,
      retur.count && `${retur.count} retur`,
    ].filter(Boolean)
    if (alasan.length)
      throw new Error(`Barang tidak bisa dihapus karena sudah punya riwayat: ${alasan.join(', ')}.`)

    // Hanya permintaan/retur yang ditolak yang dibersihkan
    await supabase.from('permintaan_barang').delete().eq('barang_id', id).eq('status_permintaan', 'ditolak')
    await supabase.from('retur_barang').delete().eq('barang_id', id).eq('status_retur', 'ditolak')

    const { error } = await supabase.from('barang').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // === STOK MASUK - BUG #6 FIX: pakai RPC atomic ===
  async getStokMasuk(projectId) {
    const { data, error } = await fetchAll(() => supabase.from('stok_masuk')
      .select('*, barang(nama_barang, kode_barang, satuan_barang(singkatan))')
      .eq('project_id', projectId).order('created_at', { ascending: false }).order('id', { ascending: false }))
    if (error) throw new Error(parseError(error))
    return data
  },
  async createStokMasuk(payload) {
    // BUG #6 FIX: gunakan RPC untuk atomic update stok + insert log
    const { data, error } = await supabase.rpc('tambah_stok_masuk', {
      p_project_id: payload.project_id,
      p_barang_id: payload.barang_id,
      p_jumlah: payload.jumlah,
      p_harga_satuan: payload.harga_satuan,
      p_sumber: payload.sumber || null,
      p_nomor_referensi: payload.nomor_referensi || null,
      p_bon_subkon: payload.bon_subkon || null,
      p_catatan: payload.catatan || null,
      p_nomor_polisi: payload.nomor_polisi || null,
      p_nama_supir: payload.nama_supir || null,
      p_nomor_surat: payload.nomor_surat || null,
    })
    if (error) {
      if (!isMissingFn(error)) throw new Error(parseError(error))
      // Fallback ke manual jika RPC belum ada
      console.warn('RPC tidak tersedia, fallback ke manual:', error.message)
      const { data: barang } = await supabase.from('barang').select('stok_saat_ini').eq('id', payload.barang_id).single()
      const newStok = (barang?.stok_saat_ini || 0) + payload.jumlah
      await supabase.from('barang').update({ stok_saat_ini: newStok, updated_at: new Date().toISOString() }).eq('id', payload.barang_id)
      const { data: inserted, error: e2 } = await supabase.from('stok_masuk')
        .insert({ ...payload, total_harga: payload.jumlah * payload.harga_satuan }).select().single()
      if (e2) throw new Error(parseError(e2))
      return inserted
    }
    return data
  },
  async deleteStokMasuk(id) {
    const { error: rpcErr } = await supabase.rpc('hapus_stok_masuk', { p_id: id })
    if (!rpcErr) return
    if (!isMissingFn(rpcErr)) throw new Error(parseError(rpcErr))

    // Fallback manual (RPC belum tersedia)
    const { data: sm, error: e1 } = await supabase.from('stok_masuk').select('barang_id, jumlah, sumber').eq('id', id).single()
    if (e1 || !sm) throw new Error('Data stok masuk tidak ditemukan.')
    if (sm.sumber?.startsWith('Transfer dari'))
      throw new Error('Stok masuk hasil transfer antar project tidak bisa dihapus (sudah tercatat sebagai stok keluar di project asal).')
    if (sm.sumber?.startsWith('Retur Project'))
      throw new Error('Stok masuk hasil retur tidak bisa dihapus (terikat dengan data retur yang sudah disetujui).')
    const { data: brg } = await supabase.from('barang').select('stok_saat_ini').eq('id', sm.barang_id).single()
    const stok = brg?.stok_saat_ini || 0
    if (stok < sm.jumlah)
      throw new Error(`Tidak bisa dihapus: stok saat ini (${stok}) lebih kecil dari jumlah masuk (${sm.jumlah}) karena sebagian sudah keluar.`)
    const { error } = await supabase.from('stok_masuk').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
    const { error: e2 } = await supabase.from('barang')
      .update({ stok_saat_ini: stok - sm.jumlah, updated_at: new Date().toISOString() })
      .eq('id', sm.barang_id)
    if (e2) throw new Error(parseError(e2))
  },

  // === STOK KELUAR - BUG #6 FIX: pakai RPC atomic ===
  async getStokKeluar(projectId) {
    const { data, error } = await fetchAll(() => supabase.from('stok_keluar')
      .select('*, barang(nama_barang, kode_barang, satuan_barang(singkatan))')
      .eq('project_id', projectId).order('created_at', { ascending: false }).order('id', { ascending: false }))
    if (error) throw new Error(parseError(error))
    return data
  },
  // Catat stok keluar. Bila ada project_tujuan_id (project lain), barang otomatis
  // ditransfer: tercatat Stok Masuk di project tujuan & stoknya bertambah.
  async createStokKeluar(payload) {
    const tujuanId = parseInt(payload.project_tujuan_id)
    if (!tujuanId || tujuanId === payload.project_id) return this._kurangiStok(payload)

    // Transfer atomic: stok keluar di asal + stok masuk di tujuan dalam satu transaksi
    const { error: rpcErr } = await supabase.rpc('transfer_stok', {
      p_project_asal: payload.project_id,
      p_project_tujuan: tujuanId,
      p_barang_id: payload.barang_id,
      p_jumlah: payload.jumlah,
      p_tujuan: payload.tujuan,
      p_nomor_referensi: payload.nomor_referensi || null,
      p_nomor_bon: payload.nomor_bon || null,
      p_catatan_bon: payload.catatan_bon || null,
      p_nomor_rekap: payload.nomor_rekap || null,
      p_catatan: payload.catatan || null,
    })
    if (!rpcErr) return { transfer: true }
    if (!isMissingFn(rpcErr)) throw new Error(parseError(rpcErr))

    // RPC transfer belum ada (MIGRATION_INVENTORY_FIX.sql belum dijalankan):
    // tetap catat stok keluar seperti sebelumnya, tanpa menambah stok di project tujuan.
    console.warn('transfer_stok belum tersedia — hanya dicatat sebagai stok keluar')
    await this._kurangiStok(payload)
    return { transfer: false }
  },

  async _kurangiStok(payload) {
    const hasBon = !!(payload.nomor_bon || payload.catatan_bon || payload.nomor_rekap)

    const { error: rpcErr } = await supabase.rpc('kurangi_stok_keluar', {
      p_project_id: payload.project_id,
      p_barang_id: payload.barang_id,
      p_jumlah: payload.jumlah,
      p_tujuan: payload.tujuan,
      p_nomor_referensi: payload.nomor_referensi || null,
      p_nomor_bon: payload.nomor_bon || null,
      p_catatan_bon: payload.catatan_bon || null,
      p_nomor_rekap: payload.nomor_rekap || null,
      p_catatan: payload.catatan || null,
    })

    if (!rpcErr) return

    // Hanya fallback bila RPC memang belum ada; error lain (mis. stok kurang) diteruskan
    const errMsg = rpcErr.message || ''
    if (!isMissingFn(rpcErr)) throw new Error(parseError(rpcErr))

    // Fallback manual (RPC tidak tersedia)
    console.warn('RPC fallback:', errMsg)
    const { data: brg } = await supabase.from('barang').select('stok_saat_ini').eq('id', payload.barang_id).single()
    if (!brg) throw new Error('Barang tidak ditemukan.')
    if (brg.stok_saat_ini < payload.jumlah)
      throw new Error(`Stok tidak mencukupi! Stok tersedia: ${brg.stok_saat_ini}`)
    await supabase.from('barang').update({
      stok_saat_ini: brg.stok_saat_ini - payload.jumlah,
      updated_at: new Date().toISOString()
    }).eq('id', payload.barang_id)

    const { error: insertErr } = await supabase.from('stok_keluar').insert({
      project_id: payload.project_id,
      barang_id: payload.barang_id,
      jumlah: payload.jumlah,
      tujuan: payload.tujuan,
      nomor_referensi: payload.nomor_referensi || null,
      nomor_bon: payload.nomor_bon || null,
      catatan_bon: payload.catatan_bon || null,
      nomor_rekap: payload.nomor_rekap || null,
      catatan: payload.catatan || null,
    })
    if (insertErr) {
      if (insertErr.message?.includes('schema cache') || insertErr.message?.includes('column')) {
        const { error: e2 } = await supabase.from('stok_keluar').insert({
          project_id: payload.project_id,
          barang_id: payload.barang_id,
          jumlah: payload.jumlah,
          tujuan: payload.tujuan,
          nomor_referensi: payload.nomor_referensi || null,
          catatan: payload.catatan || null,
        })
        if (e2) throw new Error(parseError(e2))
      } else {
        throw new Error(parseError(insertErr))
      }
    }
    return
  },

  // === PERMINTAAN BARANG ===
  async getPermintaan(projectId) {
    const { data, error } = await supabase.from('permintaan_barang')
      .select('*, barang(nama_barang, kode_barang, stok_saat_ini, satuan_barang(singkatan)), karyawan!peminta_id(nama_karyawan)')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    if (error) throw new Error(parseError(error))
    return data
  },
  async createPermintaan(payload) {
    const { data, error } = await supabase.from('permintaan_barang')
      .insert(payload).select('*, barang(nama_barang), karyawan!peminta_id(nama_karyawan)').single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async approvePermintaan(id, karyawanId) {
    // Atomic: cek status pending + kurangi stok + ubah status dalam satu transaksi
    const { error: approveErr } = await supabase.rpc('approve_permintaan', { p_id: id, p_karyawan_id: karyawanId || null })
    if (!approveErr) return
    if (!isMissingFn(approveErr)) throw new Error(parseError(approveErr))

    // Fallback manual (RPC belum tersedia)
    const { data: permintaan } = await supabase.from('permintaan_barang')
      .select('*, barang(stok_saat_ini, project_id)').eq('id', id).single()
    if (!permintaan) throw new Error('Permintaan tidak ditemukan.')
    if (permintaan.status_permintaan !== 'pending')
      throw new Error(`Permintaan sudah diproses (status: ${permintaan.status_permintaan}).`)
    if (permintaan.barang?.project_id !== permintaan.project_id)
      throw new Error('Barang pada permintaan ini milik project lain. Tolak permintaan ini, lalu transfer barang ke project ini lewat Stok Keluar terlebih dahulu.')

    // BUG #7 FIX: validasi stok di backend (bukan frontend) sebagai sumber kebenaran
    if (permintaan.barang.stok_saat_ini < permintaan.jumlah_diminta)
      throw new Error(`Stok tidak mencukupi! Stok saat ini: ${permintaan.barang.stok_saat_ini}, diminta: ${permintaan.jumlah_diminta}`)

    // Atomic kurangi stok via RPC
    const { error: rpcErr } = await supabase.rpc('kurangi_stok_keluar', {
      p_project_id: permintaan.project_id,
      p_barang_id: permintaan.barang_id,
      p_jumlah: permintaan.jumlah_diminta,
      p_tujuan: 'Permintaan Barang #' + id,
      p_nomor_referensi: `PB-${id}`,
      p_catatan: 'Auto dari persetujuan permintaan barang'
    })
    if (rpcErr) {
      if (rpcErr.message?.includes('tidak mencukupi')) throw new Error(rpcErr.message)
      // Fallback manual
      const { error: eUpd } = await supabase.from('barang').update({
        stok_saat_ini: permintaan.barang.stok_saat_ini - permintaan.jumlah_diminta,
        updated_at: new Date().toISOString()
      }).eq('id', permintaan.barang_id)
      if (eUpd) throw new Error(parseError(eUpd))
      const { error: eIns } = await supabase.from('stok_keluar').insert({
        project_id: permintaan.project_id, barang_id: permintaan.barang_id,
        jumlah: permintaan.jumlah_diminta, tujuan: 'Permintaan Barang',
        nomor_referensi: `PB-${id}`, catatan: 'Auto dari persetujuan'
      })
      if (eIns) throw new Error(parseError(eIns))
    }

    const { data, error } = await supabase.from('permintaan_barang').update({
      status_permintaan: 'disetujui',
      disetujui_oleh: karyawanId,
      tanggal_persetujuan: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    }).eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async rejectPermintaan(id) {
    const { data, error } = await supabase.from('permintaan_barang')
      .update({ status_permintaan: 'ditolak', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status_permintaan', 'pending').select().maybeSingle()
    if (error) throw new Error(parseError(error))
    if (!data) throw new Error('Permintaan sudah diproses sebelumnya.')
    return data
  },
  async deletePermintaan(id) {
    const { data: p } = await supabase.from('permintaan_barang').select('status_permintaan').eq('id', id).single()
    if (p?.status_permintaan === 'disetujui')
      throw new Error('Permintaan yang sudah disetujui tidak bisa dihapus.')
    const { error } = await supabase.from('permintaan_barang').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // === RETUR BARANG (barang sisa / pengembalian dari project ke gudang) ===
  async getRetur(projectId) {
    const { data, error } = await supabase.from('retur_barang')
      .select('*, barang(nama_barang, kode_barang, stok_saat_ini, satuan_barang(singkatan)), karyawan!pengembali_id(nama_karyawan)')
      .eq('project_id', projectId).order('created_at', { ascending: false })
    if (error) throw new Error(parseError(error))
    return data
  },
  async getBarangDikirimKeProject(projectId) {
    // Basis pilihan barang retur: barang yang pernah dikirim (stok_keluar) ke project ini
    const { data, error } = await fetchAll(() => supabase.from('stok_keluar')
      .select('barang_id, jumlah, nomor_referensi, barang(nama_barang, kode_barang, stok_saat_ini, satuan_barang(singkatan))')
      .eq('project_id', projectId).order('id'))
    if (error) throw new Error(parseError(error))

    const map = new Map()
    for (const row of data || []) {
      if (!row.barang_id) continue
      const existing = map.get(row.barang_id)
      if (existing) {
        existing.total_dikirim += row.jumlah
        if (row.nomor_referensi && !existing.suratList.includes(row.nomor_referensi)) existing.suratList.push(row.nomor_referensi)
      } else {
        map.set(row.barang_id, { barang_id: row.barang_id, barang: row.barang, total_dikirim: row.jumlah, suratList: row.nomor_referensi ? [row.nomor_referensi] : [] })
      }
    }
    return Array.from(map.values())
  },
  async createRetur(payload) {
    const { data, error } = await supabase.from('retur_barang')
      .insert({ ...payload, status_retur: 'pending' })
      .select('*, barang(nama_barang), karyawan!pengembali_id(nama_karyawan)').single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async approveRetur(id, karyawanId) {
    // Atomic: cek status pending + tambah stok + ubah status dalam satu transaksi
    const { error: approveErr } = await supabase.rpc('approve_retur', { p_id: id, p_karyawan_id: karyawanId || null })
    if (!approveErr) return
    if (!isMissingFn(approveErr)) throw new Error(parseError(approveErr))

    // Fallback manual (RPC belum tersedia)
    const { data: retur } = await supabase.from('retur_barang')
      .select('*, barang(stok_saat_ini)').eq('id', id).single()
    if (!retur) throw new Error('Retur tidak ditemukan.')
    if (retur.status_retur !== 'pending')
      throw new Error(`Retur sudah diproses (status: ${retur.status_retur}).`)

    const nomorReferensi = retur.nomor_surat || `RB-${id}`
    const { error: rpcErr } = await supabase.rpc('tambah_stok_masuk_retur', {
      p_project_id: retur.project_id,
      p_barang_id: retur.barang_id,
      p_jumlah: retur.jumlah_retur,
      p_sumber: 'Retur Project #' + retur.project_id,
      p_nomor_referensi: nomorReferensi,
      p_catatan: 'Auto dari persetujuan retur barang'
    })
    if (rpcErr) {
      // Fallback manual jika RPC belum tersedia
      const { data: brg } = await supabase.from('barang').select('stok_saat_ini, harga_beli').eq('id', retur.barang_id).single()
      const harga = brg?.harga_beli || 0
      const { error: eUpd } = await supabase.from('barang').update({
        stok_saat_ini: (brg?.stok_saat_ini || 0) + retur.jumlah_retur,
        updated_at: new Date().toISOString()
      }).eq('id', retur.barang_id)
      if (eUpd) throw new Error(parseError(eUpd))
      const { error: eIns } = await supabase.from('stok_masuk').insert({
        project_id: retur.project_id, barang_id: retur.barang_id,
        jumlah: retur.jumlah_retur, harga_satuan: harga, total_harga: harga * retur.jumlah_retur,
        sumber: 'Retur Project #' + retur.project_id,
        nomor_referensi: nomorReferensi, catatan: 'Auto dari persetujuan retur barang'
      })
      if (eIns) throw new Error(parseError(eIns))
    }

    const { data, error } = await supabase.from('retur_barang').update({
      status_retur: 'disetujui',
      disetujui_oleh: karyawanId,
      tanggal_persetujuan: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    }).eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },
  async rejectRetur(id) {
    const { data, error } = await supabase.from('retur_barang')
      .update({ status_retur: 'ditolak', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status_retur', 'pending').select().maybeSingle()
    if (error) throw new Error(parseError(error))
    if (!data) throw new Error('Retur sudah diproses sebelumnya.')
    return data
  },
  async deleteRetur(id) {
    const { data: r } = await supabase.from('retur_barang').select('status_retur').eq('id', id).single()
    if (r?.status_retur === 'disetujui')
      throw new Error('Retur yang sudah disetujui tidak bisa dihapus.')
    const { error } = await supabase.from('retur_barang').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  async getStokKritis(projectId) {
    const { data, error } = await supabase.from('barang')
      .select('*, satuan_barang(singkatan)')
      .eq('project_id', projectId).order('stok_saat_ini', { ascending: true })
    if (error) throw new Error(parseError(error))
    return (data || []).filter(b => b.stok_saat_ini <= b.stok_minimal)
  },
}
