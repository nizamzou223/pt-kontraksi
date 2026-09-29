-- ============================================================
-- SECURITY HARDENING — PT Kali Pelus (Admin Web + Mandor App)
-- Jalankan di: Supabase Dashboard → SQL Editor  (1x, aman diulang)
--
-- Yang dilakukan skrip ini:
--   1. Fungsi bantu peran (role) & proyek berbasis JWT, bukan input klien
--   2. Mengaktifkan Row Level Security (RLS) di SEMUA tabel public
--   3. Policy per peran: admin / hr / mandor / staff
--   4. Mencabut hak akses role `anon` (pengunjung tanpa login)
--   5. Mengunci RPC (confirm_user_email, stok) dan menambah email_for_nik
--   6. Proteksi tambahan: admin terakhir & eskalasi peran
--
-- Model akses:
--   admin  : semua data, kelola akun
--   hr     : semua data operasional & gaji, tidak kelola akun
--   mandor : hanya data proyek yang ditugaskan kepadanya (presensi, lembur, kasbon, inventaris)
--   mandor_gudang : hanya inventaris proyeknya (barang, stok, permintaan/retur); TANPA presensi/lembur/kasbon
--   staff  : tidak punya akses (belum ada aplikasinya)
--   tanpa baris di public.users / status_aktif=false : TIDAK ADA akses
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. FUNGSI BANTU  (SECURITY DEFINER agar tidak rekursif dgn RLS users)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_email()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT lower(auth.jwt() ->> 'email')
$$;

CREATE OR REPLACE FUNCTION app_user_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM users
   WHERE lower(email) = app_email() AND status_aktif IS TRUE
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM users
   WHERE lower(email) = app_email() AND status_aktif IS TRUE
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE(app_role() = 'admin', false) $$;

CREATE OR REPLACE FUNCTION is_admin_or_hr()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE(app_role() IN ('admin','hr'), false) $$;

-- Semua peran yang boleh memakai sistem (baca data master)
CREATE OR REPLACE FUNCTION is_operational()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE(app_role() IN ('admin','hr','mandor','mandor_gudang'), false) $$;

-- Peran yang boleh MENULIS data karyawan lapangan (mandor_gudang tidak)
CREATE OR REPLACE FUNCTION is_field_writer()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE(app_role() IN ('admin','hr','mandor'), false) $$;

-- Proyek yang boleh diakses user: users.project_id + penugasan aktif di project_karyawan
CREATE OR REPLACE FUNCTION app_project_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.project_id FROM users u
   WHERE lower(u.email) = app_email() AND u.status_aktif IS TRUE AND u.project_id IS NOT NULL
  UNION
  SELECT pk.project_id FROM users u
    JOIN project_karyawan pk ON pk.karyawan_id = u.karyawan_id
   WHERE lower(u.email) = app_email() AND u.status_aktif IS TRUE
     AND pk.status_assignment = 'aktif'
$$;

-- Akses proyek untuk data INVENTARIS: admin/hr semua, mandor & mandor_gudang hanya proyeknya
CREATE OR REPLACE FUNCTION can_access_project(pid bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN app_role() IN ('admin','hr')              THEN true
    WHEN app_role() IN ('mandor','mandor_gudang')  THEN pid IN (SELECT app_project_ids())
    ELSE false
  END
$$;

-- Akses proyek untuk data SDM/GAJI lapangan (presensi, lembur, kasbon): mandor_gudang TIDAK termasuk
CREATE OR REPLACE FUNCTION can_access_field_project(pid bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN app_role() IN ('admin','hr') THEN true
    WHEN app_role() = 'mandor'        THEN pid IN (SELECT app_project_ids())
    ELSE false
  END
$$;

-- ------------------------------------------------------------
-- 2. ENABLE RLS DI SEMUA TABEL public (termasuk tabel yang lupa didaftarkan)
-- ------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. POLICY
-- ------------------------------------------------------------
-- Bersihkan policy lama supaya skrip idempotent
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- 3a. Inventaris: admin/hr semua proyek; mandor & mandor_gudang hanya proyeknya
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kategori_barang','barang','stok_masuk','stok_keluar','permintaan_barang','retur_barang'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (can_access_project(project_id))
         WITH CHECK (can_access_project(project_id))',
      t || '_project_scope', t);
  END LOOP;
END $$;

-- 3a-2. SDM/gaji lapangan: admin/hr semua proyek; mandor hanya proyeknya; mandor_gudang DITOLAK
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['presensi','lembur','kasbon'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (can_access_field_project(project_id))
         WITH CHECK (can_access_field_project(project_id))',
      t || '_project_scope', t);
  END LOOP;
END $$;

-- 3b. Data master: baca untuk semua peran operasional, tulis hanya admin/hr
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['departemen','jabatan','satuan_barang'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_operational())', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_admin_or_hr()) WITH CHECK (is_admin_or_hr())', t||'_write', t);
  END LOOP;
END $$;

-- 3c. karyawan & QR: mandor perlu membaca/mendaftar karyawan lapangan
CREATE POLICY karyawan_read   ON karyawan FOR SELECT TO authenticated USING (is_operational());
CREATE POLICY karyawan_insert ON karyawan FOR INSERT TO authenticated WITH CHECK (is_field_writer());
CREATE POLICY karyawan_update ON karyawan FOR UPDATE TO authenticated USING (is_field_writer()) WITH CHECK (is_field_writer());
CREATE POLICY karyawan_delete ON karyawan FOR DELETE TO authenticated USING (is_admin_or_hr());

CREATE POLICY qr_read   ON karyawan_qr_code FOR SELECT TO authenticated USING (is_operational());
CREATE POLICY qr_insert ON karyawan_qr_code FOR INSERT TO authenticated WITH CHECK (is_field_writer());
CREATE POLICY qr_update ON karyawan_qr_code FOR UPDATE TO authenticated USING (is_field_writer()) WITH CHECK (is_field_writer());
CREATE POLICY qr_delete ON karyawan_qr_code FOR DELETE TO authenticated USING (is_admin_or_hr());

-- 3d. project & penugasan
CREATE POLICY project_read  ON project FOR SELECT TO authenticated USING (can_access_project(id));
CREATE POLICY project_write ON project FOR ALL    TO authenticated USING (is_admin_or_hr()) WITH CHECK (is_admin_or_hr());

CREATE POLICY pk_read ON project_karyawan FOR SELECT TO authenticated
  USING (can_access_project(project_id));
CREATE POLICY pk_write ON project_karyawan FOR ALL TO authenticated
  USING (can_access_field_project(project_id)) WITH CHECK (can_access_field_project(project_id));

-- 3e. Gaji & pembayaran: hanya admin/hr
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rekap_gaji_mingguan','rekap_gaji_bulanan','pembayaran_otomatis'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_admin_or_hr()) WITH CHECK (is_admin_or_hr())', t||'_hr_only', t);
  END LOOP;
END $$;

-- 3f. Audit log: semua user aktif boleh MENCATAT, hanya admin boleh MEMBACA, tidak ada ubah/hapus
CREATE POLICY audit_insert ON audit_log FOR INSERT TO authenticated WITH CHECK (is_operational());
CREATE POLICY audit_read   ON audit_log FOR SELECT TO authenticated USING (is_admin());

-- 3g. users: baca baris sendiri (atau semua bagi admin/hr); ubah hanya admin
CREATE POLICY users_read_self  ON users FOR SELECT TO authenticated
  USING (lower(email) = app_email() OR is_admin_or_hr());
CREATE POLICY users_admin_write ON users FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ------------------------------------------------------------
-- 4. CABUT HAK role anon (pengunjung tanpa login) & PUBLIC
-- ------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ------------------------------------------------------------
-- 5. RPC
-- ------------------------------------------------------------
-- 5a. confirm_user_email: hanya admin yang login (dulu boleh dipanggil anon!)
CREATE OR REPLACE FUNCTION confirm_user_email(user_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Hanya administrator yang boleh mengonfirmasi akun' USING ERRCODE = '42501';
  END IF;
  UPDATE auth.users
     SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
   WHERE lower(email) = lower(user_email);
END;
$$;
REVOKE ALL ON FUNCTION confirm_user_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_user_email(TEXT) TO authenticated;

-- 5b. email_for_nik: login Mandor via NIK terjadi SEBELUM login, jadi butuh RPC
--     sempit ini (hanya mengembalikan email akun aktif, tidak membuka tabel).
CREATE OR REPLACE FUNCTION email_for_nik(p_nik TEXT)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.email
    FROM karyawan k
    JOIN users u ON u.karyawan_id = k.id
   WHERE k.nik = btrim(p_nik) AND u.status_aktif IS TRUE
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION email_for_nik(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_for_nik(TEXT) TO anon, authenticated;

-- 5c. auth_uid_by_email: dipakai Edge Function admin-set-password (service_role SAJA)
CREATE OR REPLACE FUNCTION auth_uid_by_email(p_email TEXT)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1
$$;
REVOKE ALL ON FUNCTION auth_uid_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_uid_by_email(TEXT) TO service_role;

-- 5d. RPC stok berjalan sebagai pemanggil (SECURITY INVOKER) → RLS tetap berlaku.
--     Pastikan tidak ada yang SECURITY DEFINER secara tidak sengaja.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('kurangi_stok_keluar','tambah_stok_masuk','tambah_stok_masuk_retur')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', f.sig);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6. PROTEKSI TAMBAHAN
-- ------------------------------------------------------------
-- 6a. Jangan biarkan admin terakhir dihapus / diturunkan / dinonaktifkan
CREATE OR REPLACE FUNCTION check_admin_count()
RETURNS TRIGGER AS $func$
DECLARE v_other_admins INT;
BEGIN
  IF OLD.role = 'admin' AND (
       TG_OP = 'DELETE'
       OR NEW.role <> 'admin'
       OR NEW.status_aktif IS DISTINCT FROM TRUE
     )
  THEN
    SELECT COUNT(*) INTO v_other_admins
      FROM users WHERE role = 'admin' AND id <> OLD.id AND status_aktif = TRUE;
    IF v_other_admins = 0 THEN
      RAISE EXCEPTION 'Tidak bisa menghapus/menurunkan/menonaktifkan admin terakhir!';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_last_admin ON users;
CREATE TRIGGER protect_last_admin
  BEFORE DELETE OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION check_admin_count();

-- 6b. Batasi nilai role.
--     NOT VALID = berlaku untuk data BARU/yang diubah; baris lama yang menyimpang tidak
--     menggagalkan seluruh skrip. Lalu dicoba divalidasi; bila ada baris menyimpang,
--     hanya muncul NOTICE (cari dengan query di bagian VERIFIKASI).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD  CONSTRAINT users_role_check
  CHECK (role IN ('admin','hr','mandor','mandor_gudang','staff')) NOT VALID;
DO $$
BEGIN
  ALTER TABLE users VALIDATE CONSTRAINT users_role_check;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Ada baris users dengan role tidak dikenal. Akun itu TIDAK punya akses sampai role-nya dibetulkan. Lihat query verifikasi.';
END $$;

COMMIT;

-- ------------------------------------------------------------
-- VERIFIKASI 1 — akun dengan role tidak dikenal (idealnya 0 baris).
-- Akun ini terkunci (fail-closed). Betulkan dengan:
--   UPDATE users SET role = 'mandor' WHERE id = <id>;
-- ------------------------------------------------------------
SELECT id, email, role, status_aktif
  FROM users
 WHERE role IS NULL OR role NOT IN ('admin','hr','mandor','mandor_gudang','staff');

-- ------------------------------------------------------------
-- VERIFIKASI 2 (hasil harus: rls_aktif = true & jumlah_policy > 0 di semua baris)
-- ------------------------------------------------------------
SELECT c.relname AS tabel,
       c.relrowsecurity AS rls_aktif,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS jumlah_policy
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;
