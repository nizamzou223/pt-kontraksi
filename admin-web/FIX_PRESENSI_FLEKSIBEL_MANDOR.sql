-- ============================================================================
-- FIX: presensi di mandor_app tidak sinkron dengan admin-web
-- ============================================================================
-- Policy lama (SECURITY_HARDENING.sql) hanya mengizinkan mandor membaca
-- presensi project yang ditugaskan kepadanya. Padahal karyawan bebas bekerja
-- di project mana pun (constraint unik presensi = karyawan + tanggal, tanpa
-- project) dan admin-web menampilkan semua project. Akibatnya mobile hanya
-- melihat segelintir presensi (mis. 5 dari 134 karyawan) sementara website
-- melihat semuanya.
--
-- PERBAIKAN: mandor (dan admin/hr) boleh membaca & menulis presensi SEMUA
-- project, sama seperti admin-web. mandor_gudang tetap DITOLAK.
-- Lembur, kasbon, dan tabel gaji TIDAK berubah (tetap dibatasi seperti semula).
--
-- Jalankan di: Supabase Dashboard -> SQL Editor (1x, aman diulang)
-- ============================================================================

DROP POLICY IF EXISTS presensi_project_scope ON public.presensi;
DROP POLICY IF EXISTS presensi_field_all     ON public.presensi;

CREATE POLICY presensi_field_all ON public.presensi FOR ALL TO authenticated
  USING (is_field_writer()) WITH CHECK (is_field_writer());

-- Verifikasi: harus tampil 1 policy, presensi_field_all
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'presensi';
