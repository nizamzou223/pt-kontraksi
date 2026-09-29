import 'dart:async';
import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/payroll_service.dart';
import '../services/export_service.dart';
import '../services/connectivity_service.dart';
import '../services/cache_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/app_dropdown.dart';
import '../l10n/app_strings.dart';

class LemburScreen extends StatefulWidget {
  final UserModel user;
  final Map<String, dynamic> project;
  const LemburScreen({super.key, required this.user, required this.project});
  @override
  State<LemburScreen> createState() => _LemburScreenState();
}

class _LemburScreenState extends State<LemburScreen>
    with SingleTickerProviderStateMixin {
  Timer? _refreshTimer;

  final _svc = PayrollService();
  List<Map<String, dynamic>> _list = [];
  List<Map<String, dynamic>> _karyawan = [];
  bool _loading = true;
  String? _cacheAge;
  late TabController _tabs;
  String _filterTab = 'semua'; // semua | pending | disetujui | ditolak

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) {
        setState(() {
          _filterTab =
              ['semua', 'pending', 'disetujui', 'ditolak'][_tabs.index];
        });
      }
    });
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(LemburScreen old) {
    super.didUpdateWidget(old);
    if (old.project['id'] != widget.project['id']) _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final pid = widget.project['id'] as int;
    if (ConnectivityService().isOffline) {
      final cached = await CacheService.getList('lembur', projectId: pid);
      if (mounted) {
        setState(() {
          if (cached != null) {
            _list = cached.data;
            _cacheAge = CacheService.ageText(cached.timestamp);
          }
          _loading = false;
        });
      }
      return;
    }
    try {
      final list = await _svc.getLembur(projectId: pid);
      final karyawan = await _svc.getAllKaryawan();
      await CacheService.setList('lembur', list, projectId: pid);
      if (mounted) {
        setState(() {
          _list = list;
          _karyawan = karyawan;
          _cacheAge = null;
          _loading = false;
        });
      }
    } catch (e) {
      final cached = await CacheService.getList('lembur', projectId: pid);
      if (mounted) {
        setState(() {
          if (cached != null) {
            _list = cached.data;
            _cacheAge = CacheService.ageText(cached.timestamp);
          }
          _loading = false;
        });
      }
      if (mounted && cached == null) {
        showError(context, e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  List<Map<String, dynamic>> get _filtered => _filterTab == 'semua'
      ? _list
      : _list.where((l) => l['status_persetujuan'] == _filterTab).toList();

  int _count(String s) =>
      _list.where((l) => l['status_persetujuan'] == s).length;

  bool _isAutoLembur(Map<String, dynamic> l) =>
      (l['catatan'] as String? ?? '').startsWith('Otomatis');

  double get _totalJam => _list
      .where((l) => l['status_persetujuan'] == 'disetujui' && !_isAutoLembur(l))
      .fold(0.0, (s, l) => s + (l['durasi_jam'] as num? ?? 0).toDouble());
  double get _totalRp => _list
      .where((l) => l['status_persetujuan'] == 'disetujui' && !_isAutoLembur(l))
      .fold(0.0, (s, l) => s + (l['total_lembur'] as num? ?? 0).toDouble());

  void _openForm() => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _LemburFormSheet(
            project: widget.project,
            karyawan: _karyawan,
            svc: _svc,
            onSaved: () {
              _load();
              Navigator.pop(context);
            },
          ));

  Future<void> _delete(Map<String, dynamic> item) async {
    final ok = await showConfirm(context,
        title: context.s.deleteLembur,
        msg:
            '${context.s.deleteOvertimeMsg} ${(item['karyawan'] as Map?)?['nama_karyawan'] ?? '-'}?',
        danger: true);
    if (ok != true) return;
    try {
      await _svc.deleteLembur((item['id'] as num).toInt());
      if (!mounted) return;
      showSuccess(context, context.s.overtimeDeleted);
      _load();
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _exportExcel() async {
    try {
      await ExportService.exportLemburExcel(
        data: _filtered,
        namaProject: widget.project['nama_project'] as String? ?? 'Proyek',
      );
      if (mounted) showSuccess(context, 'Excel lembur berhasil dibuat ✓');
    } catch (e) {
      if (mounted) showError(context, 'Gagal export: $e');
    }
  }

  Future<void> _exportPDF() async {
    try {
      await ExportService.exportLemburPDF(
        data: _filtered,
        namaProject: widget.project['nama_project'] as String? ?? 'Proyek',
      );
      if (mounted) showSuccess(context, 'PDF lembur berhasil dibuat ✓');
    } catch (e) {
      if (mounted) showError(context, 'Gagal export PDF: $e');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Column(children: [
          if (_cacheAge != null) CacheBadge(age: _cacheAge!),
          // Summary
          if (!_loading && _list.isNotEmpty)
            SlideUp(
                child: Container(
              color: context.cCard,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(children: [
                        _StatPill('Pending', _count('pending'),
                            AppColors.amber100, AppColors.amber800),
                        const SizedBox(width: 8),
                        _StatPill('Disetujui', _count('disetujui'),
                            AppColors.green100, AppColors.green800),
                        const SizedBox(width: 8),
                        _StatPill('Ditolak', _count('ditolak'),
                            AppColors.red100, AppColors.red800),
                      ]),
                    ),
                    if (_count('disetujui') > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 8, bottom: 4),
                        child: Text(
                            'Total disetujui: ${AppFormatter.durasi(_totalJam)} · ${AppFormatter.rupiah(_totalRp)}',
                            style:
                                TextStyle(fontSize: 16, color: context.cSub)),
                      ),
                  ]),
            )),
          // Alert: lembur pending menunggu persetujuan
          if (!_loading)
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 320),
              transitionBuilder: (child, anim) => SizeTransition(
                  sizeFactor:
                      CurvedAnimation(parent: anim, curve: Curves.easeOutCubic),
                  child: FadeTransition(opacity: anim, child: child)),
              child: _count('pending') > 0
                  ? AnimatedAlert(
                      key: const ValueKey('lembur-alert'),
                      title:
                          '${_count('pending')} ${context.s.pendingOvertimeAlert}',
                      message: context.s.pendingOvertimeSub,
                      variant: AlertVariant.warning,
                      pulsing: true,
                      delay: const Duration(milliseconds: 200),
                    )
                  : const SizedBox.shrink(key: ValueKey('lembur-alert-empty')),
            ),
          // Tabs
          Container(
              color: context.cCard,
              child: TabBar(
                controller: _tabs,
                labelColor: AppColors.brand600,
                unselectedLabelColor: context.cSub,
                indicatorColor: AppColors.brand600,
                indicatorWeight: 2.5,
                labelStyle:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                isScrollable: false,
                tabs: const [
                  Tab(text: 'Semua'),
                  Tab(text: 'Pending'),
                  Tab(text: 'Disetujui'),
                  Tab(text: 'Ditolak')
                ],
              )),
          Expanded(
              child: _loading
                  ? const ShimmerList()
                  : _filtered.isEmpty
                      ? AppEmpty(
                          message:
                              'Belum ada data lembur${_filterTab != 'semua' ? ' $_filterTab' : ''}.',
                          icon: Icons.access_time_outlined)
                      : RefreshIndicator(
                          color: AppColors.brand600,
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(12),
                            itemCount: _filtered.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 8),
                            itemBuilder: (ctx, i) => SlideUp(
                                delay: Duration(
                                    milliseconds: i * 40 > 200 ? 200 : i * 40),
                                child: _LemburCard(
                                    data: _filtered[i],
                                    onDelete: () => _delete(_filtered[i]))),
                          ))),
        ]),
        floatingActionButton: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FloatingActionButton.small(
              heroTag: 'lembur_xlsx',
              onPressed: _exportExcel,
              backgroundColor: AppColors.brand800,
              foregroundColor: Colors.white,
              child: const Icon(Icons.table_view_rounded, size: 20),
            ),
            const SizedBox(height: 8),
            FloatingActionButton.small(
              heroTag: 'lembur_pdf',
              onPressed: _exportPDF,
              backgroundColor: const Color(0xFFDC2626),
              foregroundColor: Colors.white,
              child: const Icon(Icons.picture_as_pdf_rounded, size: 20),
            ),
            const SizedBox(height: 8),
            FloatingActionButton.extended(
              heroTag: 'lembur_add',
              onPressed: _openForm,
              backgroundColor: AppColors.brand600,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Input Lembur',
                  style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );
}

class _StatPill extends StatelessWidget {
  final String label;
  final int val;
  final Color bg, fg;
  const _StatPill(this.label, this.val, this.bg, this.fg);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text('$val',
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w700, color: fg)),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 15, color: context.cSub)),
        ]),
      );
}

class _LemburCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback onDelete;
  const _LemburCard({required this.data, required this.onDelete});
  @override
  Widget build(BuildContext context) {
    final k = data['karyawan'] as Map<String, dynamic>? ?? {};
    final status = data['status_persetujuan'] as String? ?? 'pending';
    final durasi = (data['durasi_jam'] as num?)?.toDouble() ?? 0;
    final total = (data['total_lembur'] as num?)?.toDouble() ?? 0;
    return AppCard(
      padding: const EdgeInsets.all(13),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                  color: AppColors.amber100,
                  borderRadius: BorderRadius.circular(10)),
              child: Center(
                  child: Text(
                      (k['nama_karyawan'] as String? ?? '?')
                          .substring(0, 1)
                          .toUpperCase(),
                      style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                          color: AppColors.amber800)))),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(k['nama_karyawan'] ?? '-',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: context.cText)),
                Text(AppFormatter.tanggal(data['tanggal'] as String?),
                    style: TextStyle(fontSize: 15, color: context.cSub)),
              ])),
          StatusBadge(status: status),
          if (status == 'pending')
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'del') onDelete();
              },
              icon: Icon(Icons.more_vert, size: 18, color: context.cMuted),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              itemBuilder: (_) => [
                const PopupMenuItem(
                    value: 'del',
                    child: Row(children: [
                      Icon(Icons.delete_outline,
                          size: 16, color: Color(0xFFDC2626)),
                      SizedBox(width: 8),
                      Text('Hapus', style: TextStyle(color: Color(0xFFDC2626))),
                    ])),
              ],
            ),
        ]),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
              color: context.cSurface, borderRadius: BorderRadius.circular(8)),
          child: Row(children: [
            Expanded(
                child: _InfoItem(Icons.schedule_rounded,
                    '${AppFormatter.waktu(data['jam_mulai'])} – ${AppFormatter.waktu(data['jam_selesai'])}')),
            Expanded(
                child: _InfoItem(
                    Icons.timer_rounded, AppFormatter.durasi(durasi))),
            Expanded(
                child: _InfoItem(
                    Icons.payments_rounded, AppFormatter.rupiah(total))),
          ]),
        ),
        if (data['catatan'] != null &&
            (data['catatan'] as String).isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(data['catatan'] as String,
              style: TextStyle(
                  fontSize: 15,
                  color: context.cSub,
                  fontStyle: FontStyle.italic)),
        ],
      ]),
    );
  }
}

class _InfoItem extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoItem(this.icon, this.text);
  @override
  Widget build(BuildContext context) =>
      Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: AppColors.brand400),
        const SizedBox(width: 4),
        Flexible(
            child: Text(text,
                style: TextStyle(
                    fontSize: 16,
                    color: context.cText,
                    fontWeight: FontWeight.w500),
                overflow: TextOverflow.ellipsis)),
      ]);
}

// ── Lembur Form Sheet ─────────────────────────────────────────
class _LemburFormSheet extends StatefulWidget {
  final Map<String, dynamic> project;
  final List<Map<String, dynamic>> karyawan;
  final PayrollService svc;
  final VoidCallback onSaved;
  const _LemburFormSheet(
      {required this.project,
      required this.karyawan,
      required this.svc,
      required this.onSaved});
  @override
  State<_LemburFormSheet> createState() => _LemburFormSheetState();
}

class _LemburFormSheetState extends State<_LemburFormSheet> {
  final _formKey = GlobalKey<FormState>();
  Map<String, dynamic>? _selKaryawan;
  final _tanggalCtrl = TextEditingController(text: AppFormatter.today());
  final _mulaiCtrl = TextEditingController(text: '17:00');
  final _selesaiCtrl = TextEditingController(text: '20:00');
  final _catatanCtrl = TextEditingController();
  bool _saving = false;

  // Hitung durasi & tarif realtime (sesuai admin-web calculations.ts)
  double get _durasi {
    try {
      final mulai = _mulaiCtrl.text.split(':').map(int.parse).toList();
      final selesai = _selesaiCtrl.text.split(':').map(int.parse).toList();
      final mMulai = mulai[0] * 60 + mulai[1];
      final mSelesai = selesai[0] * 60 + selesai[1];
      final diff =
          mSelesai > mMulai ? mSelesai - mMulai : (1440 - mMulai) + mSelesai;
      return (diff / 60 * 100).roundToDouble() / 100;
    } catch (_) {
      return 0;
    }
  }

  double get _gajiHarian =>
      asNum((_selKaryawan?['jabatan'] as Map?)?['gaji_harian']).toDouble();

  double get _tarif => _gajiHarian / 8;
  double get _total => _tarif * _durasi;

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selKaryawan == null) {
      showError(context, context.s.selectEmployeeFirst);
      return;
    }
    if (_durasi <= 0) {
      showError(context, context.s.endAfterStart);
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.svc.createLembur({
        'project_id': widget.project['id'],
        'karyawan_id': _selKaryawan!['id'],
        'tanggal': _tanggalCtrl.text,
        'jam_mulai': '${_mulaiCtrl.text}:00',
        'jam_selesai': '${_selesaiCtrl.text}:00',
        'durasi_jam': _durasi,
        'tarif_lembur': _tarif.roundToDouble(),
        'total_lembur': _total.roundToDouble(),
        'catatan': _catatanCtrl.text,
        'status_persetujuan': 'pending',
        'gaji_harian': _gajiHarian,
      });
      widget.onSaved();
      if (mounted) showSuccess(context, context.s.overtimeAdded);
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.88,
        decoration: BoxDecoration(
            color: context.cSurface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(22))),
        child: Column(children: [
          sheetHandle(context),
          sheetTitle(context, 'Input Lembur',
              sub: widget.project['nama_project']),
          const Divider(height: 1),
          Expanded(
              child: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: Form(
                key: _formKey,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Karyawan
                      const FLabel('Karyawan', req: true),
                      AppDropdown<Map<String, dynamic>>(
                        value: _selKaryawan,
                        hint: 'Pilih karyawan...',
                        required: true,
                        items: widget.karyawan
                            .map((k) => AppDropdownItem(
                                  value: k,
                                  label: k['nama_karyawan'] as String? ?? '-',
                                  subtitle: (k['jabatan']
                                      as Map?)?['nama_jabatan'] as String?,
                                ))
                            .toList(),
                        onChanged: (v) => setState(() => _selKaryawan = v),
                      ),
                      const SizedBox(height: 14),

                      // Tanggal
                      const FLabel('Tanggal', req: true),
                      TextFormField(
                          controller: _tanggalCtrl,
                          decoration: fDeco(context,
                              hint: context.s.selectDateHint,
                              prefix: const Icon(Icons.calendar_today_outlined,
                                  size: 16)),
                          readOnly: true,
                          onTap: () async {
                            final d = await showDatePicker(
                                context: context,
                                initialDate: DateTime.parse(_tanggalCtrl.text),
                                firstDate: DateTime(2024),
                                lastDate: DateTime.now(),
                                builder: (ctx, c) => Theme(
                                    data: Theme.of(ctx).copyWith(
                                        colorScheme: const ColorScheme.light(
                                            primary: AppColors.brand600)),
                                    child: c!));
                            if (d != null) {
                              setState(() => _tanggalCtrl.text =
                                  d.toIso8601String().split('T')[0]);
                            }
                          }),
                      const SizedBox(height: 14),

                      // Jam
                      Row(children: [
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              FLabel(context.s.startTime, req: true),
                              TextFormField(
                                  controller: _mulaiCtrl,
                                  decoration: fDeco(context, hint: '17:00'),
                                  keyboardType: TextInputType.datetime,
                                  onChanged: (_) => setState(() {}),
                                  validator: (v) => (v?.isEmpty ?? true)
                                      ? context.s.requiredField
                                      : null),
                            ])),
                        const SizedBox(width: 12),
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              FLabel(context.s.endTime, req: true),
                              TextFormField(
                                  controller: _selesaiCtrl,
                                  decoration: fDeco(context, hint: '20:00'),
                                  keyboardType: TextInputType.datetime,
                                  onChanged: (_) => setState(() {}),
                                  validator: (v) => (v?.isEmpty ?? true)
                                      ? context.s.requiredField
                                      : null),
                            ])),
                      ]),
                      const SizedBox(height: 14),

                      // Preview kalkulasi (sesuai admin-web hitungGajiMingguan)
                      if (_selKaryawan != null && _durasi > 0)
                        ScaleIn(
                            child: Container(
                          padding: const EdgeInsets.all(13),
                          decoration: BoxDecoration(
                              color: AppColors.brand50,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppColors.brand200)),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(context.s.overtimeCalc,
                                    style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.brand700)),
                                const SizedBox(height: 8),
                                SumRow(context.s.dailyWage,
                                    AppFormatter.rupiah(_gajiHarian)),
                                SumRow(context.s.overtimeRate,
                                    AppFormatter.rupiah(_tarif)),
                                SumRow(context.s.durationLabel,
                                    AppFormatter.durasi(_durasi)),
                                const Divider(height: 12),
                                SumRow(context.s.totalOvertimeLabel,
                                    AppFormatter.rupiah(_total),
                                    bold: true, vc: AppColors.brand600),
                              ]),
                        )),
                      const SizedBox(height: 14),

                      const FLabel('Catatan'),
                      TextFormField(
                          controller: _catatanCtrl,
                          maxLines: 2,
                          decoration: fDeco(context,
                              hint: context.s.overtimeReasonHint)),
                      const SizedBox(height: 24),

                      SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton.icon(
                            onPressed: _saving ? null : _save,
                            icon: _saving
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 2))
                                : const Icon(Icons.save_rounded, size: 18),
                            label: Text(_saving
                                ? context.s.savingLabel
                                : context.s.saveLembur),
                            style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.brand600,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12))),
                          )),
                    ])),
          )),
        ]),
      );
}
