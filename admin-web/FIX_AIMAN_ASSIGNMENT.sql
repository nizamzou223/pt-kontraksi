-- ============================================================================
-- FIX: Assign Aiman ke project + backdate tanggal mulai + backfill alfa
-- ============================================================================
-- Satu kali jalan, mencakup kedua kemungkinan (belum pernah di-assign sama
-- sekali, ATAU sudah di-assign tapi tanggal_mulai-nya salah/terlalu baru).
-- Tidak memakai ON CONFLICT supaya tidak bergantung pada asumsi constraint
-- (lihat FIX_PRESENSI_UNIQUE_CONSTRAINT.sql untuk alasan kenapa itu penting).
--
-- GANTI dulu sebelum menjalankan:
--   - '%UIN SAIZU%'  -> nama project tempat Aiman bekerja (kalau beda)
--   - '2026-10-01'   -> tanggal Aiman sebenarnya mulai kerja
-- ============================================================================

DO $$
DECLARE
  v_karyawan_id BIGINT;
  v_project_id  BIGINT;
BEGIN
  SELECT id INTO v_karyawan_id FROM karyawan WHERE nama_karyawan ILIKE '%aiman%' LIMIT 1;
  SELECT id INTO v_project_id  FROM project  WHERE nama_project  ILIKE '%UIN SAIZU%' LIMIT 1;

  IF v_karyawan_id IS NULL THEN
    RAISE EXCEPTION 'Karyawan "aiman" tidak ditemukan.';
  END IF;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Project "UIN SAIZU" tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM project_karyawan
     WHERE karyawan_id = v_karyawan_id AND project_id = v_project_id
  ) THEN
    UPDATE project_karyawan
    SET status_assignment = 'aktif',
        tanggal_mulai = '2026-10-01'
    WHERE karyawan_id = v_karyawan_id AND project_id = v_project_id;
    RAISE NOTICE 'Penugasan Aiman sudah ada -- diperbarui tanggal_mulai & status_assignment.';
  ELSE
    INSERT INTO project_karyawan (project_id, karyawan_id, tanggal_mulai, status_assignment)
    VALUES (v_project_id, v_karyawan_id, '2026-10-01', 'aktif');
    RAISE NOTICE 'Penugasan Aiman baru dibuat.';
  END IF;
END $$;

-- Langsung bereskan hari-hari yang terlewat (termasuk gara-gara bug zona
-- waktu yang sudah diperbaiki di FIX_ALFA_TIMEZONE_WIB.sql)
SELECT auto_mark_alfa() AS baris_alfa_otomatis_dibuat;

-- Verifikasi: Aiman sekarang harus punya penugasan aktif
SELECT k.nama_karyawan, p.nama_project, pk.tanggal_mulai, pk.status_assignment
  FROM project_karyawan pk
  JOIN karyawan k ON k.id = pk.karyawan_id
  JOIN project p ON p.id = pk.project_id
 WHERE k.nama_karyawan ILIKE '%aiman%';
