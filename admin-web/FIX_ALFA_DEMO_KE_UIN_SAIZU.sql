-- ============================================================================
-- DEMO SEMINAR: fokus ke SATU project (UIN SAIZU), project lain kosong.
-- Baris 'alfa' dari data contoh 1-19 Okt 2026 tersimpan TANPA project
-- (project_id NULL), sehingga muncul di SEMUA project. Script ini
-- memindahkannya ke UIN SAIZU supaya seluruh data contoh (hadir, izin,
-- sakit, alfa) ada di UIN SAIZU dan project lain benar-benar kosong.
-- Tidak menghapus data apa pun; hanya mengisi project_id.
-- Jalankan di: Supabase Dashboard -> SQL Editor (aman diulang)
-- ============================================================================

UPDATE presensi
SET project_id = (SELECT id FROM project
                  WHERE kode_project = 'PRJ-UIN-SAIZU-2026' OR nama_project ILIKE '%UIN%SAIZU%'
                  ORDER BY id LIMIT 1)
WHERE tanggal BETWEEN '2026-10-01' AND '2026-10-19'
  AND project_id IS NULL;

-- Verifikasi: semua baris 1-19 Okt harus berada di UIN SAIZU
SELECT COALESCE(pr.nama_project, '(tanpa project)') AS project,
       COUNT(*)                                                AS baris,
       COUNT(*) FILTER (WHERE p.status_kehadiran = 'hadir')    AS hadir,
       COUNT(*) FILTER (WHERE p.status_kehadiran <> 'hadir')   AS tidak_hadir
FROM presensi p
LEFT JOIN project pr ON pr.id = p.project_id
WHERE p.tanggal BETWEEN '2026-10-01' AND '2026-10-19'
GROUP BY 1;
