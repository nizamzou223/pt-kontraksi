-- Wajibkan NIK karyawan tepat 16 digit angka.
-- Jalankan di Supabase SQL Editor untuk database yang sudah berjalan.
--
-- NOT VALID: data lama (mis. KRY-016) tidak diperiksa ulang, tetapi setiap
-- INSERT/UPDATE baru wajib 16 digit. Setelah semua NIK lama diganti dengan
-- NIK 16 digit yang benar, jalankan:
--   ALTER TABLE karyawan VALIDATE CONSTRAINT karyawan_nik_16_digit;

ALTER TABLE karyawan
  ADD CONSTRAINT karyawan_nik_16_digit
  CHECK (nik ~ '^[0-9]{16}$') NOT VALID;

-- Daftar karyawan yang NIK-nya masih perlu diperbaiki:
SELECT id, nama_karyawan, nik
FROM karyawan
WHERE nik !~ '^[0-9]{16}$'
ORDER BY id;
