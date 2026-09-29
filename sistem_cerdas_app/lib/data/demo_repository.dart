import 'dart:math';

import '../ml/akurasi.dart';
import '../ml/anomaly_detector.dart';
import '../ml/baris_data.dart';
import '../ml/data_sintetis.dart';
import '../ml/forecast_pipeline.dart';
import '../ml/timeseries.dart';
import '../models/models.dart';
import 'adapters.dart';
import 'ai_repository.dart';

/// Data contoh (sintetis, deterministik) agar aplikasi dapat dicoba dan didemokan tanpa login/database.
/// Nilai metrik model diambil dari eksperimen pada data sintetis (admin-web/ml-experiments/hasil).
class DemoAiRepository implements AiRepository {
  DemoAiRepository() {
    _bangun();
  }

  final _proyek = const [Proyek(1, 'Gedung Serbaguna Cilegon'), Proyek(2, 'Jembatan Anyer')];
  final Map<int, HasilRamalan> _ramalan = {};
  final Map<String, List<TitikRiwayat>> _riwayat = {};
  late List<Anomali> _anomali;
  InfoModel? _modelForecast; // diisi bila analisis dijalankan & disimpan pada sesi demo ini

  @override
  bool get isDemo => true;

  static const _katalog = <(String, String, String, double)>[
    ('Semen Portland 50kg', 'SMN-001', 'zak', 60),
    ('Besi Beton Ulir D13', 'BSI-013', 'btg', 90),
    ('Besi Beton Polos D8', 'BSI-008', 'btg', 70),
    ('Pasir Beton', 'PSR-001', 'm3', 14),
    ('Batu Split 1/2', 'BTU-002', 'm3', 10),
    ('Bata Ringan 10cm', 'BTA-010', 'bh', 400),
    ('Kawat Bendrat', 'KWT-001', 'kg', 25),
    ('Paku 5 cm', 'PKU-005', 'kg', 12),
    ('Multiplek 12mm', 'MLP-012', 'lbr', 30),
    ('Cat Tembok 25kg', 'CAT-025', 'pail', 8),
    ('Pipa PVC 3"', 'PVC-003', 'btg', 20),
    ('Kabel NYM 2x2.5', 'KBL-025', 'roll', 5),
  ];

  void _bangun() {
    final hariIni = senin(DateTime.now());
    for (final p in _proyek) {
      final rnd = Random(p.id * 97);
      final items = <BarangRamalan>[];
      for (var i = 0; i < _katalog.length; i++) {
        final (nama, kode, satuan, dasar) = _katalog[i];
        final skala = dasar * (0.7 + rnd.nextDouble() * 0.6);
        final riwayat = <TitikRiwayat>[
          for (var w = 12; w >= 1; w--)
            TitikRiwayat(
              hariIni.subtract(Duration(days: 7 * w)),
              max(0, skala * (1 + 0.25 * sin((12 - w) / 2.2 + i)) + (rnd.nextDouble() - 0.5) * skala * 0.3),
            ),
        ];
        _riwayat['${p.id}|${i + 1}'] = riwayat;

        final rata = riwayat.skip(8).fold(0.0, (s, e) => s + e.nilai) / 4;
        final ramalan = <TitikRamalan>[
          for (var h = 1; h <= 4; h++)
            () {
              final y = rata * (1 + 0.05 * h) * (0.95 + rnd.nextDouble() * 0.1);
              return TitikRamalan(
                minggu: hariIni.add(Duration(days: 7 * (h - 1))),
                horizon: h,
                yhat: y,
                bawah: y * (0.72 - 0.02 * h),
                atas: y * (1.28 + 0.03 * h),
              );
            }(),
        ];
        final total = ramalan.fold(0.0, (s, e) => s + e.yhat);
        final pengaman = rata * 0.6;
        final rop = rata * 2 + pengaman;

        // Sebar stok agar keempat tingkat risiko muncul.
        final faktor = const [0.0, 0.8, 1.4, 6.5, 0.5, 7.5, 3.6, 4.2, 0.9, 8.0, 1.8, 6.0][i];
        final stok = (rata * faktor).roundToDouble();
        Risiko risiko;
        final alasan = <String>[];
        final u = ' $satuan';
        String f(double v) => v.round().toString();
        if (stok <= 0) {
          risiko = Risiko.habis;
          alasan.add('Stok saat ini sudah habis sementara kebutuhan masih diperkirakan ada.');
        } else if (stok <= rop) {
          risiko = Risiko.kritis;
          alasan.add('Stok ${f(stok)}$u ≤ titik pemesanan ulang ${f(rop)}$u (kebutuhan 2 minggu waktu tunggu ${f(rata * 2)}$u + stok pengaman ${f(pengaman)}$u).');
        } else if (stok < total + pengaman) {
          risiko = Risiko.waspada;
          alasan.add('Stok ${f(stok)}$u tidak cukup untuk 4 minggu ke depan (perkiraan ${f(total)}$u + pengaman ${f(pengaman)}$u).');
        } else {
          risiko = Risiko.aman;
          alasan.add('Stok ${f(stok)}$u mencukupi kebutuhan 4 minggu (perkiraan ${f(total)}$u).');
        }
        DateTime? habis;
        if (risiko != Risiko.aman && rata > 0) {
          habis = hariIni.add(Duration(days: (7 * stok / rata).floor()));
          alasan.add('Stok diperkirakan habis pada minggu ${_tglIso(senin(habis))}.');
        }
        final pesan = risiko == Risiko.aman ? 0.0 : (total + pengaman - stok).clamp(0, double.infinity).ceilToDouble();
        if (pesan > 0) alasan.add('Disarankan memesan ±${f(pesan)}$u.');

        items.add(BarangRamalan(
          barangId: i + 1,
          nama: nama,
          kode: kode,
          satuan: satuan,
          stok: stok,
          stokMinimal: (rata * 0.5).roundToDouble(),
          titikPemesananUlang: rop,
          stokPengaman: pengaman,
          jumlahDisarankan: pesan,
          perkiraanHabis: habis,
          risiko: risiko,
          alasan: alasan,
          modelNama: 'Gradient Boosting global + tenaga kerja',
          mase: 0.7 + rnd.nextDouble() * 0.5,
          ramalan: ramalan,
        ));
      }
      items.sort((a, b) {
        final c = a.risiko.index.compareTo(b.risiko.index);
        return c != 0 ? c : b.jumlahDisarankan.compareTo(a.jumlahDisarankan);
      });
      _ramalan[p.id] = HasilRamalan(hariIni, items);
    }

    final t = DateTime.now();
    DateTime hari(int mundur) => DateTime(t.year, t.month, t.day).subtract(Duration(days: mundur));
    AlasanAnomali a(String kode, Tingkat tk, String teks, String metode) =>
        AlasanAnomali(kode: kode, tingkat: tk, teks: teks, metode: metode);
    var n = 0;
    Anomali an(String tabel, String? kar, int proyek, int mundur, double skor, Tingkat tk, List<AlasanAnomali> al,
            {StatusTinjauan st = StatusTinjauan.baru, String? catatan}) =>
        Anomali(
          id: ++n,
          sumberTabel: tabel,
          sumberId: 900000 + n,
          karyawan: kar,
          proyek: _proyek[proyek - 1].nama,
          tanggal: hari(mundur),
          skor: skor,
          tingkat: tk,
          alasan: al,
          metode: {for (final x in al) if (x.metode != null) x.metode!}.toList(),
          status: st,
          catatan: catatan,
          ditinjauPada: st == StatusTinjauan.baru ? null : hari(max(0, mundur - 1)),
        );

    _anomali = [
      an('presensi', 'Slamet Riyadi', 1, 1, 0.97, Tingkat.tinggi, [
        a('KELUAR_SEBELUM_MASUK', Tingkat.tinggi, 'Jam keluar (07:10) lebih awal dari jam masuk (16:45).', 'aturan bisnis'),
        a('IFOREST', Tingkat.sedang, 'Kombinasi nilai tidak lazim dibanding data lain (skor Isolation Forest 0,71).', 'isolation forest'),
      ]),
      an('lembur', 'Agus Setiawan', 1, 2, 0.94, Tingkat.tinggi, [
        a('LEMBUR_TANPA_PRESENSI', Tingkat.tinggi, 'Lembur 5 jam pada hari yang sama tanpa presensi hadir.', 'aturan bisnis'),
        a('LEMBUR_HARIAN_EKSTREM', Tingkat.tinggi, 'Lembur 9 jam dalam sehari (batas regulasi 4 jam).', 'aturan bisnis'),
      ]),
      an('kasbon', 'Dedi Kurniawan', 2, 3, 0.91, Tingkat.tinggi, [
        a('STAT_KASBON', Tingkat.sedang, 'Nilai kasbon (31 hari gaji) jauh di atas kasbon karyawan lain (median 4 hari gaji), z = +6,2.', 'statistik'),
        a('KASBON_BESAR', Tingkat.tinggi, 'Kasbon Rp 4.200.000 melebihi batas wajar 26 hari gaji.', 'aturan bisnis'),
      ]),
      an('presensi', 'Rudi Hartono', 1, 3, 0.86, Tingkat.tinggi, [
        a('DURASI_EKSTREM', Tingkat.tinggi, 'Durasi kerja 19 jam dalam sehari (batas wajar 16 jam).', 'aturan bisnis'),
      ]),
      an('rekap_gaji_mingguan', 'Bambang Susilo', 2, 4, 0.78, Tingkat.tinggi, [
        a('STAT_GAJI', Tingkat.sedang, 'Gaji kotor Rp 3.850.000 menyimpang dari rekan sejabatan pada minggu yang sama (median Rp 1.750.000), z = +5,4.', 'statistik'),
        a('IFOREST', Tingkat.sedang, 'Kombinasi nilai tidak lazim dibanding data lain (skor Isolation Forest 0,66).', 'isolation forest'),
      ]),
      an('presensi', 'Yanto Prasetyo', 1, 5, 0.66, Tingkat.sedang, [
        a('PRESENSI_KARYAWAN_NONAKTIF', Tingkat.sedang, 'Presensi dicatat untuk karyawan berstatus NONAKTIF (Yanto Prasetyo).', 'aturan bisnis'),
      ]),
      an('lembur', 'Joko Widodo', 2, 5, 0.63, Tingkat.sedang, [
        a('LEMBUR_MINGGUAN', Tingkat.sedang, 'Total lembur 23 jam dalam seminggu (batas regulasi 18 jam).', 'aturan bisnis'),
      ]),
      an('presensi', 'Tono Sugiarto', 2, 6, 0.61, Tingkat.sedang, [
        a('DURASI_TIDAK_KONSISTEN', Tingkat.sedang, 'Durasi tercatat 8 jam, tetapi selisih jam masuk–keluar 5,5 jam.', 'aturan bisnis'),
      ]),
      an('kasbon', 'Eko Prabowo', 1, 7, 0.58, Tingkat.sedang, [
        a('KASBON_BERULANG', Tingkat.sedang, '3 kali kasbon dalam 14 hari.', 'aturan bisnis'),
      ]),
      an('presensi', 'Wahyu Hidayat', 1, 8, 0.52, Tingkat.sedang, [
        a('STAT_JAM_MASUK', Tingkat.sedang, 'Jam masuk 11:20 tidak lazim dibanding kebiasaannya (07:05), z = +4,8.', 'statistik'),
      ]),
      an('presensi', 'Hendra Gunawan', 2, 9, 0.41, Tingkat.rendah, [
        a('POLA_JAM_IDENTIK', Tingkat.rendah, 'Jam manual 08:00–17:00 identik pada 14 hari (kemungkinan jam tidak nyata).', 'aturan bisnis'),
      ]),
      an('lembur', 'Slamet Riyadi', 1, 10, 0.38, Tingkat.rendah, [
        a('STAT_LEMBUR', Tingkat.sedang, 'Lembur 3,5 jam jauh di atas kebiasaan (1 jam), z = +3,9.', 'statistik'),
      ]),
      an('presensi', 'Agus Setiawan', 1, 14, 0.9, Tingkat.tinggi, [
        a('PRESENSI_SEBELUM_BERGABUNG', Tingkat.tinggi, 'Tanggal presensi lebih awal dari tanggal bergabung.', 'aturan bisnis'),
      ], st: StatusTinjauan.valid, catatan: 'Sudah dikonfirmasi ke mandor, data salah input.'),
      an('lembur', 'Rudi Hartono', 2, 16, 0.7, Tingkat.sedang, [
        a('LEMBUR_HARIAN', Tingkat.sedang, 'Lembur 4,5 jam melebihi batas 4 jam/hari.', 'aturan bisnis'),
      ], st: StatusTinjauan.bukanAnomali, catatan: 'Ada surat perintah lembur proyek khusus.'),
      an('kasbon', 'Dedi Kurniawan', 2, 18, 0.62, Tingkat.sedang, [
        a('STAT_KASBON', Tingkat.sedang, 'Nilai kasbon jauh di atas kasbon karyawan lain, z = +3,7.', 'statistik'),
      ], st: StatusTinjauan.bukanAnomali),
      an('presensi', 'Bambang Susilo', 1, 20, 0.55, Tingkat.sedang, [
        a('DURASI_TIDAK_KONSISTEN', Tingkat.sedang, 'Durasi tercatat 9 jam, selisih jam masuk–keluar 7 jam.', 'aturan bisnis'),
      ], st: StatusTinjauan.valid),
      an('presensi', 'Tono Sugiarto', 2, 22, 0.44, Tingkat.rendah, [
        a('IFOREST', Tingkat.sedang, 'Kombinasi nilai tidak lazim dibanding data lain (skor Isolation Forest 0,58).', 'isolation forest'),
      ], st: StatusTinjauan.diabaikan),
    ]..sort((x, y) => y.skor.compareTo(x.skor));
  }

  static String _tglIso(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Future<T> _tunda<T>(T v) async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    return v;
  }

  @override
  Future<List<Proyek>> daftarProyek() => _tunda(_proyek);

  @override
  Future<HasilRamalan?> ramalanTerbaru(int projectId) => _tunda(_ramalan[projectId]);

  @override
  Future<List<TitikRiwayat>> riwayatPemakaian(int projectId, int barangId, {int minggu = 12}) =>
      _tunda(_riwayat['$projectId|$barangId'] ?? const []);

  @override
  Future<List<Anomali>> daftarAnomali() => _tunda(List.of(_anomali));

  @override
  Future<Anomali> tinjauAnomali(Anomali a, StatusTinjauan status, String? catatan, {int? userId}) async {
    final bersih = (catatan ?? '').trim();
    final baru = a.copyWith(
      status: status,
      catatan: bersih.isEmpty ? null : bersih,
      hapusCatatan: bersih.isEmpty,
      hapusTinjauan: status == StatusTinjauan.baru,
      ditinjauPada: status == StatusTinjauan.baru ? null : DateTime.now(),
    );
    final i = _anomali.indexWhere((x) => x.id == a.id);
    if (i >= 0) _anomali[i] = baru;
    return _tunda(baru);
  }

  @override
  Future<List<InfoModel>> daftarModel() {
    SkorModel s(String nama, String k, double mase, double rmse, double wape, double bias) =>
        SkorModel(nama: nama, kelompok: k, mase: mase, rmse: rmse, wape: wape, bias: bias);
    final skor = [
      s('Gradient Boosting global + tenaga kerja', 'global', 0.887, 21.12, 0.864, 1.43),
      s('Naive (nilai terakhir)', 'lokal', 1.143, 28.25, 1.051, 5.30),
      s('Exponential Smoothing (SES)', 'lokal', 1.200, 21.10, 1.103, 7.87),
      s('Rata-rata bergerak 4 minggu', 'lokal', 1.277, 22.09, 1.099, 6.86),
      s('Random Forest lag-4 (metode lama)', 'lokal', 1.340, 23.59, 1.169, 8.43),
      s('Croston-SBA', 'lokal', 1.348, 21.35, 1.106, 7.23),
      s('Croston', 'lokal', 1.456, 22.06, 1.169, 8.37),
      s('Gradient Boosting global', 'global', 1.482, 26.61, 1.285, 10.41),
      s('Random Forest global', 'global', 1.499, 24.65, 1.267, 10.32),
      s('TSB', 'lokal', 1.528, 24.06, 1.293, 10.79),
    ];
    final hariIni = DateTime.now();
    final daftar = [
      InfoModel(
        id: 1,
        jenis: 'forecast',
        nama: skor.first.nama,
        versi: _tglIso(hariIni),
        aktif: true,
        dilatihPada: hariIni,
        dataDari: hariIni.subtract(const Duration(days: 364)),
        dataSampai: hariIni,
        hyperparameter: const {'horizon': 4, 'waktu_tunggu_minggu': 2},
        metrik: {
          'evaluasi': [
            for (final m in skor)
              {'nama': m.nama, 'kelompok': m.kelompok, 'mase': m.mase, 'rmse': m.rmse, 'wape': m.wape, 'bias': m.bias}
          ],
          'cakupanInterval': 0.78,
        },
      ),
      InfoModel(
        id: 2,
        jenis: 'anomali',
        nama: 'Hibrida (aturan bisnis + statistik robust + Isolation Forest)',
        versi: _tglIso(hariIni),
        aktif: true,
        dilatihPada: hariIni,
        dataDari: hariIni.subtract(const Duration(days: 30)),
        dataSampai: hariIni,
        hyperparameter: const {'ambang_skor': 0.5},
        metrik: const {},
      ),
    ];
    if (_modelForecast != null) daftar[0] = _modelForecast!;
    return _tunda(daftar);
  }

  // ───────────────────────── Menjalankan analisis pada data sintetis ─────────────────────────
  @override
  Future<DataMaterial> muatDataMaterial(int projectId, {int minggu = 52}) {
    final akhir = addWeeks(weekStart(isoDate(DateTime.now())), -1);
    final g = generateMaterialDemand(items: 18, weeks: minggu, seed: 7 + projectId, endWeek: akhir);
    return _tunda(DataMaterial(g.weeks, g.items, exogTersedia: true));
  }

  @override
  Future<DataKepegawaian> muatDataKepegawaian({int? projectId, required int hari}) {
    const riwayat = 60;
    final hariIni = isoDate(DateTime.now());
    final g = generateWorkforce(days: hari + riwayat, startDate: addDays(hariIni, -(hari + riwayat - 1)), difficulty: 'sulit', seed: 21);
    final d = g.data;
    return _tunda(DataKepegawaian(
      karyawan: d.karyawan,
      presensi: d.presensi,
      lembur: d.lembur,
      kasbon: d.kasbon,
      gaji: d.gaji,
      today: hariIni,
      dari: addDays(hariIni, -(hari - 1)),
      sampai: hariIni,
    ));
  }

  @override
  Future<Set<String>> kunciDitinjau() async => {
        for (final a in _anomali)
          if (a.status == StatusTinjauan.bukanAnomali || a.status == StatusTinjauan.diabaikan) '${a.sumberTabel}:${a.sumberId}',
      };

  @override
  Future<String> simpanRamalan(HasilPrediksi hasil, int projectId) async {
    final dibuat = DateTime.now();
    _ramalan[projectId] = hasilRamalanDari(hasil, dibuat);
    _modelForecast = infoModelDari(hasil, dibuat, id: 100);
    return _tunda('Tersimpan (demo): ${hasil.items.length} barang beserta rekomendasinya.');
  }

  @override
  Future<String> simpanAnomali(List<ItemAnomali> items, {int? projectIdDefault}) async {
    if (items.isEmpty) return 'Tidak ada anomali untuk disimpan.';
    final ada = {for (final a in _anomali) '${a.sumberTabel}:${a.sumberId}': a};
    var maks = _anomali.fold<int>(0, (m, a) => max(m, a.id));
    var baru = 0, diperbarui = 0, dilewati = 0;
    for (final i in items) {
      final lama = ada[i.key];
      if (lama != null && lama.status != StatusTinjauan.baru) {
        dilewati++;
        continue;
      }
      final pid = i.projectId ?? projectIdDefault ?? 1;
      final nama = _proyek.firstWhere((p) => p.id == pid, orElse: () => _proyek.first).nama;
      final a = anomaliDari(i, id: lama?.id ?? ++maks, proyekNama: nama);
      if (lama != null) {
        _anomali[_anomali.indexWhere((x) => x.id == lama.id)] = a;
        diperbarui++;
      } else {
        _anomali.add(a);
        baru++;
      }
    }
    _anomali.sort((x, y) => y.skor.compareTo(x.skor));
    return _tunda('Tersimpan (demo): $baru penanda baru, $diperbarui diperbarui, $dilewati dilewati (sudah ditinjau).');
  }

  @override
  Future<AkurasiRamalan> akurasiRamalan(int projectId) => _tunda(const AkurasiRamalan(
        [],
        StatusDrift('belum_cukup', 'Mode demo: pemantauan akurasi memerlukan riwayat ramalan yang tersimpan selama beberapa minggu, lalu dibandingkan dengan pemakaian nyata.'),
      ));
}
