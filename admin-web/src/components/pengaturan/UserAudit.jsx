import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, Activity, ShieldCheck, AlertTriangle, CheckCircle, X, RefreshCw, Crown } from 'lucide-react'
import { Card, Button, Modal, Input, FormField, Table, PageHeader, ConfirmDialog, SearchBar } from '../common'
import supabase from '../../services/supabaseClient'
import { auditService } from '../../services/auditService'
import { formatTanggal } from '../../utils/formatters'
import { validatePassword } from '../../utils/security'

const AUTO_REFRESH_MS = 60000

// ======================== ANIMATED ALERT ========================
function AlertBanner({ type, title, message, onClose }) {
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const icons = {
    success: <CheckCircle size={18} className="text-green-600 flex-shrink-0" />,
    error: <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />,
    warning: <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />,
    info: <ShieldCheck size={18} className="text-blue-600 flex-shrink-0" />,
  }
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles[type]} animate-slideDown`}>
      {icons[type]}
      <div className="flex-1">
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        <p className="text-sm opacity-90">{message}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/10 transition-colors">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ======================== USER MANAGEMENT ========================
export function UserList() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [search, setSearch] = useState('')
  const [alert, setAlert] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ email: '', nama_lengkap: '', password: '', konfirmasi_password: '' })

  const showAlert = (type, title, message) => {
    setAlert({ type, title, message })
    if (type === 'success') setTimeout(() => setAlert(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Hanya ambil admin
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'admin')
        .order('created_at')
      if (error) throw error
      setData(userData || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto refresh
  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(), AUTO_REFRESH_MS)

  const openAdd = () => {
    setForm({ email: '', nama_lengkap: '', password: '', konfirmasi_password: '' })
    setAlert(null)
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.email || !form.nama_lengkap) return showAlert('error', 'Validasi Gagal', 'Email dan nama lengkap wajib diisi.')
    if (!form.password) return showAlert('error', 'Validasi Gagal', 'Password wajib diisi untuk admin baru.')
    { const pwErr = validatePassword(form.password); if (pwErr) return showAlert('error', 'Password Lemah', pwErr) }
    if (form.password !== form.konfirmasi_password) return showAlert('error', 'Password Tidak Cocok', 'Konfirmasi password tidak sesuai.')

    setSaving(true)
    try {
      // 1. Daftarkan di Supabase Auth agar bisa login
      //    (API admin TIDAK tersedia di browser — butuh service_role — jadi signUp biasa)
      const { error: signUpErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { nama_lengkap: form.nama_lengkap } }
      })
      if (signUpErr) throw signUpErr

      // Konfirmasi otomatis (RPC hanya bisa dipanggil admin yang login)
      try { await supabase.rpc('confirm_user_email', { user_email: form.email.toLowerCase().trim() }) } catch (_) { /* tidak fatal */ }

      // 2. Insert ke public.users
      const { error: dbErr } = await supabase.from('users').insert({
        email: form.email,
        nama_lengkap: form.nama_lengkap,
        password_hash: 'managed_by_supabase_auth',
        role: 'admin',
        status_aktif: true,
      })
      if (dbErr) throw dbErr

      toast.success('Admin berhasil ditambahkan!')
      showAlert('success', 'Admin Ditambahkan', `${form.nama_lengkap} (${form.email}) berhasil ditambahkan. Cek email untuk konfirmasi jika diperlukan.`)
      setModal(false)
      load()
    } catch (e) {
      showAlert('error', 'Gagal Menambahkan Admin', e.message)
    } finally {
      setSaving(false)
    }
  }

  const adminCount = data.length
  const handleDelete = async () => {
    if (adminCount <= 1) {
      toast.error('Tidak bisa menghapus. Harus ada minimal 1 admin aktif!')
      setDeleting(null)
      return
    }
    try {
      const { error } = await supabase.from('users').delete().eq('id', deleting.id)
      if (error) throw error
      toast.success('Admin dihapus')
      setDeleting(null)
      load()
    } catch (e) { toast.error(e.message) }
  }

  const filtered = data.filter(d =>
    d.nama_lengkap?.toLowerCase().includes(search.toLowerCase()) ||
    d.email?.includes(search)
  )

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
      `}</style>

      <PageHeader title="Manajemen Admin"
        subtitle="Kelola akun admin sistem — minimal 1 admin harus selalu aktif"
        action={<Button icon={Plus} onClick={openAdd}>Tambah Admin</Button>} />

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Manajemen Akun Admin</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Hanya role <strong>admin</strong> yang dikelola di sini. Admin yang tersisa hanya 1 tidak dapat dihapus demi keamanan sistem.
            Email/password yang didaftarkan akan langsung bisa digunakan untuk login.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><ShieldCheck size={20} className="text-blue-600" /></div>
          <div><p className="text-xs text-gray-500">Total Admin</p><p className="text-2xl font-bold text-gray-900">{adminCount}</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
          <div><p className="text-xs text-gray-500">Aktif</p><p className="text-2xl font-bold text-gray-900">{data.filter(d => d.status_aktif).length}</p></div>
        </div>
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${adminCount <= 1 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${adminCount <= 1 ? 'bg-amber-100' : 'bg-gray-100'}`}>
            <AlertTriangle size={20} className={adminCount <= 1 ? 'text-amber-600' : 'text-gray-400'} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Status Hapus</p>
            <p className={`text-sm font-semibold ${adminCount <= 1 ? 'text-amber-700' : 'text-green-700'}`}>
              {adminCount <= 1 ? 'Terkunci (1 admin)' : 'Bisa Hapus'}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <div className="mb-4"><SearchBar value={search} onChange={setSearch} placeholder="Cari nama / email admin..." /></div>
        <Table loading={loading} data={filtered} emptyMessage="Belum ada admin terdaftar" columns={[
          {
            header: 'Admin', render: r => (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm">
                  {r.nama_lengkap?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm">{r.nama_lengkap}</p>
                    {data.indexOf(r) === 0 && <Crown size={12} className="text-amber-500" title="Admin pertama" />}
                  </div>
                  <p className="text-xs text-gray-400">{r.email}</p>
                </div>
              </div>
            )
          },
          {
            header: 'Role', render: () => (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                <ShieldCheck size={10} /> ADMIN
              </span>
            )
          },
          {
            header: 'Status', render: r => (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status_aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {r.status_aktif ? '● Aktif' : '○ Non-aktif'}
              </span>
            )
          },
          { header: 'Terdaftar', render: r => formatTanggal(r.created_at) },
          {
            header: 'Aksi', className: 'w-20', render: r => {
              const isLast = adminCount <= 1
              return (
                <div className="flex gap-1">
                  <button
                    onClick={() => isLast ? toast.error('Tidak bisa menghapus admin terakhir!') : setDeleting(r)}
                    className={`p-1.5 rounded transition-colors ${isLast ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-red-50 text-red-600'}`}
                    title={isLast ? 'Admin terakhir tidak bisa dihapus' : 'Hapus admin'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            }
          },
        ]} />
      </Card>

      {/* Modal Tambah Admin */}
      <Modal open={modal} onClose={() => setModal(false)} title="Tambah Admin Baru" size="sm">
        <div className="space-y-4">
          {alert && (
            <AlertBanner type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Email dan password yang dimasukkan akan langsung bisa digunakan untuk login ke sistem.
              Pastikan data sudah benar sebelum menyimpan.
            </p>
          </div>

          <FormField label="Nama Lengkap" required>
            <Input value={form.nama_lengkap} onChange={e => setForm(f => ({ ...f, nama_lengkap: e.target.value }))} placeholder="Nama admin..." />
          </FormField>
          <FormField label="Email" required>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@perusahaan.com" />
          </FormField>
          <FormField label="Password" required>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimal 8 karakter, huruf & angka" />
          </FormField>
          <FormField label="Konfirmasi Password" required>
            <Input type="password" value={form.konfirmasi_password} onChange={e => setForm(f => ({ ...f, konfirmasi_password: e.target.value }))} placeholder="Ulangi password" />
          </FormField>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Syarat Password:</p>
            <ul className="text-xs text-gray-500 space-y-0.5">
              <li className={`flex items-center gap-1 ${!validatePassword(form.password) ? 'text-green-600' : ''}`}>
                {!validatePassword(form.password) ? '✓' : '○'} Minimal 8 karakter, huruf & angka
              </li>
              <li className={`flex items-center gap-1 ${form.password && form.password === form.konfirmasi_password ? 'text-green-600' : ''}`}>
                {form.password && form.password === form.konfirmasi_password ? '✓' : '○'} Password cocok
              </li>
            </ul>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setModal(false)}>Batal</Button>
            <Button onClick={handleSave} loading={saving} icon={ShieldCheck}>Tambah Admin</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Hapus Admin"
        message={`Hapus admin "${deleting?.nama_lengkap}" (${deleting?.email})? Admin ini tidak akan bisa login lagi.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

// ======================== AUDIT LOG ========================
export function AuditLog() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ tanggal_dari: '', tanggal_sampai: '', aksi: '', tabel_target: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const f = {}
      if (filters.tanggal_dari) f.tanggal_dari = filters.tanggal_dari
      if (filters.tanggal_sampai) f.tanggal_sampai = filters.tanggal_sampai
      if (filters.aksi) f.aksi = filters.aksi
      if (filters.tabel_target) f.tabel_target = filters.tabel_target
      setData(await auditService.getAuditLog(f))
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { load() }, [])

  // Auto refresh — hanya saat tab terlihat & halaman aktif (lihat utils/pageActivity)
  usePolling(() => load(), AUTO_REFRESH_MS)

  const getAksiColor = (aksi) => {
    if (aksi?.includes('Tambah') || aksi?.includes('Create')) return 'bg-green-100 text-green-700'
    if (aksi?.includes('Update') || aksi?.includes('Edit')) return 'bg-blue-100 text-blue-700'
    if (aksi?.includes('Hapus') || aksi?.includes('Delete')) return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" subtitle="Riwayat semua perubahan data sistem"
        action={<Button icon={RefreshCw} onClick={load} variant="outline" size="sm">Refresh</Button>} />
      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div><label className="text-xs text-gray-500 block mb-1">Dari Tanggal</label><Input type="date" value={filters.tanggal_dari} onChange={e => setFilters(f => ({ ...f, tanggal_dari: e.target.value }))} /></div>
          <div><label className="text-xs text-gray-500 block mb-1">Sampai Tanggal</label><Input type="date" value={filters.tanggal_sampai} onChange={e => setFilters(f => ({ ...f, tanggal_sampai: e.target.value }))} /></div>
          <div><label className="text-xs text-gray-500 block mb-1">Cari Aksi</label><Input value={filters.aksi} onChange={e => setFilters(f => ({ ...f, aksi: e.target.value }))} placeholder="Tambah, Update..." /></div>
          <div><label className="text-xs text-gray-500 block mb-1">Tabel</label><Input value={filters.tabel_target} onChange={e => setFilters(f => ({ ...f, tabel_target: e.target.value }))} placeholder="karyawan, presensi..." /></div>
        </div>
        <Button onClick={load} size="sm" className="mb-4">Terapkan Filter</Button>
        <Table loading={loading} data={data} columns={[
          {
            header: 'Waktu', render: r => (
              <div>
                <p className="text-xs font-medium">{formatTanggal(r.created_at)}</p>
                <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            )
          },
          { header: 'User', render: r => (<div><p className="text-sm font-medium">{r.users?.nama_lengkap || 'System'}</p><p className="text-xs text-gray-400">{r.users?.email}</p></div>) },
          { header: 'Aksi', render: r => (<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAksiColor(r.aksi)}`}>{r.aksi}</span>) },
          { header: 'Tabel', render: r => r.tabel_target ? <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.tabel_target}</span> : '-' },
          { header: 'ID', render: r => r.id_target ? <span className="text-xs text-gray-400">#{r.id_target}</span> : '-' },
          { header: 'Project', render: r => r.project?.nama_project || <span className="text-gray-400">-</span> },
        ]} />
      </Card>
    </div>
  )
}
