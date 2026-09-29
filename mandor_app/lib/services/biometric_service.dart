import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Graceful biometric service — uses only local_auth if available,
// falls back silently if package not linked (e.g. on simulator).
class BiometricService {
  static const _enabledKey = 'biometric_enabled';
  static const _emailKey   = 'biometric_email';

  // Check whether biometric is supported on this device.
  // Returns false gracefully if local_auth plugin is missing.
  Future<bool> isAvailable() async {
    try {
      // Dynamic invocation so the app compiles even without local_auth in pubspec.
      // Once local_auth is added, replace this with the real import.
      const ch = MethodChannel('plugins.flutter.io/local_auth');
      final result = await ch.invokeMethod<bool>('isDeviceSupported');
      return result == true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_enabledKey) ?? false;
  }

  Future<void> setEnabled(bool v, {String? email}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, v);
    if (email != null) await prefs.setString(_emailKey, email);
    if (!v) await prefs.remove(_emailKey);
  }

  Future<String?> getSavedEmail() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_emailKey);
  }

  // Trigger biometric prompt — returns true on success.
  Future<bool> authenticate(String reason) async {
    try {
      const ch = MethodChannel('plugins.flutter.io/local_auth');
      final result = await ch.invokeMethod<bool>('authenticate', {
        'localizedReason': reason,
        'stickyAuth': true,
        'sensitiveTransaction': false,
        'useErrorDialogs': true,
      });
      return result == true;
    } catch (_) {
      return false;
    }
  }
}
