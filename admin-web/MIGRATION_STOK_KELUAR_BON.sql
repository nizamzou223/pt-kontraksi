-- Tambah kolom bon dan rekap ke tabel stok_keluar
ALTER TABLE stok_keluar ADD COLUMN IF NOT EXISTS nomor_bon VARCHAR(100);
ALTER TABLE stok_keluar ADD COLUMN IF NOT EXISTS catatan_bon TEXT;
ALTER TABLE stok_keluar ADD COLUMN IF NOT EXISTS nomor_rekap VARCHAR(100);

-- Update RPC kurangi_stok_keluar agar support field baru
CREATE OR REPLACE FUNCTION kurangi_stok_keluar(
  p_project_id BIGINT,
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
  v_stok INT;
BEGIN
  SELECT stok_saat_ini INTO v_stok FROM barang WHERE id = p_barang_id FOR UPDATE;

  IF v_stok < p_jumlah THEN
    RAISE EXCEPTION 'Stok tidak mencukupi! Stok tersedia: %, diminta: %', v_stok, p_jumlah;
  END IF;

  UPDATE barang
  SET stok_saat_ini = stok_saat_ini - p_jumlah,
      updated_at = NOW()
  WHERE id = p_barang_id;

  INSERT INTO stok_keluar (
    project_id, barang_id, jumlah, tujuan,
    nomor_referensi, nomor_bon, catatan_bon, nomor_rekap, catatan
  ) VALUES (
    p_project_id, p_barang_id, p_jumlah, p_tujuan,
    p_nomor_referensi, p_nomor_bon, p_catatan_bon, p_nomor_rekap, p_catatan
  );
END;
$$;
