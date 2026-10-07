-- ============================================================================
-- FIX: Gudang Pusat — barang & kategori_barang jadi GLOBAL (satu stok bersama)
-- ============================================================================
-- Sebelumnya: setiap project punya baris barang & kategori_barang SENDIRI
-- (project_id NOT NULL, UNIQUE per project), dan stok dipindah antar project
-- lewat transfer_stok() (clone barang + stok keluar di asal + stok masuk di
-- tujuan). Ini artinya "Semen 50kg" di Project A dan "Semen 50kg" di Project B
-- adalah dua baris terpisah dengan stok terpisah.
--
-- Sekarang: SATU katalog barang milik perusahaan, SATU stok_saat_ini per
-- barang, dipakai bersama oleh semua project. Permintaan Barang = ambil dari
-- gudang pusat (stok global berkurang saat disetujui). Retur Barang =
-- kembalikan ke gudang pusat (stok global bertambah saat disetujui).
-- Konsekuensinya transfer_stok() tidak diperlukan lagi -- tidak ada lagi
-- "milik project lain" untuk dipindahkan.
--
-- Tabel TRANSAKSI (stok_masuk, stok_keluar, permintaan_barang, retur_barang)
-- TETAP punya project_id -- itu mencatat DI PROJECT MANA transaksi itu
-- terjadi (siapa yang minta/mengembalikan/menerima barang), dan itu tetap sah
-- walau barangnya sendiri sudah global.
--
-- PENTING -- jalankan dulu SEBELUM script ini, perbaiki manual bila ada hasil:
--   SELECT kode_barang, COUNT(*), array_agg(id) FROM barang GROUP BY kode_barang HAVING COUNT(*) > 1;
--   SELECT nama_kategori, COUNT(*), array_agg(id) FROM kategori_barang GROUP BY nama_kategori HAVING COUNT(*) > 1;
-- (barang/kategori dengan nama sama tapi project berbeda akan gagal kena
-- UNIQUE constraint baru -- gabungkan baris duplikat manual dulu: pindahkan
-- referensi stok_masuk/stok_keluar/permintaan_barang/retur_barang.barang_id
-- ke satu baris yang dipertahankan, baru hapus baris duplikatnya.)
--
-- Jalankan di: Supabase Dashboard -> SQL Editor (1x, aman diulang)
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Hapus dulu policy RLS lama yang masih bergantung pada kolom project_id
--    di barang/kategori_barang -- Postgres menolak DROP COLUMN kalau masih
--    ada objek (termasuk RLS policy) yang mereferensikannya. Policy baru
--    (yang tidak bergantung pada project_id) dibuat di langkah 6 di bawah.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS kategori_barang_project_scope ON kategori_barang;
DROP POLICY IF EXISTS barang_project_scope           ON barang;

-- ------------------------------------------------------------
-- 1. KATEGORI_BARANG: lepas dari project, jadi master data global
-- ------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'kategori_barang'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE '%project_id%'
  LOOP
    EXECUTE format('ALTER TABLE kategori_barang DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE kategori_barang DROP COLUMN IF EXISTS project_id;

ALTER TABLE kategori_barang DROP CONSTRAINT IF EXISTS kategori_barang_nama_kategori_key;
ALTER TABLE kategori_barang ADD  CONSTRAINT kategori_barang_nama_kategori_key UNIQUE (nama_kategori);

-- ------------------------------------------------------------
-- 2. BARANG: lepas dari project, jadi katalog + stok global
-- ------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'barang'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE '%project_id%'
  LOOP
    EXECUTE format('ALTER TABLE barang DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE barang DROP COLUMN IF EXISTS project_id;

ALTER TABLE barang DROP CONSTRAINT IF EXISTS barang_kode_barang_key;
ALTER TABLE barang ADD  CONSTRAINT barang_kode_barang_key UNIQUE (kode_barang);

-- ------------------------------------------------------------
-- 3. approve_permintaan: hapus guard "barang milik project lain" (tidak
--    relevan lagi karena barang tidak lagi punya project_id)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_permintaan(
  p_id BIGINT,
  p_karyawan_id BIGINT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_p permintaan_barang%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM permintaan_barang WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan tidak ditemukan.';
  END IF;
  IF v_p.status_permintaan <> 'pending' THEN
    RAISE EXCEPTION 'Permintaan sudah diproses (status: %).', v_p.status_permintaan;
  END IF;

  -- Barang sekarang global (gudang pusat) -- tidak ada lagi "milik project
  -- lain", jadi tidak perlu dicek kepemilikan project sebelum mengurangi stok.
  PERFORM kurangi_stok_keluar(
    v_p.project_id, v_p.barang_id, v_p.jumlah_diminta,
    'Permintaan Barang #' || p_id, 'PB-' || p_id,
    NULL, NULL, NULL, 'Auto dari persetujuan permintaan barang'
  );

  UPDATE permintaan_barang
  SET status_permintaan = 'disetujui',
      disetujui_oleh = p_karyawan_id,
      tanggal_persetujuan = CURRENT_DATE,
      updated_at = NOW()
  WHERE id = p_id;
END;
$$;

-- ------------------------------------------------------------
-- 4. transfer_stok: DIHAPUS. Satu gudang pusat = tidak ada lagi "pindah
--    barang antar project" -- permintaan & retur sudah cukup.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS transfer_stok(BIGINT, BIGINT, BIGINT, INT, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT);

-- ------------------------------------------------------------
-- 5. hapus_stok_masuk: guard "Retur Project%" tetap (retur masih relevan).
--    Guard "Transfer dari%" TETAP DIPERTAHANKAN untuk data LAMA -- baris
--    stok_masuk hasil transfer_stok() dulu berpasangan dengan stok_keluar di
--    project asal; menghapus sisi masuknya sekarang akan mengurangi stok
--    global tanpa pasangan yang mengoreksinya. transfer_stok() sendiri sudah
--    dihapus sehingga baris baru dengan sumber ini tidak akan pernah tercipta
--    lagi -- guard ini murni melindungi riwayat lama.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION hapus_stok_masuk(p_id BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_sm stok_masuk%ROWTYPE;
  v_stok INT;
BEGIN
  SELECT * INTO v_sm FROM stok_masuk WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data stok masuk tidak ditemukan.';
  END IF;
  IF v_sm.sumber LIKE 'Transfer dari%' THEN
    RAISE EXCEPTION 'Stok masuk hasil transfer antar project (data lama, fitur transfer sudah dihapus) tidak bisa dihapus karena berpasangan dengan stok keluar di project asal.';
  END IF;
  IF v_sm.sumber LIKE 'Retur Project%' THEN
    RAISE EXCEPTION 'Stok masuk hasil retur tidak bisa dihapus (terikat dengan data retur yang sudah disetujui).';
  END IF;

  SELECT stok_saat_ini INTO v_stok FROM barang WHERE id = v_sm.barang_id FOR UPDATE;
  IF COALESCE(v_stok, 0) < v_sm.jumlah THEN
    RAISE EXCEPTION 'Tidak bisa dihapus: stok saat ini (%) lebih kecil dari jumlah masuk (%) karena sebagian sudah keluar.', COALESCE(v_stok, 0), v_sm.jumlah;
  END IF;

  DELETE FROM stok_masuk WHERE id = p_id;
  UPDATE barang
  SET stok_saat_ini = stok_saat_ini - v_sm.jumlah,
      updated_at = NOW()
  WHERE id = v_sm.barang_id;
END;
$$;

-- ------------------------------------------------------------
-- 6. RLS: kategori_barang & barang jadi master data GLOBAL, pola sama
--    seperti satuan_barang (SECURITY_HARDENING.sql bagian 3b): baca untuk
--    semua peran operasional, tulis hanya admin/hr.
--
--    KEPUTUSAN: mandor/mandor_gudang HANYA baca katalog, TIDAK bisa
--    membuat/mengubah/menghapus barang atau kategori lagi. Sebelumnya
--    mandor_gudang boleh menulis karena scope-nya cuma project sendiri
--    (can_access_project). Sekarang katalog dipakai SELURUH perusahaan --
--    kalau tetap dibolehkan menulis, satu mandor_gudang di Project A bisa
--    mengubah/menghapus/menduplikasi item yang dipakai Project B. Supaya
--    konsisten dengan model peran yang sudah ada (lihat komentar baris 13-19
--    SECURITY_HARDENING.sql) dan dengan pola satuan_barang yang sudah lebih
--    dulu global, penulisan katalog dibatasi admin/hr saja. mandor_gudang
--    tetap bisa MENULIS transaksi (stok_masuk, stok_keluar, permintaan_barang,
--    retur_barang) di project-nya sendiri seperti biasa -- policy tabel
--    transaksi itu TIDAK berubah.
-- ------------------------------------------------------------
CREATE POLICY kategori_barang_read  ON kategori_barang FOR SELECT TO authenticated USING (is_operational());
CREATE POLICY kategori_barang_write ON kategori_barang FOR ALL    TO authenticated USING (is_admin_or_hr()) WITH CHECK (is_admin_or_hr());

CREATE POLICY barang_read  ON barang FOR SELECT TO authenticated USING (is_operational());
CREATE POLICY barang_write ON barang FOR ALL    TO authenticated USING (is_admin_or_hr()) WITH CHECK (is_admin_or_hr());

-- stok_masuk_project_scope, stok_keluar_project_scope,
-- permintaan_barang_project_scope, retur_barang_project_scope TIDAK diubah --
-- tabel-tabel itu tetap punya project_id dan tetap pakai can_access_project().

COMMIT;

-- Muat ulang schema cache PostgREST agar perubahan kolom/fungsi langsung kepakai
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFIKASI
-- ------------------------------------------------------------
-- 1) barang & kategori_barang tidak lagi punya project_id
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('barang','kategori_barang')
   AND column_name = 'project_id';
-- (harus 0 baris)

-- 2) kode_barang & nama_kategori unik secara global
SELECT kode_barang, COUNT(*) FROM barang GROUP BY kode_barang HAVING COUNT(*) > 1;
SELECT nama_kategori, COUNT(*) FROM kategori_barang GROUP BY nama_kategori HAVING COUNT(*) > 1;
-- (keduanya harus 0 baris -- kalau ada duplikat lintas-project lama, gabungkan manual dulu)

-- 3) transfer_stok sudah tidak ada
SELECT proname FROM pg_proc WHERE proname = 'transfer_stok';
-- (harus 0 baris)
