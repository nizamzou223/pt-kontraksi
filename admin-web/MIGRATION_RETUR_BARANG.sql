-- Tambah tabel retur_barang (barang sisa / pengembalian dari project ke gudang)
CREATE TABLE IF NOT EXISTS retur_barang (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  barang_id BIGINT NOT NULL REFERENCES barang(id) ON DELETE RESTRICT,
  jumlah_retur INT NOT NULL,
  pengembali_id BIGINT REFERENCES karyawan(id) ON DELETE SET NULL,
  nomor_surat VARCHAR(100),
  status_retur VARCHAR(50) DEFAULT 'pending',
  tanggal_retur DATE NOT NULL,
  tanggal_persetujuan DATE,
  disetujui_oleh BIGINT REFERENCES karyawan(id) ON DELETE SET NULL,
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_retur_barang_project ON retur_barang(project_id);
CREATE INDEX IF NOT EXISTS idx_retur_barang_status  ON retur_barang(status_retur);

ALTER TABLE retur_barang DISABLE ROW LEVEL SECURITY;

-- RPC: tambah stok masuk dari retur barang (kebalikan dari kurangi_stok_keluar)
CREATE OR REPLACE FUNCTION tambah_stok_masuk_retur(
  p_project_id BIGINT,
  p_barang_id BIGINT,
  p_jumlah INT,
  p_sumber VARCHAR,
  p_nomor_referensi VARCHAR,
  p_catatan TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_harga DECIMAL(12,2);
BEGIN
  SELECT COALESCE(harga_beli, 0) INTO v_harga FROM barang WHERE id = p_barang_id FOR UPDATE;

  UPDATE barang
  SET stok_saat_ini = stok_saat_ini + p_jumlah,
      updated_at = NOW()
  WHERE id = p_barang_id;

  INSERT INTO stok_masuk (
    project_id, barang_id, jumlah, harga_satuan, total_harga,
    sumber, nomor_referensi, catatan
  ) VALUES (
    p_project_id, p_barang_id, p_jumlah, v_harga, v_harga * p_jumlah,
    p_sumber, p_nomor_referensi, p_catatan
  );
END;
$$;
