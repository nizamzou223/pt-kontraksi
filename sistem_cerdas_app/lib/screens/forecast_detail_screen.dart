import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/models.dart';
import '../state/ai_controller.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/forecast_chart.dart';

class ForecastDetailScreen extends StatefulWidget {
  final AiController c;
  final BarangRamalan barang;
  const ForecastDetailScreen({super.key, required this.c, required this.barang});

  @override
  State<ForecastDetailScreen> createState() => _ForecastDetailScreenState();
}

class _ForecastDetailScreenState extends State<ForecastDetailScreen> {
  late Future<List<TitikRiwayat>> _riwayat;

  BarangRamalan get b => widget.barang;

  @override
  void initState() {
    super.initState();
    _muatRiwayat();
  }

  void _muatRiwayat() {
    final p = widget.c.proyekAktif;
    final lokal = b.riwayat;
    _riwayat = lokal != null
        ? Future.value(lokal)
        : (p == null ? Future.value(const <TitikRiwayat>[]) : widget.c.repo.riwayatPemakaian(p.id, b.barangId));
  }

  String get _ringkasan {
    final k = StringBuffer()
      ..writeln('${b.nama} (${b.kode})')
      ..writeln('Status: ${b.risiko.label}')
      ..writeln('Stok saat ini: ${fmtBulat(b.stok)} ${b.satuan}')
      ..writeln('Kebutuhan ${b.ramalan.length} minggu (ramalan): ${fmtBulat(b.totalRamalan)} ${b.satuan}');
    if (b.perluDipesan) k.writeln('Saran pesan: ±${fmtBulat(b.jumlahDisarankan)} ${b.satuan}');
    if (b.perkiraanHabis != null) k.writeln('Perkiraan habis: ${fmtTanggal(b.perkiraanHabis!)}');
    return k.toString().trim();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final warna = Palet.risiko(b.risiko, t.brightness);
    return Scaffold(
      appBar: BrandAppBar(
        judul: 'Detail Prediksi',
        aksi: [
          IconButton(
            tooltip: 'Salin ringkasan',
            icon: const Icon(Icons.copy_rounded),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: _ringkasan));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Ringkasan disalin. Tinggal tempel ke WhatsApp atau catatan.')));
              }
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(b.nama, style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                if (b.kode.isNotEmpty) Text(b.kode, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant)),
              ]),
            ),
            RisikoChip(b.risiko),
          ]),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: warna.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14), border: Border.all(color: warna.withValues(alpha: 0.35))),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Palet.ikonRisiko(b.risiko), color: warna),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  b.perluDipesan
                      ? 'Disarankan memesan ±${fmtBulat(b.jumlahDisarankan)} ${b.satuan}.'
                          '${b.perkiraanHabis != null ? ' Stok diperkirakan habis ${fmtRelatif(b.perkiraanHabis!)} (${fmtTanggal(b.perkiraanHabis!)}).' : ''}'
                      : b.risiko.arti,
                  style: TextStyle(fontWeight: FontWeight.w700, color: warna, height: 1.35),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          KartuBagian(
            judul: 'Pemakaian & ramalan mingguan',
            trailing: Text(b.satuan, style: t.textTheme.bodySmall),
            child: FutureBuilder<List<TitikRiwayat>>(
              future: _riwayat,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const SizedBox(height: 240, child: Center(child: CircularProgressIndicator()));
                }
                return Column(children: [
                  GrafikRamalan(riwayat: snap.data ?? const [], ramalan: b.ramalan, satuan: b.satuan),
                  if (snap.hasError)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('Riwayat pemakaian tidak dapat dimuat; hanya ramalan yang ditampilkan.', style: t.textTheme.bodySmall),
                    ),
                ]);
              },
            ),
          ),
          const SizedBox(height: 16),
          KartuBagian(
            judul: 'Angka kunci',
            child: Column(children: [
              BarisNilai('Stok saat ini', '${fmtBulat(b.stok)} ${b.satuan}'),
              BarisNilai('Titik pemesanan ulang', '${fmtBulat(b.titikPemesananUlang)} ${b.satuan}'),
              BarisNilai('Stok pengaman', '${fmtBulat(b.stokPengaman)} ${b.satuan}'),
              if (b.stokMinimal > 0) BarisNilai('Stok minimal (ditetapkan)', '${fmtBulat(b.stokMinimal)} ${b.satuan}'),
              BarisNilai('Kebutuhan ${b.ramalan.length} minggu', '${fmtBulat(b.totalRamalan)} ${b.satuan}'),
              BarisNilai('Jumlah disarankan', b.perluDipesan ? '${fmtBulat(b.jumlahDisarankan)} ${b.satuan}' : 'Tidak perlu'),
            ]),
          ),
          if (b.alasan.isNotEmpty) ...[
            const SizedBox(height: 16),
            KartuBagian(
              judul: 'Mengapa saran ini?',
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (final a in b.alasan)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Padding(padding: EdgeInsets.only(top: 3), child: Icon(Icons.chevron_right_rounded, size: 18)),
                      const SizedBox(width: 4),
                      Expanded(child: Text(a, style: const TextStyle(height: 1.4))),
                    ]),
                  ),
              ]),
            ),
          ],
          if (b.ramalan.isNotEmpty) ...[
            const SizedBox(height: 16),
            KartuBagian(
              judul: 'Ramalan per minggu',
              child: Column(children: [
                for (final p in b.ramalan)
                  BarisNilai(
                    'Minggu ${fmtTglPendek(p.minggu)}',
                    '${fmtBulat(p.yhat)} ${b.satuan}  (${fmtBulat(p.bawah)}–${fmtBulat(p.atas)})',
                  ),
                const SizedBox(height: 6),
                Text('Angka dalam kurung = rentang kemungkinan 80%.', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
              ]),
            ),
          ],
          if (b.modelNama != null) ...[
            const SizedBox(height: 16),
            KartuBagian(
              judul: 'Model yang dipakai',
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(b.modelNama!, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (b.mase != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      'Galat pengujian (MASE) ${fmtMase(b.mase!)}. Di bawah 1 berarti lebih akurat daripada menebak "sama seperti minggu lalu".',
                      style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4),
                    ),
                  ),
              ]),
            ),
          ],
        ],
      ),
    );
  }
}
