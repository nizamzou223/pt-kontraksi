import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Download, RefreshCw, Info, Users, Briefcase, TrendingUp, CreditCard } from 'lucide-react'
import { Card, Button, Select, PageHeader, DropdownSelect } from '../common'
import { payrollService } from '../../services/payrollService'
import { exportService } from '../../services/exportService'
import { formatRupiah } from '../../utils/formatters'
import { BULAN } from '../../utils/constants'
import { syncBus } from '../../utils/syncBus'

const AUTO_REFRESH_MS = 45000

export default function GajiBulanan() {
  const [data,           setData]           = useState([])
  const [weeklyMap,      setWeeklyMap]      = useState({}) // per-karyawan weekly stats
  const [loading,        setLoading]        = useState(true)
  const [syncing,        setSyncing]        = useState(false)
  const [filterGolongan, setFilterGolongan] = useState('')
  const [golonganList,   setGolonganList]   = useState([])
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())

  const buildWeeklyMap = (mingguanList) => {
    const map = {}
    for (const m of (mingguanList || [])) {
      const k = String(m.karyawan_id)
      if (!map[k]) map[k] = { total: 0, dibayar: 0, draft: 0, dibayarBersih: 0, draftBersih: 0 }
      const bersih = parseFloat(m.gaji_bersih || 0)
      map[k].total++
      if (m.status === 'dibayar') { map[k].dibayar++; map[k].dibayarBersih += bersih }
      else                        { map[k].draft++;   map[k].draftBersih   += bersih }
    }
    return map
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      await payrollService._autoRekapBulanan(parseInt(bulan), parseInt(tahun))
    } catch (e) {
      console.warn('autoRekapBulanan:', e?.message)
    }
    try {
      const [fresh, mingguanList] = await Promise.all([
        payrollService.getGajiBulanan({ bulan, tahun }),
        payrollService.getGajiMingguanByBulan(parseInt(bulan), parseInt(tahun)),
      ])
      setData(fresh || [])
      setWeeklyMap(buildWeeklyMap(mingguanList))
    } catch (e) {
      if (!silent) toast.error(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [bulan, tahun])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (data.length > 0) {
      const gols = [...new Set(
        data.map(d => d.karyawan?.jabatan?.nama_jabatan).filter(Boolean)
      )].sort()
      setGolonganList(gols)
      if (filterGolongan && !gols.includes(filterGolongan)) setFilterGolongan('')
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = syncBus.on('gaji', () => load(true))
    return unsub
  }, [load])

  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(true), AUTO_REFRESH_MS)

  const handleSinkronManual = async () => {
    setSyncing(true)
    try {
      await payrollService._autoRekapBulanan(parseInt(bulan), parseInt(tahun))
      const [fresh, mingguanList] = await Promise.all([
        payrollService.getGajiBulanan({ bulan, tahun }),
        payrollService.getGajiMingguanByBulan(parseInt(bulan), parseInt(tahun)),
      ])
      setData(fresh || [])
      setWeeklyMap(buildWeeklyMap(mingguanList))
      toast.success(`Sinkron selesai — ${(fresh || []).length} karyawan`)
    } catch (e) { toast.error(e.message) } finally { setSyncing(false) }
  }

  const filteredData = filterGolongan
    ? data.filter(d => d.karyawan?.jabatan?.nama_jabatan === filterGolongan)
    : data

  const byGolongan = {}
  filteredData.forEach(d => {
    const gol = d.karyawan?.jabatan?.nama_jabatan || 'Tanpa Golongan'
    if (!byGolongan[gol]) byGolongan[gol] = []
    byGolongan[gol].push(d)
  })
  const golonganEntries = Object.entries(byGolongan).sort(([a], [b]) => a.localeCompare(b))

  const total       = filteredData.reduce((s, g) => s + parseFloat(g.total_gaji_bersih    || 0), 0)
  const totalKotor  = filteredData.reduce((s, g) => s + parseFloat(g.total_gaji_kotor     || 0), 0)
  const totalHari   = filteredData.reduce((s, g) => s + parseInt(g.total_hari_hadir       || 0), 0)
  const totalKasbon = filteredData.reduce((s, g) => s + parseFloat(g.total_kasbon_potong  || 0), 0)
  const totalLembur = filteredData.reduce((s, g) => s + parseFloat(g.total_uang_lembur    || 0), 0)

  // Weekly paid vs pending — scoped to filtered employees
  const filteredIds  = new Set(filteredData.map(d => String(d.karyawan_id)))
  const weeklyValues = Object.entries(weeklyMap)
    .filter(([id]) => filteredIds.size === 0 || filteredIds.has(id))
    .map(([, v]) => v)
  const totalDibayar = weeklyValues.reduce((s, w) => s + w.dibayarBersih, 0)
  const totalPending = weeklyValues.reduce((s, w) => s + w.draftBersih,   0)
  const hasPending   = weeklyValues.some(w => w.draft > 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gaji Bulanan"
        subtitle="Sinkron otomatis dari gaji mingguan • Dikelompokkan per golongan"
        action={
          <div className="flex gap-2">
            <Button variant="outline" icon={Download} size="sm"
              onClick={() => {
                exportService.exportGajiBulananPerGolongan(filteredData, bulan, tahun)
                  .then(() => toast.success('Excel diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              Excel
            </Button>
            <Button variant="outline" icon={Download} size="sm"
              onClick={() => {
                exportService.exportGajiBulananPDF(filteredData, bulan, tahun)
                  .then(() => toast.success('PDF diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              PDF
            </Button>
            <Button icon={RefreshCw} loading={syncing} onClick={handleSinkronManual} size="sm" variant="outline">
              Sinkron
            </Button>
          </div>
        }
      />

      {/* Filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <DropdownSelect
          value={String(bulan)}
          onChange={v => { setBulan(parseInt(v)); setFilterGolongan('') }}
          className="w-auto"
          options={BULAN.map((b, i) => ({ value: String(i + 1), label: b }))}
        />
        <DropdownSelect
          value={String(tahun)}
          onChange={v => { setTahun(parseInt(v)); setFilterGolongan('') }}
          className="w-auto"
          options={[2024, 2025, 2026, 2027].map(y => ({ value: String(y), label: String(y) }))}
        />
        <DropdownSelect
          value={filterGolongan}
          onChange={v => setFilterGolongan(v)}
          className="w-auto min-w-44"
          disabled={golonganList.length === 0}
          options={[
            { value: '', label: 'Semua Golongan' },
            ...golonganList.map(g => ({ value: g, label: g })),
          ]}
        />

        {data.length === 0 && !loading && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3.5 py-2.5 rounded-xl">
            <Info size={14} />
            <span>Belum ada data. Bayar gaji mingguan terlebih dahulu.</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-500 mb-1 font-medium">Sudah Dibayar</p>
          <p className="text-lg font-bold text-blue-700">{formatRupiah(totalDibayar)}</p>
          <p className="text-[10px] text-blue-400 mt-0.5">bersih terbayar</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-xs text-amber-600 mb-1 font-medium">Pending Draft</p>
          <p className="text-lg font-bold text-amber-700">{formatRupiah(totalPending)}</p>
          <p className="text-[10px] text-amber-400 mt-0.5">belum terbayar</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <Users size={20} className="text-green-600" />
          <div>
            <p className="text-xs text-green-600">Karyawan</p>
            <p className="text-2xl font-bold text-green-700">{filteredData.length}</p>
          </div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-xs text-orange-600 mb-1 font-medium">Total Lembur</p>
          <p className="text-lg font-bold text-orange-700">{formatRupiah(totalLembur)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-600 mb-1 font-medium">Kasbon Dipotong</p>
          <p className="text-lg font-bold text-red-700">{formatRupiah(totalKasbon)}</p>
        </div>
      </div>

      {/* Pending banner */}
      {hasPending && !loading && (
        <div className="flex items-start gap-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl">
          <Info size={15} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <span>
            Terdapat minggu dengan status <span className="font-semibold">draft</span> yang belum dibayar bulan ini.
            Bayar melalui tab <span className="font-semibold">Gaji Mingguan</span> untuk memperbarui total terbayar.
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <Card><div className="text-center py-8 text-gray-400">Memuat data...</div></Card>
      ) : data.length === 0 ? (
        <Card><div className="text-center py-8 text-gray-400 text-sm">Belum ada rekap gaji bulan ini.</div></Card>
      ) : filteredData.length === 0 ? (
        <Card><div className="text-center py-8 text-gray-400 text-sm">Tidak ada data untuk golongan ini.</div></Card>
      ) : (
        <div className="space-y-4">
          {golonganEntries.map(([golongan, rows]) => {
            const subtotal      = rows.reduce((s, r) => s + parseFloat(r.total_gaji_bersih  || 0), 0)
            const subtotalKotor = rows.reduce((s, r) => s + parseFloat(r.total_gaji_kotor   || 0), 0)
            const subHari       = rows.reduce((s, r) => s + parseInt(r.total_hari_hadir     || 0), 0)
            const subLembur     = rows.reduce((s, r) => s + parseFloat(r.total_uang_lembur  || 0), 0)
            return (
              <Card key={golongan}>
                {/* Header golongan */}
                <div className="flex items-center justify-between px-1 pb-3 mb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Briefcase size={15} className="text-indigo-500" />
                    <span className="text-sm font-extrabold text-indigo-700 uppercase tracking-wide">{golongan}</span>
                    <span className="text-xs text-gray-400 ml-1">{rows.length} karyawan · {subHari} hari hadir</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Subtotal Bersih</p>
                    <p className="text-sm font-bold text-blue-700">{formatRupiah(subtotal)}</p>
                    {subLembur > 0 && (
                      <p className="text-xs text-amber-600">+{formatRupiah(subLembur)} lembur</p>
                    )}
                  </div>
                </div>

                {/* Header kolom */}
                <div className="grid grid-cols-8 text-[10px] font-bold text-gray-400 uppercase tracking-wide px-3 mb-1">
                  <div className="col-span-2">Karyawan</div>
                  <div className="text-center">Hari</div>
                  <div className="text-right">Pokok</div>
                  <div className="text-right">Tunjangan</div>
                  <div className="text-right">Lembur</div>
                  <div className="text-right">Kasbon</div>
                  <div className="text-right">Bersih</div>
                </div>

                {/* Baris per karyawan */}
                <div className="space-y-1">
                  {[...rows]
                    .sort((a, b) => (a.karyawan?.nama_karyawan || '').localeCompare(b.karyawan?.nama_karyawan || ''))
                    .map((r, i) => {
                      const pokok     = parseFloat(r.total_gaji_pokok      || 0)
                      const makan     = parseFloat(r.total_uang_makan      || 0)
                      const transport = parseFloat(r.total_uang_transport  || 0)
                      const lembur    = parseFloat(r.total_uang_lembur     || 0)
                      const kasbon    = parseFloat(r.total_kasbon_potong   || 0)
                      const bersih    = parseFloat(r.total_gaji_bersih     || 0)
                      const tunjangan = makan + transport
                      const wk        = weeklyMap[String(r.karyawan_id)] || null
                      const rowPending = wk ? wk.draft > 0 : false
                      return (
                        <div key={i} className={`grid grid-cols-8 items-center gap-2 px-3 py-2.5 rounded-xl transition-colors text-sm ${rowPending ? 'bg-amber-50 hover:bg-amber-100' : 'bg-gray-50 hover:bg-blue-50'}`}>
                          {/* Nama */}
                          <div className="col-span-2 flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${rowPending ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-600'}`}>
                              {r.karyawan?.nama_karyawan?.[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate">{r.karyawan?.nama_karyawan}</p>
                              <p className="text-xs text-gray-400 font-mono">{r.karyawan?.id_karyawan || '-'}</p>
                            </div>
                          </div>
                          {/* Hari */}
                          <div className="text-center">
                            <p className="font-semibold">{r.total_hari_hadir}</p>
                          </div>
                          {/* Pokok */}
                          <div className="text-right">
                            <p className="text-gray-700 text-xs">{formatRupiah(pokok)}</p>
                          </div>
                          {/* Tunjangan */}
                          <div className="text-right">
                            {tunjangan > 0
                              ? <p className="text-green-600 text-xs">{formatRupiah(tunjangan)}</p>
                              : <p className="text-gray-300 text-xs">-</p>
                            }
                          </div>
                          {/* Lembur */}
                          <div className="text-right">
                            {lembur > 0
                              ? <p className="text-amber-600 font-medium text-xs">{formatRupiah(lembur)}</p>
                              : <p className="text-gray-300 text-xs">-</p>
                            }
                          </div>
                          {/* Kasbon */}
                          <div className="text-right">
                            {kasbon > 0
                              ? <p className="text-red-500 font-medium text-xs">−{formatRupiah(kasbon)}</p>
                              : <p className="text-gray-300 text-xs">-</p>
                            }
                          </div>
                          {/* Bersih + minggu status */}
                          <div className="text-right">
                            <p className={`font-bold text-sm ${bersih > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                              {formatRupiah(bersih)}
                            </p>
                            {wk && wk.total > 0 && (
                              <p className={`text-[10px] mt-0.5 font-medium ${wk.draft > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                                {wk.dibayar}/{wk.total} minggu
                                {wk.draft > 0 && ` · ${formatRupiah(wk.draftBersih)} pending`}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })
                  }
                </div>

                {/* Subtotal row */}
                <div className="grid grid-cols-8 items-center gap-2 px-3 py-2 mt-2 border-t border-dashed border-gray-200 text-xs font-bold text-gray-600">
                  <div className="col-span-2 text-gray-500">Subtotal {golongan}</div>
                  <div className="text-center">{subHari}</div>
                  <div className="text-right">{formatRupiah(rows.reduce((s,r)=>s+parseFloat(r.total_gaji_pokok||0),0))}</div>
                  <div className="text-right text-green-600">{formatRupiah(rows.reduce((s,r)=>s+parseFloat(r.total_uang_makan||0)+parseFloat(r.total_uang_transport||0),0))}</div>
                  <div className="text-right text-amber-600">{formatRupiah(subLembur)}</div>
                  <div className="text-right text-red-500">−{formatRupiah(rows.reduce((s,r)=>s+parseFloat(r.total_kasbon_potong||0),0))}</div>
                  <div className="text-right text-blue-700">{formatRupiah(subtotal)}</div>
                </div>
              </Card>
            )
          })}

          {/* Grand Total */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-blue-200 text-xs font-bold uppercase tracking-wide">Rekap Gaji Bulanan</p>
                <p className="text-2xl font-extrabold mt-1">{formatRupiah(total)}</p>
                <p className="text-blue-200 text-xs mt-1">total akumulasi minggu · gaji kotor {formatRupiah(totalKotor)}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-blue-200 text-xs">{filteredData.length} karyawan · {totalHari} hari kerja</p>
                <p className="text-sm font-semibold text-amber-300">Lembur: {formatRupiah(totalLembur)}</p>
                <p className="text-sm font-semibold text-red-300">Kasbon potong: {formatRupiah(totalKasbon)}</p>
              </div>
            </div>
            {/* Paid vs pending breakdown */}
            <div className="flex gap-4 mt-4 pt-4 border-t border-blue-500">
              <div className="flex-1 bg-blue-500/40 rounded-xl px-4 py-2.5">
                <p className="text-blue-200 text-[10px] font-bold uppercase">Sudah Dibayar</p>
                <p className="text-white text-base font-extrabold mt-0.5">{formatRupiah(totalDibayar)}</p>
              </div>
              <div className={`flex-1 rounded-xl px-4 py-2.5 ${totalPending > 0 ? 'bg-amber-500/30' : 'bg-blue-500/40'}`}>
                <p className={`text-[10px] font-bold uppercase ${totalPending > 0 ? 'text-amber-200' : 'text-blue-200'}`}>Pending Draft</p>
                <p className={`text-base font-extrabold mt-0.5 ${totalPending > 0 ? 'text-amber-300' : 'text-blue-200'}`}>
                  {totalPending > 0 ? formatRupiah(totalPending) : 'Lunas'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
