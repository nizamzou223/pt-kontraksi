-- ============================================================
-- DIAGNOSTIK + BACKFILL: presensi 'alfa' otomatis yang belum sempat tercatat
-- Jalankan di: Supabase Dashboard → SQL Editor
--
-- LATAR BELAKANG: fitur auto-mark 'alfa' di aplikasi Mandor mengisi presensi hari-hari
-- lalu yang kosong. Skrip ini mengecek/melengkapinya dari sisi database. Aman dijalankan
-- berkali-kali (tidak menimpa data yang sudah ada apa pun statusnya).
--
-- CATATAN (koreksi): versi awal berkas ini menyatakan bahwa upsert lama PASTI gagal
-- karena constraint salah tebak. Itu belum terbukti — hasil bagian 2 di lingkungan
-- nyata menunjukkan tidak ada tanggal kosong, artinya baris presensi sudah ada.
-- Untuk memeriksa mengapa layar HP tetap menampilkan "Belum Input", pakai
-- DIAGNOSTIC_PRESENSI_VISIBILITAS.sql.
-- ============================================================

-- 1) Constraint unik yang BENAR-BENAR aktif di tabel presensi (untuk referensi) --
SELECT conname, pg_get_constraintdef(oid) AS definisi
  FROM pg_constraint
 WHERE conrelid = 'public.presensi'::regclass AND contype = 'u';

-- 2) Pratinjau: karyawan aktif yang akan ditandai 'alfa' untuk 14 hari terakhir
--    (hanya yang BELUM punya presensi apa pun pada tanggal itu, di proyek mana pun).
WITH rentang AS (
  SELECT (CURRENT_DATE - i)::date AS tanggal FROM generate_series(1, 14) AS i
),
kandidat AS (
  SELECT k.id AS karyawan_id, k.nama_karyawan, r.tanggal
    FROM karyawan k
    CROSS JOIN rentang r
   WHERE k.status_aktif IS TRUE
     AND NOT EXISTS (
       SELECT 1 FROM presensi p
        WHERE p.karyawan_id = k.id AND p.tanggal = r.tanggal
     )
)
SELECT count(*) AS akan_ditandai_alfa FROM kandidat;

-- 3) BACKFILL — hapus komentar (--) di baris INSERT di bawah untuk benar-benar
--    menjalankannya. project_id diambil dari project TERAKHIR tempat karyawan itu
--    tercatat presensi (fallback: proyek pertama yang aktif) — kalau perlu proyek
--    tertentu, ganti langsung.
-- INSERT INTO presensi (project_id, karyawan_id, tanggal, status_kehadiran, metode_input, catatan)
-- WITH rentang AS (
--   SELECT (CURRENT_DATE - i)::date AS tanggal FROM generate_series(1, 14) AS i
-- ),
-- proyek_terakhir AS (
--   SELECT DISTINCT ON (karyawan_id) karyawan_id, project_id
--     FROM presensi ORDER BY karyawan_id, tanggal DESC
-- ),
-- proyek_fallback AS (
--   SELECT id FROM project WHERE status_project = 'aktif' ORDER BY id LIMIT 1
-- )
-- SELECT
--   COALESCE(pt.project_id, (SELECT id FROM proyek_fallback)),
--   k.id, r.tanggal, 'alfa', 'otomatis', 'Otomatis: tidak tercatat (backfill)'
--   FROM karyawan k
--   CROSS JOIN rentang r
--   LEFT JOIN proyek_terakhir pt ON pt.karyawan_id = k.id
--  WHERE k.status_aktif IS TRUE
--    AND NOT EXISTS (SELECT 1 FROM presensi p WHERE p.karyawan_id = k.id AND p.tanggal = r.tanggal);
