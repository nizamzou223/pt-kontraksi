import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocaleService extends ChangeNotifier {
  static const _key = 'locale_code';
  Locale _locale = const Locale('id', 'ID');

  LocaleService();

  Locale get locale => _locale;
  bool get isEnglish => _locale.languageCode == 'en';
  String get langCode => _locale.languageCode;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_key) ?? 'id';
    _locale = code == 'en' ? const Locale('en', 'US') : const Locale('id', 'ID');
    notifyListeners();
  }

  Future<void> setLocale(String code) async {
    _locale = code == 'en' ? const Locale('en', 'US') : const Locale('id', 'ID');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, code);
    notifyListeners();
  }

  void toggle() => setLocale(isEnglish ? 'id' : 'en');
}
