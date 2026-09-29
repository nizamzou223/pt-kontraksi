import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'models/models.dart';

/// Token warna yang disalin dari tema "SOFT" web admin (admin-web/tailwind.config.js & globals.css):
/// biru kurang jenuh, gradien #4059ad → #5b9bd5, kartu bersudut bulat dengan bayangan tipis kebiruan.
/// Status tidak pernah hanya dibedakan oleh warna: selalu disertai teks/ikon.
class Palet {
  // Skala brand (blue-50 … blue-900 web admin)
  static const brand50 = Color(0xFFF3F6FD);
  static const brand100 = Color(0xFFE6ECFA);
  static const brand200 = Color(0xFFCFDAF5);
  static const brand400 = Color(0xFF869FE4);
  static const brand500 = Color(0xFF6784D8);
  static const brand600 = Color(0xFF4F6FC7);
  static const brand700 = Color(0xFF4059AD);
  static const brand800 = Color(0xFF364B8C);
  static const brand900 = Color(0xFF2E3D6E);
  static const sky = Color(0xFF5B9BD5);
  static const skyTerang = Color(0xFF8CCAF0);

  // Permukaan (mode terang)
  static const surface = Color(0xFFF6F8FD);
  static const border = Color(0xFFE6EAF2);
  static const teksUtama = Color(0xFF2B3450);
  static const teksSub = Color(0xFF6B7691);
  static const teksRedup = Color(0xFF9AA4BD);
  static const abu100 = Color(0xFFF1F4F9);

  // Permukaan (mode gelap — sama dengan sidebar gelap web admin)
  static const gelapLatar = Color(0xFF0D1421);
  static const gelapKartu = Color(0xFF182033);
  static const gelapBorder = Color(0xFF2A3650);
  static const gelapTeks = Color(0xFFDDE6F5);
  static const gelapSub = Color(0xFF8A9AB8);

  // Gradien khas web admin
  static const gradienBrand = LinearGradient(colors: [brand700, sky], begin: Alignment.topLeft, end: Alignment.bottomRight);
  static const gradienBar = LinearGradient(colors: [brand700, sky, skyTerang]);
  static const gradienGelap = LinearGradient(
    colors: [Color(0xFF2F3A5C), brand900, brand800],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static Color risiko(Risiko r, Brightness b) {
    final gelap = b == Brightness.dark;
    return switch (r) {
      Risiko.habis => gelap ? const Color(0xFFF87171) : const Color(0xFFB91C1C),
      Risiko.kritis => gelap ? const Color(0xFFFB923C) : const Color(0xFFC2410C),
      Risiko.waspada => gelap ? const Color(0xFFFBBF24) : const Color(0xFFB45309),
      Risiko.aman => gelap ? const Color(0xFF34D399) : const Color(0xFF047857),
    };
  }

  static IconData ikonRisiko(Risiko r) => switch (r) {
        Risiko.habis => Icons.error_rounded,
        Risiko.kritis => Icons.warning_rounded,
        Risiko.waspada => Icons.schedule_rounded,
        Risiko.aman => Icons.check_circle_rounded,
      };

  static Color tingkat(Tingkat t, Brightness b) {
    final gelap = b == Brightness.dark;
    return switch (t) {
      Tingkat.tinggi => gelap ? const Color(0xFFF87171) : const Color(0xFFB91C1C),
      Tingkat.sedang => gelap ? const Color(0xFFFBBF24) : const Color(0xFFB45309),
      Tingkat.rendah => gelap ? const Color(0xFF7DD3FC) : const Color(0xFF0369A1),
    };
  }

  static Color status(StatusTinjauan s, Brightness b) {
    final gelap = b == Brightness.dark;
    return switch (s) {
      StatusTinjauan.baru => gelap ? const Color(0xFF93C5FD) : brand700,
      StatusTinjauan.valid => gelap ? const Color(0xFFF87171) : const Color(0xFFB91C1C),
      StatusTinjauan.bukanAnomali => gelap ? const Color(0xFF34D399) : const Color(0xFF047857),
      StatusTinjauan.diabaikan => gelap ? const Color(0xFF9CA3AF) : const Color(0xFF4B5563),
    };
  }

  /// Bayangan kartu web admin: 0 2px 8px rgba(48,63,120,0.05).
  static List<BoxShadow> bayangan(Brightness b) => b == Brightness.dark
      ? const []
      : const [BoxShadow(color: Color(0x0D303F78), blurRadius: 8, offset: Offset(0, 2))];
}

/// [fontPengganti] hanya untuk pengujian tanpa jaringan (mengganti Plus Jakarta Sans dari Google Fonts).
ThemeData buildTheme(Brightness b, {String? fontPengganti}) {
  final gelap = b == Brightness.dark;
  final primer = gelap ? Palet.brand500 : Palet.brand700;
  final latar = gelap ? Palet.gelapLatar : Palet.surface;
  final kartu = gelap ? Palet.gelapKartu : Colors.white;
  final garis = gelap ? Palet.gelapBorder : Palet.border;
  final teks = gelap ? Palet.gelapTeks : Palet.teksUtama;
  final teksSub = gelap ? Palet.gelapSub : Palet.teksSub;

  final scheme = ColorScheme(
    brightness: b,
    primary: primer,
    onPrimary: Colors.white,
    primaryContainer: gelap ? const Color(0xFF26355E) : Palet.brand100,
    onPrimaryContainer: gelap ? const Color(0xFFCFDAF5) : Palet.brand900,
    secondary: Palet.sky,
    onSecondary: Colors.white,
    secondaryContainer: gelap ? const Color(0xFF203552) : const Color(0xFFE3F0FA),
    onSecondaryContainer: gelap ? const Color(0xFFBFE0F7) : const Color(0xFF1F4E79),
    tertiary: gelap ? const Color(0xFF34D399) : const Color(0xFF3FAE8A),
    onTertiary: Colors.white,
    error: gelap ? const Color(0xFFF87171) : const Color(0xFFCC5454),
    onError: Colors.white,
    errorContainer: gelap ? const Color(0xFF4A2626) : const Color(0xFFFBE2E2),
    onErrorContainer: gelap ? const Color(0xFFFECACA) : const Color(0xFF8E2B2B),
    surface: kartu,
    onSurface: teks,
    onSurfaceVariant: teksSub,
    surfaceContainerHighest: gelap ? const Color(0xFF223050) : Palet.abu100,
    surfaceContainerHigh: gelap ? const Color(0xFF1E2A44) : Palet.abu100,
    outline: gelap ? const Color(0xFF4E5F7C) : const Color(0xFFD5DBE8),
    outlineVariant: garis,
    inverseSurface: gelap ? Palet.gelapTeks : Palet.brand900,
    onInverseSurface: gelap ? Palet.gelapLatar : Colors.white,
    shadow: const Color(0x66303F78),
    surfaceTint: Colors.transparent,
  );

  TextStyle gaya({double? fontSize, FontWeight? fontWeight, Color? color}) => fontPengganti != null
      ? TextStyle(fontFamily: fontPengganti, fontSize: fontSize, fontWeight: fontWeight, color: color)
      : GoogleFonts.plusJakartaSans(fontSize: fontSize, fontWeight: fontWeight, color: color);

  final base = ThemeData(brightness: b, useMaterial3: true, colorScheme: scheme);
  final font = fontPengganti != null
      ? base.textTheme.apply(fontFamily: fontPengganti, bodyColor: teks, displayColor: teks)
      : GoogleFonts.plusJakartaSansTextTheme(base.textTheme).apply(bodyColor: teks, displayColor: teks);

  return base.copyWith(
    textTheme: font,
    scaffoldBackgroundColor: latar,
    appBarTheme: AppBarTheme(
      backgroundColor: kartu,
      foregroundColor: teks,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: gaya(fontSize: 19, fontWeight: FontWeight.w800, color: gelap ? Palet.gelapTeks : Palet.brand900),
      systemOverlayStyle: gelap ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    cardTheme: CardThemeData(
      color: kartu,
      elevation: gelap ? 0 : 1,
      shadowColor: const Color(0x40303F78),
      margin: EdgeInsets.zero,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: garis)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: kartu,
      surfaceTintColor: Colors.transparent,
      indicatorColor: gelap ? const Color(0xFF26355E) : Palet.brand100,
      height: 68,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(
            color: s.contains(WidgetState.selected) ? (gelap ? const Color(0xFF93C5FD) : Palet.brand700) : (gelap ? Palet.gelapSub : Palet.teksRedup),
          )),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => gaya(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: s.contains(WidgetState.selected) ? (gelap ? const Color(0xFF93C5FD) : Palet.brand700) : (gelap ? Palet.gelapSub : Palet.teksSub),
          )),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kartu,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: const TextStyle(color: Color(0xFFB7C0DA)),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: garis)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: garis)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: primer, width: 2)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        backgroundColor: primer,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: gaya(fontSize: 16, fontWeight: FontWeight.w800),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        foregroundColor: gelap ? const Color(0xFF93C5FD) : Palet.brand700,
        side: BorderSide(color: gelap ? Palet.gelapBorder : Palet.brand200, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: gaya(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: gelap ? const Color(0xFF93C5FD) : Palet.brand700,
        textStyle: gaya(fontWeight: FontWeight.w700),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: primer,
      foregroundColor: Colors.white,
      elevation: 3,
      extendedTextStyle: gaya(fontWeight: FontWeight.w800, fontSize: 15),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      side: BorderSide(color: garis),
      labelStyle: gaya(fontSize: 13, fontWeight: FontWeight.w700),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : (gelap ? Palet.gelapSub : Palet.teksRedup)),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primer : (gelap ? Palet.gelapBorder : const Color(0xFFE6EAF2))),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    sliderTheme: SliderThemeData(activeTrackColor: primer, thumbColor: primer, inactiveTrackColor: gelap ? Palet.gelapBorder : Palet.brand100, overlayColor: primer.withValues(alpha: 0.12)),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: primer, linearTrackColor: gelap ? Palet.gelapBorder : Palet.brand100),
    dividerTheme: DividerThemeData(color: garis, thickness: 1, space: 1),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: kartu,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
    ),
    dialogTheme: DialogThemeData(backgroundColor: kartu, surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24))),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: gelap ? Palet.gelapTeks : Palet.brand900,
      contentTextStyle: gaya(color: gelap ? Palet.gelapLatar : Colors.white, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
  );
}
