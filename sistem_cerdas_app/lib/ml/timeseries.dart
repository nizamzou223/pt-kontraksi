// Utilitas deret waktu mingguan. Semua tanggal diproses sebagai tanggal kalender UTC ('YYYY-MM-DD')
// agar hasil tidak bergantung zona waktu perangkat. Port dari admin-web/src/ml/timeseries.js.
import 'stats.dart';

const _hari = Duration.millisecondsPerDay;

int utcMs(String dateStr) {
  final p = dateStr.substring(0, 10).split('-');
  return DateTime.utc(int.parse(p[0]), int.parse(p[1]), int.parse(p[2])).millisecondsSinceEpoch;
}

String fmtIso(int ms) {
  final d = DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true);
  return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

String isoDate(DateTime d) {
  final u = d.toUtc();
  return '${u.year.toString().padLeft(4, '0')}-${u.month.toString().padLeft(2, '0')}-${u.day.toString().padLeft(2, '0')}';
}

String addDays(String dateStr, int n) => fmtIso(utcMs(dateStr) + n * _hari);

/// Senin awal minggu (ISO) dari tanggal / timestamp — hasil 'YYYY-MM-DD'.
String weekStart(String dateStr) {
  final ms = utcMs(dateStr);
  final dow = (DateTime.fromMillisecondsSinceEpoch(ms, isUtc: true).weekday - 1); // Senin = 0
  return fmtIso(ms - dow * _hari);
}

String addWeeks(String weekStr, int n) => fmtIso(utcMs(weekStr) + n * 7 * _hari);

/// Daftar Senin dari minggu `from` sampai minggu `to` (inklusif).
List<String> weekRange(String from, String to) {
  final out = <String>[];
  final last = weekStart(to);
  for (var w = weekStart(from); w.compareTo(last) <= 0; w = addWeeks(w, 1)) {
    out.add(w);
  }
  return out;
}

class BarisTanggal {
  final String tanggal;
  final double nilai;
  const BarisTanggal(this.tanggal, this.nilai);
}

/// Menjumlahkan transaksi menjadi deret mingguan; minggu tanpa transaksi diisi 0 EKSPLISIT.
({List<String> weeks, List<double> values}) weeklySeries(List<BarisTanggal> rows, {required String from, required String to}) {
  final weeks = weekRange(from, to);
  final index = {for (var i = 0; i < weeks.length; i++) weeks[i]: i};
  final values = List<double>.filled(weeks.length, 0);
  for (final r in rows) {
    final i = index[weekStart(r.tanggal)];
    if (i != null) values[i] += r.nilai;
  }
  return (weeks: weeks, values: values);
}

class PolaPermintaan {
  final double adi;
  final double cv2;
  final int nonZero;
  final String category; // smooth | erratic | intermittent | lumpy | jarang
  const PolaPermintaan(this.adi, this.cv2, this.nonZero, this.category);

  String get label => switch (category) {
        'smooth' => 'Stabil',
        'erratic' => 'Berfluktuasi',
        'intermittent' => 'Putus-putus',
        'lumpy' => 'Sporadis & besar',
        _ => 'Sangat jarang dipakai',
      };
}

/// Klasifikasi pola permintaan (Syntetos–Boylan): ambang ADI 1,32 dan CV² 0,49.
PolaPermintaan intermittency(List<double> values) {
  final nz = values.where((v) => v > 0).toList();
  if (nz.length < 2) {
    return PolaPermintaan(nz.isNotEmpty ? values.length.toDouble() : double.infinity, 0, nz.length, 'jarang');
  }
  final adi = values.length / nz.length;
  final m = mean(nz);
  var varNz = 0.0;
  for (final v in nz) {
    varNz += (v - m) * (v - m);
  }
  varNz /= nz.length;
  final cv2 = m > 0 ? varNz / (m * m) : 0.0;
  final cat = adi < 1.32 ? (cv2 < 0.49 ? 'smooth' : 'erratic') : (cv2 < 0.49 ? 'intermittent' : 'lumpy');
  return PolaPermintaan(adi, cv2, nz.length, cat);
}

/// Skala MASE: rata-rata |selisih| pada data latih (pembanding naive satu langkah).
double naiveScale(List<double> train) {
  if (train.length < 2) return 0;
  var s = 0.0;
  for (var i = 1; i < train.length; i++) {
    s += (train[i] - train[i - 1]).abs();
  }
  return s / (train.length - 1);
}
