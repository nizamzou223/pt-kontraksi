-- ============================================================
-- DEMO OKTOBER 2026: presensi harian (Senin-Sabtu) + contoh kasbon,
-- untuk semua karyawan proyek UIN SAIZU supaya layar Presensi/Kasbon
-- tidak kosong saat dibuka bulan Oktober (demo seminar).
-- INI DATA CONTOH/SIMULASI, BUKAN data riil presensi Oktober.
-- Jalankan SETELAH SEED_UIN_SAIZU_MINGGU17.sql (karyawan & project harus sudah ada).
-- ============================================================

-- 1. Lengkapi gaji_harian_override perorangan untuk yang masih NULL
UPDATE karyawan SET gaji_harian_override = 110000
WHERE nama_karyawan IN ('P. Ajat','Heru','Bangun','Andesi','Bagus (Hidrant)','Ari Iskandar','Dadang')
  AND gaji_harian_override IS NULL;

UPDATE karyawan SET gaji_harian_override = 196667 WHERE nama_karyawan = 'P. Ahmad Risqi' AND gaji_harian_override IS NULL;
UPDATE karyawan SET gaji_harian_override = 174167 WHERE nama_karyawan = 'Restu' AND gaji_harian_override IS NULL;
UPDATE karyawan SET gaji_harian_override = 161250 WHERE nama_karyawan = 'Ismail' AND gaji_harian_override IS NULL;
UPDATE karyawan SET gaji_harian_override = 139167 WHERE nama_karyawan = 'Noval' AND gaji_harian_override IS NULL;
UPDATE karyawan SET gaji_harian_override = 90000 WHERE nama_karyawan = 'P. Abdulloh Faqih' AND gaji_harian_override IS NULL;

-- 2. Presensi: Senin-Sabtu x 120 karyawan, TIDAK PERNAH melewati hari ini
--    (pakai CURRENT_DATE supaya aman dijalankan ulang kapan saja -- tidak akan
--    pernah mengisi tanggal yang belum terjadi).
INSERT INTO presensi (project_id, karyawan_id, tanggal, jam_masuk, jam_keluar, durasi_jam, status_kehadiran, uang_makan, uang_transport)
SELECT (SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), k.id, d.tanggal, '07:00:00', '15:00:00', 8, 'hadir', 15000, 10000
FROM karyawan k
CROSS JOIN (
  SELECT gs::date AS tanggal
  FROM generate_series('2026-10-01'::date, LEAST(CURRENT_DATE, '2026-10-31'::date), interval '1 day') AS gs
  WHERE EXTRACT(DOW FROM gs) <> 0  -- lewati Minggu
) AS d
WHERE k.nama_karyawan IN ('P. Supri', 'Agus', 'Khotip', 'Miftah/Temit', 'Latip', 'Rizal (STP)', 'Rajib', 'Bagus (STP)', 'Roso', 'Rasiwan', 'Nova/rifa', 'Ogi', 'Tanto', 'Kukuh', 'Risqi (L4)', 'Arif', 'P. Ajat', 'Heru', 'Bangun', 'Andesi', 'Bagus (Hidrant)', 'Ari Iskandar', 'Dadang', 'Jepri', 'Yana', 'Imam', 'Simus', 'Teguh (Plambing)', 'Dudung', 'P. Maun', 'P. Joko', 'Amir', 'Danil', 'Ardi (ME)', 'Sahrul', 'Dani', 'Eko', 'Mamat', 'Ade', 'Marwan', 'Catur', 'Bowo', 'Febri', 'Doweng', 'Tiar', 'Ardi (Plapon)', 'Wawang', 'Oki', 'Tarno (Plapon)', 'Adi', 'Hoho', 'Agus S', 'Leto', 'Galih (Plapon)', 'Agung (Plapon)', 'Seno', 'P. Teguh', 'Manislam', 'Tarno (Sipil1)', 'Kusmar', 'Cecep', 'Anto B', 'Erul', 'Aan', 'Kawil', 'Ikun2', 'Anto A', 'Zainal', 'Andri', 'Sage', 'Yanto', 'Muhasim', 'Udin', 'Koko', 'Rian s', 'Risqi (Sipil)', 'Rizal (Sipil)', 'Fajar', 'Darsono', 'Natam', 'Rifki', 'Samsul', 'Toyo', 'Indra', 'Trisno', 'Wardi', 'Nanto', 'Kasrin', 'Yoko', 'Abi', 'Tarso', 'Daryono', 'Muji', 'Aldi', 'Juni', 'April', 'Natim', 'Muslimin', 'Rudi', 'Agung (Sipil)', 'Galih (Sipil)', 'Toni', 'Heri', 'Edi', 'Haryono', 'Apri', 'Mufit', 'Yazid', 'Marno', 'Arifin', 'Sarmun', 'Reza', 'Miswanto', 'Hervan', 'Tarno B', 'P. Ahmad Risqi', 'P. Abdulloh Faqih', 'Restu', 'Ismail', 'Noval')
ON CONFLICT DO NOTHING;

-- 3. Contoh kasbon (simulasi, bukan data riil) -- SEMUA berstatus LUNAS, dan
--    tanggalnya relatif ke hari ini (CURRENT_DATE - N hari) supaya tidak pernah
--    jatuh di masa depan, aman dijalankan ulang kapan saja.
INSERT INTO kasbon (project_id, karyawan_id, jumlah_kasbon, sisa_kasbon, tanggal_kasbon, status_lunas, catatan)
VALUES
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='P. Supri'), 200000, 0, CURRENT_DATE - 11, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Agus'), 150000, 0, CURRENT_DATE - 10, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Bowo'), 300000, 0, CURRENT_DATE - 9, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Manislam'), 100000, 0, CURRENT_DATE - 8, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Catur'), 250000, 0, CURRENT_DATE - 7, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Erul'), 200000, 0, CURRENT_DATE - 6, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Tiar'), 150000, 0, CURRENT_DATE - 5, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Kasrin'), 300000, 0, CURRENT_DATE - 4, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Ismail'), 500000, 0, CURRENT_DATE - 3, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Restu'), 200000, 0, CURRENT_DATE - 2, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Mufit'), 250000, 0, CURRENT_DATE - 1, true, 'Contoh demo Oktober'),
  ((SELECT id FROM project WHERE kode_project='PRJ-UIN-SAIZU-2026'), (SELECT id FROM karyawan WHERE nama_karyawan='Aan'), 150000, 0, CURRENT_DATE, true, 'Contoh demo Oktober');
