-- Tambah kolom bon_subkon ke tabel stok_masuk
ALTER TABLE stok_masuk ADD COLUMN IF NOT EXISTS bon_subkon VARCHAR(100);

-- Jika menggunakan RPC tambah_stok_masuk, perlu update fungsinya juga.
-- Jalankan script berikut di Supabase SQL Editor untuk update RPC:

CREATE OR REPLACE FUNCTION tambah_stok_masuk(
  p_project_id BIGINT,
  p_barang_id BIGINT,
  p_jumlah INT,
  p_harga_satuan DECIMAL,
  p_sumber VARCHAR DEFAULT NULL,
  p_nomor_referensi VARCHAR DEFAULT NULL,
  p_bon_subkon VARCHAR DEFAULT NULL,
  p_catatan TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update stok barang secara atomic
  UPDATE barang
  SET stok_saat_ini = stok_saat_ini + p_jumlah,
      updated_at = NOW()
  WHERE id = p_barang_id;

  -- Insert log stok masuk
  INSERT INTO stok_masuk (
    project_id, barang_id, jumlah, harga_satuan, total_harga,
    sumber, nomor_referensi, bon_subkon, catatan
  ) VALUES (
    p_project_id, p_barang_id, p_jumlah, p_harga_satuan,
    p_jumlah * p_harga_satuan,
    p_sumber, p_nomor_referensi, p_bon_subkon, p_catatan
  );
END;
$$;
