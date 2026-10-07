-- ============================================================================
-- FIX: auto_mark_alfa() memakai CURRENT_DATE (UTC), bukan tanggal WIB
-- ============================================================================
-- CURRENT_DATE di Postgres/Supabase berjalan di UTC. Karyawan & mandor berada
-- di WIB (UTC+7). Antara jam 00:00-06:59 WIB, UTC masih di TANGGAL SEBELUMNYA
-- -- jadi "kemarin" menurut database (CURRENT_DATE - 1) sebenarnya DUA hari
-- yang lalu menurut jam dinding WIB.
--
-- Contoh nyata yang memicu fix ini: jam 01:48 WIB tanggal 7 Oktober = masih
-- 18:48 UTC tanggal 6 Oktober. auto_mark_alfa() yang pakai CURRENT_DATE - 1
-- hanya menandai sampai tanggal 5 Oktober (karena bagi database, 6 Oktober
-- belum lewat sama sekali) -- padahal bagi mandor di HP, tanggal 6 Oktober
-- sudah jelas-jelas lewat semalaman. Akibatnya SEMUA karyawan (bukan cuma
-- satu-dua orang) tampil "Belum Input" untuk tanggal 6 Oktober walau sudah
-- lewat hari, sampai jam di database ikut berganti ke tanggal 7 (yaitu jam
-- 07:00 WIB).
--
-- PERBAIKAN: hitung "hari ini" secara eksplisit di zona waktu Asia/Jakarta,
-- bukan mengandalkan CURRENT_DATE bawaan server.
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
BEGIN
  INSERT INTO presensi (project_id, karyawan_id, tanggal, status_kehadiran, metode_input, catatan)
  SELECT NULL, d.karyawan_id, d.tanggal, 'alfa', 'otomatis', 'Otomatis: tidak tercatat'
  FROM (
    SELECT DISTINCT pk.karyawan_id, gs::date AS tanggal
    FROM project_karyawan pk
    JOIN karyawan k ON k.id = pk.karyawan_id AND k.status_aktif = TRUE
    CROSS JOIN LATERAL generate_series(
      pk.tanggal_mulai,
      LEAST(COALESCE(pk.tanggal_selesai, v_hari_ini_wib - 1), v_hari_ini_wib - 1),
      interval '1 day'
    ) AS gs
    WHERE pk.status_assignment = 'aktif'
      AND pk.tanggal_mulai <= v_hari_ini_wib - 1
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

-- Jalankan sekali sekarang untuk langsung membereskan hari-hari yang
-- terlewat (per jam WIB saat ini), termasuk tanggal yang sebelumnya
-- terlewat gara-gara bug CURRENT_DATE di atas.
SELECT auto_mark_alfa() AS baris_alfa_otomatis_dibuat;

-- Verifikasi: tampilkan tanggal WIB yang dipakai sistem sekarang vs tanggal
-- UTC server, untuk konfirmasi bedanya.
SELECT
  (NOW() AT TIME ZONE 'Asia/Jakarta')::date AS tanggal_wib_sekarang,
  CURRENT_DATE AS tanggal_utc_server;
