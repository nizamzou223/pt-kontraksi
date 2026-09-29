import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

// ═══════════════════════════════════════════════════════════
// DESIGN TOKENS — persis admin-web globals.css
// ═══════════════════════════════════════════════════════════
class AppColors {
  static const brand50  = Color(0xFFEFF6FF);
  static const brand100 = Color(0xFFDBEAFE);
  static const brand200 = Color(0xFFBFDBFE);
  static const brand300 = Color(0xFF93C5FD);
  static const brand400 = Color(0xFF60A5FA);
  static const brand500 = Color(0xFF3B82F6);
  static const brand600 = Color(0xFF2563EB);
  static const brand700 = Color(0xFF1D4ED8);
  static const brand800 = Color(0xFF1E40AF);
  static const brand900 = Color(0xFF1E3A5F);
  static const surface  = Color(0xFFF4F7FF);
  static const border   = Color(0xFFE0E7FF);
  static const textMain = Color(0xFF1E293B);
  static const textSub  = Color(0xFF64748B);
  static const textMuted= Color(0xFF94A3B8);
  static const green50  = Color(0xFFF0FDF4);
  static const green100 = Color(0xFFDCFCE7);
  static const green500 = Color(0xFF22C55E);
  static const green600 = Color(0xFF16A34A);
  static const green800 = Color(0xFF166534);
  static const red50    = Color(0xFFFEF2F2);
  static const red100   = Color(0xFFFEE2E2);
  static const red500   = Color(0xFFEF4444);
  static const red600   = Color(0xFFDC2626);
  static const red800   = Color(0xFF991B1B);
  static const amber50  = Color(0xFFFFFBEB);
  static const amber100 = Color(0xFFFEF9C3);
  static const amber600 = Color(0xFFD97706);
  static const amber800 = Color(0xFF92400E);
  static const gray100  = Color(0xFFF1F5F9);
  static const gray400  = Color(0xFF94A3B8);
  static const gray600  = Color(0xFF475569);
  static const purple100= Color(0xFFEDE9FE);
  static const purple600= Color(0xFF7C3AED);
  static const cyan100  = Color(0xFFCFFAFE);
  static const cyan600  = Color(0xFF0891B2);
}

// ─── Theme helpers — dark/light context accessors ────────────
extension AppTheme on BuildContext {
  bool  get isDark   => Theme.of(this).brightness == Brightness.dark;
  Color get cSurface => Theme.of(this).scaffoldBackgroundColor;
  Color get cCard    => Theme.of(this).colorScheme.surface;
  Color get cBorder  => isDark ? const Color(0xFF334155) : const Color(0xFFE0E7FF);
  Color get cText    => isDark ? const Color(0xFFF1F5F9) : const Color(0xFF1E293B);
  Color get cSub     => isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);
  Color get cMuted   => isDark ? const Color(0xFF475569) : const Color(0xFF94A3B8);
}

// ─── Responsive ──────────────────────────────────────────────
class R {
  static double w(BuildContext c) => MediaQuery.of(c).size.width;
  static double h(BuildContext c) => MediaQuery.of(c).size.height;
  static double sp(BuildContext c, double s) {
    final w = MediaQuery.of(c).size.width;
    if (w < 360) return s * 0.87;
    if (w < 400) return s * 0.93;
    if (w > 480) return s * 1.05;
    return s;
  }
  static EdgeInsets get page => const EdgeInsets.fromLTRB(14, 10, 14, 14);
}

// ═══════════════════════════════════════════════════════════
// ANIMATIONS — matching admin-web cubic-bezier(0.22,1,0.36,1)
// ═══════════════════════════════════════════════════════════
const _kCurve  = Cubic(0.22, 1.0, 0.36, 1.0); // admin-web spring curve
const _kEase   = Curves.easeOut;
const _kFast   = Duration(milliseconds: 220);
const _kNormal = Duration(milliseconds: 280);

/// slideUp 0.28s cubic-bezier(0.22,1,0.36,1) — like admin-web .animate-slideUp
class SlideUp extends StatefulWidget {
  final Widget child;
  final Duration delay;
  final double dy;
  const SlideUp({super.key, required this.child, this.delay = Duration.zero, this.dy = 16});
  @override State<SlideUp> createState() => _SlideUpState();
}
class _SlideUpState extends State<SlideUp> with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<Offset> _slide; late Animation<double> _fade;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: _kNormal);
    _fade  = CurvedAnimation(parent: _c, curve: _kEase);
    _slide = Tween<Offset>(begin: Offset(0, widget.dy/100), end: Offset.zero)
        .animate(CurvedAnimation(parent: _c, curve: _kCurve));
    Future.delayed(widget.delay, () { if (mounted) _c.forward(); });
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => FadeTransition(
    opacity: _fade, child: SlideTransition(position: _slide, child: widget.child));
}

/// slideDown from top with spring — for alert banners
class SlideDown extends StatefulWidget {
  final Widget child;
  final Duration delay;
  const SlideDown({super.key, required this.child, this.delay = Duration.zero});
  @override State<SlideDown> createState() => _SlideDownState();
}
class _SlideDownState extends State<SlideDown> with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<Offset> _slide;
  late Animation<double> _fade;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 440));
    _slide = Tween<Offset>(begin: const Offset(0, -0.8), end: Offset.zero)
        .animate(CurvedAnimation(parent: _c, curve: const Cubic(0.34, 1.56, 0.64, 1)));
    _fade = CurvedAnimation(parent: _c, curve: Curves.easeOut);
    Future.delayed(widget.delay, () { if (mounted) _c.forward(); });
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => FadeTransition(
    opacity: _fade, child: SlideTransition(position: _slide, child: widget.child));
}

/// scaleIn 0.22s — like admin-web .animate-scaleIn
class ScaleIn extends StatefulWidget {
  final Widget child; final Duration delay;
  const ScaleIn({super.key, required this.child, this.delay = Duration.zero});
  @override State<ScaleIn> createState() => _ScaleInState();
}
class _ScaleInState extends State<ScaleIn> with SingleTickerProviderStateMixin {
  late AnimationController _c;
  late Animation<double> _s, _f;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: _kFast);
    _s = Tween(begin: 0.88, end: 1.0).animate(CurvedAnimation(parent: _c, curve: _kCurve));
    _f = CurvedAnimation(parent: _c, curve: _kEase);
    Future.delayed(widget.delay, () { if (mounted) _c.forward(); });
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => FadeTransition(
    opacity: _f, child: ScaleTransition(scale: _s, child: widget.child));
}

/// FadeIn 0.22s ease-out — admin-web .animate-fadeIn
class FadeIn extends StatefulWidget {
  final Widget child; final Duration delay; final Duration duration;
  const FadeIn({super.key, required this.child,
    this.delay = Duration.zero, this.duration = _kFast});
  @override State<FadeIn> createState() => _FadeInState();
}
class _FadeInState extends State<FadeIn> with SingleTickerProviderStateMixin {
  late AnimationController _c; late Animation<double> _a;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: widget.duration);
    _a = CurvedAnimation(parent: _c, curve: _kEase);
    Future.delayed(widget.delay, () { if (mounted) _c.forward(); });
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => FadeTransition(opacity: _a, child: widget.child);
}

// ═══════════════════════════════════════════════════════════
// CORE WIDGETS
// ═══════════════════════════════════════════════════════════
class AppCard extends StatelessWidget {
  final Widget child; final EdgeInsetsGeometry? padding;
  final Color? color; final VoidCallback? onTap; final double radius;
  const AppCard({super.key, required this.child, this.padding,
    this.color, this.onTap, this.radius = 14});
  @override Widget build(BuildContext context) => Material(
    color: color ?? context.cCard,
    borderRadius: BorderRadius.circular(radius),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap, borderRadius: BorderRadius.circular(radius),
      splashColor: AppColors.brand100.withValues(alpha: 0.3),
      highlightColor: AppColors.brand50.withValues(alpha: 0.5),
      child: Container(
        padding: padding ?? const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(color: context.cBorder),
        ),
        child: child,
      ),
    ),
  );
}

class GradientCard extends StatelessWidget {
  final Widget child; final List<Color> colors;
  final EdgeInsetsGeometry? padding; final double radius;
  const GradientCard({super.key, required this.child,
    this.colors = const [AppColors.brand600, AppColors.brand800],
    this.padding, this.radius = 18});
  @override Widget build(BuildContext context) => Container(
    padding: padding ?? const EdgeInsets.all(18),
    decoration: BoxDecoration(
      gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
      borderRadius: BorderRadius.circular(radius),
      boxShadow: [BoxShadow(color: colors.first.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0,4))],
    ),
    child: child,
  );
}

class StatCard extends StatelessWidget {
  final String label, value; final IconData icon;
  final Color iconColor, iconBg; final String? sub; final Color? valColor;
  const StatCard({super.key, required this.label, required this.value,
    required this.icon, required this.iconColor, required this.iconBg,
    this.sub, this.valColor});
  @override Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(12),
    child: Row(children: [
      Container(width: 42, height: 42,
        decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(11)),
        child: Icon(icon, color: iconColor, size: 20)),
      const SizedBox(width: 10),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft,
          child: Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800,
              color: valColor ?? context.cText))),
        Text(label, style: TextStyle(fontSize: 15, color: context.cSub),
            maxLines: 1, overflow: TextOverflow.ellipsis),
        if (sub != null) Text(sub!, style: TextStyle(fontSize: 14, color: context.cMuted),
            maxLines: 1, overflow: TextOverflow.ellipsis),
      ])),
    ]),
  );
}

/// Status badge — sesuai .badge-hadir .badge-alfa .badge-pending di admin-web
class StatusBadge extends StatelessWidget {
  final String status; final double? fontSize;
  const StatusBadge({super.key, required this.status, this.fontSize});
  @override Widget build(BuildContext context) {
    final (bg, fg, lbl) = _s(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20),
          border: Border.all(color: fg.withValues(alpha: 0.3))),
      child: Text(lbl, style: TextStyle(color: fg, fontSize: fontSize ?? 15, fontWeight: FontWeight.w700)),
    );
  }
  (Color, Color, String) _s(String s) => switch (s.toLowerCase()) {
    'belum_lengkap' => (AppColors.brand100, AppColors.brand600, 'Sedang Bekerja'),
    'hadir'       => (AppColors.green100, AppColors.green600, 'Selesai'),
    'alfa'||'tidak_hadir'||'sakit'||'izin' => (AppColors.red100, AppColors.red600, 'Tidak Hadir'),
    'pending'     => (AppColors.amber100, AppColors.amber800, 'Pending'),
    'disetujui'   => (AppColors.green100, AppColors.green600, 'Disetujui'),
    'ditolak'     => (AppColors.red100, AppColors.red600, 'Ditolak'),
    'aktif'       => (AppColors.green100, AppColors.green600, 'Aktif'),
    'draft'       => (AppColors.gray100, AppColors.gray600, 'Draft'),
    'dibayar'     => (AppColors.green100, AppColors.green600, 'Dibayar'),
    'lunas'       => (AppColors.green100, AppColors.green600, 'Lunas'),
    'qr_code'     => (AppColors.brand100, AppColors.brand700, 'QR Scan'),
    'manual'      => (AppColors.green100, AppColors.green500, 'Manual'),
    'otomatis'    => (AppColors.gray100, AppColors.gray400, 'Auto'),
    _             => (AppColors.gray100, AppColors.gray600, s),
  };
}

class AppLoading extends StatelessWidget {
  final String? message;
  const AppLoading({super.key, this.message});
  @override Widget build(BuildContext context) => Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const SizedBox(width: 34, height: 34,
        child: CircularProgressIndicator(color: AppColors.brand600, strokeWidth: 2.5)),
      if (message != null) ...[const SizedBox(height: 12),
        Text(message!, style: TextStyle(color: context.cSub, fontSize: 16))],
    ]));
}

class AppEmpty extends StatelessWidget {
  final String message; final IconData icon;
  final String? action; final VoidCallback? onAction;
  const AppEmpty({super.key, required this.message, this.icon = Icons.inbox_outlined,
    this.action, this.onAction});
  @override Widget build(BuildContext context) => Center(
    child: Padding(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
      ScaleIn(child: Container(width: 66, height: 66,
        decoration: BoxDecoration(color: AppColors.brand50, borderRadius: BorderRadius.circular(33)),
        child: Icon(icon, color: AppColors.brand400, size: 30))),
      const SizedBox(height: 14),
      Text(message, style: TextStyle(color: context.cSub, fontSize: 16, height: 1.5),
          textAlign: TextAlign.center),
      if (action != null && onAction != null) ...[
        const SizedBox(height: 14),
        ElevatedButton(onPressed: onAction, child: Text(action!)),
      ],
    ])));
}

// ─── Sheet helpers ────────────────────────────────────────────
Widget sheetHandle(BuildContext ctx) => Center(child: Container(
  margin: const EdgeInsets.only(top: 10, bottom: 4), width: 36, height: 4,
  decoration: BoxDecoration(color: ctx.cBorder, borderRadius: BorderRadius.circular(2))));

Widget sheetTitle(BuildContext ctx, String title, {String? sub}) => Padding(
  padding: const EdgeInsets.fromLTRB(18, 4, 8, 4),
  child: Row(children: [
    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: ctx.cText)),
      if (sub != null) Text(sub, style: TextStyle(fontSize: 16, color: ctx.cSub)),
    ])),
    IconButton(icon: Icon(Icons.close_rounded, color: ctx.cSub, size: 20),
        onPressed: () => Navigator.pop(ctx)),
  ]));

class FLabel extends StatelessWidget {
  final String text; final bool req;
  const FLabel(this.text, {super.key, this.req = false});
  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: RichText(text: TextSpan(
      text: text,
      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: context.cText),
      children: req ? [const TextSpan(text: ' *', style: TextStyle(color: AppColors.red500))] : [])));
}

InputDecoration fDeco(BuildContext context, {String? hint, String? label, Widget? prefix, Widget? suffix}) =>
    InputDecoration(
      hintText: hint, labelText: label,
      prefixIcon: prefix, suffixIcon: suffix,
      filled: true, fillColor: context.cCard,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: context.cBorder)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: context.cBorder)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.brand600, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.red500)),
      hintStyle: TextStyle(color: context.cMuted, fontSize: 16),
      contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
    );

class SumRow extends StatelessWidget {
  final String label, value; final bool bold; final Color? vc;
  const SumRow(this.label, this.value, {super.key, this.bold = false, this.vc});
  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(children: [
      Text(label, style: TextStyle(fontSize: 16, color: bold ? context.cText : context.cSub)),
      const Spacer(),
      Text(value, style: TextStyle(fontSize: 16,
        fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
        color: vc ?? (bold ? context.cText : context.cSub))),
    ]));
}

class InfoBanner extends StatelessWidget {
  final String msg; final Color bg, fg; final IconData icon; final Widget? action;
  const InfoBanner(this.msg, {super.key,
    this.bg = AppColors.amber50, this.fg = AppColors.amber800,
    this.icon = Icons.warning_amber_rounded, this.action});
  @override Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(11),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10),
        border: Border.all(color: fg.withValues(alpha: 0.3))),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(icon, size: 15, color: fg), const SizedBox(width: 7),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(msg, style: TextStyle(fontSize: 16, color: fg, height: 1.4)),
        if (action != null) ...[const SizedBox(height: 7), action!],
      ])),
    ]));
}

// ─── Shimmer skeleton (sesuai admin-web .skeleton) ────────────
class Shimmer extends StatefulWidget {
  final double width, height; final double radius;
  const Shimmer({super.key, required this.width, required this.height, this.radius = 8});
  @override State<Shimmer> createState() => _ShimmerState();
}
class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late AnimationController _c; late Animation<double> _a;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..repeat();
    _a = CurvedAnimation(parent: _c, curve: Curves.easeInOut);
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    builder: (_, __) => Container(
      width: widget.width, height: widget.height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(widget.radius),
        gradient: LinearGradient(
          begin: Alignment.centerLeft, end: Alignment.centerRight,
          colors: const [Color(0xFFE0E7FF), Color(0xFFC7D2FE), Color(0xFFE0E7FF)],
          stops: [_a.value - 0.3, _a.value, _a.value + 0.3],
        ),
      ),
    ));
}

// ─── Pulse dot (admin-web .pulse-dot) ─────────────────────────
class PulseDot extends StatefulWidget {
  final Color color;
  const PulseDot({super.key, this.color = AppColors.green500});
  @override State<PulseDot> createState() => _PulseDotState();
}
class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late AnimationController _c; late Animation<double> _a;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
    _a = CurvedAnimation(parent: _c, curve: Curves.easeInOut);
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    builder: (_, __) => Container(
      width: 8, height: 8,
      decoration: BoxDecoration(
        color: widget.color,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: widget.color.withValues(alpha: _a.value * 0.5),
            blurRadius: 6 * _a.value, spreadRadius: 2 * _a.value)],
      )));
}

// Kolom DECIMAL/NUMERIC Postgres dikirim Supabase sebagai String (bukan num JSON)
// agar presisi tidak hilang — jadi harus di-parse, tidak boleh di-`as num` langsung.
num asNum(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v;
  return num.tryParse(v.toString()) ?? 0;
}

// ═══════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════
class AppFormatter {
  static final _rp = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp', decimalDigits: 0);
  static String rupiah(dynamic v) {
    if (v == null) return '-';
    try { return _rp.format(v); } catch (_) { return 'Rp -'; }
  }
  static String tanggal(String? d) {
    if (d == null || d.isEmpty) return '-';
    try { return DateFormat('dd MMM yyyy', 'id_ID').format(DateTime.parse(d)); }
    catch (_) { try { final dt = DateTime.parse(d); const m = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des']; return '${dt.day.toString().padLeft(2,'0')} ${m[dt.month]} ${dt.year}'; } catch (_) { return d; } }
  }
  static String tanggalPanjang(DateTime d) {
    try { return DateFormat('EEEE, dd MMMM yyyy', 'id_ID').format(d); }
    catch (_) { const b = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']; const h = ['','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu']; return '${h[d.weekday]}, ${d.day.toString().padLeft(2,'0')} ${b[d.month]} ${d.year}'; }
  }
  static String tanggalWaktu(String? dt) {
    if (dt == null || dt.isEmpty) return '-';
    try { return DateFormat('dd MMM HH:mm', 'id_ID').format(DateTime.parse(dt).toLocal()); }
    catch (_) { try { final d = DateTime.parse(dt).toLocal(); return '${d.day.toString().padLeft(2,'0')}/${d.month.toString().padLeft(2,'0')} ${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}'; } catch (_) { return dt; } }
  }
  static String waktu(String? t) { if (t == null || t.isEmpty) return '—'; return t.length >= 5 ? t.substring(0,5) : t; }
  static String durasi(dynamic j) { if (j == null) return '—'; final d = asNum(j).toDouble(); final h = d.floor(); final m = ((d-h)*60).round(); return m == 0 ? '${h}j' : '${h}j ${m}m'; }
  static String statusLabel(String s) => switch (s.toLowerCase()) {
    'hadir'        => 'Hadir',
    'alfa'||'tidak_hadir'||'sakit'||'izin' => 'Tidak Hadir',
    'pending'      => 'Pending',
    'disetujui'    => 'Disetujui',
    'ditolak'      => 'Ditolak',
    'draft'        => 'Draft',
    'dibayar'      => 'Dibayar',
    'aktif'        => 'Aktif',
    'lunas'        => 'Lunas',
    'qr_code'      => 'QR Scan',
    'manual'       => 'Manual',
    'otomatis'     => 'Otomatis',
    'potong_gaji'  => 'Potong Gaji',
    'transfer'     => 'Transfer',
    'tunai'        => 'Tunai',
    _              => s,
  };
  static String today() => DateTime.now().toIso8601String().split('T')[0];
  static String addDays(String t, int n) => DateTime.parse(t).add(Duration(days: n)).toIso8601String().split('T')[0];
  static String monthStart() { final n = DateTime.now(); return '${n.year}-${n.month.toString().padLeft(2,'0')}-01'; }
}

// ═══════════════════════════════════════════════════════════
// SNACKBARS — soft style
// ═══════════════════════════════════════════════════════════
void showSuccess(BuildContext ctx, String msg) {
  ScaffoldMessenger.of(ctx).clearSnackBars();
  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
    content: Row(children: [
      const Icon(Icons.check_circle_rounded, color: Colors.white, size: 16),
      const SizedBox(width: 8),
      Expanded(child: Text(msg, style: const TextStyle(fontSize: 16, height: 1.3))),
    ]),
    backgroundColor: AppColors.green600,
    behavior: SnackBarBehavior.floating, duration: const Duration(seconds: 3),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    margin: const EdgeInsets.fromLTRB(14, 0, 14, 20),
    elevation: 4,
  ));
}

void showError(BuildContext ctx, String msg) {
  ScaffoldMessenger.of(ctx).clearSnackBars();
  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
    content: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Icon(Icons.error_outline_rounded, color: Colors.white, size: 16),
      const SizedBox(width: 8),
      Expanded(child: Text(msg, style: const TextStyle(fontSize: 16, height: 1.3))),
    ]),
    backgroundColor: AppColors.red600,
    behavior: SnackBarBehavior.floating, duration: const Duration(seconds: 4),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    margin: const EdgeInsets.fromLTRB(14, 0, 14, 20),
    elevation: 4,
  ));
}

void showInfo(BuildContext ctx, String msg) {
  ScaffoldMessenger.of(ctx).clearSnackBars();
  ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
    content: Row(children: [
      const Icon(Icons.info_outline_rounded, color: Colors.white, size: 16),
      const SizedBox(width: 8),
      Expanded(child: Text(msg, style: const TextStyle(fontSize: 16))),
    ]),
    backgroundColor: AppColors.brand600,
    behavior: SnackBarBehavior.floating, duration: const Duration(seconds: 3),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    margin: const EdgeInsets.fromLTRB(14, 0, 14, 20),
    elevation: 4,
  ));
}

Future<bool?> showConfirm(BuildContext ctx, {
  required String title, required String msg,
  String ok = 'Ya', String cancel = 'Batal', bool danger = false,
}) => showDialog<bool>(context: ctx, builder: (c) => ScaleTransition(
  scale: Tween(begin: 0.88, end: 1.0).animate(
      CurvedAnimation(parent: ModalRoute.of(c)!.animation!, curve: _kCurve)),
  child: AlertDialog(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    title: Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
    content: Text(msg, style: TextStyle(fontSize: 16, color: c.cSub, height: 1.5)),
    actions: [
      TextButton(onPressed: () => Navigator.pop(c, false), child: Text(cancel)),
      ElevatedButton(
        onPressed: () => Navigator.pop(c, true),
        style: danger
            ? ElevatedButton.styleFrom(backgroundColor: AppColors.red600, foregroundColor: Colors.white)
            : null,
        child: Text(ok),
      ),
    ],
  )));


// ─── Route helpers ───────────────────────────────────────────
/// Slide-up + fade route — untuk modal/detail screens
Route<T> appRoute<T>(Widget page) => PageRouteBuilder<T>(
  pageBuilder: (_, __, ___) => page,
  transitionsBuilder: (_, a, __, child) {
    final slide = Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero)
        .animate(CurvedAnimation(parent: a, curve: _kCurve));
    final fade = CurvedAnimation(parent: a, curve: _kEase);
    return FadeTransition(opacity: fade, child: SlideTransition(position: slide, child: child));
  },
  transitionDuration: _kNormal,
  reverseTransitionDuration: _kFast,
);

// ── CacheBadge — shown when displaying cached/offline data ────
class CacheBadge extends StatelessWidget {
  final String age;
  const CacheBadge({super.key, required this.age});

  @override Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
    color: context.isDark ? const Color(0xFF1C1A00) : const Color(0xFFFFFBEB),
    child: Row(children: [
      Icon(Icons.cloud_off_rounded, size: 13,
        color: context.isDark ? const Color(0xFFD97706) : const Color(0xFFB45309)),
      const SizedBox(width: 6),
      Expanded(child: Text(
        'Data cache · diperbarui $age',
        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600,
          color: context.isDark ? const Color(0xFFD97706) : const Color(0xFFB45309)),
      )),
    ]),
  );
}

// ── ShimmerList — pengganti loading list ─────────────────────
class ShimmerList extends StatelessWidget {
  final int count;
  const ShimmerList({super.key, this.count = 4});
  @override Widget build(BuildContext context) => ListView.separated(
    padding: const EdgeInsets.all(12), itemCount: count, physics: const NeverScrollableScrollPhysics(), shrinkWrap: true,
    separatorBuilder: (_, __) => const SizedBox(height: 8),
    itemBuilder: (_, __) => Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: context.cCard, borderRadius: BorderRadius.circular(14), border: Border.all(color: context.cBorder)),
      child: const Row(children: [
        Shimmer(width: 44, height: 44, radius: 11),
        SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Shimmer(width: double.infinity, height: 13, radius: 6),
          SizedBox(height: 7),
          Shimmer(width: 140, height: 11, radius: 6),
        ])),
        SizedBox(width: 10),
        Shimmer(width: 60, height: 22, radius: 10),
      ]),
    ),
  );
}

// ── ShimmerGrid — pengganti loading grid ─────────────────────
class ShimmerGrid extends StatelessWidget {
  final int count;
  final int crossCount;
  const ShimmerGrid({super.key, this.count = 4, this.crossCount = 2});
  @override Widget build(BuildContext context) => GridView.builder(
    padding: const EdgeInsets.all(12),
    physics: const NeverScrollableScrollPhysics(), shrinkWrap: true,
    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: crossCount, crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.8),
    itemCount: count,
    itemBuilder: (_, __) => Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: context.cCard, borderRadius: BorderRadius.circular(14), border: Border.all(color: context.cBorder)),
      child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Shimmer(width: 38, height: 38, radius: 10),
          SizedBox(width: 10),
          Expanded(child: Shimmer(width: double.infinity, height: 12, radius: 6)),
        ]),
        SizedBox(height: 8),
        Shimmer(width: 80, height: 18, radius: 6),
        SizedBox(height: 5),
        Shimmer(width: 100, height: 10, radius: 6),
      ]),
    ),
  );
}

// ═══════════════════════════════════════════════════════════
// ANIMATED ALERT BANNER — slide-down with spring, per-screen
// ═══════════════════════════════════════════════════════════

enum AlertVariant { info, warning, danger, success }

class AnimatedAlert extends StatefulWidget {
  final String message;
  final String? title;
  final AlertVariant variant;
  final IconData? icon;
  final bool pulsing;
  final VoidCallback? onDismiss;
  final Widget? trailing;
  final Duration delay;
  const AnimatedAlert({
    super.key,
    required this.message,
    this.title,
    this.variant = AlertVariant.warning,
    this.icon,
    this.pulsing = false,
    this.onDismiss,
    this.trailing,
    this.delay = Duration.zero,
  });
  @override State<AnimatedAlert> createState() => _AnimatedAlertState();
}

class _AnimatedAlertState extends State<AnimatedAlert> with SingleTickerProviderStateMixin {
  late AnimationController _c;

  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 440));
    Future.delayed(widget.delay, () { if (mounted) _c.forward(); });
  }

  @override void dispose() { _c.dispose(); super.dispose(); }

  ({Color bg, Color accent, Color iconBg, Color textColor, IconData defIcon}) get _style {
    switch (widget.variant) {
      case AlertVariant.warning:
        return (bg: AppColors.amber50, accent: AppColors.amber600,
          iconBg: const Color(0xFFFDE68A), textColor: AppColors.amber800,
          defIcon: Icons.warning_amber_rounded);
      case AlertVariant.danger:
        return (bg: AppColors.red50, accent: AppColors.red500,
          iconBg: AppColors.red100, textColor: AppColors.red800,
          defIcon: Icons.error_outline_rounded);
      case AlertVariant.success:
        return (bg: AppColors.green50, accent: AppColors.green600,
          iconBg: AppColors.green100, textColor: AppColors.green800,
          defIcon: Icons.check_circle_outline_rounded);
      case AlertVariant.info:
        return (bg: AppColors.brand50, accent: AppColors.brand600,
          iconBg: AppColors.brand100, textColor: AppColors.brand700,
          defIcon: Icons.info_outline_rounded);
    }
  }

  @override Widget build(BuildContext context) {
    final s = _style;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) => SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, -0.9), end: Offset.zero)
            .animate(CurvedAnimation(parent: _c, curve: const Cubic(0.34, 1.56, 0.64, 1))),
        child: FadeTransition(
          opacity: CurvedAnimation(parent: _c, curve: Curves.easeOut),
          child: child!),
      ),
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        padding: const EdgeInsets.fromLTRB(11, 9, 8, 9),
        decoration: BoxDecoration(
          color: s.bg,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: s.accent.withValues(alpha: 0.4), width: 1.5),
          boxShadow: [BoxShadow(color: s.accent.withValues(alpha: 0.1), blurRadius: 12, offset: const Offset(0, 2))],
        ),
        child: Row(children: [
          widget.pulsing
              ? Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    _AlertPulsingDot(color: s.accent),
                    const SizedBox(width: 8),
                    Container(width: 30, height: 30,
                      decoration: BoxDecoration(color: s.iconBg, borderRadius: BorderRadius.circular(8)),
                      child: Icon(widget.icon ?? s.defIcon, size: 15, color: s.accent)),
                  ]))
              : Container(
                  width: 32, height: 32, margin: const EdgeInsets.only(right: 10),
                  decoration: BoxDecoration(color: s.iconBg, borderRadius: BorderRadius.circular(9)),
                  child: Icon(widget.icon ?? s.defIcon, size: 16, color: s.accent)),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (widget.title != null) ...[
              Text(widget.title!, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: s.textColor)),
              const SizedBox(height: 1),
            ],
            Text(widget.message,
              style: TextStyle(fontSize: 15, color: s.textColor, height: 1.35),
              maxLines: 2, overflow: TextOverflow.ellipsis),
          ])),
          if (widget.trailing != null) ...[const SizedBox(width: 4), widget.trailing!],
          if (widget.onDismiss != null)
            GestureDetector(
              onTap: widget.onDismiss,
              child: Padding(padding: const EdgeInsets.all(5),
                child: Icon(Icons.close_rounded, size: 14, color: s.textColor.withValues(alpha: 0.45)))),
        ]),
      ),
    );
  }
}

// Internal pulsing dot for AnimatedAlert
class _AlertPulsingDot extends StatefulWidget {
  final Color color;
  const _AlertPulsingDot({required this.color});
  @override State<_AlertPulsingDot> createState() => _AlertPulsingDotState();
}
class _AlertPulsingDotState extends State<_AlertPulsingDot> with SingleTickerProviderStateMixin {
  late AnimationController _c;
  @override void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
  }
  @override void dispose() { _c.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (_, __) {
      final v = CurvedAnimation(parent: _c, curve: Curves.easeInOut).value;
      return SizedBox(width: 16, height: 16, child: Stack(alignment: Alignment.center, children: [
        Transform.scale(scale: 1.0 + v * 1.1,
          child: Opacity(opacity: (1 - v) * 0.32,
            child: Container(width: 10, height: 10,
              decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle)))),
        Container(width: 7, height: 7,
          decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle)),
      ]));
    });
}
