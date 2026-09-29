-- ================================================================
-- MIGRATION FIX V2 — Jalankan di Supabase SQL Editor
-- Menambah kolom yang hilang dan memperbaiki schema
-- ================================================================

-- 1. Tambah kolom upah_luar_kota ke tabel presensi (ada di logika JS tapi hilang di schema)
ALTER TABLE public.presensi
  ADD COLUMN IF NOT EXISTS upah_luar_kota DECIMAL(10,2) DEFAULT 0;

-- 2. Tambah kolom breakdown ke rekap_gaji_bulanan
--    (sebelumnya hanya ada total_gaji_bersih, kolom detail hilang)
ALTER TABLE public.rekap_gaji_bulanan
  ADD COLUMN IF NOT EXISTS total_gaji_kotor     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_gaji_pokok     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_uang_makan     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_uang_transport DECIMAL(12,2) DEFAULT 0;

-- 3. Rename kolom total_lembur_jam → total_uang_lembur di rekap_gaji_bulanan
--    (nama lama salah — isinya rupiah bukan jam)
DO $$
BEGIN
  -- Cek apakah kolom lama masih ada
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rekap_gaji_bulanan'
      AND column_name = 'total_lembur_jam'
  ) THEN
    -- Tambah kolom baru jika belum ada
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'rekap_gaji_bulanan'
        AND column_name = 'total_uang_lembur'
    ) THEN
      ALTER TABLE public.rekap_gaji_bulanan
        ADD COLUMN total_uang_lembur DECIMAL(12,2) DEFAULT 0;
    END IF;
    -- Salin data dari kolom lama ke baru
    UPDATE public.rekap_gaji_bulanan
    SET total_uang_lembur = COALESCE(total_lembur_jam, 0);
    -- Drop kolom lama
    ALTER TABLE public.rekap_gaji_bulanan DROP COLUMN total_lembur_jam;
    RAISE NOTICE 'Kolom total_lembur_jam berhasil direname ke total_uang_lembur';
  ELSE
    -- Kolom lama sudah tidak ada, pastikan kolom baru ada
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'rekap_gaji_bulanan'
        AND column_name = 'total_uang_lembur'
    ) THEN
      ALTER TABLE public.rekap_gaji_bulanan
        ADD COLUMN total_uang_lembur DECIMAL(12,2) DEFAULT 0;
      RAISE NOTICE 'Kolom total_uang_lembur ditambahkan';
    ELSE
      RAISE NOTICE 'Kolom total_uang_lembur sudah ada';
    END IF;
  END IF;
END $$;

-- 4. Pastikan unique constraint gaji mingguan ada (untuk upsert benar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rekap_gaji_mingguan_karyawan_periode_unique'
  ) THEN
    ALTER TABLE public.rekap_gaji_mingguan
      ADD CONSTRAINT rekap_gaji_mingguan_karyawan_periode_unique
      UNIQUE (karyawan_id, periode_mulai, periode_selesai);
    RAISE NOTICE 'Unique constraint rekap_gaji_mingguan ditambahkan';
  ELSE
    RAISE NOTICE 'Unique constraint rekap_gaji_mingguan sudah ada';
  END IF;
END $$;

-- 5. Index tambahan untuk performa
CREATE INDEX IF NOT EXISTS idx_kasbon_karyawan_lunas
  ON public.kasbon(karyawan_id, status_lunas);

CREATE INDEX IF NOT EXISTS idx_lembur_karyawan_tanggal
  ON public.lembur(karyawan_id, tanggal);

CREATE INDEX IF NOT EXISTS idx_lembur_catatan
  ON public.lembur(catatan text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_rekap_mingguan_karyawan_periode
  ON public.rekap_gaji_mingguan(karyawan_id, periode_mulai, periode_selesai);

CREATE INDEX IF NOT EXISTS idx_rekap_bulanan_karyawan_bulan
  ON public.rekap_gaji_bulanan(karyawan_id, bulan, tahun);

CREATE INDEX IF NOT EXISTS idx_presensi_tanggal_status
  ON public.presensi(tanggal, status_kehadiran);

-- 6. Fix data: recalculate semua rekap gaji DRAFT agar potongan kasbon
--    sinkron dengan kasbon aktif sekarang
UPDATE public.rekap_gaji_mingguan rgm
SET
  total_potongan_kasbon = LEAST(
    COALESCE((
      SELECT SUM(k.sisa_kasbon)
      FROM public.kasbon k
      WHERE k.karyawan_id = rgm.karyawan_id
        AND k.status_lunas = false
        AND k.sisa_kasbon > 0
    ), 0),
    rgm.gaji_kotor
  ),
  gaji_bersih = GREATEST(0,
    rgm.gaji_kotor - LEAST(
      COALESCE((
        SELECT SUM(k.sisa_kasbon)
        FROM public.kasbon k
        WHERE k.karyawan_id = rgm.karyawan_id
          AND k.status_lunas = false
          AND k.sisa_kasbon > 0
      ), 0),
      rgm.gaji_kotor
    )
  ),
  updated_at = NOW()
WHERE rgm.status = 'draft';

-- 7. Verifikasi — tampilkan ringkasan
SELECT
  'presensi.upah_luar_kota'   AS kolom,
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='presensi' AND column_name='upah_luar_kota')
    THEN '✓ ADA' ELSE '✗ TIDAK ADA' END AS status
UNION ALL SELECT
  'rekap_gaji_bulanan.total_uang_lembur',
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='rekap_gaji_bulanan' AND column_name='total_uang_lembur')
    THEN '✓ ADA' ELSE '✗ TIDAK ADA' END
UNION ALL SELECT
  'rekap_gaji_bulanan.total_gaji_kotor',
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='rekap_gaji_bulanan' AND column_name='total_gaji_kotor')
    THEN '✓ ADA' ELSE '✗ TIDAK ADA' END
UNION ALL SELECT
  'rekap_gaji_bulanan.total_gaji_pokok',
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='rekap_gaji_bulanan' AND column_name='total_gaji_pokok')
    THEN '✓ ADA' ELSE '✗ TIDAK ADA' END;
