-- ============================================================
-- FIX: Akun mandor baru gagal dibuat / tidak bisa login
-- Jalankan di: Supabase Dashboard → SQL Editor
--
-- Root cause: src/components/pengaturan/MandorManagement.jsx
-- memanggil supabase.rpc('confirm_user_email', ...) setelah
-- auth.signUp(), tapi fungsi ini tidak pernah dibuat di database.
-- Karena gagal (di-swallow oleh try/catch kosong), akun baru
-- tetap berstatus "email belum dikonfirmasi" di auth.users,
-- sehingga tidak bisa dipakai login di Mandor App / Gudang App.
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_user_email(user_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmed_at        = COALESCE(confirmed_at, NOW())
  WHERE email = user_email;
END;
$$;

-- Izinkan role anon & authenticated memanggil RPC ini dari client
GRANT EXECUTE ON FUNCTION confirm_user_email(TEXT) TO anon, authenticated;

-- ── Backfill: konfirmasi akun yang sudah terlanjur dibuat tapi stuck unconfirmed ──
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    confirmed_at        = COALESCE(confirmed_at, NOW())
WHERE email_confirmed_at IS NULL
  AND email IN (SELECT email FROM public.users);

SELECT 'confirm_user_email siap dipakai. Akun yang stuck sudah dikonfirmasi ulang.' AS status;
