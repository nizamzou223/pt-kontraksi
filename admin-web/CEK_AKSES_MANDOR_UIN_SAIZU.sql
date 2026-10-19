-- ============================================================================
-- CEK: apakah akun mandor boleh MEMBACA presensi proyek UIN SAIZU?
-- RLS (SECURITY_HARDENING.sql) hanya mengizinkan mandor membaca presensi dari
-- project di users.project_id ATAU penugasan aktif project_karyawan milik
-- karyawan yang terhubung ke akunnya (users.karyawan_id). Kalau UIN SAIZU
-- tidak termasuk, presensi UIN SAIZU tidak akan pernah tampil di mobile.
-- Jalankan di: Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Daftar akun mandor + apakah UIN SAIZU termasuk proyek yang boleh diakses
SELECT u.id, u.email, u.role, u.status_aktif,
       up.nama_project AS project_default,
       EXISTS (
         SELECT 1 FROM project p
         WHERE p.kode_project = 'PRJ-UIN-SAIZU-2026'
           AND (p.id = u.project_id
                OR EXISTS (SELECT 1 FROM project_karyawan pk
                           WHERE pk.karyawan_id = u.karyawan_id
                             AND pk.project_id = p.id
                             AND pk.status_assignment = 'aktif'))
       ) AS boleh_lihat_uin_saizu
FROM users u
LEFT JOIN project up ON up.id = u.project_id
WHERE u.role = 'mandor'
ORDER BY u.email;

-- 2. Jika boleh_lihat_uin_saizu = false untuk akun yang dipakai demo,
--    jadikan UIN SAIZU proyek default akun itu (ganti email-nya dulu):
-- UPDATE users
--    SET project_id = (SELECT id FROM project WHERE kode_project = 'PRJ-UIN-SAIZU-2026')
--  WHERE lower(email) = lower('email-mandor@contoh.com');
