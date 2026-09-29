import 'package:flutter/material.dart';

import '../models/models.dart';
import '../state/ai_controller.dart';
import '../widgets/common.dart';
import '../widgets/kartu.dart';
import 'anomaly_sheet.dart';
import 'navigasi.dart';

class AnomalyTab extends StatefulWidget {
  final AiController c;
  const AnomalyTab({super.key, required this.c});

  @override
  State<AnomalyTab> createState() => _AnomalyTabState();
}

class _AnomalyTabState extends State<AnomalyTab> {
  Tingkat? _tingkat;
  String _cari = '';

  AiController get c => widget.c;

  @override
  Widget build(BuildContext context) {
    if (c.memuat && c.anomali.isEmpty && c.galatAnomali == null) return const Center(child: CircularProgressIndicator());
    if (c.galatAnomali != null) return KeadaanGalat(pesan: c.galatAnomali!, onUlang: c.muat);

    final kata = _cari.trim().toLowerCase();
    final daftar = c.anomali.where((a) {
      if (c.filterStatus != null && a.status != c.filterStatus) return false;
      if (_tingkat != null && a.tingkat != _tingkat) return false;
      return kata.isEmpty || (a.karyawan ?? '').toLowerCase().contains(kata) || a.sumberLabel.toLowerCase().contains(kata);
    }).toList();
    final t = Theme.of(context);

    return RefreshIndicator(
      onRefresh: c.muat,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (c.jumlahBaru > 0)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Catatan(isi: Text('${c.jumlahBaru} data menunggu tinjauan Anda. Ketuk untuk melihat alasan lalu tandai.', style: const TextStyle(fontWeight: FontWeight.w700))),
                  ),
                TextField(
                  onChanged: (v) => setState(() => _cari = v),
                  decoration: const InputDecoration(hintText: 'Cari nama karyawan atau jenis data', prefixIcon: Icon(Icons.search_rounded), contentPadding: EdgeInsets.symmetric(vertical: 12)),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    ChipPilihan(label: 'Semua (${c.anomali.length})', dipilih: c.filterStatus == null, onTap: () => c.setFilterStatus(null)),
                    for (final s in StatusTinjauan.values) ...[
                      const SizedBox(width: 8),
                      ChipPilihan(label: '${s.label} (${c.hitungStatus(s)})', dipilih: c.filterStatus == s, onTap: () => c.setFilterStatus(c.filterStatus == s ? null : s)),
                    ],
                  ]),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    Text('Tingkat:', style: t.textTheme.bodySmall),
                    const SizedBox(width: 8),
                    ChipPilihan(label: 'Semua', dipilih: _tingkat == null, onTap: () => setState(() => _tingkat = null)),
                    for (final k in Tingkat.values) ...[
                      const SizedBox(width: 8),
                      ChipPilihan(label: k.label, dipilih: _tingkat == k, onTap: () => setState(() => _tingkat = _tingkat == k ? null : k)),
                    ],
                  ]),
                ),
                const SizedBox(height: 10),
              ]),
            ),
          ),
          if (daftar.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: c.anomali.isEmpty
                  ? KeadaanKosong(
                      ikon: Icons.verified_user_rounded,
                      judul: 'Belum ada anomali tercatat',
                      pesan: 'Jalankan deteksi sekarang untuk memeriksa presensi, lembur, kasbon, dan gaji.',
                      aksi: 'Jalankan deteksi',
                      onAksi: () => bukaDeteksiBaru(context, c),
                    )
                  : KeadaanKosong(
                      ikon: Icons.task_alt_rounded,
                      judul: c.filterStatus == StatusTinjauan.baru && kata.isEmpty && _tingkat == null ? 'Semua sudah ditinjau' : 'Tidak ada data',
                      pesan: 'Tidak ada anomali yang cocok dengan filter saat ini.',
                      aksi: 'Tampilkan semua',
                      onAksi: () {
                        setState(() {
                          _tingkat = null;
                          _cari = '';
                        });
                        c.setFilterStatus(null);
                      },
                    ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
              sliver: SliverList.separated(
                itemCount: daftar.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) => KartuAnomali(a: daftar[i], onTap: () => tampilkanAnomali(context, c, daftar[i])),
              ),
            ),
        ],
      ),
    );
  }
}
