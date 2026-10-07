import { generateKodeProject, today } from '../../utils/autoFill'
import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Users, QrCode, Download, Printer, Eye, Lock } from 'lucide-react'
import { Card, Button, Modal, Input, Select, Textarea, FormField, Table, PageHeader, ConfirmDialog, SearchBar, LoadingSpinner, DropdownSelect } from '../common'
import { projectService } from '../../services/projectService'
import { FormSection, FieldRow } from '../common/FormSection'
import { escapeHtml } from '../../utils/security'
import { formatTanggal, formatRupiah, getStatusColor, formatNamaStatus } from '../../utils/formatters'
import { STATUS_PROJECT } from '../../utils/constants'
import { useSelection } from '../../utils/useSelection'

// ======================== PROJECT LIST ========================
export function ProjectList() {
  const [data, setData] = useState([])
  const [karyawan, setKaryawan] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [assignModal, setAssignModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ kode_project: '', nama_project: '', deskripsi: '', lokasi: '', project_manager_id: '', budget_total: '', tanggal_mulai: '', tanggal_selesai: '', status_project: 'aktif' })
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const { selected: selectedIds, toggle: toggleSelect, toggleAll: toggleSelectAll, clear: clearSelection } = useSelection()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [projectData, karyawanData] = await Promise.all([projectService.getProjects(), projectService.getKaryawan({ status_aktif: true })])
      setData(projectData); setKaryawan(karyawanData)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => { setEditing(null); setForm({ kode_project: generateKodeProject(data), nama_project: '', deskripsi: '', lokasi: '', project_manager_id: '', budget_total: '', tanggal_mulai: today(), tanggal_selesai: '', status_project: 'aktif' }); setModal(true) }
  const openEdit = (d) => { setEditing(d); setForm({ kode_project: d.kode_project, nama_project: d.nama_project, deskripsi: d.deskripsi || '', lokasi: d.lokasi || '', project_manager_id: d.project_manager_id || '', budget_total: d.budget_total || '', tanggal_mulai: d.tanggal_mulai, tanggal_selesai: d.tanggal_selesai || '', status_project: d.status_project }); setModal(true) }

  const handleSave = async () => {
    if (!form.kode_project.trim()) return toast.error('Kode project wajib diisi')
    if (!form.nama_project.trim()) return toast.error('Nama project wajib diisi')
    if (!form.tanggal_mulai) return toast.error('Tanggal mulai wajib diisi')
    try {
      const payload = { ...form, budget_total: form.budget_total ? parseFloat(form.budget_total) : null, project_manager_id: form.project_manager_id ? parseInt(form.project_manager_id) : null }
      if (editing) { await projectService.updateProject(editing.id, payload); toast.success('Project diperbarui') }
      else { await projectService.createProject(payload); toast.success('Project ditambahkan') }
      setModal(false); load()
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    try { await projectService.deleteProject(deleting.id); toast.success('Project dihapus'); setDeleting(null); load() }
    catch (e) { toast.error(e.message) }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    let berhasil = 0, dilewati = 0
    for (const id of selectedIds) {
      try { await projectService.deleteProject(id); berhasil++ }
      catch { dilewati++ }
    }
    setBulkDeleting(false)
    setBulkConfirm(false)
    clearSelection()
    load()
    if (dilewati > 0) toast.error(`${berhasil} project dihapus, ${dilewati} gagal dihapus`)
    else toast.success(`${berhasil} project berhasil dihapus`)
  }

  const filtered = data.filter(d => d.nama_project.toLowerCase().includes(search.toLowerCase()) || d.kode_project.includes(search))

  return (
    <div className="space-y-4">
      <PageHeader title="Project" subtitle="Kelola project konstruksi" action={<Button icon={Plus} onClick={openAdd}>Tambah Project</Button>} />

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Project', value: data.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'Project Aktif', value: data.filter(p => p.status_project === 'aktif').length, color: 'bg-green-50 text-green-700' },
          { label: 'Project Selesai', value: data.filter(p => p.status_project === 'selesai').length, color: 'bg-gray-50 text-gray-700' },
        ].map(s => <div key={s.label} className={`rounded-xl p-4 ${s.color}`}><p className="text-xs opacity-70 mb-1">{s.label}</p><p className="text-2xl font-bold">{s.value}</p></div>)}
      </div>

      <Card>
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cari project..." /></div>
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-3">
            <p className="text-sm text-blue-700 font-medium">{selectedIds.size} project dipilih</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearSelection}>Batal</Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={() => setBulkConfirm(true)}>Hapus Terpilih</Button>
            </div>
          </div>
        )}
        <Table loading={loading} data={filtered} columns={[
          { header: (
              <input type="checkbox" className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                checked={filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))}
                onChange={() => toggleSelectAll(filtered.map(r => r.id))} />
            ), className: 'w-10', render: r => (
              <input type="checkbox" className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                checked={selectedIds.has(r.id)}
                onChange={() => toggleSelect(r.id)} />
            )},
          { header: 'Kode', render: r => <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{r.kode_project}</span> },
          { header: 'Nama Project', render: r => <div><p className="font-medium text-gray-900">{r.nama_project}</p><p className="text-xs text-gray-400">{r.lokasi}</p></div> },
          { header: 'Project Manager', render: r => r.karyawan?.nama_karyawan || <span className="text-gray-400">-</span> },
          { header: 'Budget', render: r => r.budget_total ? <span className="font-semibold">{formatRupiah(r.budget_total)}</span> : <span className="text-gray-400">-</span> },
          { header: 'Mulai', render: r => formatTanggal(r.tanggal_mulai) },
          { header: 'Status', render: r => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(r.status_project)}`}>{formatNamaStatus(r.status_project)}</span> },
          {
            header: 'Aksi', className: 'w-40', render: r => (
              <div className="flex gap-1">
                <button onClick={() => { setSelectedProject(r); setAssignModal(true) }} className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Assign Karyawan"><Users size={14} /></button>
                <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Edit2 size={14} /></button>
                <button onClick={() => setDeleting(r)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
              </div>
            )
          },
        ]} />
      </Card>

      {/* Modal Form */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Project' : 'Tambah Project'} size="sm">
        <div className="space-y-5">
          <FormSection title="Identitas Project">
            <FieldRow cols={2}>
              <FormField label="Kode Project" help="Otomatis dari sistem">
                <Input value={form.kode_project} readOnly className="bg-gray-50 cursor-not-allowed text-gray-500" />
              </FormField>
              <FormField label="Status Project">
                <DropdownSelect
                  value={form.status_project}
                  onChange={v => setForm(f => ({ ...f, status_project: v }))}
                  options={STATUS_PROJECT.map(s => ({ value: s, label: formatNamaStatus(s) }))}
                />
              </FormField>
            </FieldRow>
            <FormField label="Nama Project" required help="Nama lengkap project konstruksi">
              <Input value={form.nama_project} onChange={e => setForm(f => ({ ...f, nama_project: e.target.value }))} placeholder="Contoh: Pembangunan Gedung Serbaguna" />
            </FormField>
            <FormField label="Lokasi Project" help="Alamat atau lokasi project">
              <Input value={form.lokasi} onChange={e => setForm(f => ({ ...f, lokasi: e.target.value }))} placeholder="Contoh: Jl. Merdeka No. 10, Purwokerto" />
            </FormField>
            <FormField label="Project Manager" help="Karyawan yang bertanggung jawab atas project">
              <DropdownSelect
                value={form.project_manager_id}
                onChange={v => setForm(f => ({ ...f, project_manager_id: v }))}
                options={[
                  { value: '', label: '-- Pilih Project Manager --' },
                  ...karyawan.map(k => ({ value: String(k.id), label: `${k.nama_karyawan} (${k.jabatan?.nama_jabatan})` })),
                ]}
              />
            </FormField>
          </FormSection>

          <FormSection title="Anggaran & Jadwal">
            <FieldRow cols={2}>
              <FormField label="Tanggal Mulai" required>
                <Input type="date" value={form.tanggal_mulai} onChange={e => setForm(f => ({ ...f, tanggal_mulai: e.target.value }))} />
              </FormField>
              <FormField label="Tanggal Selesai" help="Opsional">
                <Input type="date" value={form.tanggal_selesai} onChange={e => setForm(f => ({ ...f, tanggal_selesai: e.target.value }))} />
              </FormField>
            </FieldRow>
            <FormField label="Budget Total (Rp)" help="Opsional — anggaran total project">
              <Input type="number" value={form.budget_total} onChange={e => setForm(f => ({ ...f, budget_total: e.target.value }))} placeholder="Contoh: 100000000" min={0} />
            </FormField>
            <FormField label="Deskripsi Project" help="Opsional — gambaran singkat tentang project">
              <textarea className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                rows={2} value={form.deskripsi} onChange={e => setForm(f => ({ ...f, deskripsi: e.target.value }))} placeholder="Deskripsi..." />
            </FormField>
          </FormSection>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Batal</Button>
            <Button className="flex-1" onClick={handleSave}>Simpan Project</Button>
          </div>
        </div>
      </Modal>

      {/* Assign Karyawan Modal */}
      {selectedProject && <AssignKaryawanModal open={assignModal} onClose={() => setAssignModal(false)} project={selectedProject} karyawan={karyawan} />}
      <ConfirmDialog open={!!deleting} title="Hapus Project" message={`Hapus project "${deleting?.nama_project}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
      <ConfirmDialog open={bulkConfirm} title="Hapus Project Terpilih"
        message={`Hapus ${selectedIds.size} project terpilih beserta seluruh data presensi, lembur, dan kasbon di dalamnya? Tindakan ini tidak dapat dibatalkan.`}
        loading={bulkDeleting} onConfirm={handleBulkDelete} onCancel={() => setBulkConfirm(false)} />
    </div>
  )
}

function AssignKaryawanModal({ open, onClose, project, karyawan }) {
  const [assigned, setAssigned] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (open && project) {
      projectService.getKaryawanByProject(project.id).then(data => setAssigned(data.map(d => d.karyawan_id)))
    }
  }, [open, project])

  const toggle = async (karyawanId) => {
    const isAssigned = assigned.includes(karyawanId)
    setLoading(true)
    try {
      if (isAssigned) {
        await projectService.unassignKaryawan(project.id, karyawanId)
        setAssigned(prev => prev.filter(id => id !== karyawanId))
        toast.success('Karyawan dikeluarkan dari project')
      } else {
        await projectService.assignKaryawan({ project_id: project.id, karyawan_id: karyawanId, tanggal_mulai: today(), status_assignment: 'aktif' })
        setAssigned(prev => [...prev, karyawanId])
        toast.success('Karyawan ditambahkan ke project')
      }
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  const filtered = karyawan.filter(k => k.nama_karyawan.toLowerCase().includes(search.toLowerCase()))

  return (
    <Modal open={open} onClose={onClose} title={`Assign Karyawan - ${project?.nama_project}`} size="md">
      <div className="space-y-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Cari karyawan..." />
        <p className="text-xs text-gray-500">{assigned.length} karyawan aktif di project ini</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.map(k => (
            <div key={k.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${assigned.includes(k.id) ? 'border-blue-200 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`} onClick={() => !loading && toggle(k.id)}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${assigned.includes(k.id) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{k.nama_karyawan?.[0]}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{k.nama_karyawan}</p>
                <p className="text-xs text-gray-400">{k.jabatan?.nama_jabatan} · {k.kode_karyawan}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${assigned.includes(k.id) ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}>
                {assigned.includes(k.id) && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end"><Button onClick={onClose}>Selesai</Button></div>
      </div>
    </Modal>
  )
}

// ======================== QR CODE GENERATOR ========================
export function QRCodeGenerator() {
  const [karyawan, setKaryawan] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [qrData, setQrData] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')
  const [printModal, setPrintModal] = useState(false)

  const load = useCallback(async () => {
    try { setKaryawan(await projectService.getKaryawan({ status_aktif: true })) }
    catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [])

  const loadQR = async (k) => {
    setSelected(k)
    setQrDataUrl(null)
    try {
      const qr = await projectService.getQRCode(k.id)
      setQrData(qr)
      if (qr?.qr_code_value) {
        const QRCode = await import('qrcode')
        const url = await QRCode.default.toDataURL(qr.qr_code_value, { width: 300, margin: 2, color: { dark: '#1e293b', light: '#ffffff' } })
        setQrDataUrl(url)
      }
    } catch { setQrData(null) }
  }

  const generateQR = async () => {
    if (!selected) return
    // Sudah punya QR — tidak bisa generate ulang
    if (qrData?.qr_code_value) {
      toast.error('QR Code sudah aktif dan tidak dapat diubah')
      return
    }
    setGenerating(true)
    try {
      const QRCode = await import('qrcode')
      // Nilai deterministik — tanpa timestamp agar permanen
      const qrValue = `KRAKATAU-${selected.kode_karyawan}-${selected.id}`
      const url = await QRCode.default.toDataURL(qrValue, { width: 300, margin: 2, color: { dark: '#1e293b', light: '#ffffff' } })
      // insert bukan upsert — tolak jika sudah ada
      const saved = await projectService.insertQRCode({ karyawan_id: selected.id, qr_code_value: qrValue, status_aktif: true })
      setQrData({ ...saved, qr_code_value: qrValue })
      setQrDataUrl(url)
      toast.success('QR Code berhasil dibuat — permanen, tidak dapat diubah')
    } catch (e) { toast.error(e.message) } finally { setGenerating(false) }
  }

  const downloadQR = async () => {
    if (!selected || !qrData) return
    try {
      const QRCode = await import('qrcode')
      const url = await QRCode.default.toDataURL(qrData.qr_code_value, { width: 400, margin: 2 })
      const link = document.createElement('a')
      link.download = `QR-${selected.kode_karyawan}-${selected.nama_karyawan}.png`
      link.href = url; link.click()
      toast.success('QR Code diunduh')
    } catch (e) { toast.error(e.message) }
  }

  const doCetakKartu = () => {
    if (!selected || !qrDataUrl) return
    const initials = escapeHtml(selected.nama_karyawan.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase())
    const pw = window.open('', '_blank', 'width=900,height=650')
    if (!pw) { toast.error('Popup diblokir browser. Izinkan popup untuk halaman ini.'); return }
    pw.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Kartu Karyawan - ${escapeHtml(selected.nama_karyawan)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#e8edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:20px;padding:24px;}
    h3{font-size:13px;color:#64748b;font-weight:500;letter-spacing:.5px;}
    .card{
      width:85.6mm;height:54mm;
      background:linear-gradient(135deg,#0f2044 0%,#1d4ed8 55%,#2563eb 100%);
      border-radius:10px;overflow:hidden;position:relative;display:flex;
      box-shadow:0 12px 40px rgba(0,0,0,.30);color:#fff;
    }
    .deco1{position:absolute;width:48mm;height:48mm;border-radius:50%;background:rgba(255,255,255,.06);top:-12mm;right:10mm;}
    .deco2{position:absolute;width:28mm;height:28mm;border-radius:50%;background:rgba(255,255,255,.04);bottom:-8mm;left:4mm;}
    .left{flex:1;padding:7mm 5mm 6mm 7mm;display:flex;flex-direction:column;justify-content:space-between;position:relative;z-index:1;}
    .co-name{font-size:7pt;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.95;}
    .co-sub{font-size:5pt;opacity:.60;margin-top:1px;}
    .avatar{width:26px;height:26px;background:rgba(255,255,255,.22);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;margin-bottom:5px;}
    .emp-name{font-size:9pt;font-weight:700;line-height:1.25;}
    .emp-pos{font-size:6.5pt;opacity:.82;margin-top:2px;}
    .emp-dept{font-size:5.5pt;opacity:.65;margin-top:1px;}
    .badges{display:flex;gap:4px;flex-wrap:wrap;}
    .badge{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);border-radius:3px;padding:2px 5px;font-size:5.5pt;font-weight:600;letter-spacing:.4px;}
    .right{width:28mm;background:rgba(255,255,255,.07);border-left:1px solid rgba(255,255,255,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:5mm 4mm;position:relative;z-index:1;}
    .qr-box{background:#fff;border-radius:5px;padding:4px;}
    .qr-box img{width:58px;height:58px;display:block;}
    .scan-label{font-size:5pt;opacity:.65;text-align:center;letter-spacing:.6px;text-transform:uppercase;}
    .actions{display:flex;gap:10px;margin-top:4px;}
    button{padding:9px 22px;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;}
    .btn-print{background:#1d4ed8;color:#fff;}
    .btn-close{background:#f1f5f9;color:#475569;}
    button:hover{opacity:.85;}
    @media print{body{background:#fff;padding:0;}.actions{display:none;}.card{box-shadow:none;}}
  </style>
</head>
<body>
  <h3>Preview Kartu Karyawan · PT Krakatau Indah</h3>
  <div class="card">
    <div class="deco1"></div><div class="deco2"></div>
    <div class="left">
      <div>
        <div class="co-name">PT Krakatau Indah</div>
        <div class="co-sub">Admin System &nbsp;·&nbsp; Kartu Karyawan</div>
      </div>
      <div>
        <div class="avatar">${initials}</div>
        <div class="emp-name">${escapeHtml(selected.nama_karyawan)}</div>
        <div class="emp-pos">${escapeHtml(selected.jabatan?.nama_jabatan || '-')}</div>
        ${selected.departemen?.nama_departemen ? `<div class="emp-dept">${escapeHtml(selected.departemen.nama_departemen)}</div>` : ''}
      </div>
      <div class="badges">
        <div class="badge">Kode: ${escapeHtml(String(selected.kode_karyawan))}</div>
      </div>
    </div>
    <div class="right">
      <div class="qr-box"><img src="${qrDataUrl}" alt="QR"/></div>
      <div class="scan-label">Scan Presensi</div>
    </div>
  </div>
  <div class="actions">
    <button class="btn-close" onclick="window.close()">✕ Tutup</button>
    <button class="btn-print" onclick="window.print()">🖨️ Cetak Kartu</button>
  </div>
</body>
</html>`)
    pw.document.close()
  }

  const filtered = karyawan.filter(k =>
    k.nama_karyawan.toLowerCase().includes(search.toLowerCase()) || String(k.kode_karyawan ?? '').includes(search)
  )

  return (
    <div className="space-y-4">
      <PageHeader title="QR Code Karyawan" subtitle="Generate dan cetak kartu presensi QR Code" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cari karyawan..." /></div>
            {loading ? <LoadingSpinner /> : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filtered.map(k => (
                  <div key={k.id} onClick={() => loadQR(k)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected?.id === k.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center text-sm font-bold text-slate-700 flex-shrink-0">{k.nama_karyawan?.[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900">{k.nama_karyawan}</p>
                      <p className="text-xs text-gray-400">{k.kode_karyawan} · {k.jabatan?.nama_jabatan}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${selected?.id === k.id ? 'bg-blue-500' : 'bg-gray-200'}`} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* QR Preview Panel */}
        <div>
          <Card title="QR Code Preview">
            {!selected ? (
              <div className="text-center py-12 text-gray-400">
                <QrCode size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Pilih karyawan</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="font-semibold text-gray-900">{selected.nama_karyawan}</p>
                  <p className="text-xs text-gray-400">{selected.kode_karyawan} · {selected.jabatan?.nama_jabatan}</p>
                </div>

                {qrData && qrDataUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    {/* Mini card preview */}
                    <div
                      className="rounded-xl overflow-hidden w-full"
                      style={{
                        background: 'linear-gradient(135deg, #0f2044 0%, #1d4ed8 55%, #2563eb 100%)',
                        aspectRatio: '85.6/54',
                        position: 'relative',
                        display: 'flex',
                        color: 'white',
                      }}
                    >
                      {/* deco */}
                      <div style={{ position:'absolute', top:'-20%', right:'20%', width:'45%', height:'130%', borderRadius:'50%', background:'rgba(255,255,255,.06)' }} />
                      {/* left */}
                      <div style={{ flex:1, padding:'10px 8px 10px 12px', display:'flex', flexDirection:'column', justifyContent:'space-between', position:'relative', zIndex:1 }}>
                        <div>
                          <div style={{ fontSize:'6px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', opacity:.95 }}>PT Krakatau Indah</div>
                          <div style={{ fontSize:'5px', opacity:.6 }}>Admin System · Kartu Karyawan</div>
                        </div>
                        <div>
                          <div style={{ width:22, height:22, background:'rgba(255,255,255,.22)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, marginBottom:4 }}>
                            {selected.nama_karyawan.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                          </div>
                          <div style={{ fontSize:'8px', fontWeight:700, lineHeight:1.3 }}>{selected.nama_karyawan}</div>
                          <div style={{ fontSize:'6px', opacity:.82, marginTop:2 }}>{selected.jabatan?.nama_jabatan || '-'}</div>
                        </div>
                        <div style={{ display:'flex', gap:3 }}>
                          <div style={{ background:'rgba(255,255,255,.18)', border:'1px solid rgba(255,255,255,.28)', borderRadius:2, padding:'1px 4px', fontSize:'5px', fontWeight:600 }}>
                            Kode: {selected.kode_karyawan}
                          </div>
                        </div>
                      </div>
                      {/* right QR */}
                      <div style={{ width:72, background:'rgba(255,255,255,.07)', borderLeft:'1px solid rgba(255,255,255,.14)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'6px 5px', position:'relative', zIndex:1 }}>
                        <div style={{ background:'white', borderRadius:3, padding:2 }}>
                          <img src={qrDataUrl} alt="QR" style={{ width:52, height:52, display:'block' }} />
                        </div>
                        <div style={{ fontSize:'4px', opacity:.65, textAlign:'center', letterSpacing:'.5px', textTransform:'uppercase' }}>Scan Presensi</div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 font-mono break-all text-center">{qrData.qr_code_value?.slice(0, 30)}...</p>
                    <p className="text-xs text-gray-400">Dipindai: {qrData.scan_count || 0}x</p>
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <QrCode size={48} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Belum ada QR Code</p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {qrData?.qr_code_value ? (
                    // Sudah punya QR — terkunci
                    <>
                      <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold">
                        <Lock size={14} />
                        QR Aktif — Tidak Dapat Diubah
                      </div>
                      {qrDataUrl && (
                        <>
                          <Button variant="outline" onClick={downloadQR} icon={Download} className="w-full justify-center">
                            Download PNG
                          </Button>
                          <Button
                            onClick={doCetakKartu}
                            icon={Printer}
                            className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                          >
                            Cetak Kartu ID
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    // Belum punya QR — tampilkan Generate
                    <Button onClick={generateQR} loading={generating} icon={QrCode} className="w-full justify-center">
                      Generate QR Code
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function QRCodeDisplay({ value }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (!value || !canvasRef.current) return
    import('qrcode').then(QRCode => {
      QRCode.default.toCanvas(canvasRef.current, value, { width: 180, margin: 1 })
    })
  }, [value])
  return <canvas ref={canvasRef} />
}