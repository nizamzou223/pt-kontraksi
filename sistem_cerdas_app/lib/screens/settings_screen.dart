import 'package:flutter/material.dart';

import '../config.dart';
import '../state/app_session.dart';
import '../widgets/common.dart';
import '../widgets/kartu.dart' show tampilkanLegendaRisiko;

class SettingsScreen extends StatelessWidget {
  final AppSession session;
  const SettingsScreen({super.key, required this.session});

  Future<void> _keluar(BuildContext context) async {
    final ya = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Keluar dari akun?'),
        content: const Text('Anda perlu masuk kembali untuk membuka data.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), style: FilledButton.styleFrom(minimumSize: const Size(90, 44)), child: const Text('Keluar')),
        ],
      ),
    );
    if (ya == true) {
      if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
      await session.keluar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final p = session.pengguna!;
    return Scaffold(
      appBar: const BrandAppBar(judul: 'Pengaturan'),
      body: ListenableBuilder(
        listenable: session,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            KartuBagian(
              child: Row(children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: t.colorScheme.primary.withValues(alpha: 0.14),
                  child: Text(p.nama.isEmpty ? '?' : p.nama[0].toUpperCase(), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22, color: t.colorScheme.primary)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(p.nama, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                    Text(p.peranLabel, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                    Text(p.email, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 16),
            KartuBagian(
              judul: 'Tampilan',
              child: SegmenBrand<ThemeMode>(
                opsi: const [
                  OpsiSegmen(ThemeMode.system, 'Otomatis', Icons.brightness_auto_rounded),
                  OpsiSegmen(ThemeMode.light, 'Terang', Icons.light_mode_rounded),
                  OpsiSegmen(ThemeMode.dark, 'Gelap', Icons.dark_mode_rounded),
                ],
                dipilih: session.tema,
                onChanged: session.setTema,
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Column(children: [
                ListTile(
                  leading: const Icon(Icons.help_outline_rounded),
                  title: const Text('Arti tingkat risiko stok'),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => tampilkanLegendaRisiko(context),
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.storage_rounded),
                  title: const Text('Sumber data'),
                  subtitle: Text(p.demo ? 'Data contoh (mode demo)' : Uri.parse(AppConfig.supabaseUrl).host),
                ),
                const Divider(),
                const ListTile(
                  leading: Icon(Icons.info_outline_rounded),
                  title: Text('Tentang aplikasi'),
                  subtitle: Text('Sistem Cerdas PT Krakatau Indah v1.0.0\nMenampilkan hasil analisis dari web admin; tidak mengubah data operasional.'),
                  isThreeLine: true,
                ),
              ]),
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () => _keluar(context),
              icon: const Icon(Icons.logout_rounded),
              label: Text(p.demo ? 'Keluar dari mode demo' : 'Keluar'),
            ),
          ],
        ),
      ),
    );
  }
}
