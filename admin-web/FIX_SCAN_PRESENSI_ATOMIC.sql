-- ============================================================================
-- FIX: Catat presensi (scan QR maupun "Absen Cepat" tap manual) gagal dengan
-- "Data sudah ada."
-- ============================================================================
-- AKAR MASALAH SEBENARNYA (ditemukan lewat pengujian langsung, bukan dugaan):
-- semua kode di aplikasi (admin-web & mandor_app) mengasumsikan constraint
-- unik di tabel presensi adalah (project_id, karyawan_id, tanggal). Padahal
-- constraint yang BENAR-BENAR ada di database cuma presensi_karyawan_id_tanggal_key
-- = UNIQUE(karyawan_id, tanggal) -- satu karyawan SATU baris presensi per
-- hari, TIDAK PEDULI project. Setiap kali kode mencoba upsert dengan
-- onConflict 'project_id,karyawan_id,tanggal', Postgres tidak menemukan
-- constraint yang cocok dan gagal dengan error 42P10 ("no unique or
-- exclusion constraint matching the ON CONFLICT specification") -- pesan itu
-- mengandung kata "unique", yang oleh fungsi penerjemah error di aplikasi
-- (_err()) disalahartikan jadi "Data sudah ada.". Ini SELALU gagal, bukan
-- race condition sesekali -- cocok dengan laporan "data sudah ada terus".
--
-- Constraint (karyawan_id, tanggal) ini sebenarnya sudah benar untuk model
-- "karyawan bebas kerja di project mana saja": satu hari = satu catatan
-- kehadiran, project_id cuma atribut biasa yang mencatat DI PROJECT MANA
-- dia bekerja hari itu, bukan bagian dari kunci unik.
--
-- PERBAIKAN: satu fungsi atomic di database yang melakukan cek + tulis dalam
-- SATU transaksi dengan row lock (FOR UPDATE) + INSERT ... ON CONFLICT
-- (karyawan_id, tanggal) DO UPDATE -- sama seperti pola yang sudah dipakai
-- untuk stok barang (approve_permintaan, kurangi_stok_keluar, lihat
-- MIGRATION_INVENTORY_FIX.sql). Dipakai bersama oleh scan QR (p_qr_value
-- diisi) dan Absen Cepat (p_qr_value NULL, p_metode_input = 'manual').
-- Lihat juga FIX_PRESENSI_UNIQUE_CONSTRAINT.sql untuk perbaikan yang sama di
-- upsertPresensi() (admin-web & mandor_app) yang sebelumnya punya bug
-- onConflict yang sama persis.
--
-- Jalankan di: Supabase Dashboard -> SQL Editor (1x, aman diulang)
-- ============================================================================

DROP FUNCTION IF EXISTS scan_presensi_qr(BIGINT, BIGINT, DATE, TIME, VARCHAR);

CREATE OR REPLACE FUNCTION scan_presensi_qr(
  p_project_id BIGINT,
  p_karyawan_id BIGINT,
  p_tanggal DATE,
  p_jam TIME,
  p_metode_input VARCHAR,
  p_qr_value VARCHAR DEFAULT NULL
)
RETURNS TABLE(hasil VARCHAR, jam_masuk TIME, jam_keluar TIME, durasi_jam DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing presensi%ROWTYPE;
  v_uang_makan DECIMAL(10,2);
  v_uang_transport DECIMAL(10,2);
  v_durasi DECIMAL(5,2);
BEGIN
  -- Kunci baris presensi ini (kalau sudah ada) sampai transaksi ini selesai --
  -- scan/tap lain untuk karyawan+tanggal yang sama akan antre, bukan saling
  -- menyerobot. Constraint unik yang SEBENARNYA di tabel presensi cuma
  -- (karyawan_id, tanggal) -- satu karyawan satu baris presensi per hari,
  -- TIDAK PEDULI PROJECT (sengaja begitu -- karyawan bebas kerja di project
  -- mana saja, lihat FIX_PRESENSI_UNIQUE_CONSTRAINT.sql). project_id di sini
  -- cuma atribut biasa (mencatat project mana yang dikerjakan hari itu),
  -- bukan bagian dari kunci unik.
  SELECT * INTO v_existing FROM presensi
   WHERE karyawan_id = p_karyawan_id AND tanggal = p_tanggal
   FOR UPDATE;

  IF NOT FOUND OR v_existing.jam_masuk IS NULL THEN
    -- PERTAMA = JAM MASUK
    SELECT COALESCE(j.uang_makan, 0), COALESCE(j.uang_transport, 0)
      INTO v_uang_makan, v_uang_transport
      FROM karyawan k JOIN jabatan j ON j.id = k.jabatan_id
     WHERE k.id = p_karyawan_id;

    INSERT INTO presensi (
      project_id, karyawan_id, tanggal, status_kehadiran, jam_masuk,
      metode_input, qr_code_scanned_masuk, uang_makan, uang_transport
    ) VALUES (
      p_project_id, p_karyawan_id, p_tanggal, 'belum_lengkap', p_jam,
      p_metode_input, p_qr_value, v_uang_makan, v_uang_transport
    )
    ON CONFLICT (karyawan_id, tanggal) DO UPDATE
      SET project_id             = EXCLUDED.project_id,
          jam_masuk              = EXCLUDED.jam_masuk,
          status_kehadiran       = 'belum_lengkap',
          metode_input           = EXCLUDED.metode_input,
          qr_code_scanned_masuk  = EXCLUDED.qr_code_scanned_masuk,
          uang_makan             = EXCLUDED.uang_makan,
          uang_transport         = EXCLUDED.uang_transport,
          updated_at             = NOW()
      WHERE presensi.jam_masuk IS NULL;
    -- Kalau ON CONFLICT ini ternyata kena baris yang jam_masuk-nya SUDAH
    -- terisi (diselesaikan proses lain tepat di detik yang sama), WHERE di
    -- atas membuat UPDATE tidak melakukan apa-apa -- baris di bawah akan
    -- mengembalikan status terkini yang sebenarnya, bukan menimpa data valid.

    RETURN QUERY SELECT 'masuk'::VARCHAR, p_jam, NULL::TIME, NULL::DECIMAL;
    RETURN;

  ELSIF v_existing.jam_keluar IS NULL THEN
    -- SCAN KEDUA = JAM KELUAR
    v_durasi := ROUND((
      EXTRACT(EPOCH FROM (
        CASE WHEN p_jam >= v_existing.jam_masuk
             THEN p_jam - v_existing.jam_masuk
             ELSE (p_jam + INTERVAL '24 hours') - v_existing.jam_masuk
        END
      )) / 3600
    )::numeric, 2);

    UPDATE presensi
    SET jam_keluar              = p_jam,
        status_kehadiran        = 'hadir',
        durasi_jam              = v_durasi,
        qr_code_scanned_keluar  = p_qr_value,
        updated_at              = NOW()
    WHERE id = v_existing.id;

    RETURN QUERY SELECT 'keluar'::VARCHAR, v_existing.jam_masuk, p_jam, v_durasi;
    RETURN;

  ELSE
    -- SUDAH LENGKAP -- tidak mengubah apa pun, cuma melaporkan status
    RETURN QUERY SELECT 'lengkap'::VARCHAR, v_existing.jam_masuk, v_existing.jam_keluar, v_existing.durasi_jam;
    RETURN;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION scan_presensi_qr(BIGINT, BIGINT, DATE, TIME, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION scan_presensi_qr(BIGINT, BIGINT, DATE, TIME, VARCHAR, VARCHAR) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
