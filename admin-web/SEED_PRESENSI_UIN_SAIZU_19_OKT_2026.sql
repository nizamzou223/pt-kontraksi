-- ============================================================================
-- DATA CONTOH (DUMMY) SEMINAR: presensi + gaji Senin 19 Oktober 2026
-- Lanjutan SEED_PRESENSI_UIN_SAIZU_OKT_2026.sql dengan pola yang sama:
-- - SEMUA karyawan aktif, presensi dicatat di project UIN SAIZU.
-- - ~88% hadir, ~4% izin, ~3% sakit, ~5% alfa (deterministik).
-- - Jam masuk 06:50-07:10, keluar = masuk + 8 jam -> TANPA lembur.
-- - Uang makan 15.000 + transport 10.000 per hari hadir. TANPA kasbon.
-- - Rekap gaji mingguan 19-24 Okt (draft) dibuat dengan rumus yang sama
--   dengan aplikasi (hari x gaji harian + makan + transport), lalu rekap
--   bulanan Oktober dihitung ulang dari semua minggu Oktober.
-- INI DATA SIMULASI. Aman dijalankan ulang.
-- ============================================================================

BEGIN;

-- 1. Presensi 19 Oktober
INSERT INTO presensi (project_id, karyawan_id, tanggal, jam_masuk, jam_keluar, durasi_jam,
                      status_kehadiran, uang_makan, uang_transport, metode_input, catatan)
SELECT
  x.project_id,  -- semua status (termasuk alfa) di UIN SAIZU: fokus 1 project
  x.karyawan_id, x.tanggal,
  CASE WHEN x.status = 'hadir' THEN x.jam_masuk END,
  CASE WHEN x.status = 'hadir' THEN x.jam_masuk + interval '8 hours' END,
  CASE WHEN x.status = 'hadir' THEN 8 END,
  x.status,
  CASE WHEN x.status = 'hadir' THEN 15000 ELSE 0 END,
  CASE WHEN x.status = 'hadir' THEN 10000 ELSE 0 END,
  CASE WHEN x.status = 'hadir' THEN (CASE WHEN x.r % 5 = 0 THEN 'manual' ELSE 'qr_code' END)
       WHEN x.status = 'alfa'  THEN 'otomatis'
       ELSE 'manual' END,
  CASE x.status WHEN 'izin'  THEN 'Izin keperluan keluarga'
                WHEN 'sakit' THEN 'Sakit'
                WHEN 'alfa'  THEN 'Otomatis: tidak tercatat' END
FROM (
  SELECT
    (SELECT id FROM project
      WHERE kode_project = 'PRJ-UIN-SAIZU-2026' OR nama_project ILIKE '%UIN%SAIZU%'
      ORDER BY id LIMIT 1) AS project_id,
    k.id AS karyawan_id,
    DATE '2026-10-19' AS tanggal,
    r.r,
    CASE WHEN r.r < 88 THEN 'hadir'
         WHEN r.r < 92 THEN 'izin'
         WHEN r.r < 95 THEN 'sakit'
         ELSE 'alfa' END AS status,
    time '06:50' + ((abs(hashtext('2026-10-19#' || k.id)) % 21) * interval '1 minute') AS jam_masuk
  FROM karyawan k
  CROSS JOIN LATERAL (SELECT abs(hashtext(k.id || '@2026-10-19')) % 100 AS r) r
  WHERE k.status_aktif = TRUE
) x
ON CONFLICT DO NOTHING;

-- 2. Rekap gaji mingguan 19-24 Okt (draft) dari presensi hadir minggu itu
DELETE FROM rekap_gaji_mingguan
WHERE periode_mulai = '2026-10-19' AND periode_selesai = '2026-10-24' AND status = 'draft';

INSERT INTO rekap_gaji_mingguan (karyawan_id, periode_mulai, periode_selesai, project_details,
  total_hari_hadir, total_gaji_pokok, total_uang_makan, total_uang_transport, total_uang_lembur,
  gaji_kotor, total_potongan_kasbon, potongan_lainnya, gaji_bersih, status)
SELECT g.karyawan_id, '2026-10-19', '2026-10-24',
       jsonb_build_object(g.project_id::text, jsonb_build_object(
         'nama', g.nama_project, 'kode', g.kode_project, 'hari', g.hari, 'gaji', g.pokok)),
       g.hari, g.pokok, g.makan, g.transport, 0,
       g.pokok + g.makan + g.transport, 0, 0, g.pokok + g.makan + g.transport, 'draft'
FROM (
  SELECT p.karyawan_id, p.project_id, pr.nama_project, pr.kode_project,
         COUNT(*)                                            AS hari,
         ROUND(COUNT(*) * COALESCE(NULLIF(k.gaji_harian_override, 0), j.gaji_harian, 0)) AS pokok,
         ROUND(SUM(COALESCE(p.uang_makan, 0)))               AS makan,
         ROUND(SUM(COALESCE(p.uang_transport, 0)))           AS transport
  FROM presensi p
  JOIN karyawan k ON k.id = p.karyawan_id AND k.status_aktif
  LEFT JOIN jabatan j ON j.id = k.jabatan_id
  LEFT JOIN project pr ON pr.id = p.project_id
  WHERE p.status_kehadiran = 'hadir'
    AND p.tanggal BETWEEN '2026-10-19' AND '2026-10-24'
  GROUP BY p.karyawan_id, p.project_id, pr.nama_project, pr.kode_project,
           k.gaji_harian_override, j.gaji_harian
) g
WHERE NOT EXISTS (
  SELECT 1 FROM rekap_gaji_mingguan r
  WHERE r.karyawan_id = g.karyawan_id
    AND r.periode_mulai = '2026-10-19' AND r.periode_selesai = '2026-10-24'
);

-- 3. Rekap bulanan Oktober dihitung ulang dari semua minggu Oktober
--    (sama dengan _autoRekapBulanan di aplikasi: dikelompokkan by periode_selesai)
INSERT INTO rekap_gaji_bulanan (karyawan_id, bulan, tahun, total_gaji_bersih, total_gaji_kotor,
  total_gaji_pokok, total_uang_makan, total_uang_transport, total_hari_hadir,
  total_uang_lembur, total_kasbon_potong, status, updated_at)
SELECT karyawan_id, 10, 2026,
       ROUND(SUM(gaji_bersih)), ROUND(SUM(gaji_kotor)), ROUND(SUM(total_gaji_pokok)),
       ROUND(SUM(total_uang_makan)), ROUND(SUM(total_uang_transport)), SUM(total_hari_hadir),
       ROUND(SUM(total_uang_lembur)), ROUND(SUM(total_potongan_kasbon)),
       CASE WHEN bool_and(status = 'dibayar') THEN 'final' ELSE 'draft' END, NOW()
FROM rekap_gaji_mingguan
WHERE status IN ('draft', 'dibayar')
  AND periode_selesai BETWEEN '2026-10-01' AND '2026-10-31'
GROUP BY karyawan_id
ON CONFLICT (karyawan_id, bulan, tahun) DO UPDATE SET
  total_gaji_bersih    = EXCLUDED.total_gaji_bersih,
  total_gaji_kotor     = EXCLUDED.total_gaji_kotor,
  total_gaji_pokok     = EXCLUDED.total_gaji_pokok,
  total_uang_makan     = EXCLUDED.total_uang_makan,
  total_uang_transport = EXCLUDED.total_uang_transport,
  total_hari_hadir     = EXCLUDED.total_hari_hadir,
  total_uang_lembur    = EXCLUDED.total_uang_lembur,
  total_kasbon_potong  = EXCLUDED.total_kasbon_potong,
  status               = EXCLUDED.status,
  updated_at           = EXCLUDED.updated_at;

COMMIT;

-- 4. Verifikasi
SELECT 'presensi 19 Okt' AS cek,
       COUNT(*) FILTER (WHERE status_kehadiran = 'hadir') || ' hadir, ' ||
       COUNT(*) FILTER (WHERE status_kehadiran = 'izin')  || ' izin, '  ||
       COUNT(*) FILTER (WHERE status_kehadiran = 'sakit') || ' sakit, ' ||
       COUNT(*) FILTER (WHERE status_kehadiran = 'alfa')  || ' alfa, total ' || COUNT(*) AS hasil
FROM presensi WHERE tanggal = '2026-10-19'
UNION ALL
SELECT 'lembur 19 Okt', COUNT(*)::text FROM lembur WHERE tanggal = '2026-10-19'
UNION ALL
SELECT 'gaji minggu 19-24 Okt', COUNT(*) || ' karyawan, Rp ' || to_char(SUM(gaji_bersih), 'FM999G999G999')
FROM rekap_gaji_mingguan WHERE periode_mulai = '2026-10-19'
UNION ALL
SELECT 'gaji bulanan Okt', COUNT(*) || ' karyawan, Rp ' || to_char(SUM(total_gaji_bersih), 'FM999G999G999')
       || ', kasbon Rp ' || SUM(total_kasbon_potong) || ', lembur Rp ' || SUM(total_uang_lembur)
FROM rekap_gaji_bulanan WHERE bulan = 10 AND tahun = 2026;
