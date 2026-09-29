-- Jaga-jaga: pastikan role yang dipakai aplikasi (anon & authenticated) punya akses penuh
-- ke tabel retur_barang, sama seperti tabel lain. Aman dijalankan berulang kali.
GRANT ALL ON TABLE retur_barang TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE retur_barang_id_seq TO anon, authenticated, service_role;
