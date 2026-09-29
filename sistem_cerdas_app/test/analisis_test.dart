// Uji alur "jalankan analisis langsung dari aplikasi": isolate, end-to-end pada Mode Demo, dan layar.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:sistem_cerdas_app/data/demo_repository.dart';
import 'package:sistem_cerdas_app/ml/akurasi.dart';
import 'package:sistem_cerdas_app/ml/anomaly_detector.dart';
import 'package:sistem_cerdas_app/ml/forecast_pipeline.dart';
import 'package:sistem_cerdas_app/ml/runner.dart';
import 'package:sistem_cerdas_app/models/models.dart';
import 'package:sistem_cerdas_app/screens/deteksi_baru_screen.dart';
import 'package:sistem_cerdas_app/screens/prediksi_baru_screen.dart';
import 'package:sistem_cerdas_app/state/ai_controller.dart';

PermintaanPrediksi _permintaanDariFixture() {
  final fx = jsonDecode(File('test/fixtures/material.json').readAsStringSync()) as Map<String, dynamic>;
  final workers = [for (final v in fx['workers'] as List) (v as num).toDouble()];
  return PermintaanPrediksi(
    weeks: (fx['weeks'] as List).cast<String>(),
    items: [
      for (final it in fx['items'] as List)
        MasukanBarang(
          id: it['id'] as int,
          nama: it['nama'] as String,
          satuan: it['satuan'] as String,
          values: [for (final v in it['values'] as List) (v as num).toDouble()],
          exog: workers,
          stok: (it['stok'] as num).toDouble(),
          stokMinimal: (it['stok_minimal'] as num).toDouble(),
        )
    ],
    useExog: true,
  );
}

Future<void> _tunggu(WidgetTester t, bool Function() selesai, {int maksDetik = 90}) async {
  for (var i = 0; i < maksDetik * 4 && !selesai(); i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 250)));
    await t.pump(const Duration(milliseconds: 400));
  }
}

void main() {
  setUpAll(() => initializeDateFormatting('id_ID'));

  group('Isolate', () {
    test('hasil di isolate = hasil langsung, dan progres dilaporkan', () async {
      final q = _permintaanDariFixture();
      final langsung = await jalankanPrediksi(q);
      final progres = <double>[];
      final tugas = mulaiPrediksi(q, onProgress: (p, l) => progres.add(p));
      final iso = await tugas.hasil;
      expect(iso.modelTerbaik, langsung.modelTerbaik);
      expect(iso.items.length, langsung.items.length);
      for (var i = 0; i < iso.items.length; i++) {
        expect(iso.items[i].forecast.map((f) => f.yhat).toList(), langsung.items[i].forecast.map((f) => f.yhat).toList());
        expect(iso.items[i].rekomendasi.risiko, langsung.items[i].rekomendasi.risiko);
      }
      expect(progres, isNotEmpty);
      expect(progres.last, closeTo(1, 1e-9));
      expect(progres, orderedEquals([...progres]..sort()), reason: 'progres tidak boleh mundur');
    }, timeout: const Timeout(Duration(seconds: 180)));

    test('pembatalan menghentikan tugas dengan DibatalkanException', () async {
      final tugas = mulaiPrediksi(_permintaanDariFixture());
      tugas.batal();
      await expectLater(tugas.hasil, throwsA(isA<DibatalkanException>()));
    });
  });

  group('Mode Demo end-to-end', () {
    test('prediksi: muat data → analisis → simpan → tampil di controller', () async {
      final repo = DemoAiRepository();
      final c = AiController(repo);
      await c.muat();
      final sebelum = c.ramalan!.barang.length;

      final data = await repo.muatDataMaterial(1);
      expect(data.items.length, 18);
      final hasil = await jalankanPrediksi(PermintaanPrediksi(weeks: data.weeks, items: data.items, useExog: data.exogTersedia));
      expect(hasil.ok, true);

      final pesan = await repo.simpanRamalan(hasil, 1);
      expect(pesan, contains('Tersimpan'));
      await c.muat();
      expect(c.ramalan!.barang.length, 18);
      expect(c.ramalan!.barang.length, isNot(sebelum));
      expect(c.ramalan!.barang.every((b) => b.ramalan.length == 4 && b.riwayat != null && b.riwayat!.isNotEmpty), true);
      // model aktif kini berasal dari analisis yang baru dijalankan
      expect(c.modelRamalanAktif!.evaluasi, isNotEmpty);
      expect(c.modelRamalanAktif!.nama, hasil.terbaik!.nama);
      // urutan: paling berisiko dulu
      final idx = c.ramalan!.barang.map((b) => b.risiko.index).toList();
      expect([...idx]..sort(), idx);
    });

    test('anomali: muat data → deteksi → simpan → tinjauan lama tidak tertimpa', () async {
      final repo = DemoAiRepository();
      final c = AiController(repo);
      await c.muat();
      final tinjauSebelum = c.anomali.where((a) => a.status != StatusTinjauan.baru).length;

      final data = await repo.muatDataKepegawaian(hari: 30);
      final hasil = await jalankanDeteksi(PermintaanAnomali(data: data, reviewed: await repo.kunciDitinjau()));
      final dalam = hasil.items.where((i) => i.tanggal.compareTo(data.dari) >= 0).toList();
      expect(dalam, isNotEmpty);

      final pesan = await repo.simpanAnomali(dalam);
      expect(pesan, contains('penanda baru'));
      await c.muat();
      expect(c.anomali.length, greaterThan(dalam.length ~/ 2));
      expect(c.anomali.where((a) => a.status != StatusTinjauan.baru).length, tinjauSebelum, reason: 'status tinjauan yang sudah ada tidak boleh berubah');

      // Meninjau satu anomali lalu menyimpan ulang analisis yang sama: statusnya tetap.
      final satu = c.anomali.firstWhere((a) => a.status == StatusTinjauan.baru && a.id > 17);
      await c.tinjau(satu, StatusTinjauan.valid, 'ok');
      await repo.simpanAnomali(dalam);
      await c.muat();
      expect(c.anomali.firstWhere((a) => a.id == satu.id).status, StatusTinjauan.valid);
    });

    test('data demo dibuat relatif terhadap hari ini (tidak basi)', () async {
      final repo = DemoAiRepository();
      final m = await repo.muatDataMaterial(1);
      final terakhir = DateTime.parse(m.weeks.last);
      expect(DateTime.now().difference(terakhir).inDays, inInclusiveRange(0, 14));
      final k = await repo.muatDataKepegawaian(hari: 14);
      expect(DateTime.now().difference(DateTime.parse(k.sampai)).inDays, lessThanOrEqualTo(1));
    });
  });

  group('Pemantauan akurasi', () {
    test('hitungAkurasi: WAPE per eksekusi dan deteksi pergeseran', () {
      final rows = <BarisRamalanTersimpan>[];
      final aktual = <String, double>{};
      // 4 eksekusi; tiap eksekusi meramal 1 barang untuk 1 minggu. Galat: 10%, 10%, 10%, 60%.
      const galat = [0.1, 0.1, 0.1, 0.6];
      for (var i = 0; i < 4; i++) {
        final minggu = '2026-0${i + 1}-05';
        rows.add(BarisRamalanTersimpan('2026-0${i + 1}-01', minggu, 1, 7, 100 * (1 + galat[i])));
        aktual['7|$minggu'] = 100;
      }
      final r = hitungAkurasi(rows, aktual, '2026-12-28');
      expect(r.runs.length, 4);
      expect(r.runs.first.wape, closeTo(0.1, 1e-9));
      expect(r.runs.last.wape, closeTo(0.6, 1e-9));
      expect(r.drift.status, 'memburuk');
    });

    test('ramalan untuk minggu yang belum lengkap tidak dinilai', () {
      final r = hitungAkurasi([const BarisRamalanTersimpan('2026-09-01', '2026-10-05', 1, 1, 50)], {}, '2026-09-21');
      expect(r.runs, isEmpty);
      expect(r.drift.status, 'belum_cukup');
    });
  });

  group('Layar analisis', () {
    testWidgets('Prediksi baru: parameter → jalankan → hasil → simpan', (t) async {
      await t.binding.setSurfaceSize(const Size(360, 2400));
      addTearDown(() => t.binding.setSurfaceSize(null));
      final c = AiController(DemoAiRepository());
      await t.runAsync(c.muat);
      await t.pumpWidget(MaterialApp(theme: ThemeData(useMaterial3: true), home: PrediksiBaruScreen(c: c)));
      await t.pump();

      expect(find.text('Parameter analisis'), findsOneWidget);
      expect(find.text('Jalankan analisis'), findsOneWidget);
      await t.tap(find.text('8 minggu'));
      await t.pump();

      await t.tap(find.text('Jalankan analisis'));
      await t.pump();
      expect(find.textContaining('%'), findsWidgets, reason: 'progres tampil');

      await _tunggu(t, () => find.text('Hasil analisis').evaluate().isNotEmpty);
      expect(find.text('Hasil analisis'), findsOneWidget);
      expect(find.text('Model terpilih'), findsOneWidget);
      expect(find.text('Simpan hasil ke sistem'), findsOneWidget);
      expect(t.takeException(), isNull);

      await t.ensureVisible(find.text('Simpan hasil ke sistem'));
      await t.tap(find.text('Simpan hasil ke sistem'));
      await _tunggu(t, () => find.text('Hasil disimpan').evaluate().isNotEmpty, maksDetik: 10);
      expect(find.text('Hasil disimpan'), findsOneWidget);
      expect(c.ramalan!.barang.length, 18);
      expect(c.ramalan!.barang.first.ramalan.length, 8, reason: 'horizon 8 minggu dipakai');
    });

    testWidgets('Deteksi baru: jalankan → hasil ditandai → simpan', (t) async {
      await t.binding.setSurfaceSize(const Size(360, 3000));
      addTearDown(() => t.binding.setSurfaceSize(null));
      final c = AiController(DemoAiRepository());
      await t.runAsync(c.muat);
      await t.pumpWidget(MaterialApp(theme: ThemeData(useMaterial3: true), home: DeteksiBaruScreen(c: c)));
      await t.pump();

      await t.tap(find.text('Jalankan deteksi'));
      await t.pump();
      await _tunggu(t, () => find.text('Hasil deteksi').evaluate().isNotEmpty);
      expect(find.text('Hasil deteksi'), findsOneWidget);
      expect(find.text('Data yang diperiksa'), findsOneWidget);
      expect(find.text('Simpan ke Pusat Tinjauan'), findsOneWidget);
      expect(t.takeException(), isNull);

      final sebelum = c.jumlahBaru;
      await t.ensureVisible(find.text('Simpan ke Pusat Tinjauan'));
      await t.tap(find.text('Simpan ke Pusat Tinjauan'));
      await _tunggu(t, () => find.text('Disimpan ke Pusat Tinjauan').evaluate().isNotEmpty, maksDetik: 10);
      expect(find.text('Disimpan ke Pusat Tinjauan'), findsOneWidget);
      expect(c.jumlahBaru, greaterThan(sebelum));
    });

    testWidgets('Deteksi baru: tanpa metode aktif ditolak dengan pesan', (t) async {
      await t.binding.setSurfaceSize(const Size(360, 3000));
      addTearDown(() => t.binding.setSurfaceSize(null));
      final c = AiController(DemoAiRepository());
      await t.runAsync(c.muat);
      await t.pumpWidget(MaterialApp(theme: ThemeData(useMaterial3: true), home: DeteksiBaruScreen(c: c)));
      await t.pump();
      for (final metode in ['Aturan bisnis', 'Statistik robust', 'Isolation Forest']) {
        await t.tap(find.widgetWithText(SwitchListTile, metode));
        await t.pump();
      }
      await t.tap(find.text('Jalankan deteksi'));
      await t.pump();
      expect(find.text('Aktifkan minimal satu metode deteksi.'), findsOneWidget);
    });
  });
}
