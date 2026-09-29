import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'services/auth_service.dart';
import 'services/theme_service.dart';
import 'services/locale_service.dart';

const _url  = 'https://zrgzersltowinheqtdpc.supabase.co';
// "publishable key" = nama baru untuk anon key lama; nilainya sama, aman dipakai publik.
const _publishableKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZ3plcnNsdG93aW5oZXF0ZHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTYxNTksImV4cCI6MjA5NTA5MjE1OX0.XTxfR2tJrKteulY7yh2ixQrx0pCPoGsktK3tnqkO_RM';

// Global singletons — ChangeNotifier pattern same as ThemeService.
final localeService = LocaleService();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([
    initializeDateFormatting('id_ID', null),
    initializeDateFormatting('en_US', null),
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]),
    Supabase.initialize(url: _url, publishableKey: _publishableKey),
    ThemeService().init(),
    localeService.init(),
  ]);
  runApp(const MandorApp());
}

class MandorApp extends StatefulWidget {
  const MandorApp({super.key});
  @override State<MandorApp> createState() => _MandorAppState();
}

class _MandorAppState extends State<MandorApp> {
  final _theme = ThemeService();

  @override void initState() {
    super.initState();
    _theme.addListener(_rebuild);
    localeService.addListener(_rebuild);
  }
  @override void dispose() {
    _theme.removeListener(_rebuild);
    localeService.removeListener(_rebuild);
    super.dispose();
  }
  void _rebuild() => setState(() {});

  @override Widget build(BuildContext context) => MaterialApp(
    title: 'Mandor - PT Krakatau Indah',
    debugShowCheckedModeBanner: false,
    locale: localeService.locale,
    supportedLocales: const [Locale('id', 'ID'), Locale('en', 'US')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    themeMode: _theme.mode,
    theme: _lightTheme(),
    darkTheme: _darkTheme(),
    home: const _SplashRouter(),
  );

  // ── LIGHT ─────────────────────────────────────────────────
  ThemeData _lightTheme() {
    const brand   = Color(0xFF2563EB);
    const surface = Color(0xFFF4F7FF);
    const textMain = Color(0xFF1E293B);
    const textSub  = Color(0xFF64748B);
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: brand, brightness: Brightness.light,
        primary: brand, onPrimary: Colors.white, surface: Colors.white),
      textTheme: GoogleFonts.plusJakartaSansTextTheme().copyWith(
        bodyLarge:   GoogleFonts.plusJakartaSans(color: textMain, fontSize: 17),
        bodyMedium:  GoogleFonts.plusJakartaSans(color: textMain, fontSize: 16),
        bodySmall:   GoogleFonts.plusJakartaSans(color: textSub, fontSize: 16),
        titleLarge:  GoogleFonts.plusJakartaSans(color: textMain, fontSize: 20, fontWeight: FontWeight.w700),
        titleMedium: GoogleFonts.plusJakartaSans(color: textMain, fontSize: 19, fontWeight: FontWeight.w600),
        labelLarge:  GoogleFonts.plusJakartaSans(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600),
      ),
      scaffoldBackgroundColor: surface,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.white, foregroundColor: textMain,
        elevation: 0, centerTitle: false,
        titleTextStyle: GoogleFonts.plusJakartaSans(color: textMain, fontSize: 20, fontWeight: FontWeight.w700),
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        surfaceTintColor: Colors.transparent,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(
        backgroundColor: brand, foregroundColor: Colors.white, elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: GoogleFonts.plusJakartaSans(fontSize: 17, fontWeight: FontWeight.w600))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE0E7FF))),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Color(0xFFE0E7FF))),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: brand, width: 2)),
        hintStyle: GoogleFonts.plusJakartaSans(color: const Color(0xFFC7D2FE), fontSize: 16)),
      cardTheme: CardThemeData(color: Colors.white, elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFE0E7FF))), margin: EdgeInsets.zero),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: Colors.white, selectedItemColor: brand,
        unselectedItemColor: Color(0xFF94A3B8), type: BottomNavigationBarType.fixed, elevation: 8),
      dividerTheme: const DividerThemeData(color: Color(0xFFE0E7FF), thickness: 1, space: 1),
    );
  }

  // ── DARK ──────────────────────────────────────────────────
  ThemeData _darkTheme() {
    const brand    = Color(0xFF4D8EF8);   // softer blue — less glare in dark
    const surface  = Color(0xFF0D1421);   // deep navy, warmer than pure slate
    const card     = Color(0xFF182033);   // card layer — clear lift from surface
    const border   = Color(0xFF2A3650);   // subtle border, not harsh
    const textMain = Color(0xFFDDE6F5);   // soft blue-white, 87% — eye-friendly
    const textSub  = Color(0xFF8A9AB8);   // muted steel blue-gray
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: brand, brightness: Brightness.dark,
        primary: brand, onPrimary: Colors.white,
        surface: card, onSurface: textMain),
      textTheme: GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme).copyWith(
        bodyLarge:   GoogleFonts.plusJakartaSans(color: textMain, fontSize: 17),
        bodyMedium:  GoogleFonts.plusJakartaSans(color: textMain, fontSize: 16),
        bodySmall:   GoogleFonts.plusJakartaSans(color: textSub, fontSize: 16),
        titleLarge:  GoogleFonts.plusJakartaSans(color: textMain, fontSize: 20, fontWeight: FontWeight.w700),
        titleMedium: GoogleFonts.plusJakartaSans(color: textMain, fontSize: 19, fontWeight: FontWeight.w600),
        labelLarge:  GoogleFonts.plusJakartaSans(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600),
      ),
      scaffoldBackgroundColor: surface,
      appBarTheme: AppBarTheme(
        backgroundColor: card, foregroundColor: textMain,
        elevation: 0, centerTitle: false,
        titleTextStyle: GoogleFonts.plusJakartaSans(color: textMain, fontSize: 20, fontWeight: FontWeight.w700),
        systemOverlayStyle: SystemUiOverlayStyle.light,
        surfaceTintColor: Colors.transparent,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(
        backgroundColor: brand, foregroundColor: Colors.white, elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: GoogleFonts.plusJakartaSans(fontSize: 17, fontWeight: FontWeight.w600))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: card,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: border)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: border)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: brand, width: 2)),
        hintStyle: GoogleFonts.plusJakartaSans(color: const Color(0xFF475569), fontSize: 16)),
      cardTheme: CardThemeData(color: card, elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: border)), margin: EdgeInsets.zero),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: card, selectedItemColor: brand,
        unselectedItemColor: textSub, type: BottomNavigationBarType.fixed, elevation: 8),
      dividerTheme: const DividerThemeData(color: border, thickness: 1, space: 1),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// SPLASH ROUTER — cepat, animasi branded
// ══════════════════════════════════════════════════════════════
class _SplashRouter extends StatefulWidget {
  const _SplashRouter();
  @override State<_SplashRouter> createState() => _SplashRouterState();
}

class _SplashRouterState extends State<_SplashRouter> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _logoScale, _logoFade, _textFade;
  UserModel? _user;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    // Logo pop in
    _logoScale = Tween(begin: 0.5, end: 1.0).animate(
        CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.6, curve: Cubic(0.34, 1.56, 0.64, 1))));
    _logoFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.4, curve: Curves.easeOut));
    _textFade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.4, 1.0, curve: Curves.easeOut));
    _ctrl.forward();
    // Restore session tanpa blocking animasi
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    try {
      final user = await AuthService().restoreSession()
          .timeout(const Duration(seconds: 4)); // timeout max 4 detik
      if (mounted) setState(() { _user = user; });
    } catch (_) {
      if (mounted) setState(() {});
    }
    _navigate();
  }

  void _navigate() {
    // Tunggu animasi selesai minimal 1.1 detik total splash
    final elapsed = _ctrl.lastElapsedDuration ?? Duration.zero;
    final wait = Duration(milliseconds: (1100 - elapsed.inMilliseconds).clamp(0, 800));
    Future.delayed(wait, () {
      if (!mounted) return;
      Navigator.of(context).pushReplacement(PageRouteBuilder(
        pageBuilder: (_, a, __) => _user != null ? HomeScreen(user: _user!) : const LoginScreen(),
        transitionsBuilder: (_, a, __, child) => FadeTransition(
            opacity: CurvedAnimation(parent: a, curve: Curves.easeOut), child: child),
        transitionDuration: const Duration(milliseconds: 350),
      ));
    });
  }

  @override void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [Color(0xFF0F172A), Color(0xFF1E3A8A), Color(0xFF1D4ED8)],
          stops: [0.0, 0.5, 1.0]),
      ),
      child: Center(child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, __) => Column(mainAxisSize: MainAxisSize.min, children: [
          // Logo pop
          FadeTransition(opacity: _logoFade,
            child: ScaleTransition(scale: _logoScale,
              child: Container(
                width: 90, height: 90,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 1.5),
                  boxShadow: [BoxShadow(
                    color: const Color(0xFF3B82F6).withValues(alpha: 0.4),
                    blurRadius: 32, spreadRadius: 4)]),
                child: const Icon(Icons.engineering_rounded, color: Colors.white, size: 48)))),
          const SizedBox(height: 20),
          // Teks fade in setelah logo
          FadeTransition(opacity: _textFade,
            child: Column(children: [
              const Text('MANDOR APP', style: TextStyle(
                  color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 3.5)),
              const SizedBox(height: 6),
              Text('PT Krakatau Indah', style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.65), fontSize: 16, fontWeight: FontWeight.w500)),
            ])),
          const SizedBox(height: 40),
          // Loading indicator kecil
          FadeTransition(opacity: _textFade,
            child: SizedBox(width: 28, height: 28,
              child: CircularProgressIndicator(
                color: Colors.white.withValues(alpha: 0.5),
                strokeWidth: 2))),
        ]),
      )),
    ),
  );
}
