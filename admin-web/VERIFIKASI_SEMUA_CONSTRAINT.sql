-- ============================================================================
-- VERIFIKASI: constraint unik yang BENAR-BENAR ada untuk semua tabel yang
-- di-upsert dengan onConflict spesifik kolom di kode (admin-web + mandor_app)
-- ============================================================================
-- Setelah ketemu kasus presensi (kode mengasumsikan UNIQUE(project_id,
-- karyawan_id, tanggal), padahal yang nyata cuma UNIQUE(karyawan_id,
-- tanggal)), semua asumsi serupa di kode diverifikasi sekali lagi di sini
-- supaya tidak ada kejutan yang sama di tempat lain.
--
-- Kode yang mengasumsikan constraint-constraint di bawah ini:
--   - presensi (karyawan_id, tanggal)         -- SUDAH diverifikasi & benar
--   - project_karyawan (project_id, karyawan_id) -- projectService.js assignKaryawan
--   - rekap_gaji_bulanan (karyawan_id, bulan, tahun) -- payrollService.js _autoRekapBulanan
--   - karyawan_qr_code (karyawan_id)           -- projectService.js upsertQRCode
-- ============================================================================

SELECT 'presensi' AS tabel, conname, pg_get_constraintdef(oid) AS definisi
  FROM pg_constraint WHERE conrelid = 'public.presensi'::regclass AND contype IN ('u','p')
UNION ALL
SELECT 'project_karyawan', conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conrelid = 'public.project_karyawan'::regclass AND contype IN ('u','p')
UNION ALL
SELECT 'rekap_gaji_bulanan', conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conrelid = 'public.rekap_gaji_bulanan'::regclass AND contype IN ('u','p')
UNION ALL
SELECT 'karyawan_qr_code', conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conrelid = 'public.karyawan_qr_code'::regclass AND contype IN ('u','p')
ORDER BY tabel;
