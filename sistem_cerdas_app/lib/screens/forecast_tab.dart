import 'package:flutter/material.dart';

import '../models/models.dart';
import '../state/ai_controller.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/kartu.dart';
import '../widgets/project_picker.dart';
import 'forecast_detail_screen.dart';
import 'navigasi.dart';

class ForecastTab extends StatefulWidget {
  final AiController c;
  const ForecastTab({super.key, required this.c});

  @override
  State<ForecastTab> createState() => _ForecastTabState();
}

class _ForecastTabState extends State<ForecastTab> {
  String _cari = '';

  AiController get c => widget.c;

  @override
  Widget build(BuildContext context) {
    if (c.memuat && c.ramalan == null) return const Center(child: CircularProgressIndicator());
    if (c.galatRamalan != null) return KeadaanGalat(pesan: c.galatRamalan!, onUlang: c.muat);
    final r = c.ramalan;
    if (r == null) {
      return RefreshIndicator(
        onRefresh: c.muat,
        child: ListView(children: [
          Padding(padding: const EdgeInsets.all(16), child: PilihProyek(c)),
          const SizedBox(height: 24),
          KeadaanKosong(
            ikon: Icons.query_stats_rounded,
            judul: 'Belum ada hasil prediksi',
            pesan: 'Jalankan prediksi sekarang. Sistem akan meramal kebutuhan material dan menyarankan kapan harus memesan.',
            aksi: 'Jalankan prediksi',
            onAksi: () => bukaPrediksiBaru(context, c),
          ),
        ]),
      );
    }

    final kata = _cari.trim().toLowerCase();
    final daftar = r.barang.where((b) {
      if (c.filterRisiko != null && b.risiko != c.filterRisiko) return false;
      return kata.isEmpty || b.nama.toLowerCase().contains(kata) || b.kode.toLowerCase().contains(kata);
    }).toList();
    final t = Theme.of(context);
    final tema = t.brightness;

    return RefreshIndicator(
      onRefresh: c.muat,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                PilihProyek(c),
                const SizedBox(height: 12),
                TextField(
                  onChanged: (v) => setState(() => _cari = v),
                  decoration: const InputDecoration(hintText: 'Cari nama atau kode barang', prefixIcon: Icon(Icons.search_rounded), contentPadding: EdgeInsets.symmetric(vertical: 12)),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    ChipPilihan(label: 'Semua (${r.barang.length})', dipilih: c.filterRisiko == null, onTap: () => c.setFilterRisiko(null)),
                    for (final k in Risiko.values) ...[
                      const SizedBox(width: 8),
                      ChipPilihan(
                        ikon: Palet.ikonRisiko(k),
                        warnaIkon: Palet.risiko(k, tema),
                        label: '${k.label} (${r.hitung(k)})',
                        dipilih: c.filterRisiko == k,
                        onTap: () => c.setFilterRisiko(c.filterRisiko == k ? null : k),
                      ),
                    ],
                    IconButton(tooltip: 'Arti tingkat risiko', icon: const Icon(Icons.help_outline_rounded), onPressed: () => tampilkanLegendaRisiko(context)),
                  ]),
                ),
                const SizedBox(height: 4),
                Text('Analisis terakhir: ${fmtTanggal(r.dibuatPada)} · ${daftar.length} barang', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 8),
              ]),
            ),
          ),
          if (daftar.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: KeadaanKosong(ikon: Icons.search_off_rounded, judul: 'Barang tidak ditemukan', pesan: 'Coba ubah kata kunci atau filter risiko.'),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
              sliver: SliverList.separated(
                itemCount: daftar.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) => KartuBarang(
                  b: daftar[i],
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ForecastDetailScreen(c: c, barang: daftar[i]))),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
