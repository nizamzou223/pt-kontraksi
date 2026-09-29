import 'package:flutter/material.dart';

import '../models/models.dart';
import '../state/ai_controller.dart';
import '../state/app_session.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';
import '../widgets/project_picker.dart';
import 'anomaly_sheet.dart';
import 'forecast_detail_screen.dart';
import 'navigasi.dart';

class HomeTab extends StatelessWidget {
  final AiController c;
  final PenggunaInfo pengguna;
  final ValueChanged<int> keTab;
  const HomeTab({super.key, required this.c, required this.pengguna, required this.keTab});

  @override
  Widget build(BuildContext context) {
    if (c.memuat && c.ramalan == null && c.anomali.isEmpty && c.model.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (c.galatRamalan != null && c.galatAnomali != null && c.galatModel != null) {
      return KeadaanGalat(pesan: c.galatAnomali!, onUlang: c.muat);
    }

    return RefreshIndicator(
      onRefresh: c.muat,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          _Sambutan(c: c, pengguna: pengguna, keTab: keTab),
          const SizedBox(height: 20),
          _AnalisisCepat(c: c),
          const SizedBox(height: 20),
          _KondisiStok(c: c, keTab: keTab),
          const SizedBox(height: 20),
          _PrioritasPesan(c: c),
          const SizedBox(height: 20),
          _AnomaliTeratas(c: c, keTab: keTab),
          const SizedBox(height: 20),
          _KartuModel(c: c, keTab: keTab),
        ],
      ),
    );
  }
}

/// Kartu sambutan bergradien biru (sama dengan gradien logo dan bilah progres web admin).
class _Sambutan extends StatelessWidget {
  final AiController c;
  final PenggunaInfo pengguna;
  final ValueChanged<int> keTab;
  const _Sambutan({required this.c, required this.pengguna, required this.keTab});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final nama = pengguna.nama.split(' ').first;
    final r = c.ramalan;
    final perluPesan = r?.barang.where((x) => x.risiko != Risiko.aman).length;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: Palet.gradienBrand,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [BoxShadow(color: Color(0x404F6FC7), blurRadius: 24, offset: Offset(0, 10))],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Halo, $nama', style: t.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: Colors.white)),
        const SizedBox(height: 2),
        Text(fmtHariTanggal(DateTime.now()), style: t.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.85))),
        const SizedBox(height: 14),
        Row(children: [Expanded(child: PilihProyek(c, padaGradien: true))]),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: _Angka(
              ikon: Icons.gpp_maybe_rounded,
              nilai: c.galatAnomali != null ? '–' : '${c.jumlahBaru}',
              label: 'Anomali baru',
              catatan: c.galatAnomali != null ? 'Gagal dimuat' : '${c.jumlahBaruTinggi} tingkat tinggi',
              onTap: () {
                c.setFilterStatus(StatusTinjauan.baru);
                keTab(2);
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _Angka(
              ikon: Icons.inventory_2_rounded,
              nilai: perluPesan == null ? '–' : '$perluPesan',
              label: 'Stok perlu dipesan',
              catatan: r == null ? 'Belum ada prediksi' : 'dari ${r.barang.length} barang',
              onTap: () {
                c.setFilterRisiko(null);
                keTab(1);
              },
            ),
          ),
        ]),
      ]),
    );
  }
}

class _Angka extends StatelessWidget {
  final IconData ikon;
  final String nilai;
  final String label;
  final String catatan;
  final VoidCallback onTap;
  const _Angka({required this.ikon, required this.nilai, required this.label, required this.catatan, required this.onTap});

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: '$label: $nilai, $catatan',
        excludeSemantics: true,
        child: Material(
          color: Colors.white.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(ikon, color: Colors.white, size: 20),
                const SizedBox(height: 8),
                Text(nilai, style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800, height: 1)),
                const SizedBox(height: 4),
                Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13.5)),
                Text(catatan, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12)),
              ]),
            ),
          ),
        ),
      );
}

/// Dua tombol besar untuk menjalankan analisis langsung dari aplikasi.
class _AnalisisCepat extends StatelessWidget {
  final AiController c;
  const _AnalisisCepat({required this.c});

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionHeader('Jalankan analisis'),
      _AksiBesar(
        ikon: Icons.query_stats_rounded,
        judul: 'Prediksi kebutuhan material',
        isi: 'Ramal pemakaian 4–8 minggu ke depan dan dapatkan saran kapan & berapa banyak memesan.',
        onTap: () => bukaPrediksiBaru(context, c),
      ),
      const SizedBox(height: 10),
      _AksiBesar(
        ikon: Icons.radar_rounded,
        judul: 'Deteksi anomali kepegawaian',
        isi: 'Periksa presensi, lembur, kasbon, dan gaji untuk menemukan data yang tidak wajar.',
        onTap: () => bukaDeteksiBaru(context, c),
      ),
    ]);
  }
}

class _AksiBesar extends StatelessWidget {
  final IconData ikon;
  final String judul;
  final String isi;
  final VoidCallback onTap;
  const _AksiBesar({required this.ikon, required this.judul, required this.isi, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(gradient: Palet.gradienBrand, borderRadius: BorderRadius.circular(16)),
              child: Icon(ikon, color: Colors.white, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(judul, style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text(isi, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.35)),
              ]),
            ),
            const SizedBox(width: 6),
            Icon(Icons.play_circle_fill_rounded, color: t.colorScheme.primary, size: 32),
          ]),
        ),
      ),
    );
  }
}

class _KondisiStok extends StatelessWidget {
  final AiController c;
  final ValueChanged<int> keTab;
  const _KondisiStok({required this.c, required this.keTab});

  @override
  Widget build(BuildContext context) {
    final b = Theme.of(context).brightness;
    final r = c.ramalan;
    return KartuBagian(
      judul: 'Kondisi stok material',
      trailing: r == null ? null : Text('Analisis ${fmtTanggal(r.dibuatPada)}', style: Theme.of(context).textTheme.bodySmall),
      child: c.galatRamalan != null
          ? Text(c.galatRamalan!)
          : r == null
              ? const Text('Belum ada hasil prediksi untuk proyek ini. Ketuk "Prediksi kebutuhan material" di atas untuk menjalankannya.')
              : Column(children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      height: 14,
                      child: Row(children: [
                        for (final k in Risiko.values)
                          if (r.hitung(k) > 0) Expanded(flex: r.hitung(k), child: Container(color: Palet.risiko(k, b))),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 12),
                  for (final k in Risiko.values)
                    InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () {
                        c.setFilterRisiko(k);
                        keTab(1);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
                        child: Row(children: [
                          Icon(Palet.ikonRisiko(k), size: 20, color: Palet.risiko(k, b)),
                          const SizedBox(width: 10),
                          Expanded(child: Text(k.label, style: const TextStyle(fontWeight: FontWeight.w600))),
                          Text('${r.hitung(k)} barang', style: const TextStyle(fontWeight: FontWeight.w800)),
                          const Icon(Icons.chevron_right_rounded, size: 20),
                        ]),
                      ),
                    ),
                ]),
    );
  }
}

class _PrioritasPesan extends StatelessWidget {
  final AiController c;
  const _PrioritasPesan({required this.c});

  @override
  Widget build(BuildContext context) {
    final r = c.ramalan;
    final daftar = r?.barang.where((x) => x.perluDipesan).take(3).toList() ?? const <BarangRamalan>[];
    if (daftar.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionHeader('Prioritas pemesanan'),
      for (final x in daftar)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Card(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ForecastDetailScreen(c: c, barang: x))),
              title: Text(x.nama, style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text('Pesan ±${fmtBulat(x.jumlahDisarankan)} ${x.satuan}'
                  '${x.risiko == Risiko.habis ? ' · stok sudah habis' : x.perkiraanHabis != null ? ' · habis ${fmtRelatif(x.perkiraanHabis!)}' : ''}'),
              trailing: RisikoChip(x.risiko),
            ),
          ),
        ),
    ]);
  }
}

class _AnomaliTeratas extends StatelessWidget {
  final AiController c;
  final ValueChanged<int> keTab;
  const _AnomaliTeratas({required this.c, required this.keTab});

  @override
  Widget build(BuildContext context) {
    final daftar = c.anomali.where((a) => a.status == StatusTinjauan.baru).take(3).toList();
    if (daftar.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionHeader('Anomali teratas', aksi: 'Lihat semua', onAksi: () {
        c.setFilterStatus(StatusTinjauan.baru);
        keTab(2);
      }),
      for (final a in daftar)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Card(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              onTap: () => tampilkanAnomali(context, c, a),
              leading: SkorLingkaran(skor: a.skor, tingkat: a.tingkat, ukuran: 44),
              title: Text(a.karyawan ?? 'Karyawan tidak diketahui', style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text('${a.sumberLabel} · ${fmtTanggal(a.tanggal)}\n${a.ringkas}', maxLines: 3, overflow: TextOverflow.ellipsis),
              isThreeLine: true,
            ),
          ),
        ),
    ]);
  }
}

class _KartuModel extends StatelessWidget {
  final AiController c;
  final ValueChanged<int> keTab;
  const _KartuModel({required this.c, required this.keTab});

  @override
  Widget build(BuildContext context) {
    final m = c.modelRamalanAktif;
    if (m == null) return const SizedBox.shrink();
    final terbaik = m.terbaik;
    final t = Theme.of(context);
    return KartuBagian(
      judul: 'Model peramalan aktif',
      trailing: TextButton(onPressed: () => keTab(3), child: const Text('Detail')),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(m.nama, style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        if (terbaik?.mase != null)
          Text(
            terbaik!.mase! < 1
                ? 'Galat ${fmtMase(terbaik.mase!)}× ramalan sederhana — lebih akurat dari tebakan "sama seperti minggu lalu".'
                : 'Galat ${fmtMase(terbaik.mase!)}× ramalan sederhana — belum lebih baik dari tebakan "sama seperti minggu lalu".',
            style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant),
          ),
      ]),
    );
  }
}
