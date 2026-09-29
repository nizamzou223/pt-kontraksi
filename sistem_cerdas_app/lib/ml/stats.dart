// Fungsi statistik dasar — murni, deterministik. Port dari admin-web/src/ml/stats.js.
import 'dart:math' as math;

double sum(Iterable<double> a) {
  var s = 0.0;
  for (final v in a) {
    s += v;
  }
  return s;
}

double mean(List<double> a) => a.isEmpty ? 0 : sum(a) / a.length;

double variance(List<double> a) {
  if (a.length < 2) return 0;
  final m = mean(a);
  var s = 0.0;
  for (final v in a) {
    s += (v - m) * (v - m);
  }
  return s / (a.length - 1);
}

double std(List<double> a) => math.sqrt(variance(a));

/// Kuantil dengan interpolasi linear (q dalam 0..1). Tidak mengubah daftar asli.
double quantile(List<double> arr, double q) {
  if (arr.isEmpty) return 0;
  final a = [...arr]..sort();
  final pos = (a.length - 1) * q.clamp(0.0, 1.0);
  final lo = pos.floor(), hi = pos.ceil();
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

double median(List<double> a) => quantile(a, 0.5);

/// Median Absolute Deviation.
double mad(List<double> a, [double? med]) {
  if (a.isEmpty) return 0;
  final m = med ?? median(a);
  return median([for (final v in a) (v - m).abs()]);
}

/// Pengurutan STABIL (nilai kembar mempertahankan urutan semula), seperti Array.prototype.sort di JS.
/// List.sort bawaan Dart tidak menjamin hal ini, dan urutan nilai kembar memengaruhi hasil penjumlahan
/// desimal serta pilihan pemisahan pohon.
void sortStabil<T>(List<T> a, int Function(T a, T b) cmp) {
  final idx = List<int>.generate(a.length, (i) => i);
  idx.sort((i, j) {
    final c = cmp(a[i], a[j]);
    return c != 0 ? c : i.compareTo(j);
  });
  final salinan = List<T>.of(a);
  for (var k = 0; k < a.length; k++) {
    a[k] = salinan[idx[k]];
  }
}

/// Perbandingan angka ala JS (a - b): -0 dan 0 dianggap sama.
int cmpNum(double a, double b) => a < b ? -1 : (a > b ? 1 : 0);

/// Perkalian bilangan bulat 32-bit (setara Math.imul) yang aman di JavaScript/web,
/// karena hasil kali dua bilangan 32-bit dapat melebihi 2^53.
int _imul(int a, int b) {
  final ah = (a >> 16) & 0xffff, al = a & 0xffff;
  final bh = (b >> 16) & 0xffff, bl = b & 0xffff;
  return ((al * bl) + (((ah * bl + al * bh) << 16) & 0xffffffff)) & 0xffffffff;
}

/// Generator angka acak berbenih (mulberry32) — hasilnya identik dengan versi web admin.
class Mulberry32 {
  int _a;
  Mulberry32([int seed = 42]) : _a = seed & 0xffffffff;

  double next() {
    _a = (_a + 0x6d2b79f5) & 0xffffffff;
    var t = _a;
    t = _imul(t ^ (t >> 15), t | 1);
    t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xffffffff;
    return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296.0;
  }

  /// Bilangan bulat acak 0..n-1.
  int nextInt(int n) => (next() * n).floor();
}

/// Sampel normal baku (Box–Muller).
double gaussian(Mulberry32 rand) {
  var u = 0.0, v = 0.0;
  while (u == 0) {
    u = rand.next();
  }
  while (v == 0) {
    v = rand.next();
  }
  return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v);
}
