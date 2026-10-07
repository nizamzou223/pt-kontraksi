-- ============================================================
-- DIAGNOSTIK: cari SEMUA objek database yang masih menyebut kolom "nik"
-- (yang sudah dihapus dari tabel karyawan), supaya error "column nik does
-- not exist" / login mobile gagal bisa dilacak sampai akar masalahnya.
-- Kemungkinan tersangka: RLS policy, trigger, atau function yang dibuat
-- langsung lewat Supabase Dashboard (tidak tercatat di file migrasi manapun).
-- Jalankan SEMUA query di bawah ini di Supabase SQL Editor, lalu kirim
-- hasilnya (screenshot/salin) -- dari situ saya bisa kasih perbaikan presisi.
-- ============================================================

-- 1) Function/stored procedure yang source code-nya menyebut "nik"
SELECT n.nspname AS schema, p.proname AS nama_function, pg_get_functiondef(p.oid) AS definisi
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema')
  AND pg_get_functiondef(p.oid) ILIKE '%nik%';

-- 2) RLS Policy yang kondisinya (USING / WITH CHECK) menyebut "nik"
SELECT schemaname, tablename, policyname, qual AS kondisi_using, with_check
FROM pg_policies
WHERE (qual ILIKE '%nik%' OR with_check ILIKE '%nik%');

-- 3) View yang definisinya menyebut "nik"
SELECT schemaname, viewname, definition
FROM pg_views
WHERE schemaname NOT IN ('pg_catalog','information_schema')
  AND definition ILIKE '%nik%';

-- 4) Trigger yang terpasang di tabel karyawan atau users (untuk dicek manual
--    apakah function-nya salah satu dari hasil query #1 di atas)
SELECT t.tgname AS nama_trigger, c.relname AS tabel, p.proname AS function_dipanggil
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfunction
WHERE NOT t.tgisinternal
  AND c.relname IN ('karyawan','users','presensi');

-- 5) Pastikan kolom nik di tabel karyawan betul-betul sudah hilang
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='karyawan' AND column_name ILIKE '%nik%';
