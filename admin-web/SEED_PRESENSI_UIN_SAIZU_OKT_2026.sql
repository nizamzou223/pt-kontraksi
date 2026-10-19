-- ============================================================================
-- DATA CONTOH (DUMMY) SEMINAR: presensi proyek UIN SAIZU PURBALINGGA
-- periode Kamis 1 Oktober - Sabtu 17 Oktober 2026 (Senin-Sabtu, Minggu libur).
-- INI DATA SIMULASI, BUKAN data riil presensi.
--
-- - SEMUA karyawan aktif (karyawan fleksibel, tidak terikat penugasan
--   project), presensinya dicatat di project UIN SAIZU.
-- - Kehadiran dibuat realistis & deterministik (hasil sama tiap dijalankan):
--     ~88% hadir, ~4% izin, ~3% sakit, ~5% alfa.
-- - Jam masuk bervariasi 06:50-07:10, jam keluar = masuk + 8 jam -> durasi
--   tepat 8 jam, jadi TIDAK ADA lembur; jam tidak identik tiap hari (tidak
--   memicu deteksi anomali "pola jam identik").
-- - Uang makan 15.000 + transport 10.000 per hari hadir.
-- - TANPA lembur & kasbon: lembur Oktober karyawan ini dihapus, kasbon contoh
--   ('Contoh demo Oktober') dihapus.
-- - Rekap gaji mingguan/bulanan yang mencakup periode ini dihapus supaya
--   dihitung ulang dari presensi baru (tekan "Sinkron" di Gaji Mingguan).
--
-- Jalankan di: Supabase Dashboard -> SQL Editor. Aman dijalankan ulang.
-- ============================================================================

BEGIN;

-- Project dicari lewat kode ATAU nama (kalau kodenya pernah diubah di admin-web)
DROP TABLE IF EXISTS _uin_project;
CREATE TEMP TABLE _uin_project AS
SELECT id FROM project
WHERE kode_project = 'PRJ-UIN-SAIZU-2026' OR nama_project ILIKE '%UIN%SAIZU%'
ORDER BY (kode_project = 'PRJ-UIN-SAIZU-2026') DESC, id
LIMIT 1;

-- Karyawan fleksibel (bebas di project mana pun): SEMUA karyawan aktif,
-- presensinya dicatat di project UIN SAIZU.
DROP TABLE IF EXISTS _uin_karyawan;
CREATE TEMP TABLE _uin_karyawan AS
SELECT k.id AS karyawan_id
FROM karyawan k
WHERE k.status_aktif = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _uin_project) THEN
    RAISE EXCEPTION 'Project UIN SAIZU tidak ditemukan (kode PRJ-UIN-SAIZU-2026 / nama mengandung "UIN SAIZU").';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _uin_karyawan) THEN
    RAISE EXCEPTION 'Tidak ada karyawan aktif.';
  END IF;
  RAISE NOTICE 'Karyawan UIN SAIZU: %', (SELECT COUNT(*) FROM _uin_karyawan);
END $$;

-- 1. Bersihkan data periode ini untuk karyawan UIN SAIZU
DELETE FROM presensi
WHERE karyawan_id IN (SELECT karyawan_id FROM _uin_karyawan)
  AND tanggal BETWEEN '2026-10-01' AND '2026-10-17';

DELETE FROM lembur
WHERE karyawan_id IN (SELECT karyawan_id FROM _uin_karyawan)
  AND tanggal BETWEEN '2026-10-01' AND '2026-10-17';

DELETE FROM kasbon WHERE catatan = 'Contoh demo Oktober';

-- Minggu yang bersinggungan dengan 1-17 Okt: 27 Sep-3 Okt, 4-10 Okt, 11-17 Okt
DELETE FROM rekap_gaji_mingguan
WHERE karyawan_id IN (SELECT karyawan_id FROM _uin_karyawan)
  AND periode_selesai BETWEEN '2026-10-01' AND '2026-10-17';

DELETE FROM rekap_gaji_bulanan
WHERE karyawan_id IN (SELECT karyawan_id FROM _uin_karyawan)
  AND bulan = 10 AND tahun = 2026;

-- 2. Presensi contoh
INSERT INTO presensi (project_id, karyawan_id, tanggal, jam_masuk, jam_keluar, durasi_jam,
                      status_kehadiran, uang_makan, uang_transport, metode_input, catatan)
SELECT
  x.project_id,  -- semua status (termasuk alfa) di UIN SAIZU: fokus 1 project
  x.karyawan_id,
  x.tanggal,
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
    (SELECT id FROM _uin_project) AS project_id,
    u.karyawan_id,
    d.tanggal,
    r.r,
    CASE WHEN r.r < 88 THEN 'hadir'
         WHEN r.r < 92 THEN 'izin'
         WHEN r.r < 95 THEN 'sakit'
         ELSE 'alfa' END AS status,
    -- 06:50 s/d 07:10
    time '06:50' + ((abs(hashtext(d.tanggal::text || '#' || u.karyawan_id)) % 21) * interval '1 minute') AS jam_masuk
  FROM _uin_karyawan u
  CROSS JOIN (
    SELECT gs::date AS tanggal
    FROM generate_series('2026-10-01'::date, '2026-10-17'::date, interval '1 day') gs
    WHERE EXTRACT(DOW FROM gs) <> 0          -- Minggu libur
  ) d
  CROSS JOIN LATERAL (
    SELECT abs(hashtext(u.karyawan_id || '@' || d.tanggal::text)) % 100 AS r
  ) r
) x;

COMMIT;

-- 3. Verifikasi per tanggal (hadir + izin + sakit + alfa = total_karyawan; lebih_8_jam = 0)
SELECT p.tanggal,
       to_char(p.tanggal, 'Dy')                                   AS hari,
       COUNT(*) FILTER (WHERE p.status_kehadiran = 'hadir')       AS hadir,
       COUNT(*) FILTER (WHERE p.status_kehadiran = 'izin')        AS izin,
       COUNT(*) FILTER (WHERE p.status_kehadiran = 'sakit')       AS sakit,
       COUNT(*) FILTER (WHERE p.status_kehadiran = 'alfa')        AS alfa,
       (SELECT COUNT(*) FROM _uin_karyawan)                       AS total_karyawan,
       COUNT(*) FILTER (WHERE p.durasi_jam > 8)                   AS lebih_8_jam
FROM presensi p
WHERE p.karyawan_id IN (SELECT karyawan_id FROM _uin_karyawan)
  AND p.tanggal BETWEEN '2026-10-01' AND '2026-10-17'
GROUP BY p.tanggal
ORDER BY p.tanggal;
