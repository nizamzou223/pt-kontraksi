-- Alur: kalau sebuah tanggal kerja (Senin-Sabtu) sudah lewat dan seorang
-- karyawan belum punya baris presensi sama sekali untuk tanggal itu, maka
-- otomatis dianggap "alfa" (tidak hadir) -- bukan dibiarkan "belum tercatat"
-- selamanya. Baris alfa otomatis TIDAK diberi project_id -- karyawan yang
-- tidak hadir tidak "mengerjakan" project manapun hari itu (lihat
-- FIX_QR_KPELUS_DAN_ALFA_PROJECT.sql untuk riwayat perbaikan ini; versi awal
-- fungsi ini salah mengisi project_id dari assignment karyawan).
--
-- Sebelumnya logika ini HANYA ada di sisi client (PresensiList.jsx), dan HANYA
-- jalan untuk 1 tanggal yang sedang difilter saat halaman itu dibuka -- kalau
-- tidak ada admin yang pernah membuka tanggal tersebut, baris alfa tidak pernah
-- dibuat, dan mobile app (mandor_app) sama sekali tidak replikasi logika ini.
-- Fungsi ini memindahkan logika itu ke database (satu sumber kebenaran),
-- dipanggil dari admin-web DAN mandor_app, dan meng-cover SEMUA tanggal lewat
-- sekaligus (bukan cuma 1 tanggal yang kebetulan sedang dibuka).
--
-- Jalankan di: Supabase Dashboard -> SQL Editor

-- project_id di presensi harus nullable supaya baris alfa otomatis (tanpa
-- project) bisa disimpan.
ALTER TABLE presensi ALTER COLUMN project_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION auto_mark_alfa() RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  -- CURRENT_DATE server berjalan di UTC, bukan WIB -- di jam 00:00-06:59 WIB
  -- UTC masih di tanggal SEBELUMNYA, yang membuat auto-alfa telat satu hari
  -- penuh untuk semua karyawan di jam-jam itu (lihat FIX_ALFA_TIMEZONE_WIB.sql).
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
      AND EXTRACT(DOW FROM gs) <> 0  -- lewati hari Minggu (libur), sama seperti konvensi seed data lain
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

-- Jalankan sekali sekarang untuk langsung membereskan data yang sudah
-- terlanjur "belum tercatat" padahal harinya sudah lewat.
SELECT auto_mark_alfa() AS baris_alfa_otomatis_dibuat;
