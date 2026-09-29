-- ============================================================
-- MIGRATION: PERBAIKAN INVENTARIS (atomic approve, transfer, hapus stok masuk)
-- Jalankan di Supabase SQL Editor SETELAH migration lain (BON_SUBKON,
-- KENDARAAN_STOK_MASUK, RETUR_BARANG, STOK_KELUAR_BON).
-- Dipakai oleh admin-web dan gudang_app.
-- ============================================================

-- ── 1. SETUJUI PERMINTAAN (sekali saja, stok dikurangi atomic) ──
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
  -- Stok hanya boleh dikurangi dari barang milik project peminta
  IF NOT EXISTS (SELECT 1 FROM barang WHERE id = v_p.barang_id AND project_id = v_p.project_id) THEN
    RAISE EXCEPTION 'Barang pada permintaan ini milik project lain. Tolak permintaan ini, lalu transfer barang ke project ini lewat Stok Keluar terlebih dahulu.';
  END IF;

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

-- ── 2. SETUJUI RETUR (sekali saja, stok ditambah atomic) ──
CREATE OR REPLACE FUNCTION approve_retur(
  p_id BIGINT,
  p_karyawan_id BIGINT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_r retur_barang%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM retur_barang WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retur tidak ditemukan.';
  END IF;
  IF v_r.status_retur <> 'pending' THEN
    RAISE EXCEPTION 'Retur sudah diproses (status: %).', v_r.status_retur;
  END IF;

  PERFORM tambah_stok_masuk_retur(
    v_r.project_id, v_r.barang_id, v_r.jumlah_retur,
    'Retur Project #' || v_r.project_id,
    LEFT(COALESCE(v_r.nomor_surat, 'RB-' || p_id), 50),
    'Auto dari persetujuan retur barang'
  );

  UPDATE retur_barang
  SET status_retur = 'disetujui',
      disetujui_oleh = p_karyawan_id,
      tanggal_persetujuan = CURRENT_DATE,
      updated_at = NOW()
  WHERE id = p_id;
END;
$$;

-- ── 3. TRANSFER STOK ANTAR PROJECT (keluar di asal + masuk di tujuan, satu transaksi) ──
-- Barang di project tujuan dicari berdasarkan kode, lalu nama; dibuat baru bila belum ada.
CREATE OR REPLACE FUNCTION transfer_stok(
  p_project_asal BIGINT,
  p_project_tujuan BIGINT,
  p_barang_id BIGINT,
  p_jumlah INT,
  p_tujuan VARCHAR,
  p_nomor_referensi VARCHAR DEFAULT NULL,
  p_nomor_bon VARCHAR DEFAULT NULL,
  p_catatan_bon TEXT DEFAULT NULL,
  p_nomor_rekap VARCHAR DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_b barang%ROWTYPE;
  v_nama_kategori VARCHAR;
  v_kategori_id BIGINT;
  v_barang_tujuan BIGINT;
  v_nama_asal VARCHAR;
BEGIN
  IF p_project_asal = p_project_tujuan THEN
    RAISE EXCEPTION 'Project tujuan tidak boleh sama dengan project asal.';
  END IF;

  SELECT * INTO v_b FROM barang WHERE id = p_barang_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang tidak ditemukan.';
  END IF;
  IF v_b.project_id <> p_project_asal THEN
    RAISE EXCEPTION 'Barang bukan milik project asal.';
  END IF;

  -- Kurangi stok di project asal (validasi stok + lock di dalamnya)
  PERFORM kurangi_stok_keluar(
    p_project_asal, p_barang_id, p_jumlah, LEFT(p_tujuan, 100),
    p_nomor_referensi, p_nomor_bon, p_catatan_bon, p_nomor_rekap, p_catatan
  );

  -- Cari / buat barang padanannya di project tujuan
  SELECT id INTO v_barang_tujuan FROM barang
  WHERE project_id = p_project_tujuan AND kode_barang = v_b.kode_barang LIMIT 1;

  IF v_barang_tujuan IS NULL THEN
    SELECT id INTO v_barang_tujuan FROM barang
    WHERE project_id = p_project_tujuan AND LOWER(nama_barang) = LOWER(v_b.nama_barang) LIMIT 1;
  END IF;

  IF v_barang_tujuan IS NULL THEN
    SELECT COALESCE(nama_kategori, 'Umum') INTO v_nama_kategori
    FROM kategori_barang WHERE id = v_b.kategori_id;
    v_nama_kategori := COALESCE(v_nama_kategori, 'Umum');

    SELECT id INTO v_kategori_id FROM kategori_barang
    WHERE project_id = p_project_tujuan AND nama_kategori = v_nama_kategori LIMIT 1;
    IF v_kategori_id IS NULL THEN
      INSERT INTO kategori_barang (project_id, nama_kategori)
      VALUES (p_project_tujuan, v_nama_kategori)
      RETURNING id INTO v_kategori_id;
    END IF;

    INSERT INTO barang (
      project_id, kode_barang, nama_barang, kategori_id, satuan_id,
      harga_beli, harga_jual, stok_saat_ini, stok_minimal, deskripsi
    ) VALUES (
      p_project_tujuan, v_b.kode_barang, v_b.nama_barang, v_kategori_id, v_b.satuan_id,
      COALESCE(v_b.harga_beli, 0), v_b.harga_jual, 0, COALESCE(v_b.stok_minimal, 0), v_b.deskripsi
    ) RETURNING id INTO v_barang_tujuan;
  END IF;

  SELECT nama_project INTO v_nama_asal FROM project WHERE id = p_project_asal;

  -- Tambah stok di project tujuan
  PERFORM tambah_stok_masuk(
    p_project_tujuan, v_barang_tujuan, p_jumlah, COALESCE(v_b.harga_beli, 0),
    LEFT('Transfer dari ' || COALESCE(v_nama_asal, 'Project #' || p_project_asal), 100),
    p_nomor_referensi, NULL, 'Otomatis dari stok keluar project asal',
    NULL, NULL, NULL
  );
END;
$$;

-- ── 4. HAPUS STOK MASUK (stok dikembalikan atomic) ──
-- Stok masuk hasil transfer / retur tidak bisa dihapus di sini karena
-- terikat dengan transaksi di project lain / data retur.
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
    RAISE EXCEPTION 'Stok masuk hasil transfer antar project tidak bisa dihapus (sudah tercatat sebagai stok keluar di project asal).';
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

-- Disesuaikan dengan SECURITY_HARDENING.sql: hanya pengguna yang sudah login (bukan anon)
REVOKE ALL ON FUNCTION approve_permintaan(BIGINT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION approve_retur(BIGINT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION transfer_stok(BIGINT, BIGINT, BIGINT, INT, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION hapus_stok_masuk(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_permintaan(BIGINT, BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION approve_retur(BIGINT, BIGINT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION transfer_stok(BIGINT, BIGINT, BIGINT, INT, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION hapus_stok_masuk(BIGINT) TO authenticated, service_role;

-- Muat ulang schema cache PostgREST agar fungsi baru langsung bisa dipanggil
NOTIFY pgrst, 'reload schema';
