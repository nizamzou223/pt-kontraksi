import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Ukuran tampilan (zoom teks & elemen yang mengikuti ukuran teks) seluruh
// aplikasi -- pola sama persis dengan ThemeService (singleton ChangeNotifier
// + SharedPreferences). Diterapkan lewat MediaQuery.textScaler di MaterialApp
// (lihat main.dart), bukan Transform.scale, supaya area sentuh (hit-test)
// tombol tidak ikut bergeser -- Transform.scale murni visual dan membuat
// tombol jadi salah posisi saat disentuh.
class TextScaleService extends ChangeNotifier {
  static final TextScaleService _i = TextScaleService._();
  factory TextScaleService() => _i;
  TextScaleService._();

  // Pilihan tetap, bukan slider bebas, supaya layout tidak mudah berantakan
  // di kombinasi ukuran yang belum pernah diuji.
  static const List<double> levels = [0.9, 1.0, 1.15, 1.3];

  double _scale = 1.0;
  double get scale => _scale;

  Future<void> init() async {
    final p = await SharedPreferences.getInstance();
    final saved = p.getDouble('text_scale');
    _scale = (saved != null && levels.contains(saved)) ? saved : 1.0;
    notifyListeners();
  }

  Future<void> set(double value) async {
    if (_scale == value) return;
    _scale = value;
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setDouble('text_scale', value);
  }
}
