// Uji kesetiaan porting: hasil Dart harus sama dengan kode JS asli (admin-web/src/ml) pada data yang sama.
// Fixture dibuat oleh tool/gen_fixtures.mjs.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sistem_cerdas_app/ml/anomaly_detector.dart';
import 'package:sistem_cerdas_app/ml/baris_data.dart';
import 'package:sistem_cerdas_app/ml/data_sintetis.dart';
import 'package:sistem_cerdas_app/ml/forecast_pipeline.dart';
import 'package:sistem_cerdas_app/ml/stats.dart';
import 'package:sistem_cerdas_app/ml/teks.dart';
import 'package:sistem_cerdas_app/ml/timeseries.dart';

Map<String, dynamic> _muat(String nama) => jsonDecode(File('test/fixtures/$nama').readAsStringSync()) as Map<String, dynamic>;

List<double> _dbl(List l) => [for (final v in l) (v as num).toDouble()];

void main() {
  group('Utilitas', () {
    test('Mulberry32 identik dengan JS (nilai referensi seed 42)', () {
      // Nilai dari: node -e "mulberry32(42)" pada admin-web/src/ml/stats.js
      final r = Mulberry32(42);
      final v = [for (var i = 0; i < 3; i++) r.next()];
      expect(v[0], closeTo(0.6011037519201636, 1e-15));
      expect(v[1], closeTo(0.44829055899754167, 1e-15));
      expect(v[2], closeTo(0.8524657934904099, 1e-15));
    });

    test('weekStart / addWeeks / weekRange', () {
      expect(weekStart('2026-09-26'), '2026-09-21'); // Sabtu → Senin
      expect(weekStart('2026-09-21'), '2026-09-21');
      expect(weekStart('2026-09-27T23:00:00+00:00'), '2026-09-21'); // Minggu
      expect(addWeeks('2026-09-21', -1), '2026-09-14');
      expect(weekRange('2026-09-01', '2026-09-22'), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']);
    });

    test('fmtId meniru toLocaleString id-ID', () {
      expect(fmtId(1234.56), '1.234,6');
      expect(fmtId(1000000, maxDigits: 0), '1.000.000');
      expect(fmtId(0.04), '0');
      expect(fmtId(-2.5), '-2,5');
      expect(fmtRp(4200000), 'Rp 4.200.000');
    });
  });

  group('Peramalan: Dart = JS', () {
    final fx = _muat('material.json');
    final ref = fx['ref'] as Map<String, dynamic>;

    test('generator data material menghasilkan deret yang persis sama', () {
      final g = generateMaterialDemand(items: 18, weeks: 52, seed: 7, endWeek: '2026-09-21');
      expect(g.weeks, (fx['weeks'] as List).cast<String>());
      expect(g.workers, _dbl(fx['workers'] as List));
      final items = fx['items'] as List;
      for (var i = 0; i < items.length; i++) {
        expect(g.items[i].values, _dbl(items[i]['values'] as List), reason: 'barang ${items[i]['nama']}');
        expect(g.items[i].stok, (items[i]['stok'] as num).toDouble());
        expect(g.items[i].stokMinimal, (items[i]['stok_minimal'] as num).toDouble());
      }
    });

    test('pipeline: model terpilih, metrik, ramalan, dan rekomendasi sama dengan JS', () async {
      final weeks = (fx['weeks'] as List).cast<String>();
      final workers = _dbl(fx['workers'] as List);
      final items = [
        for (final it in fx['items'] as List)
          MasukanBarang(
            id: it['id'] as int,
            nama: it['nama'] as String,
            satuan: it['satuan'] as String,
            values: _dbl(it['values'] as List),
            exog: workers,
            stok: (it['stok'] as num).toDouble(),
            stokMinimal: (it['stok_minimal'] as num).toDouble(),
          )
      ];
      final hasil = await jalankanPrediksi(PermintaanPrediksi(weeks: weeks, items: items, horizon: 4, nOrigins: 5, leadTimeWeeks: 1, serviceLevel: 95, useExog: true));

      expect(hasil.ok, true);
      expect(hasil.modelTerbaik, ref['modelTerbaik']);

      // metrik tiap model
      final refEval = {for (final e in ref['evaluasi'] as List) e['id'] as String: e as Map<String, dynamic>};
      expect(hasil.evaluasi.map((m) => m.id).toSet(), refEval.keys.toSet());
      for (final m in hasil.evaluasi) {
        final r = refEval[m.id]!;
        expect(m.mase, closeTo((r['mase'] as num).toDouble(), 1e-9), reason: 'MASE ${m.id}');
        expect(m.rmse, closeTo((r['rmse'] as num).toDouble(), 1e-9), reason: 'RMSE ${m.id}');
        expect(m.m.wape, closeTo((r['wape'] as num).toDouble(), 1e-9), reason: 'WAPE ${m.id}');
        expect(m.m.bias, closeTo((r['bias'] as num).toDouble(), 1e-9), reason: 'bias ${m.id}');
        expect(m.wins, r['wins'], reason: 'kemenangan ${m.id}');
      }

      // cakupan interval
      final cov = ref['cakupan'] as Map<String, dynamic>;
      expect(hasil.cakupanInterval!.picp, closeTo((cov['picp'] as num).toDouble(), 1e-9));
      expect(hasil.cakupanInterval!.width, closeTo((cov['width'] as num).toDouble(), 1e-9));

      // per barang
      final refItems = {for (final e in ref['items'] as List) e['id'] as int: e as Map<String, dynamic>};
      for (final it in hasil.items) {
        final r = refItems[it.id]!;
        expect(it.modelId, r['modelId'], reason: 'model barang ${it.nama}');
        expect(it.pola.category, r['pola']);
        final fc = r['forecast'] as List;
        expect(it.forecast.length, fc.length);
        for (var i = 0; i < fc.length; i++) {
          expect(it.forecast[i].minggu, fc[i]['minggu']);
          expect(it.forecast[i].yhat, closeTo((fc[i]['yhat'] as num).toDouble(), 1e-6), reason: '${it.nama} yhat[$i]');
          expect(it.forecast[i].low, closeTo((fc[i]['low'] as num).toDouble(), 1e-6), reason: '${it.nama} low[$i]');
          expect(it.forecast[i].high, closeTo((fc[i]['high'] as num).toDouble(), 1e-6), reason: '${it.nama} high[$i]');
        }
        final rk = r['rek'] as Map<String, dynamic>;
        expect(it.rekomendasi.risiko, rk['risiko'], reason: 'risiko ${it.nama}');
        expect(it.rekomendasi.safetyStock, (rk['safetyStock'] as num).toDouble());
        expect(it.rekomendasi.reorderPoint, (rk['reorderPoint'] as num).toDouble());
        expect(it.rekomendasi.orderQty, (rk['orderQty'] as num).toDouble());
        expect(it.rekomendasi.stockoutWeek, rk['stockoutWeek']);
        expect(it.rekomendasi.alasan, (rk['alasan'] as List).cast<String>(), reason: 'alasan ${it.nama}');
      }
    });

    test('riwayat terlalu pendek ditolak dengan pesan jelas', () async {
      final r = await jalankanPrediksi(PermintaanPrediksi(
        weeks: List.generate(10, (i) => addWeeks('2026-01-05', i)),
        items: [MasukanBarang(id: 1, nama: 'X', values: List.filled(10, 1), stok: 5, stokMinimal: 1)],
      ));
      expect(r.ok, false);
      expect(r.alasanGagal, contains('terlalu pendek'));
    });
  });

  group('Deteksi anomali: Dart = JS', () {
    final fx = _muat('workforce.json');
    final d = fx['data'] as Map<String, dynamic>;
    final ref = fx['ref'] as Map<String, dynamic>;

    final data = DataKepegawaian(
      karyawan: [
        for (final k in d['karyawan'] as List)
          KaryawanRow(
            id: k['id'] as int,
            nama: k['nama_karyawan'] as String,
            statusAktif: k['status_aktif'] as bool,
            tanggalBergabung: k['tanggal_bergabung'] as String,
            jabatanId: k['jabatan_id'] as int,
            gajiHarian: (k['gaji_harian'] as num).toDouble(),
          )
      ],
      presensi: [for (final p in d['presensi'] as List) PresensiRow.fromJson(Map<String, dynamic>.from(p as Map))],
      lembur: [for (final l in d['lembur'] as List) LemburRow.fromJson(Map<String, dynamic>.from(l as Map))],
      kasbon: [for (final b in d['kasbon'] as List) KasbonRow.fromJson(Map<String, dynamic>.from(b as Map))],
      gaji: const [],
      today: d['today'] as String,
      dari: '2026-07-27',
      sampai: d['today'] as String,
    );

    test('aturan bisnis + statistik: himpunan penanda, skor, dan alasan sama persis dengan JS', () async {
      final hasil = await jalankanDeteksi(PermintaanAnomali(data: data, metode: const MetodeAktif(iforest: false)));
      final refItems = {for (final e in ref['tanpaIf'] as List) e['key'] as String: e as Map<String, dynamic>};
      expect(hasil.items.map((i) => i.key).toSet(), refItems.keys.toSet());
      for (final i in hasil.items) {
        final r = refItems[i.key]!;
        expect(i.skor, closeTo((r['skor'] as num).toDouble(), 1e-9), reason: i.key);
        expect(i.tingkat, r['tingkat'], reason: i.key);
        expect(i.alasan.map((a) => a.kode).toList(), (r['kode'] as List).cast<String>(), reason: 'kode ${i.key}');
        expect(i.alasan.map((a) => a.teks).toList(), (r['teks'] as List).cast<String>(), reason: 'teks ${i.key}');
      }
    });

    test('dengan Isolation Forest: irisan penanda ≥ 90% dari JS (acak berbeda hanya pada urutan fitur)', () async {
      final hasil = await jalankanDeteksi(PermintaanAnomali(data: data));
      final mine = hasil.items.map((i) => i.key).toSet();
      final theirs = {for (final e in ref['semua'] as List) e['key'] as String};
      final irisan = mine.intersection(theirs).length;
      final gabungan = mine.union(theirs).length;
      expect(irisan / gabungan, greaterThanOrEqualTo(0.9), reason: 'Jaccard antara Dart dan JS');
    });

    test('deteksi menemukan mayoritas anomali yang disuntikkan (label sintetis)', () async {
      final hasil = await jalankanDeteksi(PermintaanAnomali(data: data));
      final labels = {for (final e in fx['labels'] as List) e[0] as String: e[1] as String};
      final ditandai = hasil.items.map((i) => i.key).toSet();
      final tp = labels.keys.where(ditandai.contains).length;
      final recall = tp / labels.length;
      final presisi = ditandai.isEmpty ? 0 : tp / ditandai.length;
      // Web (mode sulit, ambang 0,5): presisi ≈ 0,78, recall ≈ 0,92 — Dart harus setara.
      expect(recall, greaterThan(0.8), reason: 'recall');
      expect(presisi, greaterThan(0.65), reason: 'presisi');
    });

    test('status yang sudah ditinjau tidak ditandai lagi', () async {
      final semua = await jalankanDeteksi(PermintaanAnomali(data: data, metode: const MetodeAktif(iforest: false)));
      final ditinjau = {semua.items.first.key};
      final lagi = await jalankanDeteksi(PermintaanAnomali(data: data, metode: const MetodeAktif(iforest: false), reviewed: ditinjau));
      expect(lagi.items.length, semua.items.length - 1);
      expect(lagi.ringkasan.disembunyikan, 1);
    });

    test('generator kepegawaian: label ada dan data tidak kosong', () {
      final g = generateWorkforce(startDate: '2026-07-27', difficulty: 'sulit');
      expect(g.data.presensi, isNotEmpty);
      expect(g.labels.length, greaterThan(20));
      expect(g.labels.keys.every((k) => k.contains(':')), true);
    });
  });
}
