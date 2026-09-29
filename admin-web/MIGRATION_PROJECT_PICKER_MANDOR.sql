-- ============================================================
-- MIGRASI: Katalog proyek untuk pemilih proyek di aplikasi Mandor
-- Jalankan di: Supabase Dashboard → SQL Editor  (aman diulang)
--
-- MASALAH: kebijakan RLS project_read (SECURITY_HARDENING.sql) sengaja membatasi tabel
-- `project` hanya untuk proyek yang sudah ditugaskan (can_access_project()), sehingga
-- mandor tidak bisa melihat/memilih proyek LAIN di aplikasi mobile — baik yang belum
-- punya proyek sama sekali, MAUPUN yang sudah punya satu tapi ingin pindah ke proyek
-- lain. Sistem kerja mandor memang fleksibel (bisa ditugaskan ke proyek mana pun hari
-- itu), jadi pemilih proyek di aplikasi HARUS selalu menawarkan seluruh proyek aktif,
-- bukan cuma proyek yang kebetulan sudah tercatat di project_karyawan/users.project_id.
--
-- SOLUSI (2 RPC sempit, SECURITY DEFINER, mengikuti pola email_for_nik yang sudah ada):
--   1. active_projects_catalog() — daftar SEMUA proyek aktif (id, kode, nama, lokasi
--      saja; bukan data operasional) agar mandor selalu bisa MELIHAT semua pilihan,
--      berapa pun proyek yang sudah ditugaskan kepadanya saat ini.
--   2. mandor_pilih_proyek(id) — begitu mandor MEMILIH proyek (apa pun yang sedang
--      aktif di akunnya sekarang), proyek itu langsung disimpan sebagai users.project_id
--      AKUN ITU SENDIRI SAJA (tidak bisa mengubah akun lain). Ini keputusan sadar:
--      mandor boleh pindah-pindah proyek sendiri kapan saja tanpa menunggu admin
--      menugaskan lebih dulu — bukan celah, karena RLS presensi/lembur/kasbon/stok
--      tetap dibatasi ke users.project_id yang tersimpan, sama seperti penugasan oleh
--      admin (lihat can_access_project()).
--
-- PRASYARAT: SECURITY_HARDENING.sql sudah dijalankan (fungsi app_role(), app_email() dipakai).
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'app_role') THEN
    RAISE EXCEPTION 'Fungsi app_role() belum ada. Jalankan SECURITY_HARDENING.sql lebih dulu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'app_email') THEN
    RAISE EXCEPTION 'Fungsi app_email() belum ada. Jalankan SECURITY_HARDENING.sql lebih dulu.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION active_projects_catalog()
RETURNS TABLE(id BIGINT, kode_project VARCHAR, nama_project VARCHAR, lokasi VARCHAR, status_project VARCHAR)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.kode_project, p.nama_project, p.lokasi, p.status_project
    FROM project p
   WHERE p.status_project = 'aktif'
     AND app_role() IN ('admin', 'hr', 'mandor', 'mandor_gudang')  -- hanya akun yang sudah masuk & berperan sah
   ORDER BY p.nama_project
$$;
REVOKE ALL ON FUNCTION active_projects_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION active_projects_catalog() TO authenticated;

-- Mandor memilih proyeknya sendiri: hanya boleh mengubah project_id BARIS DIRINYA
-- SENDIRI (dicocokkan lewat app_email(), bukan parameter user_id) — tidak mungkin
-- dipakai untuk mengubah akun orang lain. Proyek tujuan wajib aktif.
CREATE OR REPLACE FUNCTION mandor_pilih_proyek(p_project_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF app_role() NOT IN ('mandor', 'mandor_gudang') THEN
    RAISE EXCEPTION 'Hanya akun Mandor yang dapat memilih proyeknya sendiri.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM project WHERE id = p_project_id AND status_project = 'aktif') THEN
    RAISE EXCEPTION 'Proyek tidak ditemukan atau sudah tidak aktif.';
  END IF;
  UPDATE users SET project_id = p_project_id, updated_at = now()
   WHERE lower(email) = app_email() AND status_aktif IS TRUE;
END;
$$;
REVOKE ALL ON FUNCTION mandor_pilih_proyek(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mandor_pilih_proyek(BIGINT) TO authenticated;

COMMIT;

-- ── VERIFIKASI: kedua fungsi terdaftar, dan katalog bisa dipanggil ──
SELECT proname, prosecdef AS security_definer
  FROM pg_proc WHERE proname IN ('active_projects_catalog', 'mandor_pilih_proyek');
SELECT * FROM active_projects_catalog() LIMIT 5;
