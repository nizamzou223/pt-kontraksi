-- ============================================================
-- Gaji Oktober tercatat padahal presensi 'hadir' Oktober tidak ada.
-- Penyebab: rekap_gaji_mingguan/bulanan sisa data lama (demo) yang tidak
-- pernah dihapus -- baris berstatus 'dibayar' sengaja tidak disentuh oleh
-- hitungDanSimpanGajiMingguanBatch, dan _autoRekapBulanan tidak menghapus
-- baris bulanan yang sudah tidak punya mingguan.
-- Jalankan di: Supabase Dashboard -> SQL Editor
-- ============================================================

-- LANGKAH 1 (hanya baca): rekap mingguan yang TIDAK punya presensi 'hadir' di periodenya
SELECT r.id, r.karyawan_id, r.periode_mulai, r.periode_selesai, r.status, r.total_hari_hadir, r.gaji_bersih
FROM rekap_gaji_mingguan r
WHERE r.periode_selesai BETWEEN '2026-10-01' AND '2026-10-31'
  AND NOT EXISTS (
    SELECT 1 FROM presensi p
    WHERE p.karyawan_id = r.karyawan_id
      AND p.status_kehadiran = 'hadir'
      AND p.tanggal BETWEEN r.periode_mulai AND r.periode_selesai
  )
ORDER BY r.periode_mulai, r.karyawan_id;

-- LANGKAH 2: hapus rekap mingguan yatim tsb (termasuk yang 'dibayar') lalu
-- bulanan yang tidak lagi punya mingguan. Jalankan SETELAH memeriksa hasil langkah 1.
BEGIN;

DELETE FROM rekap_gaji_mingguan r
WHERE r.periode_selesai BETWEEN '2026-10-01' AND '2026-10-31'
  AND NOT EXISTS (
    SELECT 1 FROM presensi p
    WHERE p.karyawan_id = r.karyawan_id
      AND p.status_kehadiran = 'hadir'
      AND p.tanggal BETWEEN r.periode_mulai AND r.periode_selesai
  );

DELETE FROM rekap_gaji_bulanan b
WHERE b.bulan = 10 AND b.tahun = 2026
  AND NOT EXISTS (
    SELECT 1 FROM rekap_gaji_mingguan r
    WHERE r.karyawan_id = b.karyawan_id
      AND r.status IN ('draft', 'dibayar')
      AND r.periode_selesai BETWEEN '2026-10-01' AND '2026-10-31'
  );

-- Verifikasi sebelum COMMIT
SELECT 'mingguan Okt tersisa' AS cek, COUNT(*) FROM rekap_gaji_mingguan WHERE periode_selesai BETWEEN '2026-10-01' AND '2026-10-31'
UNION ALL
SELECT 'bulanan Okt tersisa', COUNT(*) FROM rekap_gaji_bulanan WHERE bulan = 10 AND tahun = 2026;

COMMIT;
