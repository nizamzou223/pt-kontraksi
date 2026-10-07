import 'package:flutter/foundation.dart' show debugPrint;
import 'package:supabase_flutter/supabase_flutter.dart';

class PayrollService {
  final _client = Supabase.instance.client;

  String _err(dynamic e) {
    final msg = e?.message?.toString() ?? e.toString();
    if (msg.contains('foreign key') || msg.contains('violates')) return 'Data masih digunakan.';
    if (msg.contains('duplicate') || msg.contains('unique')) return 'Data sudah ada.';
    return msg.isNotEmpty ? msg : 'Terjadi kesalahan.';
  }

  num _asNum(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v;
    return num.tryParse(v.toString()) ?? 0;
  }

  // ── DURASI JAM DARI JAM MASUK/KELUAR ────────────────────────
  // Sesuai admin-web calculations.ts hitungDurasiLembur/hitungDurasiKerja
  static double hitungDurasiJam(String mulai, String selesai) {
    try {
      final m = mulai.split(':');
      final s = selesai.split(':');
      final mMulai   = int.parse(m[0]) * 60 + int.parse(m[1]);
      final mSelesai = int.parse(s[0]) * 60 + int.parse(s[1]);
      final diff = mSelesai > mMulai ? mSelesai - mMulai : (1440 - mMulai) + mSelesai;
      return (diff / 60 * 100).roundToDouble() / 100;
    } catch (_) { return 0; }
  }

  // ── AUTO-SYNC LEMBUR DARI PRESENSI ──────────────────────────
  // Sesuai admin-web payrollService.js upsertPresensi (baris 75-124):
  // presensi dengan durasi_jam > 8 otomatis membuat/memperbarui 1 baris `lembur`
  // ber-tarif sama (gaji_harian/8), supaya alur mobile == alur web.
  Future<void> _syncAutoLembur(Map<String, dynamic> data, Map<String, dynamic> payload) async {
    try {
      final durasi = _asNum(data['durasi_jam'] ?? payload['durasi_jam']).toDouble();
      final karyawanId = data['karyawan_id'] ?? payload['karyawan_id'];
      final tanggal = data['tanggal'] ?? payload['tanggal'];
      if (karyawanId == null || tanggal == null) return;

      // Hapus semua auto-lembur lama dulu agar tidak pernah duplikat
      await _client.from('lembur').delete()
          .eq('karyawan_id', karyawanId).eq('tanggal', tanggal).like('catatan', 'Otomatis%');

      if (data['status_kehadiran'] != 'hadir' || durasi <= 8) return;

      // Query terpisah (bukan lewat select() upsert/update) supaya penyimpanan
      // presensi tidak pernah bergantung pada resolusi embed di sini.
      final kar = await _client
          .from('karyawan')
          .select('gaji_harian_override, jabatan:jabatan_id(gaji_harian)')
          .eq('id', karyawanId)
          .maybeSingle();
      final jab = kar?['jabatan'] as Map<String, dynamic>?;
      final gh = _asNum(kar?['gaji_harian_override'] ?? jab?['gaji_harian']).toDouble();
      final tarifLembur = gh > 0 ? (gh / 8).roundToDouble() : 0.0;
      final projectId = data['project_id'] ?? payload['project_id'];
      final sisaJam = durasi % 8;

      if (sisaJam > 0.1) {
        final hariPenuh = (durasi / 8).floor();
        final jamMulaiH = 7 + hariPenuh * 8;
        final jamSelesaiH = jamMulaiH + sisaJam.floor();
        final jamSelesaiM = ((sisaJam % 1) * 60).round();
        await _client.from('lembur').insert({
          'project_id': projectId, 'karyawan_id': karyawanId, 'tanggal': tanggal,
          'jam_mulai': '${jamMulaiH.toString().padLeft(2, '0')}:00',
          'jam_selesai': '${jamSelesaiH.toString().padLeft(2, '0')}:${jamSelesaiM.toString().padLeft(2, '0')}',
          'durasi_jam': sisaJam,
          'tarif_lembur': tarifLembur,
          'total_lembur': (sisaJam * tarifLembur).roundToDouble(),
          'status_persetujuan': 'disetujui',
          'catatan': 'Otomatis dari presensi ($durasi jam kerja)',
        });
      } else if (durasi >= 16) {
        final nHari = (durasi / 8).floor();
        final extraJam = (nHari - 1) * 8;
        await _client.from('lembur').insert({
          'project_id': projectId, 'karyawan_id': karyawanId, 'tanggal': tanggal,
          'jam_mulai': '15:00',
          'jam_selesai': '${(15 + extraJam).toString().padLeft(2, '0')}:00',
          'durasi_jam': extraJam,
          'tarif_lembur': tarifLembur,
          'total_lembur': 0,
          'status_persetujuan': 'disetujui',
          'catatan': 'Otomatis - Sudah dalam Gaji ($nHari hari kerja)',
        });
      }
    } catch (_) {
      // Non-fatal — sinkronisasi lembur tidak boleh menggagalkan penyimpanan presensi.
    }
  }

  // ── SEMUA KARYAWAN AKTIF ────────────────────────────────────
  Future<List<Map<String, dynamic>>> getAllKaryawan() async {
    try {
      final data = await _client
          .from('karyawan')
          .select('id, nama_karyawan, kode_karyawan, status_aktif, jabatan:jabatan_id(id, nama_jabatan, gaji_harian, uang_makan, uang_transport)')
          .eq('status_aktif', true)
          .order('nama_karyawan');
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── PRESENSI — semua project, filter tanggal ───────────────
  Future<List<Map<String, dynamic>>> getPresensi({
    int? projectId,
    int? karyawanId,
    String? tanggal,
    String? tanggalDari,
    String? tanggalSampai,
  }) async {
    try {
      var q = _client
          .from('presensi')
          .select('*, karyawan(id, nama_karyawan, kode_karyawan, jabatan:jabatan_id(nama_jabatan)), project(kode_project, nama_project)');
      if (projectId != null) q = q.eq('project_id', projectId);
      if (karyawanId != null) q = q.eq('karyawan_id', karyawanId);
      if (tanggal != null) q = q.eq('tanggal', tanggal);
      if (tanggalDari != null) q = q.gte('tanggal', tanggalDari);
      if (tanggalSampai != null) q = q.lte('tanggal', tanggalSampai);
      final data = await q.order('tanggal', ascending: false);
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── PRESENSI SEMUA KARYAWAN UNTUK TANGGAL TERTENTU ─────────
  // De-duplikasi: jika 1 karyawan punya 2 record (project berbeda), prioritas hadir
  Future<List<Map<String, dynamic>>> getPresensiHarian(String tanggal) async {
    try {
      final data = await _client
          .from('presensi')
          .select('*, karyawan(id, nama_karyawan, kode_karyawan, jabatan:jabatan_id(nama_jabatan, gaji_harian, uang_makan, uang_transport)), project(id, kode_project, nama_project)')
          .eq('tanggal', tanggal)
          .order('karyawan_id');

      final raw = List<Map<String, dynamic>>.from(data);
      // De-duplikasi per karyawan
      final byKaryawan = <int, Map<String, dynamic>>{};
      for (final p in raw) {
        final kId = p['karyawan_id'] as int;
        if (!byKaryawan.containsKey(kId)) {
          byKaryawan[kId] = p;
        } else {
          // Hadir menang atas tidak hadir
          // Priority: hadir > belum_lengkap > alfa/lainnya
          int statusPriority(String? s) {
            if (s == 'hadir') return 3;
            if (s == 'belum_lengkap') return 2;
            if (s == 'alfa') return 0;
            return 1;
          }
          final pPriority = statusPriority(p['status_kehadiran'] as String?);
          final existPriority = statusPriority(byKaryawan[kId]!['status_kehadiran'] as String?);
          if (pPriority > existPriority) {
            byKaryawan[kId] = p;
          }
        }
      }
      return byKaryawan.values.toList();
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── RIWAYAT PRESENSI PER KARYAWAN ──────────────────────────
  Future<List<Map<String, dynamic>>> getRiwayatKaryawan({
    required int karyawanId,
    String? tanggalDari,
    String? tanggalSampai,
  }) async {
    try {
      var q = _client
          .from('presensi')
          .select('*, project(id, kode_project, nama_project)')
          .eq('karyawan_id', karyawanId);
      if (tanggalDari != null) q = q.gte('tanggal', tanggalDari);
      if (tanggalSampai != null) q = q.lte('tanggal', tanggalSampai);
      final data = await q.order('tanggal', ascending: false);
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── CATAT PRESENSI MASUK/KELUAR (atomic) ─────────────────────
  // Cek + tulis presensi dalam SATU transaksi database (lihat
  // FIX_SCAN_PRESENSI_ATOMIC.sql) -- menghindari race condition "cek dulu
  // baru tulis" yang sebelumnya bisa bentrok dengan UNIQUE constraint dan
  // gagal dengan "Data sudah ada." kalau ada scan/tap lain yang menulis
  // baris presensi yang sama persis di jeda antara cek dan tulis. Dipakai
  // baik dari scan QR (qrValue diisi) maupun Absen Cepat tap manual
  // (qrValue null, metodeInput = 'manual').
  // Hasil 'hasil': 'masuk' | 'keluar' | 'lengkap'.
  Future<Map<String, dynamic>> scanPresensiQr({
    required int projectId,
    required int karyawanId,
    required String tanggal,
    required String jam,
    required String metodeInput,
    String? qrValue,
  }) async {
    try {
      final data = await _client.rpc('scan_presensi_qr', params: {
        'p_project_id': projectId,
        'p_karyawan_id': karyawanId,
        'p_tanggal': tanggal,
        'p_jam': jam,
        'p_metode_input': metodeInput,
        'p_qr_value': qrValue,
      });
      final row = (data as List).first as Map<String, dynamic>;
      if (row['hasil'] == 'keluar') {
        await _syncAutoLembur({
          'karyawan_id': karyawanId,
          'tanggal': tanggal,
          'durasi_jam': row['durasi_jam'],
          'status_kehadiran': 'hadir',
        }, const {});
      }
      return row;
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── UPSERT PRESENSI ─────────────────────────────────────────
  // ── CEK PRESENSI HARI INI ──────────────────────────────────
  Future<Map<String, dynamic>?> getPresensiHariIni({
    required int karyawanId, int? projectId, required String tanggal}) async {
    try {
      var q = _client
          .from('presensi')
          .select('id, jam_masuk, jam_keluar, status_kehadiran')
          .eq('karyawan_id', karyawanId)
          .eq('tanggal', tanggal);
      if (projectId != null) q = q.eq('project_id', projectId);
      final data = await q.maybeSingle();
      return data != null ? Map<String, dynamic>.from(data) : null;
    } catch (e) { return null; }
  }

  // Tandai 'alfa' semua karyawan yang belum punya presensi di hari yang
  // sudah lewat (lihat MIGRATION_AUTO_ALFA.sql). Aman dipanggil berkali-kali.
  Future<int> autoMarkAlfa() async {
    try {
      final result = await _client.rpc('auto_mark_alfa');
      return (result as int?) ?? 0;
    } catch (e) {
      debugPrint('[autoMarkAlfa] gagal: $e');
      return 0;
    }
  }

  Future<Map<String, dynamic>> upsertPresensi(Map<String, dynamic> payload) async {
    try {
      // Constraint unik yang sebenarnya di presensi cuma (karyawan_id,
      // tanggal) -- lihat FIX_PRESENSI_UNIQUE_CONSTRAINT.sql
      final data = await _client
          .from('presensi')
          .upsert(payload, onConflict: 'karyawan_id,tanggal')
          .select('*, karyawan(nama_karyawan), project(nama_project)')
          .single();
      final result = Map<String, dynamic>.from(data);
      await _syncAutoLembur(result, payload);
      return result;
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── UPDATE PRESENSI EXISTING ────────────────────────────────
  Future<Map<String, dynamic>> updatePresensi(int id, Map<String, dynamic> payload) async {
    try {
      final data = await _client
          .from('presensi')
          .update({...payload, 'updated_at': DateTime.now().toIso8601String()})
          .eq('id', id)
          .select('*, karyawan(nama_karyawan), project(kode_project, nama_project)')
          .single();
      final result = Map<String, dynamic>.from(data);
      await _syncAutoLembur(result, payload);
      return result;
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── DELETE PRESENSI ─────────────────────────────────────────
  Future<void> deletePresensi(int id) async {
    try {
      final pres = await _client
          .from('presensi').select('karyawan_id, tanggal').eq('id', id).maybeSingle();
      if (pres != null) {
        try {
          await _client.from('lembur').delete()
              .eq('karyawan_id', pres['karyawan_id']).eq('tanggal', pres['tanggal']).like('catatan', 'Otomatis%');
        } catch (_) {}
      }
      await _client.from('presensi').delete().eq('id', id);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── VALIDASI QR CODE ────────────────────────────────────────
  Future<Map<String, dynamic>?> validateQRCode(String qrValue, {int? projectId}) async {
    try {
      if (!qrValue.startsWith('KRAKATAU-')) throw Exception('QR Code tidak valid. Format tidak dikenali.');

      final qrData = await _client
          .from('karyawan_qr_code')
          .select('*, karyawan(id, nama_karyawan, kode_karyawan, status_aktif, jabatan:jabatan_id(nama_jabatan, gaji_harian, uang_makan, uang_transport))')
          .eq('qr_code_value', qrValue)
          .eq('status_aktif', true)
          .maybeSingle();

      if (qrData == null) throw Exception('QR Code tidak ditemukan atau tidak aktif.');
      final karyawan = qrData['karyawan'] as Map<String, dynamic>?;
      if (karyawan == null) throw Exception('Data karyawan tidak ditemukan.');
      if (karyawan['status_aktif'] == false) {
        throw Exception('Karyawan ${karyawan['nama_karyawan']} tidak aktif.');
      }

      // Update scan count
      await _client.from('karyawan_qr_code').update({
        'last_scanned_at': DateTime.now().toIso8601String(),
        'scan_count': (qrData['scan_count'] ?? 0) + 1,
      }).eq('id', qrData['id']);

      return karyawan;
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── KARYAWAN BY PROJECT ─────────────────────────────────────
  Future<List<Map<String, dynamic>>> getKaryawanByProject(int projectId) async {
    try {
      final data = await _client
          .from('project_karyawan')
          .select('karyawan(id, nama_karyawan, kode_karyawan, status_aktif, jabatan:jabatan_id(nama_jabatan, gaji_harian, uang_makan, uang_transport))')
          .eq('project_id', projectId)
          .eq('status_assignment', 'aktif');
      final result = <Map<String, dynamic>>[];
      for (final row in data as List) {
        final k = row['karyawan'];
        if (k != null && k['status_aktif'] == true) result.add(Map<String, dynamic>.from(k));
      }
      return result;
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── LEMBUR ──────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getLembur({int? projectId, String? status, String? tanggalDari, String? tanggalSampai,
  }) async {
    try {
      var q = _client.from('lembur')
          .select('id, project_id, karyawan_id, tanggal, jam_mulai, jam_selesai, durasi_jam, tarif_lembur, total_lembur, status_persetujuan, catatan, created_at, karyawan:karyawan_id(id, nama_karyawan, kode_karyawan, jabatan:jabatan_id(nama_jabatan, gaji_harian)), project:project_id(nama_project)');
      if (projectId != null) q = q.eq('project_id', projectId);
      if (status != null) q = q.eq('status_persetujuan', status);
      if (tanggalDari != null) q = q.gte('tanggal', tanggalDari);
      if (tanggalSampai != null) q = q.lte('tanggal', tanggalSampai);
      final data = await q.order('tanggal', ascending: false);
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  Future<void> deleteLembur(int id) async {
    try {
      await _client.from('lembur').delete().eq('id', id);
    } catch (e) { throw Exception(_err(e)); }
  }

    Future<Map<String, dynamic>> createLembur(Map<String, dynamic> payload) async {
    try {
      final gajiHarian = (payload['gaji_harian'] as num?)?.toDouble() ?? 0;
      final durasiJam  = (payload['durasi_jam']  as num?)?.toDouble() ?? 0;
      final tarif = gajiHarian / 8;
      final total = tarif * durasiJam;
      final fp = {...payload, 'tarif_lembur': tarif.roundToDouble(), 'total_lembur': total.roundToDouble(), 'status_persetujuan': 'pending'};
      fp.remove('gaji_harian');
      final data = await _client.from('lembur').insert(fp)
          .select('*, karyawan(nama_karyawan), project(nama_project)').single();
      return Map<String, dynamic>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── KASBON ──────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getKasbon({int? projectId, int? karyawanId, String? tanggalDari, String? tanggalSampai}) async {
    try {
      var q = _client.from('kasbon')
          .select('*, karyawan(id, nama_karyawan, kode_karyawan, jabatan:jabatan_id(nama_jabatan)), project(id, kode_project, nama_project)');
      if (projectId != null) q = q.eq('project_id', projectId);
      if (karyawanId != null) q = q.eq('karyawan_id', karyawanId);
      if (tanggalDari != null) q = q.gte('tanggal_kasbon', tanggalDari);
      if (tanggalSampai != null) q = q.lte('tanggal_kasbon', tanggalSampai);
      final data = await q.order('tanggal_kasbon', ascending: false);
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  Future<void> deleteKasbon(int id) async {
    try {
      await _client.from('kasbon').delete().eq('id', id);
    } catch (e) { throw Exception(_err(e)); }
  }

    Future<Map<String, dynamic>> createKasbon(Map<String, dynamic> payload) async {
    try {
      final fp = {...payload, 'sisa_kasbon': payload['jumlah_kasbon'], 'status_lunas': false,
                  'metode_pembayaran': payload['metode_pembayaran'] ?? 'potong_gaji'};
      final data = await _client.from('kasbon').insert(fp)
          .select('*, karyawan(nama_karyawan), project(nama_project)').single();
      return Map<String, dynamic>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── JABATAN ────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getJabatan() async {
    try {
      final data = await _client.from('jabatan').select('id, nama_jabatan').order('nama_jabatan');
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── DEPARTEMEN ─────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getDepartemen() async {
    try {
      final data = await _client.from('departemen').select('id, nama_departemen').order('nama_departemen');
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── SEMUA KARYAWAN (AKTIF + NON-AKTIF) ────────────────────
  Future<List<Map<String, dynamic>>> getAllKaryawanFull() async {
    try {
      final data = await _client
          .from('karyawan')
          .select('id, nama_karyawan, kode_karyawan, status_aktif, tanggal_bergabung, gaji_harian_override, jabatan:jabatan_id(id, nama_jabatan, gaji_harian), departemen:departemen_id(id, nama_departemen)')
          .order('nama_karyawan');
      return List<Map<String, dynamic>>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── TAMBAH KARYAWAN ────────────────────────────────────────
  Future<Map<String, dynamic>> createKaryawan(Map<String, dynamic> payload) async {
    try {
      final data = await _client.from('karyawan').insert(payload).select().single();
      return Map<String, dynamic>.from(data);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── UPDATE KARYAWAN ────────────────────────────────────────
  Future<void> updateKaryawan(int id, Map<String, dynamic> payload) async {
    try {
      await _client.from('karyawan').update(payload).eq('id', id);
    } catch (e) { throw Exception(_err(e)); }
  }

  // ── BUAT QR CODE KARYAWAN (sekali, permanen) ───────────────
  Future<String> generateKaryawanQR(int karyawanId) async {
    final qrValue = 'KRAKATAU-${karyawanId.toString().padLeft(6, '0')}';
    try {
      final existing = await _client
          .from('karyawan_qr_code')
          .select('qr_code_value')
          .eq('karyawan_id', karyawanId)
          .maybeSingle();
      if (existing != null) return existing['qr_code_value'] as String;
      await _client.from('karyawan_qr_code').insert({
        'karyawan_id': karyawanId,
        'qr_code_value': qrValue,
        'status_aktif': true,
      });
      return qrValue;
    } catch (_) { return qrValue; }
  }
}