import { usePolling } from '../../utils/pageActivity'
import { today } from '../../utils/autoFill'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, Download, CheckCircle, Clock, AlertTriangle, RefreshCw, CreditCard, Users, Building2 } from 'lucide-react'
import { Card, Button, Modal, Input, Select, FormField, Table, PageHeader, ConfirmDialog, SearchBar, AlertInPage, DropdownSelect } from '../common'
import { FormSection, FieldRow, InfoBox, CalcPreview } from '../common/FormSection'
import { payrollService } from '../../services/payrollService'
import { projectService } from '../../services/projectService'
import { exportService } from '../../services/exportService'
import { useProject } from '../../context/ProjectContext'
import { formatTanggal, formatRupiah } from '../../utils/formatters'
import { syncBus } from '../../utils/syncBus'
import supabase from '../../services/supabaseClient'

const AUTO_REFRESH_MS = 45000

function StatusBadge({ kasbon, gajiTerakhir }) {
  if (kasbon.status_lunas)
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircle size={11}/> Lunas</span>
  if (!kasbon.status_lunas && gajiTerakhir === 0)
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200"><Clock size={11}/> Menunggu Gaji</span>
  return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200"><AlertTriangle size={11}/> Outstanding</span>
}

export default function KasbonList() {
  const { activeProject } = useProject()
  const [data, setData]         = useState([])
  const [gajiMap, setGajiMap]   = useState({})
  const [projects, setProjects] = useState([])
  const [allKaryawan, setAllKaryawan] = useState([]) // semua karyawan aktif
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [konfirmasiLunas, setKonfirmasiLunas] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterProject, setFilterProject] = useState('')
  const [search, setSearch]     = useState('')
  const [saving, setSaving]     = useState(false)

  const [form, setForm] = useState({
    project_id: '',
    karyawan_id: '',
    jumlah_kasbon: '',
    tanggal_kasbon: today(),
    catatan: '',
  })

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const filters = {}
      if (filterStatus === 'outstanding') filters.status_lunas = false
      else if (filterStatus === 'lunas') filters.status_lunas = true
      if (filterProject) filters.project_id = parseInt(filterProject)

      const [kasbonData, projectData] = await Promise.all([
        payrollService.getKasbon(filters),
        projectService.getProjects(),
      ])
      setData(kasbonData)
      setProjects(projectData)

      const ids = kasbonData.filter(k => !k.status_lunas).map(k => k.karyawan_id)
      if (ids.length > 0) {
        const { data: gajiData } = await supabase
          .from('rekap_gaji_mingguan').select('karyawan_id, gaji_bersih')
          .in('karyawan_id', ids).eq('status', 'dibayar').order('periode_mulai', { ascending: false })
        const gMap = {}
        ids.forEach(id => { gMap[id] = 0 })
        gajiData?.forEach(g => { if (gMap[g.karyawan_id] === 0) gMap[g.karyawan_id] = parseFloat(g.gaji_bersih || 0) })
        setGajiMap(gMap)
      }
    } catch (e) {
      if (!silent) toast.error(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filterStatus, filterProject])

  useEffect(() => { load() }, [load])
  const requestLoad = usePolling(() => load(true), AUTO_REFRESH_MS)
  useEffect(() => { const u = syncBus.on('gaji', () => requestLoad()); return u }, [requestLoad])

  // Load semua karyawan aktif sekali (tidak per-project)
  useEffect(() => {
    projectService.getKaryawan({ status_aktif: true }).then(rows => setAllKaryawan(rows || []))
  }, [])

  const openAdd = () => {
    setForm({ project_id: String(activeProject?.id || ''), karyawan_id: '', jumlah_kasbon: '', tanggal_kasbon: today(), catatan: '' })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.karyawan_id) return toast.error('Pilih karyawan')
    if (!form.project_id) return toast.error('Pilih project terlebih dahulu')
    if (!form.jumlah_kasbon || parseFloat(form.jumlah_kasbon) <= 0) return toast.error('Jumlah kasbon harus lebih dari 0')
    setSaving(true)
    try {
      await payrollService.createKasbon({
        project_id: parseInt(form.project_id),
        karyawan_id: parseInt(form.karyawan_id),
        jumlah_kasbon: parseFloat(form.jumlah_kasbon),
        sisa_kasbon: parseFloat(form.jumlah_kasbon),
        tanggal_kasbon: form.tanggal_kasbon,
        catatan: form.catatan,
        metode_pembayaran: 'potong_gaji',
        status_lunas: false,
      })
      toast.success('✓ Kasbon ditambahkan')
      setModal(false)
      syncBus.emitAll('kasbon', 'gaji')
      load()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const handleLunas = async () => {
    try {
      const result = await payrollService.tandaiLunas(konfirmasiLunas.id)
      toast.success('Kasbon ditandai lunas')
      if (result._peringatan) setTimeout(() => toast(result._peringatan, { icon: '⚠️', duration: 7000 }), 500)
      setKonfirmasiLunas(null); load()
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    try {
      await payrollService.deleteKasbon(deleting.id)
      toast.success('Kasbon dihapus')
      setDeleting(null); load()
    } catch (e) { toast.error(e.message) }
  }

  const filtered = data.filter(d =>
    (d.karyawan?.nama_karyawan || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.karyawan?.nik || '').includes(search)
  )

  const totalOutstanding = data.filter(d => !d.status_lunas).reduce((s, k) => s + parseFloat(k.sisa_kasbon || 0), 0)
  const totalKasbon = data.reduce((s, k) => s + parseFloat(k.jumlah_kasbon || 0), 0)
  const totalTerbayar = totalKasbon - totalOutstanding
  const pendingCount = data.filter(d => !d.status_lunas && gajiMap[d.karyawan_id] === 0).length

  const karyawanFormList = allKaryawan

  return (
    <div className="space-y-5">
      <PageHeader title="Kasbon" subtitle="Pinjaman karyawan — dipotong otomatis dari gaji"
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => load()}>Refresh</Button>
            <Button variant="outline" size="sm" icon={Download}
              onClick={() => {
                exportService.exportKasbonExcel(filtered)
                  .then(() => toast.success('Excel diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              Excel
            </Button>
            <Button variant="outline" size="sm" icon={Download}
              onClick={() => {
                exportService.exportKasbonPDF(filtered)
                  .then(() => toast.success('PDF diunduh'))
                  .catch(e => toast.error('Gagal export: ' + e.message))
              }}>
              PDF
            </Button>
            <Button icon={Plus} onClick={openAdd}>Tambah Kasbon</Button>
          </div>
        }
      />

      {pendingCount > 0 && (
        <AlertInPage type="pending" title={`${pendingCount} kasbon menunggu pembayaran gaji berikutnya`}
          message="Kasbon akan terpotong otomatis saat gaji mingguan diproses." />
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Outstanding', val: formatRupiah(totalOutstanding), color: 'bg-red-50 border-red-100 text-red-700', sub: `${data.filter(d => !d.status_lunas).length} kasbon aktif` },
          { label: 'Total Kasbon (Semua)', val: formatRupiah(totalKasbon), color: 'bg-blue-50 border-blue-100 text-blue-700', sub: `${data.length} transaksi — historis seluruhnya` },
          { label: 'Sudah Lunas', val: formatRupiah(totalTerbayar), color: 'bg-green-50 border-green-100 text-green-700', sub: `${data.filter(d => d.status_lunas).length} lunas (via gaji/manual)` },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-4 ${s.color}`}>
            <p className="text-xs font-bold uppercase tracking-wide opacity-70">{s.label}</p>
            <p className="text-xl font-extrabold mt-1">{s.val}</p>
            <p className="text-xs opacity-60 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-40">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Cari Karyawan</label>
            <SearchBar value={search} onChange={setSearch} placeholder="Nama / NIK..." />
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
                { value: 'outstanding', label: 'Outstanding' },
                { value: 'lunas', label: 'Lunas' },
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
        <Table loading={loading && data.length === 0} data={filtered}
          emptyMessage="Tidak ada data kasbon"
          columns={[
            { header: 'Karyawan', render: r => (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
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
              : <span className="text-gray-400 text-xs">-</span>
            },
            { header: 'Tanggal', render: r => <span className="text-sm">{formatTanggal(r.tanggal_kasbon)}</span> },
            { header: 'Jumlah', render: r => <span className="font-bold text-sm">{formatRupiah(r.jumlah_kasbon)}</span> },
            { header: 'Sisa', render: r => <span className={`font-extrabold text-sm ${r.status_lunas ? 'text-green-600' : 'text-red-600'}`}>{formatRupiah(r.sisa_kasbon)}</span> },
            { header: 'Status', render: r => <StatusBadge kasbon={r} gajiTerakhir={gajiMap[r.karyawan_id] ?? -1} /> },
            { header: 'Catatan', render: r => <span className="text-xs text-gray-400 max-w-32 truncate block">{r.catatan || '—'}</span> },
            { header: 'Aksi', className: 'w-20', render: r => (
              <div className="flex gap-1">
                {!r.status_lunas && (
                  <button onClick={() => setKonfirmasiLunas(r)} className="p-2 rounded-xl hover:bg-green-50 text-green-600" title="Tandai Lunas">
                    <CheckCircle size={13} />
                  </button>
                )}
                <button onClick={() => setDeleting(r)} className="p-2 rounded-xl hover:bg-red-50 text-red-400" title={r.status_lunas ? 'Hapus riwayat kasbon' : 'Hapus kasbon'}><Trash2 size={13}/></button>
              </div>
            )},
          ]}
        />
      </Card>

      {/* ── MODAL TAMBAH KASBON ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Tambah Kasbon" size="sm">
        <div className="space-y-5">

          <InfoBox type="info" title="Pembayaran via Potong Gaji">
            Kasbon dipotong otomatis dari gaji mingguan berikutnya (FIFO — yang terlama lebih dulu).
          </InfoBox>

          {/* Seksi 1: Pilih Karyawan & Project */}
          <FormSection title="Karyawan & Project" icon={Building2}>
            <FormField label="Karyawan" required>
              <DropdownSelect
                value={form.karyawan_id}
                onChange={v => setForm(f => ({ ...f, karyawan_id: v }))}
                options={[
                  { value: '', label: '-- Pilih Karyawan --' },
                  ...karyawanFormList.map(k => ({ value: String(k.id), label: `${k.nama_karyawan} — ${k.jabatan?.nama_jabatan}` })),
                ]}
              />
            </FormField>

            <FormField label="Project" required help="Pilih project tempat karyawan bertugas">
              <DropdownSelect
                value={form.project_id}
                onChange={v => setForm(f => ({ ...f, project_id: v }))}
                options={[
                  { value: '', label: '-- Pilih Project --' },
                  ...projects.filter(p => p.status_project === 'aktif').map(p => ({ value: String(p.id), label: `${p.nama_project} (${p.kode_project})` })),
                ]}
              />
            </FormField>
          </FormSection>

          {/* Seksi 2: Detail Kasbon */}
          <FormSection title="Detail Kasbon" icon={CreditCard}>
            <FormField label="Jumlah Kasbon (Rp)" required help="Masukkan nominal yang dipinjam">
              <Input type="number" value={form.jumlah_kasbon}
                onChange={e => setForm(f => ({ ...f, jumlah_kasbon: e.target.value }))}
                placeholder="Contoh: 500000" min={0} />
            </FormField>

            <FormField label="Tanggal Kasbon" required help="Tanggal pinjaman diajukan">
              <Input type="date" value={form.tanggal_kasbon}
                onChange={e => setForm(f => ({ ...f, tanggal_kasbon: e.target.value }))} />
            </FormField>

            <FormField label="Catatan / Keperluan" help="Keterangan penggunaan kasbon (opsional)">
              <textarea className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                rows={2} value={form.catatan}
                onChange={e => setForm(f => ({ ...f, catatan: e.target.value }))}
                placeholder="Contoh: keperluan biaya sakit..." />
            </FormField>
          </FormSection>

          {/* Preview */}
          {form.jumlah_kasbon > 0 && (
            <CalcPreview
              rows={[
                ['Jumlah Pinjaman', formatRupiah(form.jumlah_kasbon)],
                ['Metode Pembayaran', 'Potong Gaji (otomatis)'],
              ]}
              total={formatRupiah(form.jumlah_kasbon)}
              totalLabel="Total Kasbon"
            />
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Batal</Button>
            <Button className="flex-1" onClick={handleSave} loading={saving}>Simpan Kasbon</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!konfirmasiLunas} title="Tandai Kasbon Lunas"
        message={`Tandai kasbon ${formatRupiah(konfirmasiLunas?.jumlah_kasbon)} atas nama ${konfirmasiLunas?.karyawan?.nama_karyawan} sebagai lunas?`}
        onConfirm={handleLunas} onCancel={() => setKonfirmasiLunas(null)} variant="primary" />
      <ConfirmDialog open={!!deleting}
        title={deleting?.status_lunas ? 'Hapus Riwayat Kasbon' : 'Hapus Kasbon'}
        message={deleting?.status_lunas
          ? `Hapus riwayat kasbon ${formatRupiah(deleting?.jumlah_kasbon)} (sudah lunas) atas nama ${deleting?.karyawan?.nama_karyawan}? Data historis tidak berubah.`
          : `Hapus kasbon ${formatRupiah(deleting?.jumlah_kasbon)} atas nama ${deleting?.karyawan?.nama_karyawan}? Kasbon belum lunas akan dihapus permanen.`
        }
        onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  )
}
