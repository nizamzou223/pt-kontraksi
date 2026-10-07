import 'package:supabase_flutter/supabase_flutter.dart';

class InventoryMandorService {
  final _client = Supabase.instance.client;

  String _parseError(dynamic e) {
    final msg = e?.message?.toString() ?? e.toString();
    if (msg.contains('foreign key') || msg.contains('violates')) {
      return 'Data tidak bisa dihapus karena masih digunakan.';
    }
    if (msg.contains('duplicate') || msg.contains('unique')) {
      return 'Data sudah ada.';
    }
    return msg.isNotEmpty ? msg : 'Terjadi kesalahan.';
  }

  // Ambil semua barang — katalog gudang pusat global, satu stok bersama semua
  // project (lihat FIX_GUDANG_PUSAT.sql). Tidak difilter per project lagi.
  Future<List<Map<String, dynamic>>> getAllBarang() async {
    try {
      final data = await _client
          .from('barang')
          .select('id, kode_barang, nama_barang, stok_saat_ini, stok_minimal, harga_beli, '
              'kategori_barang:kategori_id(nama_kategori), '
              'satuan_barang:satuan_id(nama_satuan, singkatan)')
          .order('nama_barang');
      return List<Map<String, dynamic>>.from(data);
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Buat permintaan barang ke gudang
  Future<Map<String, dynamic>> createPermintaan(
      Map<String, dynamic> payload) async {
    try {
      if ((payload['jumlah_diminta'] as int? ?? 0) <= 0) {
        throw Exception('Jumlah yang diminta harus lebih dari 0.');
      }

      final finalPayload = {
        ...payload,
        'status_permintaan': 'pending',
        'tanggal_permintaan':
            payload['tanggal_permintaan'] ?? DateTime.now().toIso8601String().split('T')[0],
      };

      final data = await _client
          .from('permintaan_barang')
          .insert(finalPayload)
          .select('*, barang(nama_barang, kode_barang), karyawan!peminta_id(nama_karyawan)')
          .single();
      return Map<String, dynamic>.from(data);
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Lihat riwayat permintaan di proyek ini
  Future<List<Map<String, dynamic>>> getPermintaanSaya(int projectId) async {
    try {
      final data = await _client
          .from('permintaan_barang')
          .select(
              '*, barang(nama_barang, kode_barang, stok_saat_ini, satuan_barang(singkatan)), karyawan!peminta_id(nama_karyawan)')
          .eq('project_id', projectId)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(data);
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Batalkan permintaan (hanya jika masih pending)
  Future<void> batalPermintaan(int id) async {
    try {
      final p = await _client
          .from('permintaan_barang')
          .select('status_permintaan')
          .eq('id', id)
          .maybeSingle();

      if (p == null) throw Exception('Permintaan tidak ditemukan.');
      if (p['status_permintaan'] != 'pending') {
        throw Exception('Hanya permintaan dengan status pending yang bisa dibatalkan.');
      }

      await _client.from('permintaan_barang').delete().eq('id', id);
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Barang yang pernah dikirim (stok_keluar) ke project ini — basis pilihan retur
  Future<List<Map<String, dynamic>>> getBarangDikirimKeProject(
      int projectId) async {
    try {
      final data = await _client
          .from('stok_keluar')
          .select(
              'barang_id, jumlah, barang(nama_barang, kode_barang, stok_saat_ini, satuan_barang(singkatan))')
          .eq('project_id', projectId);

      final rows = List<Map<String, dynamic>>.from(data);
      final Map<int, Map<String, dynamic>> grouped = {};
      for (final row in rows) {
        final barangId = row['barang_id'] as int?;
        if (barangId == null) continue;
        if (grouped.containsKey(barangId)) {
          grouped[barangId]!['total_dikirim'] =
              (grouped[barangId]!['total_dikirim'] as int) +
                  (row['jumlah'] as num).toInt();
        } else {
          grouped[barangId] = {
            'barang_id': barangId,
            'barang': row['barang'],
            'total_dikirim': (row['jumlah'] as num).toInt(),
          };
        }
      }
      return grouped.values.toList();
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Buat retur / sisa barang ke gudang
  Future<Map<String, dynamic>> createRetur(Map<String, dynamic> payload) async {
    try {
      if ((payload['jumlah_retur'] as int? ?? 0) <= 0) {
        throw Exception('Jumlah retur harus lebih dari 0.');
      }

      final finalPayload = {
        ...payload,
        'status_retur': 'pending',
        'tanggal_retur': payload['tanggal_retur'] ??
            DateTime.now().toIso8601String().split('T')[0],
      };

      final data = await _client
          .from('retur_barang')
          .insert(finalPayload)
          .select('*, barang(nama_barang, kode_barang), karyawan!pengembali_id(nama_karyawan)')
          .single();
      return Map<String, dynamic>.from(data);
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Riwayat retur di proyek ini
  Future<List<Map<String, dynamic>>> getReturSaya(int projectId) async {
    try {
      final data = await _client
          .from('retur_barang')
          .select(
              '*, barang(nama_barang, kode_barang, stok_saat_ini, satuan_barang(singkatan)), karyawan!pengembali_id(nama_karyawan)')
          .eq('project_id', projectId)
          .order('created_at', ascending: false);

      return List<Map<String, dynamic>>.from(data);
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }

  // Batalkan retur (hanya jika masih pending)
  Future<void> batalRetur(int id) async {
    try {
      final r = await _client
          .from('retur_barang')
          .select('status_retur')
          .eq('id', id)
          .maybeSingle();

      if (r == null) throw Exception('Retur tidak ditemukan.');
      if (r['status_retur'] != 'pending') {
        throw Exception('Hanya retur dengan status pending yang bisa dibatalkan.');
      }

      await _client.from('retur_barang').delete().eq('id', id);
    } catch (e) {
      throw Exception(_parseError(e));
    }
  }
}
