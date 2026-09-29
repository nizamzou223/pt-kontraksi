// Edge Function: admin-set-password
// Admin mengganti password akun lain. Memakai service_role di SERVER (bukan browser).
// Deploy:  supabase functions deploy admin-set-password
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY disediakan otomatis oleh Supabase)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function passwordError(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password minimal 8 karakter.'
  if (!/[A-Za-z]/.test(pw)) return 'Password harus mengandung huruf.'
  if (!/\d/.test(pw)) return 'Password harus mengandung angka.'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''

  // 1. Siapa pemanggilnya? (validasi JWT ke Supabase Auth)
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await caller.auth.getUser()
  if (authErr || !user?.email) return json({ error: 'Tidak terautentikasi' }, 401)

  // 2. Pemanggil harus admin AKTIF di public.users
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: me } = await admin
    .from('users').select('role, status_aktif')
    .ilike('email', user.email).maybeSingle()
  if (!me || me.role !== 'admin' || me.status_aktif === false)
    return json({ error: 'Hanya administrator yang boleh mengganti password akun' }, 403)

  // 3. Validasi input
  let body: { email?: string; password?: string }
  try { body = await req.json() } catch { return json({ error: 'Body tidak valid' }, 400) }
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email) return json({ error: 'Email wajib diisi' }, 400)
  const pwErr = passwordError(body.password)
  if (pwErr) return json({ error: pwErr }, 400)

  // 4. Cari auth uid & ganti password
  const { data: uid, error: uidErr } = await admin.rpc('auth_uid_by_email', { p_email: email })
  if (uidErr || !uid) return json({ error: 'Akun tidak ditemukan' }, 404)
  const { error: updErr } = await admin.auth.admin.updateUserById(uid as string, { password: body.password })
  if (updErr) return json({ error: updErr.message }, 400)

  return json({ ok: true })
})
