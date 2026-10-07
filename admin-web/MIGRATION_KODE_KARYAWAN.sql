-- Ganti identitas karyawan dari NIK (16 digit, data pribadi/KTP) menjadi
-- "Kode Karyawan": angka urut otomatis yang mengisi kembali nomor yang
-- kosong ketika sebuah karyawan dihapus (bukan sekadar naik terus seperti
-- SERIAL biasa).
-- Jalankan di: Supabase Dashboard -> SQL Editor

-- 1. Tambah kolom kode_karyawan, isi nomor urut untuk data yang sudah ada
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS kode_karyawan INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
  FROM karyawan
  WHERE kode_karyawan IS NULL
)
UPDATE karyawan k
SET kode_karyawan = numbered.rn
FROM numbered
WHERE k.id = numbered.id;

ALTER TABLE karyawan ALTER COLUMN kode_karyawan SET NOT NULL;
ALTER TABLE karyawan DROP CONSTRAINT IF EXISTS karyawan_kode_karyawan_key;
ALTER TABLE karyawan ADD CONSTRAINT karyawan_kode_karyawan_key UNIQUE (kode_karyawan);

-- 2. Fungsi: cari nomor terkecil yang belum terpakai (mengisi celah bekas
--    karyawan yang dihapus), lalu trigger yang otomatis memanggilnya saat
--    ada karyawan baru dibuat.
CREATE OR REPLACE FUNCTION next_kode_karyawan() RETURNS INTEGER AS $$
DECLARE
  hasil INTEGER;
BEGIN
  SELECT COALESCE(MIN(t.n), 1) INTO hasil
  FROM generate_series(1, (SELECT COALESCE(MAX(kode_karyawan), 0) FROM karyawan) + 1) AS t(n)
  WHERE NOT EXISTS (SELECT 1 FROM karyawan k WHERE k.kode_karyawan = t.n);
  RETURN hasil;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_set_kode_karyawan() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kode_karyawan IS NULL THEN
    NEW.kode_karyawan := next_kode_karyawan();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_kode_karyawan ON karyawan;
CREATE TRIGGER set_kode_karyawan
  BEFORE INSERT ON karyawan
  FOR EACH ROW
  EXECUTE FUNCTION trg_set_kode_karyawan();

-- 3. Hapus NIK sepenuhnya (data pribadi, sudah tidak dipakai sebagai identitas)
ALTER TABLE karyawan DROP CONSTRAINT IF EXISTS karyawan_nik_16_digit;
ALTER TABLE karyawan DROP CONSTRAINT IF EXISTS karyawan_nik_check;
ALTER TABLE karyawan DROP COLUMN IF EXISTS nik;

-- 4. Ganti RPC login mobile dari "login via NIK" (email_for_nik) menjadi
--    "login via Kode Karyawan". Dipakai mandor_app sebelum login (anon role),
--    jadi tetap SECURITY DEFINER + akses sempit seperti sebelumnya.
DROP FUNCTION IF EXISTS email_for_nik(TEXT);

CREATE OR REPLACE FUNCTION email_for_kode_karyawan(p_kode TEXT)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kode INTEGER;
  v_email TEXT;
BEGIN
  v_kode := NULLIF(btrim(p_kode), '')::INTEGER;
  IF v_kode IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email INTO v_email
    FROM karyawan k
    JOIN users u ON u.karyawan_id = k.id
   WHERE k.kode_karyawan = v_kode AND u.status_aktif IS TRUE
   LIMIT 1;

  RETURN v_email;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION email_for_kode_karyawan(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_for_kode_karyawan(TEXT) TO anon, authenticated;
