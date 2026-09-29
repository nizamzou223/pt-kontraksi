// Generator data SINTETIS berbenih — untuk Mode Demo dan pengujian. Data ini BUKAN data perusahaan.
// Port dari admin-web/src/ml/synthetic.js dan syntheticWorkforce.js.
import 'dart:math' as math;

import 'baris_data.dart';
import 'forecast_pipeline.dart';
import 'stats.dart';
import 'timeseries.dart';

const _namaMaterial = [
  ('Semen 50 kg', 'sak'), ('Pasir Cor', 'm³'), ('Besi Beton D13', 'batang'), ('Batu Split 1/2', 'm³'),
  ('Paku 5 cm', 'kg'), ('Cat Tembok Interior', 'pail'), ('Keramik 40x40', 'dus'), ('Kawat Bendrat', 'roll'),
  ('Triplek 12 mm', 'lembar'), ('Kayu Kaso 5/7', 'batang'), ('Bata Merah', 'buah'), ('Besi Beton D10', 'batang'),
  ('Pipa PVC 3"', 'batang'), ('Kabel NYM 3x2.5', 'roll'), ('Lem Keramik', 'kg'), ('Mata Gerinda', 'buah'),
  ('Sarung Tangan Kerja', 'pasang'), ('Sekrup Baja Ringan', 'kotak'), ('Waterproofing', 'pail'), ('Plafon Gypsum', 'lembar'),
  ('Bekisting Multiplek', 'lembar'), ('Genteng Metal', 'lembar'), ('Kusen Aluminium', 'set'), ('Granit 60x60', 'dus'),
];

class DataMaterialSintetis {
  final List<String> weeks;
  final List<double> workers;
  final List<MasukanBarang> items;
  const DataMaterialSintetis(this.weeks, this.workers, this.items);
}

/// Deret pemakaian mingguan material sebuah proyek konstruksi: permintaan mengikuti fase proyek,
/// dipengaruhi jumlah pekerja minggu lalu, dengan empat tipe pola (smooth, erratic, intermittent, lumpy).
DataMaterialSintetis generateMaterialDemand({int items = 18, int weeks = 52, int seed = 7, required String endWeek}) {
  final rand = Mulberry32(seed);
  final weekList = [for (var i = 0; i < weeks; i++) addWeeks(endWeek, i - (weeks - 1))];

  double phase(int t) {
    final up = 1 / (1 + math.exp(-(t - weeks * 0.22) / 3));
    final down = 1 / (1 + math.exp((t - weeks * 0.85) / 2.5));
    return 6 + 34 * up * down;
  }

  double lebaran(int t) => (t == 19 || t == 20) ? 0.15 : 1;
  final workers = [
    for (var t = 0; t < weeks; t++) math.max(0, ((phase(t) + 2 * gaussian(rand)) * lebaran(t)).round()).toDouble()
  ];
  final meanWorkers = workers.fold<double>(0, (s, v) => s + v) / weeks;

  const tipeCycle = ['smooth', 'smooth', 'erratic', 'intermittent', 'intermittent', 'lumpy'];
  final out = <MasukanBarang>[];
  for (var k = 0; k < items; k++) {
    final (nama, satuan) = _namaMaterial[k % _namaMaterial.length];
    final tipe = tipeCycle[k % tipeCycle.length];
    final base = 4 + (rand.next() * 40).floor();
    final values = <double>[];
    for (var t = 0; t < weeks; t++) {
      final ratio = (t > 0 ? workers[t - 1] : workers[0]) / meanWorkers; // pekerja minggu lalu → kebutuhan minggu ini
      double v;
      if (tipe == 'smooth') {
        v = base * ratio * (1 + 0.12 * gaussian(rand));
      } else if (tipe == 'erratic') {
        v = base * ratio * math.exp(0.7 * gaussian(rand));
      } else if (tipe == 'intermittent') {
        v = rand.next() < math.min(0.9, 0.3 * ratio) ? base * 1.5 * (1 + 0.2 * gaussian(rand)) : 0;
      } else {
        v = rand.next() < math.min(0.9, 0.18 * ratio) ? base * 3 * math.exp(0.9 * gaussian(rand)) : 0;
      }
      values.add(math.max(0, v.round()).toDouble());
    }
    final avg = values.fold<double>(0, (s, v) => s + v) / weeks;
    out.add(MasukanBarang(
      id: k + 1,
      nama: items > _namaMaterial.length && k >= _namaMaterial.length ? '$nama (${k ~/ _namaMaterial.length + 1})' : nama,
      kode: 'MAT-${(k + 1).toString().padLeft(3, '0')}',
      satuan: satuan,
      values: values,
      exog: workers,
      stok: (avg * (0.5 + rand.next() * 4)).round().toDouble(),
      stokMinimal: math.max(1, (avg * 0.6).round()).toDouble(),
    ));
  }
  return DataMaterialSintetis(weekList, workers, out);
}

// ───────────────────────── Data kepegawaian berlabel ─────────────────────────
String _hhmm(double h) {
  final t = ((((h % 24) + 24) % 24) * 60).round();
  return '${(t ~/ 60).toString().padLeft(2, '0')}:${(t % 60).toString().padLeft(2, '0')}:00';
}

double _toH(String t) {
  final p = t.split(':');
  return int.parse(p[0]) + int.parse(p[1]) / 60;
}

double _r2(double v) => (v * 100).round() / 100;

class DataKepegawaianSintetis {
  final DataKepegawaian data;
  final Map<String, String> labels; // 'tabel:id' → tipe anomali yang disuntikkan
  const DataKepegawaianSintetis(this.data, this.labels);
}

List<T> _acak<T>(List<T> a, Mulberry32 rand) {
  final b = [...a];
  for (var i = b.length - 1; i > 0; i--) {
    final j = rand.nextInt(i + 1);
    final t = b[i];
    b[i] = b[j];
    b[j] = t;
  }
  return b;
}

/// difficulty: 'mudah' = anomali mencolok; 'sulit' = ada variasi SAH yang menyerupai anomali
/// (hari panjang, lembur 4–5 jam, datang pagi untuk pengecoran) dan anomali disuntik lebih halus.
DataKepegawaianSintetis generateWorkforce({
  int employees = 30,
  int days = 60,
  int seed = 21,
  double anomalyRate = 0.04,
  required String startDate,
  String difficulty = 'mudah',
  int projectId = 1,
}) {
  final sulit = difficulty == 'sulit';
  final rand = Mulberry32(seed);
  T pick<T>(List<T> a) => a[(rand.next() * a.length).floor()];
  double between(double lo, double hi) => lo + rand.next() * (hi - lo);

  const jabatanGaji = [150000.0, 120000.0, 200000.0, 300000.0];
  final karyawan = <KaryawanRow>[
    for (var i = 0; i < employees; i++)
      KaryawanRow(
        id: i + 1,
        nama: 'Karyawan ${(i + 1).toString().padLeft(2, '0')}',
        jabatanId: i % 4 + 1,
        gajiHarian: jabatanGaji[i % 4],
        statusAktif: i != employees - 1, // satu karyawan nonaktif (dipakai untuk injeksi)
        tanggalBergabung: '2026-01-05',
      )
  ];
  final endDate = addDays(startDate, days - 1);

  final presensi = <PresensiRow>[];
  final lembur = <LemburRow>[];
  final kasbon = <KasbonRow>[];
  var pid = 1, lid = 1, kid = 1;
  for (final k in karyawan.where((x) => x.statusAktif == true)) {
    for (var d = 0; d < days; d++) {
      final tgl = addDays(startDate, d);
      final hari = DateTime.parse('${tgl}T00:00:00Z').weekday;
      if (hari == DateTime.sunday || rand.next() > 0.92) continue; // Minggu libur; 8% tidak hadir
      final masuk = 7.5 + 0.2 * gaussian(rand);
      final durasi = math.max(7.0, 8.6 + 0.35 * gaussian(rand));
      final manual = rand.next() < 0.15;
      presensi.add(PresensiRow(
        id: pid++,
        projectId: projectId,
        karyawanId: k.id,
        tanggal: tgl,
        jamMasuk: _hhmm(masuk),
        jamKeluar: _hhmm(masuk + durasi),
        durasiJam: _r2(durasi),
        statusKehadiran: 'hadir',
        metodeInput: manual ? 'manual' : 'qr_code',
      ));
      if (rand.next() < 0.1) {
        final dl = pick(const [1.0, 1.5, 2.0, 2.5, 3.0]);
        final tarif = (k.gajiHarian / 8 * 1.5).round().toDouble();
        lembur.add(LemburRow(
          id: lid++,
          projectId: projectId,
          karyawanId: k.id,
          tanggal: tgl,
          jamMulai: _hhmm(masuk + durasi),
          jamSelesai: _hhmm(masuk + durasi + dl),
          durasiJam: dl,
          tarifLembur: tarif,
          totalLembur: dl * tarif,
          statusPersetujuan: 'disetujui',
          catatan: 'Lembur manual',
        ));
      }
    }
    final nK = rand.next() < 0.5 ? 1 : (rand.next() < 0.5 ? 0 : 2);
    for (var i = 0; i < nK; i++) {
      final jumlah = (k.gajiHarian * between(3, 12) / 10000).round() * 10000.0;
      final sisa = (jumlah * between(0.3, 1) / 10000).round() * 10000.0;
      kasbon.add(KasbonRow(
        id: kid++,
        projectId: projectId,
        karyawanId: k.id,
        jumlahKasbon: jumlah,
        sisaKasbon: sisa,
        tanggalKasbon: addDays(startDate, (rand.next() * days).floor()),
        statusLunas: false,
      ));
    }
  }

  // Variasi SAH yang menyerupai anomali (bukan anomali; tidak diberi label)
  if (sulit) {
    for (var i = 0; i < presensi.length; i++) {
      final p = presensi[i];
      final r = rand.next();
      if (r < 0.03) {
        final d = between(10, 11.5);
        presensi[i] = p.salin(jamKeluar: _hhmm(_toH(p.jamMasuk!) + d), durasiJam: _r2(d));
      } else if (r < 0.05) {
        final m = between(5.5, 6.5);
        presensi[i] = p.salin(jamMasuk: _hhmm(m), jamKeluar: _hhmm(m + p.durasiJam!));
      }
    }
    for (var i = 0; i < lembur.length; i++) {
      if (rand.next() < 0.08) {
        final l = lembur[i];
        final d = pick(const [4.5, 5.0]);
        lembur[i] = l.salin(durasiJam: d, totalLembur: d * l.tarifLembur!, jamSelesai: _hhmm(_toH(l.jamMulai!) + d));
      }
    }
  }

  // Injeksi anomali berlabel
  final labels = <String, String>{};
  void mark(String tabel, int id, String tipe) => labels['$tabel:$id'] = tipe;

  final nP = math.max(10, (presensi.length * anomalyRate).round());
  const tipeP = ['durasi_ekstrem', 'keluar_sebelum_masuk', 'jam_masuk_aneh', 'durasi_tak_konsisten', 'durasi_singkat'];
  final idxP = _acak(List<int>.generate(presensi.length, (i) => i), rand).take(nP).toList();
  for (var n = 0; n < idxP.length; n++) {
    final i = idxP[n];
    final p = presensi[i];
    final tipe = tipeP[n % tipeP.length];
    final masuk = _toH(p.jamMasuk!);
    if (tipe == 'durasi_ekstrem') {
      final m = between(5, 6), d = sulit ? between(16.2, 17) : between(16.5, 18);
      presensi[i] = p.salin(jamMasuk: _hhmm(m), jamKeluar: _hhmm(m + d), durasiJam: _r2(d));
    } else if (tipe == 'keluar_sebelum_masuk') {
      presensi[i] = p.salin(jamMasuk: p.jamKeluar, jamKeluar: _hhmm(masuk));
    } else if (tipe == 'jam_masuk_aneh') {
      final m = sulit ? between(3.2, 4.6) : between(2, 4.5);
      presensi[i] = p.salin(jamMasuk: _hhmm(m), jamKeluar: _hhmm(m + p.durasiJam!));
    } else if (tipe == 'durasi_tak_konsisten') {
      presensi[i] = p.salin(jamKeluar: _hhmm(masuk + 3));
    } else {
      final d = sulit ? between(5.5, 6.6) : between(4.5, 5.5);
      presensi[i] = p.salin(jamKeluar: _hhmm(masuk + d), durasiJam: _r2(d));
    }
    mark('presensi', p.id, tipe);
  }

  final nonaktif = karyawan[employees - 1];
  for (var i = 0; i < 3; i++) {
    final row = PresensiRow(
      id: pid++,
      projectId: projectId,
      karyawanId: nonaktif.id,
      tanggal: addDays(startDate, 10 + i * 5),
      jamMasuk: _hhmm(7.5),
      jamKeluar: _hhmm(16.1),
      durasiJam: 8.6,
      statusKehadiran: 'hadir',
      metodeInput: 'manual',
    );
    presensi.add(row);
    mark('presensi', row.id, 'karyawan_nonaktif');
  }

  final nL = math.max(6, (lembur.length * 0.12).round());
  const tipeL = ['tanpa_presensi', 'lembur_ekstrem', 'total_salah', 'lembur_5jam'];
  final idxL = _acak(List<int>.generate(lembur.length, (i) => i), rand).take(nL).toList();
  for (var n = 0; n < idxL.length; n++) {
    final i = idxL[n];
    final l = lembur[i];
    final tipe = tipeL[n % tipeL.length];
    if (tipe == 'tanpa_presensi') {
      final idx = presensi.indexWhere((p) => p.karyawanId == l.karyawanId && p.tanggal == l.tanggal && !labels.containsKey('presensi:${p.id}'));
      if (idx >= 0) presensi.removeAt(idx);
    } else if (tipe == 'lembur_ekstrem') {
      final d = sulit ? pick(const [8.5, 9.0]) : pick(const [8.5, 9.0, 10.0, 11.0]);
      lembur[i] = l.salin(durasiJam: d, totalLembur: d * l.tarifLembur!, jamSelesai: _hhmm(_toH(l.jamMulai!) + d));
    } else if (tipe == 'total_salah') {
      lembur[i] = l.salin(totalLembur: (l.totalLembur! * 1.5).roundToDouble());
    } else {
      lembur[i] = l.salin(durasiJam: 5, totalLembur: 5 * l.tarifLembur!);
    }
    mark('lembur', l.id, tipe);
  }

  final nKb = math.max(4, (kasbon.length * 0.15).round());
  final idxK = _acak(List<int>.generate(kasbon.length, (i) => i), rand).take(nKb).toList();
  for (var n = 0; n < idxK.length; n++) {
    final i = idxK[n];
    final b = kasbon[i];
    final gh = karyawan.firstWhere((k) => k.id == b.karyawanId).gajiHarian;
    if (n % 2 == 0) {
      final j = (gh * (sulit ? between(30, 45) : between(60, 90)) / 10000).round() * 10000.0;
      kasbon[i] = b.salin(jumlahKasbon: j, sisaKasbon: j);
      mark('kasbon', b.id, 'kasbon_besar');
    } else {
      kasbon[i] = b.salin(sisaKasbon: b.jumlahKasbon + 500000);
      mark('kasbon', b.id, 'sisa_salah');
    }
  }

  return DataKepegawaianSintetis(
    DataKepegawaian(karyawan: karyawan, presensi: presensi, lembur: lembur, kasbon: kasbon, gaji: const [], today: endDate, dari: startDate, sampai: endDate),
    labels,
  );
}
