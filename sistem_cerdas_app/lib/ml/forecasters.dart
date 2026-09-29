// Kumpulan model peramalan kebutuhan material. Port dari admin-web/src/ml/forecasters.js.
//
// Model lokal  : dilatih per barang (baseline statistik, Croston/SBA/TSB).
// Model global : satu model untuk SEMUA barang (dinormalisasi per barang) → memanfaatkan data bersama
//                sehingga tidak kekurangan sampel pada barang yang datanya pendek.
//
// Catatan: pembanding "Random Forest lag-4 (metode lama)" pada web memakai pustaka pihak ketiga
// (ml-random-forest) dan tidak disertakan di aplikasi mobile.
import 'dart:math' as math;

import 'stats.dart';
import 'trees.dart';

class TrainItem {
  final int id;
  final List<double> train; // pemakaian mingguan sampai titik asal
  final List<double>? exog; // tenaga kerja aktif per minggu (opsional)
  const TrainItem(this.id, this.train, [this.exog]);
}

abstract class ForecastModel {
  String get id;
  String get nama;
  String get kelompok; // lokal | global
  Map<int, List<double>> fitPredict(List<TrainItem> items, int horizon);
}

List<double> _nonNeg(List<double> a) => [for (final v in a) v.isFinite ? math.max(0.0, v) : 0.0];
List<double> _flat(double v, int h) => List<double>.filled(h, v);

// ───────────────────────── Model statistik (peramal lokal) ─────────────────────────
List<double> naive(List<double> train, int h) => _flat(train.isEmpty ? 0 : train.last, h);

List<double> Function(List<double>, int) movingAverage(int k) =>
    (train, h) => _flat(mean(train.length > k ? train.sublist(train.length - k) : train), h);

/// Simple Exponential Smoothing; alpha dipilih dari grid dengan meminimalkan SSE satu langkah.
List<double> ses(List<double> train, int h) {
  if (train.isEmpty) return _flat(0, h);
  final init = mean(train.sublist(0, math.min(4, train.length)));
  var bestSse = double.infinity, bestLevel = init;
  // Grid alpha 0,05..0,95 (sama dengan versi web: a += 0,05 selama a <= 0,951)
  for (var a = 0.05; a <= 0.951; a += 0.05) {
    var level = init, sse = 0.0;
    for (final y in train) {
      sse += (y - level) * (y - level);
      level = a * y + (1 - a) * level;
    }
    if (sse < bestSse) {
      bestSse = sse;
      bestLevel = level;
    }
  }
  return _flat(bestLevel, h);
}

/// Croston (1972) untuk permintaan intermiten: ramalan = ukuran permintaan / interval permintaan.
List<double> Function(List<double>, int) croston({double alpha = 0.1, bool sba = false}) => (train, h) {
      double? z, p;
      var q = 1;
      for (final y in train) {
        if (y > 0) {
          if (z == null) {
            z = y;
            p = q.toDouble();
          } else {
            z = alpha * y + (1 - alpha) * z;
            p = alpha * q + (1 - alpha) * p!;
          }
          q = 1;
        } else {
          q++;
        }
      }
      if (z == null) return _flat(0, h);
      final f = z / p!;
      return _flat(sba ? f * (1 - alpha / 2) : f, h);
    };

/// TSB (Teunter–Syntetos–Babai 2011): probabilitas permintaan diperbarui SETIAP periode.
List<double> Function(List<double>, int) tsb({double alpha = 0.1, double beta = 0.1}) => (train, h) {
      final nz = train.where((v) => v > 0).toList();
      if (nz.isEmpty) return _flat(0, h);
      var z = nz.first;
      var p = nz.length / train.length;
      for (final y in train) {
        p = p + beta * ((y > 0 ? 1 : 0) - p);
        if (y > 0) z = alpha * y + (1 - alpha) * z;
      }
      return _flat(p * z, h);
    };

// ───────────────────────── Model global (RF / Gradient Boosting) ─────────────────────────
const _lags = 4;
const _sinceCap = 12;

/// Fitur satu titik prediksi dari riwayat `hist` (skala asli), dinormalisasi oleh skala barang `s`.
List<double> featureRow(List<double> hist, double s, double? exogLag, double exogScale) {
  final n = hist.length;
  double at(int k) => n - k >= 0 ? hist[n - k] : 0;
  final row = <double>[];
  for (var k = 1; k <= _lags; k++) {
    row.add(at(k) / s);
  }
  final last4 = hist.length > 4 ? hist.sublist(n - 4) : hist;
  final last8 = hist.length > 8 ? hist.sublist(n - 8) : hist;
  row.add(mean(last4) / s);
  row.add(mean(last8) / s);
  var since = 0;
  for (var i = n - 1; i >= 0 && hist[i] == 0 && since < _sinceCap; i--) {
    since++;
  }
  row.add(since / _sinceCap);
  row.add(last8.isNotEmpty ? last8.where((v) => v > 0).length / last8.length : 0);
  if (exogLag != null) row.add(exogLag / (exogScale == 0 ? 1 : exogScale));
  row.add(math.log(1 + s));
  return row;
}

double _itemScale(List<double> train) => math.max(mean(train), 1e-6);

enum Pembelajar { rf, gbm }

class GlobalModel implements ForecastModel {
  @override
  final String id;
  @override
  final String nama;
  final Pembelajar learner;
  final bool useExog;
  final int maxWeeks;

  GlobalModel({required this.id, required this.nama, this.learner = Pembelajar.gbm, this.useExog = false, this.maxWeeks = 104});

  @override
  String get kelompok => 'global';

  @override
  Map<int, List<double>> fitPredict(List<TrainItem> items, int horizon) {
    final x = <List<double>>[];
    final y = <double>[];
    final meta = <int, ({double s, double es, double? exogLast})>{};
    List<T> tail<T>(List<T> a) => a.length > maxWeeks ? a.sublist(a.length - maxWeeks) : a;
    for (final it in items) {
      final train = tail(it.train);
      final exog = useExog && it.exog != null ? tail(it.exog!) : null;
      final s = _itemScale(train);
      final es = exog != null ? math.max(mean(exog), 1e-6) : 1.0;
      meta[it.id] = (s: s, es: es, exogLast: exog?.last);
      if (mean(train) == 0) continue; // tak pernah dipakai → tidak ada informasi belajar
      for (var t = _lags; t < train.length; t++) {
        x.add(featureRow(train.sublist(0, t), s, exog?[t - 1], es));
        y.add(train[t] / s);
      }
    }

    double Function(List<double>) predictRow;
    if (x.length < 12) {
      final m = mean(y);
      predictRow = (_) => m;
    } else if (learner == Pembelajar.rf) {
      final rf = RandomForest(nEstimators: 60, maxDepth: 8, minLeaf: 3, maxFeatures: 0.8, seed: 42).fit(x, y);
      predictRow = rf.predictOne;
    } else {
      final gb = GradientBoosting(nEstimators: 80, learningRate: 0.1, maxDepth: 3, minLeaf: 5, subsample: 0.8, seed: 42).fit(x, y);
      predictRow = gb.predictOne;
    }

    final out = <int, List<double>>{};
    for (final it in items) {
      final m = meta[it.id]!;
      final hist = [...tail(it.train)];
      if (mean(hist) == 0) {
        out[it.id] = _flat(0, horizon);
        continue;
      }
      final preds = <double>[];
      for (var k = 0; k < horizon; k++) {
        final row = featureRow(hist, m.s, m.exogLast, m.es);
        final v = math.max(0.0, predictRow(row) * m.s);
        preds.add(v);
        hist.add(v); // rekursif: ramalan dipakai sebagai lag berikutnya
      }
      out[it.id] = _nonNeg(preds);
    }
    return out;
  }
}

/// Membungkus fungsi per-barang menjadi model dengan antarmuka seragam.
class LocalModel implements ForecastModel {
  @override
  final String id;
  @override
  final String nama;
  final List<double> Function(List<double> train, int h) fn;
  LocalModel(this.id, this.nama, this.fn);

  @override
  String get kelompok => 'lokal';

  @override
  Map<int, List<double>> fitPredict(List<TrainItem> items, int horizon) =>
      {for (final it in items) it.id: _nonNeg(fn(it.train, horizon))};
}

/// Daftar model yang dibandingkan pada evaluasi.
List<ForecastModel> defaultModels({bool withExog = false}) => [
      LocalModel('naive', 'Naive (nilai terakhir)', naive),
      LocalModel('ma4', 'Rata-rata bergerak 4 minggu', movingAverage(4)),
      LocalModel('ses', 'Exponential Smoothing (SES)', ses),
      LocalModel('croston', 'Croston', croston(alpha: 0.1)),
      LocalModel('sba', 'Croston-SBA', croston(alpha: 0.1, sba: true)),
      LocalModel('tsb', 'TSB', tsb(alpha: 0.1, beta: 0.1)),
      GlobalModel(id: 'rf_global', nama: 'Random Forest global', learner: Pembelajar.rf),
      GlobalModel(id: 'gbm_global', nama: 'Gradient Boosting global', learner: Pembelajar.gbm),
      if (withExog) GlobalModel(id: 'gbm_exog', nama: 'Gradient Boosting global + tenaga kerja', learner: Pembelajar.gbm, useExog: true),
    ];
