import { usePolling } from '../../utils/pageActivity'
import { today } from '../../utils/autoFill'
import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Edit2, Trash2, RefreshCw, Download,
  CheckCircle, XCircle, Clock, Users, ChevronLeft, ChevronRight, Building2
} from 'lucide-react'
import { Card, Button, Modal, Input, Select, FormField, Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect } from '../common'
import { FormSection, FieldRow, InfoBox } from '../common/FormSection'
import { payrollService } from '../../services/payrollService'
import { projectService } from '../../services/projectService'
import { useProject } from '../../context/ProjectContext'
import { exportService } from '../../services/exportService'
import { formatTanggal, formatPresensiStatus, getPresensiStatusColor } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'
import supabase from '../../services/supabaseClient'

const AUTO_REFRESH_MS = 30000

const isToday = (tgl) => tgl === today()
const isTanggalLewat = (tgl) => { const t = new Date(tgl+'T00:00:00'); const n = new Date(); n.setHours(0,0,0,0); return t < n }
const addDays = (tgl, n) => {
  const d = new Date(tgl+'T00:00:00')
  d.setDate(d.getDate()+n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const fmtRp = (v) => v > 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : null

export default function PresensiList() {
  const { activeProject } = useProject()
  const [data,           setData]           = useState([])
  const [karyawan,       setKaryawan]       = useState([])   // Karyawan aktif (scope terpilih) untuk tracking kehadiran
  const [allKaryawan,    setAllKaryawan]    = useState([])   // Semua karyawan aktif untuk dropdown form
  const [projects,       setProjects]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [modal,          setModal]          = useState(false)
  const [editing,        setEditing]        = useState(null)
  const [deleting,       setDeleting]       = useState(null)
  const [search,         setSearch]         = useState('')
  const [filterStatus,   setFilterStatus]   = useState('all')
  const [filterTanggal,  setFilterTanggal]  = useState(today())
  const [filterProject,  setFilterProject]  = useState('')
  const [saving,         setSaving]         = useState(false)
  const [lastRefresh,    setLastRefresh]    = useState(null)
  const autoMarkDone     = useRef(new Set())

  const [form, setForm] = useState({
    project_id: '', karyawan_id: '', tanggal: today(),
    status_kehadiran: 'hadir', jam_masuk: '07:00', jam_keluar: '',
    uang_makan: '', uang_transport: '', upah_luar_kota: '', catatan: '',
  })

  // Load semua karyawan aktif untuk dropdown form (tidak bergantung project)
  useEffect(() => {
    projectService.getKaryawan({ status_aktif: true }).then(rows => setAllKaryawan(rows || []))
  }, [])

  // ─── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const scopeProjectId = filterProject ? parseInt(filterProject) : null
      let q = supabase.from('presensi').select(`
        id, karyawan_id, project_id, tanggal,
        jam_masuk, jam_keluar, durasi_jam,
        status_kehadiran, uang_makan, uang_transport, upah_luar_kota,
        catatan, metode_input,
        karyawan:karyawan_id(id, nama_karyawan, nik, jabatan:jabatan_id(nama_jabatan)),
        project:project_id(nama_project, kode_project)
      `).eq('tanggal', filterTanggal).order('karyawan_id')

      if (scopeProjectId) q = q.eq('project_id', scopeProjectId)

      const [presRes, projRes, karRes] = await Promise.all([
        q,
        supabase.from('project').select('id, nama_project, kode_project, status_project').order('nama_project'),
        projectService.getKaryawan({ status_aktif: true }),  // selalu semua karyawan aktif
      ])

      const karList = karRes || []

      setData(presRes.data || [])
      setKaryawan(karList)
      setProjects(projRes.data || [])
      setLastRefresh(new Date())
      return { presensiData: presRes.data || [], karyawanList: karList }
    } catch (e) {
      if (!silent) toast.error('Gagal memuat: ' + e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filterTanggal, filterProject])

  useEffect(() => {
    const run = async () => {
      const result = await load()
      if (!result) return
      const { presensiData, karyawanList } = result
      if (isTanggalLewat(filterTanggal) && !autoMarkDone.current.has(filterTanggal)) {
        autoMarkDone.current.add(filterTanggal)
        autoMarkAlfa(presensiData, karyawanList)
      }
    }
    run()
  }, [load])

  // Polling + realtime hanya bekerja saat tab terlihat & halaman aktif
  const requestLoad = usePolling(() => load(true), AUTO_REFRESH_MS)

  // Sinkron langsung saat mandor scan presensi dari mobile, tanpa perlu refresh/login ulang
  useEffect(() => {
    const channel = supabase
      .channel('presensi-list-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presensi' }, () => requestLoad())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [requestLoad])


  const autoMarkAlfa = async (prs, karList) => {
    const ids = new Set(prs.map(d => d.karyawan_id))
    const belum = karList.filter(k => !ids.has(k.id))
    if (!belum.length) return
    await Promise.allSettled(belum.map(k =>
      payrollService.insertPresensiIfNotExists({
        karyawan_id: k.id, tanggal: filterTanggal,
        status_kehadiran: 'alfa', metode_input: 'otomatis',
        catatan: 'Otomatis: tidak tercatat',
      })
    ))
    load(true)
  }

  // ─── Helpers ────────────────────────────────────────────────────────────
  const calcDurasi = (masuk, keluar) => {
    if (!masuk || !keluar) return null
    const [hm, mm] = masuk.split(':').map(Number)
    const [hk, mk] = keluar.split(':').map(Number)
    const dur = ((hk * 60 + mk) - (hm * 60 + mm)) / 60
    return dur > 0 ? Math.round(dur * 10) / 10 : null
  }

  const openAdd = () => {
    setEditing(null)
    setForm({
      project_id: filterProject || String(activeProject?.id || ''), karyawan_id: '', tanggal: filterTanggal,
      status_kehadiran: 'hadir', jam_masuk: '07:00', jam_keluar: '',
      uang_makan: '', uang_transport: '', upah_luar_kota: '', catatan: '',
    })
    setModal(true)
  }

  const openInputForKaryawan = (k) => {
    setEditing(null)
    setForm({
      project_id: filterProject || String(activeProject?.id || ''),
      karyawan_id: String(k.id),
      tanggal: filterTanggal,
      status_kehadiran: 'hadir', jam_masuk: '07:00', jam_keluar: '',
      uang_makan: '', uang_transport: '', upah_luar_kota: '', catatan: '',
    })
    setModal(true)
  }

  const openEdit = (d) => {
    setEditing(d)
    setForm({
      project_id: d.project_id || '',
      karyawan_id: d.karyawan_id,
      tanggal: d.tanggal,
      status_kehadiran: d.status_kehadiran === 'hadir' ? 'hadir' : 'tidak_hadir',
      jam_masuk:  d.jam_masuk  || '07:00',
      jam_keluar: d.jam_keluar || '',
      uang_makan:     d.uang_makan    || '',
      uang_transport: d.uang_transport || '',
      upah_luar_kota: d.upah_luar_kota || '',
      catatan: d.catatan || '',
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.karyawan_id) return toast.error('Pilih karyawan')
    if (!form.tanggal)     return toast.error('Tanggal wajib diisi')
    setSaving(true)
    try {
      const durasi = form.status_kehadiran === 'hadir' && form.jam_masuk && form.jam_keluar
        ? calcDurasi(form.jam_masuk, form.jam_keluar) : null

      await payrollService.upsertPresensi({
        project_id:       form.project_id ? parseInt(form.project_id) : null,
        karyawan_id:      parseInt(form.karyawan_id),
        tanggal:          form.tanggal,
        jam_masuk:        form.status_kehadiran === 'hadir' ? (form.jam_masuk || '07:00') : null,
        jam_keluar:       form.status_kehadiran === 'hadir' && form.jam_keluar ? form.jam_keluar : null,
        durasi_jam:       durasi,
        status_kehadiran: form.status_kehadiran === 'hadir' ? 'hadir' : 'alfa',
        uang_makan:       form.status_kehadiran === 'hadir' && form.uang_makan ? parseFloat(form.uang_makan) : null,
        uang_transport:   form.status_kehadiran === 'hadir' && form.uang_transport ? parseFloat(form.uang_transport) : null,
        upah_luar_kota:   form.status_kehadiran === 'hadir' && form.upah_luar_kota ? parseFloat(form.upah_luar_kota) : 0,
        catatan:          form.catatan,
        metode_input:     'manual',
      })

      syncBus.emitAll('presensi', 'gaji', 'lembur')
      toast.success(editing ? '✓ Presensi diperbarui' : '✓ Presensi disimpan')
      setModal(false)
      load()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await payrollService.deletePresensi(deleting.id)
      syncBus.emitAll('presensi', 'gaji')
      toast.success('Presensi dihapus')
      setDeleting(null); load()
    } catch (e) { toast.error(e.message) }
  }


  // ─── Derived state ───────────────────────────────────────────────────────
  const sudahLewat    = isTanggalLewat(filterTanggal)
  const isHariIni     = isToday(filterTanggal)
  const tercatatIds   = new Set(data.map(d => d.karyawan_id))
  const tidakTercatat = karyawan.filter(k => !tercatatIds.has(k.id))
  const selesaiCount       = data.filter(d => d.status_kehadiran === 'hadir').length
  const sedangBekerjaCount = data.filter(d => d.status_kehadiran === 'belum_lengkap' && d.jam_masuk).length
  const tidakHadirDB       = data.filter(d => d.status_kehadiran !== 'hadir' && !(d.status_kehadiran === 'belum_lengkap' && d.jam_masuk)).length

  const filtered = data.filter(d => {
    const name = d.karyawan?.nama_karyawan?.toLowerCase() || ''
    const matchSearch = name.includes(search.toLowerCase())
    const displayStatus = d.status_kehadiran === 'hadir' ? 'hadir'
      : (d.status_kehadiran === 'belum_lengkap' && d.jam_masuk) ? 'belum_lengkap' : 'tidak_hadir'
    const matchStatus = filterStatus === 'all' || filterStatus === displayStatus
    return matchSearch && matchStatus
  })

  // Baris virtual untuk karyawan belum tercatat (tampil di tabel sebagai "Belum Input" / "Tidak Hadir")
  const buatBarisVirtual = k => ({
    _virtual: true,
    id: `v_${k.id}`,
    karyawan_id: k.id,
    karyawan: k,
    project: null,
    tanggal: filterTanggal,
    jam_masuk: null, jam_keluar: null, durasi_jam: null,
    status_kehadiran: sudahLewat ? 'alfa' : 'belum_input',
    uang_makan: null, uang_transport: null, upah_luar_kota: null,
    catatan: null, metode_input: null,
  })
  const virtualRows = tidakTercatat
    .filter(k => {
      const name = k.nama_karyawan?.toLowerCase() || ''
      const matchSearch = name.includes(search.toLowerCase())
      const matchStatus = filterStatus === 'all' || filterStatus === 'tidak_hadir'
      return matchSearch && matchStatus
    })
    .map(buatBarisVirtual)

  const tableRows = [...filtered, ...virtualRows]

  // Laporan (Excel/PDF) selalu lengkap untuk tanggal terpilih: semua presensi + karyawan yang belum
  // tercatat — tidak ikut terpotong oleh kotak pencarian/filter status di layar.
  const bukaLaporan = (jenis) => {
    const semua = [...data, ...tidakTercatat.map(buatBarisVirtual)]
    const namaProject = filterProject
      ? (projects.find(p => String(p.id) === String(filterProject))?.nama_project || 'Project terpilih')
      : 'Semua Project'
    const aksi = jenis === 'excel' ? exportService.exportPresensiExcelFull : exportService.exportPresensiPDF
    aksi(semua, formatTanggal(filterTanggal), { projectName: namaProject })
      .then(() => toast.success(jenis === 'excel' ? 'Excel diunduh' : 'PDF diunduh'))
      .catch(e => toast.error('Gagal export: ' + e.message))
  }

  const durasi = calcDurasi(form.jam_masuk, form.jam_keluar)

  return (
    <div className="space-y-5">
      <PageHeader title="Presensi"
        subtitle={`Semua Karyawan · ${formatTanggal(filterTanggal)}${isHariIni ? ' · (Hari ini)' : sudahLewat ? ' · (Hari lalu)' : ''}`}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => load()}>Refresh</Button>
            <Button variant="outline" size="sm" icon={Download} onClick={() => bukaLaporan('excel')}>
              Excel
            </Button>
            <Button variant="outline" size="sm" icon={Download} onClick={() => bukaLaporan('pdf')}>
              PDF
            </Button>
            <Button icon={Plus} onClick={openAdd}>Input Presensi</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Selesai',        val: selesaiCount,      Icon: CheckCircle, bg: 'bg-green-50 border-green-100',  num: 'text-green-700'  },
          { label: 'Sedang Bekerja', val: sedangBekerjaCount, Icon: Clock, bg: 'bg-blue-50 border-blue-100', num: 'text-blue-700' },
          { label: 'Tidak Hadir',    val: tidakHadirDB + (sudahLewat ? tidakTercatat.length : 0), Icon: XCircle, bg: 'bg-red-50 border-red-100', num: 'text-red-700' },
          { label: isHariIni ? 'Belum Input' : 'Tidak Tercatat', val: tidakTercatat.length, Icon: Clock,
            bg: tidakTercatat.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100',
            num: tidakTercatat.length > 0 ? 'text-amber-700' : 'text-gray-400' },
          { label: 'Total Karyawan', val: karyawan.length,   Icon: Users,  bg: 'bg-blue-50 border-blue-100',   num: 'text-blue-700'  },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-4 flex items-center gap-3 ${s.bg}`}>
            <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center flex-shrink-0 shadow-sm">
              <s.Icon size={18} className={s.num.replace('text-','text-').replace('700','500')} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">{s.label}</p>
              <p className={`text-2xl font-extrabold ${s.num}`}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>


      {lastRefresh && (
        <p className="text-xs text-gray-400 text-right flex items-center justify-end gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
          Diperbarui: {lastRefresh.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
        </p>
      )}

      {/* Filter */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Tanggal</label>
            <div className="flex items-center gap-1">
              <button onClick={() => setFilterTanggal(addDays(filterTanggal,-1))} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={14}/></button>
              <Input type="date" value={filterTanggal} max={today()} onChange={e => { if (e.target.value <= today()) setFilterTanggal(e.target.value) }} className="w-auto" />
              <button onClick={() => { if (!isHariIni) setFilterTanggal(addDays(filterTanggal,+1)) }} disabled={isHariIni} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"><ChevronRight size={14}/></button>
              {!isHariIni && <button onClick={() => setFilterTanggal(today())} className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg border border-blue-200">Hari Ini</button>}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Filter Project</label>
            <DropdownSelect
              value={filterProject}
              onChange={v => setFilterProject(v)}
              className="w-auto"
              options={[
                { value: '', label: 'Semua Project' },
                ...projects.map(p => ({ value: String(p.id), label: p.nama_project })),
              ]}
            />
          </div>
          <div className="flex-1 min-w-40">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Cari Karyawan</label>
            <SearchBar value={search} onChange={setSearch} placeholder="Nama karyawan..." />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Status</label>
            <DropdownSelect
              value={filterStatus}
              onChange={v => setFilterStatus(v)}
              className="w-auto"
              options={[
                { value: 'all', label: 'Semua Status' },
                { value: 'hadir', label: '✓ Selesai' },
                { value: 'belum_lengkap', label: '● Sedang Bekerja' },
                { value: 'tidak_hadir', label: '✗ Tidak Hadir' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Tabel */}
      <Card>
        {loading && data.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
            Memperbarui...
          </div>
        )}
        <Table loading={loading && data.length === 0} data={tableRows} emptyMessage="Tidak ada data presensi."
          columns={[
            { header: 'Karyawan', render: r => (
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold text-white flex-shrink-0 ${r._virtual ? 'bg-gradient-to-br from-gray-300 to-gray-400' : 'bg-gradient-to-br from-blue-400 to-blue-600'}`}>
                  {r.karyawan?.nama_karyawan?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-sm">{r.karyawan?.nama_karyawan}</p>
                  <p className="text-xs text-gray-400">{r.karyawan?.jabatan?.nama_jabatan}</p>
                </div>
              </div>
            )},
            { header: 'Project', render: r => r.project
              ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{r.project?.nama_project}</span>
              : <span className="text-xs text-gray-300">-</span>
            },
            { header: 'Jam', render: r => r.jam_masuk ? (
              <div className="text-xs">
                <span className="text-gray-600">{r.jam_masuk?.slice(0,5) || '—'}{r.jam_keluar ? ` → ${r.jam_keluar.slice(0,5)}` : ''}</span>
                {r.durasi_jam && (
                  <span className={`ml-1 font-bold ${parseFloat(r.durasi_jam) >= 16 ? 'text-orange-600' : parseFloat(r.durasi_jam) > 8 ? 'text-amber-600' : 'text-blue-500'}`}>
                    ({r.durasi_jam}j{parseFloat(r.durasi_jam) >= 16 ? ' = '+Math.floor(parseFloat(r.durasi_jam)/8)+' hari' : parseFloat(r.durasi_jam) > 8 ? ' + lembur' : ''})
                  </span>
                )}
              </div>
            ) : <span className="text-xs text-gray-300">—</span> },
            { header: 'Status', render: r => {
              if (r.status_kehadiran === 'belum_input')
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">○ Belum Input</span>
              const label = formatPresensiStatus(r.status_kehadiran, r.jam_masuk)
              const icon = label === 'Selesai' ? '✓' : label === 'Sedang Bekerja' ? '●' : '✗'
              return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${getPresensiStatusColor(r.status_kehadiran, r.jam_masuk)}`}>{icon} {label}</span>
            }},
            { header: 'Sumber', render: r => r._virtual ? <span className="text-xs text-gray-300">—</span> : (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.metode_input==='qr_code'?'bg-blue-100 text-blue-600':r.metode_input==='otomatis'?'bg-gray-100 text-gray-400':'bg-green-100 text-green-600'}`}>
                {r.metode_input==='qr_code'?'QR Scan':r.metode_input==='otomatis'?'Otomatis':'Manual'}
              </span>
            )},
            { header: 'Makan',     render: r => r.uang_makan      > 0 ? <span className="text-xs text-green-600 font-medium">{fmtRp(r.uang_makan)}</span>      : <span className="text-xs text-gray-300">-</span> },
            { header: 'Transport', render: r => r.uang_transport  > 0 ? <span className="text-xs text-green-600 font-medium">{fmtRp(r.uang_transport)}</span>  : <span className="text-xs text-gray-300">-</span> },
            { header: 'Luar Kota', render: r => r.upah_luar_kota  > 0 ? <span className="text-xs text-purple-600 font-medium">{fmtRp(r.upah_luar_kota)}</span> : <span className="text-xs text-gray-300">-</span> },
            { header: 'Aksi', className: 'w-20', render: r => r._virtual ? (
              <button onClick={() => openInputForKaryawan(r.karyawan)}
                className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-bold border border-blue-200">
                + Input
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)} className="p-2 rounded-xl hover:bg-blue-50 text-blue-500"><Edit2 size={13}/></button>
                <button onClick={() => setDeleting(r)} className="p-2 rounded-xl hover:bg-red-50 text-red-400"><Trash2 size={13}/></button>
              </div>
            )},
          ]}
        />
      </Card>


      {/* ── MODAL INPUT / EDIT PRESENSI ─────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Presensi' : 'Input Presensi'} size="sm">
        <div className="space-y-5">

          {/* Project & Karyawan */}
          <FormSection title="Project & Karyawan" icon={Building2}>
            <FormField label="Karyawan" required>
              <DropdownSelect
                value={form.karyawan_id}
                onChange={v => setForm(f => ({ ...f, karyawan_id: v }))}
                options={[
                  { value: '', label: '-- Pilih Karyawan --' },
                  ...allKaryawan.map(k => ({ value: String(k.id), label: `${k.nama_karyawan} — ${k.jabatan?.nama_jabatan}` })),
                ]}
              />
            </FormField>

            <FormField label="Project" help="Pilih project tempat karyawan bekerja hari ini (opsional untuk laporan)">
              <DropdownSelect
                value={form.project_id}
                onChange={v => setForm(f => ({ ...f, project_id: v }))}
                options={[
                  { value: '', label: '-- Pilih Project (Opsional) --' },
                  ...projects.filter(p => p.status_project === 'aktif').map(p => ({ value: String(p.id), label: `${p.nama_project} (${p.kode_project})` })),
                ]}
              />
            </FormField>

            <FormField label="Tanggal" required>
              <Input type="date" value={form.tanggal} max={today()} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} />
            </FormField>
          </FormSection>

          {/* Status */}
          <FormSection title="Status Kehadiran">
            <div className="grid grid-cols-2 gap-3">
              {[
                { val: 'hadir',       emoji: '✅', label: 'Hadir',       cls: 'border-green-400 bg-green-50 text-green-700' },
                { val: 'tidak_hadir', emoji: '❌', label: 'Tidak Hadir', cls: 'border-red-400 bg-red-50 text-red-700' },
              ].map(opt => (
                <button key={opt.val} type="button" onClick={() => setForm(f => ({ ...f, status_kehadiran: opt.val }))}
                  className={`py-4 rounded-2xl border-2 text-sm font-bold transition-all flex flex-col items-center gap-1.5 ${
                    form.status_kehadiran === opt.val ? `${opt.cls} scale-[1.03] shadow-lg` : 'border-gray-200 text-gray-400 hover:border-gray-300 bg-white'
                  }`}>
                  <span className="text-2xl">{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </FormSection>

          {/* Jam & Tunjangan — hanya kalau hadir */}
          {form.status_kehadiran === 'hadir' && (
            <FormSection title="Jam Kerja & Tunjangan" subtitle="Jam >8 = lembur otomatis · Jam ≥16 = 2 hari kerja">
              <FormField label="Jam Masuk" help="Waktu mulai bekerja">
                <Input type="time" value={form.jam_masuk} onChange={e => setForm(f => ({ ...f, jam_masuk: e.target.value }))} />
              </FormField>

              <FormField label="Jam Keluar" help=">8 jam = lembur otomatis terbuat">
                <Input type="time" value={form.jam_keluar} onChange={e => setForm(f => ({ ...f, jam_keluar: e.target.value }))} />
              </FormField>

              {durasi !== null && durasi > 0 && (
                <div className={`rounded-xl px-4 py-2.5 text-sm font-medium border ${
                  durasi >= 16 ? 'bg-orange-50 border-orange-200 text-orange-700' :
                  durasi > 8   ? 'bg-amber-50  border-amber-200  text-amber-700'  :
                                 'bg-blue-50   border-blue-200   text-blue-700'
                }`}>
                  ⏱ Total kerja: <strong>{durasi} jam</strong>
                  {durasi >= 16 && <span className="ml-2">→ <strong>{Math.floor(durasi/8)} hari kerja</strong></span>}
                  {durasi > 8 && durasi < 16 && <span className="ml-2">→ 8 jam normal + <strong>{(durasi-8).toFixed(1)} jam lembur (otomatis terbuat)</strong></span>}
                </div>
              )}

              <FormField label="Uang Makan (Rp)" help="Kosong = tidak ada / pakai default">
                <Input type="number" value={form.uang_makan} onChange={e => setForm(f => ({ ...f, uang_makan: e.target.value }))} placeholder="0" min={0} />
              </FormField>

              <FormField label="Uang Transport (Rp)" help="Kosong = tidak ada / pakai default">
                <Input type="number" value={form.uang_transport} onChange={e => setForm(f => ({ ...f, uang_transport: e.target.value }))} placeholder="0" min={0} />
              </FormField>

              <FormField label="Upah Luar Kota (Rp)" help="Isi jika karyawan bekerja di luar kota — 0 jika tidak ada">
                <Input type="number" value={form.upah_luar_kota} onChange={e => setForm(f => ({ ...f, upah_luar_kota: e.target.value }))} placeholder="0" min={0} />
              </FormField>
            </FormSection>
          )}

          <FormField label="Catatan / Keterangan" help="Opsional">
            <textarea className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              rows={2} value={form.catatan} onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Opsional..." />
          </FormField>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Batal</Button>
            <Button className="flex-1" onClick={handleSave} loading={saving}>
              {editing ? 'Simpan Perubahan' : 'Simpan Presensi'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleting} title="Hapus Presensi"
        message={`Hapus presensi ${deleting?.karyawan?.nama_karyawan} tanggal ${formatTanggal(deleting?.tanggal)}?`}
        onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  )
}
