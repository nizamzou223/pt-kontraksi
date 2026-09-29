import 'package:flutter/material.dart';

import '../data/adapters.dart';
import '../ml/anomaly_detector.dart';
import '../ml/runner.dart';
import '../models/models.dart';
import '../state/ai_controller.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/kartu.dart';
import '../widgets/project_picker.dart';
import 'anomaly_sheet.dart';

/// Menjalankan deteksi anomali data kepegawaian langsung dari aplikasi.
class DeteksiBaruScreen extends StatefulWidget {
  final AiController c;
  const DeteksiBaruScreen({super.key, required this.c});

  @override
  State<DeteksiBaruScreen> createState() => _DeteksiBaruScreenState();
}

enum _Fase { siap, berjalan, selesai, gagal }

class _DeteksiBaruScreenState extends State<DeteksiBaruScreen> {
  int _hari = 30;
  bool _semuaProyek = false;
  double _ambang = 0.5;
  bool _aturan = true;
  bool _statistik = true;
  bool _iforest = true;

  _Fase _fase = _Fase.siap;
  double _p = 0;
  String _label = '';
  String? _galat;
  List<Anomali> _items = const [];
  List<ItemAnomali> _mentah = const [];
  HasilAnomali? _hasil;
  Map<String, int> _diperiksa = const {};
  Tingkat? _filterTingkat;
  bool _menyimpan = false;
  String? _infoSimpan;
  TugasBerjalan<HasilAnomali>? _tugas;

  AiController get c => widget.c;

  @override
  void dispose() {
    _tugas?.batal();
    super.dispose();
  }

  Future<void> _jalankan() async {
    if (!_aturan && !_statistik && !_iforest) {
      setState(() {
        _fase = _Fase.gagal;
        _galat = 'Aktifkan minimal satu metode deteksi.';
      });
      return;
    }
    setState(() {
      _fase = _Fase.berjalan;
      _p = 0.03;
      _label = 'Memuat data kepegawaian…';
      _galat = null;
      _infoSimpan = null;
      _filterTingkat = null;
    });
    try {
      final proyek = c.proyekAktif;
      final data = await c.repo.muatDataKepegawaian(projectId: _semuaProyek ? null : proyek?.id, hari: _hari);
      if (!mounted) return;
      setState(() {
        _p = 0.1;
        _label = 'Memeriksa tinjauan sebelumnya…';
      });
      final ditinjau = await c.repo.kunciDitinjau();
      if (!mounted) return;
      _tugas = mulaiDeteksi(
        PermintaanAnomali(data: data, threshold: _ambang, metode: MetodeAktif(aturan: _aturan, statistik: _statistik, iforest: _iforest), reviewed: ditinjau),
        onProgress: (p, l) {
          if (mounted) {
            setState(() {
              _p = 0.1 + p * 0.9;
              _label = l;
            });
          }
        },
      );
      final hasil = await _tugas!.hasil;
      if (!mounted) return;
      // Riwayat sebelum periode hanya untuk baseline → laporkan hanya tanggal dalam periode.
      final dalam = hasil.items.where((i) => i.tanggal.compareTo(data.dari) >= 0).toList();
      bool masuk(String tgl) => tgl.compareTo(data.dari) >= 0;
      setState(() {
        _hasil = hasil;
        _mentah = dalam;
        _items = [for (var i = 0; i < dalam.length; i++) anomaliDari(dalam[i], id: -(i + 1), proyekNama: _namaProyek(dalam[i].projectId))];
        _diperiksa = {
          'Presensi': data.presensi.where((p) => p.metodeInput != 'otomatis' && masuk(p.tanggal)).length,
          'Lembur': data.lembur.where((l) => !RegExp(r'^otomatis', caseSensitive: false).hasMatch(l.catatan ?? '') && masuk(l.tanggal)).length,
          'Kasbon': data.kasbon.where((k) => masuk(k.tanggalKasbon)).length,
          'Gaji mingguan': data.gaji.where((g) => masuk(g.periodeMulai)).length,
        };
        _fase = _Fase.selesai;
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

  String? _namaProyek(int? id) {
    for (final p in c.proyek) {
      if (p.id == id) return p.nama;
    }
    return _semuaProyek ? null : c.proyekAktif?.nama;
  }

  Future<void> _simpan() async {
    setState(() {
      _menyimpan = true;
      _infoSimpan = null;
    });
    try {
      final pesan = await c.repo.simpanAnomali(_mentah, projectIdDefault: _semuaProyek ? null : c.proyekAktif?.id);
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
            title: const Text('Batalkan deteksi?'),
            content: const Text('Proses yang sedang berjalan akan dihentikan.'),
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
        appBar: const BrandAppBar(judul: 'Jalankan Deteksi Anomali'),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            Text('Deteksi anomali kepegawaian', style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              'Memeriksa presensi, lembur, kasbon, dan gaji dengan aturan bisnis, statistik, dan machine learning. Sistem hanya memberi tanda — keputusan akhir ada pada Anda.',
              style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.45),
            ),
            const SizedBox(height: 16),
            KartuBagian(
              judul: 'Parameter analisis',
              child: IgnorePointer(
                ignoring: berjalan,
                child: Opacity(
                  opacity: berjalan ? 0.55 : 1,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Periode diperiksa', style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    SegmenBrand<int>(
                      opsi: const [OpsiSegmen(7, '7 hari'), OpsiSegmen(14, '14 hari'), OpsiSegmen(30, '30 hari'), OpsiSegmen(60, '60 hari')],
                      dipilih: _hari,
                      onChanged: (v) => setState(() => _hari = v),
                    ),
                    const SizedBox(height: 16),
                    Text('Cakupan', style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    SegmenBrand<bool>(
                      opsi: const [OpsiSegmen(false, 'Proyek aktif', Icons.apartment_rounded), OpsiSegmen(true, 'Semua proyek', Icons.public_rounded)],
                      dipilih: _semuaProyek,
                      onChanged: (v) => setState(() => _semuaProyek = v),
                    ),
                    if (!_semuaProyek) ...[const SizedBox(height: 10), PilihProyek(c)],
                    const SizedBox(height: 16),
                    Row(children: [
                      Expanded(child: Text('Ambang skor penanda', style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800))),
                      Text(fmtAngka(_ambang), style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: t.colorScheme.primary)),
                    ]),
                    Text('Makin rendah, makin banyak yang ditandai (lebih sensitif, lebih banyak salah tandai).', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                    Slider(
                      value: _ambang,
                      min: 0.3,
                      max: 0.9,
                      divisions: 12,
                      label: fmtAngka(_ambang),
                      onChanged: (v) => setState(() => _ambang = double.parse(v.toStringAsFixed(2))),
                    ),
                    Text('Metode deteksi', style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w800)),
                    _Sakelar('Aturan bisnis', 'Pelanggaran pasti: jam keluar < masuk, lembur melebihi PP 35/2021, kasbon terlalu besar.', _aturan, (v) => setState(() => _aturan = v)),
                    _Sakelar('Statistik robust', 'Nilai yang jauh menyimpang dari kebiasaan karyawan dan rekan sejabatan.', _statistik, (v) => setState(() => _statistik = v)),
                    _Sakelar('Isolation Forest', 'Model ML untuk kombinasi nilai yang jarang, meski tidak melanggar aturan.', _iforest, (v) => setState(() => _iforest = v)),
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
                label: Text(_fase == _Fase.selesai ? 'Jalankan ulang' : 'Jalankan deteksi'),
              ),
            if (_fase == _Fase.gagal) ...[
              const SizedBox(height: 14),
              Catatan(nada: NadaCatatan.bahaya, judul: 'Deteksi tidak dapat diselesaikan', isi: Text(_galat ?? 'Terjadi kesalahan.')),
            ],
            if (_fase == _Fase.selesai) ..._hasilView(context),
          ],
        ),
      ),
    );
  }

  List<Widget> _hasilView(BuildContext context) {
    final t = Theme.of(context);
    final b = t.brightness;
    final tampil = _items.where((a) => _filterTingkat == null || a.tingkat == _filterTingkat).toList();
    int n(Tingkat k) => _items.where((a) => a.tingkat == k).length;
    final h = _hasil!;
    return [
      const SizedBox(height: 20),
      const SectionHeader('Hasil deteksi'),
      IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(child: StatTile(ikon: Icons.gpp_maybe_rounded, label: 'Ditandai', nilai: '${_items.length}', warna: t.colorScheme.primary)),
          const SizedBox(width: 10),
          Expanded(child: _MiniTingkat(Tingkat.tinggi, n(Tingkat.tinggi), b)),
          const SizedBox(width: 10),
          Expanded(child: _MiniTingkat(Tingkat.sedang, n(Tingkat.sedang), b)),
          const SizedBox(width: 10),
          Expanded(child: _MiniTingkat(Tingkat.rendah, n(Tingkat.rendah), b)),
        ]),
      ),
      const SizedBox(height: 12),
      KartuBagian(
        judul: 'Data yang diperiksa',
        child: Column(children: [
          for (final e in _diperiksa.entries) BarisNilai(e.key, '${fmtBulat(e.value)} data'),
          if (h.ringkasan.dikecualikan['presensi_otomatis']! + h.ringkasan.dikecualikan['lembur_otomatis']! > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                'Dikecualikan: ${h.ringkasan.dikecualikan['presensi_otomatis']} presensi otomatis dan ${h.ringkasan.dikecualikan['lembur_otomatis']} lembur bentukan sistem (bukan input manusia).',
                style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4),
              ),
            ),
          if (h.ringkasan.disembunyikan > 0)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('${h.ringkasan.disembunyikan} data disembunyikan karena sebelumnya sudah ditinjau "bukan anomali"/"diabaikan".',
                  style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4)),
            ),
        ]),
      ),
      const SizedBox(height: 12),
      if (_items.isEmpty)
        const Catatan(nada: NadaCatatan.sukses, judul: 'Tidak ada anomali', isi: Text('Tidak ada data yang melewati ambang skor pada periode ini.'))
      else ...[
        _KartuSimpan(menyimpan: _menyimpan, info: _infoSimpan, demo: c.repo.isDemo, onSimpan: _simpan, onLihat: () => Navigator.of(context).pop()),
        const SizedBox(height: 16),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            ChipPilihan(label: 'Semua (${_items.length})', dipilih: _filterTingkat == null, onTap: () => setState(() => _filterTingkat = null)),
            for (final k in Tingkat.values) ...[
              const SizedBox(width: 8),
              ChipPilihan(label: '${k.label} (${n(k)})', dipilih: _filterTingkat == k, onTap: () => setState(() => _filterTingkat = _filterTingkat == k ? null : k)),
            ],
          ]),
        ),
        const SizedBox(height: 12),
        for (final a in tampil)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: KartuAnomali(a: a, onTap: () => tampilkanAnomali(context, c, a, bisaTinjau: false)),
          ),
      ],
    ];
  }
}

class _MiniTingkat extends StatelessWidget {
  final Tingkat tingkat;
  final int n;
  final Brightness b;
  const _MiniTingkat(this.tingkat, this.n, this.b);
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Semantics(
      label: 'Tingkat ${tingkat.label}: $n',
      excludeSemantics: true,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('$n', style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, height: 1)),
            const SizedBox(height: 6),
            Text(tingkat.label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Theme.of(context).brightness == Brightness.dark ? Colors.white70 : Colors.black87)),
            const SizedBox(height: 6),
            Container(height: 4, width: 28, decoration: BoxDecoration(color: _warna(context), borderRadius: BorderRadius.circular(4))),
          ]),
        ),
      ),
    );
  }

  Color _warna(BuildContext context) => switch (tingkat) {
        Tingkat.tinggi => const Color(0xFFE06A6A),
        Tingkat.sedang => const Color(0xFFE8A23A),
        Tingkat.rendah => const Color(0xFF5B9BD5),
      };
}

class _Sakelar extends StatelessWidget {
  final String judul;
  final String bantuan;
  final bool nilai;
  final ValueChanged<bool> onChanged;
  const _Sakelar(this.judul, this.bantuan, this.nilai, this.onChanged);
  @override
  Widget build(BuildContext context) => SwitchListTile(
        contentPadding: EdgeInsets.zero,
        dense: true,
        title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(bantuan, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.35)),
        value: nilai,
        onChanged: onChanged,
      );
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
        judul: 'Disimpan ke Pusat Tinjauan',
        isi: Text('$info\nSekarang dapat ditinjau di tab Anomali.'),
        aksi: TextButton(onPressed: onLihat, child: const Text('Lihat')),
      );
    }
    return KartuBagian(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          demo
              ? 'Simpan agar anomali ini tampil di tab Anomali dan dapat ditinjau (mode demo: hanya tersimpan selama aplikasi terbuka).'
              : 'Simpan agar anomali ini masuk Pusat Tinjauan dan dapat Anda tandai benar/bukan. Hasil tinjauan Anda dipakai mengukur ketepatan sistem.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.4),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: menyimpan ? null : onSimpan,
          icon: menyimpan ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Icon(Icons.save_rounded),
          label: Text(menyimpan ? 'Menyimpan…' : 'Simpan ke Pusat Tinjauan'),
        ),
      ]),
    );
  }
}
