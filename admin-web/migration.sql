-- ============================================================
-- PT KALI PELUS - DATABASE MIGRATION (FIXED)
-- Jalankan di: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. DEPARTEMEN
CREATE TABLE IF NOT EXISTS departemen (
  id BIGSERIAL PRIMARY KEY,
  nama_departemen VARCHAR(100) NOT NULL UNIQUE,
  deskripsi TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. USERS (dibuat dulu karena jabatan references users)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(100) UNIQUE NOT NULL,
  nama_lengkap VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL DEFAULT 'managed_by_supabase_auth',
  karyawan_id BIGINT,
  role VARCHAR(50) NOT NULL DEFAULT 'staff',
  project_id BIGINT,
  status_aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. JABATAN
CREATE TABLE IF NOT EXISTS jabatan (
  id BIGSERIAL PRIMARY KEY,
  nama_jabatan VARCHAR(100) NOT NULL UNIQUE,
  gaji_harian DECIMAL(12, 2) NOT NULL,
  uang_makan DECIMAL(10, 2) NOT NULL DEFAULT 0,
  uang_transport DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tunjangan_lainnya DECIMAL(10, 2) DEFAULT 0,
  deskripsi TEXT,
  is_deletable BOOLEAN DEFAULT TRUE,
  karyawan_count INT DEFAULT 0,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. KARYAWAN
CREATE TABLE IF NOT EXISTS karyawan (
  id BIGSERIAL PRIMARY KEY,
  nama_karyawan VARCHAR(150) NOT NULL,
  nik VARCHAR(16) UNIQUE NOT NULL CHECK (nik ~ '^[0-9]{16}$'),
  email VARCHAR(100) UNIQUE,
  no_hp VARCHAR(15),
  departemen_id BIGINT REFERENCES departemen(id) ON DELETE SET NULL,
  jabatan_id BIGINT NOT NULL REFERENCES jabatan(id) ON DELETE RESTRICT,
  gaji_harian_override DECIMAL(12, 2),
  uang_makan_override DECIMAL(10, 2),
  uang_transport_override DECIMAL(10, 2),
  no_rekening VARCHAR(30),
  nama_bank VARCHAR(50),
  status_aktif BOOLEAN DEFAULT TRUE,
  tanggal_bergabung DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. KARYAWAN QR CODE
CREATE TABLE IF NOT EXISTS karyawan_qr_code (
  id BIGSERIAL PRIMARY KEY,
  karyawan_id BIGINT NOT NULL UNIQUE REFERENCES karyawan(id) ON DELETE CASCADE,
  qr_code_value VARCHAR(500) NOT NULL UNIQUE,
  qr_code_image BYTEA,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_scanned_at TIMESTAMP,
  scan_count INT DEFAULT 0,
  status_aktif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. PROJECT
CREATE TABLE IF NOT EXISTS project (
  id BIGSERIAL PRIMARY KEY,
  kode_project VARCHAR(50) UNIQUE NOT NULL,
  nama_project VARCHAR(150) NOT NULL,
  deskripsi TEXT,
  lokasi VARCHAR(150),
  project_manager_id BIGINT REFERENCES karyawan(id) ON DELETE SET NULL,
  budget_total DECIMAL(15, 2),
  tanggal_mulai DATE NOT NULL,
  tanggal_selesai DATE,
  status_project VARCHAR(50) DEFAULT 'aktif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. PROJECT KARYAWAN
CREATE TABLE IF NOT EXISTS project_karyawan (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  karyawan_id BIGINT NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  tanggal_mulai DATE NOT NULL,
  tanggal_selesai DATE,
  status_assignment VARCHAR(50) DEFAULT 'aktif',
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, karyawan_id)
);

-- 8. PRESENSI
CREATE TABLE IF NOT EXISTS presensi (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  karyawan_id BIGINT NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  tanggal DATE NOT NULL,
  jam_masuk TIME,
  jam_keluar TIME,
  durasi_jam DECIMAL(5, 2),
  status_kehadiran VARCHAR(50) NOT NULL DEFAULT 'hadir',
  uang_makan DECIMAL(10, 2),
  uang_transport DECIMAL(10, 2),
  qr_code_scanned_masuk VARCHAR(500),
  qr_code_scanned_keluar VARCHAR(500),
  metode_input VARCHAR(50) DEFAULT 'manual',
  device_id VARCHAR(100),
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, karyawan_id, tanggal)
);

-- 9. LEMBUR
CREATE TABLE IF NOT EXISTS lembur (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  karyawan_id BIGINT NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  tanggal DATE NOT NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  durasi_jam DECIMAL(5, 2) NOT NULL,
  tarif_lembur DECIMAL(12, 2) NOT NULL,
  total_lembur DECIMAL(12, 2) NOT NULL,
  status_persetujuan VARCHAR(50) DEFAULT 'pending',
  disetujui_oleh BIGINT REFERENCES users(id) ON DELETE SET NULL,
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. KASBON
CREATE TABLE IF NOT EXISTS kasbon (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  karyawan_id BIGINT NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  jumlah_kasbon DECIMAL(12, 2) NOT NULL,
  sisa_kasbon DECIMAL(12, 2) NOT NULL,
  metode_pembayaran VARCHAR(50) NOT NULL DEFAULT 'potong_gaji',
  tanggal_kasbon DATE NOT NULL,
  catatan TEXT,
  status_lunas BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. KATEGORI BARANG
CREATE TABLE IF NOT EXISTS kategori_barang (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  nama_kategori VARCHAR(100) NOT NULL,
  deskripsi TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, nama_kategori)
);

-- 12. SATUAN BARANG
CREATE TABLE IF NOT EXISTS satuan_barang (
  id BIGSERIAL PRIMARY KEY,
  nama_satuan VARCHAR(50) NOT NULL UNIQUE,
  singkatan VARCHAR(10) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. BARANG
CREATE TABLE IF NOT EXISTS barang (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kode_barang VARCHAR(50) NOT NULL,
  nama_barang VARCHAR(150) NOT NULL,
  kategori_id BIGINT NOT NULL REFERENCES kategori_barang(id) ON DELETE RESTRICT,
  satuan_id BIGINT NOT NULL REFERENCES satuan_barang(id) ON DELETE RESTRICT,
  harga_beli DECIMAL(12, 2) NOT NULL,
  harga_jual DECIMAL(12, 2),
  stok_saat_ini INT DEFAULT 0,
  stok_minimal INT DEFAULT 10,
  deskripsi TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, kode_barang)
);

-- 14. STOK MASUK
CREATE TABLE IF NOT EXISTS stok_masuk (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  barang_id BIGINT NOT NULL REFERENCES barang(id) ON DELETE RESTRICT,
  jumlah INT NOT NULL,
  harga_satuan DECIMAL(12, 2) NOT NULL,
  total_harga DECIMAL(12, 2) NOT NULL,
  sumber VARCHAR(100),
  nomor_referensi VARCHAR(50),
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. STOK KELUAR
CREATE TABLE IF NOT EXISTS stok_keluar (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  barang_id BIGINT NOT NULL REFERENCES barang(id) ON DELETE RESTRICT,
  jumlah INT NOT NULL,
  tujuan VARCHAR(100) NOT NULL,
  nomor_referensi VARCHAR(50),
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. PERMINTAAN BARANG
CREATE TABLE IF NOT EXISTS permintaan_barang (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  barang_id BIGINT NOT NULL REFERENCES barang(id) ON DELETE RESTRICT,
  jumlah_diminta INT NOT NULL,
  peminta_id BIGINT REFERENCES karyawan(id) ON DELETE SET NULL,
  status_permintaan VARCHAR(50) DEFAULT 'pending',
  tanggal_permintaan DATE NOT NULL,
  tanggal_persetujuan DATE,
  disetujui_oleh BIGINT REFERENCES karyawan(id) ON DELETE SET NULL,
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16b. RETUR BARANG (Retur / Sisa Barang dari project ke gudang)
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

-- 17. REKAP GAJI MINGGUAN
CREATE TABLE IF NOT EXISTS rekap_gaji_mingguan (
  id BIGSERIAL PRIMARY KEY,
  karyawan_id BIGINT NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  periode_mulai DATE NOT NULL,
  periode_selesai DATE NOT NULL,
  project_details JSONB,
  total_hari_hadir INT NOT NULL DEFAULT 0,
  total_gaji_pokok DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_uang_makan DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_uang_transport DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_uang_lembur DECIMAL(12, 2) NOT NULL DEFAULT 0,
  gaji_kotor DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_potongan_kasbon DECIMAL(12, 2) NOT NULL DEFAULT 0,
  potongan_lainnya DECIMAL(12, 2) DEFAULT 0,
  gaji_bersih DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'draft',
  tanggal_pembayaran DATE,
  metode_pembayaran VARCHAR(50),
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(karyawan_id, periode_mulai, periode_selesai)
);

-- 18. REKAP GAJI BULANAN
CREATE TABLE IF NOT EXISTS rekap_gaji_bulanan (
  id BIGSERIAL PRIMARY KEY,
  karyawan_id BIGINT NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  bulan INT NOT NULL,
  tahun INT NOT NULL,
  total_gaji_bersih DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_hari_hadir INT NOT NULL DEFAULT 0,
  total_lembur_jam DECIMAL(10, 2) DEFAULT 0,
  total_kasbon_potong DECIMAL(12, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'final',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(karyawan_id, bulan, tahun)
);

-- 19. PEMBAYARAN OTOMATIS
CREATE TABLE IF NOT EXISTS pembayaran_otomatis (
  id BIGSERIAL PRIMARY KEY,
  karyawan_id BIGINT NOT NULL REFERENCES karyawan(id) ON DELETE CASCADE,
  tipe_pembayaran VARCHAR(50) NOT NULL,
  referensi_id BIGINT NOT NULL,
  jumlah_pembayaran DECIMAL(12, 2) NOT NULL,
  status_pembayaran VARCHAR(50) DEFAULT 'pending',
  jumlah_terbayar DECIMAL(12, 2) DEFAULT 0,
  sisa_pembayaran DECIMAL(12, 2) NOT NULL,
  periode_gaji_id BIGINT REFERENCES rekap_gaji_mingguan(id) ON DELETE SET NULL,
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 20. AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  project_id BIGINT REFERENCES project(id) ON DELETE SET NULL,
  aksi VARCHAR(100) NOT NULL,
  tabel_target VARCHAR(100),
  id_target BIGINT,
  data_sebelum JSONB,
  data_sesudah JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- FK CONSTRAINTS pakai DO $$ block untuk menghindari error
-- duplikat (pengganti IF NOT EXISTS yang tidak valid)
-- ============================================================
DO $$
BEGIN
  -- FK users.karyawan_id → karyawan
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_users_karyawan' AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_karyawan
      FOREIGN KEY (karyawan_id) REFERENCES karyawan(id) ON DELETE SET NULL;
  END IF;

  -- FK users.project_id → project
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_users_project' AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_project
      FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_karyawan_jabatan      ON karyawan(jabatan_id);
CREATE INDEX IF NOT EXISTS idx_proj_kary_project     ON project_karyawan(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_kary_karyawan    ON project_karyawan(karyawan_id);
CREATE INDEX IF NOT EXISTS idx_qr_code_value         ON karyawan_qr_code(qr_code_value);
CREATE INDEX IF NOT EXISTS idx_presensi_project      ON presensi(project_id);
CREATE INDEX IF NOT EXISTS idx_presensi_karyawan     ON presensi(karyawan_id);
CREATE INDEX IF NOT EXISTS idx_presensi_tanggal      ON presensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_barang_stok           ON barang(stok_saat_ini);
CREATE INDEX IF NOT EXISTS idx_audit_log_user        ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created     ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_pembayaran_status     ON pembayaran_otomatis(status_pembayaran);
CREATE INDEX IF NOT EXISTS idx_gaji_mingguan_status  ON rekap_gaji_mingguan(status);

-- ============================================================
-- SEED DATA: Satuan Barang
-- ============================================================
INSERT INTO satuan_barang (nama_satuan, singkatan) VALUES
  ('Kilogram',     'kg'),
  ('Meter',        'm'),
  ('Meter Persegi','m2'),
  ('Meter Kubik',  'm3'),
  ('Liter',        'L'),
  ('Buah',         'bh'),
  ('Batang',       'btg'),
  ('Lembar',       'lbr'),
  ('Sak',          'sak'),
  ('Dus',          'dus'),
  ('Set',          'set'),
  ('Unit',         'unit')
ON CONFLICT (nama_satuan) DO NOTHING;

-- ============================================================
-- SEED DATA: Jabatan default
-- ============================================================
INSERT INTO jabatan (nama_jabatan, gaji_harian, uang_makan, uang_transport) VALUES
  ('Mandor',       250000, 35000, 25000),
  ('Tukang Batu',  180000, 25000, 20000),
  ('Tukang Kayu',  180000, 25000, 20000),
  ('Helper',       130000, 20000, 15000),
  ('Supervisor',   300000, 40000, 30000),
  ('Staf Admin',   200000, 30000, 25000)
ON CONFLICT (nama_jabatan) DO NOTHING;

-- ============================================================
-- TRIGGER: Proteksi admin terakhir
-- ============================================================
CREATE OR REPLACE FUNCTION check_admin_count()
RETURNS TRIGGER AS $func$
DECLARE
  v_admin_count INT;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
      FROM users
     WHERE role = 'admin'
       AND id != OLD.id
       AND status_aktif = TRUE;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Tidak bisa menghapus admin terakhir!';
    END IF;
  END IF;
  RETURN OLD;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_last_admin ON users;
CREATE TRIGGER protect_last_admin
  BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION check_admin_count();

-- ============================================================
-- RLS: Disable untuk development
-- ============================================================
ALTER TABLE departemen        DISABLE ROW LEVEL SECURITY;
ALTER TABLE jabatan            DISABLE ROW LEVEL SECURITY;
ALTER TABLE karyawan           DISABLE ROW LEVEL SECURITY;
ALTER TABLE karyawan_qr_code   DISABLE ROW LEVEL SECURITY;
ALTER TABLE project            DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_karyawan   DISABLE ROW LEVEL SECURITY;
ALTER TABLE presensi           DISABLE ROW LEVEL SECURITY;
ALTER TABLE lembur             DISABLE ROW LEVEL SECURITY;
ALTER TABLE kasbon             DISABLE ROW LEVEL SECURITY;
ALTER TABLE kategori_barang    DISABLE ROW LEVEL SECURITY;
ALTER TABLE satuan_barang      DISABLE ROW LEVEL SECURITY;
ALTER TABLE barang             DISABLE ROW LEVEL SECURITY;
ALTER TABLE stok_masuk         DISABLE ROW LEVEL SECURITY;
ALTER TABLE stok_keluar        DISABLE ROW LEVEL SECURITY;
ALTER TABLE permintaan_barang  DISABLE ROW LEVEL SECURITY;
ALTER TABLE retur_barang       DISABLE ROW LEVEL SECURITY;
ALTER TABLE rekap_gaji_mingguan DISABLE ROW LEVEL SECURITY;
ALTER TABLE rekap_gaji_bulanan  DISABLE ROW LEVEL SECURITY;
ALTER TABLE pembayaran_otomatis DISABLE ROW LEVEL SECURITY;
ALTER TABLE users              DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- SETUP ADMIN USER
-- Ganti email/nama sesuai kebutuhan
-- ============================================================
INSERT INTO users (email, nama_lengkap, password_hash, role, status_aktif)
VALUES (
  'admin@kalipelus.com',
  'Admin Utama',
  'managed_by_supabase_auth',
  'admin',
  TRUE
)
ON CONFLICT (email) DO UPDATE
  SET role        = 'admin',
      status_aktif = TRUE,
      updated_at   = NOW();

SELECT 'Migration selesai! Tabel dibuat: ' || COUNT(*)::text || ' tabel'
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
  