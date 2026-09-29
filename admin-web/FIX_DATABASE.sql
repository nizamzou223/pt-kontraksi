-- ================================================================
-- JALANKAN DI SUPABASE SQL EDITOR
-- Fix 1: Unique constraint agar saveGajiMingguan bisa INSERT/UPDATE benar
-- Fix 2: Bersihkan data nizamzou (potongan kasbon yang kasbon-nya sudah dihapus)
-- ================================================================

-- 1. Tambah unique constraint jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rekap_gaji_mingguan_karyawan_periode_unique'
  ) THEN
    ALTER TABLE public.rekap_gaji_mingguan
      ADD CONSTRAINT rekap_gaji_mingguan_karyawan_periode_unique
      UNIQUE (karyawan_id, periode_mulai, periode_selesai);
    RAISE NOTICE 'Unique constraint ditambahkan';
  ELSE
    RAISE NOTICE 'Unique constraint sudah ada';
  END IF;
END $$;

-- 2. Fix semua rekap gaji DRAFT: sesuaikan potongan kasbon dengan kasbon aktif saat ini
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
  gaji_bersih = rgm.gaji_kotor - LEAST(
    COALESCE((
      SELECT SUM(k.sisa_kasbon)
      FROM public.kasbon k
      WHERE k.karyawan_id = rgm.karyawan_id
        AND k.status_lunas = false
        AND k.sisa_kasbon > 0
    ), 0),
    rgm.gaji_kotor
  ),
  updated_at = NOW()
WHERE rgm.status = 'draft';

-- 3. Cek hasil - tampilkan semua rekap draft
SELECT
  k.nama_karyawan,
  rgm.periode_mulai,
  rgm.periode_selesai,
  rgm.total_hari_hadir,
  rgm.gaji_kotor,
  rgm.total_potongan_kasbon,
  rgm.gaji_bersih,
  rgm.status
FROM public.rekap_gaji_mingguan rgm
JOIN public.karyawan k ON k.id = rgm.karyawan_id
WHERE rgm.status = 'draft'
ORDER BY rgm.periode_mulai DESC, k.nama_karyawan;
