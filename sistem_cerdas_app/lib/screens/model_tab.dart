import 'package:flutter/material.dart';

import '../ml/akurasi.dart';
import '../models/models.dart';
import '../state/ai_controller.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/kartu.dart';

class ModelTab extends StatefulWidget {
  final AiController c;
  const ModelTab({super.key, required this.c});

  @override
  State<ModelTab> createState() => _ModelTabState();
}

class _ModelTabState extends State<ModelTab> {
  int _bagian = 0; // 0 = peramalan, 1 = anomali
  Future<AkurasiRamalan>? _akurasi;
  int? _akurasiProyek;

  AiController get c => widget.c;

  Future<AkurasiRamalan> _muatAkurasi(int projectId) {
    if (_akurasi == null || _akurasiProyek != projectId) {
      _akurasiProyek = projectId;
      _akurasi = c.repo.akurasiRamalan(projectId);
    }
    return _akurasi!;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        _akurasi = null;
        await c.muat();
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          SegmenBrand<int>(
            opsi: const [OpsiSegmen(0, 'Peramalan', Icons.inventory_2_rounded), OpsiSegmen(1, 'Anomali', Icons.gpp_maybe_rounded)],
            dipilih: _bagian,
            onChanged: (v) => setState(() => _bagian = v),
          ),
          const SizedBox(height: 16),
          if (_bagian == 0) ..._peramalan(context) else ..._anomali(context),
        ],
      ),
    );
  }

  // ───────────────────────── Peramalan ─────────────────────────
  List<Widget> _peramalan(BuildContext context) {
    final t = Theme.of(context);
    final m = c.modelRamalanAktif;
    if (c.galatModel != null) return [KeadaanGalat(pesan: c.galatModel!, onUlang: c.muat)];
    if (m == null) {
      return const [
        KeadaanKosong(
          ikon: Icons.model_training_rounded,
          judul: 'Belum ada model tersimpan',
          pesan: 'Model muncul setelah analisis prediksi dijalankan dan disimpan. Buka tab Prediksi lalu ketuk "Prediksi baru".',
        ),
      ];
    }
    final skor = m.evaluasi;
    final terbaik = m.terbaik;
    final cakupan = m.cakupanInterval;
    final proyek = c.proyekAktif;
    return [
      KartuBagian(
        judul: 'Model aktif',
        trailing: InfoChip('Versi ${m.versi}', ikon: Icons.tag_rounded),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(m.nama, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (m.dataDari != null && m.dataSampai != null) BarisNilai('Data latih', '${fmtTanggal(m.dataDari!)} – ${fmtTanggal(m.dataSampai!)}'),
          if (m.dilatihPada != null) BarisNilai('Dilatih pada', fmtTanggal(m.dilatihPada!)),
          if (terbaik?.mase != null) BarisNilai('Galat pengujian (MASE)', fmtMase(terbaik!.mase!)),
          if (cakupan != null) BarisNilai('Ketepatan rentang 80%', fmtPersen(cakupan)),
        ]),
      ),
      if (skor.isNotEmpty) ...[
        const SizedBox(height: 16),
        KartuBagian(judul: 'Perbandingan model (makin pendek makin baik)', child: BilahMase(skor: skor)),
      ],
      if (proyek != null) ...[
        const SizedBox(height: 16),
        FutureBuilder<AkurasiRamalan>(
          future: _muatAkurasi(proyek.id),
          builder: (context, snap) => _KartuAkurasi(snap: snap),
        ),
      ],
      const SizedBox(height: 16),
      const _PanduanIstilah(),
    ];
  }

  // ───────────────────────── Anomali ─────────────────────────
  List<Widget> _anomali(BuildContext context) {
    final t = Theme.of(context);
    final b = t.brightness;
    if (c.galatAnomali != null) return [KeadaanGalat(pesan: c.galatAnomali!, onUlang: c.muat)];
    final presisi = c.presisiTinjauan;
    final perSumber = <String, int>{};
    for (final a in c.anomali) {
      perSumber[a.sumberLabel] = (perSumber[a.sumberLabel] ?? 0) + 1;
    }
    final urut = perSumber.entries.toList()..sort((x, y) => y.value.compareTo(x.value));
    final maks = urut.isEmpty ? 1 : urut.first.value;

    return [
      KartuBagian(
        judul: 'Ketepatan menurut tinjauan Anda',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (presisi == null)
            Text('Belum ada anomali yang ditinjau. Tandai beberapa anomali di tab Anomali agar ketepatan sistem dapat dihitung.', style: t.textTheme.bodyMedium?.copyWith(height: 1.4))
          else ...[
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(fmtPersen(presisi), style: t.textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800, height: 1)),
              const SizedBox(width: 10),
              Expanded(child: Text('tanda yang Anda nilai benar-benar anomali (presisi)', style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant))),
            ]),
            const SizedBox(height: 12),
            BilahProgres(nilai: presisi, warna: Palet.status(StatusTinjauan.bukanAnomali, b)),
          ],
          const SizedBox(height: 14),
          Wrap(spacing: 12, runSpacing: 8, children: [
            for (final s in StatusTinjauan.values) _StatusDenganJumlah(s, c.hitungStatus(s)),
          ]),
          const SizedBox(height: 10),
          Text('Presisi = Valid ÷ (Valid + Bukan anomali). Status "Baru" dan "Diabaikan" tidak dihitung.', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4)),
        ]),
      ),
      if (urut.isNotEmpty) ...[
        const SizedBox(height: 16),
        KartuBagian(
          judul: 'Anomali menurut jenis data',
          child: Column(children: [
            for (final e in urut)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(children: [
                  SizedBox(width: 110, child: Text(e.key, style: const TextStyle(fontWeight: FontWeight.w600))),
                  Expanded(child: BilahProgres(nilai: e.value / maks, warna: t.colorScheme.primary)),
                  SizedBox(width: 34, child: Text('${e.value}', textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w800))),
                ]),
              ),
          ]),
        ),
      ],
      const SizedBox(height: 16),
      const KartuBagian(
        judul: 'Cara sistem mendeteksi',
        child: Column(children: [
          _Metode(ikon: Icons.rule_rounded, judul: 'Aturan bisnis', isi: 'Memeriksa pelanggaran yang pasti, mis. jam keluar lebih awal dari jam masuk, lembur melebihi batas PP 35/2021, atau kasbon terlalu besar.'),
          _Metode(ikon: Icons.stacked_line_chart_rounded, judul: 'Statistik robust', isi: 'Membandingkan dengan kebiasaan karyawan itu sendiri dan rekan sejabatan; menandai nilai yang jauh menyimpang.'),
          _Metode(ikon: Icons.forest_rounded, judul: 'Isolation Forest', isi: 'Model pembelajaran mesin yang mencari kombinasi nilai yang jarang terjadi, walaupun tidak melanggar aturan.'),
        ]),
      ),
      const SizedBox(height: 16),
      KartuBagian(
        judul: 'Hasil pengujian (data sintetis, tingkat sulit)',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const _BarisUji('Aturan bisnis saja', 0.789),
          const _BarisUji('Statistik robust saja', 0.632),
          const _BarisUji('Isolation Forest saja', 0.280),
          const _BarisUji('Hibrida (ketiganya)', 0.847, tebal: true),
          const SizedBox(height: 8),
          Text(
            'Nilai F1 dari eksperimen admin-web/ml-experiments. Anomali disuntikkan oleh generator yang sama dengan asumsi detektor, sehingga ini menguji mekanisme — bukan bukti kinerja di lapangan.',
            style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4),
          ),
        ]),
      ),
    ];
  }
}

class _StatusDenganJumlah extends StatelessWidget {
  final StatusTinjauan s;
  final int n;
  const _StatusDenganJumlah(this.s, this.n);
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        StatusChip(s),
        const SizedBox(width: 6),
        Text('$n', style: const TextStyle(fontWeight: FontWeight.w800)),
      ]);
}

/// Akurasi ramalan tersimpan dibanding pemakaian nyata + deteksi pergeseran (drift).
class _KartuAkurasi extends StatelessWidget {
  final AsyncSnapshot<AkurasiRamalan> snap;
  const _KartuAkurasi({required this.snap});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    Widget isi;
    if (snap.connectionState != ConnectionState.done) {
      isi = const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()));
    } else if (snap.hasError) {
      isi = Text('Tidak dapat memuat pemantauan akurasi: ${snap.error}', style: t.textTheme.bodyMedium);
    } else {
      final a = snap.data!;
      final nada = switch (a.drift.status) {
        'memburuk' => NadaCatatan.peringatan,
        'stabil' => NadaCatatan.sukses,
        _ => NadaCatatan.info,
      };
      isi = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Catatan(nada: nada, isi: Text(a.drift.pesan)),
        for (final r in a.runs.reversed.take(4)) ...[
          const SizedBox(height: 10),
          BarisNilai('Ramalan ${fmtTanggal(DateTime.parse(r.dibuatPada))}', r.wape == null ? '—' : 'galat ${fmtPersen(r.wape!)} · ${r.n} titik'),
        ],
      ]);
    }
    return KartuBagian(judul: 'Akurasi ramalan vs kenyataan', child: isi);
  }
}

class _Metode extends StatelessWidget {
  final IconData ikon;
  final String judul;
  final String isi;
  const _Metode({required this.ikon, required this.judul, required this.isi});
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: t.colorScheme.primaryContainer, borderRadius: BorderRadius.circular(12)),
          child: Icon(ikon, size: 20, color: t.colorScheme.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(judul, style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 2),
            Text(isi, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4)),
          ]),
        ),
      ]),
    );
  }
}

class _BarisUji extends StatelessWidget {
  final String nama;
  final double f1;
  final bool tebal;
  const _BarisUji(this.nama, this.f1, {this.tebal = false});
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [
        SizedBox(width: 150, child: Text(nama, style: TextStyle(fontWeight: tebal ? FontWeight.w800 : FontWeight.w500))),
        Expanded(child: BilahProgres(nilai: f1, warna: tebal ? t.colorScheme.primary : t.colorScheme.outline)),
        SizedBox(width: 44, child: Text(fmtAngka(f1), textAlign: TextAlign.end, style: TextStyle(fontWeight: FontWeight.w800, color: tebal ? t.colorScheme.primary : null))),
      ]),
    );
  }
}

class _PanduanIstilah extends StatelessWidget {
  const _PanduanIstilah();
  @override
  Widget build(BuildContext context) {
    const item = <(String, String)>[
      ('MASE', 'Galat dibanding tebakan "sama seperti minggu lalu". Di bawah 1 = lebih akurat dari tebakan itu.'),
      ('WAPE', 'Total selisih ramalan dan kenyataan dibagi total pemakaian nyata. Makin kecil makin baik.'),
      ('RMSE', 'Rata-rata besar selisih, dengan hukuman lebih berat untuk selisih besar. Satuannya sama dengan barang.'),
      ('Bias', 'Kecenderungan meramal terlalu tinggi (positif) atau terlalu rendah (negatif).'),
      ('Rentang 80%', 'Batas bawah–atas yang diperkirakan memuat pemakaian nyata dengan peluang sekitar 80%.'),
    ];
    return Card(
      child: ExpansionTile(
        shape: const Border(),
        collapsedShape: const Border(),
        leading: const Icon(Icons.menu_book_rounded),
        title: const Text('Apa arti istilah ini?', style: TextStyle(fontWeight: FontWeight.w800)),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final (k, v) in item)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Text.rich(TextSpan(children: [
                TextSpan(text: '$k — ', style: const TextStyle(fontWeight: FontWeight.w800)),
                TextSpan(text: v),
              ]), style: const TextStyle(height: 1.4)),
            ),
        ],
      ),
    );
  }
}
