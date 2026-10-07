-- ============================================================================
-- DIAGNOSA: kenapa presensi "Aiman" (atau karyawan lain) tidak pernah
-- ter-input/ter-hitung otomatis untuk hari yang sudah lewat
-- ============================================================================
-- auto_mark_alfa() (lihat MIGRATION_AUTO_ALFA.sql) membuat baris "alfa"
-- HANYA untuk karyawan yang punya baris project_karyawan dengan
-- status_assignment = 'aktif'. Kalau admin lupa men-assign karyawan ke
-- project (lewat tombol "Assign Karyawan" di halaman Project List), dia
-- tidak akan pernah dihitung tidak hadir -- di platform manapun -- bukan
-- karena bug RLS, tapi karena memang tidak pernah diproses sama sekali.

-- 1) Cek data karyawan & penugasan project-nya
SELECT k.id, k.nama_karyawan, k.status_aktif,
       pk.project_id, p.nama_project, pk.status_assignment, pk.tanggal_mulai, pk.tanggal_selesai
  FROM karyawan k
  LEFT JOIN project_karyawan pk ON pk.karyawan_id = k.id
  LEFT JOIN project p ON p.id = pk.project_id
 WHERE k.nama_karyawan ILIKE '%aiman%';

-- 2) Cek presensi yang sudah tercatat untuknya (kalau ada sama sekali)
SELECT p.tanggal, p.status_kehadiran, p.metode_input, p.project_id
  FROM presensi p
  JOIN karyawan k ON k.id = p.karyawan_id
 WHERE k.nama_karyawan ILIKE '%aiman%'
 ORDER BY p.tanggal DESC
 LIMIT 15;

-- 3) Daftar LENGKAP semua karyawan aktif yang tidak punya penugasan project
--    aktif -- Aiman kemungkinan besar ada di daftar ini. Semuanya perlu
--    di-assign lewat halaman Project List -> tombol "Assign Karyawan".
SELECT k.id, k.nama_karyawan
  FROM karyawan k
 WHERE k.status_aktif = TRUE
   AND NOT EXISTS (
     SELECT 1 FROM project_karyawan pk
      WHERE pk.karyawan_id = k.id AND pk.status_assignment = 'aktif'
   )
 ORDER BY k.nama_karyawan;
