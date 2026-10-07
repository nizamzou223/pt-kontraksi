import { usePolling } from '../../utils/pageActivity'
import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, Smartphone, User, CheckCircle, AlertTriangle,
  X, RefreshCw, Eye, EyeOff, Building2, Lock, Unlock
} from 'lucide-react'
import {
  Card, Button, Modal, Input, FormField,
  Table, PageHeader, ConfirmDialog, SearchBar, DropdownSelect
} from '../common'
import supabase from '../../services/supabaseClient'
import { validatePassword } from '../../utils/security'
import { authService } from '../../services/authService'
import { isJabatanMandor, peranAkunUntukJabatan } from '../../utils/akunMobile'

const AUTO_REFRESH_MS = 60000

// ─────────────────────────────────────────────────────────────
// ROLE CONFIG
// ─────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  mandor: {
    label: 'Mandor Proyek',
    appName: 'Mandor App',
    color: 'bg-blue-100 text-blue-700',
    icon: '🏗️',
    desc: 'Akses: Presensi, Lembur, Kasbon, Permintaan Barang',
  },
  mandor_gudang: {
    label: 'Mandor Gudang',
    appName: 'Gudang App',
    color: 'bg-emerald-100 text-emerald-700',
    icon: '🏭',
    desc: 'Akses: Barang, Stok Masuk/Keluar, Validasi Permintaan',
  },
}

// ─────────────────────────────────────────────────────────────
// ALERT BANNER
// ─────────────────────────────────────────────────────────────
function AlertBanner({ type, title, message, onClose }) {
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles[type]} mb-4`}>
      <div className="flex-1">
        {title && <p className="font-semibold text-sm mb-0.5">{title}</p>}
        <p className="text-sm opacity-90 whitespace-pre-line">{message}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="p-0.5 rounded hover:bg-black/10">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MANDOR MANAGEMENT PAGE
// ─────────────────────────────────────────────────────────────
export function MandorManagement() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [karyawanList, setKaryawanList] = useState([])
  const [projectList, setProjectList] = useState([])
  const [modal, setModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [resetPass, setResetPass] = useState(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('semua')
  const [alert, setAlert] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [form, setForm] = useState({
    email: '',
    nama_lengkap: '',
    password: '',
    konfirmasi_password: '',
    role: 'mandor',
    project_id: '',
    status_aktif: true,
  })

  const showAlert = (type, title, message) => {
    setAlert({ type, title, message })
    if (type === 'success') setTimeout(() => setAlert(null), 5000)
  }

  // ── Load data ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, karyawanRes, projectRes] = await Promise.all([
        supabase
          .from('users')
          .select(`
            id, email, nama_lengkap, role, status_aktif,
            karyawan_id, project_id, created_at,
            project:project_id ( id, kode_project, nama_project )
          `)
          .in('role', ['mandor', 'mandor_gudang'])
          .order('created_at', { ascending: false }),

        supabase
          .from('karyawan')
          .select('id, nama_karyawan, kode_karyawan, status_aktif, jabatan:jabatan_id ( nama_jabatan )')
          .eq('status_aktif', true)
          .order('nama_karyawan'),

        supabase
          .from('project')
          .select('id, kode_project, nama_project, status_project')
          .eq('status_project', 'aktif')
          .order('nama_project'),
      ])

      if (usersRes.error) throw usersRes.error
      setData(usersRes.data || [])
      setKaryawanList(karyawanRes.data || [])
      setProjectList(projectRes.data || [])
    } catch (e) {
      toast.error('Gagal memuat data: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  usePolling(() => load(), AUTO_REFRESH_MS)

  // ── Open add/edit ─────────────────────────────────────────
  const openAdd = () => {
    setEditItem(null)
    setForm({
      email: '', nama_lengkap: '', password: '', konfirmasi_password: '',
      role: 'mandor', karyawan_id: '', project_id: '', status_aktif: true,
    })
    setAlert(null)
    setShowPassword(false)
    setModal(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      email: item.email,
      nama_lengkap: item.nama_lengkap,
      password: '',
      konfirmasi_password: '',
      role: item.role,
      karyawan_id: item.karyawan_id || '',
      project_id: item.project_id || '',
      status_aktif: item.status_aktif,
    })
    setAlert(null)
    setShowPassword(false)
    setModal(true)
  }

  // ── Save (add/edit) ───────────────────────────────────────
  const handleSave = async () => {
    // Validasi
    if (!form.email || !form.nama_lengkap) {
      return showAlert('error', 'Validasi Gagal', 'Email dan nama lengkap wajib diisi.')
    }
    if (!editItem) {
      if (!form.password) return showAlert('error', 'Password Wajib', 'Password wajib diisi untuk akun baru.')
      { const pwErr = validatePassword(form.password); if (pwErr) return showAlert('error', 'Password Lemah', pwErr) }
      if (form.password !== form.konfirmasi_password)
        return showAlert('error', 'Password Tidak Cocok', 'Konfirmasi password tidak sesuai.')
    }
    if (form.password && validatePassword(form.password)) {
      return showAlert('error', 'Password Lemah', validatePassword(form.password))
    }
    if (form.password && form.password !== form.konfirmasi_password) {
      return showAlert('error', 'Password Tidak Cocok', 'Konfirmasi password tidak sesuai.')
    }

    setSaving(true)
    try {
      if (editItem) {
        // ── EDIT: update public.users ────────────────────────
        const payload = {
          nama_lengkap: form.nama_lengkap,
          role: form.role,
          karyawan_id: form.karyawan_id || null,
          project_id: form.project_id || null,
          status_aktif: form.status_aktif,
          updated_at: new Date().toISOString(),
        }
        const { error: dbErr } = await supabase
          .from('users').update(payload).eq('id', editItem.id)
        if (dbErr) throw dbErr

        // Update password jika diisi — lewat Edge Function (service_role di server)
        if (form.password) {
          try {
            await authService.adminSetPassword(form.email.toLowerCase().trim(), form.password)
          } catch (pwErr) {
            throw new Error('Data akun tersimpan, tetapi password gagal diganti: ' + pwErr.message)
          }
        }

        toast.success(`Akun ${form.nama_lengkap} berhasil diperbarui!`)
        showAlert('success', 'Berhasil', `Data akun ${form.nama_lengkap} telah diperbarui.`)

      } else {
        // ── TAMBAH BARU ──────────────────────────────────────
        // 1. Cek email sudah ada di users tabel
        const { data: existing } = await supabase
          .from('users').select('id').eq('email', form.email.toLowerCase()).maybeSingle()
        if (existing) throw new Error(`Email ${form.email} sudah terdaftar.`)

        // 1b. Satu karyawan hanya boleh punya satu akun mobile
        if (form.karyawan_id && data.some(d => String(d.karyawan_id) === String(form.karyawan_id))) {
          throw new Error('Karyawan ini sudah punya akun mobile. Edit akun yang ada, jangan buat baru.')
        }

        // 2. Daftarkan ke Supabase Auth (dengan auto-confirm)
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: form.email.toLowerCase().trim(),
          password: form.password,
          options: {
            data: { nama_lengkap: form.nama_lengkap, role: form.role },
            emailRedirectTo: null,
          },
        })
        if (authErr) throw authErr

        // Auto-confirm email via SQL (jika admin)
        try {
          await supabase.rpc('confirm_user_email', {
            user_email: form.email.toLowerCase().trim()
          })
        } catch (_) {
          // Fungsi RPC mungkin belum ada - tidak fatal
        }

        // 3. Insert ke public.users
        const { error: dbErr } = await supabase.from('users').insert({
          email: form.email.toLowerCase().trim(),
          nama_lengkap: form.nama_lengkap,
          password_hash: 'managed_by_supabase_auth',
          role: form.role,
          karyawan_id: form.karyawan_id || null,
          project_id: form.project_id || null,
          status_aktif: true,
        })
        if (dbErr) throw dbErr

        const roleInfo = ROLE_CONFIG[form.role]
        toast.success(`Akun ${form.nama_lengkap} berhasil ditambahkan!`)
        showAlert(
          'success',
          '✓ Akun Berhasil Dibuat',
          `Nama: ${form.nama_lengkap}\nEmail: ${form.email}\nAplikasi: ${roleInfo.appName}\n\n⚠️ Jika email konfirmasi diperlukan, minta user cek inbox.`
        )
      }

      setModal(false)
      load()
    } catch (e) {
      showAlert('error', 'Gagal Menyimpan', e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Hapus ─────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('users').delete().eq('id', deleting.id)
      if (error) throw error
      toast.success('Akun mandor dihapus')
      setDeleting(null)
      load()
    } catch (e) { toast.error(e.message) }
  }

  // ── Toggle status aktif ───────────────────────────────────
  const toggleStatus = async (item) => {
    const newStatus = !item.status_aktif
    try {
      const { error } = await supabase
        .from('users')
        .update({ status_aktif: newStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id)
      if (error) throw error
      toast.success(`${item.nama_lengkap} ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`)
      load()
    } catch (e) { toast.error(e.message) }
  }

  // ── Filter ────────────────────────────────────────────────
  const filtered = data.filter(d => {
    const matchRole = filterRole === 'semua' || d.role === filterRole
    const matchSearch =
      d.nama_lengkap?.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.includes(search)
    return matchRole && matchSearch
  })

  const countByRole = (role) => data.filter(d => d.role === role).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manajemen Akun Mobile"
        subtitle="Kelola akun login untuk Aplikasi Mandor & Gudang"
        action={<Button icon={Plus} onClick={openAdd}>Tambah Akun</Button>}
      />

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Smartphone size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Cara Kerja Login Mobile</p>
          <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
            Akun yang dibuat di sini langsung bisa digunakan untuk login di aplikasi mobile.
            <strong> Mandor App</strong> → role <code className="bg-blue-100 px-1 rounded">mandor</code>.
            <strong> Gudang App</strong> → role <code className="bg-blue-100 px-1 rounded">mandor_gudang</code>.
            Hubungkan akun ke <strong>Karyawan</strong> agar data presensi & penggajian tersambung.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-lg">🏗️</div>
          <div>
            <p className="text-xs text-gray-500">Mandor Proyek</p>
            <p className="text-2xl font-bold text-gray-900">{countByRole('mandor')}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-lg">🏭</div>
          <div>
            <p className="text-xs text-gray-500">Mandor Gudang</p>
            <p className="text-2xl font-bold text-gray-900">{countByRole('mandor_gudang')}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <CheckCircle size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Aktif</p>
            <p className="text-2xl font-bold text-gray-900">{data.filter(d => d.status_aktif).length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
            <AlertTriangle size={20} className="text-gray-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Non Aktif</p>
            <p className="text-2xl font-bold text-gray-900">{data.filter(d => !d.status_aktif).length}</p>
          </div>
        </div>
      </div>

      {/* Filter + Tabel */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Cari nama / email mandor..."
            className="flex-1"
          />
          <DropdownSelect
            value={filterRole}
            onChange={v => setFilterRole(v)}
            className="min-w-[160px]"
            options={[
              { value: 'semua', label: 'Semua Role' },
              { value: 'mandor', label: 'Mandor Proyek' },
              { value: 'mandor_gudang', label: 'Mandor Gudang' },
            ]}
          />
        </div>

        <Table
          loading={loading}
          data={filtered}
          emptyMessage="Belum ada akun mandor. Klik 'Tambah Akun' untuk membuat."
          columns={[
            {
              header: 'Nama & Email',
              render: r => (
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.nama_lengkap}</p>
                  <p className="text-xs text-gray-400">{r.email}</p>
                </div>
              ),
            },
            {
              header: 'Role / Aplikasi',
              render: r => {
                const cfg = ROLE_CONFIG[r.role] || { label: r.role, color: 'bg-gray-100 text-gray-700', appName: '-', icon: '👤' }
                return (
                  <div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">{cfg.appName}</p>
                  </div>
                )
              },
            },

            {
              header: 'Proyek Default',
              render: r => r.project ? (
                <div>
                  <p className="text-xs font-medium">{r.project.nama_project}</p>
                  <p className="text-xs text-gray-400">{r.project.kode_project}</p>
                </div>
              ) : (
                <span className="text-xs text-gray-400">Tidak ada</span>
              ),
            },
            {
              header: 'Status',
              render: r => (
                <button
                  onClick={() => toggleStatus(r)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                    r.status_aktif
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                  title={r.status_aktif ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                >
                  {r.status_aktif ? <><CheckCircle size={11} /> Aktif</> : <><AlertTriangle size={11} /> Non Aktif</>}
                </button>
              ),
            },
            {
              header: 'Aksi',
              render: r => (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(r)}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-colors"
                    title="Edit"
                  >
                    <User size={15} />
                  </button>
                  <button
                    onClick={() => setDeleting(r)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                    title="Hapus"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* ── Modal Tambah / Edit ── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editItem ? `Edit: ${editItem.nama_lengkap}` : 'Tambah Akun Mobile'}
        size="lg"
      >
        <div className="space-y-4">
          {alert && (
            <AlertBanner
              type={alert.type}
              title={alert.title}
              message={alert.message}
              onClose={() => setAlert(null)}
            />
          )}

          {/* Role selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pilih Aplikasi / Role</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(ROLE_CONFIG).map(([role, cfg]) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, role }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    form.role === role
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="text-lg mb-1">{cfg.icon}</p>
                  <p className="text-sm font-semibold text-gray-900">{cfg.appName}</p>
                  <p className="text-xs text-gray-500">{cfg.label}</p>
                  <p className="text-xs text-gray-400 mt-1">{cfg.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Info role terpilih */}
          {form.role && ROLE_CONFIG[form.role] && (
            <div className={`p-3 rounded-lg text-xs border ${
              form.role === 'mandor'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <strong>Login di:</strong> {ROLE_CONFIG[form.role].appName} &nbsp;|&nbsp;
              <strong>Role:</strong> <code className="bg-white px-1 rounded">{form.role}</code>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Nama Lengkap" required>
                <Input
                  value={form.nama_lengkap}
                  onChange={e => setForm(f => ({ ...f, nama_lengkap: e.target.value }))}
                  placeholder="Ahmad Fauzi"
                />
              </FormField>
              <FormField label="Email Login" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="mandor@kalipelus.com"
                  disabled={!!editItem}
                />
              </FormField>
            </div>

            {/* Password */}
            <div className="grid grid-cols-2 gap-4">
              <FormField label={editItem ? 'Password Baru (kosongkan jika tidak ganti)' : 'Password'} required={!editItem}>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min. 8 karakter, huruf & angka"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </FormField>
              <FormField label="Konfirmasi Password" required={!editItem && !!form.password}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={form.konfirmasi_password}
                  onChange={e => setForm(f => ({ ...f, konfirmasi_password: e.target.value }))}
                  placeholder="Ulangi password"
                />
              </FormField>
            </div>

            {/* Password requirements */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-600 mb-1">Syarat Password:</p>
              <div className="flex gap-4">
                <span className={`text-xs flex items-center gap-1 ${!validatePassword(form.password) ? 'text-green-600' : 'text-gray-400'}`}>
                  {!validatePassword(form.password) ? '✓' : '○'} Min 8 karakter, huruf & angka
                </span>
                <span className={`text-xs flex items-center gap-1 ${form.password && form.password === form.konfirmasi_password ? 'text-green-600' : 'text-gray-400'}`}>
                  {form.password && form.password === form.konfirmasi_password ? '✓' : '○'} Password cocok
                </span>
              </div>
            </div>
          </div>

          {/* Proyek Default */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Hubungkan ke Data Sistem
            </p>
            <FormField
              label="Karyawan Terkait"
              hint="Otomatis berisi karyawan berjabatan Mandor dari Master Data — mengisi Kode Karyawan di profil mobile & menautkan presensi/lembur/kasbon. Peran akun mengikuti jabatannya."
            >
              <DropdownSelect
                value={form.karyawan_id || ''}
                onChange={v => {
                  const k = karyawanList.find(x => String(x.id) === String(v))
                  const peranBoleh = peranAkunUntukJabatan(k?.jabatan?.nama_jabatan)
                  setForm(f => ({
                    ...f,
                    karyawan_id: v,
                    nama_lengkap: f.nama_lengkap || k?.nama_karyawan || f.nama_lengkap,
                    role: peranBoleh.length === 1 ? peranBoleh[0] : f.role,
                  }))
                }}
                placeholder="-- Tanpa karyawan terkait --"
                options={[
                  { value: '', label: '-- Tanpa karyawan terkait --' },
                  ...karyawanList
                    .filter(k => isJabatanMandor(k.jabatan?.nama_jabatan))
                    .filter(k => String(k.id) === String(form.karyawan_id) ||
                      !data.some(d => d.id !== editItem?.id && String(d.karyawan_id) === String(k.id)))
                    .map(k => ({
                      value: String(k.id),
                      label: `${k.nama_karyawan} — Kode ${k.kode_karyawan ?? '-'} (${k.jabatan?.nama_jabatan})`,
                    })),
                ]}
              />
              {karyawanList.length > 0 && karyawanList.every(k => !isJabatanMandor(k.jabatan?.nama_jabatan)) && (
                <p className="text-xs text-amber-600 mt-1.5">
                  Belum ada karyawan berjabatan Mandor di Master Data. Tambahkan lewat Master Data → Karyawan terlebih dahulu.
                </p>
              )}
            </FormField>
            <FormField
              label="Proyek Default"
              hint="Proyek yang otomatis terpilih saat login (opsional)"
            >
              <DropdownSelect
                value={form.project_id}
                onChange={v => setForm(f => ({ ...f, project_id: v }))}
                placeholder="-- Pilih Proyek (opsional) --"
                options={[
                  { value: '', label: '-- Pilih Proyek (opsional) --' },
                  ...projectList.map(p => ({ value: String(p.id), label: `${p.nama_project} (${p.kode_project})` })),
                ]}
              />
            </FormField>
          </div>

          {/* Status aktif (edit only) */}
          {editItem && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <label className="text-sm font-medium text-gray-700">Status Akun:</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, status_aktif: !f.status_aktif }))}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  form.status_aktif
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                {form.status_aktif
                  ? <><CheckCircle size={14} /> Aktif — Bisa Login</>
                  : <><AlertTriangle size={14} /> Non Aktif — Tidak Bisa Login</>
                }
              </button>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModal(false)}>Batal</Button>
            <Button onClick={handleSave} loading={saving} icon={editItem ? User : Plus}>
              {editItem ? 'Simpan Perubahan' : 'Buat Akun'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleting}
        title="Hapus Akun Mandor"
        message={`Hapus akun "${deleting?.nama_lengkap}" (${deleting?.email})?\n\nAkun ini tidak akan bisa login ke aplikasi mobile lagi.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}

export default MandorManagement
