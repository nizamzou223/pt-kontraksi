-- ============================================================================
-- FIX: auto_mark_alfa() hanya menandai karyawan yang punya penugasan project
-- aktif (project_karyawan) -- karyawan aktif TANPA penugasan tidak pernah
-- diberi baris 'alfa', sehingga di hari-hari yang sudah lewat mereka tetap
-- "Belum Input" dan tidak ikut terhitung Tidak Hadir (mis. hanya 5 dari 134).
--
-- PERBAIKAN: tandai SEMUA karyawan aktif, mulai dari tanggal_bergabung, tetapi
-- tidak lebih awal dari tanggal pertama sistem dipakai (presensi 'hadir'
-- paling awal) -- supaya tidak membuat alfa bertahun-tahun ke belakang.
-- Penugasan project tetap ikut (mencakup tanggal_mulai assignment).
-- Hari Minggu tetap dilewati (libur). Zona waktu WIB (FIX_ALFA_TIMEZONE_WIB.sql).
--
-- Jalankan di: Supabase Dashboard -> SQL Editor (1x, aman diulang)
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_mark_alfa() RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_hari_ini_wib DATE := (NOW() AT TIME ZONE 'Asia/Jakarta')::date;
  v_awal_sistem DATE;
BEGIN
  SELECT MIN(tanggal) INTO v_awal_sistem FROM presensi WHERE status_kehadiran = 'hadir';
  IF v_awal_sistem IS NULL THEN
    RETURN 0;  -- belum ada presensi sama sekali, tidak ada yang perlu ditandai
  END IF;

  INSERT INTO presensi (project_id, karyawan_id, tanggal, status_kehadiran, metode_input, catatan)
  SELECT NULL, d.karyawan_id, d.tanggal, 'alfa', 'otomatis', 'Otomatis: tidak tercatat'
  FROM (
    -- Semua karyawan aktif sejak bergabung (dibatasi awal pemakaian sistem)
    SELECT k.id AS karyawan_id, gs::date AS tanggal
    FROM karyawan k
    CROSS JOIN LATERAL generate_series(
      GREATEST(k.tanggal_bergabung, v_awal_sistem),
      v_hari_ini_wib - 1,
      interval '1 day'
    ) AS gs
    WHERE k.status_aktif = TRUE
      AND EXTRACT(DOW FROM gs) <> 0

    UNION

    -- Penugasan project aktif (perilaku lama, dibatasi awal pemakaian sistem)
    SELECT pk.karyawan_id, gs::date
    FROM project_karyawan pk
    JOIN karyawan k ON k.id = pk.karyawan_id AND k.status_aktif = TRUE
    CROSS JOIN LATERAL generate_series(
      GREATEST(pk.tanggal_mulai, v_awal_sistem),
      LEAST(COALESCE(pk.tanggal_selesai, v_hari_ini_wib - 1), v_hari_ini_wib - 1),
      interval '1 day'
    ) AS gs
    WHERE pk.status_assignment = 'aktif'
      AND EXTRACT(DOW FROM gs) <> 0
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

-- Jalankan sekarang untuk mengisi hari-hari lalu yang selama ini terlewat
SELECT auto_mark_alfa() AS baris_alfa_otomatis_dibuat;

-- Verifikasi: per tanggal Oktober, hadir + tidak hadir harus = jumlah karyawan aktif
SELECT p.tanggal,
       COUNT(*) FILTER (WHERE p.status_kehadiran = 'hadir')  AS hadir,
       COUNT(*) FILTER (WHERE p.status_kehadiran <> 'hadir') AS tidak_hadir,
       (SELECT COUNT(*) FROM karyawan WHERE status_aktif) AS karyawan_aktif
FROM (
  SELECT DISTINCT ON (karyawan_id, tanggal) karyawan_id, tanggal, status_kehadiran
  FROM presensi
  WHERE tanggal >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')::date
  ORDER BY karyawan_id, tanggal, (status_kehadiran = 'hadir') DESC
) p
JOIN karyawan k ON k.id = p.karyawan_id AND k.status_aktif
GROUP BY p.tanggal
ORDER BY p.tanggal;
