-- ============================================================================
-- FIX: Mandor tidak melihat presensi "alfa" otomatis (RLS menyembunyikan
-- baris tanpa project)
-- ============================================================================
-- auto_mark_alfa() (lihat MIGRATION_AUTO_ALFA.sql) sengaja menyimpan baris
-- presensi "alfa" otomatis dengan project_id = NULL -- karyawan yang tidak
-- hadir tidak "mengerjakan" project manapun hari itu.
--
-- Tapi can_access_field_project(pid), yang dipakai di policy RLS tabel
-- presensi/lembur/kasbon (lihat SECURITY_HARDENING.sql), menguji
--   pid IN (SELECT app_project_ids())
-- Di PostgreSQL, "NULL IN (subquery)" hasilnya NULL (bukan TRUE/FALSE), dan
-- RLS memperlakukan NULL sebagai "tolak baris ini". Karena pid presensi alfa
-- otomatis SELALU NULL, hasilnya baris itu DISEMBUNYIKAN dari role mandor --
-- padahal insert-nya (lewat auto_mark_alfa, SECURITY DEFINER) berhasil.
--
-- admin-web tidak kelihatan bermasalah karena role admin/hr tidak lewat
-- pengecekan ini sama sekali (bypass di baris pertama CASE). Masalah ini
-- HANYA kelihatan di mandor_app, yang login sebagai role 'mandor' sungguhan
-- lewat Supabase Auth.
--
-- PERBAIKAN: baris tanpa project (pid IS NULL) bukan milik project manapun,
-- jadi semua mandor harus tetap bisa melihatnya -- sama seperti admin/hr.
-- CREATE OR REPLACE FUNCTION otomatis berlaku untuk semua policy yang sudah
-- memakai fungsi ini (policy memanggil fungsi by name, tidak di-inline), jadi
-- tidak perlu DROP/CREATE POLICY ulang.
--
-- Jalankan di: Supabase Dashboard -> SQL Editor (1x, aman diulang)
-- ============================================================================

CREATE OR REPLACE FUNCTION can_access_field_project(pid bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN app_role() IN ('admin','hr') THEN true
    WHEN app_role() = 'mandor'        THEN pid IS NULL OR pid IN (SELECT app_project_ids())
    ELSE false
  END
$$;

-- ----------------------------------------------------------------------------
-- Pengerasan tambahan (bukan bug yang sedang aktif hari ini): can_access_project
-- dipakai untuk inventaris (barang, stok_masuk, stok_keluar, permintaan_barang,
-- retur_barang). Semua tabel itu punya project_id NOT NULL sehingga pid tidak
-- pernah NULL saat ini. Tapi pola "pid IN (subquery)" sama persis rawannya bila
-- suatu saat ada kolom project_id yang dibuat nullable -- jadi disamakan
-- sekalian supaya tidak jadi jebakan di masa depan. Tidak mengubah perilaku
-- yang sudah ada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION can_access_project(pid bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN app_role() IN ('admin','hr')             THEN true
    WHEN app_role() IN ('mandor','mandor_gudang') THEN pid IS NULL OR pid IN (SELECT app_project_ids())
    ELSE false
  END
$$;

-- ------------------------------------------------------------
-- Follow-up manual (tidak dieksekusi otomatis oleh script ini): karyawan
-- aktif yang TIDAK pernah ditugaskan ke project manapun tidak akan pernah
-- dapat baris alfa otomatis di platform manapun (auto_mark_alfa men-drive
-- tanggalnya dari project_karyawan). Tugaskan lewat "Assign Karyawan ke
-- Project" di admin-web.
-- ------------------------------------------------------------
-- SELECT k.id, k.nama_karyawan
--   FROM karyawan k
--  WHERE k.status_aktif = TRUE
--    AND NOT EXISTS (
--      SELECT 1 FROM project_karyawan pk
--       WHERE pk.karyawan_id = k.id AND pk.status_assignment = 'aktif'
--    )
--  ORDER BY k.nama_karyawan;

-- ------------------------------------------------------------
-- VERIFIKASI
-- ------------------------------------------------------------
SELECT COUNT(*) AS alfa_otomatis_tanpa_project
  FROM presensi
 WHERE status_kehadiran = 'alfa' AND metode_input = 'otomatis' AND project_id IS NULL;
