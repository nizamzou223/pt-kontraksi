import 'package:supabase_flutter/supabase_flutter.dart';

import '../ml/akurasi.dart';
import '../ml/anomaly_detector.dart';
import '../ml/baris_data.dart';
import '../ml/forecast_pipeline.dart';
import '../ml/timeseries.dart';
import '../models/models.dart';
import 'adapters.dart';

/// Sumber data Sistem Cerdas. Ada dua implementasi: Supabase (data nyata) dan demo (data contoh).
abstract class AiRepository {
  bool get isDemo;
  Future<List<Proyek>> daftarProyek();
  Future<HasilRamalan?> ramalanTerbaru(int projectId);
  Future<List<TitikRiwayat>> riwayatPemakaian(int projectId, int barangId, {int minggu = 12});
  Future<List<Anomali>> daftarAnomali();
  Future<Anomali> tinjauAnomali(Anomali a, StatusTinjauan status, String? catatan, {int? userId});
  Future<List<InfoModel>> daftarModel();

  // ── Menjalankan analisis langsung dari aplikasi ──
  Future<DataMaterial> muatDataMaterial(int projectId, {int minggu = 52});
  Future<DataKepegawaian> muatDataKepegawaian({int? projectId, required int hari});
  Future<Set<String>> kunciDitinjau();

  /// Menyimpan hasil peramalan ke sistem; mengembalikan ringkasan untuk ditampilkan.
  Future<String> simpanRamalan(HasilPrediksi hasil, int projectId);
  Future<String> simpanAnomali(List<ItemAnomali> items, {int? projectIdDefault});
  Future<AkurasiRamalan> akurasiRamalan(int projectId);
}

/// Data pemakaian material siap analisis.
class DataMaterial {
  final List<String> weeks;
  final List<MasukanBarang> items;
  final bool exogTersedia;
  final int nTransaksi;
  const DataMaterial(this.weeks, this.items, {this.exogTersedia = false, this.nTransaksi = 0});
}

/// Dilempar bila tabel ml_* belum dibuat di database.
class TabelBelumAdaException implements Exception {
  @override
  String toString() =>
      'Tabel Sistem Cerdas belum dibuat. Jalankan MIGRATION_ML_SISTEM_CERDAS.sql di Supabase SQL Editor.';
}

/// Dilempar bila koneksi/izin gagal; pesannya sudah ramah pengguna.
class DataException implements Exception {
  final String pesan;
  DataException(this.pesan);
  @override
  String toString() => pesan;
}

DateTime senin(DateTime d) {
  final t = DateTime(d.year, d.month, d.day);
  return t.subtract(Duration(days: t.weekday - DateTime.monday));
}

class SupabaseAiRepository implements AiRepository {
  final SupabaseClient _db = Supabase.instance.client;

  @override
  bool get isDemo => false;

  /// Menerjemahkan galat Postgrest ke pesan yang dipahami pengguna.
  Future<T> _jalankan<T>(Future<T> Function() f) async {
    try {
      return await f();
    } on PostgrestException catch (e) {
      final m = e.message.toLowerCase();
      if (e.code == '42P01' || e.code == 'PGRST205' || m.contains('could not find the table') || m.contains('does not exist')) {
        throw TabelBelumAdaException();
      }
      if (e.code == '42501' || m.contains('permission denied') || m.contains('row-level security')) {
        throw DataException('Akun Anda tidak berhak membuka data ini. Hanya Admin dan HRD yang dapat mengakses Sistem Cerdas.');
      }
      throw DataException('Kesalahan database: ${e.message}');
    } on AuthException catch (e) {
      throw DataException('Sesi berakhir (${e.message}). Silakan masuk kembali.');
    } catch (e) {
      final m = e.toString().toLowerCase();
      if (m.contains('socket') || m.contains('failed host lookup') || m.contains('connection') || m.contains('network') || m.contains('timeout')) {
        throw DataException('Koneksi gagal. Periksa koneksi internet Anda lalu tarik layar ke bawah untuk memuat ulang.');
      }
      rethrow;
    }
  }

  @override
  Future<List<Proyek>> daftarProyek() => _jalankan(() async {
        final rows = await _db.from('project').select('id, nama_project').order('nama_project');
        return (rows as List).map((r) => Proyek(asInt(r['id']), (r['nama_project'] ?? '-').toString())).toList();
      });

  @override
  Future<HasilRamalan?> ramalanTerbaru(int projectId) => _jalankan(() async {
        final last = await _db
            .from('ml_rekomendasi_pengadaan')
            .select('dibuat_pada')
            .eq('project_id', projectId)
            .order('dibuat_pada', ascending: false)
            .limit(1);
        if ((last as List).isEmpty) return null;
        final dibuat = last.first['dibuat_pada'].toString();

        final rek = await _db
            .from('ml_rekomendasi_pengadaan')
            .select('*, barang(nama_barang, kode_barang, stok_saat_ini, stok_minimal, satuan_barang(singkatan))')
            .eq('project_id', projectId)
            .eq('dibuat_pada', dibuat);
        final fc = await _db
            .from('ml_forecast')
            .select('barang_id, minggu_target, horizon, yhat, yhat_bawah, yhat_atas')
            .eq('project_id', projectId)
            .eq('dibuat_pada', dibuat)
            .order('minggu_target');

        final perBarang = <int, List<TitikRamalan>>{};
        for (final f in fc as List) {
          final y = asDouble(f['yhat']);
          perBarang.putIfAbsent(asInt(f['barang_id']), () => []).add(TitikRamalan(
                minggu: asDate(f['minggu_target']) ?? DateTime.now(),
                horizon: asInt(f['horizon']),
                yhat: y,
                bawah: asDouble(f['yhat_bawah'], y),
                atas: asDouble(f['yhat_atas'], y),
              ));
        }

        final items = <BarangRamalan>[];
        for (final r in rek as List) {
          final b = (r['barang'] as Map?) ?? const {};
          final alasan = r['alasan'];
          final id = asInt(r['barang_id']);
          items.add(BarangRamalan(
            barangId: id,
            nama: (b['nama_barang'] ?? 'Barang #$id').toString(),
            kode: (b['kode_barang'] ?? '').toString(),
            satuan: ((b['satuan_barang'] as Map?)?['singkatan'] ?? '').toString(),
            stok: asDouble(b['stok_saat_ini']),
            stokMinimal: asDouble(b['stok_minimal']),
            titikPemesananUlang: asDouble(r['titik_pemesanan_ulang']),
            stokPengaman: asDouble(r['stok_pengaman']),
            jumlahDisarankan: asDouble(r['jumlah_disarankan']),
            perkiraanHabis: asDate(r['perkiraan_habis']),
            risiko: Risiko.parse(r['risiko']?.toString()),
            alasan: alasan is Map ? asTextList(alasan['alasan']) : asTextList(alasan),
            modelNama: alasan is Map ? alasan['model']?.toString() : null,
            mase: alasan is Map && alasan['mase'] != null ? asDouble(alasan['mase']) : null,
            ramalan: perBarang[id] ?? const [],
          ));
        }
        items.sort((a, b) {
          final c = a.risiko.index.compareTo(b.risiko.index);
          return c != 0 ? c : b.jumlahDisarankan.compareTo(a.jumlahDisarankan);
        });
        return HasilRamalan(DateTime.tryParse(dibuat) ?? DateTime.now(), items);
      });

  @override
  Future<List<TitikRiwayat>> riwayatPemakaian(int projectId, int barangId, {int minggu = 12}) => _jalankan(() async {
        final mulai = senin(DateTime.now()).subtract(Duration(days: 7 * minggu));
        final akhir = senin(DateTime.now()); // minggu berjalan belum lengkap → tidak dipakai
        final rows = await _db
            .from('stok_keluar')
            .select('jumlah, created_at')
            .eq('project_id', projectId)
            .eq('barang_id', barangId)
            .gte('created_at', mulai.toIso8601String())
            .lt('created_at', akhir.toIso8601String());
        final perMinggu = <DateTime, double>{
          for (var i = 0; i < minggu; i++) mulai.add(Duration(days: 7 * i)): 0,
        };
        for (final r in rows as List) {
          final t = asDate(r['created_at']);
          if (t == null) continue;
          final k = senin(t.toLocal());
          if (perMinggu.containsKey(k)) perMinggu[k] = perMinggu[k]! + asDouble(r['jumlah']);
        }
        return perMinggu.entries.map((e) => TitikRiwayat(e.key, e.value)).toList();
      });

  @override
  Future<List<Anomali>> daftarAnomali() => _jalankan(() async {
        final rows = await _db
            .from('ml_anomali')
            .select('*, karyawan(nama_karyawan), project(nama_project)')
            .order('skor', ascending: false)
            .limit(500);
        return (rows as List).map((r) => Anomali.fromRow(Map<String, dynamic>.from(r as Map))).toList();
      });

  @override
  Future<Anomali> tinjauAnomali(Anomali a, StatusTinjauan status, String? catatan, {int? userId}) => _jalankan(() async {
        final bersih = (catatan ?? '').trim();
        await _db.from('ml_anomali').update({
          'status_tinjauan': status.kode,
          'catatan': bersih.isEmpty ? null : bersih,
          'ditinjau_oleh': status == StatusTinjauan.baru ? null : userId,
          'ditinjau_pada': status == StatusTinjauan.baru ? null : DateTime.now().toUtc().toIso8601String(),
        }).eq('id', a.id);
        return a.copyWith(
          status: status,
          catatan: bersih.isEmpty ? null : bersih,
          hapusCatatan: bersih.isEmpty,
          hapusTinjauan: status == StatusTinjauan.baru,
          ditinjauPada: status == StatusTinjauan.baru ? null : DateTime.now(),
        );
      });

  @override
  Future<List<InfoModel>> daftarModel() => _jalankan(() async {
        final rows = await _db.from('ml_model_registry').select('*').order('dilatih_pada', ascending: false).limit(30);
        return (rows as List).map((r) => InfoModel.fromRow(Map<String, dynamic>.from(r as Map))).toList();
      });

  // ───────────────────────── Memuat data untuk analisis (hanya-baca) ─────────────────────────
  static const _halaman = 1000;

  /// Membaca SEMUA baris (API dibatasi 1.000 baris per permintaan) lewat .range().
  Future<List<Map<String, dynamic>>> _semua(Future<List<dynamic>> Function(int dari, int sampai) bangun) async {
    final rows = <Map<String, dynamic>>[];
    for (var dari = 0;; dari += _halaman) {
      final data = await bangun(dari, dari + _halaman - 1);
      rows.addAll(data.map((e) => Map<String, dynamic>.from(e as Map)));
      if (data.length < _halaman) break;
    }
    return rows;
  }

  /// Deret pemakaian mingguan per barang. Minggu berjalan (belum lengkap) DIKECUALIKAN karena
  /// mengecilkan nilai terakhir dan membiaskan ramalan.
  @override
  Future<DataMaterial> muatDataMaterial(int projectId, {int minggu = 52}) => _jalankan(() async {
        final mingguIni = weekStart(isoDate(DateTime.now()));
        final dari = addWeeks(mingguIni, -minggu);
        final sampai = addDays(mingguIni, -1); // minggu terakhir yang sudah lengkap

        final barang = await _semua((a, b) => _db
            .from('barang')
            .select('id, nama_barang, kode_barang, stok_saat_ini, stok_minimal, satuan_barang(singkatan)')
            .eq('project_id', projectId)
            .order('id')
            .range(a, b));
        final keluar = await _semua((a, b) => _db
            .from('stok_keluar')
            .select('id, barang_id, jumlah, created_at')
            .eq('project_id', projectId)
            .gte('created_at', dari)
            .lt('created_at', mingguIni)
            .order('id')
            .range(a, b));
        final presensi = await _semua((a, b) => _db
            .from('presensi')
            .select('id, karyawan_id, tanggal, status_kehadiran, metode_input')
            .eq('project_id', projectId)
            .gte('tanggal', dari)
            .lt('tanggal', mingguIni)
            .order('id')
            .range(a, b));

        final daftarMinggu = weekRange(dari, sampai);
        final perBarang = <int, List<BarisTanggal>>{};
        for (final r in keluar) {
          final id = asInt(r['barang_id']);
          (perBarang[id] ??= []).add(BarisTanggal(r['created_at'].toString(), asDouble(r['jumlah'])));
        }

        // tenaga kerja aktif per minggu (fitur eksogen): karyawan berbeda yang hadir; presensi otomatis dikecualikan
        final hadir = presensi.where((p) => (p['status_kehadiran'] ?? 'hadir') == 'hadir' && p['metode_input'] != 'otomatis').toList();
        final indeks = {for (var i = 0; i < daftarMinggu.length; i++) daftarMinggu[i]: i};
        final himpunan = [for (final _ in daftarMinggu) <int>{}];
        for (final p in hadir) {
          final i = indeks[weekStart(p['tanggal'].toString())];
          if (i != null) himpunan[i].add(asInt(p['karyawan_id']));
        }
        final exog = [for (final s in himpunan) s.length.toDouble()];

        final items = [
          for (final b in barang)
            MasukanBarang(
              id: asInt(b['id']),
              nama: (b['nama_barang'] ?? '-').toString(),
              kode: (b['kode_barang'] ?? '').toString(),
              satuan: ((b['satuan_barang'] as Map?)?['singkatan'] ?? '').toString(),
              values: weeklySeries(perBarang[asInt(b['id'])] ?? const [], from: dari, to: sampai).values,
              exog: exog,
              stok: asDouble(b['stok_saat_ini']),
              stokMinimal: asDouble(b['stok_minimal']),
            ),
        ];
        return DataMaterial(daftarMinggu, items, exogTersedia: exog.any((v) => v > 0), nTransaksi: keluar.length);
      });

  /// Memuat data kepegawaian. Riwayat 60 hari SEBELUM periode ikut dimuat hanya sebagai baseline statistik.
  @override
  Future<DataKepegawaian> muatDataKepegawaian({int? projectId, required int hari}) => _jalankan(() async {
        const riwayatHari = 60;
        final sampai = isoDate(DateTime.now());
        final dari = addDays(sampai, -(hari - 1));
        final riwayatDari = addDays(dari, -riwayatHari);

        final kar = await _semua((a, b) => _db
            .from('karyawan')
            .select('id, nama_karyawan, status_aktif, tanggal_bergabung, jabatan_id, gaji_harian_override, jabatan(gaji_harian)')
            .order('id')
            .range(a, b));
        final presensi = await _semua((a, b) {
          var q = _db
              .from('presensi')
              .select('id, project_id, karyawan_id, tanggal, jam_masuk, jam_keluar, durasi_jam, status_kehadiran, metode_input, catatan')
              .gte('tanggal', riwayatDari)
              .lte('tanggal', sampai);
          if (projectId != null) q = q.eq('project_id', projectId);
          return q.order('id').range(a, b);
        });
        final lembur = await _semua((a, b) {
          var q = _db
              .from('lembur')
              .select('id, project_id, karyawan_id, tanggal, jam_mulai, jam_selesai, durasi_jam, tarif_lembur, total_lembur, status_persetujuan, catatan')
              .gte('tanggal', riwayatDari)
              .lte('tanggal', sampai);
          if (projectId != null) q = q.eq('project_id', projectId);
          return q.order('id').range(a, b);
        });
        final kasbon = await _semua((a, b) {
          var q = _db
              .from('kasbon')
              .select('id, project_id, karyawan_id, jumlah_kasbon, sisa_kasbon, tanggal_kasbon, status_lunas')
              .gte('tanggal_kasbon', riwayatDari)
              .lte('tanggal_kasbon', sampai);
          if (projectId != null) q = q.eq('project_id', projectId);
          return q.order('id').range(a, b);
        });
        final gaji = await _semua((a, b) => _db
            .from('rekap_gaji_mingguan')
            .select('id, karyawan_id, periode_mulai, gaji_kotor, gaji_bersih, total_potongan_kasbon, total_hari_hadir')
            .gte('periode_mulai', riwayatDari)
            .lte('periode_mulai', sampai)
            .order('id')
            .range(a, b));

        return DataKepegawaian(
          karyawan: kar.map(KaryawanRow.fromJson).toList(),
          presensi: presensi.map(PresensiRow.fromJson).toList(),
          lembur: lembur.map(LemburRow.fromJson).toList(),
          kasbon: kasbon.map(KasbonRow.fromJson).toList(),
          gaji: gaji.map(GajiRow.fromJson).toList(),
          today: sampai,
          dari: dari,
          sampai: sampai,
        );
      });

  /// Kunci 'tabel:id' yang sudah ditinjau "bukan anomali"/"diabaikan" → ditekan pada analisis berikutnya.
  @override
  Future<Set<String>> kunciDitinjau() async {
    try {
      return await _jalankan(() async {
        final rows = await _semua((a, b) => _db
            .from('ml_anomali')
            .select('id, sumber_tabel, sumber_id, status_tinjauan')
            .inFilter('status_tinjauan', ['bukan_anomali', 'diabaikan'])
            .order('id')
            .range(a, b));
        return {for (final r in rows) '${r['sumber_tabel']}:${r['sumber_id']}'};
      });
    } on TabelBelumAdaException {
      return <String>{};
    }
  }

  // ───────────────────────── Menyimpan hasil analisis ─────────────────────────
  static List<List<T>> _potong<T>(List<T> a, int n) =>
      [for (var i = 0; i < a.length; i += n) a.sublist(i, i + n > a.length ? a.length : i + n)];
  static double? _bulat2(double v) => v.isFinite ? (v * 100).round() / 100 : null;

  @override
  Future<String> simpanRamalan(HasilPrediksi hasil, int projectId) => _jalankan(() async {
        final dibuat = isoDate(DateTime.now());
        final registry = {
          'jenis': 'forecast',
          'nama_model': hasil.terbaik?.nama ?? hasil.modelTerbaik,
          'versi': dibuat,
          'aktif': true,
          'hyperparameter': parameterDari(hasil),
          'metrik': metrikDari(hasil),
          'data_dari': hasil.weeks.first,
          'data_sampai': hasil.weeks.last,
        };
        final model = await _db.from('ml_model_registry').upsert(registry, onConflict: 'jenis,nama_model,versi').select('id').single();
        final modelId = asInt(model['id']);
        await _db.from('ml_model_registry').update({'aktif': false}).eq('jenis', 'forecast').neq('id', modelId);

        final fc = <Map<String, dynamic>>[];
        final rek = <Map<String, dynamic>>[];
        for (final it in hasil.items) {
          for (var i = 0; i < it.forecast.length; i++) {
            final f = it.forecast[i];
            fc.add({
              'model_id': modelId,
              'project_id': projectId,
              'barang_id': it.id,
              'dibuat_pada': dibuat,
              'minggu_target': f.minggu,
              'horizon': i + 1,
              'yhat': _bulat2(f.yhat),
              'yhat_bawah': _bulat2(f.low),
              'yhat_atas': _bulat2(f.high),
            });
          }
          final r = it.rekomendasi;
          rek.add({
            'model_id': modelId,
            'project_id': projectId,
            'barang_id': it.id,
            'dibuat_pada': dibuat,
            'titik_pemesanan_ulang': r.reorderPoint,
            'stok_pengaman': r.safetyStock,
            'jumlah_disarankan': r.orderQty,
            'perkiraan_habis': r.stockoutWeek,
            'risiko': r.risiko,
            'alasan': {'alasan': r.alasan, 'model': it.modelNama, 'mase': it.mase},
          });
        }
        for (final part in _potong(fc, 500)) {
          await _db.from('ml_forecast').upsert(part, onConflict: 'model_id,barang_id,dibuat_pada,minggu_target');
        }
        for (final part in _potong(rek, 500)) {
          await _db.from('ml_rekomendasi_pengadaan').upsert(part, onConflict: 'barang_id,dibuat_pada');
        }
        return 'Tersimpan: ${fc.length} baris ramalan & ${rek.length} rekomendasi.';
      });

  @override
  Future<String> simpanAnomali(List<ItemAnomali> items, {int? projectIdDefault}) => _jalankan(() async {
        if (items.isEmpty) return 'Tidak ada anomali untuk disimpan.';
        // Yang sudah ditinjau admin TIDAK ditimpa; yang masih 'baru' diperbarui skornya.
        final status = <String, String>{};
        for (final tabel in items.map((i) => i.sumberTabel).toSet()) {
          final ids = [for (final i in items) if (i.sumberTabel == tabel) i.sumberId];
          for (final part in _potong(ids, 200)) {
            final data = await _db
                .from('ml_anomali')
                .select('id, sumber_tabel, sumber_id, status_tinjauan')
                .eq('sumber_tabel', tabel)
                .inFilter('sumber_id', part);
            for (final e in data as List) {
              status['${e['sumber_tabel']}:${e['sumber_id']}'] = (e['status_tinjauan'] ?? 'baru').toString();
            }
          }
        }
        final dipakai = items.where((i) => !status.containsKey(i.key) || status[i.key] == 'baru').toList();
        final rows = [
          for (final i in dipakai)
            {
              'sumber_tabel': i.sumberTabel,
              'sumber_id': i.sumberId,
              'karyawan_id': i.karyawanId,
              'project_id': i.projectId ?? projectIdDefault,
              'tanggal': i.tanggal,
              'skor': (i.skor * 10000).round() / 10000,
              'tingkat': i.tingkat,
              'alasan': [
                for (final a in i.alasan) {'kode': a.kode, 'tingkat': a.tingkat, 'teks': a.teks, 'bobot': a.bobot, 'metode': a.metode}
              ],
              'metode': i.metode,
            }
        ];
        for (final part in _potong(rows, 300)) {
          await _db.from('ml_anomali').upsert(part, onConflict: 'sumber_tabel,sumber_id');
        }
        final diperbarui = dipakai.where((i) => status.containsKey(i.key)).length;
        return '${dipakai.length - diperbarui} penanda baru disimpan, $diperbarui diperbarui, ${items.length - dipakai.length} dilewati (sudah ditinjau).';
      });

  // ───────────────────────── Pemantauan: prediksi vs realisasi ─────────────────────────
  @override
  Future<AkurasiRamalan> akurasiRamalan(int projectId) => _jalankan(() async {
        final mingguIni = weekStart(isoDate(DateTime.now()));
        final terakhirLengkap = addWeeks(mingguIni, -1);
        final fc = await _semua((a, b) => _db
            .from('ml_forecast')
            .select('dibuat_pada, minggu_target, horizon, barang_id, yhat')
            .eq('project_id', projectId)
            .order('id')
            .range(a, b));
        if (fc.isEmpty) return AkurasiRamalan.kosong;
        final minMinggu = fc.map((f) => f['minggu_target'].toString()).reduce((a, b) => a.compareTo(b) < 0 ? a : b);
        final rows = await _semua((a, b) => _db
            .from('stok_keluar')
            .select('id, barang_id, jumlah, created_at')
            .eq('project_id', projectId)
            .gte('created_at', minMinggu)
            .lt('created_at', mingguIni)
            .order('id')
            .range(a, b));
        final aktual = <String, double>{};
        for (final r in rows) {
          final k = '${r['barang_id']}|${weekStart(r['created_at'].toString())}';
          aktual[k] = (aktual[k] ?? 0) + asDouble(r['jumlah']);
        }
        return hitungAkurasi([
          for (final f in fc)
            BarisRamalanTersimpan(f['dibuat_pada'].toString(), f['minggu_target'].toString(), asInt(f['horizon']), asInt(f['barang_id']), asDouble(f['yhat']))
        ], aktual, terakhirLengkap);
      });
}
