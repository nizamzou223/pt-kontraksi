import { formatRupiah, formatTanggal, formatPresensiStatus } from '../utils/formatters'

const BULAN_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const RUPIAH_FMT  = '"Rp "#,##0'
const COL_BLUE    = '1D4ED8'
const COL_WHITE   = 'FFFFFF'
const COL_AMBER   = 'FEF3C7'
const COL_STRIPE  = 'F0F9FF'

function hdrStyle(color = COL_BLUE) {
  return { font: { bold: true, color: { rgb: COL_WHITE }, sz: 10 }, fill: { fgColor: { rgb: color } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: color } } } }
}
function totStyle() { return { font: { bold: true }, fill: { fgColor: { rgb: COL_AMBER } } } }
function rowStyle(isEven) { return { fill: { fgColor: { rgb: isEven ? COL_STRIPE : COL_WHITE } } } }

function encode(r, c) {
  if (c < 26) return String.fromCharCode(65 + c) + (r + 1)
  return String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26)) + (r + 1)
}

// ── Helper sheet laporan rapi: judul, info, header berwarna, border, zebra, format Rp, baris TOTAL ──
// cols: [{ h, w, fn(row, i), rp?, align? }]; total: { [header]: 'sum' | nilai }
const THIN = { style: 'thin', color: { rgb: 'CBD5E1' } }
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN }
function buildReportSheet(XLSX, { title, info = [], cols, rows, total, color = COL_BLUE, emptyText = 'Tidak ada data' }) {
  const hdrIdx = 2 + info.length
  const body = rows.length ? rows.map((r, i) => cols.map(c => c.fn(r, i + 1))) : [[emptyText, ...Array(cols.length - 1).fill('')]]
  const wsData = [[title], ...info.map(t => [t]), [], cols.map(c => c.h), ...body]
  if (total && rows.length) {
    wsData.push(cols.map((c, ci) => {
      if (ci === 0) return 'TOTAL'
      const t = total[c.h]
      if (t === 'sum') return rows.reduce((s, r, i) => s + (parseFloat(c.fn(r, i + 1)) || 0), 0)
      return t ?? ''
    }))
  }
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = cols.map(c => ({ wch: c.w }))
  ws['!rows'] = [{ hpt: 22 }]
  const last = cols.length - 1
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: last } },
    ...info.map((_, i) => ({ s: { r: i + 1, c: 0 }, e: { r: i + 1, c: last } })),
    ...(rows.length ? [] : [{ s: { r: hdrIdx + 1, c: 0 }, e: { r: hdrIdx + 1, c: last } }]),
  ]
  ws['A1'].s = { font: { bold: true, sz: 14, color: { rgb: COL_WHITE } }, fill: { fgColor: { rgb: color } }, alignment: { vertical: 'center' } }
  info.forEach((_, i) => { const a = encode(i + 1, 0); if (ws[a]) ws[a].s = { font: { sz: 10, color: { rgb: '475569' } } } })

  cols.forEach((col, c) => {
    const a = encode(hdrIdx, c)
    ws[a].s = { ...hdrStyle(color), border: BORDER }
  })
  for (let row = hdrIdx + 1; row < wsData.length; row++) {
    const isTot = rows.length && wsData[row][0] === 'TOTAL' && row === wsData.length - 1 && total
    cols.forEach((col, c) => {
      const a = encode(row, c)
      if (!ws[a]) ws[a] = { t: 's', v: '' }
      const base = isTot ? totStyle() : rowStyle((row - hdrIdx) % 2 === 0)
      const isNum = typeof ws[a].v === 'number'
      ws[a].s = { ...base, border: BORDER, alignment: { vertical: 'top', wrapText: true, horizontal: col.align || (isNum ? 'right' : 'left') } }
      if (col.rp && isNum) ws[a].z = RUPIAH_FMT
      else if (isNum) ws[a].z = Number.isInteger(ws[a].v) ? '#,##0' : '#,##0.00'
    })
  }
  if (rows.length) ws['!autofilter'] = { ref: `${encode(hdrIdx, 0)}:${encode(hdrIdx + rows.length, last)}` }
  return ws
}

// ── Template PDF: kop berwarna + info di halaman 1, nomor halaman di semua halaman ──
const PDF_BLUE = [29, 78, 216]
function pdfHeader(doc, { title, info = [], color = PDF_BLUE }) {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(...color); doc.rect(0, 0, w, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('PT Krakatau Indah', 14, 11)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.text(title, 14, 18.5)
  doc.setFontSize(8); doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, w - 14, 11, { align: 'right' })
  doc.setTextColor(71, 85, 105); doc.setFontSize(9)
  let y = 31
  info.forEach(t => { doc.text(t, 14, y); y += 5 })
  doc.setTextColor(0, 0, 0)
  return y + 1
}
function pdfFooter(doc, label) {
  const n = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2); doc.line(14, h - 12, w - 14, h - 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139)
    doc.text(`PT Krakatau Indah — ${label}`, 14, h - 7)
    doc.text(`Halaman ${i} dari ${n}`, w - 14, h - 7, { align: 'right' })
  }
  doc.setTextColor(0, 0, 0)
}

// ── Presensi: label status, urutan (golongan → nama), ringkasan jumlah ──
const labelPresensi = r => formatPresensiStatus(r.status_kehadiran, r.jam_masuk)
const uangHarianPresensi = r =>
  (parseFloat(r.uang_makan) || 0) + (parseFloat(r.uang_transport) || 0) + (parseFloat(r.upah_luar_kota) || 0)
function catatanPresensi(r) {
  if (r._virtual) return r.status_kehadiran === 'belum_input' ? 'Belum diinput' : 'Tidak tercatat'
  return r.catatan || ''
}
function urutkanGolongan(data) {
  return [...data].sort((a, b) => {
    const gA = a.karyawan?.jabatan?.nama_jabatan || 'Tanpa Golongan'
    const gB = b.karyawan?.jabatan?.nama_jabatan || 'Tanpa Golongan'
    return gA !== gB ? gA.localeCompare(gB) : (a.karyawan?.nama_karyawan || '').localeCompare(b.karyawan?.nama_karyawan || '')
  })
}
function ringkasPresensi(rows) {
  const s = { total: rows.length, selesai: 0, bekerja: 0, tidakHadir: 0, belum: 0 }
  rows.forEach(r => {
    const l = labelPresensi(r)
    if (l === 'Selesai') s.selesai++
    else if (l === 'Sedang Bekerja') s.bekerja++
    else if (l === 'Belum Input') s.belum++
    else s.tidakHadir++
  })
  return s
}

// ── Penggajian: helper umum untuk laporan Excel/PDF (gaji, lembur, kasbon) ──
const kapital = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '-')
const jumlah = (arr, f) => arr.reduce((t, r) => t + (parseFloat(f(r)) || 0), 0)
const dicetakInfo = () => `Dicetak: ${new Date().toLocaleString('id-ID')}`
// NIK 16 digit wajib berupa teks (angka akan dipotong Excel jadi notasi ilmiah)
const nikKaryawan = r => String(r.karyawan?.nik || r.karyawan?.id_karyawan || '-')
const namaGolongan = r => r.karyawan?.jabatan?.nama_jabatan || 'Tanpa Golongan'
const dalamGaji = r => !!r.catatan?.includes('Sudah dalam Gaji')
const sumberLembur = r => (dalamGaji(r) ? 'Hari Kerja' : r.catatan?.startsWith('Otomatis') ? 'Auto' : 'Manual')
function perGolongan(data) {
  const m = {}
  data.forEach(r => { (m[namaGolongan(r)] ||= []).push(r) })
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b))
}

const GAYA_GOL_BIRU = { fillColor: [219, 234, 254], textColor: [30, 58, 138] }
const GAYA_GOL_HIJAU = { fillColor: [209, 250, 229], textColor: [6, 95, 70] }
// Isi tabel PDF dikelompokkan per golongan (baris judul golongan selebar tabel)
function bodyPerGolongan(data, kolom, barisFn, gaya = GAYA_GOL_BIRU) {
  const body = []
  let prev = null, no = 0
  urutkanGolongan(data).forEach(r => {
    const g = namaGolongan(r)
    if (g !== prev) {
      body.push([{ content: g.toUpperCase(), colSpan: kolom, styles: { fontStyle: 'bold', ...gaya } }])
      prev = g
    }
    body.push(barisFn(r, ++no))
  })
  if (!body.length) body.push([{ content: 'Belum ada data', colSpan: kolom, styles: { halign: 'center', textColor: [100, 116, 139] } }])
  return body
}

// Satu dokumen PDF laporan: kop berwarna + info, satu/lebih tabel, footer bernomor halaman.
// tables: [{ judul?, head, body, foot?, columnStyles?, fontSize?, didParseCell? }]
async function pdfLaporan({ title, info = [], color = PDF_BLUE, stripe = [240, 249, 255], tables, label, filename, orientation = 'landscape' }) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation, format: 'a4' })
  let y = pdfHeader(doc, { title, info, color })
  tables.forEach(t => {
    if (t.judul) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 41, 59)
      doc.text(t.judul, 14, y + 3); doc.setTextColor(0, 0, 0)
      y += 6
    }
    autoTable(doc, {
      startY: y,
      head: [t.head],
      body: t.body,
      foot: t.foot ? [t.foot] : undefined,
      showFoot: 'lastPage',
      styles: { fontSize: t.fontSize || 8, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.1, valign: 'middle' },
      headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [254, 243, 199], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: stripe },
      columnStyles: t.columnStyles || {},
      didParseCell: (d) => {
        // baris TOTAL: ikuti perataan kolomnya (autoTable tidak menerapkan columnStyles ke foot)
        const rata = t.columnStyles?.[d.column.index]?.halign
        if (d.section === 'foot' && rata && d.cell.colSpan === 1) d.cell.styles.halign = rata
        t.didParseCell?.(d)
      },
      margin: { top: 16, left: 14, right: 14, bottom: 16 },
    })
    y = doc.lastAutoTable.finalY + 8
  })
  pdfFooter(doc, label || title)
  doc.save(filename)
}
const tgl = () => new Date().toISOString().slice(0, 10)
const slug = s => String(s || '').replace(/\s+/g, '-')


export const exportService = {

  // ── GAJI MINGGUAN per Golongan + per Project ─────────────────────────────
  // Template gudang (xlsx-js-style + buildReportSheet): judul, info, header, border, zebra, Rp, TOTAL, autofilter.
  async exportGajiMingguanPerProject(data, projectName, periode) {
    const XLSX = await import('xlsx-js-style')
    const rows = urutkanGolongan(data)
    const info = [
      `Project: ${projectName}  |  Periode: ${periode}`,
      `Total ${rows.length} karyawan  |  Total gaji bersih: ${formatRupiah(jumlah(rows, r => r.gaji_bersih))}`,
      dicetakInfo(),
    ]
    const wb = XLSX.utils.book_new()

    // Sheet 1: Rekap per Golongan
    const rekap = perGolongan(rows).map(([golongan, rs]) => ({
      golongan, karyawan: rs.length,
      hari: jumlah(rs, r => r.total_hari_hadir), lembur: jumlah(rs, r => r.total_uang_lembur),
      luarKota: jumlah(rs, r => r.project_details?._upah_luar_kota), bersih: jumlah(rs, r => r.gaji_bersih),
    }))
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: 'PT Krakatau Indah — Rekap Gaji Mingguan', info, emptyText: 'Belum ada data gaji',
      cols: [
        { h: 'Golongan',     w: 28, fn: r => r.golongan },
        { h: 'Karyawan',     w: 12, fn: r => r.karyawan, align: 'center' },
        { h: 'Total Hari',   w: 12, fn: r => r.hari, align: 'center' },
        { h: 'Total Lembur', w: 18, fn: r => r.lembur, rp: true },
        { h: 'Luar Kota',    w: 16, fn: r => r.luarKota, rp: true },
        { h: 'Gaji Bersih',  w: 22, fn: r => r.bersih, rp: true },
      ],
      rows: rekap, total: { Karyawan: 'sum', 'Total Hari': 'sum', 'Total Lembur': 'sum', 'Luar Kota': 'sum', 'Gaji Bersih': 'sum' },
    }), 'Rekap Golongan')

    // Sheet 2: Detail per karyawan (urut golongan → nama)
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: 'PT Krakatau Indah — Detail Gaji Mingguan', info, emptyText: 'Belum ada data gaji',
      cols: [
        { h: 'No',            w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'NIK',           w: 20, fn: r => nikKaryawan(r) },
        { h: 'Nama',          w: 26, fn: r => r.karyawan?.nama_karyawan || '-' },
        { h: 'Golongan',      w: 20, fn: r => r.karyawan?.jabatan?.nama_jabatan || '-' },
        { h: 'Hari Hadir',    w: 11, fn: r => parseInt(r.total_hari_hadir || 0), align: 'center' },
        { h: 'Gaji Pokok',    w: 17, fn: r => parseFloat(r.total_gaji_pokok || 0), rp: true },
        { h: 'Uang Makan',    w: 15, fn: r => parseFloat(r.total_uang_makan || 0), rp: true },
        { h: 'Transport',     w: 15, fn: r => parseFloat(r.total_uang_transport || 0), rp: true },
        { h: 'Lembur',        w: 15, fn: r => parseFloat(r.total_uang_lembur || 0), rp: true },
        { h: 'Luar Kota',     w: 15, fn: r => parseFloat(r.project_details?._upah_luar_kota || 0), rp: true },
        { h: 'Kasbon Potong', w: 15, fn: r => parseFloat(r.total_potongan_kasbon || 0), rp: true },
        { h: 'Gaji Bersih',   w: 18, fn: r => parseFloat(r.gaji_bersih || 0), rp: true },
        { h: 'Status',        w: 12, fn: r => kapital(r.status), align: 'center' },
      ],
      rows, total: {
        'Hari Hadir': 'sum', 'Gaji Pokok': 'sum', 'Uang Makan': 'sum', Transport: 'sum', Lembur: 'sum',
        'Luar Kota': 'sum', 'Kasbon Potong': 'sum', 'Gaji Bersih': 'sum',
      },
    }), 'Detail Karyawan')

    XLSX.writeFile(wb, `gaji-mingguan-${slug(projectName)}-${tgl()}.xlsx`)
  },

  // ── GAJI BULANAN per Golongan ─────────────────────────────────────────────
  async exportGajiBulananPerGolongan(data, bulan, tahun) {
    const XLSX = await import('xlsx-js-style')
    const bulanStr = BULAN_NAMES[parseInt(bulan) - 1] || String(bulan)
    const rows = urutkanGolongan(data)
    const info = [
      `Periode: ${bulanStr} ${tahun}`,
      `Total ${rows.length} karyawan  |  Total gaji bersih: ${formatRupiah(jumlah(rows, r => r.total_gaji_bersih))}`,
      dicetakInfo(),
    ]
    const wb = XLSX.utils.book_new()

    const rekap = perGolongan(rows).map(([golongan, rs]) => ({
      golongan, karyawan: rs.length,
      hari: jumlah(rs, r => r.total_hari_hadir), bersih: jumlah(rs, r => r.total_gaji_bersih),
    }))
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `PT Krakatau Indah — Rekap Gaji ${bulanStr} ${tahun}`, info, emptyText: 'Belum ada data gaji',
      cols: [
        { h: 'Golongan',    w: 28, fn: r => r.golongan },
        { h: 'Karyawan',    w: 14, fn: r => r.karyawan, align: 'center' },
        { h: 'Total Hari',  w: 14, fn: r => r.hari, align: 'center' },
        { h: 'Gaji Bersih', w: 22, fn: r => r.bersih, rp: true },
      ],
      rows: rekap, total: { Karyawan: 'sum', 'Total Hari': 'sum', 'Gaji Bersih': 'sum' },
    }), 'Rekap Golongan')

    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `PT Krakatau Indah — Detail Gaji ${bulanStr} ${tahun}`, info, emptyText: 'Belum ada data gaji',
      cols: [
        { h: 'No',            w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'NIK',           w: 20, fn: r => nikKaryawan(r) },
        { h: 'Nama',          w: 26, fn: r => r.karyawan?.nama_karyawan || '-' },
        { h: 'Golongan',      w: 20, fn: r => r.karyawan?.jabatan?.nama_jabatan || '-' },
        { h: 'Hari Hadir',    w: 11, fn: r => parseInt(r.total_hari_hadir || 0), align: 'center' },
        { h: 'Lembur',        w: 16, fn: r => parseFloat(r.total_uang_lembur || 0), rp: true },
        { h: 'Kasbon Potong', w: 16, fn: r => parseFloat(r.total_kasbon_potong || 0), rp: true },
        { h: 'Gaji Bersih',   w: 18, fn: r => parseFloat(r.total_gaji_bersih || 0), rp: true },
      ],
      rows, total: { 'Hari Hadir': 'sum', Lembur: 'sum', 'Kasbon Potong': 'sum', 'Gaji Bersih': 'sum' },
    }), 'Detail Karyawan')

    XLSX.writeFile(wb, `gaji-bulanan-${bulanStr}-${tahun}-${tgl()}.xlsx`)
  },

  // ── LEMBUR per Project per Golongan ──────────────────────────────────────
  async exportLemburPerProject(data, projectName) {
    const XLSX = await import('xlsx-js-style')
    const rows = urutkanGolongan(data)
    const lemburBayar = rows.filter(r => !dalamGaji(r))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: 'PT Krakatau Indah — Laporan Lembur', color: '047857', emptyText: 'Belum ada data lembur',
      info: [
        `Project: ${projectName}`,
        `Total ${rows.length} data  |  Total durasi: ${Math.round(jumlah(rows, r => r.durasi_jam) * 10) / 10} jam  |  Total upah lembur: ${formatRupiah(jumlah(lemburBayar, r => r.total_lembur))}`,
        dicetakInfo(),
      ],
      cols: [
        { h: 'No',           w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'NIK',          w: 20, fn: r => nikKaryawan(r) },
        { h: 'Nama',         w: 26, fn: r => r.karyawan?.nama_karyawan || '-' },
        { h: 'Golongan',     w: 20, fn: r => r.karyawan?.jabatan?.nama_jabatan || '-' },
        { h: 'Tanggal',      w: 14, fn: r => formatTanggal(r.tanggal) },
        { h: 'Jam Mulai',    w: 11, fn: r => r.jam_mulai?.slice(0, 5) || '-', align: 'center' },
        { h: 'Jam Selesai',  w: 11, fn: r => r.jam_selesai?.slice(0, 5) || '-', align: 'center' },
        { h: 'Durasi (jam)', w: 13, fn: r => parseFloat(r.durasi_jam || 0), align: 'center' },
        { h: 'Tarif/Jam',    w: 15, fn: r => parseFloat(r.tarif_lembur || 0), rp: true },
        // Lembur hari kerja sudah termasuk gaji — tampil teks agar tidak ikut dijumlah sebagai upah tambahan
        { h: 'Total',        w: 18, fn: r => (dalamGaji(r) ? '(dalam gaji)' : parseFloat(r.total_lembur || 0)), rp: true, align: 'right' },
        { h: 'Status',       w: 13, fn: r => kapital(r.status_persetujuan), align: 'center' },
        { h: 'Sumber',       w: 12, fn: r => sumberLembur(r), align: 'center' },
      ],
      rows, total: { 'Durasi (jam)': 'sum', Total: 'sum' },
    }), 'Lembur')
    XLSX.writeFile(wb, `lembur-${slug(projectName)}-${tgl()}.xlsx`)
  },


  // ── PRESENSI Excel ────────────────────────────────────────────────────────
  // Pakai xlsx-js-style + buildReportSheet (template yang sama dengan laporan gudang):
  // judul berwarna, info, header, border, zebra, format Rp, baris TOTAL, autofilter.
  // `data` boleh memuat baris virtual (_virtual) untuk karyawan yang belum tercatat.
  async exportPresensiExcelFull(data, periode, { projectName = 'Semua Project' } = {}) {
    const XLSX = await import('xlsx-js-style')
    const rows = urutkanGolongan(data)
    const s = ringkasPresensi(rows)
    const info = [
      `Tanggal: ${periode}  |  Project: ${projectName}`,
      `Total ${s.total} karyawan  |  Selesai: ${s.selesai}  |  Sedang Bekerja: ${s.bekerja}  |  Tidak Hadir: ${s.tidakHadir}  |  Belum Input: ${s.belum}`,
      `Dicetak: ${new Date().toLocaleString('id-ID')}`,
    ]
    const angkaAtauStrip = v => (v > 0 ? v : '-')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `PT Krakatau Indah — Presensi ${periode}`, info,
      emptyText: 'Belum ada data presensi',
      cols: [
        { h: 'No',           w: 5,  fn: (r, i) => i, align: 'center' },
        // NIK 16 digit harus teks, kalau angka Excel memotongnya jadi notasi ilmiah
        { h: 'NIK',          w: 20, fn: r => String(r.karyawan?.nik || r.karyawan?.id_karyawan || '-') },
        { h: 'Nama',         w: 26, fn: r => r.karyawan?.nama_karyawan || '-' },
        { h: 'Golongan',     w: 20, fn: r => r.karyawan?.jabatan?.nama_jabatan || '-' },
        { h: 'Project',      w: 24, fn: r => r.project?.nama_project || '-' },
        { h: 'Jam Masuk',    w: 11, fn: r => r.jam_masuk?.slice(0, 5) || '-', align: 'center' },
        { h: 'Jam Keluar',   w: 11, fn: r => r.jam_keluar?.slice(0, 5) || '-', align: 'center' },
        { h: 'Durasi (jam)', w: 13, fn: r => angkaAtauStrip(parseFloat(r.durasi_jam || 0)), align: 'center' },
        { h: 'Status',       w: 16, fn: r => labelPresensi(r), align: 'center' },
        { h: 'Uang Makan',   w: 16, fn: r => angkaAtauStrip(parseFloat(r.uang_makan || 0)), rp: true, align: 'right' },
        { h: 'Transport',    w: 15, fn: r => angkaAtauStrip(parseFloat(r.uang_transport || 0)), rp: true, align: 'right' },
        { h: 'Luar Kota',    w: 15, fn: r => angkaAtauStrip(parseFloat(r.upah_luar_kota || 0)), rp: true, align: 'right' },
        { h: 'Catatan',      w: 28, fn: r => catatanPresensi(r) },
      ],
      rows, total: { 'Durasi (jam)': 'sum', 'Uang Makan': 'sum', Transport: 'sum', 'Luar Kota': 'sum' },
    }), 'Presensi')

    // Sheet 2: rekap jumlah per golongan
    const perGol = {}
    rows.forEach(r => {
      const g = r.karyawan?.jabatan?.nama_jabatan || 'Tanpa Golongan'
      const x = (perGol[g] ||= { golongan: g, total: 0, selesai: 0, bekerja: 0, tidakHadir: 0, belum: 0 })
      const k = ringkasPresensi([r])
      x.total += k.total; x.selesai += k.selesai; x.bekerja += k.bekerja; x.tidakHadir += k.tidakHadir; x.belum += k.belum
    })
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `Rekap Presensi per Golongan — ${periode}`, info: [`Project: ${projectName}`, info[2]],
      emptyText: 'Belum ada data presensi',
      cols: [
        { h: 'Golongan',       w: 28, fn: r => r.golongan },
        { h: 'Karyawan',       w: 12, fn: r => r.total, align: 'center' },
        { h: 'Selesai',        w: 12, fn: r => r.selesai, align: 'center' },
        { h: 'Sedang Bekerja', w: 16, fn: r => r.bekerja, align: 'center' },
        { h: 'Tidak Hadir',    w: 13, fn: r => r.tidakHadir, align: 'center' },
        { h: 'Belum Input',    w: 13, fn: r => r.belum, align: 'center' },
      ],
      rows: Object.values(perGol).sort((a, b) => a.golongan.localeCompare(b.golongan)),
      total: { Karyawan: 'sum', Selesai: 'sum', 'Sedang Bekerja': 'sum', 'Tidak Hadir': 'sum', 'Belum Input': 'sum' },
    }), 'Rekap Golongan')
    XLSX.writeFile(wb, `presensi-${periode.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.xlsx`)
  },

  // ── GAJI MINGGUAN PDF ────────────────────────────────────────────────────
  async exportGajiMingguanPDF(data, projectName, periode) {
    const rp = v => formatRupiah(v || 0)
    const kolom = 11
    const totalBersih = jumlah(data, r => r.gaji_bersih)
    const rekap = perGolongan(data).map(([g, rs]) => [g, rs.length, jumlah(rs, r => r.total_hari_hadir), rp(jumlah(rs, r => r.total_uang_lembur)), rp(jumlah(rs, r => r.gaji_bersih))])
    await pdfLaporan({
      title: `Laporan Gaji Mingguan — ${projectName}`,
      info: [`Periode: ${periode}`, `Total ${data.length} karyawan   •   Total gaji bersih ${rp(totalBersih)}`],
      label: `Gaji Mingguan ${periode}`,
      filename: `gaji-mingguan-${slug(projectName)}-${tgl()}.pdf`,
      tables: [
        {
          judul: 'Rekap per Golongan',
          head: ['Golongan', 'Karyawan', 'Total Hari', 'Total Lembur', 'Gaji Bersih'],
          body: rekap.length ? rekap : [[{ content: 'Belum ada data', colSpan: 5, styles: { halign: 'center' } }]],
          foot: rekap.length ? ['TOTAL', data.length, jumlah(data, r => r.total_hari_hadir), rp(jumlah(data, r => r.total_uang_lembur)), rp(totalBersih)] : undefined,
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        },
        {
          judul: 'Detail per Karyawan',
          head: ['No', 'NIK', 'Nama', 'Hari', 'Gaji Pokok', 'Makan', 'Transport', 'Lembur', 'Kasbon', 'Bersih', 'Status'],
          body: bodyPerGolongan(data, kolom, (r, no) => [
            no, nikKaryawan(r), r.karyawan?.nama_karyawan || '-', parseInt(r.total_hari_hadir || 0),
            rp(r.total_gaji_pokok), rp(r.total_uang_makan), rp(r.total_uang_transport), rp(r.total_uang_lembur),
            rp(r.total_potongan_kasbon), rp(r.gaji_bersih), kapital(r.status),
          ]),
          foot: data.length ? [
            { content: 'TOTAL', colSpan: 3 }, jumlah(data, r => r.total_hari_hadir),
            rp(jumlah(data, r => r.total_gaji_pokok)), rp(jumlah(data, r => r.total_uang_makan)),
            rp(jumlah(data, r => r.total_uang_transport)), rp(jumlah(data, r => r.total_uang_lembur)),
            rp(jumlah(data, r => r.total_potongan_kasbon)), rp(totalBersih), '',
          ] : undefined,
          fontSize: 7.5,
          columnStyles: {
            0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 30 }, 2: { cellWidth: 34 }, 3: { cellWidth: 11, halign: 'center' },
            4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
            8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' }, 10: { cellWidth: 16, halign: 'center' },
          },
        },
      ],
    })
  },

  // ── GAJI BULANAN PDF ──────────────────────────────────────────────────────
  async exportGajiBulananPDF(data, bulan, tahun) {
    const bulanStr = BULAN_NAMES[parseInt(bulan) - 1] || String(bulan)
    const rp = v => formatRupiah(v || 0)
    const kolom = 7
    const totalBersih = jumlah(data, r => r.total_gaji_bersih)
    const rekap = perGolongan(data).map(([g, rs]) => [g, rs.length, jumlah(rs, r => r.total_hari_hadir), rp(jumlah(rs, r => r.total_gaji_bersih))])
    await pdfLaporan({
      title: `Laporan Gaji Bulanan — ${bulanStr} ${tahun}`,
      info: [`Total ${data.length} karyawan   •   Total gaji bersih ${rp(totalBersih)}`],
      label: `Gaji Bulanan ${bulanStr} ${tahun}`,
      filename: `gaji-bulanan-${bulanStr}-${tahun}-${tgl()}.pdf`,
      tables: [
        {
          judul: 'Rekap per Golongan',
          head: ['Golongan', 'Karyawan', 'Total Hari', 'Gaji Bersih'],
          body: rekap.length ? rekap : [[{ content: 'Belum ada data', colSpan: 4, styles: { halign: 'center' } }]],
          foot: rekap.length ? ['TOTAL', data.length, jumlah(data, r => r.total_hari_hadir), rp(totalBersih)] : undefined,
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' } },
        },
        {
          judul: 'Detail per Karyawan',
          head: ['No', 'NIK', 'Nama', 'Hari', 'Lembur', 'Kasbon', 'Gaji Bersih'],
          body: bodyPerGolongan(data, kolom, (r, no) => [
            no, nikKaryawan(r), r.karyawan?.nama_karyawan || '-', parseInt(r.total_hari_hadir || 0),
            rp(r.total_uang_lembur), rp(r.total_kasbon_potong), rp(r.total_gaji_bersih),
          ]),
          foot: data.length ? [
            { content: 'TOTAL', colSpan: 3 }, jumlah(data, r => r.total_hari_hadir),
            rp(jumlah(data, r => r.total_uang_lembur)), rp(jumlah(data, r => r.total_kasbon_potong)), rp(totalBersih),
          ] : undefined,
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 38 }, 3: { cellWidth: 14, halign: 'center' },
            4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' },
          },
        },
      ],
    })
  },


  // ── PRESENSI PDF ──────────────────────────────────────────────────────────
  // Kop berwarna + info ringkasan, tabel dikelompokkan per golongan, baris TOTAL,
  // status berwarna, dan nomor halaman di setiap halaman.
  async exportPresensiPDF(data, periode, { projectName = 'Semua Project' } = {}) {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })
    const rows = urutkanGolongan(data)
    const s = ringkasPresensi(rows)
    const startY = pdfHeader(doc, {
      title: `Laporan Presensi — ${periode}`,
      info: [
        `Project: ${projectName}`,
        `Total ${s.total} karyawan   •   Selesai ${s.selesai}   •   Sedang Bekerja ${s.bekerja}   •   Tidak Hadir ${s.tidakHadir}   •   Belum Input ${s.belum}`,
      ],
    })

    const kolom = 10
    const body = []
    let prevGol = null, no = 0
    rows.forEach(r => {
      const gol = r.karyawan?.jabatan?.nama_jabatan || 'Tanpa Golongan'
      if (gol !== prevGol) {
        body.push([{ content: gol.toUpperCase(), colSpan: kolom, styles: { fontStyle: 'bold', fillColor: [219, 234, 254], textColor: [30, 58, 138] } }])
        prevGol = gol
      }
      const uang = uangHarianPresensi(r)
      body.push([
        ++no,
        String(r.karyawan?.nik || r.karyawan?.id_karyawan || '-'),
        r.karyawan?.nama_karyawan || '-',
        r.project?.nama_project || '-',
        r.jam_masuk?.slice(0, 5) || '-',
        r.jam_keluar?.slice(0, 5) || '-',
        parseFloat(r.durasi_jam) > 0 ? `${parseFloat(r.durasi_jam)} jam` : '-',
        uang > 0 ? formatRupiah(uang) : '-',
        labelPresensi(r),
        catatanPresensi(r),
      ])
    })
    if (!rows.length) body.push([{ content: 'Belum ada data presensi', colSpan: kolom, styles: { halign: 'center', textColor: [100, 116, 139] } }])

    const totalDurasi = rows.reduce((t, r) => t + (parseFloat(r.durasi_jam) || 0), 0)
    const totalUang = rows.reduce((t, r) => t + uangHarianPresensi(r), 0)
    const warnaStatus = {
      'Selesai': [6, 95, 70], 'Sedang Bekerja': [29, 78, 216],
      'Belum Input': [180, 83, 9], 'Tidak Hadir': [185, 28, 28],
    }
    autoTable(doc, {
      startY,
      head: [['No', 'NIK', 'Nama', 'Project', 'Masuk', 'Keluar', 'Durasi', 'Uang Harian', 'Status', 'Catatan']],
      body,
      foot: rows.length ? [[
        { content: `TOTAL  (${s.total} karyawan)`, colSpan: 6 },
        `${Math.round(totalDurasi * 10) / 10} jam`, formatRupiah(totalUang), '', '',
      ]] : undefined,
      showFoot: 'lastPage',
      styles: { fontSize: 8, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.1, valign: 'middle' },
      headStyles: { fillColor: PDF_BLUE, textColor: 255, fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [254, 243, 199], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 249, 255] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 36 },
        2: { cellWidth: 46 },
        3: { cellWidth: 40 },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 18, halign: 'center' },
        7: { cellWidth: 28, halign: 'right' },
        8: { cellWidth: 28, halign: 'center' },
      },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 8 && warnaStatus[d.cell.raw]) {
          d.cell.styles.textColor = warnaStatus[d.cell.raw]
          d.cell.styles.fontStyle = 'bold'
        }
        if (d.section === 'foot' && (d.column.index === 6 || d.column.index === 7)) d.cell.styles.halign = d.column.index === 7 ? 'right' : 'center'
      },
      margin: { top: 16, left: 14, right: 14, bottom: 16 },
    })
    pdfFooter(doc, `Laporan Presensi ${periode}`)
    doc.save(`presensi-${periode.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.pdf`)
  },

  // ── LEMBUR PDF ────────────────────────────────────────────────────────────
  async exportLemburPDF(data, projectName) {
    const kolom = 9
    const bayar = data.filter(r => !dalamGaji(r))
    const totalDurasi = Math.round(jumlah(data, r => r.durasi_jam) * 10) / 10
    const totalUpah = jumlah(bayar, r => r.total_lembur)
    const warnaStatus = { Disetujui: [6, 95, 70], Pending: [180, 83, 9], Ditolak: [185, 28, 28] }
    await pdfLaporan({
      title: `Laporan Lembur — ${projectName}`,
      color: [6, 95, 70], stripe: [236, 253, 245],
      info: [`Total ${data.length} data   •   Total durasi ${totalDurasi} jam   •   Total upah lembur ${formatRupiah(totalUpah)}`],
      label: `Laporan Lembur ${projectName}`,
      filename: `lembur-${slug(projectName)}-${tgl()}.pdf`,
      tables: [{
        head: ['No', 'Nama', 'Tanggal', 'Mulai', 'Selesai', 'Durasi', 'Total Lembur', 'Status', 'Sumber'],
        body: bodyPerGolongan(data, kolom, (r, no) => [
          no, r.karyawan?.nama_karyawan || '-', formatTanggal(r.tanggal),
          r.jam_mulai?.slice(0, 5) || '-', r.jam_selesai?.slice(0, 5) || '-',
          `${parseFloat(r.durasi_jam) || 0} jam`,
          dalamGaji(r) ? '(dalam gaji)' : formatRupiah(r.total_lembur || 0),
          kapital(r.status_persetujuan), sumberLembur(r),
        ], GAYA_GOL_HIJAU),
        foot: data.length ? [{ content: `TOTAL  (${data.length} data)`, colSpan: 5 }, `${totalDurasi} jam`, formatRupiah(totalUpah), '', ''] : undefined,
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 54 }, 2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 22, halign: 'center' },
          6: { cellWidth: 36, halign: 'right' }, 7: { cellWidth: 26, halign: 'center' }, 8: { halign: 'center' },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 7 && warnaStatus[d.cell.raw]) {
            d.cell.styles.textColor = warnaStatus[d.cell.raw]; d.cell.styles.fontStyle = 'bold'
          }
          if (d.section === 'foot' && d.column.index >= 5) d.cell.styles.halign = d.column.index === 6 ? 'right' : 'center'
        },
      }],
    })
  },

  // ── KASBON PDF ────────────────────────────────────────────────────────────
  async exportKasbonPDF(data) {
    const rows = urutkanGolongan(data)
    const outstanding = rows.filter(r => !r.status_lunas)
    const totalJumlah = jumlah(rows, r => r.jumlah_kasbon)
    const totalSisa = jumlah(rows, r => r.sisa_kasbon)
    const warnaStatus = { Lunas: [6, 95, 70], Outstanding: [185, 28, 28] }
    await pdfLaporan({
      title: 'Laporan Data Kasbon Karyawan',
      info: [`Total ${rows.length} kasbon   •   Lunas ${rows.length - outstanding.length}   •   Outstanding ${outstanding.length}   •   Sisa yang belum lunas ${formatRupiah(jumlah(outstanding, r => r.sisa_kasbon))}`],
      label: 'Laporan Kasbon',
      filename: `kasbon-${tgl()}.pdf`,
      tables: [{
        head: ['No', 'NIK', 'Nama', 'Golongan', 'Project', 'Tanggal', 'Jumlah', 'Sisa', 'Status'],
        body: rows.length ? rows.map((r, i) => [
          i + 1, nikKaryawan(r), r.karyawan?.nama_karyawan || '-', r.karyawan?.jabatan?.nama_jabatan || '-',
          r.project?.nama_project || '-', formatTanggal(r.tanggal_kasbon),
          formatRupiah(r.jumlah_kasbon || 0), formatRupiah(r.sisa_kasbon || 0), r.status_lunas ? 'Lunas' : 'Outstanding',
        ]) : [[{ content: 'Belum ada data kasbon', colSpan: 9, styles: { halign: 'center', textColor: [100, 116, 139] } }]],
        foot: rows.length ? [{ content: `TOTAL  (${rows.length} kasbon)`, colSpan: 6 }, formatRupiah(totalJumlah), formatRupiah(totalSisa), ''] : undefined,
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 36 }, 2: { cellWidth: 44 }, 3: { cellWidth: 30 },
          4: { cellWidth: 38 }, 5: { cellWidth: 24, halign: 'center' }, 6: { cellWidth: 28, halign: 'right' },
          7: { cellWidth: 28, halign: 'right' }, 8: { cellWidth: 24, halign: 'center' },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 8 && warnaStatus[d.cell.raw]) {
            d.cell.styles.textColor = warnaStatus[d.cell.raw]; d.cell.styles.fontStyle = 'bold'
          }
          if (d.section === 'foot' && d.column.index >= 6) d.cell.styles.halign = d.column.index === 8 ? 'center' : 'right'
        },
      }],
    })
  },


  // ── SLIP GAJI (PAYSLIP) PER KARYAWAN ────────────────────────────────────────
  // Karyawan bisa kerja fleksibel di beberapa proyek dalam 1 periode gaji —
  // project_details (dari payrollService._hitungGajiKaryawan) merinci hari &
  // gaji per proyek, jadi slip tetap akurat walau tidak menetap di 1 proyek.
  async exportSlipGajiPDF(rekap) {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' })
    const k = rekap.karyawan || {}
    const pageW = doc.internal.pageSize.getWidth()

    doc.setFontSize(15); doc.setFont('helvetica', 'bold')
    doc.text('PT KRAKATAU INDAH', 14, 16)
    doc.setFontSize(11); doc.setFont('helvetica', 'normal')
    doc.text('SLIP GAJI KARYAWAN', 14, 23)
    doc.setDrawColor(29, 78, 216); doc.setLineWidth(0.6)
    doc.line(14, 27, pageW - 14, 27)

    // Info karyawan & periode
    doc.setFontSize(9)
    let y = 35
    const rowInfo = (label, value, x, lx) => {
      doc.setFont('helvetica', 'bold'); doc.text(label, x, y)
      doc.setFont('helvetica', 'normal'); doc.text(`: ${value}`, x + lx, y)
    }
    rowInfo('Nama', k.nama_karyawan || '-', 14, 24)
    rowInfo('Periode', `${formatTanggal(rekap.periode_mulai)} – ${formatTanggal(rekap.periode_selesai)}`, pageW / 2, 22)
    y += 6
    rowInfo('ID / NIK', k.id_karyawan || k.nik || '-', 14, 24)
    rowInfo('Status', (rekap.status || '-').toUpperCase(), pageW / 2, 22)
    y += 6
    rowInfo('Jabatan', k.jabatan?.nama_jabatan || '-', 14, 24)
    rowInfo('Tgl Bayar', rekap.tanggal_pembayaran ? formatTanggal(rekap.tanggal_pembayaran) : '-', pageW / 2, 22)

    let startY = y + 10

    // Rincian per proyek — karyawan bisa kerja di lebih dari 1 proyek per periode
    const projects = Object.values(rekap.project_details || {}).filter(p => p && p.nama && p.nama !== '-')
    if (projects.length > 0) {
      autoTable(doc, {
        startY,
        head: [['Proyek', 'Kode', 'Hari Kerja', 'Gaji Pokok']],
        body: projects.map(p => [p.nama, p.kode || '-', `${p.hari || 0} hari`, formatRupiah(p.gaji || 0)]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      })
      startY = doc.lastAutoTable.finalY + 6
    }

    // Pendapatan
    const luarKota = parseFloat(rekap.total_upah_luar_kota ?? rekap.project_details?._upah_luar_kota ?? 0)
    const earn = [
      ['Hari Hadir', `${rekap.total_hari_hadir || 0} hari`],
      ['Gaji Pokok', formatRupiah(rekap.total_gaji_pokok || 0)],
      ['Uang Makan', formatRupiah(rekap.total_uang_makan || 0)],
      ['Uang Transport', formatRupiah(rekap.total_uang_transport || 0)],
      ['Uang Lembur', formatRupiah(rekap.total_uang_lembur || 0)],
    ]
    if (luarKota > 0) earn.push(['Upah Luar Kota', formatRupiah(luarKota)])
    earn.push(['GAJI KOTOR', formatRupiah(rekap.gaji_kotor || 0)])

    autoTable(doc, {
      startY,
      head: [['Komponen Pendapatan', 'Jumlah']],
      body: earn,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index === earn.length - 1)
          d.cell.styles = { fontStyle: 'bold', fillColor: [219, 234, 254] }
      },
      margin: { left: 14, right: 14 },
    })
    startY = doc.lastAutoTable.finalY + 5

    // Potongan
    const deduct = []
    if (parseFloat(rekap.total_potongan_kasbon || 0) > 0) deduct.push(['Potongan Kasbon', `- ${formatRupiah(rekap.total_potongan_kasbon)}`])
    if (parseFloat(rekap.potongan_lainnya || 0) > 0) deduct.push(['Potongan Lainnya', `- ${formatRupiah(rekap.potongan_lainnya)}`])
    if (deduct.length > 0) {
      autoTable(doc, {
        startY,
        head: [['Potongan', 'Jumlah']],
        body: deduct,
        styles: { fontSize: 9, cellPadding: 2.5, textColor: [185, 28, 28] },
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      })
      startY = doc.lastAutoTable.finalY + 5
    }

    // Gaji bersih
    doc.setFillColor(29, 78, 216)
    doc.rect(14, startY, pageW - 28, 12, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('GAJI BERSIH', 18, startY + 8)
    doc.text(formatRupiah(rekap.gaji_bersih || 0), pageW - 18, startY + 8, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    startY += 18

    if (rekap.status === 'dibayar' && rekap.tanggal_pembayaran) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal')
      doc.text(`Dibayar ${formatTanggal(rekap.tanggal_pembayaran)} via ${rekap.metode_pembayaran || '-'}`, 14, startY)
      startY += 8
    }

    // Tanda tangan
    startY += 10
    const half = (pageW - 28) / 2
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Mengetahui,', 14, startY)
    doc.text('Diterima oleh,', 14 + half, startY)
    startY += 22
    doc.line(14, startY, 14 + half - 10, startY)
    doc.line(14 + half, startY, pageW - 14, startY)
    doc.setFontSize(8)
    doc.text('Admin / Mandor', 14, startY + 5)
    doc.text(k.nama_karyawan || '-', 14 + half, startY + 5)

    doc.setFontSize(7); doc.setTextColor(150)
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, doc.internal.pageSize.getHeight() - 10)

    doc.save(`slip-gaji-${(k.nama_karyawan || 'karyawan').replace(/\s+/g, '-')}-${rekap.periode_mulai}.pdf`)
  },

  // ── KASBON Excel ─────────────────────────────────────────────────────────
  async exportKasbonExcel(data) {
    const XLSX = await import('xlsx-js-style')
    const rows = urutkanGolongan(data)
    const outstanding = rows.filter(r => !r.status_lunas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: 'PT Krakatau Indah — Data Kasbon Karyawan', color: 'B45309', emptyText: 'Belum ada data kasbon',
      info: [
        `Total ${rows.length} kasbon  |  Lunas: ${rows.length - outstanding.length}  |  Outstanding: ${outstanding.length}  |  Sisa belum lunas: ${formatRupiah(jumlah(outstanding, r => r.sisa_kasbon))}`,
        dicetakInfo(),
      ],
      cols: [
        { h: 'No',       w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'NIK',      w: 20, fn: r => nikKaryawan(r) },
        { h: 'Nama',     w: 26, fn: r => r.karyawan?.nama_karyawan || '-' },
        { h: 'Golongan', w: 20, fn: r => r.karyawan?.jabatan?.nama_jabatan || '-' },
        { h: 'Project',  w: 24, fn: r => r.project?.nama_project || '-' },
        { h: 'Tanggal',  w: 14, fn: r => formatTanggal(r.tanggal_kasbon) },
        { h: 'Jumlah',   w: 18, fn: r => parseFloat(r.jumlah_kasbon || 0), rp: true },
        { h: 'Sisa',     w: 18, fn: r => parseFloat(r.sisa_kasbon || 0), rp: true },
        { h: 'Status',   w: 14, fn: r => (r.status_lunas ? 'Lunas' : 'Outstanding'), align: 'center' },
        { h: 'Catatan',  w: 28, fn: r => r.catatan || '' },
      ],
      rows, total: { Jumlah: 'sum', Sisa: 'sum' },
    }), 'Kasbon')
    XLSX.writeFile(wb, `kasbon-${tgl()}.xlsx`)
  },


  // ── STOK MASUK Excel ──────────────────────────────────────────────────────
  async exportStokMasukExcel(data, projectName) {
    const XLSX = await import('xlsx')
    const cols = [
      { h: 'No',            w: 5,  fn: (r, i) => i },
      { h: 'Tanggal',       w: 14, fn: r => formatTanggal(r.created_at) },
      { h: 'Kode Barang',   w: 14, fn: r => r.barang?.kode_barang || '-' },
      { h: 'Nama Barang',   w: 26, fn: r => r.barang?.nama_barang || '-' },
      { h: 'Jumlah',        w: 10, fn: r => parseFloat(r.jumlah || 0) },
      { h: 'Satuan',        w: 10, fn: r => r.barang?.satuan_barang?.singkatan || '-' },
      { h: 'Harga Satuan',  w: 16, fn: r => parseFloat(r.harga_satuan || 0), rp: true },
      { h: 'Total Harga',   w: 18, fn: r => parseFloat(r.total_harga || 0), rp: true },
      { h: 'Sumber',        w: 20, fn: r => r.sumber || '-' },
      { h: 'No. Referensi', w: 16, fn: r => r.nomor_referensi || '-' },
      { h: 'Bon',           w: 16, fn: r => r.bon_subkon || '-' },
      { h: 'No. Polisi',    w: 14, fn: r => r.nomor_polisi || '-' },
      { h: 'Supir',         w: 18, fn: r => r.nama_supir || '-' },
      { h: 'No. Surat',     w: 16, fn: r => r.nomor_surat || '-' },
      { h: 'Catatan',       w: 24, fn: r => r.catatan || '-' },
    ]
    const wsData = [
      ['PT Krakatau Indah — Stok Masuk'],
      [`Project: ${projectName || '-'}`],
      [`Dicetak: ${new Date().toLocaleString('id-ID')}`],
      [],
      cols.map(c => c.h),
      ...data.map((r, i) => cols.map(c => c.fn(r, i + 1))),
    ]
    const totRow = cols.map((c, ci) => {
      if (ci === 0) return 'TOTAL'
      if (c.h === 'Total Harga') return data.reduce((s, r) => s + parseFloat(r.total_harga || 0), 0)
      return ''
    })
    wsData.push(totRow)

    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = cols.map(c => ({ wch: c.w }))
    const hdrIdx = 4
    cols.forEach((col, c) => {
      const a = encode(hdrIdx, c)
      if (!ws[a]) ws[a] = { v: col.h }
      ws[a].s = hdrStyle()
    })
    for (let row = hdrIdx + 1; row < wsData.length; row++) {
      const isTot = wsData[row][0] === 'TOTAL'
      cols.forEach((col, c) => {
        const a = encode(row, c)
        if (!ws[a]) return
        if (isTot) { ws[a].s = totStyle(); if (col.rp) ws[a].z = RUPIAH_FMT }
        else { ws[a].s = rowStyle((row - hdrIdx) % 2 === 0); if (col.rp) ws[a].z = RUPIAH_FMT }
      })
    }
    ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:cols.length-1} }]
    if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 13 }, fill: { fgColor: { rgb: 'EFF6FF' } } }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stok Masuk')
    XLSX.writeFile(wb, `stok-masuk-${(projectName || 'project').replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.xlsx`)
  },

  // ── HISTORY BARANG: KARTU STOK (per barang) Excel ───────────────────────
  // Sheet: Kartu Stok bulanan, Riwayat Masuk, Riwayat Keluar
  async exportKartuStokExcel(rows, barang, tahun, { masuk = [], keluar = [], projectName } = {}) {
    const XLSX = await import('xlsx-js-style')
    const sat = barang?.satuan_barang?.singkatan || ''
    const info = [
      `Project: ${projectName || '-'}`,
      `Barang: ${barang?.nama_barang || '-'}  |  Kode: ${barang?.kode_barang || '-'}  |  Kategori: ${barang?.kategori_barang?.nama_kategori || '-'}`,
      `Stok saat ini: ${barang?.stok_saat_ini ?? 0} ${sat}  |  Stok minimal: ${barang?.stok_minimal ?? 0} ${sat}`,
      `Dicetak: ${new Date().toLocaleString('id-ID')}`,
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `PT Krakatau Indah — Kartu Stok ${tahun}`, info,
      cols: [
        { h: 'Bulan',      w: 16, fn: r => `${r.bulanLabel} ${tahun}` },
        { h: 'Stok Awal',  w: 13, fn: r => parseFloat(r.stokAwal || 0) },
        { h: 'Masuk',      w: 12, fn: r => parseFloat(r.masuk || 0) },
        { h: 'Keluar',     w: 12, fn: r => parseFloat(r.keluar || 0) },
        { h: 'Stok Akhir', w: 13, fn: r => parseFloat(r.stokAkhir || 0) },
        { h: 'Satuan',     w: 10, fn: () => sat, align: 'center' },
      ],
      rows, total: { Masuk: 'sum', Keluar: 'sum' },
    }), 'Kartu Stok')
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `Riwayat Stok Masuk ${tahun} — ${barang?.nama_barang || '-'}`, info: [`Dicetak: ${new Date().toLocaleString('id-ID')}`],
      color: '047857', emptyText: 'Belum ada stok masuk di tahun ini',
      cols: [
        { h: 'No',                w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'Tanggal',           w: 14, fn: r => formatTanggal(r.created_at) },
        { h: 'Jumlah',            w: 10, fn: r => parseFloat(r.jumlah || 0) },
        { h: 'Satuan',            w: 9,  fn: () => sat, align: 'center' },
        { h: 'Harga Satuan',      w: 16, fn: r => parseFloat(r.harga_satuan || 0), rp: true },
        { h: 'Total Harga',       w: 18, fn: r => parseFloat(r.total_harga || 0), rp: true },
        { h: 'Supplier / Sumber', w: 24, fn: r => r.sumber || '-' },
        { h: 'No. Referensi',     w: 18, fn: r => r.nomor_referensi || '-' },
        { h: 'Catatan',           w: 30, fn: r => r.catatan || '-' },
      ],
      rows: masuk, total: { Jumlah: 'sum', 'Total Harga': 'sum' },
    }), 'Riwayat Masuk')
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `Riwayat Stok Keluar ${tahun} — ${barang?.nama_barang || '-'}`, info: [`Dicetak: ${new Date().toLocaleString('id-ID')}`],
      color: 'B91C1C', emptyText: 'Belum ada stok keluar di tahun ini',
      cols: [
        { h: 'No',            w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'Tanggal',       w: 14, fn: r => formatTanggal(r.created_at) },
        { h: 'Jumlah',        w: 10, fn: r => parseFloat(r.jumlah || 0) },
        { h: 'Satuan',        w: 9,  fn: () => sat, align: 'center' },
        { h: 'Tujuan',        w: 26, fn: r => r.tujuan || '-' },
        { h: 'No. Referensi', w: 18, fn: r => r.nomor_referensi || '-' },
        { h: 'Catatan',       w: 30, fn: r => r.catatan || '-' },
      ],
      rows: keluar, total: { Jumlah: 'sum' },
    }), 'Riwayat Keluar')
    XLSX.writeFile(wb, `history-barang-${barang?.kode_barang || 'barang'}-${tahun}.xlsx`)
  },

  // ── HISTORY BARANG: REKAP KESELURUHAN Excel ─────────────────────────────
  // Sheet: Rekap Bulanan, Daftar Barang (stok & status)
  async exportLaporanBarangBulananExcel(rows, projectName, tahun, { barang = [] } = {}) {
    const XLSX = await import('xlsx-js-style')
    const dicetak = `Dicetak: ${new Date().toLocaleString('id-ID')}`
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `PT Krakatau Indah — History Barang ${tahun}`, info: [`Project: ${projectName || '-'}`, dicetak],
      cols: [
        { h: 'Bulan',            w: 16, fn: r => `${r.bulan} ${tahun}` },
        { h: 'Transaksi Masuk',  w: 16, fn: r => parseInt(r.trxMasuk || 0) },
        { h: 'Qty Masuk',        w: 13, fn: r => parseFloat(r.qtyMasuk || 0) },
        { h: 'Transaksi Keluar', w: 16, fn: r => parseInt(r.trxKeluar || 0) },
        { h: 'Qty Keluar',       w: 13, fn: r => parseFloat(r.qtyKeluar || 0) },
      ],
      rows, total: { 'Transaksi Masuk': 'sum', 'Qty Masuk': 'sum', 'Transaksi Keluar': 'sum', 'Qty Keluar': 'sum' },
    }), 'Rekap Bulanan')
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `Daftar Barang — ${projectName || '-'}`, info: [dicetak],
      cols: [
        { h: 'No',           w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'Kode',         w: 12, fn: r => r.kode_barang || '-' },
        { h: 'Nama Barang',  w: 28, fn: r => r.nama_barang || '-' },
        { h: 'Kategori',     w: 18, fn: r => r.kategori_barang?.nama_kategori || '-' },
        { h: 'Stok',         w: 10, fn: r => parseFloat(r.stok_saat_ini || 0) },
        { h: 'Stok Minimal', w: 12, fn: r => parseFloat(r.stok_minimal || 0) },
        { h: 'Satuan',       w: 9,  fn: r => r.satuan_barang?.singkatan || '-', align: 'center' },
        { h: 'Status',       w: 10, fn: r => (r.stok_saat_ini <= r.stok_minimal ? 'KRITIS' : 'Normal'), align: 'center' },
      ],
      rows: barang,
    }), 'Daftar Barang')
    XLSX.writeFile(wb, `history-barang-${(projectName || 'project').replace(/\s+/g,'-')}-${tahun}.xlsx`)
  },

  // ── HISTORY UANG Excel ──────────────────────────────────────────────────
  // Keseluruhan: Rekap Bulanan (+ dibelikan untuk), Rincian Pembelian, Nilai Stok
  // Per barang : Rekap Bulanan barang, Riwayat Pembelian
  async exportLaporanUangExcel({ projectName, tahun, rekap, rincian = [], nilaiStok = [], barang = null }) {
    const XLSX = await import('xlsx-js-style')
    const dicetak = `Dicetak: ${new Date().toLocaleString('id-ID')}`
    const color = 'B45309'
    const wb = XLSX.utils.book_new()
    const rincianCols = [
      { h: 'No',                w: 5,  fn: (r, i) => i, align: 'center' },
      { h: 'Tanggal',           w: 14, fn: r => formatTanggal(r.created_at) },
      { h: 'Kode',              w: 12, fn: r => r.barang?.kode_barang || barang?.kode_barang || '-' },
      { h: 'Nama Barang',       w: 26, fn: r => r.barang?.nama_barang || barang?.nama_barang || '-' },
      { h: 'Jumlah',            w: 10, fn: r => parseFloat(r.jumlah || 0) },
      { h: 'Satuan',            w: 9,  fn: r => r.barang?.satuan_barang?.singkatan || barang?.satuan_barang?.singkatan || '-', align: 'center' },
      { h: 'Harga Satuan',      w: 16, fn: r => parseFloat(r.harga_satuan || 0), rp: true },
      { h: 'Total Harga',       w: 18, fn: r => parseFloat(r.total_harga || 0), rp: true },
      { h: 'Supplier / Sumber', w: 24, fn: r => r.sumber || '-' },
      { h: 'No. Referensi',     w: 18, fn: r => r.nomor_referensi || '-' },
      { h: 'Catatan',           w: 30, fn: r => r.catatan || '-' },
    ]

    if (barang) {
      const sat = barang.satuan_barang?.singkatan || ''
      XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
        title: `PT Krakatau Indah — History Uang ${tahun}`, color,
        info: [`Project: ${projectName || '-'}`, `Barang: ${barang.nama_barang}  |  Kode: ${barang.kode_barang || '-'}`, dicetak],
        cols: [
          { h: 'Bulan',           w: 16, fn: r => r.bulanLabel },
          { h: 'Qty Dibeli',      w: 12, fn: r => parseFloat(r.qty || 0) },
          { h: 'Satuan',          w: 9,  fn: () => sat, align: 'center' },
          { h: 'Nilai Dibeli',    w: 18, fn: r => Math.round(r.nilai || 0), rp: true },
          { h: 'Harga Rata-rata', w: 18, fn: r => Math.round(r.hargaRata || 0), rp: true },
        ],
        rows: rekap, total: { 'Qty Dibeli': 'sum', 'Nilai Dibeli': 'sum' },
      }), 'Rekap Bulanan')
      XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
        title: `Riwayat Pembelian ${tahun} — ${barang.nama_barang}`, color, info: [dicetak],
        emptyText: 'Belum ada pembelian di tahun ini',
        cols: rincianCols, rows: rincian, total: { Jumlah: 'sum', 'Total Harga': 'sum' },
      }), 'Riwayat Pembelian')
      XLSX.writeFile(wb, `history-uang-${barang.kode_barang || 'barang'}-${tahun}.xlsx`)
      return
    }

    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `PT Krakatau Indah — History Uang ${tahun}`, color, info: [`Project: ${projectName || '-'}`, dicetak],
      cols: [
        { h: 'Bulan',               w: 14, fn: r => r.bulanLabel },
        { h: 'Jumlah Transaksi',    w: 12, fn: r => r.trx },
        { h: 'Nilai Pembelian',     w: 18, fn: r => Math.round(r.nilai || 0), rp: true },
        { h: 'Rata-rata/Transaksi', w: 18, fn: r => Math.round(r.rataRata || 0), rp: true },
        { h: 'Dibelikan Untuk',     w: 60, fn: r => r.barangDibeli.length
            ? r.barangDibeli.map(b => `• ${b.nama}: ${b.qty} ${b.satuan} = ${formatRupiah(b.nilai)}`).join('\n') : '-' },
      ],
      rows: rekap, total: { 'Jumlah Transaksi': 'sum', 'Nilai Pembelian': 'sum' },
    }), 'Rekap Bulanan')
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: `Rincian Pembelian ${tahun}`, color, info: [`Project: ${projectName || '-'}`, dicetak],
      emptyText: 'Belum ada pembelian di tahun ini',
      cols: rincianCols, rows: rincian, total: { 'Total Harga': 'sum' },
    }), 'Rincian Pembelian')
    XLSX.utils.book_append_sheet(wb, buildReportSheet(XLSX, {
      title: 'Nilai Stok per Barang (saat ini)', color: '6D28D9', info: [`Project: ${projectName || '-'}`, dicetak],
      cols: [
        { h: 'No',          w: 5,  fn: (r, i) => i, align: 'center' },
        { h: 'Kode',        w: 12, fn: r => r.kode_barang || '-' },
        { h: 'Nama Barang', w: 28, fn: r => r.nama_barang || '-' },
        { h: 'Stok',        w: 10, fn: r => parseFloat(r.stok_saat_ini || 0) },
        { h: 'Satuan',      w: 9,  fn: r => r.satuan_barang?.singkatan || '-', align: 'center' },
        { h: 'Harga Beli',  w: 16, fn: r => parseFloat(r.harga_beli || 0), rp: true },
        { h: 'Nilai Stok',  w: 18, fn: r => Math.round(r.nilai_stok || 0), rp: true },
      ],
      rows: nilaiStok, total: { 'Nilai Stok': 'sum' },
    }), 'Nilai Stok')
    XLSX.writeFile(wb, `history-uang-${(projectName || 'project').replace(/\s+/g,'-')}-${tahun}.xlsx`)
  },
}
