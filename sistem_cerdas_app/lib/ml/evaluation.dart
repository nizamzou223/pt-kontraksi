// Evaluasi peramalan dengan validasi ROLLING-ORIGIN (berbasis urutan waktu, bukan acak).
// Pada tiap titik asal model HANYA melihat data sebelum titik itu, sehingga tidak ada kebocoran data
// masa depan. Port dari admin-web/src/ml/evaluation.js.
import 'dart:math' as math;

import 'forecasters.dart';
import 'stats.dart';
import 'timeseries.dart';

class SeriBarang {
  final int id;
  final String nama;
  final List<double> values;
  final List<double>? exog;
  const SeriBarang(this.id, this.nama, this.values, [this.exog]);
}

class Rec {
  final String modelId;
  final int itemId;
  final int origin;
  final int h;
  final double y;
  final double yhat;
  final double scale;
  final double itemMean;
  const Rec(this.modelId, this.itemId, this.origin, this.h, this.y, this.yhat, this.scale, this.itemMean);
}

/// Memberi kesempatan antarmuka/isolate memproses pesan di sela komputasi panjang.
Future<void> _lepas() => Future<void>.delayed(Duration.zero);

typedef Progres = void Function(double p, String label);

Future<List<Rec>> rollingOrigin({
  required List<SeriBarang> items,
  required List<ForecastModel> models,
  int horizon = 4,
  int nOrigins = 8,
  int minTrain = 20,
  void Function(double p, String nama)? onProgress,
}) async {
  final n = items.isEmpty ? 0 : items.first.values.length;
  final lastOrigin = n - horizon;
  final firstOrigin = math.max(minTrain, lastOrigin - nOrigins + 1);
  final records = <Rec>[];
  var step = 0;
  final totalSteps = (lastOrigin - firstOrigin + 1) * models.length;

  for (var t = firstOrigin; t <= lastOrigin; t++) {
    final trainItems = [for (final it in items) TrainItem(it.id, it.values.sublist(0, t), it.exog?.sublist(0, t))];
    final scales = {for (final it in trainItems) it.id: (scale: naiveScale(it.train), mean: mean(it.train))};
    for (final model in models) {
      final preds = model.fitPredict(trainItems, horizon);
      for (final it in items) {
        final yhat = preds[it.id] ?? const <double>[];
        final sc = scales[it.id]!;
        for (var h = 1; h <= horizon; h++) {
          records.add(Rec(model.id, it.id, t, h, it.values[t + h - 1], h - 1 < yhat.length ? yhat[h - 1] : 0, sc.scale, sc.mean));
        }
      }
      step++;
      onProgress?.call(step / totalSteps, model.nama);
      await _lepas();
    }
  }
  return records;
}

// ───────────────────────── Metrik ─────────────────────────
class Metrik {
  final int n;
  final double mae, rmse, wape, mase, bias;
  const Metrik(this.n, this.mae, this.rmse, this.wape, this.mase, this.bias);
}

Metrik metricsOf(List<Rec> recs) {
  if (recs.isEmpty) return const Metrik(0, double.nan, double.nan, double.nan, double.nan, double.nan);
  var ae = 0.0, se = 0.0, sy = 0.0, err = 0.0, maseSum = 0.0;
  var maseN = 0;
  for (final r in recs) {
    final e = r.yhat - r.y;
    ae += e.abs();
    se += e * e;
    sy += r.y.abs();
    err += e;
    if (r.scale > 0) {
      maseSum += e.abs() / r.scale;
      maseN++;
    }
  }
  return Metrik(
    recs.length,
    ae / recs.length,
    math.sqrt(se / recs.length),
    sy > 0 ? ae / sy : double.nan,
    maseN > 0 ? maseSum / maseN : double.nan,
    err / recs.length,
  );
}

Map<K, List<T>> _groupBy<K, T>(Iterable<T> arr, K Function(T) key) {
  final m = <K, List<T>>{};
  for (final x in arr) {
    (m[key(x)] ??= []).add(x);
  }
  return m;
}

class BarisModel {
  final String id, nama, kelompok;
  final Metrik m;
  final double meanRank;
  final int wins;
  const BarisModel(this.id, this.nama, this.kelompok, this.m, this.meanRank, this.wins);
  double get mase => m.mase;
  double get rmse => m.rmse;
}

class Ringkasan {
  final List<BarisModel> models;
  final Map<int, Map<String, double>> perItem; // itemId → modelId → MASE
  const Ringkasan(this.models, this.perItem);
}

Ringkasan summarize(List<Rec> records, List<ForecastModel> models) {
  final byModel = _groupBy(records, (r) => r.modelId);
  final perItem = <int, Map<String, double>>{};
  byModel.forEach((modelId, recs) {
    _groupBy(recs, (r) => r.itemId).forEach((itemId, rs) {
      (perItem[itemId] ??= {})[modelId] = metricsOf(rs).mase;
    });
  });
  final rankSum = <String, int>{}, wins = <String, int>{}, rankN = <String, int>{};
  for (final mm in perItem.values) {
    final ranked = mm.entries.where((e) => e.value.isFinite).toList();
    sortStabil(ranked, (a, b) => cmpNum(a.value, b.value));
    for (var i = 0; i < ranked.length; i++) {
      final id = ranked[i].key;
      rankSum[id] = (rankSum[id] ?? 0) + i + 1;
      rankN[id] = (rankN[id] ?? 0) + 1;
    }
    if (ranked.isNotEmpty) wins[ranked.first.key] = (wins[ranked.first.key] ?? 0) + 1;
  }
  final rows = [
    for (final m in models)
      BarisModel(
        m.id,
        m.nama,
        m.kelompok,
        metricsOf(byModel[m.id] ?? const []),
        (rankN[m.id] ?? 0) > 0 ? rankSum[m.id]! / rankN[m.id]! : double.nan,
        wins[m.id] ?? 0,
      )
  ];
  return Ringkasan(rows, perItem);
}

/// Model global terbaik = MASE terkecil (seri → RMSE).
String? bestModelId(Ringkasan s) {
  final ok = s.models.where((m) => m.mase.isFinite).toList();
  sortStabil(ok, (a, b) {
    final c = cmpNum(a.mase, b.mase);
    return c != 0 ? c : cmpNum(a.rmse, b.rmse);
  });
  return ok.isEmpty ? null : ok.first.id;
}

/// Model terpilih per barang: pemenang lokal HANYA dipakai bila jelas lebih baik (≥ margin) daripada
/// model global terbaik dan datanya cukup; selain itu tetap model global → mengurangi "selection noise".
({String? globalBest, Map<int, String> choice}) pickModelPerItem(Ringkasan s, List<Rec> records, {double margin = 0.05, int minOrigins = 4}) {
  final globalBest = bestModelId(s);
  final originsPerItem = <int, Set<int>>{};
  for (final r in records) {
    (originsPerItem[r.itemId] ??= {}).add(r.origin);
  }
  final choice = <int, String>{};
  s.perItem.forEach((itemId, mm) {
    final gb = globalBest == null ? null : mm[globalBest];
    final ranked = mm.entries.where((e) => e.value.isFinite).toList();
    sortStabil(ranked, (a, b) => cmpNum(a.value, b.value));
    final enough = (originsPerItem[itemId]?.length ?? 0) >= minOrigins;
    if (enough && ranked.isNotEmpty && gb != null && gb.isFinite && ranked.first.value < gb * (1 - margin)) {
      choice[itemId] = ranked.first.key;
    } else if (globalBest != null) {
      choice[itemId] = globalBest;
    }
  });
  return (globalBest: globalBest, choice: choice);
}

// ───────────────────────── Interval ketidakpastian ─────────────────────────
class KalibrasiH {
  final double lo, hi;
  final int n;
  const KalibrasiH(this.lo, this.hi, this.n);
}

/// Kalibrasi interval empiris: kuantil galat (y − ŷ) dinormalisasi rata-rata pemakaian barang, per horizon.
Map<int, KalibrasiH> calibrateIntervals(List<Rec> records, String modelId, {double lo = 0.1, double hi = 0.9}) {
  final rs = records.where((r) => r.modelId == modelId && r.itemMean > 0);
  final out = <int, KalibrasiH>{};
  _groupBy(rs, (r) => r.h).forEach((h, group) {
    final errs = [for (final r in group) (r.y - r.yhat) / r.itemMean];
    out[h] = KalibrasiH(quantile(errs, lo), quantile(errs, hi), errs.length);
  });
  return out;
}

({double low, double high}) applyInterval(double yhat, double itemMean, KalibrasiH? cal) {
  if (cal == null) return (low: yhat, high: yhat);
  return (low: math.max(0.0, yhat + cal.lo * itemMean), high: math.max(yhat, yhat + cal.hi * itemMean));
}

class Cakupan {
  final double picp; // proporsi realisasi yang jatuh di dalam interval
  final double width;
  final double nominal;
  final int n;
  const Cakupan(this.picp, this.width, this.nominal, this.n);
}

/// Uji cakupan: kalibrasi pada titik asal awal (60%), uji pada sisanya.
Cakupan evaluateCoverage(List<Rec> records, String modelId, {double split = 0.6, double lo = 0.1, double hi = 0.9}) {
  final rs = records.where((r) => r.modelId == modelId && r.itemMean > 0).toList();
  final origins = rs.map((r) => r.origin).toSet().toList()..sort();
  if (origins.length < 3) return Cakupan(double.nan, double.nan, hi - lo, 0);
  final cut = origins[math.max(0, (origins.length * split).floor() - 1)];
  final cal = calibrateIntervals(rs.where((r) => r.origin <= cut).toList(), modelId, lo: lo, hi: hi);
  var inside = 0, n = 0;
  var width = 0.0;
  for (final r in rs.where((r) => r.origin > cut)) {
    final c = cal[r.h];
    if (c == null) continue;
    final iv = applyInterval(r.yhat, r.itemMean, c);
    if (r.y >= iv.low && r.y <= iv.high) inside++;
    width += (iv.high - iv.low) / r.itemMean;
    n++;
  }
  return Cakupan(n > 0 ? inside / n : double.nan, n > 0 ? width / n : double.nan, hi - lo, n);
}
