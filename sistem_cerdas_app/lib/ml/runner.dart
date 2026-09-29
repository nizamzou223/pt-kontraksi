// Menjalankan analisis di isolate terpisah agar layar tetap mulus (Android/iOS). Di web isolate
// tidak tersedia, sehingga analisis berjalan langsung dengan jeda kecil antar langkah.
import 'dart:async';
import 'dart:isolate';

import 'package:flutter/foundation.dart' show kIsWeb;

import 'anomaly_detector.dart';
import 'forecast_pipeline.dart';

typedef LaporProgres = void Function(double p, String label);

/// Tugas yang sedang berjalan: tunggu [hasil], atau hentikan dengan [batal].
class TugasBerjalan<T> {
  final Future<T> hasil;
  final void Function() batal;
  const TugasBerjalan(this.hasil, this.batal);
}

class DibatalkanException implements Exception {
  @override
  String toString() => 'Analisis dibatalkan.';
}

TugasBerjalan<HasilPrediksi> mulaiPrediksi(PermintaanPrediksi q, {LaporProgres? onProgress}) =>
    _mulai<HasilPrediksi>(0, q, onProgress);

TugasBerjalan<HasilAnomali> mulaiDeteksi(PermintaanAnomali q, {LaporProgres? onProgress}) =>
    _mulai<HasilAnomali>(1, q, onProgress);

Future<Object> _kerjakan(int jenis, Object payload, LaporProgres? prog) => jenis == 0
    ? jalankanPrediksi(payload as PermintaanPrediksi, onProgress: prog)
    : jalankanDeteksi(payload as PermintaanAnomali, onProgress: prog);

TugasBerjalan<T> _mulai<T>(int jenis, Object payload, LaporProgres? onProgress) {
  final selesai = Completer<T>();

  if (kIsWeb) {
    var batal = false;
    () async {
      try {
        final r = await _kerjakan(jenis, payload, (p, l) {
          if (batal) throw DibatalkanException();
          onProgress?.call(p, l);
        });
        if (!selesai.isCompleted) selesai.complete(r as T);
      } catch (e) {
        if (!selesai.isCompleted) selesai.completeError(e);
      }
    }();
    return TugasBerjalan(selesai.future, () {
      batal = true;
      if (!selesai.isCompleted) selesai.completeError(DibatalkanException());
    });
  }

  final port = ReceivePort();
  Isolate? isolate;
  var dibatalkan = false;

  void bersihkan() {
    port.close();
    isolate?.kill(priority: Isolate.immediate);
  }

  port.listen((m) {
    if (m is! List) return;
    switch (m[0]) {
      case 'p':
        onProgress?.call(m[1] as double, m[2] as String);
      case 'ok':
        if (!selesai.isCompleted) selesai.complete(m[1] as T);
        bersihkan();
      case 'err':
        if (!selesai.isCompleted) selesai.completeError(Exception(m[1]));
        bersihkan();
    }
  });

  Isolate.spawn(_masuk, [port.sendPort, jenis, payload]).then((i) {
    isolate = i;
    if (dibatalkan) bersihkan();
  }).catchError((Object e) {
    if (!selesai.isCompleted) selesai.completeError(e);
    port.close();
  });

  return TugasBerjalan(selesai.future, () {
    dibatalkan = true;
    if (!selesai.isCompleted) selesai.completeError(DibatalkanException());
    bersihkan();
  });
}

Future<void> _masuk(List<Object?> a) async {
  final kirim = a[0] as SendPort;
  try {
    final hasil = await _kerjakan(a[1] as int, a[2]!, (p, l) => kirim.send(['p', p, l]));
    kirim.send(['ok', hasil]);
  } catch (e) {
    kirim.send(['err', e.toString()]);
  }
}
