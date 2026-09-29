import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../data/ai_repository.dart';
import '../data/demo_repository.dart';

class PenggunaInfo {
  final int? id;
  final String nama;
  final String peran;
  final String email;
  final bool demo;
  const PenggunaInfo({this.id, required this.nama, required this.peran, required this.email, this.demo = false});

  String get peranLabel => switch (peran) {
        'admin' => 'Administrator',
        'hr' => 'HRD',
        _ => peran,
      };
}

/// Status masuk, pengguna aktif, sumber data, dan tema.
class AppSession extends ChangeNotifier {
  static const _kTema = 'tema';

  final _auth = Supabase.instance.client.auth;
  final _db = Supabase.instance.client;

  PenggunaInfo? pengguna;
  AiRepository? repo;
  ThemeMode tema = ThemeMode.system;
  bool siap = false;

  bool get sudahMasuk => pengguna != null && repo != null;

  Future<void> init() async {
    try {
      final p = await SharedPreferences.getInstance();
      tema = switch (p.getString(_kTema)) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
    } catch (_) {}
    // Pulihkan sesi login sebelumnya (bila masih berlaku dan perannya sah).
    final email = _auth.currentSession?.user.email;
    if (email != null) {
      try {
        pengguna = await _ambilPengguna(email);
        repo = SupabaseAiRepository();
      } catch (_) {
        pengguna = null;
      }
    }
    siap = true;
    notifyListeners();
  }

  Future<PenggunaInfo> _ambilPengguna(String email) async {
    final d = await _db
        .from('users')
        .select('id, email, nama_lengkap, role, status_aktif')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();
    if (d == null) {
      throw DataException('Akun tidak ditemukan di sistem. Hubungi administrator.');
    }
    if (d['status_aktif'] == false) throw DataException('Akun Anda dinonaktifkan. Hubungi administrator.');
    final peran = (d['role'] ?? '').toString();
    if (!AppConfig.allowedRoles.contains(peran)) {
      throw DataException('Akses ditolak. Aplikasi ini hanya untuk Admin dan HRD.\nPeran akun Anda: $peran');
    }
    return PenggunaInfo(
      id: (d['id'] as num?)?.toInt(),
      nama: (d['nama_lengkap'] ?? email).toString(),
      peran: peran,
      email: email,
    );
  }

  Future<void> masuk(String email, String sandi) async {
    final surel = email.trim().toLowerCase();
    try {
      final r = await _auth.signInWithPassword(email: surel, password: sandi);
      if (r.user == null) throw DataException('Login gagal. Periksa email dan password Anda.');
      try {
        pengguna = await _ambilPengguna(surel);
      } catch (_) {
        await _auth.signOut();
        rethrow;
      }
      repo = SupabaseAiRepository();
      notifyListeners();
    } on AuthException catch (e) {
      final m = e.message.toLowerCase();
      if (m.contains('invalid login') || m.contains('invalid credentials')) {
        throw DataException('Email atau password salah.');
      }
      if (m.contains('confirm')) throw DataException('Email belum dikonfirmasi. Hubungi administrator.');
      throw DataException(e.message);
    } on DataException {
      rethrow;
    } catch (e) {
      final m = e.toString().toLowerCase();
      if (m.contains('socket') || m.contains('host lookup') || m.contains('network') || m.contains('connection')) {
        throw DataException('Koneksi gagal. Periksa koneksi internet Anda.');
      }
      throw DataException('Terjadi kesalahan: $e');
    }
  }

  void masukDemo() {
    pengguna = const PenggunaInfo(nama: 'Pengguna Demo', peran: 'admin', email: 'demo@kalipelus.local', demo: true);
    repo = DemoAiRepository();
    notifyListeners();
  }

  Future<void> keluar() async {
    if (pengguna?.demo != true) {
      try {
        await _auth.signOut();
      } catch (_) {}
    }
    pengguna = null;
    repo = null;
    notifyListeners();
  }

  Future<void> setTema(ThemeMode m) async {
    tema = m;
    notifyListeners();
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_kTema, switch (m) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
      });
    } catch (_) {}
  }
}
