import 'package:intl/intl.dart';

final _angka = NumberFormat('#,##0.#', 'id_ID');
final _angkaBulat = NumberFormat('#,##0', 'id_ID');
final _tgl = DateFormat('d MMM yyyy', 'id_ID');
final _tglPendek = DateFormat('d MMM', 'id_ID');
final _hariTanggal = DateFormat('EEEE, d MMMM yyyy', 'id_ID');
final _tglJam = DateFormat('d MMM yyyy, HH:mm', 'id_ID');

/// 1234.5 → "1.234,5"
String fmtAngka(num v) => _angka.format(v);
/// 0.887 → "0,89" (metrik galat perlu 2 desimal agar model dapat dibandingkan)
String fmtMase(num v) => v.toStringAsFixed(2).replaceAll('.', ',');
String fmtBulat(num v) => _angkaBulat.format(v.round());
String fmtTanggal(DateTime d) => _tgl.format(d);
String fmtTglPendek(DateTime d) => _tglPendek.format(d);
String fmtHariTanggal(DateTime d) => _hariTanggal.format(d);
String fmtTanggalJam(DateTime d) => _tglJam.format(d.toLocal());

/// 0.864 → "86%"
String fmtPersen(double v, {int digit = 0}) => '${(v * 100).toStringAsFixed(digit).replaceAll('.', ',')}%';

/// Berapa hari dari hari ini: "hari ini", "besok", "3 hari lagi", "2 hari lalu".
String fmtRelatif(DateTime d) {
  final now = DateTime.now();
  final selisih = DateTime(d.year, d.month, d.day).difference(DateTime(now.year, now.month, now.day)).inDays;
  if (selisih == 0) return 'hari ini';
  if (selisih == 1) return 'besok';
  if (selisih == -1) return 'kemarin';
  return selisih > 0 ? '$selisih hari lagi' : '${-selisih} hari lalu';
}
