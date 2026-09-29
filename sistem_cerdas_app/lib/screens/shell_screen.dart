import 'package:flutter/material.dart';

import '../state/ai_controller.dart';
import '../state/app_session.dart';
import '../widgets/common.dart';
import 'anomaly_tab.dart';
import 'forecast_tab.dart';
import 'home_tab.dart';
import 'model_tab.dart';
import 'navigasi.dart';
import 'settings_screen.dart';

/// Kerangka utama: empat tab dengan bilah navigasi bawah.
class ShellScreen extends StatefulWidget {
  final AppSession session;
  const ShellScreen({super.key, required this.session});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  late final AiController _c;
  int _tab = 0;

  static const _judul = ['Sistem Cerdas', 'Prediksi Stok Material', 'Anomali Kepegawaian', 'Model & Akurasi'];

  @override
  void initState() {
    super.initState();
    _c = AiController(widget.session.repo!, userId: widget.session.pengguna?.id)..muat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _keTab(int i) => setState(() => _tab = i);

  Widget? _tombolAksi() {
    if (_tab == 1) {
      return FloatingActionButton.extended(
        onPressed: () => bukaPrediksiBaru(context, _c),
        icon: const Icon(Icons.play_arrow_rounded),
        label: const Text('Prediksi baru'),
      );
    }
    if (_tab == 2) {
      return FloatingActionButton.extended(
        onPressed: () => bukaDeteksiBaru(context, _c),
        icon: const Icon(Icons.play_arrow_rounded),
        label: const Text('Deteksi baru'),
      );
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final demo = widget.session.pengguna?.demo ?? false;
    return Scaffold(
      appBar: BrandAppBar(
        judul: _judul[_tab],
        logo: _tab == 0,
        aksi: [
          IconButton(
            tooltip: 'Pengaturan',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => SettingsScreen(session: widget.session))),
          ),
        ],
      ),
      floatingActionButton: _tombolAksi(),
      body: Column(children: [
        if (demo) const PitaDemo(),
        Expanded(
          child: ListenableBuilder(
            listenable: _c,
            builder: (context, _) => IndexedStack(index: _tab, children: [
              HomeTab(c: _c, pengguna: widget.session.pengguna!, keTab: _keTab),
              ForecastTab(c: _c),
              AnomalyTab(c: _c),
              ModelTab(c: _c),
            ]),
          ),
        ),
      ]),
      bottomNavigationBar: ListenableBuilder(
        listenable: _c,
        builder: (context, _) => NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: _keTab,
          destinations: [
            const NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard_rounded), label: 'Beranda'),
            const NavigationDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2_rounded), label: 'Prediksi'),
            NavigationDestination(
              icon: Badge(isLabelVisible: _c.jumlahBaru > 0, label: Text('${_c.jumlahBaru}'), child: const Icon(Icons.gpp_maybe_outlined)),
              selectedIcon: Badge(isLabelVisible: _c.jumlahBaru > 0, label: Text('${_c.jumlahBaru}'), child: const Icon(Icons.gpp_maybe_rounded)),
              label: 'Anomali',
            ),
            const NavigationDestination(icon: Icon(Icons.analytics_outlined), selectedIcon: Icon(Icons.analytics_rounded), label: 'Model'),
          ],
        ),
      ),
    );
  }
}
