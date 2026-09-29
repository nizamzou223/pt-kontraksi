// Pipeline peramalan end-to-end: evaluasi rolling-origin → pilih model → latih ulang pada seluruh data
// → ramalan + interval → rekomendasi pengadaan. Port dari admin-web/src/ml/forecastPipeline.js.
import 'dart:math' as math;

import 'evaluation.dart';
import 'forecasters.dart';
import 'inventory_policy.dart';
import 'stats.dart';
import 'timeseries.dart';

const serviceZ = {90: 1.28, 95: 1.65, 99: 2.33};

/// Masukan satu barang untuk analisis.
class MasukanBarang {
  final int id;
  final String nama;
  final String kode;
  final String satuan;
  final List<double> values;
  final List<double>? exog;
  final double stok;
  final double stokMinimal;
  const MasukanBarang({
    required this.id,
    required this.nama,
    this.kode = '',
    this.satuan = '',
    required this.values,
    this.exog,
    required this.stok,
    required this.stokMinimal,
  });
}

class PermintaanPrediksi {
  final List<String> weeks;
  final List<MasukanBarang> items;
  final int horizon;
  final int nOrigins;
  final int minTrain;
  final int leadTimeWeeks;
  final int serviceLevel;
  final bool useExog;
  const PermintaanPrediksi({
    required this.weeks,
    required this.items,
    this.horizon = 4,
    this.nOrigins = 5,
    this.minTrain = 20,
    this.leadTimeWeeks = 1,
    this.serviceLevel = 95,
    this.useExog = false,
  });
}

class TitikBand {
  final String minggu;
  final double yhat, low, high;
  const TitikBand(this.minggu, this.yhat, this.low, this.high);
}

class HasilBarang {
  final int id;
  final String nama, kode, satuan;
  final double stok, stokMinimal;
  final List<double> values;
  final PolaPermintaan pola;
  final String modelId;
  final String modelNama;
  final double? mase;
  final List<TitikBand> forecast;
  final Rekomendasi rekomendasi;
  const HasilBarang({
    required this.id,
    required this.nama,
    required this.kode,
    required this.satuan,
    required this.stok,
    required this.stokMinimal,
    required this.values,
    required this.pola,
    required this.modelId,
    required this.modelNama,
    required this.mase,
    required this.forecast,
    required this.rekomendasi,
  });
}

class ParameterHasil {
  final int horizon, nOrigins, leadTimeWeeks, serviceLevel, nItems, nWeeks;
  final String startWeek;
  const ParameterHasil(this.horizon, this.nOrigins, this.leadTimeWeeks, this.serviceLevel, this.nItems, this.nWeeks, this.startWeek);
}

class HasilPrediksi {
  final bool ok;
  final String? alasanGagal;
  final ParameterHasil? parameter;
  final List<BarisModel> evaluasi;
  final String? modelTerbaik;
  final Cakupan? cakupanInterval;
  final List<HasilBarang> items;
  final List<String> weeks;
  const HasilPrediksi.gagal(String alasan)
      : ok = false,
        alasanGagal = alasan,
        parameter = null,
        evaluasi = const [],
        modelTerbaik = null,
        cakupanInterval = null,
        items = const [],
        weeks = const [];
  const HasilPrediksi({
    required this.parameter,
    required this.evaluasi,
    required this.modelTerbaik,
    required this.cakupanInterval,
    required this.items,
    required this.weeks,
  })  : ok = true,
        alasanGagal = null;

  BarisModel? get terbaik {
    for (final m in evaluasi) {
      if (m.id == modelTerbaik) return m;
    }
    return null;
  }
}

Future<HasilPrediksi> jalankanPrediksi(PermintaanPrediksi q, {Progres? onProgress, List<ForecastModel>? models}) async {
  final weeks = q.weeks;
  final usable = q.items.where((it) => it.values.length == weeks.length).toList();
  final modelList = models ?? defaultModels(withExog: q.useExog && usable.isNotEmpty && usable.every((i) => i.exog != null));
  if (weeks.length < q.minTrain + q.horizon + 2) {
    return HasilPrediksi.gagal(
        'Riwayat terlalu pendek (${weeks.length} minggu). Diperlukan minimal ${q.minTrain + q.horizon + 2} minggu untuk evaluasi yang sah.');
  }
  if (usable.isEmpty) return const HasilPrediksi.gagal('Tidak ada barang yang dapat dianalisis.');

  // 1) Evaluasi (model hanya melihat data sebelum titik asal)
  final series = [for (final it in usable) SeriBarang(it.id, it.nama, it.values, it.exog)];
  final records = await rollingOrigin(
    items: series,
    models: modelList,
    horizon: q.horizon,
    nOrigins: q.nOrigins,
    minTrain: q.minTrain,
    onProgress: (p, nama) => onProgress?.call(p * 0.85, 'Evaluasi: $nama'),
  );
  final summary = summarize(records, modelList);
  final globalBest = bestModelId(summary);
  final pick = pickModelPerItem(summary, records);
  final choice = pick.choice;
  if (globalBest == null) return const HasilPrediksi.gagal('Evaluasi tidak menghasilkan metrik yang sah (data terlalu sedikit atau seragam).');

  // 2) Latih ulang model terpilih pada SELURUH data → ramalan
  final needed = choice.values.toSet().toList();
  final trainAll = [for (final it in usable) TrainItem(it.id, it.values, it.exog)];
  final forecasts = <String, Map<int, List<double>>>{};
  for (var i = 0; i < needed.length; i++) {
    final m = modelList.firstWhere((x) => x.id == needed[i]);
    onProgress?.call(0.85 + 0.13 * (i + 1) / needed.length, 'Ramalan: ${m.nama}');
    forecasts[m.id] = m.fitPredict(trainAll, q.horizon);
    await Future<void>.delayed(Duration.zero);
  }

  // 3) Interval & rekomendasi
  final startWeek = addWeeks(weeks.last, 1);
  final calCache = <String, Map<int, KalibrasiH>>{};
  Map<int, KalibrasiH> cal(String mid) => calCache[mid] ??= calibrateIntervals(records, mid);
  final rmseByModel = {for (final m in summary.models) m.id: m.rmse};

  final hasil = <HasilBarang>[];
  for (final it in usable) {
    final mid = choice[it.id] ?? globalBest;
    final yhat = forecasts[mid]![it.id]!;
    final m = mean(it.values);
    final c = cal(mid);
    final band = [
      for (var i = 0; i < yhat.length; i++)
        () {
          final iv = applyInterval(yhat[i], m, c[i + 1]);
          return TitikBand(addWeeks(startWeek, i), yhat[i], iv.low, iv.high);
        }()
    ];
    // galat 1 minggu barang ini pada model terpilih; bila tak ada, pakai RMSE global model tsb
    final own = records.where((r) => r.modelId == mid && r.itemId == it.id && r.h == 1).toList();
    final sigma = own.length >= 3
        ? math.sqrt(mean([for (final r in own) (r.y - r.yhat) * (r.y - r.yhat)]))
        : (rmseByModel[mid] ?? 0);
    final rek = recommendReplenishment(
      forecast: yhat,
      sigmaWeekly: sigma.isFinite ? sigma : 0,
      stock: it.stok,
      minStock: it.stokMinimal,
      leadTimeWeeks: q.leadTimeWeeks,
      z: serviceZ[q.serviceLevel] ?? 1.65,
      startWeek: startWeek,
      unit: it.satuan,
    );
    final mase = summary.perItem[it.id]?[mid];
    hasil.add(HasilBarang(
      id: it.id,
      nama: it.nama,
      kode: it.kode,
      satuan: it.satuan,
      stok: it.stok,
      stokMinimal: it.stokMinimal,
      values: it.values,
      pola: intermittency(it.values),
      modelId: mid,
      modelNama: modelList.firstWhere((x) => x.id == mid).nama,
      mase: mase != null && mase.isFinite ? mase : null,
      forecast: band,
      rekomendasi: rek,
    ));
  }

  onProgress?.call(1, 'Selesai');
  return HasilPrediksi(
    parameter: ParameterHasil(q.horizon, q.nOrigins, q.leadTimeWeeks, q.serviceLevel, usable.length, weeks.length, startWeek),
    evaluasi: summary.models,
    modelTerbaik: globalBest,
    cakupanInterval: evaluateCoverage(records, globalBest),
    items: hasil,
    weeks: weeks,
  );
}
