import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/theme_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/app_overlay.dart';
import '../l10n/app_strings.dart';
import 'dashboard_screen.dart';
import 'presensi_screen.dart';
import 'lembur_screen.dart';
import 'kasbon_screen.dart';
import 'permintaan_screen.dart';
import 'karyawan_screen.dart';
import 'profile_screen.dart';
import 'login_screen.dart';
import '../widgets/offline_banner.dart';

class HomeScreen extends StatefulWidget {
  final UserModel user;
  const HomeScreen({super.key, required this.user});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  int _tab = 0;
  Map<String, dynamic>? _selectedProject;
  bool _loadingProjects = true;
  bool _loadingCatalog = false;
  final _themeService = ThemeService();
  late final AnimationController _tabFadeCtrl;

  // Auto-refresh: seed ditambah setiap kali pindah ke tab ini → key baru → rebuild + reload data
  final Map<int, int> _seeds = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0};

  @override
  void initState() {
    super.initState();
    _tabFadeCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 220), value: 1);
    _loadProjects();
    _themeService.addListener(_rebuild);
  }

  @override
  void dispose() {
    _tabFadeCtrl.dispose();
    _themeService.removeListener(_rebuild);
    super.dispose();
  }

  void _rebuild() => setState(() {});

  Future<void> _loadProjects() async {
    try {
      final projects = await AuthService()
          .getMandorProjects(widget.user.id, widget.user.karyawanId);
      if (!mounted) return;
      setState(() {
        // Langsung ke Dashboard tanpa memaksa pilih project dulu — default ke
        // project user (jika ada) atau project pertama, apa pun jumlahnya.
        if (projects.isNotEmpty) {
          final cocok = widget.user.project != null
              ? projects.where((p) => p['id'] == widget.user.project!['id'])
              : const Iterable<Map<String, dynamic>>.empty();
          _selectedProject = cocok.isNotEmpty ? cocok.first : projects.first;
        }
        _loadingProjects = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingProjects = false);
    }
  }

  // ── Tab switch dengan auto-refresh ─────────────────────────
  void _switchTab(int i) {
    if (i == _tab) {
      // Tap tab yang sama → paksa refresh
      setState(() => _seeds[i] = (_seeds[i]! + 1));
      return;
    }
    setState(() {
      _tab = i;
      _seeds[i] = (_seeds[i]! + 1); // key baru → screen rebuild + data reload
    });
    _tabFadeCtrl.forward(from: 0);
  }

  // Mandor bebas bekerja di proyek aktif MANA PUN, bukan cuma yang sudah ditugaskan
  // admin — jadi pemilih proyek SELALU menampilkan katalog lengkap, setiap kali dibuka
  // (bukan hanya saat belum punya proyek sama sekali).
  Future<void> _showProjectPicker() async {
    setState(() => _loadingCatalog = true);
    try {
      final catalog = await AuthService().activeProjectsCatalog();
      if (!mounted) return;
      if (catalog.isEmpty) {
        showInfo(context, 'Belum ada proyek aktif di sistem. Hubungi administrator.');
        return;
      }
      showModalBottomSheet(
        context: context,
        backgroundColor: Colors.transparent,
        isDismissible: _selectedProject != null,
        builder: (_) => _ProjectPickerSheet(
          projects: catalog,
          selected: _selectedProject,
          belumDitugaskan: _selectedProject == null,
          onSelect: _pilihProyek,
        ),
      );
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loadingCatalog = false);
    }
  }

  Future<void> _pilihProyek(Map<String, dynamic> p) async {
    Navigator.pop(context); // tutup lembar pilihan lebih dulu
    // Sudah proyek ini → tidak perlu apa-apa.
    if (_selectedProject != null && _selectedProject!['id'] == p['id']) return;

    setState(() => _loadingCatalog = true);
    try {
      // Simpan sebagai proyek resmi akun ini dulu (RLS presensi/lembur/kasbon mengikuti
      // users.project_id yang tersimpan) — berlaku untuk SEMUA mandor, sudah punya
      // proyek sebelumnya atau belum, supaya pindah proyek selalu bebas & langsung aktif.
      await AuthService().pilihProyekSendiri(p['id'] as int);
      if (!mounted) return;
      setState(() => _selectedProject = p); // `p` dari katalog sudah lengkap, tak perlu diambil ulang
      if (mounted) showSuccess(context, 'Proyek "${p['nama_project']}" jadi proyek Anda.');
    } catch (e) {
      if (!mounted) return;
      // Dialog (bukan snackbar sekilas) — kegagalan di sini bisa membuat mandor buntu
      // tanpa proyek, jadi pesannya tidak boleh terlewat.
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Text('Gagal menyimpan proyek'),
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Mengerti'))],
        ),
      );
    } finally {
      if (mounted) setState(() => _loadingCatalog = false);
    }
  }

  Future<void> _logout() async {
    final confirmed =
        await showLogoutConfirm(context, namaUser: widget.user.namaLengkap);
    if (!confirmed || !mounted) return;
    await showLogoutOverlay(context, namaUser: widget.user.namaLengkap);
    await AuthService().logout();
    if (mounted) {
      Navigator.of(context).pushReplacement(PageRouteBuilder(
        pageBuilder: (_, a, __) => const LoginScreen(),
        transitionsBuilder: (_, a, __, child) {
          final fade = CurvedAnimation(parent: a, curve: Curves.easeOut);
          final slide = Tween<Offset>(
                  begin: const Offset(0, 0.04), end: Offset.zero)
              .animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic));
          return FadeTransition(
              opacity: fade,
              child: SlideTransition(position: slide, child: child));
        },
        transitionDuration: const Duration(milliseconds: 500),
      ));
    }
  }

  List<Widget> _buildScreens() {
    if (_selectedProject == null) {
      return [
        ...List.generate(
            5, (_) => _EmptyProjectPrompt(onTap: _showProjectPicker, loading: _loadingCatalog)),
        KaryawanScreen(key: ValueKey('kary_${_seeds[5]}'), user: widget.user),
        ProfileScreen(key: ValueKey('prof_${_seeds[6]}'), user: widget.user, activeProject: _selectedProject),
      ];
    }
    final key = _selectedProject!['id'].toString();
    return [
      DashboardScreen(
          key: ValueKey('dash_${key}_${_seeds[0]}'),
          user: widget.user,
          project: _selectedProject!,
          onNavigate: _switchTab),
      PresensiScreen(
          key: ValueKey('pres_${key}_${_seeds[1]}'),
          user: widget.user,
          project: _selectedProject!),
      LemburScreen(
          key: ValueKey('lemb_${key}_${_seeds[2]}'),
          user: widget.user,
          project: _selectedProject!),
      KasbonScreen(
          key: ValueKey('kasb_${key}_${_seeds[3]}'),
          user: widget.user,
          project: _selectedProject!),
      PermintaanScreen(
          key: ValueKey('perm_${key}_${_seeds[4]}'),
          user: widget.user,
          project: _selectedProject!),
      KaryawanScreen(key: ValueKey('kary_${_seeds[5]}'), user: widget.user),
      ProfileScreen(key: ValueKey('prof_${_seeds[6]}'), user: widget.user, activeProject: _selectedProject),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: _buildAppBar(context),
      body: Column(children: [
        const OfflineBanner(),
        Expanded(
            child: ScaffoldMessenger(
          child: _loadingProjects
              ? const Center(
                  child: CircularProgressIndicator(color: AppColors.brand600))
              : FadeTransition(
                  opacity: CurvedAnimation(
                      parent: _tabFadeCtrl, curve: Curves.easeOut),
                  child: IndexedStack(index: _tab, children: _buildScreens()),
                ),
        )),
      ]),
      bottomNavigationBar: _MandorNavBar(
        currentIndex: _tab,
        onTap: _switchTab,
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(BuildContext context) {
    if (_tab == 6) return _buildProfileAppBar(context);
    return _buildMainAppBar(context);
  }

  PreferredSizeWidget _buildProfileAppBar(BuildContext context) => AppBar(
        elevation: 0,
        backgroundColor: Theme.of(context).appBarTheme.backgroundColor,
        surfaceTintColor: Colors.transparent,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: context.cBorder),
        ),
        title: Text(context.s.profileTitle,
            style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w700,
                color: context.cText)),
        actions: [
          GestureDetector(
            onTap: _logout,
            child: Container(
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: context.isDark
                    ? const Color(0xFF1F0A0A)
                    : const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.logout_rounded,
                  size: 17, color: Color(0xFFDC2626)),
            ),
          ),
        ],
      );

  PreferredSizeWidget _buildMainAppBar(BuildContext context) => AppBar(
        elevation: 0,
        backgroundColor: Theme.of(context).appBarTheme.backgroundColor,
        surfaceTintColor: Colors.transparent,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: context.cBorder),
        ),
        title: GestureDetector(
          onTap: _showProjectPicker,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            // Logo
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [Color(0xFF2563EB), Color(0xFF1D4ED8)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(11),
                boxShadow: [
                  BoxShadow(
                      color: AppColors.brand600.withValues(alpha: 0.3),
                      blurRadius: 10,
                      offset: const Offset(0, 3))
                ],
              ),
              child: const Icon(Icons.engineering_rounded,
                  color: Colors.white, size: 21),
            ),
            const SizedBox(width: 10),
            Flexible(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(widget.user.namaLengkap,
                      style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: context.cText),
                      overflow: TextOverflow.ellipsis),
                  Text(widget.user.displayRole,
                      style: TextStyle(fontSize: 14.5, color: context.cSub)),
                ])),
            const SizedBox(width: 8),
            // Project pill
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: _selectedProject != null
                    ? (context.isDark
                        ? const Color(0xFF1E3A5F)
                        : AppColors.brand50)
                    : (context.isDark
                        ? const Color(0xFF2A2200)
                        : const Color(0xFFFFFBEB)),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                    color: _selectedProject != null
                        ? (context.isDark
                            ? const Color(0xFF2D5A8E)
                            : AppColors.brand200)
                        : (context.isDark
                            ? const Color(0xFF4A4200)
                            : const Color(0xFFFDE68A))),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.apartment_rounded,
                    size: 13,
                    color: _selectedProject != null
                        ? AppColors.brand600
                        : AppColors.amber600),
                const SizedBox(width: 4),
                Text(
                  _selectedProject != null
                      ? _selectedProject!['kode_project'] as String? ?? 'Proyek'
                      : context.s.selectProject,
                  style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: _selectedProject != null
                          ? AppColors.brand700
                          : AppColors.amber600),
                ),
                const SizedBox(width: 2),
                Icon(Icons.keyboard_arrow_down_rounded,
                    size: 16,
                    color: _selectedProject != null
                        ? AppColors.brand400
                        : AppColors.amber600),
              ]),
            ),
          ]),
        ),
        actions: [
          // Logout button
          GestureDetector(
            onTap: _logout,
            child: Container(
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: context.isDark
                    ? const Color(0xFF1F0A0A)
                    : const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.logout_rounded,
                  size: 17, color: Color(0xFFDC2626)),
            ),
          ),
        ],
      );
}

// ─────────────────────────────────────────────────────────────
// ANIMATED BOTTOM NAV — matching admin-web style
// ─────────────────────────────────────────────────────────────
class _MandorNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  const _MandorNavBar({required this.currentIndex, required this.onTap});

  static const _icons = [
    (Icons.home_outlined, Icons.home_rounded),
    (Icons.fingerprint, Icons.fingerprint),
    (Icons.alarm_outlined, Icons.alarm_rounded),
    (Icons.savings_outlined, Icons.savings_rounded),
    (Icons.category_outlined, Icons.category_rounded),
    (Icons.people_outline_rounded, Icons.people_rounded),
    (Icons.person_outline_rounded, Icons.person_rounded),
  ];

  List<String> _labels(BuildContext context) => [
        context.s.navDashboard,
        context.s.navPresensi,
        context.s.navLembur,
        context.s.navKasbon,
        context.s.navMaterial,
        context.s.navKaryawan,
        context.s.navProfile,
      ];

  @override
  Widget build(BuildContext context) {
    final labels = _labels(context);
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(top: BorderSide(color: context.cBorder, width: 1)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 24,
              offset: const Offset(0, -4)),
          BoxShadow(
              color: AppColors.brand600.withValues(alpha: 0.04),
              blurRadius: 12,
              offset: const Offset(0, -2)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 72,
          child: Row(
            children: _icons.asMap().entries.map((e) {
              final (icon, active) = e.value;
              return Expanded(
                child: _NavItem(
                  icon: icon,
                  activeIcon: active,
                  label: labels[e.key],
                  selected: currentIndex == e.key,
                  onTap: () => onTap(e.key),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatefulWidget {
  final IconData icon, activeIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_NavItem> createState() => _NavItemState();
}

class _NavItemState extends State<_NavItem> {
  static const _brand = AppColors.brand600;
  bool _pressed = false;

  void _setPressed(bool v) => setState(() => _pressed = v);

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: widget.onTap,
        onTapDown: (_) => _setPressed(true),
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        behavior: HitTestBehavior.opaque,
        child: AnimatedScale(
          scale: _pressed ? 0.88 : 1.0,
          duration: const Duration(milliseconds: 120),
          curve: Curves.easeOut,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            // Icon dengan animated pill background
            AnimatedContainer(
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
              decoration: BoxDecoration(
                color: widget.selected
                    ? AppColors.brand50
                        .withValues(alpha: context.isDark ? 0.15 : 1.0)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Icon(
                  widget.selected ? widget.activeIcon : widget.icon,
                  key: ValueKey(widget.selected),
                  color: widget.selected ? _brand : context.cMuted,
                  size: 27,
                ),
              ),
            ),
            const SizedBox(height: 3),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 200),
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: widget.selected ? FontWeight.w700 : FontWeight.w500,
                  color: widget.selected ? _brand : context.cMuted,
                  letterSpacing: widget.selected ? 0.1 : 0,
                ),
                child: Text(widget.label, maxLines: 1),
              ),
            ),
          ]),
        ),
      );
}

// ─────────────────────────────────────────────────────────────
// EMPTY PROJECT PROMPT
// ─────────────────────────────────────────────────────────────
class _EmptyProjectPrompt extends StatelessWidget {
  final VoidCallback onTap;
  final bool loading;
  const _EmptyProjectPrompt({required this.onTap, this.loading = false});

  @override
  Widget build(BuildContext context) => Center(
        child: SlideUp(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.brand50,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.apartment_outlined,
                size: 36, color: AppColors.brand400),
          ),
          const SizedBox(height: 16),
          Text(context.s.selectProjectFirst,
              style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                  color: context.cText)),
          const SizedBox(height: 6),
          Text(context.s.tapProjectToSelect,
              style: TextStyle(fontSize: 16, color: context.cSub)),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: loading ? null : onTap,
            icon: loading
                ? const SizedBox(
                    width: 16, height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.arrow_drop_down_rounded, size: 20),
            label: Text(context.s.selectProject),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.brand600,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
          ),
        ])),
      );
}

// ─────────────────────────────────────────────────────────────
// PROJECT PICKER SHEET
// ─────────────────────────────────────────────────────────────
class _ProjectPickerSheet extends StatelessWidget {
  final List<Map<String, dynamic>> projects;
  final Map<String, dynamic>? selected;
  final bool belumDitugaskan;
  final void Function(Map<String, dynamic>) onSelect;
  const _ProjectPickerSheet(
      {required this.projects, this.selected, this.belumDitugaskan = false, required this.onSelect});

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          sheetHandle(context),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Row(children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                    color: AppColors.brand50,
                    borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.apartment_rounded,
                    color: AppColors.brand600, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(context.s.selectProject,
                      style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          color: context.cText)),
                  Text(
                      belumDitugaskan
                          ? 'Anda belum ditugaskan ke proyek mana pun — pilih salah satu untuk mulai bekerja'
                          : context.s.tapProjectToSwitch,
                      style: TextStyle(fontSize: 15, color: context.cSub)),
                ]),
              ),
            ]),
          ),
          Divider(height: 1, color: context.cBorder),
          ...projects.map((p) {
            final sel = selected?['id'] == p['id'];
            return ListTile(
              onTap: () => onSelect(p),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
              leading: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                    color: sel ? AppColors.brand600 : AppColors.brand50,
                    borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.apartment_rounded,
                    size: 20, color: sel ? Colors.white : AppColors.brand600),
              ),
              title: Text(p['nama_project'] ?? '-',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                      color: sel ? AppColors.brand700 : context.cText)),
              subtitle: Text(
                  '${p['kode_project'] ?? ''} · ${p['lokasi'] ?? '-'}',
                  style: TextStyle(fontSize: 15, color: context.cSub)),
              trailing: sel
                  ? Container(
                      padding: const EdgeInsets.all(2),
                      decoration: const BoxDecoration(
                          color: AppColors.brand600, shape: BoxShape.circle),
                      child: const Icon(Icons.check_rounded,
                          color: Colors.white, size: 14))
                  : null,
            );
          }),
          const SizedBox(height: 20),
        ]),
      );
}
