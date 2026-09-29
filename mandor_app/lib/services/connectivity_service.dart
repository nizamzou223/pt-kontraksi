import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

class ConnectivityService extends ChangeNotifier {
  bool _isOnline = true;
  DateTime? _lastOnline;

  ConnectivityService() { _init(); }

  bool get isOnline  => _isOnline;
  bool get isOffline => !_isOnline;
  DateTime? get lastOnline => _lastOnline;

  String get lastOnlineText {
    if (_lastOnline == null) return '';
    final diff = DateTime.now().difference(_lastOnline!);
    if (diff.inMinutes < 1)  return 'baru saja';
    if (diff.inMinutes < 60) return '${diff.inMinutes} menit lalu';
    if (diff.inHours < 24)   return '${diff.inHours} jam lalu';
    return '${diff.inDays} hari lalu';
  }

  Future<void> _init() async {
    final result = await Connectivity().checkConnectivity();
    _updateState(result);
    Connectivity().onConnectivityChanged.listen(_updateState);
  }

  void _updateState(List<ConnectivityResult> results) {
    final online = !results.contains(ConnectivityResult.none);
    if (online && !_isOnline) _lastOnline = DateTime.now();
    if (online != _isOnline) {
      _isOnline = online;
      notifyListeners();
    }
  }
}
