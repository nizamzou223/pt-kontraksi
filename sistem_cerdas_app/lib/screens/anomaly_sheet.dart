import 'package:flutter/material.dart';

import '../models/models.dart';
import '../state/ai_controller.dart';
import '../theme.dart';
import '../utils/format.dart';
import '../widgets/common.dart';

/// Membuka lembar rincian anomali dan tinjauan admin.
Future<void> tampilkanAnomali(BuildContext context, AiController c, Anomali a, {bool bisaTinjau = true}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _LembarAnomali(c: c, anomali: a, bisaTinjau: bisaTinjau),
  );
}

class _LembarAnomali extends StatefulWidget {
  final AiController c;
  final Anomali anomali;
  final bool bisaTinjau;
  const _LembarAnomali({required this.c, required this.anomali, this.bisaTinjau = true});

  @override
  State<_LembarAnomali> createState() => _LembarAnomaliState();
}

class _LembarAnomaliState extends State<_LembarAnomali> {
  late final TextEditingController _catatan;
  bool _proses = false;

  Anomali get a => widget.anomali;

  @override
  void initState() {
    super.initState();
    _catatan = TextEditingController(text: a.catatan ?? '');
  }

  @override
  void dispose() {
    _catatan.dispose();
    super.dispose();
  }

  Future<void> _tinjau(StatusTinjauan status) async {
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    setState(() => _proses = true);
    try {
      await widget.c.tinjau(a, status, _catatan.text);
      nav.pop();
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(SnackBar(
        content: Text(status == StatusTinjauan.baru ? 'Dikembalikan ke "Baru".' : 'Ditandai "${status.label}".'),
        action: status == StatusTinjauan.baru
            ? null
            : SnackBarAction(
                label: 'Urungkan',
                onPressed: () => widget.c.tinjau(a, StatusTinjauan.baru, a.catatan),
              ),
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _proses = false);
      messenger.showSnackBar(SnackBar(content: Text('Gagal menyimpan: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final b = t.brightness;
    final sudahDitinjau = a.status != StatusTinjauan.baru;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            SkorLingkaran(skor: a.skor, tingkat: a.tingkat, ukuran: 64),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(a.karyawan ?? 'Karyawan tidak diketahui', style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                Text('${a.sumberLabel} · ${fmtTanggal(a.tanggal)}', style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                if (a.proyek != null) Text(a.proyek!, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 6, children: [
            TingkatChip(a.tingkat),
            if (widget.bisaTinjau) StatusChip(a.status),
            for (final m in a.metode) InfoChip(m, ikon: Icons.psychology_alt_rounded),
          ]),
          const SizedBox(height: 18),
          Text('Mengapa ditandai?', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (a.alasan.isEmpty) const Text('Tidak ada rincian alasan.'),
          for (final r in a.alasan)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Palet.tingkat(r.tingkat, b).withValues(alpha: 0.09),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r.teks, style: const TextStyle(height: 1.4, fontWeight: FontWeight.w600)),
                if (r.metode != null)
                  Padding(padding: const EdgeInsets.only(top: 6), child: Text('Metode: ${r.metode}', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant))),
              ]),
            ),
          Text(
            'Skor ${(a.skor * 100).round()} dari 100: makin tinggi makin tidak lazim. Sistem hanya menandai — keputusan akhir ada pada Anda.',
            style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4),
          ),
          const Divider(height: 32),
          if (!widget.bisaTinjau)
            const Catatan(
              judul: 'Belum tersimpan',
              isi: Text('Simpan hasil deteksi ke Pusat Tinjauan terlebih dahulu, lalu tinjau dari tab Anomali.'),
            )
          else ...[
          Text(sudahDitinjau ? 'Tinjauan Anda' : 'Apa kesimpulan Anda?', style: t.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          if (sudahDitinjau && a.ditinjauPada != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text('Ditinjau ${fmtTanggalJam(a.ditinjauPada!)}', style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
            ),
          const SizedBox(height: 10),
          TextField(
            controller: _catatan,
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Catatan (opsional)', hintText: 'Mis. sudah dikonfirmasi ke mandor'),
          ),
          const SizedBox(height: 14),
          if (_proses)
            const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator()))
          else ...[
            FilledButton.icon(
              onPressed: () => _tinjau(StatusTinjauan.valid),
              icon: const Icon(Icons.flag_rounded),
              label: const Text('Benar, ini anomali'),
              style: FilledButton.styleFrom(backgroundColor: Palet.status(StatusTinjauan.valid, b), foregroundColor: Colors.white),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _tinjau(StatusTinjauan.bukanAnomali),
              icon: const Icon(Icons.thumb_up_alt_rounded),
              label: const Text('Bukan anomali (wajar)'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _tinjau(StatusTinjauan.diabaikan),
              icon: const Icon(Icons.visibility_off_rounded),
              label: const Text('Abaikan'),
            ),
            if (sudahDitinjau) ...[
              const SizedBox(height: 6),
              TextButton(onPressed: () => _tinjau(StatusTinjauan.baru), child: const Text('Kembalikan ke "Baru"')),
            ],
          ],
          const SizedBox(height: 10),
          Text(
            'Tanda "Bukan anomali" dan "Abaikan" membuat data ini tidak ditandai lagi pada analisis berikutnya. Tanda "Benar" dipakai untuk mengukur ketepatan sistem.',
            style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.4),
          ),
          ],
        ]),
      ),
    );
  }
}
