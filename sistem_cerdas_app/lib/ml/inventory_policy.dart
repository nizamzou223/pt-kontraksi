// Kebijakan persediaan berbasis ramalan: stok pengaman, titik pemesanan ulang, jumlah pesanan,
// perkiraan tanggal habis, dan tingkat risiko — beserta ALASAN yang dapat dibaca admin.
// Port dari admin-web/src/ml/inventoryPolicy.js.
import 'dart:math' as math;

import 'teks.dart';
import 'timeseries.dart';

class Rekomendasi {
  final double safetyStock;
  final double reorderPoint;
  final double orderQty;
  final String? stockoutWeek;
  final String risiko; // habis | kritis | waspada | aman
  final List<String> alasan;
  final double demandLT;
  final double totalForecast;
  const Rekomendasi({
    required this.safetyStock,
    required this.reorderPoint,
    required this.orderQty,
    required this.stockoutWeek,
    required this.risiko,
    required this.alasan,
    required this.demandLT,
    required this.totalForecast,
  });
}

Rekomendasi recommendReplenishment({
  required List<double> forecast,
  double sigmaWeekly = 0,
  required double stock,
  double minStock = 0,
  int leadTimeWeeks = 1,
  double z = 1.65,
  required String startWeek,
  String unit = '',
}) {
  final h = forecast.length;
  final l = math.max(1, leadTimeWeeks);
  double at(int i) => h == 0 ? 0 : forecast[math.min(i, h - 1)];
  var demandLT = 0.0;
  for (var i = 0; i < l; i++) {
    demandLT += at(i);
  }
  final totalH = forecast.fold<double>(0, (s, v) => s + v);

  final safetyStock = (z * sigmaWeekly * math.sqrt(l)).ceilToDouble();
  final reorderPoint = (demandLT + safetyStock).ceilToDouble();
  final orderQty = math.max(0.0, (totalH + safetyStock - stock).ceilToDouble());

  var cum = 0.0;
  var stockoutIdx = -1;
  for (var i = 0; i < h; i++) {
    cum += forecast[i];
    if (stock - cum <= 0) {
      stockoutIdx = i;
      break;
    }
  }
  final stockoutWeek = stockoutIdx >= 0 ? addWeeks(startWeek, stockoutIdx) : null;

  final u = unit.isNotEmpty ? ' $unit' : '';
  final alasan = <String>[];
  var risiko = 'aman';
  if (totalH <= 0 && demandLT <= 0) {
    alasan.add('Tidak ada pemakaian yang diperkirakan pada horizon ini.');
  } else {
    if (stock <= 0) {
      risiko = 'habis';
      alasan.add('Stok saat ini sudah habis sementara kebutuhan masih diperkirakan ada.');
    } else if (stock <= reorderPoint) {
      risiko = 'kritis';
      alasan.add('Stok ${fmtId(stock)}$u ≤ titik pemesanan ulang ${fmtId(reorderPoint)}$u (kebutuhan $l minggu waktu tunggu ${fmtId(demandLT)} + stok pengaman ${fmtId(safetyStock)}).');
    } else if (stock < totalH + safetyStock) {
      risiko = 'waspada';
      alasan.add('Stok ${fmtId(stock)}$u tidak cukup untuk $h minggu ke depan (perkiraan ${fmtId(totalH)}$u + pengaman ${fmtId(safetyStock)}$u).');
    } else {
      alasan.add('Stok ${fmtId(stock)}$u mencukupi kebutuhan $h minggu (perkiraan ${fmtId(totalH)}$u).');
    }
    if (stockoutWeek != null) alasan.add('Stok diperkirakan habis pada minggu $stockoutWeek.');
    if (minStock > 0 && stock - totalH < minStock) {
      alasan.add('Sisa stok akhir horizon (${fmtId(math.max(0.0, stock - totalH))}$u) di bawah stok minimal ${fmtId(minStock)}$u.');
    }
    if (orderQty > 0) alasan.add('Disarankan memesan ±${fmtId(orderQty)}$u.');
  }

  return Rekomendasi(
    safetyStock: safetyStock,
    reorderPoint: reorderPoint,
    orderQty: orderQty,
    stockoutWeek: stockoutWeek,
    risiko: risiko,
    alasan: alasan,
    demandLT: demandLT,
    totalForecast: totalH,
  );
}
