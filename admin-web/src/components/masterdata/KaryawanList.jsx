import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Eye, Download, QrCode, Printer, X } from 'lucide-react'
import { Card, Button, Modal, Input, Select, FormField, Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect } from '../common'
import { projectService } from '../../services/projectService'
import { supabase } from '../../services/supabaseClient'
import { exportService } from '../../services/exportService'
import { escapeHtml } from '../../utils/security'
import { isJabatanMandor } from '../../utils/akunMobile'
import { formatTanggal, formatRupiah } from '../../utils/formatters'
import { today } from '../../utils/autoFill'
import { useSelection } from '../../utils/useSelection'

// ── QR Code generator menggunakan qrcode.react via CDN ────────
// Pakai canvas API sederhana via URL API
const QRCodeImage = ({ value, size = 160 }) => {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&format=png&margin=10`
  return (
    <img
      src={url}
      alt={`QR: ${value}`}
      width={size}
      height={size}
      className="rounded-lg border border-gray-200"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

export default function KaryawanList() {
  const [data, setData] = useState([])
  const [jabatan, setJabatan] = useState([])
  const [departemen, setDepartemen] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [qrModal, setQrModal] = useState(false)
  const [qrKaryawan, setQrKaryawan] = useState(null)
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterJabatan, setFilterJabatan] = useState('all')
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const { selected: selectedIds, toggle: toggleSelect, toggleAll: toggleSelectAll, clear: clearSelection } = useSelection()
  const [form, setForm] = useState({
    nama_karyawan: '',
    departemen_id: '', jabatan_id: '',
    tanggal_bergabung: today(), status_aktif: true,
    gaji_harian_override: '', uang_makan_override: '', uang_transport_override: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [karyawanData, jabatanData, deptData] = await Promise.all([
        projectService.getKaryawan(),
        projectService.getJabatan(),
        projectService.getDepartemen(),
      ])
      setData(karyawanData)
      setJabatan(jabatanData)
      setDepartemen(deptData)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Auto-generate QR saat karyawan dibuat ─────────────────
  // QR hanya dibuat SEKALI saat karyawan baru - tidak bisa di-generate ulang
  const generateQRForKaryawan = async (karyawanId) => {
    const qrValue = 'KRAKATAU-' + String(karyawanId).padStart(6, '0')
    try {
      // Cek apakah sudah ada - jika sudah ada, TIDAK overwrite
      const { data: existing } = await supabase
        .from('karyawan_qr_code')
        .select('id, qr_code_value')
        .eq('karyawan_id', karyawanId)
        .maybeSingle()

      if (existing) return existing.qr_code_value // Kembalikan yang sudah ada

      // Insert hanya jika belum ada
      await supabase.from('karyawan_qr_code').insert({
        karyawan_id: karyawanId,
        qr_code_value: qrValue,
        status_aktif: true,
      })
      return qrValue
    } catch (e) {
      console.error('QR generate error:', e)
      return qrValue
    }
  }

  // ── Ambil QR value karyawan ────────────────────────────────
  const getQRValue = async (karyawanId) => {
    const { data: qr } = await supabase
      .from('karyawan_qr_code')
      .select('qr_code_value')
      .eq('karyawan_id', karyawanId)
      .maybeSingle()
    if (qr) return qr.qr_code_value
    return await generateQRForKaryawan(karyawanId)
  }

  const openQRModal = async (r) => {
    try {
      const qrValue = await getQRValue(r.id)
      setQrKaryawan({ ...r, qr_value: qrValue })
      setQrModal(true)
    } catch (e) {
      toast.error('Gagal membuka QR: ' + e.message)
    }
  }

  const printQR = (karyawan) => {
    if (!karyawan.qr_value) return
    const w = window.open('', '_blank', 'width=900,height=650')
    if (!w) { toast.error('Popup diblokir browser'); return }
    const initials = escapeHtml(karyawan.nama_karyawan.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase())
    // Render QR pakai qrcode library yang sudah di-load di app
    // Buat data URL dulu
    import('qrcode').then(QRCode => {
      QRCode.default.toDataURL(karyawan.qr_value, { width: 300, margin: 2, color: { dark: '#1e293b', light: '#ffffff' } })
        .then(qrSrc => {
          w.document.write(`<!DOCTYPE html><html><head>
            <title>Kartu Karyawan - ${escapeHtml(karyawan.nama_karyawan)}</title>
            <style>
              *{margin:0;padding:0;box-sizing:border-box}
              body{font-family:'Segoe UI',Arial,sans-serif;background:#e8edf3;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:20px;padding:24px}
              h3{font-size:13px;color:#64748b;font-weight:500;letter-spacing:.5px}
              .card{width:85.6mm;height:54mm;background:linear-gradient(135deg,#0f2044 0%,#1d4ed8 55%,#2563eb 100%);border-radius:10px;overflow:hidden;position:relative;display:flex;box-shadow:0 12px 40px rgba(0,0,0,.30);color:#fff}
              .deco1{position:absolute;width:48mm;height:48mm;border-radius:50%;background:rgba(255,255,255,.06);top:-12mm;right:10mm}
              .deco2{position:absolute;width:28mm;height:28mm;border-radius:50%;background:rgba(255,255,255,.04);bottom:-8mm;left:4mm}
              .left{flex:1;padding:7mm 5mm 6mm 7mm;display:flex;flex-direction:column;justify-content:space-between;position:relative;z-index:1}
              .co-name{font-size:7pt;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.95}
              .co-sub{font-size:5pt;opacity:.60;margin-top:1px}
              .avatar{width:26px;height:26px;background:rgba(255,255,255,.22);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;margin-bottom:5px}
              .emp-name{font-size:9pt;font-weight:700;line-height:1.25}
              .emp-pos{font-size:6.5pt;opacity:.82;margin-top:2px}
              .emp-dept{font-size:5.5pt;opacity:.65;margin-top:1px}
              .badge{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);border-radius:3px;padding:2px 5px;font-size:5.5pt;font-weight:600;letter-spacing:.4px;display:inline-block}
              .right{width:28mm;background:rgba(255,255,255,.07);border-left:1px solid rgba(255,255,255,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:5mm 4mm;position:relative;z-index:1}
              .qr-box{background:#fff;border-radius:5px;padding:4px}
              .qr-box img{width:58px;height:58px;display:block}
              .scan-label{font-size:5pt;opacity:.65;text-align:center;letter-spacing:.6px;text-transform:uppercase}
              .actions{display:flex;gap:10px;margin-top:4px}
              button{padding:9px 22px;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer}
              .btn-print{background:#1d4ed8;color:#fff}
              .btn-close{background:#f1f5f9;color:#475569}
              @media print{body{background:#fff;padding:0}.actions{display:none}.card{box-shadow:none}}
            </style></head><body>
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
                  <div class="emp-name">${escapeHtml(karyawan.nama_karyawan)}</div>
                  <div class="emp-pos">${escapeHtml(karyawan.jabatan?.nama_jabatan || '-')}</div>
                  ${karyawan.departemen?.nama_departemen ? `<div class="emp-dept">${escapeHtml(karyawan.departemen.nama_departemen)}</div>` : ''}
                </div>
                <div><div class="badge">Kode: ${escapeHtml(String(karyawan.kode_karyawan))}</div></div>
              </div>
              <div class="right">
                <div class="qr-box"><img src="${qrSrc}" alt="QR"/></div>
                <div class="scan-label">Scan Presensi</div>
              </div>
            </div>
            <div class="actions">
              <button class="btn-close" onclick="window.close()">✕ Tutup</button>
              <button class="btn-print" onclick="window.print()">🖨️ Cetak Kartu</button>
            </div>
          </body></html>`)
          w.document.close()
        })
    })
  }

  const openAdd = () => {
    setEditing(null)
    setForm({
      nama_karyawan: '',
      departemen_id: '', jabatan_id: '',
      tanggal_bergabung: today(), status_aktif: true,
      gaji_harian_override: '', uang_makan_override: '', uang_transport_override: '',
    })
    setModal(true)
  }

  const openEdit = (d) => {
    setEditing(d)
    setForm({
      nama_karyawan: d.nama_karyawan,
      departemen_id: d.departemen_id || '',
      jabatan_id: d.jabatan_id,
      tanggal_bergabung: d.tanggal_bergabung,
      status_aktif: d.status_aktif,
      gaji_harian_override: d.gaji_harian_override || '',
      uang_makan_override: d.uang_makan_override || '',
      uang_transport_override: d.uang_transport_override || '',
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.nama_karyawan.trim()) return toast.error('Nama karyawan wajib diisi')
    if (!form.jabatan_id) return toast.error('Jabatan wajib dipilih')
    if (!form.tanggal_bergabung) return toast.error('Tanggal bergabung wajib diisi')

    try {
      const payload = {
        nama_karyawan: form.nama_karyawan,
        departemen_id: form.departemen_id ? parseInt(form.departemen_id) : null,
        jabatan_id: parseInt(form.jabatan_id),
        tanggal_bergabung: form.tanggal_bergabung,
        status_aktif: form.status_aktif,
        gaji_harian_override: form.gaji_harian_override ? parseFloat(form.gaji_harian_override) : null,
        uang_makan_override: form.uang_makan_override ? parseFloat(form.uang_makan_override) : null,
        uang_transport_override: form.uang_transport_override ? parseFloat(form.uang_transport_override) : null,
      }

      let savedKaryawanId = null
      if (editing) {
        await projectService.updateKaryawan(editing.id, payload)
        savedKaryawanId = editing.id
        toast.success('Data karyawan diperbarui')
      } else {
        const created = await projectService.createKaryawan(payload)
        savedKaryawanId = created?.id
        // Auto-generate QR saat karyawan baru dibuat
        if (savedKaryawanId) {
          await generateQRForKaryawan(savedKaryawanId)
          toast.success('Karyawan ditambahkan + QR Code otomatis dibuat')
        }
      }

      setModal(false)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const handleDelete = async () => {
    try {
      const { data: kasbonAktif } = await supabase
        .from('kasbon').select('id, sisa_kasbon')
        .eq('karyawan_id', deleting.id).eq('status_lunas', false)
      if (kasbonAktif && kasbonAktif.length > 0) {
        const totalSisa = kasbonAktif.reduce((s, k) => s + parseFloat(k.sisa_kasbon || 0), 0)
        toast.error(`Masih ada ${kasbonAktif.length} kasbon belum lunas (sisa ${formatRupiah(totalSisa)})`)
        setDeleting(null)
        return
      }
      await projectService.deleteKaryawan(deleting.id)
      toast.success('Karyawan berhasil dihapus')
      setDeleting(null)
      load()
    } catch (e) { toast.error(e.message); setDeleting(null) }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    let berhasil = 0, dilewati = 0
    for (const id of selectedIds) {
      try {
        const { data: kasbonAktif } = await supabase
          .from('kasbon').select('id').eq('karyawan_id', id).eq('status_lunas', false)
        if (kasbonAktif && kasbonAktif.length > 0) { dilewati++; continue }
        await projectService.deleteKaryawan(id)
        berhasil++
      } catch { dilewati++ }
    }
    setBulkDeleting(false)
    setBulkConfirm(false)
    clearSelection()
    load()
    if (dilewati > 0) {
      toast.error(`${berhasil} karyawan dihapus, ${dilewati} dilewati (masih ada kasbon belum lunas)`)
    } else {
      toast.success(`${berhasil} karyawan berhasil dihapus`)
    }
  }

  const filtered = data.filter(d => {
    const matchSearch = d.nama_karyawan.toLowerCase().includes(search.toLowerCase()) ||
      String(d.kode_karyawan ?? '').includes(search)
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'aktif' && d.status_aktif) ||
      (filterStatus === 'nonaktif' && !d.status_aktif)
    const matchJabatan = filterJabatan === 'all' || d.jabatan_id === parseInt(filterJabatan)
    return matchSearch && matchStatus && matchJabatan
  })


  return (
    <div className="space-y-4">
      <PageHeader title="Karyawan"
        subtitle={`${data.filter(k => k.status_aktif).length} aktif dari ${data.length} total`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" icon={Download} size="sm"
              onClick={() => {
                exportService.exportExcel(filtered, [
                  { header: 'Kode Karyawan', key: 'kode_karyawan' },
                  { header: 'Nama', key: 'nama_karyawan' },
                  { header: 'Golongan', render: r => r.jabatan?.nama_jabatan },
                  { header: 'Departemen', render: r => r.departemen?.nama_departemen || '-' },
                  { header: 'Gaji Harian', render: r => r.gaji_harian_override || r.jabatan?.gaji_harian },
                  { header: 'Bergabung', render: r => formatTanggal(r.tanggal_bergabung) },
                  { header: 'Status', render: r => r.status_aktif ? 'Aktif' : 'Non-aktif' },
                ], 'daftar-karyawan')
                toast.success('File Excel berhasil diunduh')
              }}>Export Excel</Button>
            <Button icon={Plus} onClick={openAdd}>Tambah Karyawan</Button>
          </div>
        } />

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex-1 min-w-48">
            <SearchBar value={search} onChange={setSearch} placeholder="Cari nama / ID karyawan..." />
          </div>
          <DropdownSelect
            value={filterStatus}
            onChange={v => setFilterStatus(v)}
            className="min-w-[140px]"
            options={[
              { value: 'all', label: 'Semua Status' },
              { value: 'aktif', label: 'Aktif' },
              { value: 'nonaktif', label: 'Non-aktif' },
            ]}
          />
          <DropdownSelect
            value={filterJabatan}
            onChange={v => setFilterJabatan(v)}
            className="min-w-[160px]"
            options={[
              { value: 'all', label: 'Semua Golongan' },
              ...jabatan.map(j => ({ value: String(j.id), label: j.nama_jabatan })),
            ]}
          />
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-3">
            <p className="text-sm text-blue-700 font-medium">{selectedIds.size} karyawan dipilih</p>
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
          { header: 'Karyawan', render: r => (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                {r.nama_karyawan?.[0]}
              </div>
              <div>
                <p className="font-medium text-gray-900">{r.nama_karyawan}</p>
                <p className="text-xs text-gray-400 font-mono">Kode {r.kode_karyawan}</p>
              </div>
            </div>
          )},
          { header: 'Golongan', render: r => <span className="font-medium">{r.jabatan?.nama_jabatan}</span> },
          { header: 'Departemen', render: r => r.departemen?.nama_departemen || <span className="text-gray-400">-</span> },
          { header: 'Gaji Harian', render: r => (
            <span className="font-semibold text-blue-600">
              {formatRupiah(r.gaji_harian_override || r.jabatan?.gaji_harian)}
            </span>
          )},
          { header: 'Bergabung', render: r => formatTanggal(r.tanggal_bergabung) },
          { header: 'Status', render: r => (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status_aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {r.status_aktif ? 'Aktif' : 'Non-aktif'}
            </span>
          )},
          { header: 'Aksi', className: 'w-36', render: r => (
            <div className="flex gap-1">
              <button onClick={() => { setSelected(r); setDetailModal(true) }}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Detail"><Eye size={14} /></button>
              <button onClick={() => openQRModal(r)}
                className="p-1.5 rounded hover:bg-purple-50 text-purple-600" title="QR Code"><QrCode size={14} /></button>
              <button onClick={() => openEdit(r)}
                className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Edit2 size={14} /></button>
              <button onClick={() => setDeleting(r)}
                className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Nonaktifkan"><Trash2 size={14} /></button>
            </div>
          )},
        ]} />
        <p className="text-xs text-gray-400 mt-2 px-1">
          Menampilkan {filtered.length} dari {data.length} karyawan
        </p>
      </Card>

      {/* ── QR Code Modal ── */}
      <Modal open={qrModal} onClose={() => setQrModal(false)} title="QR Code Karyawan" size="sm">
        {qrKaryawan && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white border-2 border-blue-100 rounded-2xl p-6 w-full flex flex-col items-center gap-3">
              <div className="text-sm font-bold text-blue-800 mb-1">PT KRAKATAU INDAH</div>
              <QRCodeImage value={qrKaryawan.qr_value} size={180} />
              <div className="text-center">
                <p className="font-bold text-gray-900 text-base">{qrKaryawan.nama_karyawan}</p>
                <p className="text-sm text-gray-500">{qrKaryawan.jabatan?.nama_jabatan}</p>
                <p className="text-xs text-gray-400">Kode {qrKaryawan.kode_karyawan}</p>
                <div className="mt-2 bg-gray-100 px-3 py-1 rounded-lg">
                  <code className="text-xs font-mono text-blue-700">{qrKaryawan.qr_value}</code>
                </div>
              </div>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" icon={Printer} className="flex-1"
                onClick={() => printQR(qrKaryawan)}>Print QR</Button>
              <Button variant="secondary" className="flex-1"
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrKaryawan.qr_value)}&format=png`
                  link.download = `QR-${qrKaryawan.nama_karyawan.replace(/\s+/g, '_')}.png`
                  link.click()
                  toast.success('QR Code diunduh')
                }}>Download PNG</Button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              QR Code ini permanen dan unik untuk {qrKaryawan.nama_karyawan}.<br/>
              Tidak dapat diubah.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Modal Tambah/Edit ── */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={editing ? 'Edit Karyawan' : 'Tambah Karyawan'} size="md">
        <div className="space-y-4">
          <div className="border-b pb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Pribadi</p>
          </div>

          {editing && (
            <FormField label="Kode Karyawan">
              <Input value={editing.kode_karyawan} disabled />
            </FormField>
          )}

          <FormField label="Nama Lengkap" required>
            <Input value={form.nama_karyawan}
              onChange={e => setForm(f => ({ ...f, nama_karyawan: e.target.value }))}
              placeholder="Nama lengkap karyawan" />
          </FormField>

          <FormField label="Tanggal Bergabung" required>
            <Input type="date" value={form.tanggal_bergabung}
              onChange={e => setForm(f => ({ ...f, tanggal_bergabung: e.target.value }))} />
          </FormField>

          <div className="border-b pb-2 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Jabatan & Departemen</p>
          </div>

          <FormField label="Golongan" required>
            <DropdownSelect
              value={form.jabatan_id}
              onChange={v => setForm(f => ({ ...f, jabatan_id: v }))}
              placeholder="Pilih golongan..."
              options={[
                { value: '', label: 'Pilih golongan...' },
                ...jabatan.map(j => ({ value: j.id, label: j.nama_jabatan })),
              ]}
            />
            {!editing && isJabatanMandor(jabatan.find(x => String(x.id) === String(form.jabatan_id))?.nama_jabatan) && (
              <p className="text-xs text-blue-600 mt-1.5">
                Golongan ini boleh punya akun aplikasi mobile. Buat setelah karyawan tersimpan, di menu{' '}
                <strong>Pengaturan → Akun Mobile (Mandor)</strong>.
              </p>
            )}
          </FormField>

          <FormField label="Departemen">
            <DropdownSelect
              value={form.departemen_id}
              onChange={v => setForm(f => ({ ...f, departemen_id: v }))}
              placeholder="Pilih departemen..."
              options={[
                { value: '', label: 'Pilih departemen...' },
                ...departemen.map(d => ({ value: d.id, label: d.nama_departemen })),
              ]}
            />
          </FormField>

          <FormField label="Status">
            <DropdownSelect
              value={form.status_aktif.toString()}
              onChange={v => setForm(f => ({ ...f, status_aktif: v === 'true' }))}
              options={[
                { value: 'true', label: 'Aktif' },
                { value: 'false', label: 'Non-aktif' },
              ]}
            />
          </FormField>

          <div className="border-b pb-2 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Komponen Gaji Karyawan</p>
          </div>

          <FormField label="Gaji Harian (Rp)" required help="Gaji per jam = nilai ini ÷ 8">
            <Input type="number" value={form.gaji_harian_override}
              onChange={e => setForm(f => ({ ...f, gaji_harian_override: e.target.value }))}
              placeholder="Contoh: 150000" />
          </FormField>

          <FormField label="Uang Makan (Rp)">
            <Input type="number" value={form.uang_makan_override}
              onChange={e => setForm(f => ({ ...f, uang_makan_override: e.target.value }))}
              placeholder="Contoh: 25000" />
          </FormField>

          <FormField label="Uang Transport (Rp)">
            <Input type="number" value={form.uang_transport_override}
              onChange={e => setForm(f => ({ ...f, uang_transport_override: e.target.value }))}
              placeholder="Contoh: 20000" />
          </FormField>

          <div className="border-b pb-2 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Info Pembayaran</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
            Metode pembayaran gaji: <strong>Tunai</strong>
          </div>

          {/* Info Kode Karyawan + QR */}
          {!editing && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2">
              <QrCode size={16} className="text-purple-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-purple-700">
                <strong>Kode Karyawan</strong> dan <strong>QR Code</strong> akan otomatis dibuat saat karyawan disimpan — permanen dan unik.
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>Batal</Button>
            <Button onClick={handleSave}>Simpan Data</Button>
          </div>
        </div>
      </Modal>

      {/* ── Detail Modal ── */}
      <Modal open={detailModal} onClose={() => setDetailModal(false)} title="Detail Karyawan" size="md">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-2xl font-bold text-blue-600">
                {selected.nama_karyawan?.[0]}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selected.nama_karyawan}</h3>
                <p className="text-sm text-gray-500">
                  {selected.jabatan?.nama_jabatan} · {selected.departemen?.nama_departemen || 'Tidak ada departemen'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">Kode: {selected.kode_karyawan}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${selected.status_aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {selected.status_aktif ? 'Aktif' : 'Non-aktif'}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Kode Karyawan', selected.kode_karyawan ?? '-'],
                ['Bergabung', formatTanggal(selected.tanggal_bergabung)],
                ['Pembayaran', 'Tunai'],
                ['Gaji Harian', formatRupiah(selected.gaji_harian_override || selected.jabatan?.gaji_harian)],
                ['Uang Makan', formatRupiah(selected.uang_makan_override || selected.jabatan?.uang_makan)],
                ['Uang Transport', formatRupiah(selected.uang_transport_override || selected.jabatan?.uang_transport)],
                ['Total/Hari', formatRupiah(
                  (selected.gaji_harian_override || selected.jabatan?.gaji_harian || 0) +
                  (selected.uang_makan_override || selected.jabatan?.uang_makan || 0) +
                  (selected.uang_transport_override || selected.jabatan?.uang_transport || 0)
                )],
              ].map(([l, v]) => (
                <div key={l} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{l}</p>
                  <p className="font-medium text-gray-900 truncate">{v}</p>
                </div>
              ))}
            </div>
            <Button variant="outline" icon={QrCode} className="w-full"
              onClick={() => { setDetailModal(false); openQRModal(selected) }}>
              Lihat QR Code
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Nonaktifkan Karyawan"
        message={`Nonaktifkan "${deleting?.nama_karyawan}"? Data histori tetap tersimpan.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)} />

      <ConfirmDialog
        open={bulkConfirm}
        title="Hapus Karyawan Terpilih"
        message={`Hapus ${selectedIds.size} karyawan terpilih secara permanen? Karyawan dengan kasbon belum lunas akan dilewati.`}
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkConfirm(false)} />
    </div>
  )
}