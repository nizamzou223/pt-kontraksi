import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sistem_cerdas_app/data/demo_repository.dart';
import 'package:sistem_cerdas_app/models/models.dart';
import 'package:sistem_cerdas_app/screens/anomaly_tab.dart';
import 'package:sistem_cerdas_app/screens/forecast_detail_screen.dart';
import 'package:sistem_cerdas_app/screens/forecast_tab.dart';
import 'package:sistem_cerdas_app/screens/home_tab.dart';
import 'package:sistem_cerdas_app/state/app_session.dart';
import 'package:sistem_cerdas_app/screens/model_tab.dart';
import 'package:sistem_cerdas_app/state/ai_controller.dart';

Widget _bungkus(Widget child) => MaterialApp(
      theme: ThemeData(useMaterial3: true),
      home: Scaffold(body: child),
    );

void main() {
  setUpAll(() => initializeDateFormatting('id_ID'));

  group('Parsing data Supabase', () {
    test('Anomali.fromRow membaca alasan, metode, dan relasi', () {
      final a = Anomali.fromRow({
        'id': 7,
        'sumber_tabel': 'lembur',
        'sumber_id': 55,
        'tanggal': '2026-09-20',
        'skor': '0.9312',
        'tingkat': 'tinggi',
        'status_tinjauan': 'baru',
        'alasan': [
          {'kode': 'X', 'tingkat': 'tinggi', 'teks': 'Lembur 9 jam', 'bobot': 0.9, 'metode': 'aturan bisnis'}
        ],
        'metode': ['aturan bisnis'],
        'karyawan': {'nama_karyawan': 'Budi'},
        'project': {'nama_project': 'Gedung A'},
      });
      expect(a.skor, closeTo(0.9312, 1e-9));
      expect(a.tingkat, Tingkat.tinggi);
      expect(a.status, StatusTinjauan.baru);
      expect(a.karyawan, 'Budi');
      expect(a.sumberLabel, 'Lembur');
      expect(a.ringkas, 'Lembur 9 jam');
      expect(a.metode, ['aturan bisnis']);
    });

    test('InfoModel.evaluasi diurutkan dari MASE terkecil', () {
      final m = InfoModel.fromRow({
        'id': 1,
        'jenis': 'forecast',
        'nama_model': 'GB',
        'versi': '2026-09-25',
        'aktif': true,
        'metrik': {
          'evaluasi': [
            {'nama': 'B', 'mase': 1.3},
            {'nama': 'A', 'mase': 0.9},
          ],
          'cakupanInterval': 0.8,
        },
      });
      expect(m.evaluasi.map((e) => e.nama), ['A', 'B']);
      expect(m.terbaik!.mase, 0.9);
      expect(m.cakupanInterval, 0.8);
    });

    test('nilai kosong/tidak terduga tidak membuat crash', () {
      final a = Anomali.fromRow({'id': 1, 'alasan': 'teks biasa', 'metode': null, 'skor': null});
      expect(a.alasan, isEmpty);
      expect(a.status, StatusTinjauan.baru);
      expect(asTextList({'alasan': 1}), isEmpty);
      expect(asTextList(['a', {'teks': 'b'}]), ['a', 'b']);
    });
  });

  group('AiController (repositori demo)', () {
    late AiController c;
    setUp(() async {
      c = AiController(DemoAiRepository());
      await c.muat();
    });

    test('memuat proyek, ramalan, anomali, dan model', () {
      expect(c.memuat, false);
      expect(c.proyek.length, 2);
      expect(c.ramalan, isNotNull);
      expect(c.ramalan!.barang, isNotEmpty);
      expect(c.anomali, isNotEmpty);
      expect(c.model.any((m) => m.jenis == 'forecast'), true);
      expect(c.galatRamalan, isNull);
    });

    test('keempat tingkat risiko muncul dan daftar terurut dari yang paling berisiko', () {
      final r = c.ramalan!;
      for (final k in Risiko.values) {
        expect(r.hitung(k), greaterThan(0), reason: 'risiko ${k.name} harus ada pada data demo');
      }
      final idx = r.barang.map((b) => b.risiko.index).toList();
      expect([...idx]..sort(), idx);
    });

    test('barang aman tidak disarankan dipesan', () {
      for (final b in c.ramalan!.barang.where((b) => b.risiko == Risiko.aman)) {
        expect(b.perluDipesan, false);
      }
    });

    test('tinjau mengubah status dan menghitung presisi dari tinjauan', () async {
      final baru = c.anomali.where((a) => a.status == StatusTinjauan.baru).toList();
      final sebelum = c.jumlahBaru;
      await c.tinjau(baru.first, StatusTinjauan.valid, '  dikonfirmasi  ');
      expect(c.jumlahBaru, sebelum - 1);
      final diperbarui = c.anomali.firstWhere((a) => a.id == baru.first.id);
      expect(diperbarui.status, StatusTinjauan.valid);
      expect(diperbarui.catatan, 'dikonfirmasi');
      expect(diperbarui.ditinjauPada, isNotNull);

      // Kembalikan ke baru → cap waktu & catatan kosong dibersihkan.
      await c.tinjau(diperbarui, StatusTinjauan.baru, '');
      final kembali = c.anomali.firstWhere((a) => a.id == baru.first.id);
      expect(kembali.status, StatusTinjauan.baru);
      expect(kembali.catatan, isNull);
      expect(kembali.ditinjauPada, isNull);
      expect(c.jumlahBaru, sebelum);
    });

    test('presisi = valid / (valid + bukan anomali)', () {
      final v = c.hitungStatus(StatusTinjauan.valid);
      final b = c.hitungStatus(StatusTinjauan.bukanAnomali);
      expect(c.presisiTinjauan, closeTo(v / (v + b), 1e-9));
    });

    test('ganti proyek memuat ramalan proyek lain', () async {
      final awal = c.ramalan;
      await c.pilihProyek(c.proyek.last);
      expect(c.proyekAktif!.id, c.proyek.last.id);
      expect(identical(c.ramalan, awal), false);
    });

    test('mingguCukup = stok / rata-rata ramalan mingguan', () {
      final b = c.ramalan!.barang.firstWhere((b) => b.stok > 0);
      expect(b.mingguCukup, closeTo(b.stok / (b.totalRamalan / b.ramalan.length), 1e-9));
    });
  });

  group('Tampilan', () {
    late AiController c;
    setUp(() async {
      c = AiController(DemoAiRepository());
      await c.muat();
    });

    testWidgets('Beranda: ringkasan dan navigasi ke tab lain', (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 2200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      int? tujuan;
      await tester.pumpWidget(_bungkus(ListenableBuilder(
        listenable: c,
        builder: (_, __) => HomeTab(
          c: c,
          pengguna: const PenggunaInfo(nama: 'Nadya Akuntugas', peran: 'admin', email: 'a@b.c'),
          keTab: (i) => tujuan = i,
        ),
      )));
      await tester.pumpAndSettle();

      expect(find.textContaining('Halo, Nadya'), findsOneWidget);
      expect(find.text('Anomali baru'), findsOneWidget);
      expect(find.text('Kondisi stok material'), findsOneWidget);
      expect(find.text('Prioritas pemesanan'), findsOneWidget);

      await tester.tap(find.text('Anomali baru'));
      expect(tujuan, 2);
      expect(c.filterStatus, StatusTinjauan.baru);
    });

    testWidgets('tab Prediksi: filter risiko dan pencarian bekerja', (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(_bungkus(ListenableBuilder(listenable: c, builder: (_, __) => ForecastTab(c: c))));
      await tester.pumpAndSettle();

      expect(find.textContaining('Semua (12)'), findsOneWidget);
      expect(find.text('Semen Portland 50kg'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'pasir');
      await tester.pumpAndSettle();
      expect(find.text('Pasir Beton'), findsOneWidget);
      expect(find.text('Semen Portland 50kg'), findsNothing);

      await tester.enterText(find.byType(TextField), 'zzz-tidak-ada');
      await tester.pumpAndSettle();
      expect(find.text('Barang tidak ditemukan'), findsOneWidget);
    });

    testWidgets('detail prediksi menampilkan grafik dan rekomendasi', (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 2600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final b = c.ramalan!.barang.first;
      await tester.pumpWidget(MaterialApp(theme: ThemeData(useMaterial3: true), home: ForecastDetailScreen(c: c, barang: b)));
      await tester.pumpAndSettle(const Duration(seconds: 1));

      expect(find.text(b.nama), findsOneWidget);
      expect(find.text('Angka kunci'), findsOneWidget);
      expect(find.text('Mengapa saran ini?'), findsOneWidget);
      expect(find.text('Ramalan per minggu'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('tab Anomali: buka rincian lalu tandai valid', (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(_bungkus(ListenableBuilder(listenable: c, builder: (_, __) => AnomalyTab(c: c))));
      await tester.pumpAndSettle();

      final baruAwal = c.jumlahBaru;
      expect(baruAwal, greaterThan(0));

      final teratas = c.anomali.firstWhere((a) => a.status == StatusTinjauan.baru);
      await tester.tap(find.text(teratas.karyawan!).first);
      await tester.pumpAndSettle();
      expect(find.text('Mengapa ditandai?'), findsOneWidget);

      await tester.tap(find.text('Benar, ini anomali'));
      await tester.pumpAndSettle();
      expect(c.jumlahBaru, baruAwal - 1);
      expect(find.text('Mengapa ditandai?'), findsNothing);
      expect(find.textContaining('Ditandai "Valid"'), findsOneWidget);
    });

    testWidgets('tab Model: kedua bagian tampil tanpa galat', (tester) async {
      await tester.binding.setSurfaceSize(const Size(360, 1400));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(_bungkus(ListenableBuilder(listenable: c, builder: (_, __) => ModelTab(c: c))));
      await tester.pumpAndSettle();
      expect(find.text('Model aktif'), findsOneWidget);
      expect(find.textContaining('Perbandingan model'), findsOneWidget);

      await tester.tap(find.text('Anomali'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Ketepatan menurut tinjauan Anda'), findsOneWidget);
      expect(find.text('Cara sistem mendeteksi'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
