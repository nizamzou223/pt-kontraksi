import 'dart:math';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../models/models.dart';
import '../utils/format.dart';

/// Grafik pemakaian mingguan (garis tegas), ramalan (garis putus-putus), dan rentang kemungkinan 80%.
class GrafikRamalan extends StatelessWidget {
  final List<TitikRiwayat> riwayat;
  final List<TitikRamalan> ramalan;
  final String satuan;
  const GrafikRamalan({super.key, required this.riwayat, required this.ramalan, required this.satuan});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final warnaRiwayat = t.colorScheme.primary;
    final warnaRamalan = t.brightness == Brightness.dark ? const Color(0xFFFBBF24) : const Color(0xFFD97706);
    final teksRedup = t.colorScheme.onSurfaceVariant;

    // x = urutan minggu; riwayat 0..n-1, ramalan menyambung setelahnya.
    final n = riwayat.length;
    final minggu = <DateTime>[...riwayat.map((e) => e.minggu), ...ramalan.map((e) => e.minggu)];
    final spotRiwayat = [for (var i = 0; i < n; i++) FlSpot(i.toDouble(), riwayat[i].nilai)];
    // Garis ramalan disambung dari titik riwayat terakhir agar terbaca sebagai kelanjutan.
    final sambung = n > 0 ? riwayat.last.nilai : (ramalan.isNotEmpty ? ramalan.first.yhat : 0.0);
    final mulaiX = max(n - 1, 0).toDouble();
    final spotYhat = [FlSpot(mulaiX, sambung), for (var j = 0; j < ramalan.length; j++) FlSpot((n + j).toDouble(), ramalan[j].yhat)];
    final spotBawah = [FlSpot(mulaiX, sambung), for (var j = 0; j < ramalan.length; j++) FlSpot((n + j).toDouble(), ramalan[j].bawah)];
    final spotAtas = [FlSpot(mulaiX, sambung), for (var j = 0; j < ramalan.length; j++) FlSpot((n + j).toDouble(), ramalan[j].atas)];

    final semua = [...riwayat.map((e) => e.nilai), ...ramalan.map((e) => e.atas)];
    final maks = semua.isEmpty ? 10.0 : semua.reduce(max);
    final atasY = maks <= 0 ? 10.0 : maks * 1.15;
    final totalX = (minggu.length - 1).clamp(1, 1000).toDouble();
    final langkahLabel = minggu.length > 12 ? 3 : 2;

    LineChartBarData garis(List<FlSpot> s, {Color? warna, double lebar = 3, List<int>? putus, bool titik = false, bool tampil = true}) =>
        LineChartBarData(
          spots: s,
          isCurved: true,
          curveSmoothness: 0.2,
          preventCurveOverShooting: true,
          color: tampil ? warna : Colors.transparent,
          barWidth: tampil ? lebar : 0,
          dashArray: putus,
          dotData: FlDotData(show: titik),
          isStrokeCapRound: true,
        );

    return Column(children: [
      SizedBox(
        height: 240,
        child: LineChart(
          LineChartData(
            minX: 0,
            maxX: totalX,
            minY: 0,
            maxY: atasY,
            lineBarsData: [
              garis(spotRiwayat, warna: warnaRiwayat), // 0
              garis(spotBawah, tampil: false), // 1
              garis(spotAtas, tampil: false), // 2
              garis(spotYhat, warna: warnaRamalan, putus: [7, 5], titik: true), // 3
            ],
            betweenBarsData: [BetweenBarsData(fromIndex: 1, toIndex: 2, color: warnaRamalan.withValues(alpha: 0.18))],
            gridData: FlGridData(
              drawVerticalLine: false,
              getDrawingHorizontalLine: (_) => FlLine(color: teksRedup.withValues(alpha: 0.15), strokeWidth: 1),
            ),
            borderData: FlBorderData(show: false),
            titlesData: FlTitlesData(
              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              leftTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 42,
                  getTitlesWidget: (v, meta) {
                    if (v == meta.max || v == meta.min && v != 0) return const SizedBox.shrink();
                    return SideTitleWidget(
                      axisSide: meta.axisSide,
                      child: Text(fmtBulat(v), style: TextStyle(fontSize: 11, color: teksRedup)),
                    );
                  },
                ),
              ),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 28,
                  interval: 1,
                  getTitlesWidget: (v, meta) {
                    final i = v.round();
                    if (i < 0 || i >= minggu.length || (v - i).abs() > 0.01) return const SizedBox.shrink();
                    if (i % langkahLabel != 0 && i != minggu.length - 1) return const SizedBox.shrink();
                    return SideTitleWidget(
                      axisSide: meta.axisSide,
                      child: Text(fmtTglPendek(minggu[i]), style: TextStyle(fontSize: 10.5, color: teksRedup)),
                    );
                  },
                ),
              ),
            ),
            extraLinesData: n == 0
                ? null
                : ExtraLinesData(verticalLines: [
                    VerticalLine(
                      x: n - 0.5,
                      color: teksRedup.withValues(alpha: 0.5),
                      strokeWidth: 1,
                      dashArray: [3, 4],
                      label: VerticalLineLabel(
                        show: true,
                        alignment: Alignment.topRight,
                        labelResolver: (_) => ' Ramalan ',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: warnaRamalan),
                      ),
                    ),
                  ]),
            lineTouchData: LineTouchData(
              handleBuiltInTouches: true,
              touchTooltipData: LineTouchTooltipData(
                getTooltipColor: (_) => t.colorScheme.inverseSurface,
                getTooltipItems: (spots) => spots.map<LineTooltipItem?>((s) {
                  final i = s.x.round();
                  final tgl = i >= 0 && i < minggu.length ? fmtTglPendek(minggu[i]) : '';
                  final gaya = TextStyle(color: t.colorScheme.onInverseSurface, fontWeight: FontWeight.w700, fontSize: 12.5);
                  if (s.barIndex == 0) return LineTooltipItem('Minggu $tgl\nPakai ${fmtAngka(s.y)} $satuan', gaya);
                  if (s.barIndex == 3) {
                    final j = i - n;
                    if (j >= 0 && j < ramalan.length) {
                      final r = ramalan[j];
                      return LineTooltipItem(
                          'Minggu $tgl\nRamalan ${fmtAngka(r.yhat)} $satuan\n(${fmtBulat(r.bawah)}–${fmtBulat(r.atas)})', gaya);
                    }
                    return LineTooltipItem('Sekarang\n${fmtAngka(s.y)} $satuan', gaya);
                  }
                  return null;
                }).toList(),
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: 10),
      Wrap(spacing: 16, runSpacing: 6, alignment: WrapAlignment.center, children: [
        _Legenda(warna: warnaRiwayat, teks: 'Pemakaian nyata'),
        _Legenda(warna: warnaRamalan, teks: 'Ramalan', putus: true),
        _Legenda(warna: warnaRamalan.withValues(alpha: 0.35), teks: 'Rentang 80%', kotak: true),
      ]),
    ]);
  }
}

class _Legenda extends StatelessWidget {
  final Color warna;
  final String teks;
  final bool putus;
  final bool kotak;
  const _Legenda({required this.warna, required this.teks, this.putus = false, this.kotak = false});

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        if (kotak)
          Container(width: 16, height: 10, decoration: BoxDecoration(color: warna, borderRadius: BorderRadius.circular(3)))
        else
          Row(children: [
            Container(width: putus ? 6 : 16, height: 3, color: warna),
            if (putus) ...[const SizedBox(width: 3), Container(width: 6, height: 3, color: warna)],
          ]),
        const SizedBox(width: 6),
        Text(teks, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ]);
}
