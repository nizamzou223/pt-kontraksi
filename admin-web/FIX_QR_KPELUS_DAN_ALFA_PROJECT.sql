-- ============================================================================
-- FIX 1: QR Code lama yang masih pakai prefix "KPELUS-" (nama lama perusahaan)
-- ============================================================================
-- Kode di aplikasi (admin-web & mandor_app) sudah diganti untuk generate QR
-- baru dengan prefix "KRAKATAU-". Tapi QR yang SUDAH dibuat sebelumnya untuk
-- karyawan lama masih tersimpan di database dengan prefix "KPELUS-" -- dan
-- karena QR bersifat permanen (tidak bisa di-generate ulang dari UI), nilai
-- lama itu tidak pernah ikut terganti.
--
-- Ini bukan cuma masalah tampilan: mandor_app.validateQRCode() sekarang
-- menolak QR yang TIDAK diawali "KRAKATAU-" (lihat payroll_service.dart),
-- jadi kartu QR lama yang sudah dicetak akan GAGAL discan sampai data ini
-- diperbaiki.
UPDATE karyawan_qr_code
SET qr_code_value = REPLACE(qr_code_value, 'KPELUS-', 'KRAKATAU-')
WHERE qr_code_value LIKE 'KPELUS-%';

-- ============================================================================
-- FIX 2: Presensi "alfa" otomatis seharusnya tidak punya project
-- ============================================================================
-- auto_mark_alfa() (lihat MIGRATION_AUTO_ALFA.sql) menandai karyawan yang
-- tidak tercatat sebagai "alfa", tapi ikut mengisi project_id dari
-- project_karyawan -- sehingga semua baris "Tidak Hadir" otomatis seolah
-- "dikerjakan" di project itu, padahal karyawan tidak hadir sama sekali.
-- Seharusnya baris alfa otomatis TIDAK terikat project manapun.

-- 2a. Kolom project_id di presensi masih NOT NULL -- longgarkan agar baris
--     alfa otomatis bisa disimpan tanpa project.
ALTER TABLE presensi ALTER COLUMN project_id DROP NOT NULL;

-- 2b. Definisikan ulang fungsinya: project_id selalu NULL untuk baris alfa
--     otomatis, dan deduplikasi berdasarkan (karyawan_id, tanggal) saja --
--     bukan per (project, karyawan, tanggal) -- supaya karyawan yang punya
--     lebih dari satu assignment project aktif tidak dobel alfa di hari yang
--     sama.
CREATE OR REPLACE FUNCTION auto_mark_alfa() RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO presensi (project_id, karyawan_id, tanggal, status_kehadiran, metode_input, catatan)
  SELECT NULL, d.karyawan_id, d.tanggal, 'alfa', 'otomatis', 'Otomatis: tidak tercatat'
  FROM (
    SELECT DISTINCT pk.karyawan_id, gs::date AS tanggal
    FROM project_karyawan pk
    JOIN karyawan k ON k.id = pk.karyawan_id AND k.status_aktif = TRUE
    CROSS JOIN LATERAL generate_series(
      pk.tanggal_mulai,
      LEAST(COALESCE(pk.tanggal_selesai, CURRENT_DATE - 1), CURRENT_DATE - 1),
      interval '1 day'
    ) AS gs
    WHERE pk.status_assignment = 'aktif'
      AND pk.tanggal_mulai <= CURRENT_DATE - 1
      AND EXTRACT(DOW FROM gs) <> 0  -- lewati hari Minggu (libur)
  ) d
  WHERE NOT EXISTS (
    SELECT 1 FROM presensi p
    WHERE p.karyawan_id = d.karyawan_id AND p.tanggal = d.tanggal
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION auto_mark_alfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auto_mark_alfa() TO authenticated;

-- 2c. Perbaiki baris alfa otomatis yang SUDAH terlanjur kesimpan dengan
--     project_id yang salah (hanya yang dibuat otomatis -- alfa yang
--     diinput manual oleh admin untuk suatu project tidak disentuh).
UPDATE presensi
SET project_id = NULL
WHERE status_kehadiran = 'alfa' AND metode_input = 'otomatis' AND project_id IS NOT NULL;

-- Ringkasan hasil
SELECT
  (SELECT COUNT(*) FROM karyawan_qr_code WHERE qr_code_value LIKE 'KRAKATAU-%') AS qr_sudah_krakatau,
  (SELECT COUNT(*) FROM karyawan_qr_code WHERE qr_code_value LIKE 'KPELUS-%')   AS qr_masih_kpelus_harusnya_0,
  (SELECT COUNT(*) FROM presensi WHERE status_kehadiran = 'alfa' AND metode_input = 'otomatis' AND project_id IS NULL) AS alfa_tanpa_project;
