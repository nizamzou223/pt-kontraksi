-- ============================================================
-- MIGRASI: Sistem Cerdas (Peramalan Material & Deteksi Anomali Kepegawaian)
-- Jalankan di: Supabase Dashboard → SQL Editor  (aman diulang)
--
-- SIFAT: HANYA MENAMBAH. Empat tabel baru berawalan ml_*; tidak ada tabel/kolom/fungsi lama
--        yang diubah, sehingga alur aplikasi yang sudah berjalan tidak terpengaruh.
--
-- PRASYARAT: SECURITY_HARDENING.sql sudah dijalankan (fungsi is_admin_or_hr() dipakai di RLS).
--
-- Keamanan: data ml_anomali menyangkut individu karyawan → RLS hanya admin & HRD;
--           role anon (tanpa login) tidak punya akses sama sekali.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'is_admin_or_hr') THEN
    RAISE EXCEPTION 'Fungsi is_admin_or_hr() belum ada. Jalankan SECURITY_HARDENING.sql lebih dulu.';
  END IF;
END $$;

-- 1. Registri model: versi, hiperparameter, dan metrik tiap eksekusi analisis
CREATE TABLE IF NOT EXISTS ml_model_registry (
  id BIGSERIAL PRIMARY KEY,
  jenis VARCHAR(20) NOT NULL CHECK (jenis IN ('forecast', 'anomali')),
  nama_model VARCHAR(100) NOT NULL,
  versi VARCHAR(30) NOT NULL,                 -- mis. tanggal eksekusi 2026-09-25
  hyperparameter JSONB,
  metrik JSONB,                               -- MAE, RMSE, MASE, WAPE, PICP, dst.
  data_dari DATE,
  data_sampai DATE,
  aktif BOOLEAN DEFAULT FALSE,
  dilatih_pada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (jenis, nama_model, versi)
);

-- 2. Hasil ramalan — disimpan agar dapat dibandingkan dengan realisasi (pemantauan akurasi)
CREATE TABLE IF NOT EXISTS ml_forecast (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT NOT NULL REFERENCES ml_model_registry(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  barang_id BIGINT NOT NULL REFERENCES barang(id) ON DELETE CASCADE,
  dibuat_pada DATE NOT NULL,
  minggu_target DATE NOT NULL,                -- Senin minggu yang diramal
  horizon INT NOT NULL,
  yhat NUMERIC(12, 2) NOT NULL,
  yhat_bawah NUMERIC(12, 2),                  -- kuantil 10%
  yhat_atas NUMERIC(12, 2),                   -- kuantil 90%
  UNIQUE (model_id, barang_id, dibuat_pada, minggu_target)
);
CREATE INDEX IF NOT EXISTS idx_ml_forecast_project ON ml_forecast (project_id, dibuat_pada);

-- 3. Rekomendasi pengadaan (stok pengaman, titik pemesanan ulang, jumlah pesanan)
CREATE TABLE IF NOT EXISTS ml_rekomendasi_pengadaan (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT REFERENCES ml_model_registry(id) ON DELETE SET NULL,
  project_id BIGINT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  barang_id BIGINT NOT NULL REFERENCES barang(id) ON DELETE CASCADE,
  dibuat_pada DATE NOT NULL,
  titik_pemesanan_ulang NUMERIC(12, 2) NOT NULL,
  stok_pengaman NUMERIC(12, 2) NOT NULL,
  jumlah_disarankan NUMERIC(12, 2) NOT NULL,
  perkiraan_habis DATE,
  risiko VARCHAR(20) CHECK (risiko IN ('habis', 'kritis', 'waspada', 'aman')),
  alasan JSONB,
  UNIQUE (barang_id, dibuat_pada)
);
CREATE INDEX IF NOT EXISTS idx_ml_rekomendasi_project ON ml_rekomendasi_pengadaan (project_id, dibuat_pada);

-- 4. Penanda anomali + status tinjauan admin (sekaligus sumber label nyata untuk evaluasi)
CREATE TABLE IF NOT EXISTS ml_anomali (
  id BIGSERIAL PRIMARY KEY,
  sumber_tabel VARCHAR(50) NOT NULL,          -- presensi | lembur | kasbon | rekap_gaji_mingguan
  sumber_id BIGINT NOT NULL,
  karyawan_id BIGINT REFERENCES karyawan(id) ON DELETE SET NULL,
  project_id BIGINT REFERENCES project(id) ON DELETE SET NULL,
  tanggal DATE NOT NULL,
  skor NUMERIC(6, 4) NOT NULL,
  tingkat VARCHAR(10) CHECK (tingkat IN ('tinggi', 'sedang', 'rendah')),
  alasan JSONB,                               -- daftar alasan yang dapat dibaca
  metode JSONB,                               -- ['aturan bisnis','statistik','isolation forest']
  status_tinjauan VARCHAR(20) NOT NULL DEFAULT 'baru'
    CHECK (status_tinjauan IN ('baru', 'valid', 'bukan_anomali', 'diabaikan')),
  ditinjau_oleh BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ditinjau_pada TIMESTAMP,
  catatan TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sumber_tabel, sumber_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_anomali_status ON ml_anomali (status_tinjauan, skor DESC);

-- ── Keamanan: RLS admin/HRD saja ─────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ml_model_registry', 'ml_forecast', 'ml_rekomendasi_pengadaan', 'ml_anomali'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_hr', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_admin_or_hr()) WITH CHECK (is_admin_or_hr())', t || '_admin_hr', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;

-- ── VERIFIKASI: keempat tabel harus rls_aktif = true dan jumlah_policy = 1 ──
SELECT c.relname AS tabel, c.relrowsecurity AS rls_aktif,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS jumlah_policy
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname LIKE 'ml\_%' ESCAPE '\' AND c.relkind = 'r'
 ORDER BY c.relname;
