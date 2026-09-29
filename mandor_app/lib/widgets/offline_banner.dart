import 'package:flutter/material.dart';
import '../services/connectivity_service.dart';

/// Slide-down banner that appears when the device goes offline.
/// Drop it directly inside a Column at the top of any Scaffold body.
class OfflineBanner extends StatefulWidget {
  const OfflineBanner({super.key});
  @override State<OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends State<OfflineBanner>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _slide, _fade;
  bool _showOnline = false;
  bool _prevOnline = true;

  @override void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));
    _slide = Tween(begin: -1.0, end: 0.0).animate(
        CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _fade  = CurvedAnimation(parent: _ctrl, curve: Curves.easeOut);
  }

  @override void dispose() { _ctrl.dispose(); super.dispose(); }

  void _handle(bool online) {
    if (online == _prevOnline) return;
    _prevOnline = online;
    if (!online) {
      _showOnline = false;
      _ctrl.forward();
    } else {
      setState(() => _showOnline = true);
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) _ctrl.reverse();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _connectivity,
      builder: (_, __) {
        _handle(_connectivity.isOnline);
        if (_connectivity.isOnline && !_showOnline) return const SizedBox.shrink();
        return AnimatedBuilder(
          animation: _ctrl,
          builder: (_, child) => FractionalTranslation(
            translation: Offset(0, _slide.value),
            child: FadeTransition(opacity: _fade, child: child),
          ),
          child: _Banner(online: _showOnline),
        );
      },
    );
  }

  static final _connectivity = ConnectivityService();
}

class _Banner extends StatelessWidget {
  final bool online;
  const _Banner({required this.online});

  @override Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    color: online ? const Color(0xFF16A34A) : const Color(0xFFDC2626),
    child: Row(children: [
      Icon(
        online ? Icons.wifi_rounded : Icons.wifi_off_rounded,
        size: 15, color: Colors.white),
      const SizedBox(width: 8),
      Expanded(child: Text(
        online
          ? 'Koneksi pulih — data disinkronkan'
          : 'Tidak ada koneksi internet · mode offline',
        style: const TextStyle(
          fontSize: 16, color: Colors.white, fontWeight: FontWeight.w600),
      )),
    ]),
  );
}
