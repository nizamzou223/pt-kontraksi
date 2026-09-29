// Model data Sistem Cerdas. Struktur mengikuti tabel ml_* pada MIGRATION_ML_SISTEM_CERDAS.sql.

double asDouble(dynamic v, [double def = 0]) {
  if (v == null) return def;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? def;
}

int asInt(dynamic v, [int def = 0]) {
  if (v == null) return def;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString()) ?? def;
}

DateTime? asDate(dynamic v) => v == null ? null : DateTime.tryParse(v.toString());

/// Daftar teks dari JSONB yang bisa berupa list string atau list objek {teks: ...}.
List<String> asTextList(dynamic v) {
  if (v is List) {
    return v
        .map((e) => e is Map ? (e['teks'] ?? e['text'] ?? '').toString() : e.toString())
        .where((s) => s.isNotEmpty)
        .toList();
  }
  return const [];
}

// ───────────────────────── Proyek ─────────────────────────
class Proyek {
  final int id;
  final String nama;
  const Proyek(this.id, this.nama);
}

// ───────────────────────── Peramalan material ─────────────────────────
enum Risiko {
  habis('Habis', 'Stok sudah habis padahal kebutuhan masih diperkirakan ada. Pesan sekarang.'),
  kritis('Kritis', 'Stok berada di bawah titik pemesanan ulang. Segera lakukan pemesanan.'),
  waspada('Waspada', 'Stok belum cukup untuk seluruh periode ramalan. Rencanakan pemesanan.'),
  aman('Aman', 'Stok mencukupi kebutuhan yang diperkirakan.');

  final String label;
  final String arti;
  const Risiko(this.label, this.arti);

  static Risiko parse(String? s) =>
      Risiko.values.firstWhere((r) => r.name == s, orElse: () => Risiko.aman);
}

class TitikRamalan {
  final DateTime minggu; // Senin minggu yang diramal
  final int horizon;
  final double yhat;
  final double bawah;
  final double atas;
  const TitikRamalan({
    required this.minggu,
    required this.horizon,
    required this.yhat,
    required this.bawah,
    required this.atas,
  });
}

class TitikRiwayat {
  final DateTime minggu;
  final double nilai;
  const TitikRiwayat(this.minggu, this.nilai);
}

class BarangRamalan {
  final int barangId;
  final String nama;
  final String kode;
  final String satuan;
  final double stok;
  final double stokMinimal;
  final double titikPemesananUlang;
  final double stokPengaman;
  final double jumlahDisarankan;
  final DateTime? perkiraanHabis;
  final Risiko risiko;
  final List<String> alasan;
  final String? modelNama;
  final double? mase;
  final List<TitikRamalan> ramalan;

  /// Riwayat pemakaian mingguan bila sudah tersedia (hasil analisis yang baru dijalankan);
  /// bila null, layar detail memuatnya dari database.
  final List<TitikRiwayat>? riwayat;

  const BarangRamalan({
    required this.barangId,
    required this.nama,
    required this.kode,
    required this.satuan,
    required this.stok,
    required this.stokMinimal,
    required this.titikPemesananUlang,
    required this.stokPengaman,
    required this.jumlahDisarankan,
    required this.perkiraanHabis,
    required this.risiko,
    required this.alasan,
    required this.modelNama,
    required this.mase,
    required this.ramalan,
    this.riwayat,
  });

  double get totalRamalan => ramalan.fold(0.0, (s, p) => s + p.yhat);

  /// Berapa minggu stok saat ini bertahan pada laju pemakaian yang diramalkan (null bila tanpa pemakaian).
  double? get mingguCukup {
    if (ramalan.isEmpty) return null;
    final rata = totalRamalan / ramalan.length;
    return rata <= 0 ? null : stok / rata;
  }
  bool get perluDipesan => jumlahDisarankan > 0 && risiko != Risiko.aman;
}

class HasilRamalan {
  final DateTime dibuatPada;
  final List<BarangRamalan> barang;
  const HasilRamalan(this.dibuatPada, this.barang);

  int hitung(Risiko r) => barang.where((b) => b.risiko == r).length;
}

// ───────────────────────── Anomali ─────────────────────────
enum Tingkat {
  tinggi('Tinggi'),
  sedang('Sedang'),
  rendah('Rendah');

  final String label;
  const Tingkat(this.label);
  static Tingkat parse(String? s) =>
      Tingkat.values.firstWhere((t) => t.name == s, orElse: () => Tingkat.rendah);
}

enum StatusTinjauan {
  baru('Baru', 'baru'),
  valid('Valid', 'valid'),
  bukanAnomali('Bukan anomali', 'bukan_anomali'),
  diabaikan('Diabaikan', 'diabaikan');

  final String label;
  final String kode; // nilai di database
  const StatusTinjauan(this.label, this.kode);
  static StatusTinjauan parse(String? s) =>
      StatusTinjauan.values.firstWhere((t) => t.kode == s, orElse: () => StatusTinjauan.baru);
}

class AlasanAnomali {
  final String kode;
  final Tingkat tingkat;
  final String teks;
  final String? metode;
  const AlasanAnomali({required this.kode, required this.tingkat, required this.teks, this.metode});

  factory AlasanAnomali.fromJson(dynamic j) {
    if (j is Map) {
      return AlasanAnomali(
        kode: (j['kode'] ?? '').toString(),
        tingkat: Tingkat.parse(j['tingkat']?.toString()),
        teks: (j['teks'] ?? '').toString(),
        metode: j['metode']?.toString(),
      );
    }
    return AlasanAnomali(kode: '', tingkat: Tingkat.rendah, teks: j.toString());
  }
}

class Anomali {
  final int id;
  final String sumberTabel;
  final int sumberId;
  final String? karyawan;
  final String? proyek;
  final DateTime tanggal;
  final double skor; // 0..1
  final Tingkat tingkat;
  final List<AlasanAnomali> alasan;
  final List<String> metode;
  final StatusTinjauan status;
  final String? catatan;
  final DateTime? ditinjauPada;

  const Anomali({
    required this.id,
    required this.sumberTabel,
    required this.sumberId,
    required this.karyawan,
    required this.proyek,
    required this.tanggal,
    required this.skor,
    required this.tingkat,
    required this.alasan,
    required this.metode,
    required this.status,
    required this.catatan,
    required this.ditinjauPada,
  });

  factory Anomali.fromRow(Map<String, dynamic> r) {
    final alasan = r['alasan'];
    final metode = r['metode'];
    return Anomali(
      id: asInt(r['id']),
      sumberTabel: (r['sumber_tabel'] ?? '').toString(),
      sumberId: asInt(r['sumber_id']),
      karyawan: (r['karyawan'] as Map?)?['nama_karyawan']?.toString(),
      proyek: (r['project'] as Map?)?['nama_project']?.toString(),
      tanggal: asDate(r['tanggal']) ?? DateTime.now(),
      skor: asDouble(r['skor']),
      tingkat: Tingkat.parse(r['tingkat']?.toString()),
      alasan: alasan is List ? alasan.map(AlasanAnomali.fromJson).toList() : const [],
      metode: metode is List ? metode.map((e) => e.toString()).toList() : const [],
      status: StatusTinjauan.parse(r['status_tinjauan']?.toString()),
      catatan: r['catatan']?.toString(),
      ditinjauPada: asDate(r['ditinjau_pada']),
    );
  }

  Anomali copyWith({
    StatusTinjauan? status,
    String? catatan,
    DateTime? ditinjauPada,
    bool hapusCatatan = false,
    bool hapusTinjauan = false,
  }) =>
      Anomali(
        id: id,
        sumberTabel: sumberTabel,
        sumberId: sumberId,
        karyawan: karyawan,
        proyek: proyek,
        tanggal: tanggal,
        skor: skor,
        tingkat: tingkat,
        alasan: alasan,
        metode: metode,
        status: status ?? this.status,
        catatan: hapusCatatan ? null : (catatan ?? this.catatan),
        ditinjauPada: hapusTinjauan ? null : (ditinjauPada ?? this.ditinjauPada),
      );

  String get sumberLabel => switch (sumberTabel) {
        'presensi' => 'Presensi',
        'lembur' => 'Lembur',
        'kasbon' => 'Kasbon',
        'rekap_gaji_mingguan' => 'Gaji Mingguan',
        _ => sumberTabel,
      };

  /// Ringkasan satu kalimat untuk daftar.
  String get ringkas => alasan.isEmpty ? 'Tidak ada rincian alasan.' : alasan.first.teks;
}

// ───────────────────────── Model / evaluasi ─────────────────────────
class SkorModel {
  final String nama;
  final String kelompok; // lokal | global
  final double? mae;
  final double? rmse;
  final double? wape;
  final double? mase;
  final double? bias;
  const SkorModel({required this.nama, required this.kelompok, this.mae, this.rmse, this.wape, this.mase, this.bias});

  factory SkorModel.fromJson(Map j) => SkorModel(
        nama: (j['nama'] ?? j['id'] ?? '-').toString(),
        kelompok: (j['kelompok'] ?? '').toString(),
        mae: j['mae'] == null ? null : asDouble(j['mae']),
        rmse: j['rmse'] == null ? null : asDouble(j['rmse']),
        wape: j['wape'] == null ? null : asDouble(j['wape']),
        mase: j['mase'] == null ? null : asDouble(j['mase']),
        bias: j['bias'] == null ? null : asDouble(j['bias']),
      );
}

class InfoModel {
  final int id;
  final String jenis; // forecast | anomali
  final String nama;
  final String versi;
  final bool aktif;
  final DateTime? dilatihPada;
  final DateTime? dataDari;
  final DateTime? dataSampai;
  final Map<String, dynamic> hyperparameter;
  final Map<String, dynamic> metrik;

  const InfoModel({
    required this.id,
    required this.jenis,
    required this.nama,
    required this.versi,
    required this.aktif,
    required this.dilatihPada,
    required this.dataDari,
    required this.dataSampai,
    required this.hyperparameter,
    required this.metrik,
  });

  factory InfoModel.fromRow(Map<String, dynamic> r) => InfoModel(
        id: asInt(r['id']),
        jenis: (r['jenis'] ?? '').toString(),
        nama: (r['nama_model'] ?? '-').toString(),
        versi: (r['versi'] ?? '').toString(),
        aktif: r['aktif'] == true,
        dilatihPada: asDate(r['dilatih_pada']),
        dataDari: asDate(r['data_dari']),
        dataSampai: asDate(r['data_sampai']),
        hyperparameter: Map<String, dynamic>.from((r['hyperparameter'] as Map?) ?? const {}),
        metrik: Map<String, dynamic>.from((r['metrik'] as Map?) ?? const {}),
      );

  /// Perbandingan semua model kandidat pada eksekusi ini (urut dari galat terkecil).
  List<SkorModel> get evaluasi {
    final e = metrik['evaluasi'];
    if (e is! List) return const [];
    final list = e.whereType<Map>().map(SkorModel.fromJson).toList();
    list.sort((a, b) => (a.mase ?? double.infinity).compareTo(b.mase ?? double.infinity));
    return list;
  }

  /// Cakupan interval prediksi (idealnya mendekati 80% untuk kuantil 10-90%).
  double? get cakupanInterval {
    final c = metrik['cakupanInterval'];
    if (c == null) return null;
    if (c is Map) return c.values.isEmpty ? null : asDouble(c.values.first);
    return asDouble(c);
  }

  SkorModel? get terbaik {
    final e = evaluasi;
    return e.isEmpty ? null : e.first;
  }
}
