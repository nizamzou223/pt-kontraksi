// Pemformat angka gaya Indonesia (titik ribuan, koma desimal) tanpa bergantung pada data locale,
// sehingga aman dipakai di isolate maupun web. Setara toLocaleString('id-ID') pada admin-web.
String fmtId(num v, {int maxDigits = 1}) {
  final faktor = _pangkat10(maxDigits);
  var r = (v * faktor).round() / faktor;
  if (r == 0) r = 0; // hindari "-0"
  final neg = r < 0;
  final s = r.abs().toStringAsFixed(maxDigits);
  final parts = s.split('.');
  final bulat = parts[0];
  final buf = StringBuffer();
  for (var i = 0; i < bulat.length; i++) {
    if (i > 0 && (bulat.length - i) % 3 == 0) buf.write('.');
    buf.write(bulat[i]);
  }
  var desimal = parts.length > 1 ? parts[1] : '';
  desimal = desimal.replaceFirst(RegExp(r'0+$'), '');
  return '${neg ? '-' : ''}$buf${desimal.isEmpty ? '' : ',$desimal'}';
}

double _pangkat10(int n) {
  var r = 1.0;
  for (var i = 0; i < n; i++) {
    r *= 10;
  }
  return r;
}

String fmtRp(num v) => 'Rp ${fmtId(v, maxDigits: 0)}';
