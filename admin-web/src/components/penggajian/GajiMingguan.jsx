import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { CreditCard, Download, Eye, CheckCircle, AlertCircle, Edit2, RotateCcw, Save, X, Printer } from 'lucide-react'
import { Card, Button, Modal, Select, Input, FormField, Table, PageHeader, DropdownSelect } from '../common'
import { payrollService } from '../../services/payrollService'
import { exportService } from '../../services/exportService'
import { projectService } from '../../services/projectService'
import { formatTanggal, formatRupiah, getStatusColor, formatNamaStatus } from '../../utils/formatters'
import { getCurrentWeek, getWeekRange, STATUS_GAJI } from '../../utils/constants'
import { syncBus } from '../../utils/syncBus'
import supabase from '../../services/supabaseClient'

const AUTO_REFRESH_MS = 45000
const REALTIME_DEBOUNCE_MS = 3000

export default function GajiMingguan() {
  const [data, setData] = useState([])
  const [karyawan, setKaryawan] = useState([])
  const [loading, setLoading] = useState(true)
  const [proses, setProses] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [konfirmasiModal, setKonfirmasiModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [resetModal, setResetModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [filterStatus,  setFilterStatus]  = useState('all')
  const [filterProject, setFilterProject] = useState('')
  const [projectList,   setProjectList]   = useState([])
  const [periode, setPeriode] = useState(() => getCurrentWeek())
  const metodeBayar = 'tunai'

  // Guards
  const isHitungRef     = useRef(false)
  const hitungGajiRef   = useRef(null)
  // Debounce timer untuk Realtime handler
  const realtimeTimerRef = useRef(null)
  const reloadTimerRef   = useRef(null)
  const loadRef          = useRef(null)
  // Handler realtime hanya bekerja bila halaman aktif; bila tersembunyi ditandai "perlu refresh"
  const requestReload = usePolling(() => loadRef.current?.(true), 0)
  const requestHitung = usePolling(async () => { if (hitungGajiRef.current) await hitungGajiRef.current(false, true) }, 0)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [gajiData, karyawanData] = await Promise.all([
        payrollService.getGajiMingguan({ periode_mulai: periode.start, periode_selesai: periode.end }),
        projectService.getKaryawan({ status_aktif: true }),
      ])
      const filtered = gajiData.filter(d => d.status !== 'tidak_hadir' && d.status !== null)
      setData(filtered)
      setKaryawan(karyawanData)
    } catch (e) {
      if (!silent) toast.error(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [periode.start, periode.end])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadRef.current = load }, [load])
  useEffect(() => {
    supabase.from('project').select('id, nama_project, kode_project').order('nama_project')
      .then(({ data }) => setProjectList(data || []))
  }, [])

  const hitungSemuaGaji = useCallback(async (showToast = false, force = false) => {
    if (karyawan.length === 0) return 0
    if (isHitungRef.current) return 0
    isHitungRef.current = true
    try {
      const sudahDibayar = new Set(data.filter(d => d.status === 'dibayar').map(d => d.karyawan_id))
      const perluHitung = force
        ? karyawan.filter(k => !sudahDibayar.has(k.id))
        : karyawan.filter(k => !data.some(d => d.karyawan_id === k.id))
      if (perluHitung.length === 0) return 0

      // Batch: beberapa query untuk SEMUA karyawan, lalu hanya baris yang berubah ditulis
      const { berhasil, diubah } = await payrollService.hitungDanSimpanGajiMingguanBatch(
        perluHitung.map(k => k.id), periode.start, periode.end,
      )
      if (diubah > 0) await load(true)
      if (showToast && berhasil > 0) toast.success(`✓ ${berhasil} gaji dihitung/diperbarui`)
      if (diubah > 0) syncBus.emitAll('gaji')
      return berhasil
    } finally {
      isHitungRef.current = false
    }
  }, [karyawan, data, periode.start, periode.end])

  useEffect(() => { hitungGajiRef.current = hitungSemuaGaji }, [hitungSemuaGaji])

  // ── Realtime dengan debounce 3 detik (cegah thundering herd) ──────────────
  useEffect(() => {
    const triggerDebounced = () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current)
      realtimeTimerRef.current = setTimeout(async () => {
        requestHitung()
      }, REALTIME_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('gaji-mingguan-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi' }, triggerDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lembur' },   triggerDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kasbon' },   triggerDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rekap_gaji_mingguan' },
        () => {
          if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
          reloadTimerRef.current = setTimeout(() => requestReload(), 800)
        })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current)
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto hitung: selalu recalculate semua karyawan non-dibayar saat periode berubah/load
  useEffect(() => {
    const checkAndHitung = async () => {
      if (loading || karyawan.length === 0) return
      const { data: hadirRows } = await supabase
        .from('presensi').select('karyawan_id')
        .eq('status_kehadiran', 'hadir')
        .gte('tanggal', periode.start).lte('tanggal', periode.end)
      if (!hadirRows || hadirRows.length === 0) return
      await hitungSemuaGaji(false, true)
    }
    checkAndHitung()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, karyawan.length, periode.start, periode.end])

  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(true), AUTO_REFRESH_MS)

  const bayarSemua = async () => {
    const draft = data.filter(d => d.status === 'draft')
    if (!draft.length) {
      toast.error('Tidak ada gaji draft untuk dibayar')
      return
    }
    setProses(true)
    try {
      const results = await payrollService.bayarGajiByIds(
        draft.map(d => d.id),
        metodeBayar
      )
      toast.success(
        `✅ ${results.length} gaji dibayar! Total: ${formatRupiah(results.reduce((s, r) => s + parseFloat(r.gaji_bersih || 0), 0))}`,
        { duration: 5000 }
      )
      setKonfirmasiModal(false)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally { setProses(false) }
  }

  const openEdit = (row) => {
    setSelected(row)
    setEditForm({
      total_gaji_pokok:      row.total_gaji_pokok      || 0,
      total_uang_makan:      row.total_uang_makan      || 0,
      total_uang_transport:  row.total_uang_transport  || 0,
      total_uang_lembur:     row.total_uang_lembur     || 0,
      total_potongan_kasbon: row.total_potongan_kasbon || 0,
      potongan_lainnya:      row.potongan_lainnya      || 0,
      catatan:               row.catatan               || '',
    })
    setEditModal(true)
  }

  const hitungGajiBersih = (f) => {
    const kotor  = parseFloat(f.total_gaji_pokok||0) + parseFloat(f.total_uang_makan||0) + parseFloat(f.total_uang_transport||0) + parseFloat(f.total_uang_lembur||0)
    const potong = parseFloat(f.total_potongan_kasbon||0) + parseFloat(f.potongan_lainnya||0)
    return { kotor, bersih: Math.max(0, kotor - potong) }
  }

  const handleSaveEdit = async () => {
    if (!selected) return
    try {
      const { kotor, bersih } = hitungGajiBersih(editForm)
      const payload = {
        total_gaji_pokok:      parseFloat(editForm.total_gaji_pokok)      || 0,
        total_uang_makan:      parseFloat(editForm.total_uang_makan)      || 0,
        total_uang_transport:  parseFloat(editForm.total_uang_transport)  || 0,
        total_uang_lembur:     parseFloat(editForm.total_uang_lembur)     || 0,
        gaji_kotor:            kotor,
        total_potongan_kasbon: parseFloat(editForm.total_potongan_kasbon) || 0,
        potongan_lainnya:      parseFloat(editForm.potongan_lainnya)      || 0,
        gaji_bersih:           bersih,
        catatan:               editForm.catatan,
        updated_at:            new Date().toISOString(),
      }
      await payrollService.updateGajiMingguan(selected.id, payload)
      toast.success('Data gaji berhasil diperbarui')
      setEditModal(false)
      load(true)
    } catch (e) { toast.error(e.message) }
  }

  const handleResetGaji = async () => {
    if (!selected) return
    try {
      await payrollService.resetGajiMingguan(selected.id)
      toast.success('Gaji berhasil direset ke draft baru')
      setResetModal(false)
      setDetailModal(false)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const filtered = data.filter(d => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false
    if (filterProject) {
      const pids = Object.keys(d.project_details || {})
      if (!pids.includes(filterProject.toString())) return false
    }
    return true
  })
  const draftCount         = data.filter(d => d.status === 'draft').length
  const totalGajiBersih    = filtered.reduce((s, g) => s + parseFloat(g.gaji_bersih           || 0), 0)
  const totalKasbonPotong  = filtered.reduce((s, g) => s + parseFloat(g.total_potongan_kasbon || 0), 0)
  const totalLembur        = filtered.reduce((s, g) => s + parseFloat(g.total_uang_lembur     || 0), 0)

  const getPeriodeOptions = () => {
    const opts = []
    for (let i = 0; i < 8; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i * 7)
      opts.push(getWeekRange(d)) // end = Sabtu, pakai local date (fix timezone WIB)
    }
    return opts
  }

  const { kotor: previewKotor, bersih: previewBersih } = hitungGajiBersih(editForm)

  return (
    <div className="space-y-4">
      <PageHeader title="Gaji Mingguan"
        subtitle={`Semua karyawan aktif • ${draftCount} draft siap dibayar`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={Download}
              onClick={() => {
                const projName = filterProject
                  ? (projectList.find(p => p.id === parseInt(filterProject))?.nama_project || 'Project')
                  : 'Semua Project'
                exportService.exportGajiMingguanPerProject(filtered, projName, `${periode.start} - ${periode.end}`)
                  .then(() => toast.success('Excel diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              Excel
            </Button>
            <Button variant="outline" size="sm" icon={Download}
              onClick={() => {
                const projName = filterProject
                  ? (projectList.find(p => p.id === parseInt(filterProject))?.nama_project || 'Project')
                  : 'Semua Project'
                exportService.exportGajiMingguanPDF(filtered, projName, `${periode.start} - ${periode.end}`)
                  .then(() => toast.success('PDF diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              PDF
            </Button>
            <Button variant="outline" size="sm" icon={Save}
              onClick={async () => {
                if (isHitungRef.current) return
                setLoading(true)
                const n = await hitungSemuaGaji(true, true)
                if (n === 0) toast('Semua gaji sudah up-to-date', { icon: 'ℹ️' })
                setLoading(false)
              }}>
              Hitung Ulang
            </Button>
            <Button icon={CreditCard}
              onClick={() => {
                if (draftCount === 0) {
                  toast.error('Belum ada gaji draft. Klik Hitung Ulang atau pastikan ada presensi hadir.')
                  return
                }
                setKonfirmasiModal(true)
              }}
              variant="success">
              Bayar Semua ({draftCount})
            </Button>
          </div>
        } />

      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Periode Mingguan (Bayar hari Sabtu)</label>
            <DropdownSelect
              value={`${periode.start}|${periode.end}`}
              onChange={v => { const [s, e2] = v.split('|'); setPeriode({ start: s, end: e2 }) }}
              className="w-auto"
              options={getPeriodeOptions().map(p => ({
                value: `${p.start}|${p.end}`,
                label: `${formatTanggal(p.start)} – ${formatTanggal(p.end)}`,
              }))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Filter Status</label>
            <DropdownSelect
              value={filterStatus}
              onChange={v => setFilterStatus(v)}
              className="w-auto"
              options={[
                { value: 'all', label: 'Semua Status' },
                ...STATUS_GAJI.map(s => ({ value: s, label: formatNamaStatus(s) })),
              ]}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Filter Project</label>
            <DropdownSelect
              value={filterProject}
              onChange={v => setFilterProject(v)}
              className="w-auto min-w-40"
              options={[
                { value: '', label: 'Semua Project' },
                ...projectList.map(p => ({ value: String(p.id), label: p.nama_project })),
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div><p className="text-xs text-gray-500">Total Gaji Bersih</p><p className="text-lg font-bold text-blue-700">{formatRupiah(totalGajiBersih)}</p></div>
          <div><p className="text-xs text-gray-500">Potongan Kasbon</p><p className="text-lg font-bold text-red-600">{formatRupiah(totalKasbonPotong)}</p></div>
          <div><p className="text-xs text-gray-500">Total Lembur</p><p className="text-lg font-bold text-green-600">{formatRupiah(totalLembur)}</p></div>
          <div><p className="text-xs text-gray-500">Karyawan</p><p className="text-lg font-bold text-gray-900">{filtered.length} orang</p></div>
        </div>
      </Card>


      <Card>
        <Table loading={loading} data={filtered}
          emptyText="Belum ada data gaji untuk periode ini."
          columns={[
            { header: 'Karyawan', render: r => (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">
                  {r.karyawan?.nama_karyawan?.[0]}
                </div>
                <div>
                  <p className="font-medium">{r.karyawan?.nama_karyawan}</p>
                  <p className="text-xs text-gray-400">{r.karyawan?.jabatan?.nama_jabatan}</p>
                </div>
              </div>
            )},
            { header: 'Hadir', render: r => (
              <div>
                <p className="font-semibold text-sm">{r.total_hari_hadir} hari</p>
                {r.project_details && Object.keys(r.project_details).filter(k => k !== '_upah_luar_kota').length > 0 && (
                  <p className="text-xs text-gray-400 truncate max-w-24">
                    {Object.values(r.project_details).filter(p => p?.nama).map(p => p.nama).join(', ')}
                  </p>
                )}
              </div>
            )},
            { header: 'Gaji Pokok', render: r => formatRupiah(r.total_gaji_pokok) },
            { header: 'Tunjangan',  render: r => formatRupiah(parseFloat(r.total_uang_makan||0)+parseFloat(r.total_uang_transport||0)) },
            { header: 'Lembur', render: r => r.total_uang_lembur > 0
              ? <span className="text-green-600">{formatRupiah(r.total_uang_lembur)}</span>
              : <span className="text-gray-400">-</span>
            },
            { header: 'Luar Kota', render: r => {
              const lk = parseFloat(r.project_details?._upah_luar_kota || 0)
              return lk > 0
                ? <span className="text-purple-600 font-medium">{formatRupiah(lk)}</span>
                : <span className="text-gray-400">-</span>
            }},
            { header: 'Kasbon Potong', render: r => r.total_potongan_kasbon > 0
              ? <span className="text-red-600 font-medium">−{formatRupiah(r.total_potongan_kasbon)}</span>
              : <span className="text-gray-400">-</span>
            },
            { header: 'Gaji Bersih', render: r => (
              <span className={`font-bold text-sm ${parseFloat(r.gaji_bersih) > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                {formatRupiah(r.gaji_bersih)}
              </span>
            )},
            { header: 'Status', render: r => (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status)}`}>
                {formatNamaStatus(r.status)}
              </span>
            )},
            { header: 'Aksi', className: 'w-20', render: r => (
              <div className="flex gap-1">
                <button onClick={() => { setSelected(r); setDetailModal(true) }}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Detail">
                  <Eye size={14} />
                </button>
                <button onClick={() => openEdit(r)}
                  className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit Gaji">
                  <Edit2 size={14} />
                </button>
                {r.status === 'dibayar' && (
                  <button onClick={() => { setSelected(r); setResetModal(true) }}
                    className="p-1.5 rounded hover:bg-orange-50 text-orange-500" title="Reset ke Draft">
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            )},
          ]} />
      </Card>

      {/* ─── Detail Modal ─── */}
      <Modal open={detailModal} onClose={() => setDetailModal(false)} title="Detail Slip Gaji" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">{selected.karyawan?.nama_karyawan}</p>
                <p className="text-sm text-gray-400">{selected.karyawan?.jabatan?.nama_jabatan}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selected.status)}`}>
                {formatNamaStatus(selected.status)}
              </span>
            </div>
            <p className="text-xs text-gray-400">Periode: {formatTanggal(selected.periode_mulai)} – {formatTanggal(selected.periode_selesai)}</p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              {[
                ['Hari Hadir',      `${selected.total_hari_hadir} hari`],
                ['Gaji Pokok',      formatRupiah(selected.total_gaji_pokok)],
                ['Uang Makan',      formatRupiah(selected.total_uang_makan)],
                ['Uang Transport',  formatRupiah(selected.total_uang_transport)],
                ['Uang Lembur',     formatRupiah(selected.total_uang_lembur)],
                ['Upah Luar Kota',  formatRupiah(selected.project_details?._upah_luar_kota || 0)],
                ['Gaji Kotor',      formatRupiah(selected.gaji_kotor)],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between">
                  <span className="text-gray-500">{l}</span><span className="font-medium">{v}</span>
                </div>
              ))}
              {selected.total_potongan_kasbon > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Potongan Kasbon</span>
                  <span className="font-medium">− {formatRupiah(selected.total_potongan_kasbon)}</span>
                </div>
              )}
              {selected.potongan_lainnya > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Potongan Lainnya</span>
                  <span className="font-medium">− {formatRupiah(selected.potongan_lainnya)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between">
                <span className="font-bold">GAJI BERSIH</span>
                <span className={`font-bold text-lg ${parseFloat(selected.gaji_bersih) > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                  {formatRupiah(selected.gaji_bersih)}
                </span>
              </div>
            </div>
            {selected.status === 'dibayar' && (
              <div className="bg-green-50 rounded-lg p-3 text-sm flex items-center gap-2">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-green-700">Dibayar {formatTanggal(selected.tanggal_pembayaran)} via {selected.metode_pembayaran}</span>
              </div>
            )}
            {selected.catatan && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <span className="font-medium text-gray-700">Catatan: </span>{selected.catatan}
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" onClick={() => setDetailModal(false)}>Tutup</Button>
              <Button variant="outline" icon={Printer} onClick={() => exportService.exportSlipGajiPDF(selected)}>
                Cetak Slip
              </Button>
              <Button icon={Edit2} onClick={() => { setDetailModal(false); openEdit(selected) }}>Edit Gaji</Button>
              {selected.status === 'dibayar' && (
                <Button variant="outline" icon={RotateCcw}
                  onClick={() => { setDetailModal(false); setResetModal(true) }}
                  className="text-orange-600 border-orange-300 hover:bg-orange-50">
                  Reset
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Edit Gaji Modal ─── */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Data Gaji" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center text-xs font-bold text-blue-700">
                {selected.karyawan?.nama_karyawan?.[0]}
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">{selected.karyawan?.nama_karyawan}</p>
                <p className="text-xs text-gray-500">{formatTanggal(selected.periode_mulai)} – {formatTanggal(selected.periode_selesai)}</p>
              </div>
              <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selected.status)}`}>
                {formatNamaStatus(selected.status)}
              </span>
            </div>

            {selected.status === 'dibayar' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-700">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Gaji ini sudah dibayar. Gunakan <strong>Reset</strong> untuk menghitung ulang dari awal.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Gaji Pokok (Rp)">
                <Input type="number" value={editForm.total_gaji_pokok}
                  onChange={e => setEditForm(f => ({ ...f, total_gaji_pokok: e.target.value }))} />
              </FormField>
              <FormField label="Uang Makan (Rp)">
                <Input type="number" value={editForm.total_uang_makan}
                  onChange={e => setEditForm(f => ({ ...f, total_uang_makan: e.target.value }))} />
              </FormField>
              <FormField label="Uang Transport (Rp)">
                <Input type="number" value={editForm.total_uang_transport}
                  onChange={e => setEditForm(f => ({ ...f, total_uang_transport: e.target.value }))} />
              </FormField>
              <FormField label="Uang Lembur (Rp)">
                <Input type="number" value={editForm.total_uang_lembur}
                  onChange={e => setEditForm(f => ({ ...f, total_uang_lembur: e.target.value }))} />
              </FormField>
              <FormField label="Potongan Kasbon (Rp)">
                <Input type="number" value={editForm.total_potongan_kasbon}
                  onChange={e => setEditForm(f => ({ ...f, total_potongan_kasbon: e.target.value }))} />
              </FormField>
              <FormField label="Potongan Lainnya (Rp)">
                <Input type="number" value={editForm.potongan_lainnya}
                  onChange={e => setEditForm(f => ({ ...f, potongan_lainnya: e.target.value }))} />
              </FormField>
              <div className="col-span-2">
                <FormField label="Catatan">
                  <Input value={editForm.catatan}
                    onChange={e => setEditForm(f => ({ ...f, catatan: e.target.value }))}
                    placeholder="Catatan opsional..." />
                </FormField>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preview Perhitungan</p>
              <div className="flex justify-between">
                <span className="text-gray-500">Gaji Kotor</span>
                <span className="font-medium">{formatRupiah(previewKotor)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Total Potongan</span>
                <span>− {formatRupiah(parseFloat(editForm.total_potongan_kasbon||0) + parseFloat(editForm.potongan_lainnya||0))}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="font-bold">Gaji Bersih</span>
                <span className={`font-bold text-base ${previewBersih > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                  {formatRupiah(previewBersih)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" icon={X} onClick={() => setEditModal(false)}>Batal</Button>
              <Button icon={Save} onClick={handleSaveEdit}>Simpan Perubahan</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Reset Konfirmasi ─── */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title="Reset Gaji ke Draft" size="sm">
        {selected && (
          <div className="space-y-4">
            <div className="bg-orange-50 rounded-xl p-4 text-sm">
              <p className="font-semibold text-orange-800 mb-2">⚠️ Konfirmasi Reset Gaji</p>
              <p className="text-orange-700">Gaji <strong>{selected.karyawan?.nama_karyawan}</strong> periode {formatTanggal(selected.periode_mulai)} – {formatTanggal(selected.periode_selesai)} akan direset ke <strong>draft</strong>.</p>
              <ul className="mt-2 text-orange-600 list-disc list-inside space-y-0.5 text-xs">
                <li>Status dikembalikan ke <strong>draft</strong></li>
                <li>Data pembayaran dihapus</li>
                <li>Bisa dihitung ulang & dibayar kembali</li>
                <li>Kasbon yang sudah terpotong <strong>tidak</strong> dikembalikan otomatis</li>
              </ul>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setResetModal(false)}>Batal</Button>
              <Button
                onClick={handleResetGaji}
                className="bg-orange-600 hover:bg-orange-700 text-white"
                icon={RotateCcw}
              >
                Reset ke Draft
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Konfirmasi Bayar Semua ─── */}
      <Modal open={konfirmasiModal} onClose={() => setKonfirmasiModal(false)} title="Konfirmasi Pembayaran Gaji" size="md">
        <div className="space-y-4">
          {draftCount === 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-700 text-sm">Belum ada gaji yang siap dibayar</p>
                <p className="text-xs text-red-600 mt-1">
                  Pastikan ada presensi <strong>Hadir</strong> di periode {formatTanggal(periode.start)} – {formatTanggal(periode.end)}.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
                <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-2">
                  Periode: {formatTanggal(periode.start)} – {formatTanggal(periode.end)}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                    <p className="text-xs text-gray-400 font-medium">Karyawan Dibayar</p>
                    <p className="text-3xl font-extrabold text-blue-700 mt-1">{draftCount}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                    <p className="text-xs text-gray-400 font-medium">Total Gaji Bersih</p>
                    <p className="text-xl font-extrabold text-green-700 mt-1">
                      {formatRupiah(data.filter(d=>d.status==='draft').reduce((s,g)=>s+parseFloat(g.gaji_bersih||0),0))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1.5">
                <p className="font-bold text-amber-800 text-sm">Yang akan terjadi otomatis:</p>
                <ul className="text-amber-700 space-y-1">
                  {['Semua gaji draft → status Dibayar',
                    'Kasbon outstanding dipotong otomatis (FIFO)',
                    'Kasbon yang lunas → status Lunas',
                    'Rekap gaji bulanan diperbarui'
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-500 font-bold mt-0.5">→</span> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <span className="text-lg">💵</span>
                <div>
                  <p className="font-semibold">Metode Pembayaran: Tunai</p>
                  <p className="text-xs text-green-600 mt-0.5">Semua gaji dibayarkan secara tunai kepada karyawan</p>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setKonfirmasiModal(false)}>Batal</Button>
            {draftCount > 0 && (
              <Button variant="success" className="flex-1" icon={CreditCard} onClick={bayarSemua} loading={proses}>
                Bayar {draftCount} Karyawan
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
