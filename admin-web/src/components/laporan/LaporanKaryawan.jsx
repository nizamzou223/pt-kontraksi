import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Download, User, AlertTriangle, CheckCircle, XCircle, Clock, CreditCard, DollarSign, Printer } from 'lucide-react'
import { Card, Button, Select, PageHeader, AlertInPage, Input, DropdownSelect } from '../common'
import { payrollService } from '../../services/payrollService'
import { exportService } from '../../services/exportService'
import { projectService } from '../../services/projectService'
import { formatRupiah, formatTanggal } from '../../utils/formatters'
import { today } from '../../utils/autoFill'

// Hitung semua hari kerja (Senin-Sabtu) — gunakan local date bukan toISOString()
function getHariKerja(start, end) {
  const days = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const d = new Date(sy, sm - 1, sd)
  const endD = new Date(ey, em - 1, ed)
  while (d <= endD) {
    if (d.getDay() !== 0) { // bukan Minggu
      const pad = n => String(n).padStart(2, '0')
      days.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`)
    }
    d.setDate(d.getDate() + 1)
  }
  return days
}

export default function LaporanKaryawan() {
  const [karyawan, setKaryawan] = useState([])
  const [selectedKaryawan, setSelectedKaryawan] = useState('')
  const [laporan, setLaporan] = useState(null)
  const [loading, setLoading] = useState(false)
  const now = new Date()
  const [periodeStart, setPeriodeStart] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  )
  const [periodeEnd, setPeriodeEnd] = useState(today())

  useEffect(() => {
    projectService.getKaryawan({ status_aktif: true }).then(setKaryawan).catch(e => toast.error(e.message))
  }, [])

  const loadLaporan = async () => {
    if (!selectedKaryawan) return toast.error('Pilih karyawan terlebih dahulu')
    setLoading(true)
    try {
      const data = await payrollService.getLaporanPerKaryawan(parseInt(selectedKaryawan), periodeStart, periodeEnd)
      setLaporan(data)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  const karyawanDipilih = karyawan.find(k => k.id === parseInt(selectedKaryawan))

  // Daftar lengkap semua hari kerja + merge dengan data presensi
  const buildFullPresensiList = () => {
    if (!laporan) return []
    const hariKerja = getHariKerja(periodeStart, periodeEnd)
    const presensiMap = {}
    for (const p of laporan.presensi) presensiMap[p.tanggal] = p
    return hariKerja.map(tgl => presensiMap[tgl]
      ? { tanggal: tgl, ...presensiMap[tgl], fromDB: true }
      : { tanggal: tgl, status_kehadiran: 'tidak_hadir', catatan: null, fromDB: false }
    )
  }

  const fullList = buildFullPresensiList()
  const totalHadirFull    = fullList.filter(r => r.status_kehadiran === 'hadir').length
  const totalSedangBekerjaFull = fullList.filter(r => r.status_kehadiran === 'belum_lengkap' && r.jam_masuk).length
  const totalTidakHadirFull = fullList.length - totalHadirFull - totalSedangBekerjaFull
  const pct = fullList.length > 0 ? Math.round(((totalHadirFull + totalSedangBekerjaFull) / fullList.length) * 100) : 0
  const pctColor = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-500'
  const pctText  = pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-amber-500' : 'text-red-600'

  const handleCetakSlip = (r) => {
    exportService.exportSlipGajiPDF({ ...r, karyawan: karyawanDipilih })
  }

  const handleExportCSV = () => {
    if (!fullList.length) return
    const rows = fullList.map(p => ({
      Tanggal: formatTanggal(p.tanggal),
      'Hari': new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long' }),
      Status: p.status_kehadiran === 'hadir' ? 'Hadir'
        : (p.status_kehadiran === 'belum_lengkap' && p.jam_masuk) ? 'Sedang Bekerja' : 'Tidak Hadir',
      'Jam Masuk': p.jam_masuk?.slice(0,5) || '',
      'Jam Keluar': p.jam_keluar?.slice(0,5) || '',
      Keterangan: !p.fromDB ? 'Tidak ada catatan' : (p.catatan || ''),
    }))
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `presensi_${karyawanDipilih?.nama_karyawan?.replace(/ /g, '_')}_${periodeStart}.csv`
    a.click()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Laporan per Karyawan" subtitle="Riwayat presensi, lembur, kasbon, dan rekap gaji per individu" />

      {/* Filter */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Karyawan</label>
            <DropdownSelect
              value={selectedKaryawan}
              onChange={v => { setSelectedKaryawan(v); setLaporan(null) }}
              options={[
                { value: '', label: 'Pilih karyawan...' },
                ...karyawan.map(k => ({ value: String(k.id), label: `${k.nama_karyawan} — ${k.jabatan?.nama_jabatan}` })),
              ]}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Dari</label>
            <Input type="date" value={periodeStart} onChange={e => setPeriodeStart(e.target.value)} className="w-auto" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Sampai</label>
            <Input type="date" value={periodeEnd} onChange={e => setPeriodeEnd(e.target.value)} className="w-auto" />
          </div>
          <Button onClick={loadLaporan} loading={loading} icon={User}>Tampilkan</Button>
        </div>
      </Card>

      {laporan && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><CheckCircle size={14} className="text-green-600" /><p className="text-xs font-bold text-green-600 uppercase">Hadir</p></div>
              <p className="text-3xl font-extrabold text-green-700">{totalHadirFull}</p>
              <p className="text-xs text-green-500 mt-0.5">dari {fullList.length} hari kerja</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><Clock size={14} className="text-blue-600" /><p className="text-xs font-bold text-blue-600 uppercase">Sedang Bekerja</p></div>
              <p className="text-3xl font-extrabold text-blue-700">{totalSedangBekerjaFull}</p>
              <p className="text-xs text-blue-500 mt-0.5">belum absen pulang</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><XCircle size={14} className="text-red-500" /><p className="text-xs font-bold text-red-500 uppercase">Tidak Hadir</p></div>
              <p className="text-3xl font-extrabold text-red-600">{totalTidakHadirFull}</p>
              {laporan.summary.tidakTercatat > 0 && <p className="text-xs text-red-400 mt-0.5">+{laporan.summary.tidakTercatat} tanpa catatan</p>}
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><CreditCard size={14} className="text-amber-600" /><p className="text-xs font-bold text-amber-600 uppercase">Total Kasbon</p></div>
              <p className="text-xl font-extrabold text-amber-700">{formatRupiah(laporan.summary.totalKasbon)}</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign size={14} className="text-blue-600" /><p className="text-xs font-bold text-blue-600 uppercase">Gaji Dibayar</p></div>
              <p className="text-xl font-extrabold text-blue-700">{formatRupiah(laporan.summary.totalGaji)}</p>
            </div>
          </div>

          {/* Progress kehadiran */}
          <Card title="Tingkat Kehadiran">
            <div className="flex justify-between items-center mb-3">
              <div>
                <p className="font-bold text-gray-800">{karyawanDipilih?.nama_karyawan}</p>
                <p className="text-xs text-gray-400">{karyawanDipilih?.jabatan?.nama_jabatan}</p>
              </div>
              <span className={`text-3xl font-extrabold ${pctText}`}>{pct}%</span>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ease-out ${pctColor}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-2">
              <span className="text-green-600 font-semibold">✓ {totalHadirFull} hari hadir</span>
              {totalSedangBekerjaFull > 0 && <span className="text-blue-600 font-semibold">● {totalSedangBekerjaFull} sedang bekerja</span>}
              <span className="text-red-500 font-semibold">✗ {totalTidakHadirFull} tidak hadir</span>
              <span>{fullList.length} hari kerja total</span>
            </div>
          </Card>

          {/* Detail Presensi */}
          <Card
            title={`Detail Presensi (${fullList.length} hari kerja)`}
            action={<Button variant="outline" size="sm" icon={Download} onClick={handleExportCSV}>Export CSV</Button>}
          >
            {fullList.length === 0
              ? <AlertInPage type="error" message="Tidak ada hari kerja dalam periode ini." />
              : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {fullList.map((p, i) => {
                    const isHadir = p.status_kehadiran === 'hadir'
                    const isSedangBekerja = p.status_kehadiran === 'belum_lengkap' && p.jam_masuk
                    const rowCls = isHadir ? 'bg-green-50 hover:bg-green-100' : isSedangBekerja ? 'bg-blue-50 hover:bg-blue-100' : 'bg-red-50 hover:bg-red-100'
                    const badgeCls = isHadir ? 'bg-green-200 text-green-800' : isSedangBekerja ? 'bg-blue-200 text-blue-800' : 'bg-red-200 text-red-800'
                    const label = isHadir ? 'Hadir' : isSedangBekerja ? 'Sedang Bekerja' : 'Tidak Hadir'
                    const hari = new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' })
                    return (
                      <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-colors ${rowCls}`}>
                        <span className="text-sm w-5 text-center flex-shrink-0">{isHadir ? '✅' : isSedangBekerja ? '●' : '❌'}</span>
                        <span className="text-xs text-gray-400 w-6 flex-shrink-0">{hari}</span>
                        <span className="text-sm font-semibold text-gray-700 w-28 flex-shrink-0">{formatTanggal(p.tanggal)}</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${badgeCls}`}>
                          {label}
                        </span>
                        {(isHadir || isSedangBekerja) && p.jam_masuk && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {p.jam_masuk?.slice(0,5)}{p.jam_keluar ? ` → ${p.jam_keluar?.slice(0,5)}` : ''}
                            {p.durasi_jam ? ` (${p.durasi_jam}j)` : ''}
                          </span>
                        )}
                        {!p.fromDB && <span className="text-xs text-red-400 ml-auto italic">Tidak ada catatan</span>}
                        {p.fromDB && p.catatan && p.catatan !== 'Otomatis: tidak tercatat' && (
                          <span className="text-xs text-gray-400 ml-auto italic truncate max-w-40">{p.catatan}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            }
            {laporan.summary.tidakTercatat > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-xl p-3">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                <span><strong>{laporan.summary.tidakTercatat} hari kerja</strong> tidak ada catatan presensi → dihitung otomatis sebagai <strong>Tidak Hadir</strong>.</span>
              </div>
            )}
          </Card>

          {/* Lembur */}
          {laporan.lembur.length > 0 && (
            <Card title={`Lembur (${laporan.lembur.length} catatan)`}>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {laporan.lembur.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors">
                    <Clock size={14} className="text-purple-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-700 w-28 flex-shrink-0">{formatTanggal(l.tanggal)}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{parseFloat(l.durasi_jam || 0).toFixed(1)} jam</span>
                    <span className="text-sm font-bold text-purple-700 flex-1">{formatRupiah(l.total_lembur)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                      l.status_persetujuan === 'disetujui' ? 'bg-green-100 text-green-700' :
                      l.status_persetujuan === 'ditolak'   ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{l.status_persetujuan}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                <span>Total disetujui: <strong className="text-purple-700">{formatRupiah(laporan.lembur.filter(l => l.status_persetujuan === 'disetujui').reduce((s, l) => s + parseFloat(l.total_lembur || 0), 0))}</strong></span>
                <span>Total jam: <strong>{laporan.lembur.reduce((s, l) => s + parseFloat(l.durasi_jam || 0), 0).toFixed(1)} jam</strong></span>
              </div>
            </Card>
          )}

          {/* Kasbon */}
          {laporan.kasbon.length > 0 && (
            <Card title={`Kasbon (${laporan.kasbon.length} transaksi)`}>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {laporan.kasbon.map((k, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
                    <CreditCard size={14} className="text-amber-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-700 w-28 flex-shrink-0">{formatTanggal(k.tanggal_kasbon)}</span>
                    <span className="text-sm font-bold text-amber-700 flex-1">{formatRupiah(k.jumlah_kasbon)}</span>
                    {!k.status_lunas && <span className="text-xs text-red-500 flex-shrink-0">sisa {formatRupiah(k.sisa_kasbon)}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${k.status_lunas ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {k.status_lunas ? 'Lunas' : 'Outstanding'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Rekap Gaji */}
          {laporan.rekap.length > 0 && (
            <Card title={`Rekap Gaji Mingguan (${laporan.rekap.length} periode)`}>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {laporan.rekap.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
                    <DollarSign size={14} className="text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-500">{formatTanggal(r.periode_mulai)} s/d {formatTanggal(r.periode_selesai)}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm font-bold text-blue-700">{formatRupiah(r.gaji_bersih)}</span>
                        {parseFloat(r.total_potongan_kasbon || 0) > 0 && (
                          <span className="text-xs text-red-400">potong {formatRupiah(r.total_potongan_kasbon)}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">{r.total_hari_hadir} hari</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${r.status === 'dibayar' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {r.status}
                    </span>
                    <button onClick={() => handleCetakSlip(r)} title="Cetak Slip Gaji"
                      className="p-1.5 rounded-lg hover:bg-blue-200 text-blue-600 flex-shrink-0 transition-colors">
                      <Printer size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-right text-gray-500">
                Total dibayar: <strong className="text-blue-700">{formatRupiah(laporan.summary.totalGaji)}</strong>
              </div>
            </Card>
          )}
        </>
      )}

      {!laporan && !loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-300">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center">
            <User size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-400">Pilih karyawan dan klik Tampilkan</p>
          <p className="text-xs text-gray-300">Presensi, lembur, kasbon, dan rekap gaji dalam satu tampilan</p>
        </div>
      )}
    </div>
  )
}