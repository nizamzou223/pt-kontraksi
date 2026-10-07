// Uji keamanan aktif terhadap API Supabase — meniru penyerang yang hanya punya anon key
// (kunci ini publik: ada di bundle web & APK).
//
//   npm run test:security
//
// Aturan keselamatan skrip ini (TIDAK mengubah data):
//   • Baca  : hanya meminta 1 baris/tabel dan hanya melaporkan JUMLAH, tidak menampilkan isi.
//   • Tulis : payload sengaja tidak valid ({ id: 'x' }) atau filter id = -1 → tidak mungkin
//             menulis/menghapus baris, tetapi cukup untuk membedakan "ditolak izin" (42501)
//             dari "izin ada, gagal di validasi".
//   • Peran : pengujian login (admin/mandor) memakai akun UJI dari env, bukan akun produksi.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

// ── Muat .env tanpa dependensi tambahan ─────────────────────────────
function loadEnv() {
  const p = path.join(here, '..', '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const URL_ = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!URL_ || !KEY) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diset (.env)')
  process.exit(2)
}

const TABLES = [
  'departemen', 'jabatan', 'karyawan', 'karyawan_qr_code', 'project', 'project_karyawan',
  'presensi', 'lembur', 'kasbon', 'kategori_barang', 'satuan_barang', 'barang',
  'stok_masuk', 'stok_keluar', 'permintaan_barang', 'retur_barang',
  'rekap_gaji_mingguan', 'rekap_gaji_bulanan', 'pembayaran_otomatis', 'users', 'audit_log',
]
const SALARY_TABLES = ['rekap_gaji_mingguan', 'rekap_gaji_bulanan', 'pembayaran_otomatis']

const results = [] // { grup, uji, status: 'PASS'|'FAIL'|'INFO'|'SKIP', detail }
const add = (grup, uji, status, detail = '') => results.push({ grup, uji, status, detail })
const denied = (err) => !!err && (err.code === '42501' || /permission denied|row-level security|not allowed/i.test(err.message || ''))

const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ═══ A. PENGUNJUNG ANONIM (tanpa login) ═════════════════════════════
async function anonSuite() {
  const anon = mk()
  for (const t of TABLES) {
    // A1 baca
    const r = await anon.from(t).select('*').limit(1)
    if (r.error && denied(r.error)) add('A. Anonim', `SELECT ${t}`, 'PASS', 'ditolak (izin)')
    else if (r.error) add('A. Anonim', `SELECT ${t}`, 'INFO', `error non-izin: ${r.error.code} ${r.error.message}`)
    else if ((r.data || []).length === 0) add('A. Anonim', `SELECT ${t}`, 'PASS', '0 baris terlihat')
    else add('A. Anonim', `SELECT ${t}`, 'FAIL', `BOCOR: anon bisa membaca data (≥${r.data.length} baris)`)

    // A2 tulis (payload tidak valid → tidak mungkin menulis)
    const w = await anon.from(t).insert({ id: 'bukan-angka' })
    add('A. Anonim', `INSERT ${t}`, denied(w.error) ? 'PASS' : 'FAIL',
      denied(w.error) ? 'ditolak (izin)' : `anon punya hak INSERT (${w.error?.code || 'ok'})`)

    // A3 ubah & hapus (filter mustahil → 0 baris terpengaruh)
    const u = await anon.from(t).update({ id: -1 }).eq('id', -1)
    add('A. Anonim', `UPDATE ${t}`, denied(u.error) ? 'PASS' : 'FAIL',
      denied(u.error) ? 'ditolak (izin)' : 'anon punya hak UPDATE')
    const d = await anon.from(t).delete().eq('id', -1)
    add('A. Anonim', `DELETE ${t}`, denied(d.error) ? 'PASS' : 'FAIL',
      denied(d.error) ? 'ditolak (izin)' : 'anon punya hak DELETE')
  }

  // A4 RPC berbahaya yang dulu terbuka untuk anon
  const c = await anon.rpc('confirm_user_email', { user_email: 'tidak-ada@invalid.local' })
  add('A. Anonim', 'RPC confirm_user_email',
    denied(c.error) ? 'PASS' : (c.error?.code === 'PGRST202' ? 'INFO' : 'FAIL'),
    denied(c.error) ? 'ditolak (hanya admin login)'
      : c.error?.code === 'PGRST202' ? 'fungsi tidak ada'
      : 'anon bisa memverifikasi email akun mana pun')

  // RPC stok (kurangi_stok_keluar, tambah_stok_masuk*) sengaja TIDAK di-probe: argumennya
  // harus cocok dengan signature dan bisa benar-benar dieksekusi. Fungsi itu SECURITY INVOKER,
  // jadi terlindungi oleh izin tabel yang sudah diuji di atas.

  const e = await anon.rpc('email_for_kode_karyawan', { p_kode: '999999999' })
  add('A. Anonim', 'RPC email_for_kode_karyawan (kode acak)',
    e.error ? 'INFO' : (e.data === null ? 'PASS' : 'FAIL'),
    e.error ? `tidak tersedia: ${e.error.message} (jalankan MIGRATION_KODE_KARYAWAN.sql)` : 'Kode tak dikenal → null (tidak membocorkan data)')

  // A5 signUp terbuka? (informasional — tidak membuat akun: email tidak valid ditolak lebih dulu)
  const s = await anon.auth.signUp({ email: 'bukan-email', password: 'x' })
  add('A. Anonim', 'Auth signUp memvalidasi input', s.error ? 'PASS' : 'FAIL', s.error?.message || '')
}

// ═══ B. PENGGUNA LOGIN (akun uji) ═══════════════════════════════════
async function login(email, password) {
  const c = mk()
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) return { error }
  return { client: c, user: data.user }
}

async function adminSuite() {
  const { TEST_ADMIN_EMAIL: em, TEST_ADMIN_PASSWORD: pw } = process.env
  if (!em || !pw) return add('B. Admin', 'seluruh suite', 'SKIP', 'set TEST_ADMIN_EMAIL/PASSWORD untuk mengaktifkan')
  const s = await login(em, pw)
  if (s.error) return add('B. Admin', 'login akun uji', 'FAIL', s.error.message)
  add('B. Admin', 'login akun uji', 'PASS')
  for (const t of ['users', 'karyawan', 'project', ...SALARY_TABLES]) {
    const r = await s.client.from(t).select('id').limit(1)
    add('B. Admin', `SELECT ${t} (harus bisa)`, r.error ? 'FAIL' : 'PASS', r.error?.message || '')
  }
  const c = await s.client.rpc('confirm_user_email', { user_email: 'tidak-ada@invalid.local' })
  add('B. Admin', 'RPC confirm_user_email (admin boleh)', c.error ? 'FAIL' : 'PASS', c.error?.message || '')
}

async function mandorSuite() {
  const { TEST_MANDOR_EMAIL: em, TEST_MANDOR_PASSWORD: pw } = process.env
  if (!em || !pw) return add('C. Mandor', 'seluruh suite', 'SKIP', 'set TEST_MANDOR_EMAIL/PASSWORD untuk mengaktifkan')
  const s = await login(em, pw)
  if (s.error) return add('C. Mandor', 'login akun uji', 'FAIL', s.error.message)
  add('C. Mandor', 'login akun uji', 'PASS')
  const cl = s.client

  // C1 hanya melihat baris users miliknya
  const u = await cl.from('users').select('email')
  const onlySelf = !u.error && (u.data || []).every((r) => r.email.toLowerCase() === em.toLowerCase())
  add('C. Mandor', 'users: hanya baris sendiri', onlySelf ? 'PASS' : 'FAIL', u.error?.message || `${(u.data || []).length} baris terlihat`)

  // C2 data gaji tertutup
  for (const t of SALARY_TABLES) {
    const r = await cl.from(t).select('id').limit(1)
    const ok = r.error ? denied(r.error) : (r.data || []).length === 0
    add('C. Mandor', `${t} tertutup`, ok ? 'PASS' : 'FAIL', r.error?.message || `${(r.data || []).length} baris`)
    const w = await cl.from(t).insert({ id: 'bukan-angka' })
    add('C. Mandor', `INSERT ${t} ditolak`, w.error && w.error.code !== '22P02' ? 'PASS' : 'FAIL', w.error?.message || 'lolos')
  }

  // C3 isolasi proyek: semua project_id yang terlihat ⊆ proyek yang boleh dilihat
  const pr = await cl.from('project').select('id')
  const allowed = new Set((pr.data || []).map((p) => p.id))
  for (const t of ['presensi', 'lembur', 'kasbon', 'barang', 'stok_masuk', 'stok_keluar', 'permintaan_barang', 'retur_barang']) {
    const r = await cl.from(t).select('project_id').limit(1000)
    if (r.error) { add('C. Mandor', `isolasi proyek ${t}`, 'FAIL', r.error.message); continue }
    const leak = (r.data || []).filter((x) => !allowed.has(x.project_id))
    add('C. Mandor', `isolasi proyek ${t}`, leak.length === 0 ? 'PASS' : 'FAIL',
      leak.length ? `${leak.length} baris milik proyek lain terlihat` : `${(r.data || []).length} baris, semua proyek sendiri`)
  }

  // C4 tidak bisa mengubah baris users (eskalasi peran) — update no-op agar aman jika bocor
  const me = await cl.from('users').select('id, nama_lengkap').eq('email', em).maybeSingle()
  if (me.data) {
    const up = await cl.from('users').update({ nama_lengkap: me.data.nama_lengkap }).eq('id', me.data.id).select()
    const blocked = !!up.error || (up.data || []).length === 0
    add('C. Mandor', 'tidak bisa mengubah tabel users (anti-eskalasi)', blocked ? 'PASS' : 'FAIL',
      blocked ? 'ditolak' : 'mandor dapat menulis ke users → bisa menjadikan dirinya admin')
  }

  // C5 confirm_user_email hanya admin
  const c = await cl.rpc('confirm_user_email', { user_email: 'tidak-ada@invalid.local' })
  add('C. Mandor', 'RPC confirm_user_email ditolak', denied(c.error) ? 'PASS' : 'FAIL', c.error?.message || 'lolos')
}

// ═══ Jalankan & laporkan ═════════════════════════════════════════════
await anonSuite()
await adminSuite()
await mandorSuite()

const icon = { PASS: '✅', FAIL: '❌', INFO: 'ℹ️ ', SKIP: '⏭️ ' }
let lastGroup = ''
for (const r of results) {
  if (r.grup !== lastGroup) { console.log(`\n── ${r.grup} ──`); lastGroup = r.grup }
  console.log(`${icon[r.status]} ${r.uji}${r.detail ? '  — ' + r.detail : ''}`)
}
const n = (s) => results.filter((r) => r.status === s).length
console.log(`\nRINGKASAN: ${n('PASS')} lulus · ${n('FAIL')} GAGAL · ${n('INFO')} info · ${n('SKIP')} dilewati`)

const md = [
  '# Laporan Uji Keamanan (RLS Audit)',
  `Waktu: ${new Date().toISOString()}`,
  `Ringkasan: ${n('PASS')} lulus, ${n('FAIL')} gagal, ${n('INFO')} info, ${n('SKIP')} dilewati`,
  '', '| Grup | Uji | Status | Detail |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.grup} | ${r.uji} | ${r.status} | ${r.detail.replace(/\|/g, '/')} |`),
].join('\n')
writeFileSync(path.join(here, 'last-report.md'), md)
console.log('Laporan tertulis: security-tests/last-report.md')

process.exit(n('FAIL') > 0 ? 1 : 0)
