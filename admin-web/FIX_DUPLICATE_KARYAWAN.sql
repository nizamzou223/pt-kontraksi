-- ============================================================
-- PERBAIKAN: karyawan dobel akibat SEED_UIN_SAIZU_MINGGU17.sql sempat dijalankan
-- 2x sebelum perbaikan ON CONFLICT. Aman: hanya menyentuh baris yang tanggal
-- bergabungnya persis '2026-07-26' (tanggal yang dipakai SELURUH data seed ini),
-- jadi tidak akan menyenggol karyawan lain yang kebetulan namanya sama.
-- Jalankan di: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1) LIHAT DULU: nama mana saja yang dobel, dan berapa salinannya.
SELECT nama_karyawan, COUNT(*) AS jumlah_salinan, MIN(id) AS id_disimpan, MAX(id) AS id_terbaru
FROM karyawan
WHERE tanggal_bergabung = '2026-07-26'
GROUP BY nama_karyawan
HAVING COUNT(*) > 1
ORDER BY nama_karyawan;

-- 2) HAPUS salinan duplikat, SISAKAN yang id-nya paling kecil (baris pertama yang
--    dulu berhasil ter-insert, yang sudah terhubung ke presensi/kasbon Minggu-17).
--    project_karyawan milik salinan yang dihapus ikut terhapus otomatis (ON DELETE CASCADE).
--    Setelah dicek hasil query #1 di atas masuk akal, jalankan DELETE ini:
DELETE FROM karyawan
WHERE tanggal_bergabung = '2026-07-26'
  AND id NOT IN (
    SELECT MIN(id) FROM karyawan WHERE tanggal_bergabung = '2026-07-26' GROUP BY nama_karyawan
  );

-- 3) VERIFIKASI: harus tampil kosong (tidak ada lagi yang dobel).
SELECT nama_karyawan, COUNT(*) FROM karyawan
WHERE tanggal_bergabung = '2026-07-26'
GROUP BY nama_karyawan HAVING COUNT(*) > 1;

-- 4) Total karyawan seed yang tersisa (harus tepat 120).
SELECT COUNT(*) AS total_karyawan_seed FROM karyawan WHERE tanggal_bergabung = '2026-07-26';
