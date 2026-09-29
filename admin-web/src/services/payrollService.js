/**
 * PAYROLL SERVICE — Revisi v2 (Fixed):
 * FIX 1: Double-counting lembur — query lemburManual kini exclude record 'Otomatis%'
 * FIX 2: Bug bulan rekap bulanan — _autoRekapBulanan menerima tanggal_pembayaran eksplisit
 * FIX 3: bayarSemuaGaji & bayarGajiByIds meneruskan tanggal bayar ke _autoRekapBulanan
 * FIX 4: Kolom total_uang_lembur di rekap_gaji_bulanan (renamed dari total_lembur_jam)
 * FIX 5: _autoRekapBulanan kini menyimpan breakdown gaji kotor/pokok/makan/transport
 * FIX 6: getGajiBulanan select kolom baru agar UI bisa menampilkan breakdown
 */
import supabase from './supabaseClient'

const parseError = (e) => {
  const msg = e?.message || ''
  if (msg.includes('foreign key') || msg.includes('violates')) return 'Data tidak bisa dihapus karena masih digunakan.'
  if (msg.includes('duplicate') || msg.includes('unique')) return 'Data sudah ada.'
  return msg || 'Terjadi kesalahan.'
}

// ─── Helper: hitung komponen jam dari durasi presensi ────────────────────────
// Aturan:
//   0–8 jam   → kerja biasa, dibayar per jam (gajiHarian/8 × jam)
//   ≥8 jam    → floor(jam/8) = hari kerja, sisa = lembur (rate lembur = gajiPerJam)
export function hitungKomponenJam(durasiJam, gajiHarian) {
  const jam = parseFloat(durasiJam) || 0
  const gh = parseFloat(gajiHarian) || 0
  const gajiPerJam = gh / 8

  if (jam <= 0) return { jamNormal: 0, jamLembur: 0, hariKerja: 0, gajiPokok: 0, gajiLembur: 0 }

  const hariKerja = Math.floor(jam / 8)
  const sisa = jam % 8

  if (hariKerja === 0) {
    return { jamNormal: jam, jamLembur: 0, hariKerja: 0, gajiPokok: jam * gajiPerJam, gajiLembur: 0 }
  }

  const gajiPokok = hariKerja * gh
  const gajiLembur = sisa > 0 ? sisa * gajiPerJam : 0

  return {
    jamNormal: hariKerja * 8,
    jamLembur: sisa,
    hariKerja,
    gajiPokok,
    gajiLembur,
  }
}

// Hari hadir untuk rekap: setiap presensi 'hadir' dihitung MINIMAL 1 hari, walau
// durasinya < 8 jam (gaji-nya tetap proporsional per jam lewat hitungKomponenJam).
// Sebelumnya dipakai floor(jam/8) sehingga hari < 8 jam = 0 dan rekap gaji tidak dibuat.
export function hariHadirDariDurasi(durasiJam) {
  const jam = parseFloat(durasiJam) || 0
  return Math.max(1, Math.floor(jam / 8))
}

// Buang field yang tidak ada di tabel + selipkan upah luar kota ke project_details
function toDbPayload(payload) {
  const { total_jam_kerja, total_jam_lembur, total_upah_luar_kota, ...dbPayload } = payload
  if (total_upah_luar_kota > 0 && dbPayload.project_details) {
    dbPayload.project_details = { ...dbPayload.project_details, _upah_luar_kota: total_upah_luar_kota }
  }
  return dbPayload
}

// Perbandingan tahan urutan key (jsonb dari DB mengurutkan key-nya sendiri)
const stable = (v) => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.keys(x).sort().reduce((o, k) => { o[k] = x[k]; return o }, {})
    : x)

const REKAP_ANGKA = [
  'total_hari_hadir', 'total_gaji_pokok', 'total_uang_makan', 'total_uang_transport',
  'total_uang_lembur', 'gaji_kotor', 'total_potongan_kasbon', 'potongan_lainnya', 'gaji_bersih',
]
// true bila baris rekap di DB berbeda dari hasil hitung terbaru (perlu di-update)
export function rekapBerubah(existing, payload) {
  if (existing.status !== payload.status) return true
  if (REKAP_ANGKA.some(f => Math.round(Number(existing[f] || 0)) !== Math.round(Number(payload[f] || 0)))) return true
  return stable(existing.project_details || {}) !== stable(payload.project_details || {})
}

// Perhitungan gaji mingguan MURNI (tanpa akses database) — mudah diuji.
export function hitungGajiDariData(k, presensi, lemburManual, kasbon, periodeMulai, periodeSelesai) {
  const gh = parseFloat(k.gaji_harian_override || k.jabatan?.gaji_harian || 0)

  let totalHariKerja = 0
  let totalJamNormal = 0
  let totalJamLembur = 0
  let totalPokok     = 0
  let totalLembur    = 0
  let totalMakan     = 0
  let totalTransport = 0
  let totalLuarKota  = 0

  const projectMap = {}

  presensi.forEach(p => {
    const durasi = parseFloat(p.durasi_jam) || 0
    let gajiPokokHariIni = 0

    if (durasi <= 0) {
      // Hadir tanpa jam tercatat → hitung 1 hari penuh
      totalHariKerja   += 1
      totalPokok       += gh
      gajiPokokHariIni  = gh
    } else {
      totalHariKerja += hariHadirDariDurasi(durasi)
      // Sumber tunggal: hitungKomponenJam() — <8 jam dibayar per jam (bukan lembur,
      // bukan 1 hari penuh), ≥8 jam = hari penuh + sisa jam sebagai lembur
      const komponen = hitungKomponenJam(durasi, gh)
      totalJamNormal += komponen.jamNormal
      totalPokok     += komponen.gajiPokok
      gajiPokokHariIni = komponen.gajiPokok
      if (komponen.jamLembur > 0) {
        totalJamLembur += komponen.jamLembur
        totalLembur    += komponen.gajiLembur
      }
    }

    totalMakan     += parseFloat(p.uang_makan     || 0)
    totalTransport += parseFloat(p.uang_transport || 0)
    totalLuarKota  += parseFloat(p.upah_luar_kota || 0)

    const pid = p.project_id || 'unknown'
    if (!projectMap[pid]) projectMap[pid] = {
      nama: p.project?.nama_project || '-',
      kode: p.project?.kode_project || '-',
      hari: 0, gaji: 0,
    }
    projectMap[pid].hari += hariHadirDariDurasi(durasi)
    projectMap[pid].gaji += gajiPokokHariIni
  })

  // Lembur MANUAL saja (record dari input admin, sudah di-filter exclude 'Otomatis%')
  lemburManual.forEach(l => {
    totalLembur    += parseFloat(l.total_lembur || 0)
    totalJamLembur += parseFloat(l.durasi_jam   || 0)
  })

  const totalJamKerja = presensi.reduce((s, p) => s + (parseFloat(p.durasi_jam) || 0), 0)

  const gajiKotor         = totalPokok + totalMakan + totalTransport + totalLuarKota + totalLembur
  const totalSisaKasbon   = kasbon.reduce((s, x) => s + parseFloat(x.sisa_kasbon), 0)
  const totalPotongKasbon = Math.min(totalSisaKasbon, gajiKotor)
  const gajiBersih        = Math.max(0, gajiKotor - totalPotongKasbon)

  return {
    karyawan_id:           k.id,
    periode_mulai:         periodeMulai,
    periode_selesai:       periodeSelesai,
    project_details:       projectMap,
    total_hari_hadir:      totalHariKerja,
    total_jam_kerja:       Math.round(totalJamKerja * 10) / 10,
    total_jam_lembur:      Math.round(totalJamLembur * 10) / 10,
    total_gaji_pokok:      Math.round(totalPokok),
    total_uang_makan:      Math.round(totalMakan),
    total_uang_transport:  Math.round(totalTransport),
    total_upah_luar_kota:  Math.round(totalLuarKota),
    total_uang_lembur:     Math.round(totalLembur),
    gaji_kotor:            Math.round(gajiKotor),
    total_potongan_kasbon: Math.round(totalPotongKasbon),
    potongan_lainnya:      0,
    gaji_bersih:           Math.round(gajiBersih),
    // null hanya bila TIDAK ada presensi hadir sama sekali (jangan berdasar jumlah hari
    // penuh — hari < 8 jam tetap punya gaji per jam yang harus muncul di rekap).
    status:                presensi.length === 0 ? null : 'draft',
  }
}

export const payrollService = {

  // ============================================================
  // PRESENSI
  // ============================================================
  async getPresensi(filters = {}) {
    let q = supabase.from('presensi')
      .select('*, karyawan(id_karyawan, nama_karyawan, nik, jabatan(nama_jabatan)), project(nama_project, kode_project)')
      .order('tanggal', { ascending: false })
    if (filters.project_id) q = q.eq('project_id', filters.project_id)
    if (filters.karyawan_id) q = q.eq('karyawan_id', filters.karyawan_id)
    if (filters.tanggal) q = q.eq('tanggal', filters.tanggal)
    if (filters.tanggal_dari) q = q.gte('tanggal', filters.tanggal_dari)
    if (filters.tanggal_sampai) q = q.lte('tanggal', filters.tanggal_sampai)
    if (filters.status_kehadiran) q = q.eq('status_kehadiran', filters.status_kehadiran)
    const { data, error } = await q
    if (error) throw new Error(parseError(error))
    return data
  },

  async upsertPresensi(payload) {
    const { data, error } = await supabase.from('presensi')
      .upsert(payload, { onConflict: 'karyawan_id,tanggal' })
      .select('*, karyawan(nama_karyawan, gaji_harian_override, jabatan(gaji_harian)), project(nama_project)').single()
    if (error) throw new Error(parseError(error))

    // ── Auto-sync lembur: delete-then-insert agar tidak pernah duplikat ──
    const durasi     = parseFloat(data?.durasi_jam || payload.durasi_jam || 0)
    const karyawanId = data.karyawan_id || payload.karyawan_id
    const tanggal    = data.tanggal    || payload.tanggal
    const kar        = data.karyawan

    // Hapus semua auto-lembur lama dulu
    await supabase.from('lembur')
      .delete().eq('karyawan_id', karyawanId).eq('tanggal', tanggal).like('catatan', 'Otomatis%')

    if (data?.status_kehadiran === 'hadir' && durasi > 8) {
      try {
        const projectId   = data.project_id || payload.project_id || null
        const sisaJam     = durasi % 8
        const gh          = parseFloat(kar?.gaji_harian_override || kar?.jabatan?.gaji_harian || 0)
        const tarifLembur = gh > 0 ? Math.round(gh / 8) : 0

        if (sisaJam > 0.1) {
          const hariPenuh   = Math.floor(durasi / 8)
          const jamMulaiH   = 7 + hariPenuh * 8
          const jamSelesaiH = jamMulaiH + Math.floor(sisaJam)
          const jamSelesaiM = Math.round((sisaJam % 1) * 60)
          await supabase.from('lembur').insert({
            project_id: projectId, karyawan_id: karyawanId, tanggal,
            jam_mulai:          String(jamMulaiH).padStart(2,'0') + ':00',
            jam_selesai:        String(jamSelesaiH).padStart(2,'0') + ':' + String(jamSelesaiM).padStart(2,'0'),
            durasi_jam:         sisaJam,
            tarif_lembur:       tarifLembur,
            total_lembur:       Math.round(sisaJam * tarifLembur),
            status_persetujuan: 'disetujui',
            catatan:            `Otomatis dari presensi (${durasi} jam kerja)`,
          })
        } else if (durasi >= 16) {
          const nHari    = Math.floor(durasi / 8)
          const extraJam = (nHari - 1) * 8
          await supabase.from('lembur').insert({
            project_id: projectId, karyawan_id: karyawanId, tanggal,
            jam_mulai:          '15:00',
            jam_selesai:        String(15 + extraJam).padStart(2,'0') + ':00',
            durasi_jam:         extraJam,
            tarif_lembur:       tarifLembur,
            total_lembur:       0,
            status_persetujuan: 'disetujui',
            catatan:            `Otomatis - Sudah dalam Gaji (${nHari} hari kerja)`,
          })
        }
      } catch (lemburErr) {
        console.warn('[upsertPresensi] auto-lembur error:', lemburErr?.message)
      }
    }

    return data
  },

  async insertPresensiIfNotExists(payload) {
    const { data: existing } = await supabase
      .from('presensi')
      .select('id, status_kehadiran')
      .eq('karyawan_id', payload.karyawan_id)
      .eq('tanggal', payload.tanggal)
      .maybeSingle()
    if (existing) return existing
    const { data, error } = await supabase
      .from('presensi')
      .insert(payload)
      .select('id, status_kehadiran')
      .single()
    if (error) {
      if (error.code === '23505') return null
      throw new Error(parseError(error))
    }
    return data
  },

  async deletePresensi(id) {
    // Hapus lembur otomatis terkait sebelum hapus presensi
    try {
      const { data: pres } = await supabase.from('presensi')
        .select('karyawan_id, tanggal').eq('id', id).single()
      if (pres) {
        await supabase.from('lembur')
          .delete()
          .eq('karyawan_id', pres.karyawan_id)
          .eq('tanggal', pres.tanggal)
          .like('catatan', 'Otomatis%')
      }
    } catch (e) {
      console.warn('[deletePresensi] hapus lembur otomatis:', e?.message)
    }
    const { error } = await supabase.from('presensi').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  // ============================================================
  // LEMBUR
  // ============================================================

  // Re-sync auto-lembur untuk SATU presensi — delete-then-insert agar tidak pernah duplikat
  async resyncLemburForPresensi(presensiId) {
    const { data } = await supabase.from('presensi')
      .select('*, karyawan:karyawan_id(gaji_harian_override, jabatan(gaji_harian))')
      .eq('id', presensiId).single()
    if (!data) return

    const durasi    = parseFloat(data.durasi_jam || 0)
    const karId     = data.karyawan_id
    const tanggal   = data.tanggal
    const projectId = data.project_id
    const kar       = data.karyawan
    const sisaJam   = durasi % 8

    // Hapus semua auto-lembur lama untuk karyawan+tanggal ini dulu (bersihkan duplikat)
    await supabase.from('lembur')
      .delete()
      .eq('karyawan_id', karId)
      .eq('tanggal', tanggal)
      .like('catatan', 'Otomatis%')

    if (data.status_kehadiran !== 'hadir' || durasi <= 8) return

    const gh          = parseFloat(kar?.gaji_harian_override || kar?.jabatan?.gaji_harian || 0)
    const tarifLembur = gh > 0 ? Math.round(gh / 8) : 0

    if (sisaJam > 0.1) {
      // Sisa jam lembur nyata (misal 12h → 4 jam lembur)
      const hariPenuh   = Math.floor(durasi / 8)
      const jamMulaiH   = 7 + hariPenuh * 8
      const jamSelesaiH = jamMulaiH + Math.floor(sisaJam)
      const jamSelesaiM = Math.round((sisaJam % 1) * 60)
      await supabase.from('lembur').insert({
        project_id:         projectId,
        karyawan_id:        karId,
        tanggal,
        jam_mulai:          String(jamMulaiH).padStart(2,'0') + ':00',
        jam_selesai:        String(jamSelesaiH).padStart(2,'0') + ':' + String(jamSelesaiM).padStart(2,'0'),
        durasi_jam:         sisaJam,
        tarif_lembur:       tarifLembur,
        total_lembur:       Math.round(sisaJam * tarifLembur),
        status_persetujuan: 'disetujui',
        catatan:            `Otomatis dari presensi (${durasi} jam kerja)`,
      })
    } else if (durasi >= 16) {
      // Tepat kelipatan 8 (≥16h): record visibilitas Rp 0, sudah masuk gaji
      const nHari    = Math.floor(durasi / 8)
      const extraJam = (nHari - 1) * 8
      await supabase.from('lembur').insert({
        project_id:         projectId,
        karyawan_id:        karId,
        tanggal,
        jam_mulai:          '15:00',
        jam_selesai:        String(15 + extraJam).padStart(2,'0') + ':00',
        durasi_jam:         extraJam,
        tarif_lembur:       tarifLembur,
        total_lembur:       0,
        status_persetujuan: 'disetujui',
        catatan:            `Otomatis - Sudah dalam Gaji (${nHari} hari kerja)`,
      })
    }
  },

  // Sync semua auto-lembur dari presensi dalam rentang tanggal
  async syncAllAutoLembur(tanggalDari, tanggalSampai) {
    const { data: list } = await supabase.from('presensi')
      .select('id')
      .gte('tanggal', tanggalDari)
      .lte('tanggal', tanggalSampai)
    if (!list || list.length === 0) return 0
    await Promise.allSettled(list.map(p => this.resyncLemburForPresensi(p.id)))
    return list.length
  },

  async getLembur(filters = {}) {
    let q = supabase.from('lembur')
      .select('*, karyawan(id_karyawan, nama_karyawan, nik, jabatan(nama_jabatan)), project(nama_project, kode_project)')
      .order('tanggal', { ascending: false })
    if (filters.project_id) q = q.eq('project_id', filters.project_id)
    if (filters.karyawan_id) q = q.eq('karyawan_id', filters.karyawan_id)
    if (filters.status_persetujuan) q = q.eq('status_persetujuan', filters.status_persetujuan)
    if (filters.tanggal_dari) q = q.gte('tanggal', filters.tanggal_dari)
    if (filters.tanggal_sampai) q = q.lte('tanggal', filters.tanggal_sampai)
    const { data, error } = await q
    if (error) throw new Error(parseError(error))
    return data
  },

  async createLembur(payload) {
    const { data, error } = await supabase.from('lembur')
      .insert(payload).select('*, karyawan(nama_karyawan), project(nama_project)').single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async updateLembur(id, payload) {
    const { data, error } = await supabase.from('lembur')
      .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async deleteLembur(id) {
    const { error } = await supabase.from('lembur').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
  },

  async approveLembur(id, userId) {
    const { data, error } = await supabase.from('lembur')
      .update({ status_persetujuan: 'disetujui', disetujui_oleh: userId, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async rejectLembur(id) {
    const { data, error } = await supabase.from('lembur')
      .update({ status_persetujuan: 'ditolak', updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  // ============================================================
  // KASBON
  // ============================================================
  async getKasbon(filters = {}) {
    let q = supabase.from('kasbon')
      .select('*, karyawan(id_karyawan, nama_karyawan, nik, no_rekening, nama_bank), project(nama_project)')
      .order('tanggal_kasbon', { ascending: false })
    if (filters.project_id) q = q.eq('project_id', filters.project_id)
    if (filters.karyawan_id) q = q.eq('karyawan_id', filters.karyawan_id)
    if (filters.status_lunas !== undefined) q = q.eq('status_lunas', filters.status_lunas)
    const { data, error } = await q
    if (error) throw new Error(parseError(error))
    return data
  },

  async createKasbon(payload) {
    const { data, error } = await supabase.from('kasbon')
      .insert({ ...payload, sisa_kasbon: payload.jumlah_kasbon, metode_pembayaran: 'potong_gaji' })
      .select('*, karyawan(nama_karyawan), project(nama_project)').single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async updateKasbon(id, payload) {
    const { data, error } = await supabase.from('kasbon')
      .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async deleteKasbon(id) {
    const { data: k } = await supabase.from('kasbon')
      .select('status_lunas, karyawan_id').eq('id', id).single()
    const karyawanId = k?.karyawan_id
    await supabase.from('pembayaran_otomatis').delete().eq('referensi_id', id)
    const { error } = await supabase.from('kasbon').delete().eq('id', id)
    if (error) throw new Error(parseError(error))
    // Lunas kasbon sudah diproses ke gaji, tidak perlu recalculate rekap
    if (karyawanId && !k?.status_lunas) {
      try {
        const { data: rekapList } = await supabase
          .from('rekap_gaji_mingguan')
          .select('id, periode_mulai, periode_selesai')
          .eq('karyawan_id', karyawanId)
          .eq('status', 'draft')
        for (const rekap of (rekapList || [])) {
          const calc = await this.hitungGajiMingguan(karyawanId, rekap.periode_mulai, rekap.periode_selesai)
          if (calc.status !== null) {
            const { total_jam_kerja, total_jam_lembur, total_upah_luar_kota, ...upd } = calc
            await supabase.from('rekap_gaji_mingguan').update({
              total_potongan_kasbon: upd.total_potongan_kasbon,
              gaji_bersih:           upd.gaji_bersih,
              gaji_kotor:            upd.gaji_kotor,
              total_gaji_pokok:      upd.total_gaji_pokok,
              total_uang_makan:      upd.total_uang_makan,
              total_uang_transport:  upd.total_uang_transport,
              total_uang_lembur:     upd.total_uang_lembur,
              total_hari_hadir:      upd.total_hari_hadir,
              project_details:       upd.project_details,
              updated_at:            new Date().toISOString(),
            }).eq('id', rekap.id)
          } else {
            await supabase.from('rekap_gaji_mingguan').delete().eq('id', rekap.id)
          }
        }
      } catch (e) { console.warn('[deleteKasbon] recalc:', e?.message) }
    }
  },

  async tandaiLunas(id) {
    const { data: kb } = await supabase.from('kasbon')
      .select('karyawan_id, jumlah_kasbon').eq('id', id).single()
    const { count } = await supabase.from('rekap_gaji_mingguan')
      .select('id', { count: 'exact' })
      .eq('karyawan_id', kb?.karyawan_id)
      .eq('status', 'dibayar')
      .gt('total_potongan_kasbon', 0)
    const { data, error } = await supabase.from('kasbon')
      .update({ status_lunas: true, sisa_kasbon: 0, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return {
      ...data,
      _peringatan: count > 0
        ? 'Perhatian: Kasbon ini sudah masuk dalam rekap gaji yang telah dibayar.'
        : null
    }
  },

  // ============================================================
  // HITUNG GAJI MINGGUAN
  // FIX: lemburManual TIDAK lagi mengambil record 'Otomatis%'
  //      untuk mencegah double-counting dengan lembur dari loop presensi
  // ============================================================
  async hitungGajiMingguan(karyawanId, periodeMulai, periodeSelesai) {
    const [presensiRes, lemburManualRes, kasbonRes, karyawanRes] = await Promise.all([
      supabase.from('presensi')
        .select('*, project(id, nama_project, kode_project)')
        .eq('karyawan_id', karyawanId)
        .gte('tanggal', periodeMulai).lte('tanggal', periodeSelesai)
        .eq('status_kehadiran', 'hadir')
        .order('tanggal'),

      // Hanya lembur MANUAL (exclude 'Otomatis%') — sudah disetujui
      supabase.from('lembur')
        .select('total_lembur, durasi_jam, project_id, tanggal')
        .eq('karyawan_id', karyawanId)
        .gte('tanggal', periodeMulai).lte('tanggal', periodeSelesai)
        .eq('status_persetujuan', 'disetujui')
        .not('catatan', 'like', 'Otomatis%'),

      supabase.from('kasbon')
        .select('id, sisa_kasbon, tanggal_kasbon, jumlah_kasbon')
        .eq('karyawan_id', karyawanId).eq('status_lunas', false).gt('sisa_kasbon', 0)
        .order('tanggal_kasbon', { ascending: true }),

      supabase.from('karyawan').select('*, jabatan(*)').eq('id', karyawanId).single(),
    ])

    const k = karyawanRes.data
    if (!k) throw new Error('Karyawan tidak ditemukan')
    return hitungGajiDariData(k, presensiRes.data || [], lemburManualRes.data || [], kasbonRes.data || [], periodeMulai, periodeSelesai)
  },

  // ============================================================
  // BATCH: hitung + simpan gaji mingguan untuk BANYAK karyawan sekaligus.
  // Sebelumnya: 4 query per karyawan + 2 query simpan per karyawan, dijalankan
  // serentak untuk semua karyawan setiap ada perubahan presensi (ratusan request).
  // Sekarang: 5 query per 50 karyawan, lalu hanya baris yang BERUBAH yang ditulis
  // (baris baru dalam 1 request), sehingga tidak memicu event realtime yang sia-sia.
  // Mengembalikan { berhasil, diubah }.
  // ============================================================
  async hitungDanSimpanGajiMingguanBatch(karyawanIds, periodeMulai, periodeSelesai) {
    const ids = [...new Set(karyawanIds || [])]
    if (ids.length === 0) return { berhasil: 0, diubah: 0 }

    // 50 karyawan × 7 hari = 350 baris presensi, aman di bawah batas 1000 baris API
    const CHUNK = 50
    let berhasil = 0
    const toDelete = [], toInsert = [], toUpdate = []

    for (let i = 0; i < ids.length; i += CHUNK) {
      const idc = ids.slice(i, i + CHUNK)
      const [presensiRes, lemburRes, kasbonRes, karyawanRes, existingRes] = await Promise.all([
        supabase.from('presensi')
          .select('*, project(id, nama_project, kode_project)')
          .in('karyawan_id', idc)
          .gte('tanggal', periodeMulai).lte('tanggal', periodeSelesai)
          .eq('status_kehadiran', 'hadir')
          .order('tanggal'),
        supabase.from('lembur')
          .select('karyawan_id, total_lembur, durasi_jam, project_id, tanggal')
          .in('karyawan_id', idc)
          .gte('tanggal', periodeMulai).lte('tanggal', periodeSelesai)
          .eq('status_persetujuan', 'disetujui')
          .not('catatan', 'like', 'Otomatis%'),
        supabase.from('kasbon')
          .select('karyawan_id, id, sisa_kasbon, tanggal_kasbon, jumlah_kasbon')
          .in('karyawan_id', idc)
          .eq('status_lunas', false).gt('sisa_kasbon', 0)
          .order('tanggal_kasbon', { ascending: true }),
        supabase.from('karyawan').select('*, jabatan(*)').in('id', idc),
        supabase.from('rekap_gaji_mingguan').select('*')
          .in('karyawan_id', idc)
          .eq('periode_mulai', periodeMulai).eq('periode_selesai', periodeSelesai),
      ])
      for (const r of [presensiRes, lemburRes, kasbonRes, karyawanRes, existingRes]) {
        if (r.error) throw new Error(parseError(r.error))
      }

      const groupBy = (rows) => {
        const m = new Map()
        ;(rows || []).forEach(r => { const a = m.get(r.karyawan_id); if (a) a.push(r); else m.set(r.karyawan_id, [r]) })
        return m
      }
      const presensiBy = groupBy(presensiRes.data)
      const lemburBy   = groupBy(lemburRes.data)
      const kasbonBy   = groupBy(kasbonRes.data)
      const existingBy = new Map((existingRes.data || []).map(r => [r.karyawan_id, r]))

      for (const k of (karyawanRes.data || [])) {
        const calc = hitungGajiDariData(
          k, presensiBy.get(k.id) || [], lemburBy.get(k.id) || [], kasbonBy.get(k.id) || [],
          periodeMulai, periodeSelesai,
        )
        const existing = existingBy.get(k.id)

        if (calc.status === null) {                      // tidak ada presensi hadir
          if (existing?.status === 'draft') toDelete.push(existing.id)
          continue
        }
        berhasil++
        if (existing?.status === 'dibayar') continue     // gaji yang sudah dibayar tidak disentuh

        const payload = toDbPayload(calc)
        if (!existing) toInsert.push(payload)
        else if (rekapBerubah(existing, payload)) toUpdate.push({ id: existing.id, payload })
      }
    }

    if (toDelete.length) {
      const { error } = await supabase.from('rekap_gaji_mingguan').delete().in('id', toDelete).eq('status', 'draft')
      if (error) console.warn('hapus draft kosong:', error.message)
    }
    if (toInsert.length) {
      const { error } = await supabase.from('rekap_gaji_mingguan').insert(toInsert)
      if (error) throw new Error(parseError(error))
    }
    // Update terbatas 6 request paralel agar tidak membanjiri API
    for (let i = 0; i < toUpdate.length; i += 6) {
      const results = await Promise.all(toUpdate.slice(i, i + 6).map(({ id, payload }) =>
        supabase.from('rekap_gaji_mingguan')
          .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)))
      const bad = results.find(r => r.error)
      if (bad) throw new Error(parseError(bad.error))
    }

    return { berhasil, diubah: toDelete.length + toInsert.length + toUpdate.length }
  },

  async deleteGajiMingguanIfZero(karyawanId, periodeMulai, periodeSelesai) {
    const { error } = await supabase.from('rekap_gaji_mingguan')
      .delete()
      .eq('karyawan_id', karyawanId)
      .eq('periode_mulai', periodeMulai)
      .eq('periode_selesai', periodeSelesai)
      .eq('status', 'draft')
    if (error) console.warn('deleteGajiMingguanIfZero:', error.message)
  },

  async saveGajiMingguan(payload) {
    if (payload.status === null) return null
    const dbPayload = toDbPayload(payload)
    const { data: existing } = await supabase
      .from('rekap_gaji_mingguan')
      .select('id, status')
      .eq('karyawan_id', dbPayload.karyawan_id)
      .eq('periode_mulai', dbPayload.periode_mulai)
      .eq('periode_selesai', dbPayload.periode_selesai)
      .maybeSingle()
    let result, err
    if (existing) {
      if (existing.status === 'dibayar') return existing
      ;({ data: result, error: err } = await supabase
        .from('rekap_gaji_mingguan')
        .update({ ...dbPayload, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*, karyawan(nama_karyawan)').single())
    } else {
      ;({ data: result, error: err } = await supabase
        .from('rekap_gaji_mingguan')
        .insert(dbPayload)
        .select('*, karyawan(nama_karyawan)').single())
    }
    if (err) throw new Error(parseError(err))
    return result
  },

  async updateGajiMingguan(id, payload) {
    const { data, error } = await supabase.from('rekap_gaji_mingguan')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id).select('*, karyawan(nama_karyawan)').single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async resetGajiMingguan(id) {
    // Get rekap first so we can restore kasbon deduction
    const { data: rekap } = await supabase.from('rekap_gaji_mingguan')
      .select('karyawan_id, total_potongan_kasbon').eq('id', id).single()
    if (rekap?.total_potongan_kasbon > 0) {
      await this._restoreKasbonKaryawan(rekap.karyawan_id, rekap.total_potongan_kasbon)
    }
    const { data, error } = await supabase.from('rekap_gaji_mingguan')
      .update({ status: 'draft', tanggal_pembayaran: null, metode_pembayaran: null, updated_at: new Date().toISOString() })
      .eq('id', id).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async getGajiMingguan(filters = {}) {
    let q = supabase.from('rekap_gaji_mingguan')
      .select('*, karyawan(id_karyawan, nama_karyawan, nik, jabatan(nama_jabatan), no_rekening, nama_bank)')
      .not('status', 'eq', 'tidak_hadir')
      .order('total_hari_hadir', { ascending: false })
    if (filters.karyawan_id) q = q.eq('karyawan_id', filters.karyawan_id)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.periode_mulai && filters.periode_selesai) {
      q = q.gte('periode_mulai', filters.periode_mulai).lte('periode_selesai', filters.periode_selesai)
    } else if (filters.periode_mulai) {
      q = q.gte('periode_mulai', filters.periode_mulai)
    }
    const { data, error } = await q
    if (error) throw new Error(parseError(error))
    return data || []
  },

  // ============================================================
  // BAYAR GAJI — FIX: teruskan tanggal bayar ke _autoRekapBulanan
  // ============================================================
  async bayarSemuaGaji(periodeMulai, periodeSelesai, metodePembayaran) {
    const { data: rekapList } = await supabase.from('rekap_gaji_mingguan')
      .select('*')
      .gte('periode_mulai', periodeMulai)
      .lte('periode_selesai', periodeSelesai)
      .eq('status', 'draft')
    if (!rekapList?.length) throw new Error('Tidak ada gaji draft untuk dibayar.')
    const tglBayar = new Date().toISOString().split('T')[0]
    const results = []
    for (const rekap of rekapList) {
      await supabase.from('rekap_gaji_mingguan').update({
        status: 'dibayar', metode_pembayaran: metodePembayaran,
        tanggal_pembayaran: tglBayar, updated_at: new Date().toISOString()
      }).eq('id', rekap.id)
      if (rekap.total_potongan_kasbon > 0) {
        await this._potongKasbonKaryawan(rekap.karyawan_id, rekap.total_potongan_kasbon)
      }
      results.push(rekap)
    }
    const bulan = parseInt(tglBayar.split('-')[1])
    const tahun = parseInt(tglBayar.split('-')[0])
    await payrollService._autoRekapBulanan(bulan, tahun)
    return results
  },

  async bayarGajiByIds(ids, metodePembayaran) {
    if (!ids || ids.length === 0) throw new Error('Tidak ada ID gaji yang diberikan')
    const { data: rekapList, error } = await supabase
      .from('rekap_gaji_mingguan').select('*').in('id', ids).eq('status', 'draft')
    if (error) throw new Error(parseError(error))
    if (!rekapList?.length) throw new Error('Gaji tidak ditemukan atau sudah dibayar sebelumnya.')
    const tglBayar = new Date().toISOString().split('T')[0]
    const results = []
    for (const rekap of rekapList) {
      const { error: updateErr } = await supabase.from('rekap_gaji_mingguan').update({
        status: 'dibayar', metode_pembayaran: metodePembayaran,
        tanggal_pembayaran: tglBayar, updated_at: new Date().toISOString()
      }).eq('id', rekap.id)
      if (updateErr) { console.error('Gagal update gaji ID', rekap.id, updateErr); continue }
      if (parseFloat(rekap.total_potongan_kasbon || 0) > 0) {
        await this._potongKasbonKaryawan(rekap.karyawan_id, rekap.total_potongan_kasbon)
      }
      results.push(rekap)
    }
    if (results.length === 0) throw new Error('Semua pembayaran gagal. Coba lagi.')
    const bulan = parseInt(tglBayar.split('-')[1])
    const tahun = parseInt(tglBayar.split('-')[0])
    await payrollService._autoRekapBulanan(bulan, tahun)
    return results
  },

  // Helper internal: potong kasbon FIFO
  async _potongKasbonKaryawan(karyawanId, jumlahPotong) {
    const { data: kasbonList } = await supabase.from('kasbon')
      .select('id, sisa_kasbon').eq('karyawan_id', karyawanId)
      .eq('status_lunas', false).gt('sisa_kasbon', 0)
      .order('tanggal_kasbon', { ascending: true })
    let sisa = parseFloat(jumlahPotong)
    for (const kb of (kasbonList || [])) {
      if (sisa <= 0) break
      const sisaKb = parseFloat(kb.sisa_kasbon)
      if (sisa >= sisaKb) {
        await supabase.from('kasbon').update({ sisa_kasbon: 0, status_lunas: true, updated_at: new Date().toISOString() }).eq('id', kb.id)
        sisa -= sisaKb
      } else {
        await supabase.from('kasbon').update({ sisa_kasbon: sisaKb - sisa, updated_at: new Date().toISOString() }).eq('id', kb.id)
        sisa = 0
      }
    }
  },

  // Helper internal: restore kasbon reverse-FIFO (used when resetting paid gaji)
  async _restoreKasbonKaryawan(karyawanId, jumlahRestore) {
    // Fetch ALL kasbon (including lunas) newest first to reverse the FIFO deduction
    const { data: kasbonList } = await supabase.from('kasbon')
      .select('id, sisa_kasbon, jumlah_kasbon')
      .eq('karyawan_id', karyawanId)
      .order('tanggal_kasbon', { ascending: false })
    let sisaRestore = parseFloat(jumlahRestore)
    for (const kb of (kasbonList || [])) {
      if (sisaRestore <= 0) break
      const currentSisa = parseFloat(kb.sisa_kasbon)
      const jumlah      = parseFloat(kb.jumlah_kasbon)
      const maxRestore  = jumlah - currentSisa  // total amount previously deducted
      if (maxRestore <= 0) continue
      const toRestore = Math.min(sisaRestore, maxRestore)
      await supabase.from('kasbon').update({
        sisa_kasbon: currentSisa + toRestore,
        status_lunas: false,
        updated_at: new Date().toISOString(),
      }).eq('id', kb.id)
      sisaRestore -= toRestore
    }
  },

  // ============================================================
  // AUTO REKAP BULANAN — v3
  // Dikelompokkan berdasarkan periode_selesai (Sabtu) agar minggu yang
  // periode-nya bulan ini masuk rekap bulan ini, bukan bulan pembayaran.
  // Termasuk DRAFT agar GajiBulanan selalu sinkron dengan GajiMingguan.
  // status='final' jika semua minggu sudah dibayar, 'draft' jika ada yang belum.
  // ============================================================
  async _autoRekapBulanan(bulan, tahun) {
    const tglMulai = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay  = new Date(tahun, bulan, 0).getDate()
    const tglAkhir = `${tahun}-${String(bulan).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`

    // Query berdasarkan periode_selesai (Sabtu) — termasuk draft + dibayar
    const { data: mingguan, error } = await supabase.from('rekap_gaji_mingguan')
      .select('karyawan_id,gaji_bersih,gaji_kotor,total_hari_hadir,total_uang_lembur,total_potongan_kasbon,total_gaji_pokok,total_uang_makan,total_uang_transport,status')
      .in('status', ['draft', 'dibayar'])
      .gte('periode_selesai', tglMulai)
      .lte('periode_selesai', tglAkhir)

    if (error) throw new Error(parseError(error))
    if (!mingguan?.length) return 0

    const byK = {}
    mingguan.forEach(g => {
      if (!byK[g.karyawan_id]) byK[g.karyawan_id] = {
        gb: 0, gk: 0, hari: 0, lembur: 0, kasbon: 0,
        pokok: 0, makan: 0, transport: 0,
        allDibayar: true,
      }
      byK[g.karyawan_id].gb        += parseFloat(g.gaji_bersih         || 0)
      byK[g.karyawan_id].gk        += parseFloat(g.gaji_kotor          || 0)
      byK[g.karyawan_id].hari      += parseInt(g.total_hari_hadir       || 0)
      byK[g.karyawan_id].lembur    += parseFloat(g.total_uang_lembur    || 0)
      byK[g.karyawan_id].kasbon    += parseFloat(g.total_potongan_kasbon|| 0)
      byK[g.karyawan_id].pokok     += parseFloat(g.total_gaji_pokok     || 0)
      byK[g.karyawan_id].makan     += parseFloat(g.total_uang_makan     || 0)
      byK[g.karyawan_id].transport += parseFloat(g.total_uang_transport || 0)
      if (g.status !== 'dibayar') byK[g.karyawan_id].allDibayar = false
    })

    for (const [kid, d] of Object.entries(byK)) {
      const { error: upsertErr } = await supabase.from('rekap_gaji_bulanan').upsert({
        karyawan_id:          parseInt(kid),
        bulan,
        tahun,
        total_gaji_bersih:    Math.round(d.gb),
        total_gaji_kotor:     Math.round(d.gk),
        total_gaji_pokok:     Math.round(d.pokok),
        total_uang_makan:     Math.round(d.makan),
        total_uang_transport: Math.round(d.transport),
        total_hari_hadir:     d.hari,
        total_uang_lembur:    Math.round(d.lembur),
        total_kasbon_potong:  Math.round(d.kasbon),
        status:               d.allDibayar ? 'final' : 'draft',
        updated_at:           new Date().toISOString(),
      }, { onConflict: 'karyawan_id,bulan,tahun' })
      if (upsertErr) console.warn('rekap_gaji_bulanan upsert:', upsertErr.message)
    }
    return Object.keys(byK).length
  },

  // Helper: rekap mingguan dalam satu bulan (by periode_selesai), termasuk draft
  async getGajiMingguanByBulan(bulan, tahun) {
    const tglMulai = `${tahun}-${String(bulan).padStart(2,'0')}-01`
    const lastDay  = new Date(tahun, bulan, 0).getDate()
    const tglAkhir = `${tahun}-${String(bulan).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const { data, error } = await supabase.from('rekap_gaji_mingguan')
      .select('karyawan_id, gaji_bersih, status, periode_mulai, periode_selesai')
      .in('status', ['draft', 'dibayar'])
      .gte('periode_selesai', tglMulai)
      .lte('periode_selesai', tglAkhir)
      .order('periode_mulai')
    if (error) throw new Error(parseError(error))
    return data || []
  },

  async getGajiBulananByKaryawanIds(karyawanIds, bulan, tahun) {
    if (!karyawanIds || karyawanIds.length === 0) return []
    const { data, error } = await supabase.from('rekap_gaji_bulanan')
      .select('*, karyawan(id_karyawan, nama_karyawan, nik, jabatan(nama_jabatan), no_rekening, nama_bank)')
      .in('karyawan_id', karyawanIds)
      .eq('bulan', bulan).eq('tahun', tahun)
      .order('karyawan(nama_karyawan)')
    if (error) throw new Error(parseError(error))
    return data || []
  },

  async getGajiBulanan(filters = {}) {
    let q = supabase.from('rekap_gaji_bulanan')
      .select('*, karyawan(id_karyawan, nama_karyawan, nik, jabatan(nama_jabatan), no_rekening, nama_bank)')
      .order('tahun', { ascending: false }).order('bulan', { ascending: false })
    if (filters.karyawan_id) q = q.eq('karyawan_id', filters.karyawan_id)
    if (filters.bulan) q = q.eq('bulan', filters.bulan)
    if (filters.tahun) q = q.eq('tahun', filters.tahun)
    const { data, error } = await q
    if (error) throw new Error(parseError(error))
    return data
  },

  async rekapGajiBulanan(bulan, tahun) {
    const count = await payrollService._autoRekapBulanan(bulan, tahun)
    if (!count) throw new Error('Tidak ada data gaji mingguan untuk bulan ini.')
    return count
  },

  async saveGajiBulanan(payload) {
    const { data, error } = await supabase.from('rekap_gaji_bulanan')
      .upsert(payload, { onConflict: 'karyawan_id,bulan,tahun' }).select().single()
    if (error) throw new Error(parseError(error))
    return data
  },

  async getPembayaranOtomatis(filters = {}) {
    let q = supabase.from('rekap_gaji_mingguan')
      .select('*, karyawan(nama_karyawan, nik, no_rekening, nama_bank)')
      .eq('status', 'dibayar')
      .order('tanggal_pembayaran', { ascending: false })
    if (filters.karyawan_id) q = q.eq('karyawan_id', filters.karyawan_id)
    const { data, error } = await q
    if (error) throw new Error(parseError(error))
    return data
  },

  async getLaporanRingkasan(periodeStart, periodeEnd) {
    const [presensiRes, lemburRes, kasbonRes, gajiRes, karyawanRes] = await Promise.all([
      supabase.from('presensi').select('status_kehadiran, karyawan_id, tanggal, jam_masuk')
        .gte('tanggal', periodeStart).lte('tanggal', periodeEnd),
      supabase.from('lembur').select('total_lembur, durasi_jam, karyawan_id, status_persetujuan, tanggal')
        .gte('tanggal', periodeStart).lte('tanggal', periodeEnd),
      supabase.from('kasbon').select('jumlah_kasbon, sisa_kasbon, status_lunas, karyawan_id, tanggal_kasbon')
        .gte('tanggal_kasbon', periodeStart).lte('tanggal_kasbon', periodeEnd),
      supabase.from('rekap_gaji_mingguan').select('gaji_bersih, gaji_kotor, total_potongan_kasbon, total_hari_hadir, status, karyawan_id, periode_mulai')
        .gte('periode_mulai', periodeStart).lte('periode_selesai', periodeEnd),
      supabase.from('karyawan').select('id').eq('status_aktif', true),
    ])
    const presensi = presensiRes.data || []
    const lembur   = lemburRes.data || []
    const kasbon   = kasbonRes.data || []
    const gaji     = gajiRes.data || []
    return {
      presensi: {
        total:         presensi.length,
        hadir:         presensi.filter(p => p.status_kehadiran === 'hadir').length,
        sedangBekerja: presensi.filter(p => p.status_kehadiran === 'belum_lengkap' && p.jam_masuk).length,
        tidakHadir:    presensi.filter(p => p.status_kehadiran !== 'hadir' && !(p.status_kehadiran === 'belum_lengkap' && p.jam_masuk)).length,
        hadirRate:     presensi.length > 0
          ? Math.round((presensi.filter(p => p.status_kehadiran === 'hadir').length / presensi.length) * 100) : 0,
      },
      lembur: {
        total:      lembur.length,
        disetujui:  lembur.filter(l => l.status_persetujuan === 'disetujui').length,
        totalJam:   lembur.reduce((s, l) => s + parseFloat(l.durasi_jam || 0), 0),
        totalNilai: lembur.filter(l => l.status_persetujuan === 'disetujui').reduce((s, l) => s + parseFloat(l.total_lembur || 0), 0),
      },
      kasbon: {
        total:        kasbon.length,
        outstanding:  kasbon.filter(k => !k.status_lunas).length,
        totalNilai:   kasbon.reduce((s, k) => s + parseFloat(k.jumlah_kasbon || 0), 0),
        totalSisa:    kasbon.filter(k => !k.status_lunas).reduce((s, k) => s + parseFloat(k.sisa_kasbon || 0), 0),
        totalLunas:   kasbon.filter(k => k.status_lunas).reduce((s, k) => s + parseFloat(k.jumlah_kasbon || 0), 0),
      },
      gaji: {
        total:              gaji.length,
        sudahDibayar:       gaji.filter(g => g.status === 'dibayar').length,
        draft:              gaji.filter(g => g.status === 'draft').length,
        totalBersih:        gaji.filter(g => g.status === 'dibayar').reduce((s, g) => s + parseFloat(g.gaji_bersih || 0), 0),
        totalKotor:         gaji.filter(g => g.status === 'dibayar').reduce((s, g) => s + parseFloat(g.gaji_kotor || 0), 0),
        totalPotonganKasbon:gaji.filter(g => g.status === 'dibayar').reduce((s, g) => s + parseFloat(g.total_potongan_kasbon || 0), 0),
        totalHariKerja:     gaji.filter(g => g.status === 'dibayar').reduce((s, g) => s + parseInt(g.total_hari_hadir || 0), 0),
      },
      karyawan: { aktif: (karyawanRes.data || []).length },
    }
  },

  async getLaporanPerProject(projectId, periodeStart, periodeEnd) {
    const [presensiRes, lemburRes, kasbonRes] = await Promise.all([
      supabase.from('presensi')
        .select('*, karyawan(nama_karyawan, nik, jabatan(nama_jabatan, gaji_harian), gaji_harian_override, uang_makan_override, uang_transport_override)')
        .eq('project_id', projectId)
        .gte('tanggal', periodeStart).lte('tanggal', periodeEnd)
        .eq('status_kehadiran', 'hadir'),
      supabase.from('lembur').select('karyawan_id, total_lembur')
        .eq('project_id', projectId)
        .gte('tanggal', periodeStart).lte('tanggal', periodeEnd)
        .eq('status_persetujuan', 'disetujui'),
      supabase.from('kasbon').select('karyawan_id, jumlah_kasbon')
        .eq('project_id', projectId)
        .gte('tanggal_kasbon', periodeStart).lte('tanggal_kasbon', periodeEnd),
    ])
    const byK = {}
    presensiRes.data?.forEach(p => {
      const kid = p.karyawan_id
      const gh  = parseFloat(p.karyawan?.gaji_harian_override || p.karyawan?.jabatan?.gaji_harian || 0)
      const durasi   = parseFloat(p.durasi_jam) || 0
      const komponen = hitungKomponenJam(durasi, gh)
      if (!byK[kid]) byK[kid] = {
        nama: p.karyawan?.nama_karyawan, jabatan: p.karyawan?.jabatan?.nama_jabatan,
        gh, hadir: 0, pokok: 0, makan: 0, transport: 0, luar_kota: 0, lembur: 0, kasbon: 0,
      }
      byK[kid].hadir++
      byK[kid].pokok     += komponen.gajiPokok || 0
      byK[kid].makan     += parseFloat(p.uang_makan     || 0)
      byK[kid].transport += parseFloat(p.uang_transport || 0)
      byK[kid].luar_kota += parseFloat(p.upah_luar_kota || 0)
      byK[kid].lembur    += komponen.gajiLembur || 0
    })
    lemburRes.data?.forEach(l => { if (byK[l.karyawan_id]) byK[l.karyawan_id].lembur += parseFloat(l.total_lembur || 0) })
    kasbonRes.data?.forEach(k => { if (byK[k.karyawan_id]) byK[k.karyawan_id].kasbon += parseFloat(k.jumlah_kasbon || 0) })
    return Object.entries(byK).map(([kid, d]) => ({
      karyawan_id: parseInt(kid), ...d,
      gaji_pokok: d.pokok,
      gaji_kotor: d.pokok + d.makan + d.transport + d.luar_kota + d.lembur,
      gaji_bersih: Math.max(0, d.pokok + d.makan + d.transport + d.luar_kota + d.lembur - d.kasbon),
    }))
  },

  async getLaporanPerKaryawan(karyawanId, periodeStart, periodeEnd) {
    const [presensi, lembur, kasbon, rekap] = await Promise.all([
      supabase.from('presensi')
        .select('tanggal, status_kehadiran, jam_masuk, jam_keluar, durasi_jam, uang_makan, uang_transport, upah_luar_kota, catatan, metode_input')
        .eq('karyawan_id', karyawanId).gte('tanggal', periodeStart).lte('tanggal', periodeEnd).order('tanggal'),
      supabase.from('lembur')
        .select('tanggal, durasi_jam, total_lembur, status_persetujuan, catatan')
        .eq('karyawan_id', karyawanId).gte('tanggal', periodeStart).lte('tanggal', periodeEnd).order('tanggal'),
      supabase.from('kasbon')
        .select('tanggal_kasbon, jumlah_kasbon, sisa_kasbon, status_lunas, catatan')
        .eq('karyawan_id', karyawanId).gte('tanggal_kasbon', periodeStart).lte('tanggal_kasbon', periodeEnd),
      supabase.from('rekap_gaji_mingguan')
        .select('periode_mulai, periode_selesai, gaji_bersih, gaji_kotor, total_hari_hadir, total_gaji_pokok, total_uang_makan, total_uang_transport, total_uang_lembur, total_potongan_kasbon, potongan_lainnya, status, tanggal_pembayaran, metode_pembayaran, project_details')
        .eq('karyawan_id', karyawanId).gte('periode_mulai', periodeStart).lte('periode_selesai', periodeEnd).order('periode_mulai'),
    ])
    const hitungHariKerja = (start, end) => {
      let count = 0
      const [sy, sm, sd] = start.split('-').map(Number)
      const [ey, em, ed] = end.split('-').map(Number)
      const d = new Date(sy, sm - 1, sd)
      const endD = new Date(ey, em - 1, ed)
      while (d <= endD) { if (d.getDay() !== 0) count++; d.setDate(d.getDate() + 1) }
      return count
    }
    const presensiData   = presensi.data || []
    const totalHariKerja = hitungHariKerja(periodeStart, periodeEnd)
    const totalHadir     = presensiData.filter(p => p.status_kehadiran === 'hadir').length
    const totalSedangBekerja = presensiData.filter(p => p.status_kehadiran === 'belum_lengkap' && p.jam_masuk).length
    const totalTercatat  = presensiData.length
    const tidakHadirOtomatis = Math.max(0, totalHariKerja - totalTercatat)
    return {
      presensi: presensiData,
      lembur:   lembur.data || [],
      kasbon:   kasbon.data || [],
      rekap:    rekap.data || [],
      summary: {
        totalHadir,
        totalSedangBekerja,
        totalSakit:      presensiData.filter(p => p.status_kehadiran === 'sakit').length,
        totalIzin:       presensiData.filter(p => p.status_kehadiran === 'izin').length,
        totalAlfa:       presensiData.filter(p => p.status_kehadiran === 'alfa').length + tidakHadirOtomatis,
        totalTidakHadir: (totalTercatat - totalHadir - totalSedangBekerja) + tidakHadirOtomatis,
        totalHariKerja,
        tidakTercatat:   tidakHadirOtomatis,
        totalLembur:     (lembur.data || []).reduce((s, l) => s + parseFloat(l.total_lembur || 0), 0),
        totalKasbon:     (kasbon.data || []).reduce((s, k) => s + parseFloat(k.jumlah_kasbon || 0), 0),
        totalGaji:       (rekap.data || []).filter(r => r.status === 'dibayar').reduce((s, r) => s + parseFloat(r.gaji_bersih || 0), 0),
      }
    }
  },
}
