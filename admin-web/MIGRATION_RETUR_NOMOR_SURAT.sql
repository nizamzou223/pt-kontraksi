-- Tambah kolom nomor_surat pada retur_barang (untuk database yang sudah ada tabel retur_barang)
ALTER TABLE retur_barang ADD COLUMN IF NOT EXISTS nomor_surat VARCHAR(100);
