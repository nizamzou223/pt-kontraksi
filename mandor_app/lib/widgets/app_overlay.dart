import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'app_widgets.dart';

// ══════════════════════════════════════════════════════════════
// ANIMATED OVERLAYS — matching admin-web LoginPage.jsx
//
// Keyframes dipakai:
//   alertCardIn: scale(0.7,y30) → scale(1.03,y-4) → scale(1,y0)
//   backdropIn: opacity 0→1
//   glowPulse: scale 1→1.08→1
//   shimmerMove: translateX -100%→200%
//   spinSlow: rotate 0→360
//   rippleRing: scale 0.85→2.2, opacity 0.8→0
//   avatarPop: scale 0.3→1.1→1
//   badgePop: scale 0→1.2→1
//   chipIn: scale 0.6,y8 → scale 1.05 → scale 1
//   confettiBurst: radial burst
//   loginShake: translateX 0→-5→5→0 (HANYA card login, bukan full screen)
// ══════════════════════════════════════════════════════════════

// ─── Cubic sesuai web: cubic-bezier(0.34,1.56,0.64,1) ────────
const _kSpring = Cubic(0.34, 1.56, 0.64, 1);
const _kEase   = Cubic(0.22, 1.0,  0.36, 1.0);

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

/// Login berhasil — full overlay + confetti (sesuai AdminWelcomeAlert web)
Future<void> showLoginSuccess(BuildContext ctx, String nama) async {
  final c = Completer<void>();
  late OverlayEntry e;
  // Paksa keyboard hilang sebelum overlay muncul
  try {
    final scope = FocusManager.instance.primaryFocus;
    scope?.unfocus();
  } catch (_) {}
  e = OverlayEntry(builder: (_) => _SuccessOverlay(
    name: nama,
    onDone: () { e.remove(); if (!c.isCompleted) c.complete(); },
  ));
  Overlay.of(ctx).insert(e);
  Future.delayed(const Duration(milliseconds: 2400), () { if (!c.isCompleted) c.complete(); });
  return c.future;
}

/// Login gagal — HANYA snackbar + shake card (BUKAN full-screen overlay)
/// Dipanggil langsung dari login_screen dengan shake controller
Future<void> showLoginFailed(BuildContext ctx, String message, {
  AnimationController? shakeCtrl,
}) async {
  // Shake animasi pada form card (bukan full screen)
  shakeCtrl?.forward(from: 0);
  // Snackbar error di bawah — ringan, tidak block UI
  ScaffoldMessenger.of(ctx).clearSnackBars();
  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
    content: Row(children: [
      const Icon(Icons.error_outline_rounded, color: Colors.white, size: 16),
      const SizedBox(width: 8),
      Expanded(child: Text(message, style: const TextStyle(fontSize: 16, height: 1.3))),
    ]),
    backgroundColor: AppColors.red600,
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    margin: const EdgeInsets.fromLTRB(14, 0, 14, 24),
    duration: const Duration(seconds: 4),
  ));
}

/// Konfirmasi logout — bottom sheet animasi dengan pilihan Ya/Batal
/// Mengembalikan true jika user memilih keluar, false jika batal
Future<bool> showLogoutConfirm(BuildContext ctx, {String? namaUser}) async {
  final result = await showModalBottomSheet<bool>(
    context: ctx,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.45),
    isScrollControlled: true,
    builder: (_) => _LogoutConfirmSheet(namaUser: namaUser),
  );
  return result == true;
}

/// Logout — full-screen dramatic exit overlay
Future<void> showLogoutOverlay(BuildContext ctx, {String? namaUser}) async {
  final c = Completer<void>();
  late OverlayEntry e;
  e = OverlayEntry(builder: (_) => _LogoutExitOverlay(
    namaUser: namaUser,
    onDone: () { e.remove(); if (!c.isCompleted) c.complete(); },
  ));
  Overlay.of(ctx).insert(e);
  Future.delayed(const Duration(milliseconds: 1600), () { if (!c.isCompleted) c.complete(); });
  return c.future;
}

// ══════════════════════════════════════════════════════════════
// SUCCESS OVERLAY — AdminWelcomeAlert
// ══════════════════════════════════════════════════════════════
class _SuccessOverlay extends StatefulWidget {
  final String name; final VoidCallback onDone;
  const _SuccessOverlay({required this.name, required this.onDone});
  @override State<_SuccessOverlay> createState() => _SuccessOverlayState();
}
class _SuccessOverlayState extends State<_SuccessOverlay> with TickerProviderStateMixin {
  late AnimationController _backdrop, _card, _shimmer, _spin, _ripple, _avatar, _badge, _chip, _confetti, _progress;

  @override void initState() {
    super.initState();
    _backdrop = AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
    _card     = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _shimmer  = AnimationController(vsync: this, duration: const Duration(milliseconds: 2000))..repeat();
    _spin     = AnimationController(vsync: this, duration: const Duration(seconds: 6))..repeat();
    _ripple   = AnimationController(vsync: this, duration: const Duration(milliseconds: 2000))..repeat();
    _avatar   = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _badge    = AnimationController(vsync: this, duration: const Duration(milliseconds: 400));
    _chip     = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _confetti = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _progress = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600));

    // Sequence sesuai web
    _backdrop.forward();
    Future.delayed(const Duration(milliseconds: 40),  () { if (mounted) _card.forward(); });
    Future.delayed(const Duration(milliseconds: 200), () { if (mounted) _avatar.forward(); });
    Future.delayed(const Duration(milliseconds: 500), () { if (mounted) { _badge.forward(); _confetti.forward(); } });
    Future.delayed(const Duration(milliseconds: 400), () { if (mounted) _chip.forward(); });
    Future.delayed(const Duration(milliseconds: 600), () { if (mounted) _progress.forward(); });

    // Auto dismiss
    Future.delayed(const Duration(milliseconds: 2000), () {
      if (!mounted) return;
      _backdrop.reverse();
      _card.reverse().then((_) { if (mounted) widget.onDone(); });
    });
  }

  @override void dispose() {
    for (final c in [_backdrop,_card,_shimmer,_spin,_ripple,_avatar,_badge,_chip,_confetti,_progress]) { c.dispose(); }
    super.dispose();
  }

  // alertCardIn
  double get _scaleVal => TweenSequence([
    TweenSequenceItem(tween: Tween(begin: 0.7,  end: 1.03), weight: 70),
    TweenSequenceItem(tween: Tween(begin: 1.03, end: 1.0),  weight: 30),
  ]).evaluate(CurvedAnimation(parent: _card, curve: Curves.easeOut));
  double get _yVal => TweenSequence([
    TweenSequenceItem(tween: Tween(begin: 30.0, end: -4.0), weight: 70),
    TweenSequenceItem(tween: Tween(begin: -4.0, end:  0.0), weight: 30),
  ]).evaluate(CurvedAnimation(parent: _card, curve: Curves.easeOut));

  @override Widget build(BuildContext context) {
    final initial = widget.name.isNotEmpty ? widget.name[0].toUpperCase() : 'A';
    final sw = MediaQuery.of(context).size.width;
    return Material(color: Colors.transparent, child: Stack(children: [
      // Backdrop blur overlay
      AnimatedBuilder(animation: _backdrop, builder: (_, __) => Opacity(
        opacity: CurvedAnimation(parent: _backdrop, curve: Curves.easeOut).value * 0.55,
        child: const SizedBox.expand(child: ColoredBox(color: Color(0xFF0F172A))))),
      // Confetti burst
      ...List.generate(28, (i) => _ConfettiBurst(anim: _confetti, index: i, sw: sw)),
      // Center card
      Center(child: AnimatedBuilder(
        animation: Listenable.merge([_card, _shimmer, _spin, _ripple, _avatar, _badge, _chip, _progress]),
        builder: (_, __) {
          final cardOpacity = CurvedAnimation(parent: _card, curve: const Interval(0,0.3)).value.clamp(0.0,1.0);
          return Transform.translate(
            offset: Offset(0.0, _yVal),
            child: Transform.scale(
            scale: _scaleVal, alignment: Alignment.center,
            child: Opacity(opacity: cardOpacity,
              child: Container(
                width: math.min(sw - 32, 380),
                margin: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  color: const Color(0xFFFAFAFA),
                  boxShadow: [
                    BoxShadow(color: const Color(0xFF0F172A).withValues(alpha:0.25), blurRadius: 60, offset: const Offset(0,20)),
                    BoxShadow(color: AppColors.brand600.withValues(alpha:0.25), blurRadius: 40, spreadRadius: 4),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(28),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    // ── HEADER gradient (sesuai web) ──────────
                    _buildHeader(initial),
                    // ── BODY ─────────────────────────────────
                    _buildBody(initial),
                  ]),
                ),
              )),
          ));
        })),
    ]));
  }

  Widget _buildHeader(String initial) {
    final shimV = CurvedAnimation(parent: _shimmer, curve: Curves.easeInOut).value;
    final spinV  = _spin.value;
    final rippleV = CurvedAnimation(parent: _ripple, curve: Curves.easeOut).value;
    final avatarV = CurvedAnimation(parent: _avatar, curve: _kSpring).value;
    final badgeV  = CurvedAnimation(parent: _badge, curve: _kSpring).value;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(28, 28, 28, 22),
      decoration: const BoxDecoration(gradient: LinearGradient(
        begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [Color(0xFF0F172A), Color(0xFF1E3A8A), Color(0xFF1E40AF)],
        stops: [0.0, 0.5, 1.0])),
      child: Stack(children: [
        // Shimmer sweep
        Positioned.fill(child: OverflowBox(maxWidth: double.infinity,
          child: Transform(
            transform: Matrix4.translationValues((shimV * 3 - 1) * 300, 0, 0),
            child: Container(width: 100, decoration: BoxDecoration(
              gradient: LinearGradient(colors: [
                Colors.transparent,
                Colors.white.withValues(alpha:0.08),
                Colors.transparent])))))),
        // Decorative ring top-right
        Positioned(top: -30, right: -30, child: Container(width: 120, height: 120,
          decoration: BoxDecoration(shape: BoxShape.circle,
            border: Border.all(color: Colors.white.withValues(alpha:0.06)),
            color: Colors.white.withValues(alpha:0.03)))),
        Column(children: [
          Stack(alignment: Alignment.center, children: [
            // spinSlow ring 1
            Transform.rotate(angle: spinV * 2 * math.pi,
              child: Container(width: 100, height: 100,
                decoration: BoxDecoration(shape: BoxShape.circle,
                  border: Border.all(
                    color: const Color(0xFF63B3ED).withValues(alpha:0.5),
                    width: 2, strokeAlign: BorderSide.strokeAlignCenter,
                    // dashed via custom paint tidak perlu — cukup solid tipis
                  )))),
            // spinSlow ring 2 reverse
            Transform.rotate(angle: -spinV * 2 * math.pi * 0.6,
              child: Container(width: 114, height: 114,
                decoration: BoxDecoration(shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withValues(alpha:0.08), width: 1.5)))),
            // rippleRing x3
            ...List.generate(3, (i) {
              final v = ((rippleV + i * 0.33) % 1.0);
              return Transform.scale(scale: 0.85 + v * 1.35,
                child: Opacity(opacity: (1 - v).clamp(0.0, 0.8),
                  child: Container(width: 92, height: 92,
                    decoration: BoxDecoration(shape: BoxShape.circle,
                      border: Border.all(color: const Color(0xFF60A5FA).withValues(alpha:0.4), width: 2)))));
            }),
            // Avatar — avatarPop
            Transform.scale(
              scale: Tween(begin: 0.3, end: 1.0).evaluate(
                  CurvedAnimation(parent: _avatar, curve: _kSpring)).clamp(0.0, 1.1),
              child: Opacity(opacity: avatarV.clamp(0.0,1.0),
                child: Container(width: 76, height: 76,
                  decoration: BoxDecoration(shape: BoxShape.circle,
                    gradient: const LinearGradient(
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                        colors: [Color(0xFF1D4ED8), Color(0xFF0EA5E9)]),
                    border: Border.all(color: Colors.white.withValues(alpha:0.25), width: 3),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha:0.3), blurRadius: 24)]),
                  child: Center(child: Text(initial,
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white)))))),
            // Badge — badgePop
            Positioned(bottom: 4, right: 4,
              child: Transform.scale(scale: badgeV.clamp(0.0, 1.2),
                child: Opacity(opacity: badgeV.clamp(0.0,1.0),
                  child: Container(width: 24, height: 24,
                    decoration: BoxDecoration(shape: BoxShape.circle,
                      gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)]),
                      border: Border.all(color: Colors.white, width: 2)),
                    child: const Icon(Icons.check_rounded, size: 13, color: Colors.white))))),
          ]),
          const SizedBox(height: 14),
          // fadeUp text
          Opacity(opacity: avatarV.clamp(0.0,1.0),
            child: Transform.translate(offset: Offset(0, 12 * (1-avatarV)),
              child: Column(children: [
                Text('AUTENTIKASI BERHASIL', style: TextStyle(
                    color: Colors.white.withValues(alpha:0.6),
                    fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 2)),
                const SizedBox(height: 4),
                const Text('Selamat Datang!', style: TextStyle(
                    color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
              ]))),
        ]),
      ]),
    );
  }

  Widget _buildBody(String initial) {
    final chipV    = CurvedAnimation(parent: _chip,     curve: _kSpring).value;
    final progressV = CurvedAnimation(parent: _progress, curve: Curves.easeOut).value;

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      child: Column(children: [
        // chipIn — nama chip
        Transform.scale(scale: Tween(begin:0.6, end:1.0).evaluate(
              CurvedAnimation(parent: _chip, curve: _kSpring)).clamp(0.0, 1.1),
          child: Opacity(opacity: chipV.clamp(0.0, 1.0),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFEFF6FF), Color(0xFFDBEAFE)]),
                borderRadius: BorderRadius.circular(100),
                border: Border.all(color: const Color(0xFFBFDBFE), width: 1.5),
                boxShadow: [BoxShadow(color: AppColors.brand600.withValues(alpha:0.12),
                    blurRadius: 16, offset: const Offset(0,4))]),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 32, height: 32,
                  decoration: const BoxDecoration(shape: BoxShape.circle,
                    gradient: LinearGradient(
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                        colors: [Color(0xFF1D4ED8), Color(0xFF0284C7)])),
                  child: Center(child: Text(initial,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)))),
                const SizedBox(width: 10),
                const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Mengakses sistem...', style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700, color: Color(0xFF1E40AF))),
                  Text('Memuat data dashboard', style: TextStyle(
                      fontSize: 14, color: Color(0xFF64748B))),
                ]),
              ]),
            ))),
        const SizedBox(height: 16),
        // Progress bar — progressFill + shimmerBar
        Stack(children: [
          Container(height: 6, decoration: BoxDecoration(
              color: const Color(0xFFE0E7FF), borderRadius: BorderRadius.circular(3))),
          FractionallySizedBox(widthFactor: progressV,
            child: Container(height: 6, decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(3),
              gradient: const LinearGradient(
                  colors: [Color(0xFF2563EB), Color(0xFF60A5FA), Color(0xFF2563EB)]),
              backgroundBlendMode: BlendMode.srcIn,
            ))),
        ]),
        const SizedBox(height: 10),
        // Dot bounce loading
        Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(3, (i) =>
          _DotBounce(delay: Duration(milliseconds: i * 120)))),
      ]),
    );
  }
}

// ── Confetti burst ────────────────────────────────────────────
class _ConfettiBurst extends StatelessWidget {
  final Animation<double> anim; final int index; final double sw;
  const _ConfettiBurst({required this.anim, required this.index, required this.sw});
  @override Widget build(BuildContext context) {
    final rnd   = math.Random(index * 7919);
    final angle = (index / 20) * 2 * math.pi + rnd.nextDouble() * 0.4;
    final dist  = 60.0 + rnd.nextDouble() * 140;
    final tx = math.cos(angle) * dist;
    final ty = math.sin(angle) * dist - 60;
    const colors = [Color(0xFF3B82F6),Color(0xFF22C55E),Color(0xFFF59E0B),
                    Color(0xFFEF4444),Color(0xFF8B5CF6),Color(0xFF06B6D4),Color(0xFFF97316)];
    final color = colors[index % colors.length];
    final sh = MediaQuery.of(context).size.height;
    return AnimatedBuilder(animation: anim, builder: (_, __) => Positioned(
      left: sw / 2 - 3, top: sh / 2 - 3,
      child: Transform(
        transform: Matrix4.translationValues(tx * anim.value, ty * anim.value, 0),
        child: Opacity(
          opacity: (anim.value < 0.4 ? anim.value / 0.4 : (1 - anim.value) / 0.6).clamp(0.0, 1.0),
          child: Transform.rotate(angle: anim.value * math.pi * 5,
            child: Container(
              width: 5 + (index % 4) * 2.5, height: 5 + (index % 4) * 2.5,
              decoration: BoxDecoration(color: color,
                borderRadius: BorderRadius.circular(index % 3 == 0 ? 2 : 3))))))));
  }
}

// ── Dot bounce loading ────────────────────────────────────────
class _DotBounce extends StatefulWidget {
  final Duration delay;
  const _DotBounce({required this.delay});
  @override State<_DotBounce> createState() => _DotBounceState();
}
class _DotBounceState extends State<_DotBounce> with SingleTickerProviderStateMixin {
  late AnimationController _c;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
    Future.delayed(widget.delay, () { if (mounted) _c.repeat(reverse: true); });
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c, builder: (_, __) {
      final v = CurvedAnimation(parent: _c, curve: Curves.easeInOut).value;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: Transform.translate(offset: Offset(0, -6 * v),
          child: Opacity(opacity: 0.4 + v * 0.6,
            child: Container(width: 6, height: 6,
              decoration: const BoxDecoration(color: AppColors.brand600, shape: BoxShape.circle)))));
    });
}

// ══════════════════════════════════════════════════════════════
// LOGOUT EXIT OVERLAY — full-screen dramatic animation
// ══════════════════════════════════════════════════════════════
class _LogoutExitOverlay extends StatefulWidget {
  final String? namaUser;
  final VoidCallback onDone;
  const _LogoutExitOverlay({this.namaUser, required this.onDone});
  @override State<_LogoutExitOverlay> createState() => _LogoutExitOverlayState();
}
class _LogoutExitOverlayState extends State<_LogoutExitOverlay> with TickerProviderStateMixin {
  late AnimationController _bg, _card, _icon, _bar;

  @override void initState() {
    super.initState();
    _bg   = AnimationController(vsync: this, duration: const Duration(milliseconds: 380));
    _card = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _icon = AnimationController(vsync: this, duration: const Duration(milliseconds: 460));
    _bar  = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

    _bg.forward();
    Future.delayed(const Duration(milliseconds: 80),  () { if (mounted) _card.forward(); });
    Future.delayed(const Duration(milliseconds: 220), () { if (mounted) _icon.forward(); });
    Future.delayed(const Duration(milliseconds: 340), () { if (mounted) _bar.forward(); });

    // Auto dismiss with exit animation
    Future.delayed(const Duration(milliseconds: 1350), () {
      if (!mounted) return;
      _card.reverse();
      _bg.reverse().then((_) { if (mounted) widget.onDone(); });
    });
  }

  @override void dispose() {
    _bg.dispose(); _card.dispose(); _icon.dispose(); _bar.dispose();
    super.dispose();
  }

  @override Widget build(BuildContext context) {
    final sw = MediaQuery.of(context).size.width;
    final initial = ((widget.namaUser ?? 'U').isNotEmpty) ? (widget.namaUser!)[0].toUpperCase() : 'U';
    return Material(color: Colors.transparent,
      child: AnimatedBuilder(
        animation: Listenable.merge([_bg, _card, _icon, _bar]),
        builder: (_, __) {
          final bgV   = CurvedAnimation(parent: _bg,   curve: Curves.easeOut).value;
          final cardV = CurvedAnimation(parent: _card, curve: _kSpring).value;
          final iconV = CurvedAnimation(parent: _icon, curve: _kSpring).value;
          final barV  = CurvedAnimation(parent: _bar,  curve: Curves.easeOut).value;

          return Stack(children: [
            // Dimmed backdrop
            Opacity(opacity: bgV * 0.65,
              child: const SizedBox.expand(child: ColoredBox(color: Color(0xFF0F172A)))),
            // Center card
            Center(child: Transform.scale(
              scale: 0.72 + cardV * 0.28,
              child: Opacity(opacity: (cardV * 2.5).clamp(0.0, 1.0),
                child: Container(
                  width: math.min(sw - 56, 290),
                  padding: const EdgeInsets.all(26),
                  decoration: BoxDecoration(
                    color: context.cCard,
                    borderRadius: BorderRadius.circular(28),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: 50, offset: const Offset(0, 14)),
                      BoxShadow(color: const Color(0xFFEF4444).withValues(alpha: 0.08), blurRadius: 30, spreadRadius: 4),
                    ],
                  ),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    // Icon with ripple rings
                    Stack(alignment: Alignment.center, children: [
                      // Ripple ring 1
                      Transform.scale(scale: 0.6 + iconV * 1.0,
                        child: Opacity(opacity: ((1 - iconV) * 0.25).clamp(0.0, 1.0),
                          child: Container(width: 88, height: 88,
                            decoration: BoxDecoration(shape: BoxShape.circle,
                              border: Border.all(color: const Color(0xFFEF4444), width: 1.5))))),
                      // Ripple ring 2
                      Transform.scale(scale: 0.4 + iconV * 0.7,
                        child: Opacity(opacity: ((1 - iconV) * 0.18).clamp(0.0, 1.0),
                          child: Container(width: 104, height: 104,
                            decoration: BoxDecoration(shape: BoxShape.circle,
                              border: Border.all(color: const Color(0xFFEF4444), width: 1.0))))),
                      // Icon box
                      Transform.scale(
                        scale: Tween(begin: 0.3, end: 1.0)
                            .evaluate(CurvedAnimation(parent: _icon, curve: _kSpring))
                            .clamp(0.0, 1.1),
                        child: Opacity(opacity: iconV.clamp(0.0, 1.0),
                          child: Container(
                            width: 68, height: 68,
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [Color(0xFFEF4444), Color(0xFFDC2626)],
                                begin: Alignment.topLeft, end: Alignment.bottomRight),
                              borderRadius: BorderRadius.circular(20),
                              boxShadow: [BoxShadow(
                                color: const Color(0xFFEF4444).withValues(alpha: 0.38),
                                blurRadius: 20, offset: const Offset(0, 6))]),
                            child: const Icon(Icons.logout_rounded, color: Colors.white, size: 30))),
                      ),
                    ]),
                    const SizedBox(height: 18),
                    // Avatar + text
                    Opacity(opacity: iconV.clamp(0.0, 1.0),
                      child: Transform.translate(offset: Offset(0, 14 * (1 - iconV)),
                        child: Column(children: [
                          // User initial circle
                          Container(width: 38, height: 38,
                            decoration: const BoxDecoration(shape: BoxShape.circle,
                              gradient: LinearGradient(colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)])),
                            child: Center(child: Text(initial,
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)))),
                          const SizedBox(height: 10),
                          Text('Sampai Jumpa!', style: TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800, color: context.cText)),
                          const SizedBox(height: 4),
                          Text('Sesi Anda telah diakhiri',
                            style: TextStyle(fontSize: 15, color: context.cSub)),
                        ]))),
                    const SizedBox(height: 18),
                    // Progress bar
                    Stack(children: [
                      Container(height: 4, decoration: BoxDecoration(
                        color: context.isDark ? const Color(0xFF2A1010) : const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(2))),
                      FractionallySizedBox(widthFactor: barV,
                        child: Container(height: 4, decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(2),
                          gradient: const LinearGradient(
                            colors: [Color(0xFFFCA5A5), Color(0xFFEF4444)])))),
                    ]),
                  ]),
                )))),
          ]);
        }));
  }
}

// ══════════════════════════════════════════════════════════════
// LOGOUT CONFIRM SHEET — animated bottom sheet pilihan Ya/Batal
// ══════════════════════════════════════════════════════════════
class _LogoutConfirmSheet extends StatefulWidget {
  final String? namaUser;
  const _LogoutConfirmSheet({this.namaUser});
  @override State<_LogoutConfirmSheet> createState() => _LogoutConfirmSheetState();
}

class _LogoutConfirmSheetState extends State<_LogoutConfirmSheet>
    with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<double> _scale, _fade, _slide;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
    _scale = Tween(begin: 0.88, end: 1.0).animate(CurvedAnimation(parent: _c, curve: _kSpring));
    _fade  = CurvedAnimation(parent: _c, curve: _kEase);
    _slide = Tween(begin: 1.0, end: 0.0).animate(CurvedAnimation(parent: _c, curve: _kEase));
    _c.forward();
  }

  @override void dispose() { _c.dispose(); super.dispose(); }

  Future<void> _close(bool result) async {
    await _c.reverse();
    if (mounted) Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    final initial = (widget.namaUser ?? 'U').isNotEmpty
        ? (widget.namaUser ?? 'U')[0].toUpperCase()
        : 'U';

    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Transform.translate(
        offset: Offset(0, 40 * _slide.value),
        child: Opacity(
          opacity: _fade.value,
          child: Transform.scale(
            scale: _scale.value,
            alignment: Alignment.bottomCenter,
            child: Container(
              decoration: BoxDecoration(
                color: context.cCard,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              ),
              padding: EdgeInsets.fromLTRB(
                  24, 12, 24, MediaQuery.of(context).padding.bottom + 24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                // Handle
                Center(child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                    color: context.cBorder, borderRadius: BorderRadius.circular(2)))),
                const SizedBox(height: 24),

                // Icon animasi
                ScaleTransition(
                  scale: Tween(begin: 0.5, end: 1.0).animate(
                      CurvedAnimation(parent: _c, curve: const Interval(0.2, 1.0, curve: _kSpring))),
                  child: Container(
                    width: 72, height: 72,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFEF4444), Color(0xFFDC2626)],
                        begin: Alignment.topLeft, end: Alignment.bottomRight),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [BoxShadow(
                        color: const Color(0xFFEF4444).withValues(alpha: 0.3),
                        blurRadius: 16, offset: const Offset(0, 6))],
                    ),
                    child: const Icon(Icons.logout_rounded, color: Colors.white, size: 32),
                  ),
                ),
                const SizedBox(height: 20),

                // Judul
                Text('Keluar dari Aplikasi',
                    style: TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w800, color: context.cText)),
                const SizedBox(height: 8),

                // Pesan
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: TextStyle(fontSize: 16, color: context.cSub, height: 1.5),
                    children: [
                      const TextSpan(text: 'Yakin ingin keluar dari akun '),
                      TextSpan(
                        text: widget.namaUser ?? 'Anda',
                        style: TextStyle(fontWeight: FontWeight.w700, color: context.cText),
                      ),
                      const TextSpan(text: '?'),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // Avatar chip user
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: context.cSurface,
                    borderRadius: BorderRadius.circular(100),
                    border: Border.all(color: context.cBorder),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 28, height: 28,
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                            colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)]),
                        shape: BoxShape.circle),
                      child: Center(child: Text(initial,
                          style: const TextStyle(color: Colors.white,
                              fontWeight: FontWeight.w800, fontSize: 16))),
                    ),
                    const SizedBox(width: 8),
                    Text(widget.namaUser ?? 'User',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w600, color: context.cText)),
                  ]),
                ),
                const SizedBox(height: 28),

                // Tombol
                Row(children: [
                  // Batal
                  Expanded(child: OutlinedButton(
                    onPressed: () => _close(false),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.cText,
                      side: BorderSide(color: context.cBorder, width: 1.5),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const Text('Batal',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                  )),
                  const SizedBox(width: 12),
                  // Ya, Keluar
                  Expanded(child: ElevatedButton.icon(
                    onPressed: () => _close(true),
                    icon: const Icon(Icons.logout_rounded, size: 17),
                    label: const Text('Ya, Keluar',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFDC2626),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  )),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
