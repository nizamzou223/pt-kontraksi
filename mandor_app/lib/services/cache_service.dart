import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Simple JSON cache backed by SharedPreferences.
/// Keys are scoped per-project: 'cache_presensi_42', 'cache_kasbon_42', etc.
class CacheService {
  static const _prefix = 'cache_v1_';

  static String _k(String domain, [int? projectId]) =>
      '$_prefix$domain${projectId != null ? '_$projectId' : ''}';

  // ── Write ──────────────────────────────────────────────────
  static Future<void> setList(
    String domain,
    List<Map<String, dynamic>> data, {
    int? projectId,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_k(domain, projectId), jsonEncode({
      'ts': DateTime.now().millisecondsSinceEpoch,
      'data': data,
    }));
  }

  // ── Read ───────────────────────────────────────────────────
  static Future<CacheEntry?> getList(String domain, {int? projectId}) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_k(domain, projectId));
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final ts  = DateTime.fromMillisecondsSinceEpoch(map['ts'] as int);
      final list = (map['data'] as List).cast<Map<String, dynamic>>();
      return CacheEntry(data: list, timestamp: ts);
    } catch (_) { return null; }
  }

  // ── Meta ───────────────────────────────────────────────────
  static Future<DateTime?> getTimestamp(String domain, {int? projectId}) async {
    final entry = await getList(domain, projectId: projectId);
    return entry?.timestamp;
  }

  static Future<void> clear(String domain, {int? projectId}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_k(domain, projectId));
  }

  static Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((k) => k.startsWith(_prefix));
    for (final k in keys) {
      await prefs.remove(k);
    }
  }

  /// Returns "X minutes ago" description of the cached timestamp.
  static String ageText(DateTime ts) {
    final diff = DateTime.now().difference(ts);
    if (diff.inSeconds < 60)  return 'baru saja';
    if (diff.inMinutes < 60)  return '${diff.inMinutes} mnt lalu';
    if (diff.inHours < 24)    return '${diff.inHours} jam lalu';
    return '${diff.inDays} hari lalu';
  }
}

class CacheEntry {
  final List<Map<String, dynamic>> data;
  final DateTime timestamp;
  const CacheEntry({required this.data, required this.timestamp});
}
