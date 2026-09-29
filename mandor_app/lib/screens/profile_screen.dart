import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/theme_service.dart';
import '../services/biometric_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/app_overlay.dart';
import '../l10n/app_strings.dart';
import '../main.dart' show localeService;
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  final UserModel user;
  const ProfileScreen({super.key, required this.user});
  @override State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _entryCtrl;
  final _themeService = ThemeService();
  final _bio = BiometricService();
  bool _isEnglish = localeService.isEnglish;
  bool _bioAvailable = false, _bioEnabled = false;

  @override void initState() {
    super.initState();
    _entryCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 520));
    _entryCtrl.forward();
    _themeService.addListener(_rebuild);
    localeService.addListener(_onLocale);
    _checkBiometric();
  }

  Future<void> _checkBiometric() async {
    final avail   = await _bio.isAvailable();
    final enabled = await _bio.isEnabled();
    if (mounted) setState(() { _bioAvailable = avail; _bioEnabled = enabled; });
  }

  Future<void> _toggleBiometric() async {
    if (!_bioAvailable) return;
    final next = !_bioEnabled;
    await _bio.setEnabled(next, email: next ? widget.user.email : null);
    if (mounted) setState(() => _bioEnabled = next);
  }

  @override void dispose() {
    _entryCtrl.dispose();
    _themeService.removeListener(_rebuild);
    localeService.removeListener(_onLocale);
    super.dispose();
  }

  void _onLocale() => setState(() => _isEnglish = localeService.isEnglish);

  void _rebuild() => setState(() {});

  // ── Helpers ───────────────────────────────────────────────
  bool get _isDark => _themeService.isDark;

  Color get _bg   => _isDark ? const Color(0xFF0D1421) : const Color(0xFFF4F7FF);
  Color get _card => _isDark ? const Color(0xFF182033) : Colors.white;
  Color get _border => _isDark ? const Color(0xFF2A3650) : const Color(0xFFE0E7FF);
  Color get _text => _isDark ? const Color(0xFFDDE6F5) : AppColors.textMain;
  Color get _sub  => _isDark ? const Color(0xFF8A9AB8) : AppColors.textSub;

  String get _initial =>
      widget.user.namaLengkap.isNotEmpty ? widget.user.namaLengkap[0].toUpperCase() : 'U';

  Future<void> _logout() async {
    final ok = await showLogoutConfirm(context, namaUser: widget.user.namaLengkap);
    if (!ok || !mounted) return;
    await showLogoutOverlay(context, namaUser: widget.user.namaLengkap);
    await AuthService().logout();
    if (mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        PageRouteBuilder(
          pageBuilder: (_, a, __) => const LoginScreen(),
          transitionsBuilder: (_, a, __, child) => FadeTransition(
              opacity: CurvedAnimation(parent: a, curve: Curves.easeOut),
              child: child),
          transitionDuration: const Duration(milliseconds: 400),
        ),
        (_) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
        children: [
          // ── Avatar header ──────────────────────────────────
          SlideUp(child: _buildAvatarCard()),
          const SizedBox(height: 16),

          // ── Info karyawan ──────────────────────────────────
          SlideUp(delay: const Duration(milliseconds: 60), child: _buildInfoCard(context)),
          const SizedBox(height: 16),

          // ── Proyek ────────────────────────────────────────
          if (widget.user.project != null) ...[
            SlideUp(delay: const Duration(milliseconds: 100), child: _buildProjectCard(context)),
            const SizedBox(height: 16),
          ],

          // ── Pengaturan ────────────────────────────────────
          SlideUp(delay: const Duration(milliseconds: 140), child: _buildSettingsCard(context)),
          const SizedBox(height: 16),

          // ── Tombol Logout ─────────────────────────────────
          SlideUp(delay: const Duration(milliseconds: 180), child: _buildLogoutButton(context)),
          const SizedBox(height: 24),

          // ── Versi app ─────────────────────────────────────
          Center(child: Text('Mandor App v1.0.0 · PT Krakatau Indah',
              style: TextStyle(fontSize: 15, color: _sub))),
        ],
      ),
    );
  }

  // ── Avatar card ───────────────────────────────────────────
  Widget _buildAvatarCard() => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [Color(0xFF1E3A8A), Color(0xFF1D4ED8), Color(0xFF2563EB)]),
      borderRadius: BorderRadius.circular(20),
      boxShadow: [BoxShadow(
        color: const Color(0xFF2563EB).withValues(alpha: 0.35),
        blurRadius: 24, offset: const Offset(0, 8))],
    ),
    child: Row(children: [
      // Avatar circle
      TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.5, end: 1.0),
        duration: const Duration(milliseconds: 500),
        curve: const Cubic(0.34, 1.56, 0.64, 1),
        builder: (_, v, child) => Transform.scale(scale: v, child: child),
        child: Container(
          width: 68, height: 68,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFF60A5FA), Color(0xFF3B82F6)],
              begin: Alignment.topLeft, end: Alignment.bottomRight),
            border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 2.5),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 12)]),
          child: Center(child: Text(_initial,
            style: const TextStyle(color: Colors.white, fontSize: 26,
                fontWeight: FontWeight.w900))),
        ),
      ),
      const SizedBox(width: 16),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(widget.user.namaLengkap,
            style: const TextStyle(color: Colors.white, fontSize: 19,
                fontWeight: FontWeight.w800),
            maxLines: 2, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 5),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.25))),
          child: Text(widget.user.displayRole,
              style: const TextStyle(color: Colors.white, fontSize: 15,
                  fontWeight: FontWeight.w600)),
        ),
        if (widget.user.idKaryawan != '-') ...[
          const SizedBox(height: 6),
          Row(children: [
            Icon(Icons.badge_outlined, size: 13, color: Colors.white.withValues(alpha: 0.7)),
            const SizedBox(width: 4),
            Text('NIK: ${widget.user.idKaryawan}',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 15, fontWeight: FontWeight.w500)),
          ]),
        ],
      ])),
    ]),
  );

  // ── Info karyawan ─────────────────────────────────────────
  Widget _buildInfoCard(BuildContext context) => _Card(
    isDark: _isDark, card: _card, border: _border,
    child: Column(children: [
      _CardHeader(icon: Icons.person_outline_rounded, label: context.s.accountInfo, isDark: _isDark),
      const SizedBox(height: 4),
      _InfoRow(
        label: context.s.fullNameLabel,
        value: widget.user.namaLengkap,
        icon: Icons.person_rounded,
        isDark: _isDark,
      ),
      _divider(_border),
      _InfoRow(
        label: context.s.nikLabel,
        value: widget.user.idKaryawan,
        icon: Icons.badge_rounded,
        isDark: _isDark,
      ),
      _divider(_border),
      _InfoRow(
        label: 'Email',
        value: widget.user.email,
        icon: Icons.email_outlined,
        isDark: _isDark,
      ),
      _divider(_border),
      _InfoRow(
        label: context.s.roleLabel,
        value: widget.user.displayRole,
        icon: Icons.shield_outlined,
        isDark: _isDark,
        valueColor: AppColors.brand600,
      ),
      if (widget.user.karyawan?['jabatan'] != null) ...[
        _divider(_border),
        _InfoRow(
          label: context.s.positionLabel,
          value: (widget.user.karyawan!['jabatan'] as Map?)?['nama_jabatan'] as String? ?? '-',
          icon: Icons.work_outline_rounded,
          isDark: _isDark,
        ),
      ],
    ]),
  );

  // ── Proyek ─────────────────────────────────────────────────
  Widget _buildProjectCard(BuildContext context) => _Card(
    isDark: _isDark, card: _card, border: _border,
    child: Column(children: [
      _CardHeader(icon: Icons.apartment_rounded, label: context.s.projectInfo, isDark: _isDark),
      const SizedBox(height: 4),
      _InfoRow(
        label: context.s.projectNameLabel,
        value: widget.user.project!['nama_project'] as String? ?? '-',
        icon: Icons.business_center_outlined,
        isDark: _isDark,
      ),
      _divider(_border),
      _InfoRow(
        label: context.s.projectCodeLabel,
        value: widget.user.project!['kode_project'] as String? ?? '-',
        icon: Icons.tag_rounded,
        isDark: _isDark,
      ),
      _divider(_border),
      _InfoRow(
        label: context.s.locationLabel,
        value: widget.user.project!['lokasi'] as String? ?? '-',
        icon: Icons.location_on_outlined,
        isDark: _isDark,
      ),
    ]),
  );

  // ── Pengaturan ─────────────────────────────────────────────
  Widget _buildSettingsCard(BuildContext context) => _Card(
    isDark: _isDark, card: _card, border: _border,
    child: Column(children: [
      _CardHeader(icon: Icons.settings_outlined, label: context.s.settingsTitle, isDark: _isDark),
      const SizedBox(height: 4),
      // Dark mode toggle
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: _isDark
                  ? const Color(0xFF1E3A5F)
                  : const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(10)),
            child: Icon(
              _isDark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
              size: 18,
              color: _isDark ? const Color(0xFF60A5FA) : AppColors.brand600),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.s.darkModeLabel, style: TextStyle(fontSize: 16,
                fontWeight: FontWeight.w600, color: _text)),
            Text(_isDark ? context.s.darkModeOn : context.s.darkModeOff,
                style: TextStyle(fontSize: 15, color: _sub)),
          ])),
          // Animated toggle switch
          GestureDetector(
            onTap: () => _themeService.toggle(),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutCubic,
              width: 48, height: 26,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(13),
                color: _isDark ? AppColors.brand600 : const Color(0xFFCBD5E1),
              ),
              child: AnimatedAlign(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
                alignment: _isDark ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  width: 20, height: 20, margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)]),
                ),
              ),
            ),
          ),
        ]),
      ),
      Divider(height: 1, color: _border),
      // Language toggle
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: _isDark ? const Color(0xFF1A3320) : const Color(0xFFECFDF5),
              borderRadius: BorderRadius.circular(10)),
            child: Icon(Icons.language_rounded, size: 18,
              color: _isDark ? const Color(0xFF4ADE80) : const Color(0xFF16A34A)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.s.languageLabel, style: TextStyle(fontSize: 16,
                fontWeight: FontWeight.w600, color: _text)),
            Text(_isEnglish ? 'English' : 'Indonesia',
                style: TextStyle(fontSize: 15, color: _sub)),
          ])),
          // ID / EN pill toggle
          GestureDetector(
            onTap: () => localeService.toggle(),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                color: _isDark ? const Color(0xFF1A3320) : const Color(0xFFECFDF5),
                border: Border.all(
                  color: _isDark ? const Color(0xFF166534) : const Color(0xFFBBF7D0)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                _LangPill(label: 'ID', active: !_isEnglish, isDark: _isDark),
                const SizedBox(width: 2),
                _LangPill(label: 'EN', active: _isEnglish, isDark: _isDark),
              ]),
            ),
          ),
        ]),
      ),
      if (_bioAvailable) ...[
        Divider(height: 1, color: _border),
        // Biometric toggle
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: _isDark ? const Color(0xFF1A1A35) : const Color(0xFFF0F0FF),
                borderRadius: BorderRadius.circular(10)),
              child: Icon(Icons.fingerprint_rounded, size: 18,
                color: _isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5)),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(context.s.biometricLabel, style: TextStyle(fontSize: 16,
                  fontWeight: FontWeight.w600, color: _text)),
              Text(_bioEnabled ? context.s.activeStatus : context.s.inactiveStatus,
                  style: TextStyle(fontSize: 15, color: _sub)),
            ])),
            GestureDetector(
              onTap: _toggleBiometric,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
                width: 48, height: 26,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(13),
                  color: _bioEnabled
                      ? const Color(0xFF4F46E5)
                      : const Color(0xFFCBD5E1),
                ),
                child: AnimatedAlign(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOutCubic,
                  alignment: _bioEnabled ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    width: 20, height: 20, margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle,
                      boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)]),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ],
    ]),
  );

  // ── Logout button ──────────────────────────────────────────
  Widget _buildLogoutButton(BuildContext context) => SizedBox(
    width: double.infinity,
    child: OutlinedButton.icon(
      onPressed: _logout,
      icon: const Icon(Icons.logout_rounded, size: 18, color: AppColors.red600),
      label: Text(context.s.logoutTitle,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.red600)),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.red600,
        side: const BorderSide(color: AppColors.red500, width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        padding: const EdgeInsets.symmetric(vertical: 14),
        backgroundColor: _isDark
            ? const Color(0xFF1F0A0A)
            : const Color(0xFFFEF2F2),
      ),
    ),
  );

  Widget _divider(Color c) => Divider(height: 1, color: c, thickness: 1);
}

// ── Shared sub-widgets ────────────────────────────────────────
class _Card extends StatelessWidget {
  final Widget child;
  final bool isDark;
  final Color card, border;
  const _Card({required this.child, required this.isDark, required this.card, required this.border});

  @override Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
    decoration: BoxDecoration(
      color: card,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: border),
    ),
    child: child,
  );
}

class _CardHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isDark;
  const _CardHeader({required this.icon, required this.label, required this.isDark});

  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Row(children: [
      Container(
        width: 30, height: 30,
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E3A5F) : AppColors.brand50,
          borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, size: 15, color: AppColors.brand600)),
      const SizedBox(width: 8),
      Text(label, style: TextStyle(
        fontSize: 16, fontWeight: FontWeight.w700,
        color: isDark ? const Color(0xFF94A3B8) : AppColors.textSub,
        letterSpacing: 0.3)),
    ]),
  );
}

class _LangPill extends StatelessWidget {
  final String label;
  final bool active, isDark;
  const _LangPill({required this.label, required this.active, required this.isDark});

  @override Widget build(BuildContext context) => AnimatedContainer(
    duration: const Duration(milliseconds: 200),
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(14),
      color: active
          ? (isDark ? const Color(0xFF166534) : const Color(0xFF16A34A))
          : Colors.transparent,
    ),
    child: Text(label, style: TextStyle(
      fontSize: 15, fontWeight: FontWeight.w700,
      color: active ? Colors.white : (isDark ? const Color(0xFF4ADE80) : const Color(0xFF16A34A)),
    )),
  );
}

class _InfoRow extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final bool isDark;
  final Color? valueColor;
  const _InfoRow({required this.label, required this.value,
    required this.icon, required this.isDark, this.valueColor});

  Color get _text  => isDark ? const Color(0xFFF1F5F9) : AppColors.textMain;
  Color get _sub   => isDark ? const Color(0xFF94A3B8) : AppColors.textSub;
  Color get _iconBg => isDark ? const Color(0xFF1E293B) : AppColors.surface;

  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 9),
    child: Row(children: [
      Container(
        width: 32, height: 32,
        decoration: BoxDecoration(color: _iconBg, borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, size: 15, color: AppColors.brand400)),
      const SizedBox(width: 10),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 14, color: _sub, fontWeight: FontWeight.w500)),
        const SizedBox(height: 1),
        Text(value,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600,
              color: valueColor ?? _text),
          maxLines: 2, overflow: TextOverflow.ellipsis),
      ])),
    ]),
  );
}
