import 'package:flutter/material.dart';

import '../state/ai_controller.dart';

/// Tombol pemilih proyek; membuka lembar pilihan bila ada lebih dari satu proyek.
class PilihProyek extends StatelessWidget {
  final AiController c;

  /// true bila diletakkan di atas latar gradien gelap (kartu sambutan Beranda).
  final bool padaGradien;
  const PilihProyek(this.c, {super.key, this.padaGradien = false});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final aktif = c.proyekAktif;
    if (aktif == null) return const SizedBox.shrink();
    final bisaGanti = c.proyek.length > 1;
    final warna = padaGradien ? Colors.white : t.colorScheme.primary;
    return Material(
      color: padaGradien ? Colors.white.withValues(alpha: 0.18) : t.colorScheme.primary.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: bisaGanti ? () => _buka(context) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.apartment_rounded, size: 20, color: warna),
            const SizedBox(width: 8),
            Flexible(
              child: Text(aktif.nama,
                  overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w800, color: warna)),
            ),
            if (bisaGanti) Icon(Icons.expand_more_rounded, color: warna),
          ]),
        ),
      ),
    );
  }

  void _buka(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Pilih proyek', style: Theme.of(ctx).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          ),
          for (final p in c.proyek)
            ListTile(
              leading: const Icon(Icons.apartment_rounded),
              title: Text(p.nama),
              trailing: p.id == c.proyekAktif?.id ? const Icon(Icons.check_rounded) : null,
              onTap: () {
                Navigator.pop(ctx);
                c.pilihProyek(p);
              },
            ),
        ]),
      ),
    );
  }
}
