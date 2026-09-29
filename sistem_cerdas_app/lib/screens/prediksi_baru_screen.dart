import 'package:flutter/material.dart';

import '../data/adapters.dart';
import '../ml/forecast_pipeline.dart';
import '../ml/runner.dart';
import '../models/models.dart';
import '../state/ai_controller.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/kartu.dart';
import '../widgets/project_picker.dart';
import 'forecast_detail_screen.dart';

/// Menjalankan analisis peramalan langsung dari aplikasi: atur parameter → jalankan → lihat → simpan.
class PrediksiBaruScreen extends StatefulWidget {
  final AiController c;
  const PrediksiBaruScreen({super.key, required this.c});

  @override
  State<PrediksiBaruScreen> createState() => _PrediksiBaruScreenState();
}

enum _Fase { siap, berjalan, selesai, gagal }

class _PrediksiBaruScreenState extends State<PrediksiBaruScreen> {
  int _horizon = 4;
  int _waktuTunggu = 1;
  int _layanan = 95;
  int _riwayat = 52;

  _Fase _fase = _Fase.siap;
  double _p = 0;
  String _label = '';
  String? _galat;
  HasilPrediksi? _hasil;
  HasilRamalan? _tampil;
  int _nTransaksi = 0;
  bool _menyimpan = false;
  String? _infoSimpan;
  TugasBerjalan<HasilPrediksi>? _tugas;

  AiController get c => widget.c;

  @override
  void dispose() {
    _tugas?.batal();
    super.dispose();
  }

  Future<void> _jalankan() async {
    final proyek = c.proyekAktif;
    if (proyek == null) {
      setState(() {
        _fase = _Fase.gagal;
        _galat = 'Pilih proyek terlebih dahulu.';
      });
      return;
    }
    setState(() {
      _fase = _Fase.berjalan;
      _p = 0.02;
      _label = 'Memuat data…';
      _galat = null;
      _hasil = null;
      _infoSimpan = null;
    });
    try {
      final data = await c.repo.muatDataMaterial(proyek.id, minggu: _riwayat);
      if (!mounted) return;
      if (data.items.isEmpty) throw Exception('Proyek ini belum memiliki data barang.');
      _nTransaksi = data.nTransaksi;
      setState(() {
        _p = 0.05;
        _label = 'Menyiapkan ${data.items.length} barang…';
      });
      _tugas = mulaiPrediksi(
        PermintaanPrediksi(
          weeks: data.weeks,
          items: data.items,
          horizon: _horizon,
          nOrigins: 5,
          leadTimeWeeks: _waktuTunggu,
          serviceLevel: _layanan,
          useExog: data.exogTersedia,
        ),
        onProgress: (p, l) {
          if (mounted) {
            setState(() {
              _p = 0.05 + p * 0.95;
              _label = l;
            });
          }
        },
      );
      final hasil = await _tugas!.hasil;
      if (!mounted) return;
      setState(() {
        _hasil = hasil;
        _tampil = hasil.ok ? hasilRamalanDari(hasil, DateTime.now()) : null;
        _fase = hasil.ok ? _Fase.selesai : _Fase.gagal;
        _galat = hasil.alasanGagal;
      });
    } on DibatalkanException {
      if (mounted) setState(() => _fase = _Fase.siap);
    } catch (e) {
      if (mounted) {
        setState(() {
          _fase = _Fase.gagal;
          _galat = e.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _simpan() async {
    final proyek = c.proyekAktif;
    if (proyek == null || _hasil == null) return;
    setState(() {
      _menyimpan = true;
      _infoSimpan = null;
    });
    try {
      final pesan = await c.repo.simpanRamalan(_hasil!, proyek.id);
      await c.muat();
      if (mounted) setState(() => _infoSimpan = pesan);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Gagal menyimpan: ${e.toString().replaceFirst('Exception: ', '')}')));
      }
    } finally {
      if (mounted) setState(() => _menyimpan = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final berjalan = _fase == _Fase.berjalan;
    return PopScope(
      canPop: !berjalan,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final keluar = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Batalkan analisis?'),
            content: const Text('Analisis yang sedang berjalan akan dihentikan.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Lanjutkan')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Batalkan')),
            ],
          ),
        );
        if (keluar == true && context.mounted) {
          _tugas?.batal();
          Navigator.pop(context);
        }
      },
      child: Scaffold(
        appBar: const BrandAppBar(judul: 'Jalankan Prediksi'),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            Text('Peramalan kebutuhan material', style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              'Sistem membandingkan beberapa model pada riwayat pemakaian, memilih yang paling akurat, lalu menyarankan kapan dan berapa banyak harus dipesan.',
              style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.45),
            ),
            const SizedBox(height: 16),
            PilihProyek(c),
            const SizedBox(height: 12),
            KartuBagian(
              judul: 'Parameter analisis',
              child: IgnorePointer(
                ignoring: berjalan,
                child: Opacity(
                  opacity: berjalan ? 0.55 : 1,
                  child: Column(children: [
                    _Param(
                      'Horizon ramalan',
                      'Berapa minggu ke depan yang diramalkan.',
                      SegmenBrand<int>(opsi: const [OpsiSegmen(4, '4 minggu'), OpsiSegmen(8, '8 minggu')], dipilih: _horizon, onChanged: (v) => setState(() => _horizon = v)),
                    ),
                    _Param(
                      'Waktu tunggu pengadaan',
                      'Lama barang tiba sejak dipesan.',
                      SegmenBrand<int>(
                        opsi: const [OpsiSegmen(1, '1 mgg'), OpsiSegmen(2, '2 mgg'), OpsiSegmen(3, '3 mgg'), OpsiSegmen(4, '4 mgg')],
                        dipilih: _waktuTunggu,
                        onChanged: (v) => setState(() => _waktuTunggu = v),
                      ),
                    ),
                    _Param(
                      'Tingkat layanan',
                      'Makin tinggi, stok pengaman makin besar (lebih jarang kehabisan).',
                      SegmenBrand<int>(
                        opsi: const [OpsiSegmen(90, '90%'), OpsiSegmen(95, '95%'), OpsiSegmen(99, '99%')],
                        dipilih: _layanan,
                        onChanged: (v) => setState(() => _layanan = v),
                      ),
                    ),
                    _Param(
                      'Riwayat data dipakai',
                      'Makin panjang riwayat, evaluasi model makin sahih.',
                      SegmenBrand<int>(
                        opsi: const [OpsiSegmen(26, '26 mgg'), OpsiSegmen(39, '39 mgg'), OpsiSegmen(52, '52 mgg')],
                        dipilih: _riwayat,
                        onChanged: (v) => setState(() => _riwayat = v),
                      ),
                      terakhir: true,
                    ),
                  ]),
                ),
              ),
            ),
            const SizedBox(height: 14),
            if (berjalan)
              KartuBagian(
                child: Column(children: [
                  ProgresAnalisis(nilai: _p, label: _label),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(onPressed: () => _tugas?.batal(), icon: const Icon(Icons.stop_circle_outlined), label: const Text('Batalkan')),
                ]),
              )
            else
              FilledButton.icon(
                onPressed: _jalankan,
                icon: Icon(_fase == _Fase.selesai ? Icons.refresh_rounded : Icons.play_arrow_rounded),
                label: Text(_fase == _Fase.selesai ? 'Jalankan ulang' : 'Jalankan analisis'),
              ),
            if (_fase == _Fase.gagal) ...[
              const SizedBox(height: 14),
              Catatan(nada: NadaCatatan.bahaya, judul: 'Analisis tidak dapat diselesaikan', isi: Text(_galat ?? 'Terjadi kesalahan.')),
            ],
            if (_fase == _Fase.selesai && _hasil != null && _tampil != null) ..._hasilView(context),
          ],
        ),
      ),
    );
  }

  List<Widget> _hasilView(BuildContext context) {
    final t = Theme.of(context);
    final h = _hasil!;
    final r = _tampil!;
    final terbaik = h.terbaik;
    final naiveRef = h.evaluasi.where((m) => m.id == 'naive').firstOrNull;
    final skor = [
      for (final m in h.evaluasi)
        SkorModel(nama: m.nama, kelompok: m.kelompok, mae: m.m.mae, rmse: m.m.rmse, wape: m.m.wape, mase: m.m.mase.isFinite ? m.m.mase : null, bias: m.m.bias)
    ]..sort((a, b) => (a.mase ?? 99).compareTo(b.mase ?? 99));
    return [
      const SizedBox(height: 20),
      const SectionHeader('Hasil analisis'),
      Row(children: [
        for (final k in Risiko.values) ...[
          if (k != Risiko.values.first) const SizedBox(width: 8),
          Expanded(child: _RingkasRisiko(k, r.hitung(k))),
        ],
      ]),
      const SizedBox(height: 12),
      KartuBagian(
        judul: 'Model terpilih',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(terbaik?.nama ?? '-', style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          if (terbaik != null && terbaik.mase.isFinite)
            Text(
              terbaik.mase < 1
                  ? 'Galat pengujian (MASE) ${fmtMase(terbaik.mase)}: lebih akurat daripada menebak "sama seperti minggu lalu".'
                  : 'Galat pengujian (MASE) ${fmtMase(terbaik.mase)}: belum lebih baik daripada menebak "sama seperti minggu lalu". Perlakukan ramalan dengan hati-hati.',
              style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4),
            ),
          if (naiveRef != null && terbaik != null && terbaik.id != 'naive' && naiveRef.mase.isFinite && terbaik.mase.isFinite)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Dibanding naive: ${fmtPersen(1 - terbaik.mase / naiveRef.mase)} lebih kecil galatnya.', style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700)),
            ),
          if (h.cakupanInterval != null && h.cakupanInterval!.picp.isFinite)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Ketepatan rentang 80%: ${fmtPersen(h.cakupanInterval!.picp)} realisasi jatuh di dalam rentang (target ±80%).',
                  style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
            ),
          if (_nTransaksi > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Berdasarkan $_nTransaksi transaksi stok keluar, ${h.weeks.length} minggu riwayat.', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
            ),
        ]),
      ),
      const SizedBox(height: 12),
      _KartuSimpan(menyimpan: _menyimpan, info: _infoSimpan, demo: c.repo.isDemo, onSimpan: _simpan, onLihat: () => Navigator.of(context).pop()),
      const SizedBox(height: 16),
      SectionHeader('Rekomendasi per barang (${r.barang.length})'),
      for (final b in r.barang)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: KartuBarang(b: b, onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ForecastDetailScreen(c: c, barang: b)))),
        ),
      const SizedBox(height: 6),
      KartuBagian(judul: 'Perbandingan model (makin pendek makin baik)', child: BilahMase(skor: skor)),
    ];
  }
}

class _Param extends StatelessWidget {
  final String judul;
  final String bantuan;
  final Widget kontrol;
  final bool terakhir;
  const _Param(this.judul, this.bantuan, this.kontrol, {this.terakhir = false});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: terakhir ? 0 : 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(judul, style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
        Text(bantuan, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 8),
        kontrol,
      ]),
    );
  }
}

class _RingkasRisiko extends StatelessWidget {
  final Risiko risiko;
  final int n;
  const _RingkasRisiko(this.risiko, this.n);
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final warna = Palet.risiko(risiko, t.brightness);
    return Semantics(
      label: '${risiko.label}: $n barang',
      excludeSemantics: true,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
          child: Column(children: [
            Icon(Palet.ikonRisiko(risiko), color: warna, size: 20),
            const SizedBox(height: 4),
            Text('$n', style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, height: 1.1)),
            Text(risiko.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: warna, fontWeight: FontWeight.w800, fontSize: 12)),
          ]),
        ),
      ),
    );
  }
}

class _KartuSimpan extends StatelessWidget {
  final bool menyimpan;
  final String? info;
  final bool demo;
  final VoidCallback onSimpan;
  final VoidCallback onLihat;
  const _KartuSimpan({required this.menyimpan, required this.info, required this.demo, required this.onSimpan, required this.onLihat});

  @override
  Widget build(BuildContext context) {
    if (info != null) {
      return Catatan(
        nada: NadaCatatan.sukses,
        judul: 'Hasil disimpan',
        isi: Text('$info\nSekarang tampil di tab Prediksi dan Beranda.'),
        aksi: TextButton(onPressed: onLihat, child: const Text('Lihat')),
      );
    }
    return KartuBagian(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          demo
              ? 'Simpan agar hasil ini tampil di tab Prediksi (mode demo: hanya tersimpan selama aplikasi terbuka).'
              : 'Hasil ini belum tersimpan. Simpan agar dapat dilihat kembali, dibagikan ke Admin lain, dan dipantau akurasinya dari waktu ke waktu.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.4),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: menyimpan ? null : onSimpan,
          icon: menyimpan ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.save_rounded),
          label: Text(menyimpan ? 'Menyimpan…' : 'Simpan hasil ke sistem'),
        ),
      ]),
    );
  }
}
