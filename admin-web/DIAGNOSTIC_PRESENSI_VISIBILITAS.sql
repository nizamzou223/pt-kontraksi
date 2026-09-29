-- ============================================================
-- DIAGNOSTIK: kenapa presensi yang ADA di database tidak tampil di aplikasi Mandor?
-- Jalankan di: Supabase Dashboard → SQL Editor. Baca-saja (tidak mengubah data).
--
-- Editor hanya menampilkan hasil pernyataan TERAKHIR, jadi jalankan tiap bagian
-- sendiri-sendiri: blok teks satu bagian, lalu tekan Run (Ctrl+Enter).
-- Kirimkan hasil ketiga bagian ke saya (boleh tangkapan layar).
-- ============================================================

-- ── BAGIAN A: presensi 7 hari terakhir apa adanya (tanpa RLS, sebagai admin) ──
-- Perhatikan kolom project_id/kode_project: milik proyek mana baris-baris itu?
SELECT p.tanggal, k.nama_karyawan, p.project_id, pr.kode_project,
       p.status_kehadiran, p.metode_input, p.created_at
  FROM presensi p
  JOIN karyawan k ON k.id = p.karyawan_id
  LEFT JOIN project pr ON pr.id = p.project_id
 WHERE p.tanggal >= CURRENT_DATE - 7
 ORDER BY p.tanggal DESC, k.nama_karyawan;

-- ── BAGIAN B: akun mandor — proyek tersimpan & penugasan aktifnya ──
SELECT u.id, u.email, u.role, u.project_id, u.karyawan_id,
       (SELECT array_agg(pk.project_id) FROM project_karyawan pk
         WHERE pk.karyawan_id = u.karyawan_id AND pk.status_assignment = 'aktif') AS penugasan_aktif
  FROM users u
 WHERE u.role IN ('mandor', 'mandor_gudang');

-- ── BAGIAN C: apa yang DILIHAT akun mandor itu (RLS diberlakukan) ──
-- GANTI email di bawah dengan email akun Nizam (dari Bagian B), lalu jalankan.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
                  '{"email":"GANTI_DENGAN_EMAIL_NIZAM","role":"authenticated"}', true);
SELECT app_role() AS peran,
       ARRAY(SELECT app_project_ids()) AS proyek_yang_boleh_diakses,
       (SELECT count(*) FROM presensi WHERE tanggal >= CURRENT_DATE - 7) AS presensi_terlihat_7_hari;
