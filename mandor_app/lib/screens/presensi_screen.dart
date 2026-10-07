import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/auth_service.dart';
import '../services/payroll_service.dart';
import '../services/export_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/app_dropdown.dart';
import '../l10n/app_strings.dart';

// ─────────────────────────────────────────────────────────────
// PRESENSI SCREEN — Semua karyawan, scan QR, edit, export
// ─────────────────────────────────────────────────────────────
class PresensiScreen extends StatefulWidget {
  final UserModel user;
  final Map<String, dynamic> project;
  const PresensiScreen({super.key, required this.user, required this.project});

  @override
  State<PresensiScreen> createState() => _PresensiScreenState();
}

class _PresensiScreenState extends State<PresensiScreen>
    with SingleTickerProviderStateMixin {
  Timer? _refreshTimer;

  final _svc = PayrollService();
  late TabController _tabController;

  // Data
  List<Map<String, dynamic>> _presensiHarian =
      []; // presensi hari ini (semua karyawan)
  List<Map<String, dynamic>> _semuaKaryawan = []; // master karyawan aktif
  bool _loading = true;
  bool _alfaAutoMarked = false; // cukup 1x per sesi

  // Filter
  String _tanggal = _today();
  String _searchQ = '';
  String _filterStatus = 'all';

  static String _today() => DateTime.now().toIso8601String().split('T')[0];

  static String _addDays(String tgl, int n) {
    final d = DateTime.parse(tgl);
    return d.add(Duration(days: n)).toIso8601String().split('T')[0];
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _refreshTimer?.cancel();
    super.dispose();
  }

  // ── LOAD ──────────────────────────────────────────────────
  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final [presensi, karyawan] = await Future.wait([
        _svc.getPresensiHarian(_tanggal),
        _svc.getAllKaryawan(),
      ]);
      if (mounted) {
        setState(() {
          _presensiHarian = List<Map<String, dynamic>>.from(presensi as List);
          _semuaKaryawan = List<Map<String, dynamic>>.from(karyawan as List);
          _loading = false;
        });
      }

      // Tandai otomatis 'alfa' untuk hari-hari lalu yang belum diinput —
      // berjalan begitu layar Presensi dibuka, lewat RPC yang sama dipakai
      // admin-web (satu sumber kebenaran, lihat MIGRATION_AUTO_ALFA.sql).
      if (!_alfaAutoMarked) {
        _alfaAutoMarked = true;
        final jumlah = await _svc.autoMarkAlfa();
        if (jumlah > 0 && mounted) _load(silent: true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        showError(context, e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  // ── STATS ─────────────────────────────────────────────────
  int get _hadirCount =>
      _presensiHarian.where((p) => p['status_kehadiran'] == 'hadir').length;
  int get _sedangBekerjaCount => _presensiHarian
      .where((p) =>
          p['status_kehadiran'] == 'belum_lengkap' && p['jam_masuk'] != null)
      .length;
  int get _tidakHadirCount => _presensiHarian
      .where((p) =>
          p['status_kehadiran'] != 'hadir' &&
          !(p['status_kehadiran'] == 'belum_lengkap' && p['jam_masuk'] != null))
      .length;

  Set<int> get _tercatatIds =>
      _presensiHarian.map((p) => p['karyawan_id'] as int).toSet();
  List<Map<String, dynamic>> get _belumTercatat => _semuaKaryawan
      .where((k) => !_tercatatIds.contains(k['id'] as int))
      .toList();

  // ── FILTERED LIST ─────────────────────────────────────────
  List<Map<String, dynamic>> get _filtered {
    return _presensiHarian.where((p) {
      final nama =
          (p['karyawan'] as Map?)?['nama_karyawan']?.toString().toLowerCase() ??
              '';
      final matchSearch =
          _searchQ.isEmpty || nama.contains(_searchQ.toLowerCase());
      final status = p['status_kehadiran'] == 'hadir' ? 'hadir' : 'tidak_hadir';
      final matchStatus = _filterStatus == 'all' || _filterStatus == status;
      return matchSearch && matchStatus;
    }).toList();
  }

  // ── ABSEN CEPAT DARI LIST BELUM TERCATAT ─────────────────
  Future<void> _absenCepat(Map<String, dynamic> karyawan) async {
    final now = DateTime.now();
    final jamNow =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:00';
    try {
      // Atomic (lihat FIX_SCAN_PRESENSI_ATOMIC.sql) -- cek + tulis dalam satu
      // transaksi database, sama seperti scan QR, supaya tidak ada jeda yang
      // bisa bentrok dengan presensi lain untuk karyawan+tanggal yang sama.
      final hasil = await _svc.scanPresensiQr(
        projectId: widget.project['id'] as int,
        karyawanId: karyawan['id'] as int,
        tanggal: _tanggal,
        jam: jamNow,
        metodeInput: 'manual',
      );
      if (mounted) {
        final label = switch (hasil['hasil']) {
          'masuk' => 'Jam Masuk ✓',
          'keluar' => 'Jam Keluar ✓',
          _ => 'Presensi sudah lengkap',
        };
        showSuccess(context, '${karyawan['nama_karyawan']} — $label');
      }
      _load(silent: true);
    } catch (e) {
      if (mounted) {
        showError(context, e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  // ── EDIT PRESENSI ─────────────────────────────────────────
  void _openEdit(Map<String, dynamic> presensi) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditPresensiSheet(
        presensi: presensi,
        payrollService: _svc,
        onSaved: () => _load(silent: true),
      ),
    );
  }

  // ── INPUT MANUAL BARU ─────────────────────────────────────
  void _openInputManual() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _InputPresensiSheet(
        project: widget.project,
        tanggal: _tanggal,
        karyawanList: _semuaKaryawan,
        payrollService: _svc,
        onSaved: () => _load(silent: true),
      ),
    );
  }

  // ── HAPUS PRESENSI ────────────────────────────────────────
  Future<void> _hapusPresensi(Map<String, dynamic> presensi) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(context.s.deleteAttendance),
        content: Text(
            'Hapus presensi ${(presensi['karyawan'] as Map?)?['nama_karyawan'] ?? '-'}?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(context.s.cancel)),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626)),
            child: Text(context.s.delete),
          ),
        ],
      ),
    );
    if (confirm == true) {
      try {
        await _svc.deletePresensi(presensi['id'] as int);
        if (!mounted) return;
        showSuccess(context, context.s.attendanceDeleted);
        _load(silent: true);
      } catch (e) {
        if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  // ── EXPORT CSV ────────────────────────────────────────────
  // Filter per proyek untuk ekspor
  String? _exportFilterProject; // null = semua proyek

  Future<void> _exportExcel() async {
    try {
      final filtered = _exportFilterProject == null
          ? _presensiHarian
          : _presensiHarian
              .where((p) =>
                  (p['project'] as Map?)?['id']?.toString() ==
                  _exportFilterProject)
              .toList();
      await ExportService.exportPresensiExcel(
          data: filtered,
          tanggal: _tanggal,
          namaProject: _exportFilterProject == null
              ? 'Semua Proyek'
              : widget.project['nama_project'] as String?);
      if (mounted) {
        showSuccess(context, 'File Excel berhasil dibuat & dibuka ✓');
      }
    } catch (e) {
      if (mounted) showError(context, 'Gagal export: \$e');
    }
  }

  // Laporan mingguan harian (meniru rekap absensi proyek manual, per paket pekerjaan)
  Future<void> _openLaporanMingguan() async {
    final projectId = widget.project['id'] as int;
    final namaProject = widget.project['nama_project'] as String? ?? '-';
    DateTime mulai = DateTime.now().subtract(const Duration(days: 6));
    DateTime selesai = DateTime.now();
    final namaPekerjaanCtrl = TextEditingController();
    String fmt(DateTime d) => '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setD) {
        Future<void> pick(bool isMulai) async {
          final picked = await showDatePicker(
            context: ctx, initialDate: isMulai ? mulai : selesai,
            firstDate: DateTime(2020), lastDate: DateTime.now(),
          );
          if (picked != null) {
            setD(() { if (isMulai) { mulai = picked; } else { selesai = picked; } });
          }
        }
        Future<void> jalankan(bool excel) async {
          if (selesai.isBefore(mulai)) { showError(context, 'Tanggal selesai harus setelah tanggal mulai'); return; }
          Navigator.pop(ctx);
          try {
            final dari = fmt(mulai), sampai = fmt(selesai);
            final presensiRows = await _svc.getPresensi(projectId: projectId, tanggalDari: dari, tanggalSampai: sampai);
            final lemburRows = await _svc.getLembur(projectId: projectId, tanggalDari: dari, tanggalSampai: sampai);
            final kasbonRows = await _svc.getKasbon(projectId: projectId, tanggalDari: dari, tanggalSampai: sampai);
            if (excel) {
              await ExportService.exportLaporanMingguanExcel(
                presensiRows: presensiRows, lemburRows: lemburRows, kasbonRows: kasbonRows,
                namaProject: namaProject, namaPekerjaan: namaPekerjaanCtrl.text.trim(),
                tanggalMulai: fmt(mulai), tanggalSelesai: fmt(selesai));
            } else {
              await ExportService.exportLaporanMingguanPDF(
                presensiRows: presensiRows, lemburRows: lemburRows, kasbonRows: kasbonRows,
                namaProject: namaProject, namaPekerjaan: namaPekerjaanCtrl.text.trim(),
                tanggalMulai: fmt(mulai), tanggalSelesai: fmt(selesai));
            }
            if (mounted) showSuccess(context, excel ? 'File Excel berhasil dibuat & dibuka ✓' : 'File PDF berhasil dibuat & dibuka ✓');
          } catch (e) {
            if (mounted) showError(context, 'Gagal export: $e');
          }
        }
        return AlertDialog(
          title: const Text('Laporan Mingguan Harian'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Project: $namaProject', style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              TextField(controller: namaPekerjaanCtrl, decoration: const InputDecoration(
                labelText: 'Nama Pekerjaan (opsional)', hintText: 'Contoh: Plapon, ME, Hidrant')),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => pick(true), child: Text('Mulai: ${fmt(mulai)}'))),
                const SizedBox(width: 8),
                Expanded(child: OutlinedButton(onPressed: () => pick(false), child: Text('Selesai: ${fmt(selesai)}'))),
              ]),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
            OutlinedButton(onPressed: () => jalankan(true), child: const Text('Excel')),
            FilledButton(onPressed: () => jalankan(false), child: const Text('PDF')),
          ],
        );
      }),
    );
  }

  Future<void> _exportPDF() async {
    try {
      final filtered = _exportFilterProject == null
          ? _presensiHarian
          : _presensiHarian
              .where((p) =>
                  (p['project'] as Map?)?['id']?.toString() ==
                  _exportFilterProject)
              .toList();
      await ExportService.exportPresensiPDF(
          data: filtered,
          tanggal: _tanggal,
          namaProject: _exportFilterProject == null
              ? 'Semua Proyek'
              : widget.project['nama_project'] as String?);
      if (mounted) showSuccess(context, 'File PDF berhasil dibuat & dibuka ✓');
    } catch (e) {
      if (mounted) showError(context, 'Gagal export PDF: \$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final sudahLewat =
        DateTime.parse(_tanggal).isBefore(DateTime.parse(_today()));
    final isHariIni = _tanggal == _today();

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: _loading
          ? const ShimmerList()
          : Column(children: [
                  // ── Header Stats ─────────────────────────
                  Container(
                    color: context.cCard,
                    padding: const EdgeInsets.all(16),
                    child: Column(children: [
                      // Navigasi tanggal
                      Row(children: [
                        IconButton(
                          onPressed: () => setState(() {
                            _tanggal = _addDays(_tanggal, -1);
                            _load();
                          }),
                          icon: const Icon(Icons.chevron_left_rounded),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          color: AppColors.brand600,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: GestureDetector(
                            onTap: () async {
                              final d = await showDatePicker(
                                context: context,
                                initialDate: DateTime.parse(_tanggal),
                                firstDate: DateTime(2024),
                                lastDate: DateTime.now(),
                                builder: (ctx, child) => Theme(
                                    data: Theme.of(ctx).copyWith(
                                        colorScheme: const ColorScheme.light(
                                            primary: AppColors.brand600)),
                                    child: child!),
                              );
                              if (d != null) {
                                setState(() {
                                  _tanggal = d.toIso8601String().split('T')[0];
                                  _load();
                                });
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                  color: AppColors.brand50,
                                  borderRadius: BorderRadius.circular(10),
                                  border:
                                      Border.all(color: AppColors.brand200)),
                              child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(Icons.calendar_today_outlined,
                                        size: 14, color: AppColors.brand600),
                                    const SizedBox(width: 6),
                                    Text(
                                        AppFormatter.tanggalPanjang(
                                            DateTime.parse(_tanggal)),
                                        style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w600,
                                            color: AppColors.brand700)),
                                  ]),
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        IconButton(
                          onPressed: isHariIni
                              ? null
                              : () => setState(() {
                                    _tanggal = _addDays(_tanggal, 1);
                                    _load();
                                  }),
                          icon: const Icon(Icons.chevron_right_rounded),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          color:
                              isHariIni ? context.cMuted : AppColors.brand600,
                        ),
                        if (!isHariIni) ...[
                          const SizedBox(width: 4),
                          GestureDetector(
                            onTap: () => setState(() {
                              _tanggal = _today();
                              _load();
                            }),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 6),
                              decoration: BoxDecoration(
                                  color: AppColors.brand600,
                                  borderRadius: BorderRadius.circular(8)),
                              child: const Text('Hari Ini',
                                  style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white)),
                            ),
                          ),
                        ],
                      ]),
                      const SizedBox(height: 12),
                      // Stat row
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(children: [
                          _StatChip('Selesai', _hadirCount,
                              const Color(0xFF16A34A), const Color(0xFFDCFCE7)),
                          const SizedBox(width: 8),
                          _StatChip('Sedang Bekerja', _sedangBekerjaCount,
                              AppColors.brand600, AppColors.brand100),
                          const SizedBox(width: 8),
                          _StatChip('Tidak Hadir', _tidakHadirCount,
                              const Color(0xFFDC2626), const Color(0xFFFEE2E2)),
                          const SizedBox(width: 8),
                          _StatChip('Belum Input', _belumTercatat.length,
                              const Color(0xFFD97706), const Color(0xFFFEF9C3)),
                          const SizedBox(width: 8),
                          _StatChip('Total', _semuaKaryawan.length,
                              AppColors.brand600, AppColors.brand50),
                        ]),
                      ),
                    ]),
                  ),
                  // ── Alert banner ─────────────────────────
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 350),
                    transitionBuilder: (child, anim) => SizeTransition(
                        sizeFactor: CurvedAnimation(
                            parent: anim, curve: Curves.easeOutCubic),
                        child: FadeTransition(opacity: anim, child: child)),
                    child: (isHariIni && _belumTercatat.isNotEmpty)
                        ? AnimatedAlert(
                            key: const ValueKey('presensi-alert'),
                            title:
                                '${_belumTercatat.length} Karyawan Belum Tercatat',
                            message:
                                'Segera catat presensi karyawan yang belum input hari ini',
                            variant: AlertVariant.warning,
                            pulsing: true,
                            delay: const Duration(milliseconds: 250),
                          )
                        : const SizedBox.shrink(
                            key: ValueKey('presensi-alert-empty')),
                  ),
                  // ── Tabs ─────────────────────────────────
                  Container(
                    color: context.cCard,
                    child: TabBar(
                      controller: _tabController,
                      labelColor: AppColors.brand600,
                      unselectedLabelColor: context.cSub,
                      indicatorColor: AppColors.brand600,
                      indicatorWeight: 3,
                      labelStyle: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 16),
                      tabs: [
                        Tab(
                            text:
                                '${context.s.recordedTab} (${_presensiHarian.length})'),
                        Tab(
                            text:
                                '${context.s.notRecordedTab} (${_belumTercatat.length})'),
                        Tab(text: context.s.historyTab),
                      ],
                    ),
                  ),
              Expanded(
                child: TabBarView(controller: _tabController, children: [
                  // ── TAB 1: TERCATAT ───────────────────────
                  _buildTercatatTab(sudahLewat),
                  // ── TAB 2: BELUM INPUT ────────────────────
                  _buildBelumInputTab(sudahLewat),
                  // ── TAB 3: RIWAYAT PER KARYAWAN ──────────
                  _RiwayatTab(payrollService: _svc, karyawanList: _semuaKaryawan),
                ]),
              ),
            ]),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Export
          FloatingActionButton.small(
            heroTag: 'export_xlsx',
            onPressed: _exportExcel,
            backgroundColor: AppColors.brand800,
            foregroundColor: Colors.white,
            child: const Icon(Icons.table_view_rounded, size: 20),
          ),
          const SizedBox(height: 8),
          FloatingActionButton.small(
            heroTag: 'export_pdf',
            onPressed: _exportPDF,
            backgroundColor: const Color(0xFFDC2626),
            foregroundColor: Colors.white,
            child: const Icon(Icons.picture_as_pdf_rounded, size: 20),
          ),
          const SizedBox(height: 8),
          FloatingActionButton.small(
            heroTag: 'laporan_mingguan',
            onPressed: _openLaporanMingguan,
            backgroundColor: AppColors.brand600,
            foregroundColor: Colors.white,
            tooltip: 'Laporan Mingguan Harian',
            child: const Icon(Icons.calendar_view_week_rounded, size: 20),
          ),
          const SizedBox(height: 8),
          // Input Manual
          FloatingActionButton.small(
            heroTag: 'manual',
            onPressed: _openInputManual,
            backgroundColor: AppColors.brand700,
            foregroundColor: Colors.white,
            child: const Icon(Icons.person_add_outlined, size: 20),
          ),
          const SizedBox(height: 8),
          // Scan QR
          FloatingActionButton.extended(
            heroTag: 'scan',
            onPressed: _openQRScanner,
            backgroundColor: AppColors.brand600,
            foregroundColor: Colors.white,
            icon: const Icon(Icons.qr_code_scanner_rounded),
            label: const Text('Scan QR',
                style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  // ── TAB TERCATAT ────────────────────────────────────────────
  Widget _buildTercatatTab(bool sudahLewat) {
    return Column(
      children: [
        // Filter bar
        Container(
          color: context.cCard,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(children: [
            Expanded(
                child: TextField(
              onChanged: (v) => setState(() => _searchQ = v),
              decoration: InputDecoration(
                hintText: context.s.searchEmployee,
                prefixIcon: Icon(Icons.search, size: 18, color: context.cMuted),
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: context.cBorder)),
                enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: context.cBorder)),
                filled: true,
                fillColor: context.cSurface,
              ),
            )),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                  color: context.cSurface,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: context.cBorder)),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _filterStatus,
                  isDense: true,
                  style: TextStyle(fontSize: 16, color: context.cText),
                  onChanged: (v) => setState(() => _filterStatus = v ?? 'all'),
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('Semua')),
                    DropdownMenuItem(value: 'hadir', child: Text('Hadir')),
                    DropdownMenuItem(
                        value: 'tidak_hadir', child: Text('Tidak Hadir')),
                  ],
                ),
              ),
            ),
          ]),
        ),
        Expanded(
          child: _filtered.isEmpty
              ? const AppEmpty(
                  message:
                      'Belum ada presensi tercatat.\nScan QR atau input manual.',
                  icon: Icons.people_outline_rounded)
              : RefreshIndicator(
                  color: AppColors.brand600,
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: _filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 6),
                    itemBuilder: (ctx, i) => _PresensiCard(
                      data: _filtered[i],
                      onEdit: () => _openEdit(_filtered[i]),
                      onDelete: () => _hapusPresensi(_filtered[i]),
                    ),
                  ),
                ),
        ),
      ],
    );
  }

  // ── TAB BELUM INPUT ─────────────────────────────────────────
  Widget _buildBelumInputTab(bool sudahLewat) {
    if (_belumTercatat.isEmpty) {
      return const AppEmpty(
          message: 'Semua karyawan sudah tercatat! ✓',
          icon: Icons.check_circle_outline_rounded);
    }
    return Column(
      children: [
        if (sudahLewat)
          Container(
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
                color: context.isDark
                    ? const Color(0xFF1E1B00)
                    : const Color(0xFFFEF9C3),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: context.isDark
                        ? const Color(0xFF4A4200)
                        : const Color(0xFFFDE047))),
            child: Row(children: [
              const Icon(Icons.warning_amber_rounded,
                  color: Color(0xFFD97706), size: 18),
              const SizedBox(width: 8),
              Expanded(
                  child: Text(
                      'Hari sudah lewat — karyawan ini akan dihitung Tidak Hadir.',
                      style: TextStyle(
                          fontSize: 16,
                          color: context.isDark
                              ? const Color(0xFFD97706)
                              : const Color(0xFF92400E)))),
            ]),
          ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: _belumTercatat.length,
            separatorBuilder: (_, __) => const SizedBox(height: 6),
            itemBuilder: (ctx, i) {
              final k = _belumTercatat[i];
              final jab = k['jabatan'] as Map<String, dynamic>? ?? {};
              return AppCard(
                child: Row(children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                        color: context.isDark
                            ? const Color(0xFF2A2600)
                            : const Color(0xFFFEF9C3),
                        borderRadius: BorderRadius.circular(12)),
                    child: Center(
                        child: Text(
                      (k['nama_karyawan'] as String? ?? '?')
                          .substring(0, 1)
                          .toUpperCase(),
                      style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: context.isDark
                              ? const Color(0xFFD97706)
                              : const Color(0xFF92400E)),
                    )),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(k['nama_karyawan'] ?? '-',
                            style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w600,
                                color: context.cText)),
                        Text(
                            '${k['kode_karyawan'] ?? ''} · ${jab['nama_jabatan'] ?? '-'}',
                            style:
                                TextStyle(fontSize: 15, color: context.cSub)),
                      ])),
                  // Tombol absen cepat
                  ElevatedButton(
                    onPressed: () => _absenCepat(k),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.brand600,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      minimumSize: Size.zero,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                    child:
                        const Text('+ Hadir', style: TextStyle(fontSize: 16)),
                  ),
                ]),
              );
            },
          ),
        ),
      ],
    );
  }

  // ── BUKA QR SCANNER ─────────────────────────────────────────
  void _openQRScanner() {
    Navigator.of(context).push(appRoute(_QRScannerScreen(
      project: widget.project,
      tanggal: _tanggal,
      payrollService: _svc,
      onScanned: () => _load(silent: true),
    )));
  }
}

// ─────────────────────────────────────────────────────────────
// PRESENSI CARD
// ─────────────────────────────────────────────────────────────
class _PresensiCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  const _PresensiCard(
      {required this.data, required this.onEdit, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final karyawan = data['karyawan'] as Map<String, dynamic>? ?? {};
    final jabatan = karyawan['jabatan'] as Map<String, dynamic>? ?? {};
    final project = data['project'] as Map<String, dynamic>? ?? {};
    final isHadir = data['status_kehadiran'] == 'hadir';
    final sedangBekerja = data['status_kehadiran'] == 'belum_lengkap' &&
        data['jam_masuk'] != null;
    final hasJamMasuk = isHadir || sedangBekerja;
    final metode = data['metode_input'] as String? ?? 'manual';

    return AppCard(
      padding: const EdgeInsets.all(12),
      child: Row(children: [
        // Avatar
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: isHadir
                ? AppColors.green100
                : sedangBekerja
                    ? AppColors.brand100
                    : AppColors.red100,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
              child: Text(
            (karyawan['nama_karyawan'] as String? ?? '?')
                .substring(0, 1)
                .toUpperCase(),
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: isHadir
                    ? AppColors.green800
                    : sedangBekerja
                        ? AppColors.brand700
                        : AppColors.red800),
          )),
        ),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
                child: Text(karyawan['nama_karyawan'] ?? '-',
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: context.cText))),
            StatusBadge(status: data['status_kehadiran'] ?? ''),
          ]),
          Text(
              '${karyawan['kode_karyawan'] ?? ''} · ${jabatan['nama_jabatan'] ?? '-'}',
              style: TextStyle(fontSize: 15, color: context.cSub)),
          const SizedBox(height: 4),
          Wrap(
              spacing: 0,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (hasJamMasuk) ...[
                  Icon(Icons.login_rounded, size: 12, color: context.cMuted),
                  const SizedBox(width: 3),
                  Text(AppFormatter.waktu(data['jam_masuk'] as String?),
                      style: TextStyle(fontSize: 15, color: context.cSub)),
                  if (data['jam_keluar'] != null) ...[
                    const SizedBox(width: 6),
                    Icon(Icons.logout_rounded, size: 12, color: context.cMuted),
                    const SizedBox(width: 3),
                    Text(AppFormatter.waktu(data['jam_keluar'] as String?),
                        style: TextStyle(fontSize: 15, color: context.cSub)),
                  ],
                  const SizedBox(width: 6),
                ],
                // Metode badge
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(
                    color: context.isDark
                        ? const Color(0xFF182033)
                        : data['status_kehadiran'] == 'belum_lengkap'
                            ? const Color(0xFFFEF9C3)
                            : metode == 'qr_code'
                                ? AppColors.brand50
                                : metode == 'otomatis'
                                    ? AppColors.gray100
                                    : const Color(0xFFECFDF5),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    metode == 'qr_code'
                        ? 'QR'
                        : metode == 'otomatis'
                            ? 'Auto'
                            : 'Manual',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: metode == 'qr_code'
                            ? AppColors.brand700
                            : metode == 'otomatis'
                                ? context.cMuted
                                : const Color(0xFF059669)),
                  ),
                ),
                if (project.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Icon(Icons.location_city_outlined,
                      size: 11, color: context.cMuted),
                  const SizedBox(width: 2),
                  Text(project['kode_project'] ?? '',
                      style: TextStyle(fontSize: 14, color: context.cSub)),
                ],
                if (asNum(data['upah_luar_kota']) > 0) ...[
                  const SizedBox(width: 6),
                  const Icon(Icons.airplanemode_active_rounded,
                      size: 11, color: Color(0xFF7C3AED)),
                  const SizedBox(width: 2),
                  Text(AppFormatter.rupiah(asNum(data['upah_luar_kota'])),
                      style: const TextStyle(
                          fontSize: 14,
                          color: Color(0xFF7C3AED),
                          fontWeight: FontWeight.w600)),
                ],
              ]),
        ])),
        // Actions
        PopupMenuButton<String>(
          onSelected: (v) {
            if (v == 'edit') {
              onEdit();
            } else if (v == 'delete') {
              onDelete();
            }
          },
          icon: Icon(Icons.more_vert_rounded, size: 18, color: context.cMuted),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          itemBuilder: (_) => [
            const PopupMenuItem(
                value: 'edit',
                child: Row(children: [
                  Icon(Icons.edit_outlined,
                      size: 16, color: AppColors.brand600),
                  SizedBox(width: 8),
                  Text('Edit Presensi'),
                ])),
            const PopupMenuItem(
                value: 'delete',
                child: Row(children: [
                  Icon(Icons.delete_outline,
                      size: 16, color: Color(0xFFDC2626)),
                  SizedBox(width: 8),
                  Text('Hapus', style: TextStyle(color: Color(0xFFDC2626))),
                ])),
          ],
        ),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// STAT CHIP
// ─────────────────────────────────────────────────────────────
class _StatChip extends StatelessWidget {
  final String label;
  final int value;
  final Color color, bg;
  const _StatChip(this.label, this.value, this.color, this.bg);

  @override
  Widget build(BuildContext context) {
    final chipBg =
        context.isDark ? Color.lerp(const Color(0xFF182033), color, 0.18)! : bg;
    final chipColor =
        context.isDark ? Color.lerp(Colors.white, color, 0.8)! : color;
    return SizedBox(
        width: 96,
        child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
      decoration:
          BoxDecoration(color: chipBg, borderRadius: BorderRadius.circular(10)),
      child: Column(children: [
        Text('$value',
            style: TextStyle(
                fontSize: 20, fontWeight: FontWeight.w700, color: chipColor)),
        Text(label,
            style: TextStyle(fontSize: 14, color: context.cSub),
            textAlign: TextAlign.center),
      ]),
    ));
  }
}

// ─────────────────────────────────────────────────────────────
// EDIT PRESENSI SHEET
// ─────────────────────────────────────────────────────────────
class _EditPresensiSheet extends StatefulWidget {
  final Map<String, dynamic> presensi;
  final PayrollService payrollService;
  final VoidCallback onSaved;
  const _EditPresensiSheet(
      {required this.presensi,
      required this.payrollService,
      required this.onSaved});

  @override
  State<_EditPresensiSheet> createState() => _EditPresensiSheetState();
}

class _EditPresensiSheetState extends State<_EditPresensiSheet> {
  late String _status;
  late TextEditingController _jamMasukCtrl;
  late TextEditingController _jamKeluarCtrl;
  late TextEditingController _catatanCtrl;
  late TextEditingController _uangMakanCtrl;
  late TextEditingController _uangTransportCtrl;
  late TextEditingController _upahLuarKotaCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final p = widget.presensi;
    _status = p['status_kehadiran'] == 'hadir' ? 'hadir' : 'tidak_hadir';
    _jamMasukCtrl = TextEditingController(
        text: AppFormatter.waktu(p['jam_masuk'] as String?));
    _jamKeluarCtrl = TextEditingController(
        text: AppFormatter.waktu(p['jam_keluar'] as String?));
    _catatanCtrl = TextEditingController(text: p['catatan'] ?? '');
    _uangMakanCtrl =
        TextEditingController(text: p['uang_makan']?.toString() ?? '');
    _uangTransportCtrl =
        TextEditingController(text: p['uang_transport']?.toString() ?? '');
    _upahLuarKotaCtrl =
        TextEditingController(text: p['upah_luar_kota']?.toString() ?? '');
  }

  @override
  void dispose() {
    _jamMasukCtrl.dispose();
    _jamKeluarCtrl.dispose();
    _catatanCtrl.dispose();
    _uangMakanCtrl.dispose();
    _uangTransportCtrl.dispose();
    _upahLuarKotaCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final dbStatus = _status == 'hadir' ? 'hadir' : 'alfa';
      await widget.payrollService.updatePresensi(widget.presensi['id'] as int, {
        'status_kehadiran': dbStatus,
        'jam_masuk': _status == 'hadir' && _jamMasukCtrl.text.isNotEmpty
            ? '${_jamMasukCtrl.text}:00'.replaceAll(':00:00', ':00')
            : null,
        'jam_keluar': _status == 'hadir' && _jamKeluarCtrl.text.isNotEmpty
            ? '${_jamKeluarCtrl.text}:00'.replaceAll(':00:00', ':00')
            : null,
        'durasi_jam': _status == 'hadir' &&
                _jamMasukCtrl.text.isNotEmpty &&
                _jamKeluarCtrl.text.isNotEmpty
            ? PayrollService.hitungDurasiJam(
                _jamMasukCtrl.text, _jamKeluarCtrl.text)
            : null,
        'uang_makan': _uangMakanCtrl.text.isNotEmpty
            ? double.tryParse(_uangMakanCtrl.text)
            : null,
        'uang_transport': _uangTransportCtrl.text.isNotEmpty
            ? double.tryParse(_uangTransportCtrl.text)
            : null,
        'upah_luar_kota': _upahLuarKotaCtrl.text.isNotEmpty
            ? double.tryParse(_upahLuarKotaCtrl.text)
            : 0,
        'catatan': _catatanCtrl.text,
        'metode_input': 'manual',
      });
      widget.onSaved();
      if (mounted) {
        Navigator.pop(context);
        showSuccess(context, 'Presensi berhasil diperbarui ✓');
      }
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final karyawan = widget.presensi['karyawan'] as Map<String, dynamic>? ?? {};
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: BoxDecoration(
          color: context.cSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24))),
      child: Column(children: [
        Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
                color: context.cBorder,
                borderRadius: BorderRadius.circular(2))),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          child: Row(children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Edit Presensi',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: context.cText)),
              Text(karyawan['nama_karyawan'] ?? '-',
                  style: TextStyle(fontSize: 16, color: context.cSub)),
            ]),
            const Spacer(),
            IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.pop(context)),
          ]),
        ),
        const Divider(),
        Expanded(
            child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Status
            Text(context.s.attendanceStatus,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: context.cText)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: _StatusBtn(
                      'Hadir',
                      '✅',
                      _status == 'hadir',
                      () => setState(() => _status = 'hadir'),
                      AppColors.green100,
                      AppColors.green800)),
              const SizedBox(width: 10),
              Expanded(
                  child: _StatusBtn(
                      'Tidak Hadir',
                      '❌',
                      _status == 'tidak_hadir',
                      () => setState(() => _status = 'tidak_hadir'),
                      AppColors.red100,
                      AppColors.red800)),
            ]),
            if (_status == 'hadir') ...[
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                    child: _Field(context.s.clockIn, _jamMasukCtrl,
                        hint: '07:00', isTime: true)),
                const SizedBox(width: 12),
                Expanded(
                    child: _Field(context.s.clockOut, _jamKeluarCtrl,
                        hint: '17:00', isTime: true)),
              ]),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                    child: _Field(context.s.foodAllowance, _uangMakanCtrl,
                        hint: '0', isNumber: true)),
                const SizedBox(width: 12),
                Expanded(
                    child: _Field(
                        context.s.transportAllowance, _uangTransportCtrl,
                        hint: '0', isNumber: true)),
              ]),
              const SizedBox(height: 16),
              _Field(context.s.outOfCityAllowance, _upahLuarKotaCtrl,
                  hint: context.s.outOfCityHint, isNumber: true),
            ],
            const SizedBox(height: 16),
            _Field('Catatan', _catatanCtrl,
                hint: context.s.descriptionHint, maxLines: 2),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _saving ? null : _save,
                icon: const Icon(Icons.save_rounded, size: 18),
                label: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : Text(context.s.saveChanges),
              ),
            ),
          ]),
        )),
      ]),
    );
  }
}

class _StatusBtn extends StatelessWidget {
  final String label, emoji;
  final bool selected;
  final VoidCallback onTap;
  final Color bg, fg;
  const _StatusBtn(
      this.label, this.emoji, this.selected, this.onTap, this.bg, this.fg);

  @override
  Widget build(BuildContext context) {
    final selBg =
        context.isDark ? Color.lerp(const Color(0xFF182033), fg, 0.22)! : bg;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: selected ? selBg : context.cCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: selected ? fg : context.cBorder, width: selected ? 2 : 1),
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: selected ? fg : context.cSub)),
        ]),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController ctrl;
  final String? hint;
  final bool isTime, isNumber;
  final int maxLines;
  const _Field(this.label, this.ctrl,
      {this.hint,
      this.isTime = false,
      this.isNumber = false,
      this.maxLines = 1});

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: context.cText)),
        const SizedBox(height: 6),
        TextField(
          controller: ctrl,
          maxLines: maxLines,
          keyboardType: isTime
              ? TextInputType.datetime
              : isNumber
                  ? TextInputType.number
                  : TextInputType.text,
          inputFormatters:
              isNumber ? [FilteringTextInputFormatter.digitsOnly] : null,
          style: TextStyle(color: context.cText, fontSize: 17),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: context.cMuted, fontSize: 16),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: context.cBorder)),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: context.cBorder)),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide:
                    const BorderSide(color: AppColors.brand600, width: 2)),
            filled: true,
            fillColor: context.cCard,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
        ),
      ]);
}

// ─────────────────────────────────────────────────────────────
// INPUT MANUAL PRESENSI BARU
// ─────────────────────────────────────────────────────────────
class _InputPresensiSheet extends StatefulWidget {
  final Map<String, dynamic> project;
  final String tanggal;
  final List<Map<String, dynamic>> karyawanList;
  final PayrollService payrollService;
  final VoidCallback onSaved;
  const _InputPresensiSheet(
      {required this.project,
      required this.tanggal,
      required this.karyawanList,
      required this.payrollService,
      required this.onSaved});

  @override
  State<_InputPresensiSheet> createState() => _InputPresensiSheetState();
}

class _InputPresensiSheetState extends State<_InputPresensiSheet> {
  Map<String, dynamic>? _selectedKaryawan;
  String _status = 'hadir';
  final _jamMasukCtrl = TextEditingController(text: '07:00');
  final _jamKeluarCtrl = TextEditingController();
  final _catatanCtrl = TextEditingController();
  final _upahLuarKotaCtrl = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    if (_selectedKaryawan == null) {
      showError(context, 'Pilih karyawan terlebih dahulu.');
      return;
    }
    setState(() => _saving = true);
    try {
      final jabatan =
          _selectedKaryawan!['jabatan'] as Map<String, dynamic>? ?? {};
      await widget.payrollService.upsertPresensi({
        'project_id': widget.project['id'],
        'karyawan_id': _selectedKaryawan!['id'],
        'tanggal': widget.tanggal,
        'status_kehadiran': _status == 'hadir' ? 'hadir' : 'alfa',
        'jam_masuk': _status == 'hadir'
            ? (_jamMasukCtrl.text.isNotEmpty
                ? '${_jamMasukCtrl.text}:00'.replaceAll(':00:00', ':00')
                : null)
            : null,
        'jam_keluar': _status == 'hadir' && _jamKeluarCtrl.text.isNotEmpty
            ? '${_jamKeluarCtrl.text}:00'.replaceAll(':00:00', ':00')
            : null,
        'durasi_jam': _status == 'hadir' &&
                _jamMasukCtrl.text.isNotEmpty &&
                _jamKeluarCtrl.text.isNotEmpty
            ? PayrollService.hitungDurasiJam(
                _jamMasukCtrl.text, _jamKeluarCtrl.text)
            : null,
        'uang_makan': jabatan['uang_makan'] ?? 0,
        'uang_transport': jabatan['uang_transport'] ?? 0,
        'upah_luar_kota': _upahLuarKotaCtrl.text.isNotEmpty
            ? double.tryParse(_upahLuarKotaCtrl.text) ?? 0
            : 0,
        'catatan': _catatanCtrl.text,
        'metode_input': 'manual',
      });
      widget.onSaved();
      if (mounted) {
        Navigator.pop(context);
        showSuccess(context,
            '${_selectedKaryawan!['nama_karyawan']} berhasil diabsen ✓');
      }
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _jamMasukCtrl.dispose();
    _jamKeluarCtrl.dispose();
    _catatanCtrl.dispose();
    _upahLuarKotaCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.82,
        decoration: BoxDecoration(
            color: context.cSurface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(children: [
          Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: context.cBorder,
                  borderRadius: BorderRadius.circular(2))),
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(children: [
                Text(context.s.manualInputTitle,
                    style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: context.cText)),
                const Spacer(),
                IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.pop(context)),
              ])),
          const Divider(),
          Expanded(
              child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(context.s.selectEmployeeLabel,
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: context.cText)),
              const SizedBox(height: 6),
              AppDropdown<Map<String, dynamic>>(
                value: _selectedKaryawan,
                hint: 'Pilih karyawan...',
                items: widget.karyawanList
                    .map((k) => AppDropdownItem(
                          value: k,
                          label: k['nama_karyawan'] as String? ?? '-',
                          subtitle: (k['jabatan'] as Map?)?['nama_jabatan']
                              as String?,
                        ))
                    .toList(),
                onChanged: (v) => setState(() => _selectedKaryawan = v),
              ),
              const SizedBox(height: 16),
              Text(context.s.attendanceStatus,
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: context.cText)),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                    child: _StatusBtn(
                        'Hadir',
                        '✅',
                        _status == 'hadir',
                        () => setState(() => _status = 'hadir'),
                        AppColors.green100,
                        AppColors.green800)),
                const SizedBox(width: 10),
                Expanded(
                    child: _StatusBtn(
                        'Tidak Hadir',
                        '❌',
                        _status == 'tidak_hadir',
                        () => setState(() => _status = 'tidak_hadir'),
                        AppColors.red100,
                        AppColors.red800)),
              ]),
              if (_status == 'hadir') ...[
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(
                      child: _Field(context.s.clockIn, _jamMasukCtrl,
                          hint: '07:00', isTime: true)),
                  const SizedBox(width: 12),
                  Expanded(
                      child: _Field(context.s.clockOut, _jamKeluarCtrl,
                          hint: context.s.optionalLabel, isTime: true)),
                ]),
                const SizedBox(height: 16),
                _Field(context.s.outOfCityAllowance, _upahLuarKotaCtrl,
                    hint: context.s.outOfCityHint, isNumber: true),
              ],
              const SizedBox(height: 16),
              _Field('Catatan', _catatanCtrl,
                  hint: context.s.descriptionHint, maxLines: 2),
              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: const Icon(Icons.save_rounded, size: 18),
                  label: _saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2))
                      : Text(context.s.saveAttendance),
                ),
              ),
            ]),
          )),
        ]),
      );
}

// ─────────────────────────────────────────────────────────────
// RIWAYAT PER KARYAWAN
// ─────────────────────────────────────────────────────────────
class _RiwayatTab extends StatefulWidget {
  final PayrollService payrollService;
  final List<Map<String, dynamic>> karyawanList;
  const _RiwayatTab({required this.payrollService, required this.karyawanList});

  @override
  State<_RiwayatTab> createState() => _RiwayatTabState();
}

class _RiwayatTabState extends State<_RiwayatTab> {
  Map<String, dynamic>? _selectedKaryawan;
  List<Map<String, dynamic>> _riwayat = [];
  bool _loading = false;
  String _dari = _defaultDari();
  String _sampai = DateTime.now().toIso8601String().split('T')[0];

  static String _defaultDari() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-01';
  }

  Future<void> _loadRiwayat() async {
    if (_selectedKaryawan == null) return;
    setState(() => _loading = true);
    try {
      final data = await widget.payrollService.getRiwayatKaryawan(
        karyawanId: _selectedKaryawan!['id'] as int,
        tanggalDari: _dari,
        tanggalSampai: _sampai,
      );
      if (mounted) {
        setState(() {
          _riwayat = data;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _exportExcelKaryawan() async {
    if (_selectedKaryawan == null || _riwayat.isEmpty) return;
    try {
      await ExportService.exportPresensiExcel(
        data: _riwayat,
        tanggal: '${_dari}_$_sampai',
        namaProject: _selectedKaryawan!['nama_karyawan'] as String?,
      );
      if (mounted) showSuccess(context, 'Excel riwayat berhasil dibuat ✓');
    } catch (e) {
      if (mounted) showError(context, 'Gagal export: $e');
    }
  }

  int get _hadirCount =>
      _riwayat.where((p) => p['status_kehadiran'] == 'hadir').length;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      // Filter
      Container(
          color: context.cCard,
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            AppDropdown<Map<String, dynamic>>(
              value: _selectedKaryawan,
              hint: 'Pilih karyawan...',
              prefixIcon: Icon(Icons.person_outline_rounded,
                  size: 16, color: context.cMuted),
              items: widget.karyawanList
                  .map((k) => AppDropdownItem(
                        value: k,
                        label: k['nama_karyawan'] as String? ?? '-',
                        subtitle:
                            (k['jabatan'] as Map?)?['nama_jabatan'] as String?,
                      ))
                  .toList(),
              onChanged: (v) {
                setState(() {
                  _selectedKaryawan = v;
                  _riwayat = [];
                });
                _loadRiwayat();
              },
            ),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                  child: _DateBtn(AppFormatter.tanggal(_dari), () async {
                final d = await showDatePicker(
                    context: context,
                    initialDate: DateTime.parse(_dari),
                    firstDate: DateTime(2024),
                    lastDate: DateTime.now(),
                    builder: (ctx, c) => Theme(
                        data: Theme.of(ctx).copyWith(
                            colorScheme: const ColorScheme.light(
                                primary: AppColors.brand600)),
                        child: c!));
                if (d != null) {
                  setState(() => _dari = d.toIso8601String().split('T')[0]);
                  _loadRiwayat();
                }
              })),
              Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(context.s.toDateSeparator,
                      style: TextStyle(color: context.cSub, fontSize: 16))),
              Expanded(
                  child: _DateBtn(AppFormatter.tanggal(_sampai), () async {
                final d = await showDatePicker(
                    context: context,
                    initialDate: DateTime.parse(_sampai),
                    firstDate: DateTime(2024),
                    lastDate: DateTime.now(),
                    builder: (ctx, c) => Theme(
                        data: Theme.of(ctx).copyWith(
                            colorScheme: const ColorScheme.light(
                                primary: AppColors.brand600)),
                        child: c!));
                if (d != null) {
                  setState(() => _sampai = d.toIso8601String().split('T')[0]);
                  _loadRiwayat();
                }
              })),
            ]),
          ])),

      // Summary + Export
      if (_riwayat.isNotEmpty)
        Container(
            color: context.cCard,
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Column(children: [
              const Divider(height: 12),
              Row(children: [
                Expanded(
                    child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    _MiniStat('Hadir', _hadirCount, const Color(0xFF16A34A),
                        const Color(0xFFDCFCE7)),
                    const SizedBox(width: 8),
                    _MiniStat('Tidak Hadir', _riwayat.length - _hadirCount,
                        const Color(0xFFDC2626), const Color(0xFFFEE2E2)),
                    const SizedBox(width: 8),
                    _MiniStat('Total', _riwayat.length, AppColors.brand600,
                        AppColors.brand50),
                  ]),
                )),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: _exportExcelKaryawan,
                  icon: const Icon(Icons.table_view_rounded, size: 14),
                  label: const Text('Excel', style: TextStyle(fontSize: 16)),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.brand600,
                    side: const BorderSide(color: AppColors.brand600),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ]),
            ])),

      Expanded(
        child: _selectedKaryawan == null
            ? AppEmpty(
                message: context.s.selectEmpForHistory,
                icon: Icons.person_search_outlined)
            : _loading
                ? const ShimmerList()
                : _riwayat.isEmpty
                    ? AppEmpty(
                        message: context.s.noAttendanceInPeriod,
                        icon: Icons.calendar_month_outlined)
                    : ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _riwayat.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 6),
                        itemBuilder: (ctx, i) {
                          final p = _riwayat[i];
                          final proj =
                              p['project'] as Map<String, dynamic>? ?? {};
                          final isHadir = p['status_kehadiran'] == 'hadir';
                          return AppCard(
                            padding: const EdgeInsets.all(12),
                            child: Row(children: [
                              Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                      color: isHadir
                                          ? AppColors.green100
                                          : AppColors.red100,
                                      borderRadius: BorderRadius.circular(10)),
                                  child: Icon(
                                      isHadir
                                          ? Icons.check_rounded
                                          : Icons.close_rounded,
                                      color: isHadir
                                          ? AppColors.green800
                                          : AppColors.red800,
                                      size: 20)),
                              const SizedBox(width: 10),
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(
                                        AppFormatter.tanggalPanjang(
                                            DateTime.parse(p['tanggal'])),
                                        style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w600,
                                            color: context.cText)),
                                    if (isHadir)
                                      Row(children: [
                                        Text(
                                            '${AppFormatter.waktu(p['jam_masuk'])} → ${AppFormatter.waktu(p['jam_keluar'])}',
                                            style: TextStyle(
                                                fontSize: 15,
                                                color: context.cSub)),
                                        if (proj.isNotEmpty) ...[
                                          const SizedBox(width: 8),
                                          Text(proj['kode_project'] ?? '',
                                              style: const TextStyle(
                                                  fontSize: 14,
                                                  color: AppColors.brand600)),
                                        ],
                                      ]),
                                  ])),
                              StatusBadge(
                                  status: isHadir ? 'hadir' : 'tidak_hadir'),
                            ]),
                          );
                        },
                      ),
      ),
    ]);
  }
}

class _DateBtn extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _DateBtn(this.label, this.onTap);

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
              border: Border.all(color: context.cBorder),
              borderRadius: BorderRadius.circular(8),
              color: context.cCard),
          child: Row(children: [
            const Icon(Icons.calendar_today_outlined,
                size: 13, color: AppColors.brand600),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 16, color: context.cText)),
          ]),
        ),
      );
}

class _MiniStat extends StatelessWidget {
  final String label;
  final int value;
  final Color color, bg;
  const _MiniStat(this.label, this.value, this.color, this.bg);

  @override
  Widget build(BuildContext context) {
    final chipBg =
        context.isDark ? Color.lerp(const Color(0xFF182033), color, 0.2)! : bg;
    final chipColor =
        context.isDark ? Color.lerp(Colors.white, color, 0.8)! : color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration:
          BoxDecoration(color: chipBg, borderRadius: BorderRadius.circular(8)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text('$value',
            style: TextStyle(
                fontSize: 18, fontWeight: FontWeight.w700, color: chipColor)),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 14, color: context.cSub)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// QR SCANNER SCREEN
// ─────────────────────────────────────────────────────────────
class _QRScannerScreen extends StatefulWidget {
  final Map<String, dynamic> project;
  final String tanggal;
  final PayrollService payrollService;
  final VoidCallback onScanned;
  const _QRScannerScreen(
      {required this.project,
      required this.tanggal,
      required this.payrollService,
      required this.onScanned});

  @override
  State<_QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<_QRScannerScreen> {
  final MobileScannerController _ctrl =
      MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool _processing = false;
  String? _lastResult;
  String? _lastMessage;
  // 'masuk' = hijau, 'keluar' = merah, 'info' = sudah lengkap, 'error' = gagal
  String _lastType = 'info';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_processing) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode?.rawValue == null) return;
    final qrValue = barcode!.rawValue!;
    if (qrValue == _lastResult) return;

    setState(() {
      _processing = true;
      _lastResult = qrValue;
    });

    try {
      final karyawan = await widget.payrollService
          .validateQRCode(qrValue, projectId: widget.project['id'] as int?);
      if (karyawan == null) throw Exception('Data tidak ditemukan.');

      final now = DateTime.now();
      final jamSekarang =
          "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:00";
      final karyawanId = karyawan['id'] as int;

      // Cek + tulis presensi dalam satu transaksi atomic di database (lihat
      // FIX_SCAN_PRESENSI_ATOMIC.sql) -- tidak ada lagi jeda antara "cek
      // sudah ada atau belum" dan "tulis" yang sebelumnya bisa bentrok kalau
      // ada scan/proses lain yang menulis baris yang sama persis di jeda itu.
      final hasil = await widget.payrollService.scanPresensiQr(
        projectId: widget.project['id'] as int,
        karyawanId: karyawanId,
        tanggal: widget.tanggal,
        jam: jamSekarang,
        metodeInput: 'qr_code',
        qrValue: qrValue,
      );

      String pesan;
      String tipe;
      switch (hasil['hasil']) {
        case 'masuk':
          pesan = "✓ JAM MASUK\n${karyawan['nama_karyawan']}\n$jamSekarang";
          tipe = 'masuk';
          break;
        case 'keluar':
          pesan = "✓ JAM KELUAR\n${karyawan['nama_karyawan']}\n$jamSekarang";
          tipe = 'keluar';
          break;
        default:
          pesan = "ℹ️ ${karyawan['nama_karyawan']}\nPresensi sudah lengkap";
          tipe = 'info';
      }

      widget.onScanned();
      setState(() {
        _lastMessage = pesan;
        _lastType = tipe;
      });
    } catch (e) {
      setState(() {
        _lastMessage = e.toString().replaceFirst('Exception: ', '');
        _lastType = 'error';
      });
    } finally {
      await Future.delayed(const Duration(seconds: 3));
      if (mounted) {
        setState(() {
          _processing = false;
          _lastMessage = null;
        });
      }
    }
  }

  // Hijau untuk jam masuk, merah untuk jam keluar — biru untuk info, merah untuk error
  Color _warnaHasil(String tipe) {
    switch (tipe) {
      case 'masuk':
        return const Color(0xFF16A34A);
      case 'keluar':
        return const Color(0xFFDC2626);
      case 'error':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFF2563EB);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(context.s.scanQRTitle,
              style: const TextStyle(color: Colors.white, fontSize: 19)),
          Text(widget.project['nama_project'] ?? '',
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.65), fontSize: 15)),
        ]),
        actions: [
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _ctrl,
            builder: (_, state, __) => IconButton(
              icon: Icon(
                  state.torchState == TorchState.on
                      ? Icons.flash_on_rounded
                      : Icons.flash_off_rounded,
                  color: Colors.white),
              onPressed: _ctrl.toggleTorch,
            ),
          ),
        ],
      ),
      body: Stack(children: [
        MobileScanner(controller: _ctrl, onDetect: _onDetect),
        // Scanner frame
        Center(
            child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          width: 260,
          height: 260,
          decoration: BoxDecoration(
            border: Border.all(
                color: _lastMessage != null
                    ? _warnaHasil(_lastType)
                    : AppColors.brand400,
                width: 3),
            borderRadius: BorderRadius.circular(16),
          ),
        )),
        // Bottom info
        Positioned(
            bottom: 40,
            left: 16,
            right: 16,
            child: Column(children: [
              if (_lastMessage != null)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                  decoration: BoxDecoration(
                    color: _warnaHasil(_lastType),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(_lastMessage!,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w600),
                      textAlign: TextAlign.center),
                )
              else
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.65),
                      borderRadius: BorderRadius.circular(20)),
                  child: Text(
                    _processing
                        ? context.s.processingLabel
                        : context.s.pointCameraToQR,
                    style: const TextStyle(color: Colors.white, fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                ),
              const SizedBox(height: 8),
              Text('Tanggal: ${AppFormatter.tanggal(widget.tanggal)}',
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 15)),
            ])),
        if (_processing)
          const Center(child: CircularProgressIndicator(color: Colors.green)),
      ]),
    );
  }
}
