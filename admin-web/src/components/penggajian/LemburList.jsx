import { usePolling } from '../../utils/pageActivity'
import { today } from '../../utils/autoFill'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Check, X, Download, Clock, Building2, Timer, TrendingUp, RefreshCw } from 'lucide-react'
import { Card, Button, Modal, Input, Select, FormField, Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect } from '../common'
import { FormSection, FieldRow, InfoBox, CalcPreview } from '../common/FormSection'
import { payrollService } from '../../services/payrollService'
import { projectService } from '../../services/projectService'
import { exportService } from '../../services/exportService'
import { useAuth } from '../../context/AuthContext'
import { useProject } from '../../context/ProjectContext'
import { formatTanggal, formatRupiah, getStatusColor, formatNamaStatus } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'
import supabase from '../../services/supabaseClient'

const AUTO_REFRESH_MS = 45000
let _syncDone = false

export default function LemburList() {
  const { user } = useAuth()
  const { activeProject } = useProject()
  const [data, setData]         = useState([])
  const [projects, setProjects] = useState([])
  const [allKaryawan, setAllKaryawan] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterProject, setFilterProject] = useState('')
  const [search, setSearch]     = useState('')
  const [syncing, setSyncing]   = useState(false) // dipakai auto-sync on mount

  const [form, setForm] = useState({
    project_id: '',
    karyawan_id: '',
    tanggal: today(),
    jam_mulai: '17:00',
    jam_selesai: '20:00',
    tarif_lembur: '',
    catatan: '',
  })

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const filters = {}
      if (filterStatus !== 'all') filters.status_persetujuan = filterStatus
      if (filterProject) filters.project_id = parseInt(filterProject)

      const [lemburData, projectData] = await Promise.all([
        payrollService.getLembur(filters),
        projectService.getProjects(),
      ])
      setData(lemburData)
      setProjects(projectData)
    } catch (e) { toast.error(e.message) } finally { if (!silent) setLoading(false) }
  }, [filterStatus, filterProject])

  useEffect(() => { load() }, [load])
  const requestLoad = usePolling(() => load(true), AUTO_REFRESH_MS)
  // Sync ketika presensi berubah (auto-lembur dibuat/dihapus dari presensi)
  useEffect(() => { const u = syncBus.on('presensi', () => requestLoad()); return u }, [requestLoad])

  // Realtime: auto-refresh ketika lembur atau presensi berubah (termasuk QR scan)
  useEffect(() => {
    const ch = supabase.channel('lembur-presensi-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lembur' },
        () => { setTimeout(() => requestLoad(), 500) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'presensi' },
        async (payload) => {
          // Presensi diupdate (mis. via QR scan) → resync auto-lembur untuk record tsb
          if (payload.new?.id) {
            try {
              await payrollService.resyncLemburForPresensi(payload.new.id)
            } catch {}
            setTimeout(() => requestLoad(), 800)
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'presensi' },
        async (payload) => {
          if (payload.new?.id) {
            try { await payrollService.resyncLemburForPresensi(payload.new.id) } catch {}
            setTimeout(() => requestLoad(), 800)
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load semua karyawan aktif sekali (tidak per-project)
  useEffect(() => {
    projectService.getKaryawan({ status_aktif: true }).then(rows => setAllKaryawan(rows || []))
  }, [])

  // Sync penuh 30 hari saat pertama kali mount (bersihkan duplikat lama + pastikan data presensi sinkron)
  useEffect(() => {
    const syncFull = async () => {
      try {
        const pad = n => String(n).padStart(2, '0')
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
        const dari = new Date(); dari.setDate(dari.getDate() - 30)
        await payrollService.syncAllAutoLembur(fmt(dari), fmt(new Date()))
      } catch {}
      load(true)
    }
    if (!_syncDone) {
      _syncDone = true
      syncFull()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const calcDurasi = (mulai, selesai) => {
    if (!mulai || !selesai) return 0
    const [h1, m1] = mulai.split(':').map(Number)
    const [h2, m2] = selesai.split(':').map(Number)
    const dur = (h2 * 60 + m2 - h1 * 60 - m1) / 60
    return Math.max(0, parseFloat(dur.toFixed(2)))
  }

  const onKaryawanChange = (id) => {
    const k = allKaryawan.find(k => k.id === parseInt(id))
    if (k) {
      const gajiHarian = parseFloat(k.gaji_harian_override || k.jabatan?.gaji_harian || 0)
      setForm(f => ({ ...f, karyawan_id: id, tarif_lembur: Math.round(gajiHarian / 8).toString() }))
    } else {
      setForm(f => ({ ...f, karyawan_id: id }))
    }
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ project_id: String(activeProject?.id || ''), karyawan_id: '', tanggal: today(), jam_mulai: '17:00', jam_selesai: '20:00', tarif_lembur: '', catatan: '' })
    setModal(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({ project_id: r.project_id || '', karyawan_id: r.karyawan_id, tanggal: r.tanggal, jam_mulai: r.jam_mulai, jam_selesai: r.jam_selesai, tarif_lembur: r.tarif_lembur, catatan: r.catatan || '' })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.karyawan_id) return toast.error('Pilih karyawan')
    if (!form.project_id) return toast.error('Pilih project terlebih dahulu')
    if (!form.tarif_lembur) return toast.error('Tarif lembur wajib diisi')
    try {
      const durasi = calcDurasi(form.jam_mulai, form.jam_selesai)
      if (durasi <= 0) return toast.error('Jam selesai harus setelah jam mulai')
      const payload = {
        project_id: parseInt(form.project_id),
        karyawan_id: parseInt(form.karyawan_id),
        tanggal: form.tanggal,
        jam_mulai: form.jam_mulai,
        jam_selesai: form.jam_selesai,
        durasi_jam: durasi,
        tarif_lembur: parseFloat(form.tarif_lembur),
        total_lembur: durasi * parseFloat(form.tarif_lembur),
        status_persetujuan: 'pending',
        catatan: form.catatan,
      }
      if (editing) {
        await payrollService.updateLembur(editing.id, payload)
        toast.success('Lembur diperbarui')
      } else {
        await payrollService.createLembur(payload)
        toast.success('Lembur diajukan — menunggu persetujuan')
      }
      syncBus.emitAll('lembur', 'gaji')
      setModal(false); load()
    } catch (e) { toast.error(e.message) }
  }

  const handleApprove = async (id) => {
    try { await payrollService.approveLembur(id, user?.id); syncBus.emitAll('lembur', 'gaji'); toast.success('Lembur disetujui'); load() }
    catch (e) { toast.error(e.message) }
  }
  const handleReject = async (id) => {
    try { await payrollService.rejectLembur(id); syncBus.emitAll('lembur', 'gaji'); toast.success('Lembur ditolak'); load() }
    catch (e) { toast.error(e.message) }
  }
  const handleDelete = async () => {
    try { await payrollService.deleteLembur(deleting.id); toast.success('Lembur dihapus'); setDeleting(null); load() }
    catch (e) { toast.error(e.message) }
  }

  const handleSinkron = async () => {
    setSyncing(true)
    try {
      // Sync auto-lembur dari presensi 30 hari terakhir
      const now = new Date()
      const dari = new Date(now); dari.setDate(dari.getDate() - 30)
      const pad = (n) => String(n).padStart(2,'0')
      const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
      const count = await payrollService.syncAllAutoLembur(fmt(dari), fmt(now))
      await load()
      toast.success(`Sinkron selesai — ${count} presensi diperiksa`)
    } catch (e) {
      toast.error('Gagal sinkron: ' + e.message)
    } finally { setSyncing(false) }
  }

  const filtered = data.filter(d => (d.karyawan?.nama_karyawan || '').toLowerCase().includes(search.toLowerCase()))
  const isHariKerja = (r) => r.catatan?.includes('Sudah dalam Gaji')
  const disetujui = data.filter(d => d.status_persetujuan === 'disetujui')
  const totalDisetujui = disetujui.filter(d => !isHariKerja(d)).reduce((s, l) => s + parseFloat(l.total_lembur || 0), 0)
  const totalJam      = disetujui.filter(d => !isHariKerja(d)).reduce((s, l) => s + parseFloat(l.durasi_jam || 0), 0)
  const hariKerjaCount = disetujui.filter(d => isHariKerja(d)).length
  const pending = data.filter(d => d.status_persetujuan === 'pending').length

  const durasi = calcDurasi(form.jam_mulai, form.jam_selesai)
  const totalLembur = durasi * parseFloat(form.tarif_lembur || 0)
  const karyawanFormList = allKaryawan

  return (
    <div className="space-y-4">
      <PageHeader title="Lembur" subtitle="Pengajuan & persetujuan lembur per project"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" icon={RefreshCw} loading={syncing} onClick={async () => {
              setSyncing(true)
              try {
                const pad = n => String(n).padStart(2,'0')
                const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
                const dari = new Date(); dari.setDate(dari.getDate() - 30)
                await payrollService.syncAllAutoLembur(fmt(dari), fmt(new Date()))
              } catch {}
              await load()
              setSyncing(false)
            }}>Refresh</Button>
            <Button variant="outline" size="sm" icon={Download}
              onClick={() => {
                const projName = filterProject
                  ? (projects.find(p => p.id === parseInt(filterProject))?.nama_project || 'Project')
                  : 'Semua Project'
                exportService.exportLemburPerProject(filtered, projName)
                  .then(() => toast.success('Excel diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              Excel
            </Button>
            <Button variant="outline" size="sm" icon={Download}
              onClick={() => {
                const projName = filterProject
                  ? (projects.find(p => p.id === parseInt(filterProject))?.nama_project || 'Project')
                  : 'Semua Project'
                exportService.exportLemburPDF(filtered, projName)
                  .then(() => toast.success('PDF diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              PDF
            </Button>
            <Button icon={Plus} onClick={openAdd}>Ajukan Lembur</Button>
          </div>
        } />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-xs text-amber-600 font-bold mb-1">Pending Approval</p>
          <p className="text-2xl font-bold text-amber-700">{pending}</p>
          <p className="text-xs text-amber-500 mt-0.5">menunggu persetujuan</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-green-600 font-bold mb-1">Total Lembur Dibayar</p>
          <p className="text-lg font-bold text-green-700">{formatRupiah(totalDisetujui)}</p>
          <p className="text-xs text-green-500 mt-0.5">lembur nyata (bukan hari kerja)</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-600 font-bold mb-1">Jam Lembur Nyata</p>
          <p className="text-lg font-bold text-blue-700">{totalJam.toFixed(1)} jam</p>
          <p className="text-xs text-blue-500 mt-0.5">di luar hari kerja penuh</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <p className="text-xs text-purple-600 font-bold mb-1">Hari Kerja Tambahan</p>
          <p className="text-2xl font-bold text-purple-700">{hariKerjaCount}</p>
          <p className="text-xs text-purple-500 mt-0.5">sudah masuk gaji pokok</p>
        </div>
      </div>

      <Card>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-40">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Cari Karyawan</label>
            <SearchBar value={search} onChange={setSearch} placeholder="Cari karyawan..." />
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
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Status</label>
            <DropdownSelect
              value={filterStatus}
              onChange={v => setFilterStatus(v)}
              className="w-auto"
              options={[
                { value: 'all', label: 'Semua' },
                { value: 'pending', label: 'Pending' },
                { value: 'disetujui', label: 'Disetujui' },
                { value: 'ditolak', label: 'Ditolak' },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        {loading && data.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
            Memperbarui...
          </div>
        )}
        <Table loading={loading && data.length === 0} data={filtered} columns={[
          { header: 'Karyawan', render: r => (
            <div>
              <p className="font-medium text-sm">{r.karyawan?.nama_karyawan}</p>
              <p className="text-xs text-gray-400">{r.karyawan?.jabatan?.nama_jabatan}</p>
            </div>
          )},
          { header: 'Project', render: r => r.project
            ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{r.project?.nama_project}</span>
            : <span className="text-gray-400 text-xs">-</span>
          },
          { header: 'Tanggal', render: r => <span className="text-sm">{formatTanggal(r.tanggal)}</span> },
          { header: 'Jam Kerja', render: r => (
            <div>
              <p className="text-sm font-medium">{r.jam_mulai?.slice(0,5)} – {r.jam_selesai?.slice(0,5)}</p>
              <p className="text-xs text-blue-600 font-bold">{r.durasi_jam} jam</p>
            </div>
          )},
          { header: 'Sumber', render: r => {
            if (r.catatan?.includes('Sudah dalam Gaji'))
              return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Hari Kerja</span>
            if (r.catatan?.startsWith('Otomatis'))
              return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">Auto</span>
            return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-medium">Manual</span>
          }},
          { header: 'Tarif/Jam', render: r => <span className="text-xs text-gray-500">{formatRupiah(r.tarif_lembur)}</span> },
          { header: 'Total', render: r => <span className="font-bold text-blue-700">{formatRupiah(r.total_lembur)}</span> },
          { header: 'Status', render: r => (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status_persetujuan)}`}>
              {formatNamaStatus(r.status_persetujuan)}
            </span>
          )},
          { header: 'Aksi', className: 'w-28', render: r => (
            <div className="flex gap-1">
              {r.status_persetujuan === 'pending' && (
                <>
                  <button onClick={() => handleApprove(r.id)} className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Setujui"><Check size={14}/></button>
                  <button onClick={() => handleReject(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Tolak"><X size={14}/></button>
                  <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Edit2 size={14}/></button>
                </>
              )}
              <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={14}/></button>
            </div>
          )},
        ]} />
      </Card>

      {/* ── MODAL FORM LEMBUR ── */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Lembur' : 'Ajukan Lembur'} size="sm">
        <div className="space-y-5">

          <InfoBox type="info" title="Lembur Manual">
            Pengajuan lembur ini memerlukan persetujuan sebelum masuk ke perhitungan gaji.
            Tarif otomatis dari gaji harian ÷ 8.
          </InfoBox>

          {/* Project & Karyawan */}
          <FormSection title="Project & Karyawan" icon={Building2}>
            <FormField label="Karyawan" required>
              <DropdownSelect
                value={form.karyawan_id}
                onChange={v => onKaryawanChange(v)}
                disabled={!!editing}
                options={[
                  { value: '', label: '-- Pilih Karyawan --' },
                  ...karyawanFormList.map(k => ({ value: String(k.id), label: `${k.nama_karyawan} — ${k.jabatan?.nama_jabatan}` })),
                ]}
              />
            </FormField>

            <FormField label="Project" required help="Pilih project tempat lembur dilakukan">
              <DropdownSelect
                value={form.project_id}
                onChange={v => setForm(f => ({ ...f, project_id: v, tarif_lembur: f.tarif_lembur }))}
                disabled={!!editing}
                options={[
                  { value: '', label: '-- Pilih Project --' },
                  ...projects.filter(p => p.status_project === 'aktif').map(p => ({ value: String(p.id), label: `${p.nama_project} (${p.kode_project})` })),
                ]}
              />
            </FormField>
          </FormSection>

          {/* Waktu Lembur */}
          <FormSection title="Waktu Lembur" icon={Timer}>
            <FormField label="Tanggal Lembur" required>
              <Input type="date" value={form.tanggal} onChange={e => setForm(f => ({ ...f, tanggal: e.target.value }))} />
            </FormField>

            <FormField label="Jam Mulai" help="Waktu mulai lembur">
              <Input type="time" value={form.jam_mulai} onChange={e => setForm(f => ({ ...f, jam_mulai: e.target.value }))} />
            </FormField>

            <FormField label="Jam Selesai" help="Waktu selesai lembur">
              <Input type="time" value={form.jam_selesai} onChange={e => setForm(f => ({ ...f, jam_selesai: e.target.value }))} />
            </FormField>

            <FormField label="Tarif per Jam (Rp)" required help="Otomatis dari gaji harian ÷ 8 — bisa diubah manual">
              <Input type="number" value={form.tarif_lembur}
                onChange={e => setForm(f => ({ ...f, tarif_lembur: e.target.value }))}
                placeholder="Contoh: 25000" min={0} />
            </FormField>
          </FormSection>

          {/* Preview kalkulasi */}
          {durasi > 0 && form.tarif_lembur && (
            <CalcPreview
              rows={[
                ['Jam Mulai – Selesai', `${form.jam_mulai} – ${form.jam_selesai}`],
                ['Durasi Lembur', `${durasi} jam`],
                ['Tarif per Jam', formatRupiah(form.tarif_lembur)],
              ]}
              total={formatRupiah(totalLembur)}
              totalLabel="Total Upah Lembur"
            />
          )}

          {/* Catatan */}
          <FormSection title="Keterangan" icon={Clock}>
            <FormField label="Catatan Pekerjaan" help="Deskripsikan pekerjaan lembur yang dilakukan">
              <textarea className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                rows={2} value={form.catatan}
                onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))}
                placeholder="Contoh: pengerjaan pondasi overtime..." />
            </FormField>
          </FormSection>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Batal</Button>
            <Button className="flex-1" onClick={handleSave}>{editing ? 'Simpan Perubahan' : 'Ajukan Lembur'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleting} title="Hapus Lembur" message="Hapus data lembur ini?"
        onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  )
}
