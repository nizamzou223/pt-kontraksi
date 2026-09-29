import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/biometric_service.dart';
import '../main.dart' show localeService;
import '../widgets/app_widgets.dart';
import '../widgets/app_overlay.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with TickerProviderStateMixin {
  final _formKey    = GlobalKey<FormState>();
  final _emailCtrl  = TextEditingController();
  final _pwCtrl     = TextEditingController();
  final _auth       = AuthService();
  final _bio        = BiometricService();
  bool _loading = false, _obscure = true;
  bool _bioAvailable = false, _bioEnabled = false;
  bool _isEnglish = localeService.isEnglish;

  // BG + card slide in
  late AnimationController _bgCtrl, _cardCtrl, _glowCtrl;
  late Animation<double>   _bgFade, _logoScale, _cardFade;
  late Animation<Offset>   _cardSlide;

  // Shake card saat error (loginShake sesuai web)
  late AnimationController _shakeCtrl;
  late Animation<double>   _shakeX;

  // Error state untuk visual merah di dalam card
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    _bgCtrl   = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
    _cardCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _bgFade   = CurvedAnimation(parent: _bgCtrl,   curve: Curves.easeOut);
    _logoScale = Tween(begin: 0.3, end: 1.0).animate(
        CurvedAnimation(parent: _bgCtrl, curve: const Interval(0.1, 0.9, curve: Cubic(0.34,1.56,0.64,1))));
    _cardSlide = Tween<Offset>(begin: const Offset(0, 0.15), end: Offset.zero).animate(
        CurvedAnimation(parent: _cardCtrl, curve: const Cubic(0.22,1,0.36,1)));
    _cardFade  = CurvedAnimation(parent: _cardCtrl, curve: Curves.easeOut);

    // loginShake: 0→-5→5→-5→5→0 (same keyframes as CSS)
    _shakeCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 480));
    _shakeX = TweenSequence([
      TweenSequenceItem(tween: Tween(begin: 0.0,  end: -6.0), weight: 15),
      TweenSequenceItem(tween: Tween(begin: -6.0, end:  6.0), weight: 20),
      TweenSequenceItem(tween: Tween(begin:  6.0, end: -5.0), weight: 20),
      TweenSequenceItem(tween: Tween(begin: -5.0, end:  5.0), weight: 20),
      TweenSequenceItem(tween: Tween(begin:  5.0, end: -3.0), weight: 15),
      TweenSequenceItem(tween: Tween(begin: -3.0, end:  0.0), weight: 10),
    ]).animate(_shakeCtrl);

    _glowCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))
      ..repeat(reverse: true);

    // Start bg immediately, card 200ms later
    _bgCtrl.forward();
    Future.delayed(const Duration(milliseconds: 200), () { if (mounted) _cardCtrl.forward(); });
    localeService.addListener(_onLocale);
    _checkBiometric();
  }

  @override void dispose() {
    _bgCtrl.dispose(); _cardCtrl.dispose(); _glowCtrl.dispose(); _shakeCtrl.dispose();
    _emailCtrl.dispose(); _pwCtrl.dispose();
    localeService.removeListener(_onLocale);
    super.dispose();
  }

  void _onLocale() => setState(() => _isEnglish = localeService.isEnglish);

  Future<void> _checkBiometric() async {
    final avail   = await _bio.isAvailable();
    final enabled = await _bio.isEnabled();
    if (!mounted) return;
    setState(() { _bioAvailable = avail; _bioEnabled = enabled; });
    if (avail && enabled) _loginWithBiometric();
  }

  Future<void> _loginWithBiometric() async {
    if (_loading) return;
    final ok = await _bio.authenticate(
        _isEnglish ? 'Sign in to Mandor App' : 'Masuk ke Mandor App');
    if (!ok || !mounted) return;
    setState(() => _loading = true);
    try {
      final user = await _auth.restoreSession();
      if (user == null) {
        throw Exception(
          _isEnglish ? 'Session expired, please sign in with password.'
                     : 'Sesi habis, masuk kembali menggunakan password.');
      }
      if (!mounted) return;
      await showLoginSuccess(context, user.namaLengkap);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(PageRouteBuilder(
        pageBuilder: (_, a, __) => HomeScreen(user: user),
        transitionsBuilder: (_, a, __, child) => FadeTransition(
            opacity: CurvedAnimation(parent: a, curve: Curves.easeOut), child: child),
        transitionDuration: const Duration(milliseconds: 400),
      ));
    } catch (e) {
      if (mounted) {
        setState(() {
        _loading = false;
        _errorMsg = e.toString().replaceFirst('Exception: ', '');
      });
      }
    }
  }

  Future<void> _login() async {
    if (_loading) return;
    setState(() => _errorMsg = null);
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      final user = await _auth.login(_emailCtrl.text.trim(), _pwCtrl.text);
      if (!mounted) return;
      // ── Berhasil → overlay center confetti
      FocusScope.of(context).unfocus(); // hilangkan keyboard
      await Future.delayed(const Duration(milliseconds: 200)); // tunggu keyboard turun
      if (!mounted) return;
      await showLoginSuccess(context, user.namaLengkap);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(PageRouteBuilder(
        pageBuilder: (_, a, __) => HomeScreen(user: user),
        transitionsBuilder: (_, a, __, child) => FadeTransition(
            opacity: CurvedAnimation(parent: a, curve: Curves.easeOut), child: child),
        transitionDuration: const Duration(milliseconds: 400),
      ));
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().replaceFirst('Exception: ', '');
      // ── Gagal → shake card + error box di dalam card + overlay animasi
      setState(() { _errorMsg = msg; _loading = false; });
      _shakeCtrl.forward(from: 0);
      // Tampilkan overlay error yang tidak full screen
      showLoginFailed(context, msg, shakeCtrl: _shakeCtrl);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    final keyboardOpen = MediaQuery.of(context).viewInsets.bottom > 50;
    final dark = context.isDark;
    final cardBg = dark ? const Color(0xFF182033) : Colors.white;

    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Stack(children: [
        // ── BG gradient ────────────────────────────────────
        FadeTransition(opacity: _bgFade, child: Container(
          decoration: const BoxDecoration(gradient: LinearGradient(
            begin: Alignment.topLeft, end: Alignment.bottomRight,
            colors: [Color(0xFF0F172A), Color(0xFF1E3A8A), Color(0xFF1D4ED8)],
            stops: [0.0, 0.5, 1.0])))),
        Positioned(top: -40, right: -40, child: FadeTransition(opacity: _bgFade,
          child: Container(width: 180, height: 180,
            decoration: BoxDecoration(shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.04))))),
        FadeTransition(opacity: _bgFade, child: const _FloatingBgParticles()),

        SafeArea(child: Column(children: [
          // ── Logo area — collapses when keyboard is open ──
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            height: keyboardOpen ? 0 : h * 0.28,
            child: FadeTransition(
              opacity: _bgFade,
              child: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                ScaleTransition(scale: _logoScale,
                  child: AnimatedBuilder(
                    animation: _glowCtrl,
                    builder: (_, child) {
                      final g = CurvedAnimation(parent: _glowCtrl, curve: Curves.easeInOut).value;
                      return Container(
                        width: 82, height: 82,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.20 + g * 0.14), width: 1.5),
                          boxShadow: [BoxShadow(
                            color: const Color(0xFF3B82F6).withValues(alpha: 0.28 + g * 0.30),
                            blurRadius: 22 + g * 20, spreadRadius: 2 + g * 5)]),
                        child: child);
                    },
                    child: const Icon(Icons.engineering_rounded, color: Colors.white, size: 43))),
                const SizedBox(height: 14),
                const Text('MANDOR APP', style: TextStyle(
                    color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 3)),
                const SizedBox(height: 5),
                Text('PT Krakatau Indah', style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.65), fontSize: 16, fontWeight: FontWeight.w500)),
              ])),
            ),
          ),

          // ── Card form + shake ──────────────────────────
          Expanded(child: SlideTransition(
            position: _cardSlide,
            child: FadeTransition(
              opacity: _cardFade,
              child: AnimatedBuilder(
                animation: _shakeX,
                builder: (_, child) => Transform.translate(
                  offset: Offset(_shakeX.value, 0), child: child),
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: cardBg,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(30))),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(22, 26, 22, 32),
                    child: Form(key: _formKey, child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start, children: [
                      // Header
                      Row(children: [
                        Container(width: 40, height: 40,
                          decoration: BoxDecoration(
                            color: dark ? const Color(0xFF1E3A5F) : AppColors.brand50,
                            borderRadius: BorderRadius.circular(11)),
                          child: const Icon(Icons.lock_person_rounded,
                              color: AppColors.brand600, size: 21)),
                        const SizedBox(width: 12),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(_isEnglish ? 'Welcome Back' : 'Selamat Datang',
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: context.cText)),
                          Text(_isEnglish ? 'Sign in with your email' : 'Masuk menggunakan Email Anda',
                              style: TextStyle(fontSize: 16, color: context.cSub)),
                        ])),
                        // Language toggle
                        GestureDetector(
                          onTap: () => localeService.toggle(),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: dark ? const Color(0xFF1E3A5F) : AppColors.brand50,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: dark
                                  ? const Color(0xFF2A4A6F) : AppColors.brand100)),
                            child: Text(
                              _isEnglish ? '🇮🇩 ID' : '🇬🇧 EN',
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                                color: AppColors.brand600)),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 22),

                      // ── Error box animasi di dalam card ──
                      AnimatedSize(
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeOutCubic,
                        child: _errorMsg != null
                          ? _ErrorBox(message: _errorMsg!, onClose: () => setState(() => _errorMsg = null))
                          : const SizedBox.shrink(),
                      ),
                      if (_errorMsg != null) const SizedBox(height: 14),

                      // Email
                      const FLabel('Email', req: true),
                      TextFormField(
                        controller: _emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autocorrect: false, enableSuggestions: false,
                        style: TextStyle(fontSize: 17, color: context.cText),
                        decoration: _fd(context, 'nama@domain.com', Icons.email_outlined),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) return 'Email wajib diisi';
                          if (!v.trim().contains('@') || !v.trim().contains('.')) return 'Format email tidak valid';
                          return null;
                        },
                      ),
                      const SizedBox(height: 14),

                      // Password
                      const FLabel('Password', req: true),
                      TextFormField(
                        controller: _pwCtrl,
                        obscureText: _obscure,
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _login(),
                        style: TextStyle(fontSize: 17, color: context.cText),
                        decoration: _fd(context, '••••••••', Icons.lock_outline_rounded).copyWith(
                          suffixIcon: IconButton(
                            icon: Icon(_obscure
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                                size: 20, color: context.cMuted),
                            onPressed: () => setState(() => _obscure = !_obscure),
                          )),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Password wajib diisi';
                          if (v.length < 6) return 'Minimal 6 karakter';
                          return null;
                        },
                      ),
                      // Lupa password → panduan hubungi administrator
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _showForgotDialog,
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                            minimumSize: Size.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                          child: Text(
                            _isEnglish ? 'Forgot password?' : 'Lupa password?',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                                color: AppColors.brand600)),
                        ),
                      ),
                      const SizedBox(height: 12),

                      // Login button
                      SizedBox(width: double.infinity, height: 50,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          child: ElevatedButton(
                            onPressed: _loading ? null : _login,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _loading ? AppColors.brand400 : AppColors.brand600,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(13)),
                              elevation: _loading ? 0 : 3,
                              shadowColor: AppColors.brand600.withValues(alpha: 0.35)),
                            child: _loading
                              ? const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                                  SizedBox(width: 18, height: 18,
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)),
                                  SizedBox(width: 10),
                                  Text('Memverifikasi...', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                                ])
                              : const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                                  Icon(Icons.login_rounded, size: 18),
                                  SizedBox(width: 8),
                                  Text('Masuk', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
                                ]),
                          ),
                        )),
                      // Biometric login button
                      if (_bioAvailable && _bioEnabled) ...[
                        const SizedBox(height: 10),
                        SizedBox(width: double.infinity, height: 46,
                          child: OutlinedButton.icon(
                            onPressed: _loading ? null : _loginWithBiometric,
                            icon: const Icon(Icons.fingerprint_rounded, size: 20,
                                color: AppColors.brand600),
                            label: Text(
                              _isEnglish ? 'Sign in with Biometric'
                                         : 'Masuk dengan Biometrik',
                              style: const TextStyle(fontSize: 17,
                                  fontWeight: FontWeight.w600, color: AppColors.brand600)),
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(
                                color: dark ? const Color(0xFF2A4A6F) : AppColors.brand200,
                                width: 1.5),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(13)),
                              backgroundColor: dark
                                  ? const Color(0xFF0D1421) : AppColors.brand50,
                            ),
                          )),
                      ],
                      const SizedBox(height: 16),

                      // Info
                      Container(
                        padding: const EdgeInsets.all(11),
                        decoration: BoxDecoration(
                          color: dark ? const Color(0xFF0F1E38) : AppColors.brand50,
                          borderRadius: BorderRadius.circular(11),
                          border: Border.all(color: dark ? const Color(0xFF1E3A5F) : AppColors.brand100)),
                        child: Row(children: [
                          const Icon(Icons.info_outline_rounded, size: 14, color: AppColors.brand500),
                          const SizedBox(width: 8),
                          Expanded(child: Text(
                            'Gunakan email yang terdaftar untuk masuk.\nBelum terdaftar? Hubungi administrator.',
                            style: TextStyle(fontSize: 15,
                              color: dark ? const Color(0xFF7DAAEF) : AppColors.brand700,
                              height: 1.4))),
                        ]),
                      ),
                    ])),
                  ),
                ),
              ),
            ),
          )),
        ])),
      ]),
    );
  }

  // Akun mandor tidak memakai reset lewat email; password direset oleh administrator
  // dari panel web (Pengaturan → Akun Mobile).
  void _showForgotDialog() {
    final dark = context.isDark;
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: dark ? const Color(0xFF182033) : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(children: [
          const Icon(Icons.lock_reset_rounded, color: AppColors.brand600),
          const SizedBox(width: 10),
          Expanded(child: Text(
            _isEnglish ? 'Forgot password?' : 'Lupa password?',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: ctx.cText))),
        ]),
        content: Text(
          _isEnglish
              ? 'Please contact your administrator or HR to reset your password.\n\n'
                'The administrator can reset it from the web panel: Settings → Mobile Accounts. '
                'Then sign in with the new password you are given.'
              : 'Silakan hubungi administrator atau HRD untuk mereset password Anda.\n\n'
                'Administrator dapat mengatur ulang dari panel web: Pengaturan → Akun Mobile. '
                'Setelah itu, masuk dengan password baru yang diberikan.',
          style: TextStyle(fontSize: 16, height: 1.5, color: ctx.cSub)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(_isEnglish ? 'Got it' : 'Mengerti',
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.brand600))),
        ],
      ),
    );
  }

  InputDecoration _fd(BuildContext context, String hint, IconData icon) {
    final dark = context.isDark;
    final borderColor = dark ? const Color(0xFF334155) : const Color(0xFFB8C4D4);
    return InputDecoration(
      hintText: hint,
      prefixIcon: Padding(padding: const EdgeInsets.all(11),
        child: Container(padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: dark ? const Color(0xFF0D1421) : AppColors.surface,
            borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 16, color: AppColors.brand600))),
      filled: true,
      fillColor: dark ? const Color(0xFF0D1421) : const Color(0xFFF8FAFF),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(11),
          borderSide: BorderSide(color: borderColor)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(11),
          borderSide: BorderSide(color: borderColor)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(11),
          borderSide: const BorderSide(color: AppColors.brand600, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(11),
          borderSide: const BorderSide(color: AppColors.red500)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(11),
          borderSide: const BorderSide(color: AppColors.red500, width: 2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      hintStyle: TextStyle(color: context.cMuted, fontSize: 16),
    );
  }
}

// ── Floating background particles ─────────────────────────────
class _FloatingBgParticles extends StatefulWidget {
  const _FloatingBgParticles();
  @override State<_FloatingBgParticles> createState() => _FloatingBgParticlesState();
}

class _FloatingBgParticlesState extends State<_FloatingBgParticles> with TickerProviderStateMixin {
  static const _count = 7;
  late final List<AnimationController> _cs;
  late final List<_PData> _data;

  @override void initState() {
    super.initState();
    final rnd = math.Random(99);
    _data = List.generate(_count, (i) => _PData(
      x:    0.05 + rnd.nextDouble() * 0.88,
      size: 7.0  + rnd.nextDouble() * 18.0,
      opa:  0.04 + rnd.nextDouble() * 0.07,
      ms:   4200 + rnd.nextInt(3200),
    ));
    _cs = List.generate(_count, (i) {
      final c = AnimationController(
        vsync: this, duration: Duration(milliseconds: _data[i].ms))..repeat();
      // stagger so they don't all start at the bottom simultaneously
      c.value = (i / _count);
      return c;
    });
  }

  @override void dispose() { for (final c in _cs) {
    c.dispose();
  } super.dispose(); }

  @override Widget build(BuildContext context) {
    final sz = MediaQuery.of(context).size;
    return Positioned.fill(child: IgnorePointer(child: Stack(
      children: List.generate(_count, (i) => AnimatedBuilder(
        animation: _cs[i],
        builder: (_, __) {
          final v = _cs[i].value; // 0→1 looping
          final y = sz.height * (1.05 - v * 1.1);
          final fade = math.sin(v * math.pi).clamp(0.0, 1.0);
          final p = _data[i];
          return Positioned(
            left: sz.width * p.x - p.size / 2,
            top:  y,
            child: Opacity(opacity: p.opa * fade,
              child: Container(
                width: p.size, height: p.size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 1.2)))));
        })))));
  }
}
class _PData {
  final double x, size, opa; final int ms;
  const _PData({required this.x, required this.size, required this.opa, required this.ms});
}

// ── Error box animasi di dalam card (bukan full screen) ────────
class _ErrorBox extends StatefulWidget {
  final String message;
  final VoidCallback onClose;
  const _ErrorBox({required this.message, required this.onClose});
  @override State<_ErrorBox> createState() => _ErrorBoxState();
}

class _ErrorBoxState extends State<_ErrorBox> with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<double> _scale, _fade;

  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 350));
    _scale = Tween(begin: 0.85, end: 1.0).animate(
        CurvedAnimation(parent: _c, curve: const Cubic(0.34, 1.56, 0.64, 1)));
    _fade = CurvedAnimation(parent: _c, curve: Curves.easeOut);
    _c.forward();
  }

  @override void dispose() { _c.dispose(); super.dispose(); }

  @override Widget build(BuildContext context) => ScaleTransition(
    scale: _scale,
    child: FadeTransition(
      opacity: _fade,
      child: Container(
        padding: const EdgeInsets.fromLTRB(13, 11, 8, 11),
        decoration: BoxDecoration(
          color: AppColors.red50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.red500.withValues(alpha: 0.4), width: 1.5),
          boxShadow: [BoxShadow(
            color: AppColors.red600.withValues(alpha: 0.12),
            blurRadius: 12, offset: const Offset(0, 3))]),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Ikon animasi
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.0, end: 1.0),
            duration: const Duration(milliseconds: 400),
            curve: const Cubic(0.34, 1.56, 0.64, 1),
            builder: (_, v, child) => Transform.scale(scale: v, child: child),
            child: Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: AppColors.red100, borderRadius: BorderRadius.circular(8)),
              child: const Icon(Icons.error_rounded, color: AppColors.red600, size: 18)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Login Gagal', style: TextStyle(
                fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.red600)),
            const SizedBox(height: 2),
            Text(widget.message, style: const TextStyle(
                fontSize: 15, color: AppColors.red800, height: 1.4),
                maxLines: 3, overflow: TextOverflow.ellipsis),
          ])),
          // Close button
          GestureDetector(
            onTap: widget.onClose,
            child: Container(
              padding: const EdgeInsets.all(4),
              child: const Icon(Icons.close_rounded, size: 16, color: AppColors.red600)),
          ),
        ]),
      ),
    ),
  );
}
