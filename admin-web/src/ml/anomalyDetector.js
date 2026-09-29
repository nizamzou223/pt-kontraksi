// Deteksi anomali data kepegawaian: aturan bisnis + statistik robust + Isolation Forest,
// digabung (noisy-OR) menjadi skor 0..1 lengkap dengan ALASAN yang dapat dibaca admin.
//
// Prinsip desain:
//  • Presensi 'otomatis' & lembur bentukan sistem tidak diperiksa (bukan observasi nyata).
//  • Penanda hanyalah SARAN — keputusan akhir ada pada admin (status tinjauan).
//  • Deterministik (benih tetap) → hasil dapat direproduksi untuk pengujian & laporan.
import { IsolationForest } from './isolationForest'
import { median, mad, std } from './stats'
import { toHours, presensiRules, lemburRules, kasbonRules, buildContext } from './anomalyRules'

export const TINGKAT = { tinggi: 0.75, sedang: 0.5 }
export const tingkatDari = (skor) => (skor >= TINGKAT.tinggi ? 'tinggi' : skor >= TINGKAT.sedang ? 'sedang' : 'rendah')

const Z_BATAS = 3.5
const IF_MIN_DATA = 30
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const jam = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 1 })
const sgn = (z) => (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(1).replace('.', ',')
const noisyOr = (ws) => 1 - ws.reduce((p, w) => p * (1 - w), 1)

const dow = (tanggal) => (new Date(`${tanggal}T00:00:00Z`).getUTCDay() + 6) % 7 // Senin = 0

/** Baseline robust (median, MAD, skala cadangan) dari sekumpulan nilai. */
function baselineOf(values) {
  const med = median(values)
  const m = mad(values, med)
  return { med, mad: m, n: values.length, fb: std(values) }
}
// Lantai skala: variasi di bawah ambang praktis dianggap derau (mencegah z membengkak saat MAD sangat kecil,
// mis. hari kerja 11 jam terlihat "ekstrem" hanya karena durasi karyawan lain nyaris seragam).
const LANTAI = { durasi: 0.75, masuk: 0.5, lembur: 0.75, kasbon: 0.5, gaji: 0.1 }
function zOf(x, b, lantai = 0) {
  const sigma = b.mad > 0 ? 1.4826 * b.mad : b.fb
  const skala = Math.max(sigma, lantai)
  return skala > 0 ? (x - b.med) / skala : 0
}
const bobotZ = (z) => Math.min(0.9, 0.5 + 0.1 * (Math.abs(z) - Z_BATAS))

// ───────────────────────── Statistik robust ─────────────────────────
function statFindings(domain, { presensi, lembur, kasbon, gaji, ctx }) {
  const out = new Map() // id → findings[]
  const add = (id, f) => { if (!out.has(id)) out.set(id, []); out.get(id).push(f) }

  if (domain === 'presensi') {
    const rows = presensi.filter((p) => num(p.durasi_jam) > 0 && toHours(p.jam_masuk) !== null)
    const global = { d: baselineOf(rows.map((p) => Number(p.durasi_jam))), m: baselineOf(rows.map((p) => toHours(p.jam_masuk))) }
    const per = new Map()
    for (const p of rows) { if (!per.has(p.karyawan_id)) per.set(p.karyawan_id, []); per.get(p.karyawan_id).push(p) }
    const base = new Map([...per].map(([k, rs]) => [k, rs.length >= 8
      ? { d: baselineOf(rs.map((p) => Number(p.durasi_jam))), m: baselineOf(rs.map((p) => toHours(p.jam_masuk))), own: true } : { ...global, own: false }]))
    for (const p of rows) {
      const b = base.get(p.karyawan_id)
      const d = Number(p.durasi_jam), m = toHours(p.jam_masuk)
      const zd = zOf(d, b.d, LANTAI.durasi), zm = zOf(m, b.m, LANTAI.masuk)
      const acuan = b.own ? 'median karyawan ini' : 'median seluruh karyawan'
      if (Math.abs(zd) >= Z_BATAS && Math.abs(d - b.d.med) >= 2) {
        add(p.id, { kode: 'STAT_DURASI', tingkat: 'sedang', bobot: bobotZ(zd), metode: 'statistik', teks: `Durasi kerja ${jam(d)} jam menyimpang dari ${acuan} (${jam(b.d.med)} jam), z = ${sgn(zd)}.` })
      }
      if (Math.abs(zm) >= Z_BATAS && Math.abs(m - b.m.med) >= 1.5) {
        const hh = (x) => { const t = Math.round(x * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
        add(p.id, { kode: 'STAT_JAM_MASUK', tingkat: 'sedang', bobot: bobotZ(zm), metode: 'statistik', teks: `Jam masuk ${hh(m)} tidak lazim dibanding ${acuan} (${hh(b.m.med)}), z = ${sgn(zm)}.` })
      }
    }
  }

  if (domain === 'lembur') {
    const rows = lembur.filter((l) => num(l.durasi_jam) > 0)
    const global = baselineOf(rows.map((l) => Number(l.durasi_jam)))
    const per = new Map()
    for (const l of rows) { if (!per.has(l.karyawan_id)) per.set(l.karyawan_id, []); per.get(l.karyawan_id).push(Number(l.durasi_jam)) }
    for (const l of rows) {
      const own = per.get(l.karyawan_id)
      const b = own.length >= 5 ? baselineOf(own) : global
      const d = Number(l.durasi_jam), z = zOf(d, b, LANTAI.lembur)
      if (z >= Z_BATAS && d - b.med >= 1.5) {
        add(l.id, { kode: 'STAT_LEMBUR', tingkat: 'sedang', bobot: bobotZ(z), metode: 'statistik', teks: `Lembur ${jam(d)} jam jauh di atas kebiasaan (${jam(b.med)} jam), z = ${sgn(z)}.` })
      }
    }
  }

  if (domain === 'kasbon') {
    const rows = kasbon.map((b) => ({ b, gh: Number(ctx.karyawan.get(b.karyawan_id)?.gaji_harian) || 0 })).filter((r) => r.gh > 0 && Number(r.b.jumlah_kasbon) > 0)
    if (rows.length >= 10) {
      const logs = rows.map((r) => Math.log(Number(r.b.jumlah_kasbon) / r.gh))
      const base = baselineOf(logs)
      rows.forEach((r, i) => {
        const z = zOf(logs[i], base, LANTAI.kasbon)
        if (z >= Z_BATAS) {
          add(r.b.id, { kode: 'STAT_KASBON', tingkat: 'sedang', bobot: bobotZ(z), metode: 'statistik', teks: `Nilai kasbon (${jam(Number(r.b.jumlah_kasbon) / r.gh)} hari gaji) jauh di atas kasbon karyawan lain (median ${jam(Math.exp(base.med))} hari gaji), z = ${sgn(z)}.` })
        }
      })
    }
  }

  if (domain === 'gaji') {
    const groups = new Map()
    for (const g of gaji) {
      const jab = ctx.karyawan.get(g.karyawan_id)?.jabatan_id ?? 'x'
      const key = `${g.periode_mulai}|${jab}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(g)
    }
    for (const [, rs] of groups) {
      if (rs.length < 5) continue
      const base = baselineOf(rs.map((g) => Number(g.gaji_kotor)))
      for (const g of rs) {
        const z = zOf(Number(g.gaji_kotor), base, LANTAI.gaji * Math.abs(base.med))
        if (Math.abs(z) >= Z_BATAS) {
          add(g.id, { kode: 'STAT_GAJI', tingkat: 'sedang', bobot: bobotZ(z), metode: 'statistik', teks: `Gaji kotor Rp ${Math.round(g.gaji_kotor).toLocaleString('id-ID')} menyimpang dari rekan sejabatan pada minggu yang sama (median Rp ${Math.round(base.med).toLocaleString('id-ID')}), z = ${sgn(z)}.` })
        }
      }
    }
  }
  return out
}

// ───────────────────────── Isolation Forest ─────────────────────────
const FITUR_NAMA = {
  presensi: ['durasi kerja', 'jam masuk', 'jam keluar', 'hari dalam pekan', 'selisih durasi dari kebiasaan', 'selisih jam masuk dari kebiasaan', 'input manual'],
  lembur: ['durasi lembur', 'rasio lembur terhadap durasi kerja', 'tarif per jam relatif terhadap gaji', 'jam mulai', 'hari dalam pekan'],
  kasbon: ['nilai kasbon (hari gaji)', 'rasio sisa/jumlah', 'jumlah kasbon dalam 14 hari'],
  gaji: ['gaji kotor', 'rasio gaji bersih', 'rasio potongan kasbon', 'jumlah hari hadir'],
}

function featuresFor(domain, { presensi, lembur, kasbon, gaji, ctx }) {
  const rows = [], ids = []
  if (domain === 'presensi') {
    const usable = presensi.filter((p) => (p.status_kehadiran || 'hadir') === 'hadir' && num(p.durasi_jam) !== null && toHours(p.jam_masuk) !== null && toHours(p.jam_keluar) !== null)
    const per = new Map()
    for (const p of usable) { if (!per.has(p.karyawan_id)) per.set(p.karyawan_id, []); per.get(p.karyawan_id).push(p) }
    const med = new Map([...per].map(([k, rs]) => [k, { d: median(rs.map((p) => Number(p.durasi_jam))), m: median(rs.map((p) => toHours(p.jam_masuk))) }]))
    for (const p of usable) {
      const b = med.get(p.karyawan_id)
      rows.push([Number(p.durasi_jam), toHours(p.jam_masuk), toHours(p.jam_keluar), dow(p.tanggal), Number(p.durasi_jam) - b.d, toHours(p.jam_masuk) - b.m, p.metode_input === 'manual' ? 1 : 0])
      ids.push(p.id)
    }
  } else if (domain === 'lembur') {
    const durasiKerja = new Map(presensi.map((p) => [`${p.karyawan_id}|${p.tanggal}`, Number(p.durasi_jam) || 0]))
    for (const l of lembur) {
      const gh = Number(ctx.karyawan.get(l.karyawan_id)?.gaji_harian) || 0
      const dk = durasiKerja.get(`${l.karyawan_id}|${l.tanggal}`) || 0
      rows.push([Number(l.durasi_jam) || 0, dk > 0 ? (Number(l.durasi_jam) || 0) / dk : 2, gh > 0 ? Number(l.tarif_lembur) / (gh / 8) : 1, toHours(l.jam_mulai) ?? 12, dow(l.tanggal)])
      ids.push(l.id)
    }
  } else if (domain === 'kasbon') {
    for (const b of kasbon) {
      const gh = Number(ctx.karyawan.get(b.karyawan_id)?.gaji_harian) || 0
      const jumlah = Number(b.jumlah_kasbon) || 0
      rows.push([gh > 0 ? jumlah / gh : 0, jumlah > 0 ? (Number(b.sisa_kasbon) || 0) / jumlah : 0, ctx.kasbonBerulang.get(b.id) || 1])
      ids.push(b.id)
    }
  } else if (domain === 'gaji') {
    for (const g of gaji) {
      const kotor = Number(g.gaji_kotor) || 0
      rows.push([kotor, kotor > 0 ? (Number(g.gaji_bersih) || 0) / kotor : 1, kotor > 0 ? (Number(g.total_potongan_kasbon) || 0) / kotor : 0, Number(g.total_hari_hadir) || 0])
      ids.push(g.id)
    }
  }
  return { rows, ids }
}

function iforestFindings(domain, data, seed) {
  const out = new Map(), skorAll = new Map()
  const { rows, ids } = featuresFor(domain, data)
  if (rows.length < IF_MIN_DATA) return { out, skorAll }
  const forest = new IsolationForest({ nTrees: 100, sampleSize: 256, seed }).fit(rows)
  const scores = forest.score(rows)
  const nFeat = rows[0].length
  const bases = Array.from({ length: nFeat }, (_, f) => baselineOf(rows.map((r) => r[f])))
  scores.forEach((s, i) => {
    skorAll.set(ids[i], s)
    if (s < 0.6) return
    const dev = rows[i].map((v, f) => ({ f, z: zOf(v, bases[f]) })).filter((x) => Math.abs(x.z) >= 2).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 2)
    const sebab = dev.length ? ` Paling menyimpang: ${dev.map((x) => `${FITUR_NAMA[domain][x.f]} (z ${sgn(x.z)})`).join(', ')}.` : ''
    const bobot = 0.8 * Math.min(1, Math.max(0, (s - 0.55) / 0.25))
    out.set(ids[i], [{ kode: 'IFOREST', tingkat: 'sedang', bobot, metode: 'isolation forest', teks: `Kombinasi nilai tidak lazim dibanding data lain (skor Isolation Forest ${s.toFixed(2).replace('.', ',')}).${sebab}` }])
  })
  return { out, skorAll }
}

// ───────────────────────── Penggabung ─────────────────────────
const SUMBER = {
  presensi: { tabel: 'presensi', tanggal: (r) => r.tanggal },
  lembur: { tabel: 'lembur', tanggal: (r) => r.tanggal },
  kasbon: { tabel: 'kasbon', tanggal: (r) => r.tanggal_kasbon },
  gaji: { tabel: 'rekap_gaji_mingguan', tanggal: (r) => r.periode_mulai },
}

/**
 * @param methods { rules, stats, iforest } — dapat dimatikan satu-satu (dipakai evaluasi ablasi)
 * @param returnAll sertakan SEMUA baris (termasuk skor 0) → untuk menghitung AUC pada evaluasi
 * @param reviewed  Set 'tabel:id' yang sudah ditinjau admin sebagai bukan anomali / diabaikan
 */
export function detectAnomalies({
  karyawan = [], presensi = [], lembur = [], kasbon = [], gaji = [], today,
  threshold = 0.5, methods = { rules: true, stats: true, iforest: true }, seed = 42, returnAll = false, reviewed = new Set(),
} = {}) {
  const kar = karyawan.map((k) => ({ ...k, gaji_harian: Number(k.gaji_harian) || 0 }))
  const presensiReal = presensi.filter((p) => p.metode_input !== 'otomatis')
  const lemburReal = lembur.filter((l) => !/^otomatis/i.test(l.catatan || ''))
  const ctx = buildContext({ karyawan: kar, presensi: presensiReal, lembur: lemburReal, kasbon, today })
  const data = { presensi: presensiReal, lembur: lemburReal, kasbon, gaji, ctx }

  const domains = { presensi: presensiReal, lembur: lemburReal, kasbon, gaji }
  const items = []
  let disembunyikan = 0

  for (const [domain, rows] of Object.entries(domains)) {
    if (!rows.length) continue
    const st = methods.stats ? statFindings(domain, data) : new Map()
    const iff = methods.iforest ? iforestFindings(domain, data, seed) : { out: new Map(), skorAll: new Map() }
    const ruleFn = { presensi: presensiRules, lembur: lemburRules, kasbon: kasbonRules }[domain]

    for (const r of rows) {
      const temuan = [
        ...(methods.rules && ruleFn ? ruleFn(r, ctx).map((f) => ({ ...f, metode: 'aturan bisnis' })) : []),
        ...(st.get(r.id) || []),
        ...(iff.out.get(r.id) || []),
      ].sort((a, b) => b.bobot - a.bobot)
      const skor = temuan.length ? noisyOr(temuan.map((f) => f.bobot)) : 0
      const key = `${SUMBER[domain].tabel}:${r.id}`
      if (!returnAll && skor < threshold) continue
      if (!returnAll && reviewed.has(key)) { disembunyikan++; continue }
      const k = ctx.karyawan.get(r.karyawan_id)
      items.push({
        key, sumber_tabel: SUMBER[domain].tabel, sumber_id: r.id, karyawan_id: r.karyawan_id ?? null,
        nama_karyawan: k?.nama_karyawan || null, project_id: r.project_id ?? null, tanggal: SUMBER[domain].tanggal(r),
        skor, tingkat: tingkatDari(skor),
        alasan: temuan.map(({ kode, tingkat, teks, bobot, metode }) => ({ kode, tingkat, teks, bobot, metode })),
        metode: [...new Set(temuan.map((f) => f.metode))],
        skorIforest: iff.skorAll.get(r.id) ?? null,
      })
    }
  }

  items.sort((a, b) => b.skor - a.skor)
  const ditandai = items.filter((i) => i.skor >= threshold)
  const perSumber = {}, perTingkat = { tinggi: 0, sedang: 0, rendah: 0 }
  for (const i of ditandai) { perSumber[i.sumber_tabel] = (perSumber[i.sumber_tabel] || 0) + 1; perTingkat[i.tingkat]++ }
  return {
    items: returnAll ? items : ditandai,
    ringkasan: {
      diperiksa: { presensi: presensiReal.length, lembur: lemburReal.length, kasbon: kasbon.length, gaji: gaji.length },
      dikecualikan: { presensi_otomatis: presensi.length - presensiReal.length, lembur_otomatis: lembur.length - lemburReal.length },
      ditandai: ditandai.length, perSumber, perTingkat, disembunyikan, threshold,
    },
  }
}
