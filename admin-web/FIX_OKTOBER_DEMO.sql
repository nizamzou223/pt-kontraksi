-- ============================================================
-- PERBAIKAN DATA DEMO OKTOBER:
-- 1) Presensi sempat terisi sampai akhir Oktober padahal tanggalnya belum
--    terjadi (tidak logis -- orang tidak bisa "hadir" di hari yang belum
--    terjadi). Hapus presensi yang tanggalnya di masa depan.
-- 2) Semua kasbon contoh dijadikan LUNAS (tidak ada yang outstanding),
--    sesuai permintaan -- supaya tidak ada "kesan belum beres" di demo.
-- Jalankan di: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1) Hapus presensi yang tanggalnya setelah hari ini (data Oktober yang belum terjadi)
DELETE FROM presensi WHERE tanggal > CURRENT_DATE;

-- 2) Jadikan semua kasbon contoh Oktober LUNAS, dan geser tanggalnya supaya
--    tidak ada yang jatuh di masa depan (beberapa sebelumnya di-set sampai
--    akhir Oktober, padahal hari ini masih awal bulan).
WITH urut AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY tanggal_kasbon) AS rn
  FROM kasbon WHERE catatan = 'Contoh demo Oktober'
)
UPDATE kasbon k
SET status_lunas = true, sisa_kasbon = 0,
    tanggal_kasbon = CURRENT_DATE - (12 - urut.rn)::integer
FROM urut
WHERE k.id = urut.id;

-- 3) Verifikasi
SELECT 'presensi tanggal depan tersisa' AS cek, COUNT(*) FROM presensi WHERE tanggal > CURRENT_DATE
UNION ALL
SELECT 'kasbon demo masih outstanding', COUNT(*) FROM kasbon WHERE catatan = 'Contoh demo Oktober' AND status_lunas = false;
