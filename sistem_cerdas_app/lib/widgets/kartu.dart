import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme.dart';
import '../utils/format.dart';
import 'common.dart';

/// Kartu ringkas satu barang (dipakai pada tab Prediksi dan hasil analisis baru).
class KartuBarang extends StatelessWidget {
  final BarangRamalan b;
  final VoidCallback onTap;
  const KartuBarang({super.key, required this.b, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final warna = Palet.risiko(b.risiko, t.brightness);
    final minggu = b.mingguCukup;
    final horizon = b.ramalan.length;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(b.nama, style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                  if (b.kode.isNotEmpty) Text(b.kode, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                ]),
              ),
              const SizedBox(width: 8),
              RisikoChip(b.risiko),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Text('Stok ${fmtBulat(b.stok)} ${b.satuan}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  minggu == null ? 'Tanpa pemakaian diperkirakan' : 'Cukup ±${fmtAngka(minggu)} minggu',
                  textAlign: TextAlign.end,
                  overflow: TextOverflow.ellipsis,
                  style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant),
                ),
              ),
            ]),
            const SizedBox(height: 6),
            BilahProgres(nilai: minggu == null || horizon == 0 ? 1 : minggu / horizon, warna: warna),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: _Info('Kebutuhan $horizon minggu', '${fmtBulat(b.totalRamalan)} ${b.satuan}')),
              Expanded(child: _Info('Saran pesan', b.perluDipesan ? '${fmtBulat(b.jumlahDisarankan)} ${b.satuan}' : 'Tidak perlu')),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _Info extends StatelessWidget {
  final String label;
  final String nilai;
  const _Info(this.label, this.nilai);
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
      Text(nilai, style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
    ]);
  }
}

/// Kartu ringkas satu anomali.
class KartuAnomali extends StatelessWidget {
  final Anomali a;
  final VoidCallback onTap;
  const KartuAnomali({super.key, required this.a, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final warna = Palet.tingkat(a.tingkat, t.brightness);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(width: 6, color: warna),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    InfoChip(a.sumberLabel, ikon: switch (a.sumberTabel) {
                      'presensi' => Icons.fingerprint_rounded,
                      'lembur' => Icons.more_time_rounded,
                      'kasbon' => Icons.payments_rounded,
                      _ => Icons.receipt_long_rounded,
                    }),
                    Text(fmtTanggal(a.tanggal), style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                    if (a.status != StatusTinjauan.baru) StatusChip(a.status),
                  ]),
                  const SizedBox(height: 10),
                  Text(a.karyawan ?? 'Karyawan tidak diketahui', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text(a.ringkas, maxLines: 3, overflow: TextOverflow.ellipsis, style: t.textTheme.bodyMedium?.copyWith(height: 1.35)),
                  if (a.alasan.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('+${a.alasan.length - 1} alasan lain', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.primary, fontWeight: FontWeight.w800)),
                    ),
                ]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                SkorLingkaran(skor: a.skor, tingkat: a.tingkat),
                const SizedBox(height: 4),
                Text('skor', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, fontSize: 11)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Penjelasan singkat empat tingkat risiko stok.
void tampilkanLegendaRisiko(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Arti tingkat risiko', style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          for (final k in Risiko.values)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 96, child: Align(alignment: Alignment.centerLeft, child: RisikoChip(k))),
                const SizedBox(width: 10),
                Expanded(child: Text(k.arti)),
              ]),
            ),
        ]),
      ),
    ),
  );
}

/// Batang horizontal MASE per model dengan garis acuan 1,0 (ramalan naive).
class BilahMase extends StatelessWidget {
  final List<SkorModel> skor;
  const BilahMase({super.key, required this.skor});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final b = t.brightness;
    final ada = skor.where((s) => s.mase != null).toList();
    if (ada.isEmpty) return const Text('Tidak ada data metrik.');
    final maks = ada.map((s) => s.mase!).reduce((a, x) => a > x ? a : x);
    final skala = maks < 1.2 ? 1.2 : maks * 1.05;
    return LayoutBuilder(builder: (context, box) {
      final lebar = box.maxWidth;
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (var i = 0; i < ada.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                if (i == 0) ...[Icon(Icons.emoji_events_rounded, size: 16, color: Palet.risiko(Risiko.waspada, b)), const SizedBox(width: 4)],
                Expanded(child: Text(ada[i].nama, style: TextStyle(fontWeight: i == 0 ? FontWeight.w800 : FontWeight.w600, fontSize: 13.5))),
                Text(fmtMase(ada[i].mase!), style: const TextStyle(fontWeight: FontWeight.w800)),
              ]),
              const SizedBox(height: 4),
              SizedBox(
                height: 12,
                child: Stack(clipBehavior: Clip.none, children: [
                  Container(decoration: BoxDecoration(color: t.colorScheme.outline.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(6))),
                  Container(
                    width: lebar * (ada[i].mase! / skala),
                    decoration: BoxDecoration(
                      gradient: ada[i].mase! < 1 ? const LinearGradient(colors: [Palet.brand600, Palet.sky]) : null,
                      color: ada[i].mase! < 1 ? null : t.colorScheme.outline,
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                  Positioned(left: lebar / skala - 1, top: -3, bottom: -3, child: Container(width: 2, color: t.colorScheme.onSurface.withValues(alpha: 0.7))),
                ]),
              ),
            ]),
          ),
        Row(children: [
          Container(width: 12, height: 12, decoration: BoxDecoration(gradient: const LinearGradient(colors: [Palet.brand600, Palet.sky]), borderRadius: BorderRadius.circular(3))),
          const SizedBox(width: 6),
          Expanded(child: Text('Berwarna biru = lebih baik dari ramalan naive. Garis hitam = batas 1,0 (naive).', style: t.textTheme.bodySmall)),
        ]),
      ]);
    });
  }
}
