-- Ganti format Kode Karyawan dari angka polos (1, 2, 3, ...) menjadi
-- campuran huruf + angka ("KRY0001", "KRY0002", ...), tapi tetap pakai
-- logika auto-increment yang mengisi kembali nomor kosong bekas karyawan
-- yang dihapus (sama seperti sebelumnya) -- cuma formatnya saja yang berubah.
-- Jalankan di: Supabase Dashboard -> SQL Editor

BEGIN;

-- 1. Kolom sementara, isi dari nilai lama
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS kode_karyawan_baru TEXT;

UPDATE karyawan
SET kode_karyawan_baru = 'KRY' || LPAD(kode_karyawan::TEXT, 4, '0')
WHERE kode_karyawan_baru IS NULL;

-- 2. Buang kolom integer lama, pindahkan kolom baru ke namanya
ALTER TABLE karyawan DROP CONSTRAINT IF EXISTS karyawan_kode_karyawan_key;
ALTER TABLE karyawan DROP COLUMN kode_karyawan;
ALTER TABLE karyawan RENAME COLUMN kode_karyawan_baru TO kode_karyawan;
ALTER TABLE karyawan ALTER COLUMN kode_karyawan SET NOT NULL;
ALTER TABLE karyawan ADD CONSTRAINT karyawan_kode_karyawan_key UNIQUE (kode_karyawan);

-- 3. Fungsi generator: cari nomor terkecil yang belum terpakai (format
--    "KRY0001"), isi celah bekas karyawan yang dihapus sama seperti sebelumnya.
-- DROP dulu karena tipe kembalian berubah dari INTEGER ke TEXT — Postgres
-- menolak CREATE OR REPLACE kalau return type-nya beda (error 42P13).
DROP FUNCTION IF EXISTS next_kode_karyawan();
CREATE OR REPLACE FUNCTION next_kode_karyawan() RETURNS TEXT AS $$
DECLARE
  nomor_terpakai INTEGER;
  hasil INTEGER;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(kode_karyawan, '\D', '', 'g'), '')::INTEGER), 0)
    INTO nomor_terpakai
  FROM karyawan;

  SELECT COALESCE(MIN(t.n), 1) INTO hasil
  FROM generate_series(1, nomor_terpakai + 1) AS t(n)
  WHERE NOT EXISTS (
    SELECT 1 FROM karyawan k WHERE k.kode_karyawan = 'KRY' || LPAD(t.n::TEXT, 4, '0')
  );

  RETURN 'KRY' || LPAD(hasil::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger tetap sama (hanya ikut tipe baru: TEXT)
CREATE OR REPLACE FUNCTION trg_set_kode_karyawan() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kode_karyawan IS NULL THEN
    NEW.kode_karyawan := next_kode_karyawan();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- (trigger "set_kode_karyawan" yang sudah ada otomatis ikut pakai fungsi baru ini,
-- tidak perlu dibuat ulang)

-- 5. RPC login mobile: buang cast ::INTEGER, bandingkan sebagai TEXT
--    (case-insensitive supaya tetap toleran kalau ada yang ketik huruf kecil/besar beda)
CREATE OR REPLACE FUNCTION email_for_kode_karyawan(p_kode TEXT)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kode TEXT;
  v_email TEXT;
BEGIN
  v_kode := NULLIF(btrim(p_kode), '');
  IF v_kode IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.email INTO v_email
    FROM karyawan k
    JOIN users u ON u.karyawan_id = k.id
   WHERE UPPER(k.kode_karyawan) = UPPER(v_kode) AND u.status_aktif IS TRUE
   LIMIT 1;

  RETURN v_email;
END;
$$;
REVOKE ALL ON FUNCTION email_for_kode_karyawan(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION email_for_kode_karyawan(TEXT) TO anon, authenticated;

COMMIT;
