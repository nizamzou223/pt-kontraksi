import 'dart:async';
import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/payroll_service.dart';
import '../widgets/app_widgets.dart';
import '../l10n/app_strings.dart';

class DashboardScreen extends StatefulWidget {
  final UserModel user;
  final Map<String, dynamic> project;
  final void Function(int tabIndex) onNavigate;
  const DashboardScreen({super.key, required this.user, required this.project, required this.onNavigate});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Timer? _refreshTimer;
  Timer? _clockTimer;
  DateTime _now = DateTime.now();

  final _svc = PayrollService();
  Map<String, dynamic>? _stats;
  bool _loading = true;
  bool _alfaAutoMarked = false; // cukup 1x per sesi/project

  @override
  void initState() {
    super.initState();
    _load();
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) _load();
    });
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void didUpdateWidget(DashboardScreen old) {
    super.didUpdateWidget(old);
    if (old.project['id'] != widget.project['id']) _load();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _clockTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final today = AppFormatter.today();
      final pid = widget.project['id'] as int;
      final monthStart = AppFormatter.monthStart();

      final results = await Future.wait([
        _svc.getPresensi(projectId: pid, tanggal: today),
        _svc.getLembur(projectId: pid, status: 'pending'),
        _svc.getKasbon(projectId: pid),
        _svc.getAllKaryawan(),
      ]);

      final presensi = results[0] as List;
      final lembur = results[1] as List;
      final kasbonAll = results[2] as List;
      final karyawan = results[3] as List;

      // Tandai otomatis 'alfa' untuk hari-hari lalu yang belum diinput —
      // berjalan begitu dashboard dibuka, lewat RPC yang sama dipakai admin-web
      // (satu sumber kebenaran, lihat MIGRATION_AUTO_ALFA.sql).
      if (!_alfaAutoMarked) {
        _alfaAutoMarked = true;
        await _svc.autoMarkAlfa();
      }

      final kasbonBulan = kasbonAll
          .where((k) =>
              (k['tanggal_kasbon'] as String? ?? '').compareTo(monthStart) >= 0)
          .toList();

      final presensiMonth = await _svc.getPresensi(
          projectId: pid, tanggalDari: monthStart, tanggalSampai: today);
      final hadirMonth =
          presensiMonth.where((p) => p['status_kehadiran'] == 'hadir').length;

      if (mounted) {
        setState(() {
          _stats = {
            'hadir':
                presensi.where((p) => p['status_kehadiran'] == 'hadir').length,
            'tidakHadir':
                presensi.where((p) => p['status_kehadiran'] != 'hadir').length,
            'totalPresensi': presensi.length,
            'totalKaryawan': karyawan.length,
            'lemburPending': lembur.length,
            'kasbonBulan': kasbonBulan.length,
            'totalKasbonRp': kasbonBulan.fold<double>(
                0, (s, k) => s + (k['jumlah_kasbon'] as num? ?? 0).toDouble()),
            'sisaKasbon': kasbonAll
                .where((k) => k['status_lunas'] == false)
                .fold<double>(0,
                    (s, k) => s + (k['sisa_kasbon'] as num? ?? 0).toDouble()),
            'attendanceRate': presensiMonth.isEmpty
                ? 0
                : (hadirMonth / presensiMonth.length * 100).round(),
          };
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _greeting(BuildContext context) {
    final h = _now.hour;
    if (h < 11) return context.s.greetMorning;
    if (h < 15) return context.s.greetAfternoon;
    if (h < 18) return context.s.greetEvening;
    return context.s.greetNight;
  }

  IconData get _greetingIcon {
    final h = _now.hour;
    if (h < 10) return Icons.wb_sunny_rounded;
    if (h < 14) return Icons.light_mode_rounded;
    if (h < 18) return Icons.wb_twilight_rounded;
    return Icons.nightlight_round;
  }

  String _p(int v) => v.toString().padLeft(2, '0');

  String get _timeStr =>
      '${_p(_now.hour)}:${_p(_now.minute)}:${_p(_now.second)}';

  String _dateStr(BuildContext context) {
    // monthShort is 0-indexed [Jan..Dec]; add a leading '' placeholder for 1-based month
    final months = ['', ...context.s.monthShort];
    // dayShort is 0-indexed [Sun..Sat]; DateTime.weekday is 1=Mon..7=Sun,
    // so remap: weekday 1→Mon(index 1), …, weekday 7→Sun(index 0)
    final days = context.s.dayShort; // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
    final dayIndex = _now.weekday % 7; // Mon=1→1, …, Sun=7→0
    return '${days[dayIndex]}, ${_p(_now.day)} ${months[_now.month]} ${_now.year}';
  }

  @override
  Widget build(BuildContext context) {
    final s = _stats;
    final proj = widget.project;
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: RefreshIndicator(
        color: AppColors.brand600,
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
                child: _HeroBanner(
              user: widget.user,
              proj: proj,
              timeStr: _timeStr,
              dateStr: _dateStr(context),
              greeting: _greeting(context),
              greetingIcon: _greetingIcon,
              attendanceRate: (s?['attendanceRate'] as int?) ?? 0,
              hasStats: s != null,
            )),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 90),
              sliver: SliverList(
                  delegate: SliverChildListDelegate([
                // ── Menu cepat ───────────────────────────────────
                _SectionHeader(
                    label: context.s.dashQuickMenu,
                    icon: Icons.apps_rounded,
                    color: AppColors.brand600),
                const SizedBox(height: 10),
                SlideUp(child: _QuickMenuGrid(onNavigate: widget.onNavigate)),
                const SizedBox(height: 22),

                // ── Presensi hari ini ────────────────────────────
                _SectionHeader(
                    label: context.s.dashAttendanceToday,
                    icon: Icons.today_rounded,
                    color: AppColors.brand600),
                const SizedBox(height: 10),

                if (_loading)
                  const _ShimmerGrid()
                else if (s != null) ...[
                  _ResponsiveStatGrid(tiles: [
                    (
                      const Duration(milliseconds: 60),
                      _StatTile(
                        label: 'Hadir Hari Ini',
                        value: '${s['hadir']}',
                        icon: Icons.how_to_reg_rounded,
                        color: const Color(0xFF059669),
                        bg: const Color(0xFFECFDF5),
                      )
                    ),
                    (
                      const Duration(milliseconds: 120),
                      _StatTile(
                        label: 'Tidak Hadir',
                        value: '${s['tidakHadir']}',
                        icon: Icons.person_off_rounded,
                        color: const Color(0xFFDC2626),
                        bg: const Color(0xFFFEF2F2),
                      )
                    ),
                    (
                      const Duration(milliseconds: 180),
                      _StatTile(
                        label: context.s.dashRecorded,
                        value: '${s['totalPresensi']}',
                        icon: Icons.assignment_turned_in_rounded,
                        color: AppColors.brand600,
                        bg: AppColors.brand50,
                      )
                    ),
                    (
                      const Duration(milliseconds: 240),
                      _StatTile(
                        label: context.s.dashTotalEmployees,
                        value: '${s['totalKaryawan']}',
                        icon: Icons.groups_2_rounded,
                        color: const Color(0xFF7C3AED),
                        bg: const Color(0xFFF5F3FF),
                      )
                    ),
                  ]),
                  const SizedBox(height: 22),

                  // ── Lembur & Kasbon ──────────────────────────
                  _SectionHeader(
                      label: context.s.dashOvertimeCashAdv,
                      icon: Icons.account_balance_wallet_rounded,
                      color: const Color(0xFF0891B2)),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(
                        child: SlideUp(
                            delay: const Duration(milliseconds: 300),
                            child: _StatTile(
                              label: context.s.dashPendingOvertime,
                              value: '${s['lemburPending']}',
                              icon: Icons.schedule_rounded,
                              color: const Color(0xFFD97706),
                              bg: const Color(0xFFFFFBEB),
                              sub: context.s.dashAwaitingApproval,
                              accent: (s['lemburPending'] as int) > 0,
                            ))),
                    const SizedBox(width: 10),
                    Expanded(
                        child: SlideUp(
                            delay: const Duration(milliseconds: 360),
                            child: _StatTile(
                              label: context.s.dashThisMonthCashAdv,
                              value: '${s['kasbonBulan']}',
                              icon: Icons.savings_rounded,
                              color: const Color(0xFF0891B2),
                              bg: const Color(0xFFECFEFF),
                              sub: AppFormatter.rupiah(s['totalKasbonRp']),
                            ))),
                  ]),
                  if ((s['sisaKasbon'] as double) > 0) ...[
                    const SizedBox(height: 10),
                    SlideUp(
                        delay: const Duration(milliseconds: 420),
                        child: _OutstandingBanner(
                            amount: s['sisaKasbon'] as double)),
                  ],
                ],
              ])),
            ),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// HERO BANNER — dengan live clock
// ══════════════════════════════════════════════════════════════
class _HeroBanner extends StatelessWidget {
  final UserModel user;
  final Map<String, dynamic> proj;
  final String timeStr, dateStr, greeting;
  final IconData greetingIcon;
  final int attendanceRate;
  final bool hasStats;

  const _HeroBanner({
    required this.user,
    required this.proj,
    required this.timeStr,
    required this.dateStr,
    required this.greeting,
    required this.greetingIcon,
    required this.attendanceRate,
    required this.hasStats,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0F172A), Color(0xFF1E3A8A), Color(0xFF2563EB)],
          stops: [0.0, 0.45, 1.0],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 22),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // ── Greeting + live clock ─────────────────────────
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Row(children: [
                      Icon(greetingIcon,
                          size: 13,
                          color: Colors.white.withValues(alpha: 0.75)),
                      const SizedBox(width: 5),
                      Text(greeting,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.75),
                              fontSize: 15,
                              fontWeight: FontWeight.w500)),
                    ]),
                    const SizedBox(height: 4),
                    Text(user.namaLengkap,
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w800),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 1),
                    Text(user.displayRole,
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.6),
                            fontSize: 15)),
                  ])),
              const SizedBox(width: 14),
              // Live clock card
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.2)),
                ),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Text(timeStr,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 21,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 2.0,
                            fontFamily: 'Courier',
                          )),
                      const SizedBox(height: 2),
                      Text(dateStr,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.65),
                              fontSize: 14,
                              fontWeight: FontWeight.w500)),
                    ]),
              ),
            ]),

            const SizedBox(height: 14),

            // ── Project label ─────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.construction_rounded,
                    size: 13, color: Colors.white),
                const SizedBox(width: 7),
                Flexible(
                    child: Text(
                        '${proj['kode_project'] ?? ''} · ${proj['nama_project'] ?? '-'}',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis)),
              ]),
            ),

            // ── Attendance bar ────────────────────────────────
            if (hasStats) ...[
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                    child: ClipRRect(
                  borderRadius: BorderRadius.circular(5),
                  child: LinearProgressIndicator(
                    value: attendanceRate / 100,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    valueColor: const AlwaysStoppedAnimation(Colors.white),
                    minHeight: 7,
                  ),
                )),
                const SizedBox(width: 10),
                Text('$attendanceRate${context.s.dashAttendanceRate}',
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.85),
                        fontSize: 15,
                        fontWeight: FontWeight.w600)),
              ]),
            ],
          ]),
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════════════════════
// RESPONSIVE STAT GRID — 2 kolom di HP, 1 baris (4 kolom) di tablet
// sama seperti breakpoint grid-cols-2 lg:grid-cols-4 di admin-web
// ══════════════════════════════════════════════════════════════
class _ResponsiveStatGrid extends StatelessWidget {
  final List<(Duration, Widget)> tiles;
  const _ResponsiveStatGrid({required this.tiles});

  static const _tabletBreakpoint = 600.0;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= _tabletBreakpoint;
          final crossAxisCount = wide ? tiles.length : 2;
          return Wrap(
            spacing: 10,
            runSpacing: 10,
            children: tiles.map((t) {
              final width = (constraints.maxWidth - (crossAxisCount - 1) * 10) /
                  crossAxisCount;
              return SizedBox(
                width: width,
                child: SlideUp(delay: t.$1, child: t.$2),
              );
            }).toList(),
          );
        },
      );
}

// ══════════════════════════════════════════════════════════════
// SECTION HEADER
// ══════════════════════════════════════════════════════════════
class _SectionHeader extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  const _SectionHeader(
      {required this.label, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 15, color: color),
        ),
        const SizedBox(width: 9),
        Text(label,
            style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: context.cText)),
      ]);
}

// ══════════════════════════════════════════════════════════════
// QUICK MENU — akses cepat besar & jelas ke fitur utama
// ══════════════════════════════════════════════════════════════
class _QuickMenuGrid extends StatelessWidget {
  final void Function(int tabIndex) onNavigate;
  const _QuickMenuGrid({required this.onNavigate});

  static const _cols = 3;
  static const _gap = 10.0;

  @override
  Widget build(BuildContext context) {
    final items = [
      (1, Icons.fingerprint_rounded, context.s.navPresensi, const Color(0xFF2563EB), const Color(0xFFEFF6FF)),
      (2, Icons.alarm_rounded, context.s.navLembur, const Color(0xFFD97706), const Color(0xFFFFFBEB)),
      (3, Icons.savings_rounded, context.s.navKasbon, const Color(0xFF0891B2), const Color(0xFFECFEFF)),
      (4, Icons.category_rounded, context.s.navMaterial, const Color(0xFF7C3AED), const Color(0xFFF5F3FF)),
      (5, Icons.people_rounded, context.s.navKaryawan, const Color(0xFF059669), const Color(0xFFECFDF5)),
    ];
    return LayoutBuilder(builder: (context, constraints) {
      final width = (constraints.maxWidth - _gap * (_cols - 1)) / _cols;
      return Wrap(
        spacing: _gap,
        runSpacing: _gap,
        children: items.map((it) => SizedBox(
          width: width,
          child: _QuickMenuButton(
            icon: it.$2, label: it.$3, color: it.$4, bg: it.$5,
            onTap: () => onNavigate(it.$1),
          ),
        )).toList(),
      );
    });
  }
}

class _QuickMenuButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color, bg;
  final VoidCallback onTap;
  const _QuickMenuButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.bg,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Material(
        color: context.cCard,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          splashColor: color.withValues(alpha: 0.12),
          highlightColor: color.withValues(alpha: 0.06),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: context.cBorder),
            ),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                    color: context.isDark
                        ? Color.lerp(const Color(0xFF182033), color, 0.18)!
                        : bg,
                    borderRadius: BorderRadius.circular(16)),
                child: Icon(icon,
                    size: 28,
                    color: context.isDark
                        ? Color.lerp(Colors.white, color, 0.75)!
                        : color),
              ),
              const SizedBox(height: 9),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(label,
                    style: TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: context.cText),
                    maxLines: 1,
                    textAlign: TextAlign.center),
              ),
            ]),
          ),
        ),
      );
}

// ══════════════════════════════════════════════════════════════
// STAT TILE — card vertikal dengan icon di atas
// ══════════════════════════════════════════════════════════════
class _StatTile extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final Color color, bg;
  final String? sub;
  final bool accent;

  const _StatTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    required this.bg,
    this.sub,
    this.accent = false,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.cCard,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: accent ? color.withValues(alpha: 0.4) : context.cBorder,
            width: accent ? 1.5 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: accent
                  ? color.withValues(alpha: 0.12)
                  : Colors.black.withValues(alpha: 0.04),
              blurRadius: accent ? 16 : 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
                color: context.isDark
                    ? Color.lerp(const Color(0xFF182033), color, 0.18)!
                    : bg,
                borderRadius: BorderRadius.circular(13)),
            child: Icon(icon,
                size: 22,
                color: context.isDark
                    ? Color.lerp(Colors.white, color, 0.75)!
                    : color),
          ),
          const SizedBox(height: 11),
          Text(value,
              style: TextStyle(
                fontSize: 29,
                fontWeight: FontWeight.w800,
                height: 1,
                color: accent ? color : context.cText,
              )),
          const SizedBox(height: 3),
          Text(label,
              style: TextStyle(
                  fontSize: 15.5,
                  color: context.cSub,
                  fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
          if (sub != null) ...[
            const SizedBox(height: 3),
            Text(sub!,
                style: TextStyle(
                    fontSize: 14.5, color: color, fontWeight: FontWeight.w600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        ]),
      );
}

// ══════════════════════════════════════════════════════════════
// OUTSTANDING KASBON BANNER
// ══════════════════════════════════════════════════════════════
class _OutstandingBanner extends StatelessWidget {
  final double amount;
  const _OutstandingBanner({required this.amount});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [Color(0xFFFFFBEB), Color(0xFFFEF3C7)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFFDE68A), width: 1.5),
        ),
        child: Row(children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: const Color(0xFFFEF9C3),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFDE68A)),
            ),
            child: const Icon(Icons.account_balance_outlined,
                size: 20, color: Color(0xFFB45309)),
          ),
          const SizedBox(width: 12),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(context.s.dashOutstandingAdv,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF92400E))),
                const SizedBox(height: 2),
                Text(AppFormatter.rupiah(amount),
                    style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFFD97706))),
              ])),
          Container(
            padding: const EdgeInsets.all(6),
            decoration: const BoxDecoration(
                color: Color(0xFFFEF3C7), shape: BoxShape.circle),
            child: const Icon(Icons.warning_amber_rounded,
                size: 15, color: Color(0xFFF59E0B)),
          ),
        ]),
      );
}

// ══════════════════════════════════════════════════════════════
// SHIMMER GRID
// ══════════════════════════════════════════════════════════════
class _ShimmerGrid extends StatelessWidget {
  const _ShimmerGrid();

  @override
  Widget build(BuildContext context) => Column(children: [
        Row(children: [
          _ShimmerTile(),
          const SizedBox(width: 10),
          _ShimmerTile()
        ]),
        const SizedBox(height: 10),
        Row(children: [
          _ShimmerTile(),
          const SizedBox(width: 10),
          _ShimmerTile()
        ]),
      ]);
}

class _ShimmerTile extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Expanded(
          child: Container(
        height: 116,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.cCard,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 10,
                offset: const Offset(0, 3))
          ],
        ),
        child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Shimmer(width: 40, height: 40, radius: 12),
          SizedBox(height: 11),
          Shimmer(width: 52, height: 24, radius: 6),
          SizedBox(height: 6),
          Shimmer(width: 80, height: 10, radius: 5),
        ]),
      ));
}
