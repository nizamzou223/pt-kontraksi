import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ── Singleton ChangeNotifier ──────────────────────────────────
class ThemeService extends ChangeNotifier {
  static final ThemeService _i = ThemeService._();
  factory ThemeService() => _i;
  ThemeService._();

  bool _isDark = false;
  bool get isDark => _isDark;
  ThemeMode get mode => _isDark ? ThemeMode.dark : ThemeMode.light;

  Future<void> init() async {
    final p = await SharedPreferences.getInstance();
    _isDark = p.getBool('dark_mode') ?? false;
    notifyListeners();
  }

  Future<void> toggle() async {
    _isDark = !_isDark;
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setBool('dark_mode', _isDark);
  }

  Future<void> set(bool dark) async {
    if (_isDark == dark) return;
    _isDark = dark;
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setBool('dark_mode', dark);
  }
}
