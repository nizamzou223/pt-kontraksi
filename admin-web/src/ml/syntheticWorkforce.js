// Data kepegawaian SINTETIS dengan anomali BERLABEL — untuk mengukur presisi/recall detektor,
// pengujian unit, dan "Mode Demo". Bukan data perusahaan.
import { mulberry32, gaussian } from './stats'

const hhmm = (h) => {
  const t = Math.round((((h % 24) + 24) % 24) * 60)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`
}
const toH = (t) => { const [h, m] = t.split(':').map(Number); return h + m / 60 }
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
}
const dowOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay() // 0 = Minggu

// difficulty: 'mudah' = anomali mencolok, tanpa variasi sah yang menyerupai anomali;
//             'sulit'  = ada variasi SAH mirip anomali (hari panjang, lembur 4–5 jam, datang pagi untuk
//                        pengecoran) dan anomali disuntik lebih halus → benchmark yang tidak sirkular/trivial.
export function generateWorkforce({ employees = 30, days = 60, seed = 21, anomalyRate = 0.04, startDate = '2026-07-27', difficulty = 'mudah' } = {}) {
  const sulit = difficulty === 'sulit'
  const rand = mulberry32(seed)
  const pick = (a) => a[Math.floor(rand() * a.length)]
  const between = (lo, hi) => lo + rand() * (hi - lo)

  const jabatan = [{ id: 1, gaji: 150_000 }, { id: 2, gaji: 120_000 }, { id: 3, gaji: 200_000 }, { id: 4, gaji: 300_000 }]
  const karyawan = Array.from({ length: employees }, (_, i) => {
    const j = jabatan[i % 4]
    return { id: i + 1, nama_karyawan: `Karyawan ${String(i + 1).padStart(2, '0')}`, jabatan_id: j.id, gaji_harian: j.gaji, status_aktif: true, tanggal_bergabung: '2026-01-05' }
  })
  karyawan[employees - 1].status_aktif = false // satu karyawan nonaktif (dipakai untuk injeksi)
  const endDate = addDays(startDate, days - 1)

  const presensi = [], lembur = [], kasbon = []
  let pid = 1, lid = 1, kid = 1
  for (const k of karyawan.filter((x) => x.status_aktif)) {
    for (let d = 0; d < days; d++) {
      const tgl = addDays(startDate, d)
      if (dowOf(tgl) === 0 || rand() > 0.92) continue // Minggu libur; 8% tidak hadir
      const masuk = 7.5 + 0.2 * gaussian(rand)
      const durasi = Math.max(7, 8.6 + 0.35 * gaussian(rand))
      const manual = rand() < 0.15
      presensi.push({
        id: pid++, project_id: 1, karyawan_id: k.id, tanggal: tgl,
        jam_masuk: hhmm(masuk), jam_keluar: hhmm(masuk + durasi), durasi_jam: Math.round(durasi * 100) / 100,
        status_kehadiran: 'hadir', metode_input: manual ? 'manual' : 'qr_code',
      })
      if (rand() < 0.1) {
        const dl = pick([1, 1.5, 2, 2.5, 3])
        const tarif = Math.round((k.gaji_harian / 8) * 1.5)
        lembur.push({
          id: lid++, project_id: 1, karyawan_id: k.id, tanggal: tgl,
          jam_mulai: hhmm(masuk + durasi), jam_selesai: hhmm(masuk + durasi + dl),
          durasi_jam: dl, tarif_lembur: tarif, total_lembur: dl * tarif, status_persetujuan: 'disetujui', catatan: 'Lembur manual',
        })
      }
    }
    const nK = rand() < 0.5 ? 1 : rand() < 0.5 ? 0 : 2
    for (let i = 0; i < nK; i++) {
      const jumlah = Math.round((k.gaji_harian * between(3, 12)) / 10_000) * 10_000
      kasbon.push({
        id: kid++, project_id: 1, karyawan_id: k.id, jumlah_kasbon: jumlah,
        sisa_kasbon: Math.round((jumlah * between(0.3, 1)) / 10_000) * 10_000,
        tanggal_kasbon: addDays(startDate, Math.floor(rand() * days)), status_lunas: false,
      })
    }
  }

  // ── Variasi SAH yang menyerupai anomali (bukan anomali; tidak diberi label) ──
  if (sulit) {
    for (const p of presensi) {
      const r = rand()
      if (r < 0.03) { const d = between(10, 11.5); Object.assign(p, { jam_keluar: hhmm(toH(p.jam_masuk) + d), durasi_jam: Math.round(d * 100) / 100 }) }      // hari panjang
      else if (r < 0.05) { const m = between(5.5, 6.5); Object.assign(p, { jam_masuk: hhmm(m), jam_keluar: hhmm(m + p.durasi_jam) }) }                        // datang pagi (pengecoran)
    }
    for (const l of lembur) if (rand() < 0.08) { const d = pick([4.5, 5]); Object.assign(l, { durasi_jam: d, total_lembur: d * l.tarif_lembur, jam_selesai: hhmm(toH(l.jam_mulai) + d) }) } // lembur 4–5 jam yang sah
  }

  // ── Injeksi anomali berlabel ──
  const labels = new Map()
  const mark = (tabel, id, tipe) => labels.set(`${tabel}:${id}`, tipe)

  const nP = Math.max(10, Math.round(presensi.length * anomalyRate))
  const tipeP = ['durasi_ekstrem', 'keluar_sebelum_masuk', 'jam_masuk_aneh', 'durasi_tak_konsisten', 'durasi_singkat']
  ;[...presensi].sort(() => rand() - 0.5).slice(0, nP).forEach((p, i) => {
    const tipe = tipeP[i % tipeP.length]
    const masuk = toH(p.jam_masuk)
    if (tipe === 'durasi_ekstrem') {
      const m = between(5, 6), d = sulit ? between(16.2, 17) : between(16.5, 18)
      Object.assign(p, { jam_masuk: hhmm(m), jam_keluar: hhmm(m + d), durasi_jam: Math.round(d * 100) / 100 })
    } else if (tipe === 'keluar_sebelum_masuk') {
      Object.assign(p, { jam_masuk: p.jam_keluar, jam_keluar: hhmm(masuk) })
    } else if (tipe === 'jam_masuk_aneh') {                      // halus: tak melanggar aturan apa pun
      const m = sulit ? between(3.2, 4.6) : between(2, 4.5)
      Object.assign(p, { jam_masuk: hhmm(m), jam_keluar: hhmm(m + p.durasi_jam) })
    } else if (tipe === 'durasi_tak_konsisten') {
      Object.assign(p, { jam_keluar: hhmm(masuk + 3) })
    } else {                                                     // halus: durasi singkat tapi konsisten
      const d = sulit ? between(5.5, 6.6) : between(4.5, 5.5)
      Object.assign(p, { jam_keluar: hhmm(masuk + d), durasi_jam: Math.round(d * 100) / 100 })
    }
    mark('presensi', p.id, tipe)
  })

  const nonaktif = karyawan[employees - 1]
  for (let i = 0; i < 3; i++) {
    const row = { id: pid++, project_id: 1, karyawan_id: nonaktif.id, tanggal: addDays(startDate, 10 + i * 5), jam_masuk: hhmm(7.5), jam_keluar: hhmm(16.1), durasi_jam: 8.6, status_kehadiran: 'hadir', metode_input: 'manual' }
    presensi.push(row); mark('presensi', row.id, 'karyawan_nonaktif')
  }

  const nL = Math.max(6, Math.round(lembur.length * 0.12))
  const tipeL = ['tanpa_presensi', 'lembur_ekstrem', 'total_salah', 'lembur_5jam']
  ;[...lembur].sort(() => rand() - 0.5).slice(0, nL).forEach((l, i) => {
    const tipe = tipeL[i % tipeL.length]
    if (tipe === 'tanpa_presensi') {
      const idx = presensi.findIndex((p) => p.karyawan_id === l.karyawan_id && p.tanggal === l.tanggal && !labels.has(`presensi:${p.id}`))
      if (idx >= 0) presensi.splice(idx, 1)
    } else if (tipe === 'lembur_ekstrem') {
      const d = sulit ? pick([8.5, 9]) : pick([8.5, 9, 10, 11])
      Object.assign(l, { durasi_jam: d, total_lembur: d * l.tarif_lembur, jam_selesai: hhmm(toH(l.jam_mulai) + d) })
    } else if (tipe === 'total_salah') {
      l.total_lembur = Math.round(l.total_lembur * 1.5)
    } else {
      Object.assign(l, { durasi_jam: 5, total_lembur: 5 * l.tarif_lembur })
    }
    mark('lembur', l.id, tipe)
  })

  const nK = Math.max(4, Math.round(kasbon.length * 0.15))
  ;[...kasbon].sort(() => rand() - 0.5).slice(0, nK).forEach((b, i) => {
    const gh = karyawan.find((k) => k.id === b.karyawan_id).gaji_harian
    if (i % 2 === 0) {
      const j = Math.round((gh * (sulit ? between(30, 45) : between(60, 90))) / 10_000) * 10_000
      Object.assign(b, { jumlah_kasbon: j, sisa_kasbon: j }); mark('kasbon', b.id, 'kasbon_besar')
    } else {
      b.sisa_kasbon = b.jumlah_kasbon + 500_000; mark('kasbon', b.id, 'sisa_salah')
    }
  })

  return { karyawan, presensi, lembur, kasbon, gaji: [], labels, today: endDate }
}
