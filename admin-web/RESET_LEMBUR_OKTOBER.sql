-- Hapus semua histori lembur (termasuk data contoh bulan Juli yang sudah tidak
-- relevan lagi). Tidak ada tanggal yang di-hardcode di kode aplikasi untuk lembur
-- (form & query selalu pakai tanggal hari ini/filter pilihan user) -- data lama
-- ini murni sisa dari seed data contoh (SEED_UIN_SAIZU_MINGGU17.sql).
-- Jalankan di: Supabase Dashboard -> SQL Editor
-- Setelah ini, data lembur baru otomatis mulai dari hari ini (Oktober 2026+).

DELETE FROM lembur;
