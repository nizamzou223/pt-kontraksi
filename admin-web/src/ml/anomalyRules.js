// Aturan bisnis deterministik untuk data kepegawaian.
// Setiap aturan menghasilkan temuan { kode, tingkat, bobot, teks } yang ALASANNYA dapat dibaca admin.
// Bobot dipakai penggabung (noisy-OR) pada anomalyDetector.js.

export const BOBOT = { tinggi: 0.9, sedang: 0.6, rendah: 0.35 }

// Batas lembur mengikuti PP No. 35 Tahun 2021: paling lama 4 jam/hari dan 18 jam/minggu.
export const BATAS = {
  lemburHarian: 4,
  lemburHarianEkstrem: 8,
  lemburMingguan: 18,
  durasiKerjaEkstrem: 16,
  durasiKerjaTerlaluSingkat: 0.5,
  selisihDurasi: 0.5,            // jam: |durasi_jam − (keluar − masuk)|
  kasbonHariGaji: 26,            // ≈ gaji sebulan kerja (26 hari)
  kasbonBerulangHari: 14,
  kasbonBerulangJumlah: 3,
  pola_jam_identik: 12,          // input manual dengan jam masuk & keluar persis sama ≥ N kali
}

const temuan = (kode, tingkat, teks, nilai) => ({ kode, tingkat, bobot: BOBOT[tingkat], teks, nilai })
const jam = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 })
const rp = (n) => `Rp ${Math.round(n).toLocaleString('id-ID')}`

/** 'HH:MM[:SS]' → jam desimal; null bila kosong/tidak valid. */
export function toHours(t) {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t))
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}

const isAuto = (row) => row.metode_input === 'otomatis'
const isAutoLembur = (row) => /^otomatis/i.test(row.catatan || '')

/** Presensi 'otomatis' (alfa otomatis) BUKAN observasi nyata → tidak diperiksa (lihat dokumen rancangan). */
export function presensiRules(row, ctx) {
  if (isAuto(row)) return []
  const out = []
  const k = ctx.karyawan.get(row.karyawan_id)
  const masuk = toHours(row.jam_masuk), keluar = toHours(row.jam_keluar)
  const durasi = row.durasi_jam === null || row.durasi_jam === undefined ? null : Number(row.durasi_jam)
  const hadir = (row.status_kehadiran || 'hadir') === 'hadir'

  if (hadir && masuk !== null && keluar !== null && keluar < masuk && (durasi === null || durasi < 12)) {
    out.push(temuan('KELUAR_SEBELUM_MASUK', 'tinggi', `Jam keluar (${row.jam_keluar?.slice(0, 5)}) lebih awal dari jam masuk (${row.jam_masuk?.slice(0, 5)}).`))
  }
  if (hadir && masuk !== null && keluar !== null && durasi !== null && keluar >= masuk) {
    const hitung = keluar - masuk
    if (Math.abs(hitung - durasi) > BATAS.selisihDurasi) {
      out.push(temuan('DURASI_TIDAK_KONSISTEN', 'sedang', `Durasi tercatat ${jam(durasi)} jam, tetapi selisih jam masuk–keluar ${jam(hitung)} jam.`, hitung - durasi))
    }
  }
  if (hadir && durasi !== null) {
    if (durasi > BATAS.durasiKerjaEkstrem) out.push(temuan('DURASI_EKSTREM', 'tinggi', `Durasi kerja ${jam(durasi)} jam dalam sehari (batas wajar ${BATAS.durasiKerjaEkstrem} jam).`, durasi))
    else if (durasi > 0 && durasi < BATAS.durasiKerjaTerlaluSingkat) out.push(temuan('DURASI_TERLALU_SINGKAT', 'sedang', `Berstatus hadir namun hanya ${jam(durasi)} jam.`, durasi))
  }
  if (k) {
    if (k.status_aktif === false) out.push(temuan('PRESENSI_KARYAWAN_NONAKTIF', 'sedang', `Presensi dicatat untuk karyawan berstatus NONAKTIF (${k.nama_karyawan}).`))
    if (k.tanggal_bergabung && row.tanggal < String(k.tanggal_bergabung).slice(0, 10)) {
      out.push(temuan('PRESENSI_SEBELUM_BERGABUNG', 'tinggi', `Tanggal presensi ${row.tanggal} lebih awal dari tanggal bergabung ${String(k.tanggal_bergabung).slice(0, 10)}.`))
    }
  }
  if (ctx.today && row.tanggal > ctx.today) out.push(temuan('PRESENSI_MASA_DEPAN', 'tinggi', `Presensi bertanggal di masa depan (${row.tanggal}).`))

  // Pola input manual identik berulang (indikasi jam "dikarang")
  if (row.metode_input === 'manual' && row.jam_masuk && row.jam_keluar) {
    const n = ctx.manualIdentik.get(`${row.karyawan_id}|${row.jam_masuk}|${row.jam_keluar}`) || 0
    if (n >= BATAS.pola_jam_identik) out.push(temuan('POLA_JAM_IDENTIK', 'rendah', `Jam manual ${row.jam_masuk.slice(0, 5)}–${row.jam_keluar.slice(0, 5)} identik pada ${n} hari (kemungkinan jam tidak nyata).`, n))
  }
  return out
}

export function lemburRules(row, ctx) {
  if (isAutoLembur(row)) return [] // lembur bentukan sistem dari presensi (turunan), bukan input manusia
  const out = []
  const durasi = Number(row.durasi_jam) || 0
  if (!ctx.presensiHadir.has(`${row.karyawan_id}|${row.tanggal}`)) {
    out.push(temuan('LEMBUR_TANPA_PRESENSI', 'tinggi', `Lembur ${jam(durasi)} jam pada ${row.tanggal} tanpa presensi hadir di hari yang sama.`))
  }
  if (durasi > BATAS.lemburHarianEkstrem) out.push(temuan('LEMBUR_HARIAN_EKSTREM', 'tinggi', `Lembur ${jam(durasi)} jam dalam sehari (batas regulasi ${BATAS.lemburHarian} jam).`, durasi))
  else if (durasi > BATAS.lemburHarian) out.push(temuan('LEMBUR_HARIAN_BERLEBIH', 'sedang', `Lembur ${jam(durasi)} jam melebihi batas ${BATAS.lemburHarian} jam/hari (PP 35/2021).`, durasi))

  const wk = ctx.lemburMingguanLewat.get(row.id)
  if (wk) out.push(temuan('LEMBUR_MINGGUAN_BERLEBIH', 'sedang', `Akumulasi lembur minggu itu ${jam(wk)} jam melebihi batas ${BATAS.lemburMingguan} jam/minggu.`, wk))

  const tarif = Number(row.tarif_lembur), total = Number(row.total_lembur)
  if (tarif > 0 && total > 0 && Math.abs(total - durasi * tarif) > 0.01 * total) {
    out.push(temuan('LEMBUR_TOTAL_TIDAK_SESUAI', 'sedang', `Total ${rp(total)} tidak sama dengan durasi × tarif (${jam(durasi)} × ${rp(tarif)} = ${rp(durasi * tarif)}).`, total - durasi * tarif))
  }
  return out
}

export function kasbonRules(row, ctx) {
  const out = []
  const jumlah = Number(row.jumlah_kasbon) || 0, sisa = Number(row.sisa_kasbon) || 0
  const k = ctx.karyawan.get(row.karyawan_id)
  if (sisa > jumlah) out.push(temuan('KASBON_SISA_LEBIH_BESAR', 'tinggi', `Sisa kasbon ${rp(sisa)} lebih besar dari jumlah kasbon ${rp(jumlah)}.`))
  if (row.status_lunas && sisa > 0) out.push(temuan('KASBON_LUNAS_ADA_SISA', 'sedang', `Berstatus lunas tetapi masih ada sisa ${rp(sisa)}.`))
  if (k?.status_aktif === false) out.push(temuan('KASBON_KARYAWAN_NONAKTIF', 'sedang', `Kasbon atas nama karyawan NONAKTIF (${k.nama_karyawan}).`))

  const gh = Number(k?.gaji_harian) || 0
  if (gh > 0) {
    const kali = jumlah / gh
    if (kali > BATAS.kasbonHariGaji * 2) out.push(temuan('KASBON_SANGAT_BESAR', 'tinggi', `Kasbon ${rp(jumlah)} setara ${jam(kali)} hari gaji (batas wajar ±${BATAS.kasbonHariGaji} hari).`, kali))
    else if (kali > BATAS.kasbonHariGaji) out.push(temuan('KASBON_BESAR', 'sedang', `Kasbon ${rp(jumlah)} setara ${jam(kali)} hari gaji (> ${BATAS.kasbonHariGaji} hari).`, kali))
  }
  const rep = ctx.kasbonBerulang.get(row.id)
  if (rep) out.push(temuan('KASBON_BERULANG', 'sedang', `Kasbon ke-${rep} dalam ${BATAS.kasbonBerulangHari} hari terakhir untuk karyawan yang sama.`, rep))
  return out
}

/** Konteks pra-hitung (agar aturan O(1) per baris). */
export function buildContext({ karyawan, presensi, lembur, kasbon, today }) {
  const kMap = new Map(karyawan.map((k) => [k.id, k]))
  const presensiHadir = new Set(
    presensi.filter((p) => (p.status_kehadiran || 'hadir') === 'hadir').map((p) => `${p.karyawan_id}|${p.tanggal}`))

  const manualIdentik = new Map()
  for (const p of presensi) {
    if (p.metode_input === 'manual' && p.jam_masuk && p.jam_keluar) {
      const key = `${p.karyawan_id}|${p.jam_masuk}|${p.jam_keluar}`
      manualIdentik.set(key, (manualIdentik.get(key) || 0) + 1)
    }
  }

  // Lembur mingguan: tandai baris yang membuat akumulasi minggu itu melewati batas
  const lemburMingguanLewat = new Map()
  const byKW = new Map()
  for (const l of lembur.filter((r) => !isAutoLembur(r))) {
    const d = new Date(`${l.tanggal}T00:00:00Z`)
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
    const key = `${l.karyawan_id}|${monday}`
    if (!byKW.has(key)) byKW.set(key, [])
    byKW.get(key).push(l)
  }
  for (const [, rows] of byKW) {
    rows.sort((a, b) => (a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : a.id - b.id))
    let cum = 0
    for (const r of rows) { cum += Number(r.durasi_jam) || 0; if (cum > BATAS.lemburMingguan) lemburMingguanLewat.set(r.id, cum) }
  }

  // Kasbon berulang dalam jendela N hari
  const kasbonBerulang = new Map()
  const byK = new Map()
  for (const b of kasbon) { if (!byK.has(b.karyawan_id)) byK.set(b.karyawan_id, []); byK.get(b.karyawan_id).push(b) }
  for (const [, rows] of byK) {
    rows.sort((a, b) => (a.tanggal_kasbon < b.tanggal_kasbon ? -1 : 1))
    for (let i = 0; i < rows.length; i++) {
      const t = new Date(rows[i].tanggal_kasbon).getTime()
      const inWin = rows.filter((r) => { const x = new Date(r.tanggal_kasbon).getTime(); return x <= t && t - x <= BATAS.kasbonBerulangHari * 86_400_000 })
      if (inWin.length >= BATAS.kasbonBerulangJumlah) kasbonBerulang.set(rows[i].id, inWin.length)
    }
  }
  return { karyawan: kMap, presensiHadir, manualIdentik, lemburMingguanLewat, kasbonBerulang, today }
}
