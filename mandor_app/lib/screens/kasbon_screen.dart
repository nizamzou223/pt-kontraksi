import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../services/payroll_service.dart';
import '../services/export_service.dart';
import '../services/connectivity_service.dart';
import '../services/cache_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/app_dropdown.dart';
import '../l10n/app_strings.dart';

class KasbonScreen extends StatefulWidget {
  final UserModel user;
  final Map<String, dynamic> project;
  const KasbonScreen({super.key, required this.user, required this.project});
  @override
  State<KasbonScreen> createState() => _KasbonScreenState();
}

class _KasbonScreenState extends State<KasbonScreen> {
  Timer? _refreshTimer;

  final _svc = PayrollService();
  List<Map<String, dynamic>> _list = [];
  List<Map<String, dynamic>> _karyawan = [];
  bool _loading = true;
  String _filter = 'semua'; // semua | belum_lunas | lunas
  String _searchQ = '';
  String? _cacheAge; // non-null when showing cached data

  @override
  void initState() {
    super.initState();
    _load();
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) _load();
    });
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final pid = widget.project['id'] as int;
    final offline = ConnectivityService().isOffline;
    if (offline) {
      final cached = await CacheService.getList('kasbon', projectId: pid);
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
      final list = await _svc.getKasbon(projectId: pid);
      final karyawan = await _svc.getAllKaryawan();
      await CacheService.setList('kasbon', list, projectId: pid);
      if (mounted) {
        setState(() {
          _list = list;
          _karyawan = karyawan;
          _cacheAge = null;
          _loading = false;
        });
      }
    } catch (e) {
      // Network error — try cache
      final cached = await CacheService.getList('kasbon', projectId: pid);
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

  // ── Stats sesuai admin-web ──────────────────────────────────
  double get _outstanding => _list
      .where((k) => k['status_lunas'] == false)
      .fold(0.0, (s, k) => s + ((k['sisa_kasbon'] as num?) ?? 0).toDouble());
  int get _outstandingCount =>
      _list.where((k) => k['status_lunas'] == false).length;
  double get _totalKasbon => _list.fold(
      0.0, (s, k) => s + ((k['jumlah_kasbon'] as num?) ?? 0).toDouble());
  int get _totalCount => _list.length;
  double get _totalLunas => _totalKasbon - _outstanding;
  int get _lunasCount => _list.where((k) => k['status_lunas'] == true).length;

  List<Map<String, dynamic>> get _filtered {
    var l = _list;
    if (_filter == 'belum_lunas') {
      l = l.where((k) => k['status_lunas'] == false).toList();
    }
    if (_filter == 'lunas') {
      l = l.where((k) => k['status_lunas'] == true).toList();
    }
    if (_searchQ.trim().isNotEmpty) {
      final q = _searchQ.toLowerCase();
      l = l.where((k) {
        final nama =
            ((k['karyawan'] as Map?)?['nama_karyawan'] as String? ?? '')
                .toLowerCase();
        final nik =
            ((k['karyawan'] as Map?)?['nik'] as String? ?? '').toLowerCase();
        return nama.contains(q) || nik.contains(q);
      }).toList();
    }
    return l;
  }

  void _openForm() => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _KasbonFormSheet(
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
        title: context.s.deleteKasbon,
        msg:
            '${context.s.confirmDeleteKasbon}${(item['karyawan'] as Map?)?['nama_karyawan'] ?? '-'} '
            '${AppFormatter.rupiah(item['jumlah_kasbon'])}?',
        danger: true);
    if (ok != true) return;
    try {
      await _svc.deleteKasbon((item['id'] as num).toInt());
      if (!mounted) return;
      showSuccess(context, context.s.kasbonDeleted);
      _load();
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _exportExcel() async {
    try {
      await ExportService.exportKasbonExcel(data: _filtered);
      if (mounted) showSuccess(context, 'Excel kasbon berhasil dibuat ✓');
    } catch (e) {
      if (mounted) showError(context, 'Gagal export: $e');
    }
  }

  Future<void> _exportPDF() async {
    try {
      await ExportService.exportKasbonPDF(
        data: _filtered,
        namaProject: widget.project['nama_project'] as String? ?? 'Proyek',
      );
      if (mounted) showSuccess(context, 'PDF kasbon berhasil dibuat ✓');
    } catch (e) {
      if (mounted) showError(context, 'Gagal export PDF: $e');
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Column(children: [
        if (_cacheAge != null) CacheBadge(age: _cacheAge!),
        // ── Summary header — persis admin-web ────────────────
        if (!_loading) SlideUp(child: _buildSummary(context)),

        // ── Alert: kasbon belum lunas ─────────────────────────
        if (!_loading)
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 320),
            transitionBuilder: (child, anim) => SizeTransition(
                sizeFactor:
                    CurvedAnimation(parent: anim, curve: Curves.easeOutCubic),
                child: FadeTransition(opacity: anim, child: child)),
            child: _outstanding > 0
                ? AnimatedAlert(
                    key: const ValueKey('kasbon-alert'),
                    title: '$_outstandingCount Kasbon Belum Lunas',
                    message:
                        'Total outstanding: ${AppFormatter.rupiah(_outstanding)}',
                    variant: AlertVariant.warning,
                    pulsing: true,
                    delay: const Duration(milliseconds: 200),
                  )
                : const SizedBox.shrink(key: ValueKey('kasbon-alert-empty')),
          ),

        // ── Search bar ───────────────────────────────────────
        Container(
          color: context.cCard,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: TextField(
            onChanged: (v) => setState(() => _searchQ = v),
            decoration: fDeco(
              context,
              hint: context.s.searchEmpNIK,
              prefix:
                  Icon(Icons.search_rounded, size: 17, color: context.cMuted),
            ).copyWith(
                contentPadding:
                    const EdgeInsets.symmetric(vertical: 9, horizontal: 13)),
          ),
        ),

        // ── Filter chips ─────────────────────────────────────
        Container(
          color: context.cCard,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              _chip('Semua', 'semua', _totalCount),
              const SizedBox(width: 6),
              _chip('Belum Lunas', 'belum_lunas', _outstandingCount,
                  color: AppColors.amber600, bg: AppColors.amber100),
              const SizedBox(width: 6),
              _chip('Lunas', 'lunas',
                  _list.where((k) => k['status_lunas'] == true).length,
                  color: AppColors.green600, bg: AppColors.green100),
            ]),
          ),
        ),

        // ── List ─────────────────────────────────────────────
        Expanded(
          child: _loading
              ? const ShimmerList()
              : _filtered.isEmpty
                  ? AppEmpty(
                      message: 'Belum ada kasbon'
                          '${_filter != 'semua' ? ' ${_filter == 'belum_lunas' ? 'yang belum lunas' : 'yang sudah lunas'}' : ''}.',
                      icon: Icons.account_balance_wallet_outlined)
                  : RefreshIndicator(
                      color: AppColors.brand600,
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 10, 12, 90),
                        itemCount: _filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (ctx, i) => SlideUp(
                            delay: Duration(
                                milliseconds: i * 45 > 200 ? 200 : i * 45),
                            child: _KasbonCard(
                              data: _filtered[i],
                              onDelete: () => _delete(_filtered[i]),
                            )),
                      )),
        ),
      ]),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FloatingActionButton.small(
            heroTag: 'kasbon_xlsx',
            onPressed: _exportExcel,
            backgroundColor: AppColors.brand800,
            foregroundColor: Colors.white,
            child: const Icon(Icons.table_view_rounded, size: 20),
          ),
          const SizedBox(height: 8),
          FloatingActionButton.small(
            heroTag: 'kasbon_pdf',
            onPressed: _exportPDF,
            backgroundColor: const Color(0xFFDC2626),
            foregroundColor: Colors.white,
            child: const Icon(Icons.picture_as_pdf_rounded, size: 20),
          ),
          const SizedBox(height: 8),
          FloatingActionButton.extended(
            heroTag: 'kasbon_add',
            onPressed: _openForm,
            backgroundColor: AppColors.brand600,
            foregroundColor: Colors.white,
            icon: const Icon(Icons.add_rounded),
            label: const Text('+ Ajukan Kasbon',
                style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  // ── Summary — OUTSTANDING + TOTAL + SUDAH LUNAS, 3 kartu seperti web ────
  Widget _buildSummary(BuildContext context) {
    final outstandingColor =
        _outstanding > 0 ? AppColors.red600 : AppColors.green600;
    final outstandingBg =
        _outstanding > 0 ? AppColors.red50 : AppColors.green50;
    final outstandingBorder =
        _outstanding > 0 ? AppColors.red100 : AppColors.green100;
    return Container(
      color: context.cCard,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(children: [
        Expanded(
            child: _SummaryTile(
          label: 'OUTSTANDING',
          value: AppFormatter.rupiah(_outstanding),
          sub: '$_outstandingCount kasbon',
          color: outstandingColor,
          bg: outstandingBg,
          border: outstandingBorder,
        )),
        const SizedBox(width: 8),
        Expanded(
            child: _SummaryTile(
          label: 'TOTAL KASBON',
          value: AppFormatter.rupiah(_totalKasbon),
          sub: '$_totalCount transaksi',
          color: AppColors.brand700,
          bg: AppColors.brand50,
          border: AppColors.brand100,
        )),
        const SizedBox(width: 8),
        Expanded(
            child: _SummaryTile(
          label: 'SUDAH LUNAS',
          value: AppFormatter.rupiah(_totalLunas),
          sub: '$_lunasCount lunas',
          color: AppColors.green600,
          bg: AppColors.green50,
          border: AppColors.green100,
        )),
      ]),
    );
  }

  Widget _chip(
    String label,
    String value,
    int count, {
    Color color = AppColors.brand600,
    Color bg = AppColors.brand50,
  }) {
    final sel = _filter == value;
    return GestureDetector(
      onTap: () => setState(() => _filter = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: sel ? color : context.cCard,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: sel ? color : context.cBorder),
        ),
        child: Text('$label ($count)',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: sel ? Colors.white : context.cSub)),
      ),
    );
  }
}

// ── Kartu ringkasan kecil (OUTSTANDING / TOTAL / SUDAH LUNAS) ──
class _SummaryTile extends StatelessWidget {
  final String label, value, sub;
  final Color color, bg, border;
  const _SummaryTile({
    required this.label,
    required this.value,
    required this.sub,
    required this.color,
    required this.bg,
    required this.border,
  });

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: color)),
          const SizedBox(height: 4),
          FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  style: TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      color: color))),
          const SizedBox(height: 2),
          Text(sub,
              style:
                  TextStyle(fontSize: 14, color: color.withValues(alpha: 0.7))),
        ]),
      );
}

// ══════════════════════════════════════════════════════════════
// KASBON CARD
// ══════════════════════════════════════════════════════════════
class _KasbonCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback onDelete;
  const _KasbonCard({required this.data, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    final k = data['karyawan'] as Map<String, dynamic>? ?? {};
    final proj = data['project'] as Map<String, dynamic>? ?? {};
    final lunas = data['status_lunas'] as bool? ?? false;
    final jumlah = (data['jumlah_kasbon'] as num? ?? 0).toDouble();
    final sisa = (data['sisa_kasbon'] as num? ?? 0).toDouble();
    final pct = jumlah > 0 ? ((jumlah - sisa) / jumlah).clamp(0.0, 1.0) : 1.0;

    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(13, 12, 8, 8),
          child: Row(children: [
            Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                    color: lunas ? AppColors.green100 : AppColors.brand50,
                    borderRadius: BorderRadius.circular(10)),
                child: Center(
                    child: Text(
                        (k['nama_karyawan'] as String? ?? '?')[0].toUpperCase(),
                        style: TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            color: lunas
                                ? AppColors.green800
                                : AppColors.brand700)))),
            const SizedBox(width: 10),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(k['nama_karyawan'] ?? '-',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: context.cText)),
                  Text(
                      '${k['nik'] ?? k['id_karyawan'] ?? ''} · ${proj['kode_project'] ?? proj['nama_project'] ?? '-'}',
                      style: TextStyle(fontSize: 14, color: context.cSub)),
                ])),
            StatusBadge(status: lunas ? 'lunas' : 'pending'),
            const SizedBox(width: 2),
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'del') onDelete();
              },
              icon: Icon(Icons.more_vert_rounded,
                  size: 18, color: context.cMuted),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              itemBuilder: (_) => [
                const PopupMenuItem(
                    value: 'del',
                    child: Row(children: [
                      Icon(Icons.delete_outline,
                          size: 16, color: AppColors.red600),
                      SizedBox(width: 8),
                      Text('Hapus', style: TextStyle(color: AppColors.red600)),
                    ])),
              ],
            ),
          ]),
        ),

        // Info grid
        Container(
          margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
              color: context.cSurface,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: context.cBorder)),
          child: Column(children: [
            // Baris 1: Tanggal + Metode
            Row(children: [
              Expanded(
                  child: _cell(
                      context,
                      Icons.calendar_today_outlined,
                      context.cMuted,
                      'Tanggal',
                      AppFormatter.tanggal(data['tanggal_kasbon'] as String?))),
              const SizedBox(width: 12),
              Expanded(
                  child: _cell(
                      context,
                      Icons.swap_horiz_rounded,
                      context.cMuted,
                      'Metode',
                      context.s.salaryDeduction)), // hanya potong gaji
            ]),
            const SizedBox(height: 10),
            // Baris 2: Jumlah + Sisa (highlight)
            Row(children: [
              Expanded(
                  child: _cell(
                      context,
                      Icons.payments_outlined,
                      AppColors.brand500,
                      context.s.kasbonAmountLabel,
                      AppFormatter.rupiah(jumlah),
                      bold: true)),
              const SizedBox(width: 12),
              Expanded(
                  child: _cell(
                      context,
                      Icons.account_balance_outlined,
                      lunas ? AppColors.green600 : AppColors.red600,
                      context.s.outstandingBalance,
                      AppFormatter.rupiah(sisa),
                      bold: true,
                      valueColor:
                          lunas ? AppColors.green600 : AppColors.red600)),
            ]),
            // Progress terbayar
            if (!lunas) ...[
              const SizedBox(height: 10),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text(
                    '${context.s.paidLabel} ${(pct * 100).toStringAsFixed(0)}%',
                    style: TextStyle(fontSize: 14, color: context.cMuted)),
                Text(AppFormatter.rupiah(jumlah - sisa),
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.brand600)),
              ]),
              const SizedBox(height: 4),
              ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                      value: pct,
                      backgroundColor: context.cBorder,
                      valueColor: AlwaysStoppedAnimation<Color>(
                          pct >= 1.0 ? AppColors.green500 : AppColors.brand600),
                      minHeight: 5)),
            ],
            // Catatan jika ada
            if (data['catatan'] != null &&
                (data['catatan'] as String).trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                decoration: BoxDecoration(
                    color: AppColors.amber50,
                    borderRadius: BorderRadius.circular(7),
                    border: Border.all(color: AppColors.amber100)),
                child: Row(children: [
                  const Icon(Icons.notes_rounded,
                      size: 13, color: AppColors.amber600),
                  const SizedBox(width: 5),
                  Expanded(
                      child: Text(data['catatan'] as String,
                          style: const TextStyle(
                              fontSize: 15, color: AppColors.amber800),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis)),
                ]),
              ),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _cell(BuildContext context, IconData icon, Color iconColor,
          String label, String value,
          {bool bold = false, Color? valueColor}) =>
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 13, color: iconColor)),
        const SizedBox(width: 5),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 14, color: context.cMuted)),
          const SizedBox(height: 1),
          Text(value,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
                  color: valueColor ?? context.cText),
              maxLines: 1,
              overflow: TextOverflow.ellipsis),
        ])),
      ]);
}

// ══════════════════════════════════════════════════════════════
// KASBON FORM SHEET — hanya metode Potong Gaji (sesuai web)
// ══════════════════════════════════════════════════════════════
class _KasbonFormSheet extends StatefulWidget {
  final Map<String, dynamic> project;
  final List<Map<String, dynamic>> karyawan;
  final PayrollService svc;
  final VoidCallback onSaved;
  const _KasbonFormSheet({
    required this.project,
    required this.karyawan,
    required this.svc,
    required this.onSaved,
  });
  @override
  State<_KasbonFormSheet> createState() => _KasbonFormSheetState();
}

class _KasbonFormSheetState extends State<_KasbonFormSheet> {
  final _formKey = GlobalKey<FormState>();
  Map<String, dynamic>? _selKaryawan;
  final _jumlahCtrl = TextEditingController();
  final _tanggalCtrl = TextEditingController(text: AppFormatter.today());
  final _catatanCtrl = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _jumlahCtrl.dispose();
    _tanggalCtrl.dispose();
    _catatanCtrl.dispose();

    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selKaryawan == null) {
      showError(context, context.s.selectEmployeeFirst);
      return;
    }
    final jumlah = double.tryParse(_jumlahCtrl.text.replaceAll('.', '')) ?? 0;
    if (jumlah <= 0) {
      showError(context, context.s.kasbonAmountPositive);
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.svc.createKasbon({
        'project_id': widget.project['id'],
        'karyawan_id': _selKaryawan!['id'],
        'jumlah_kasbon': jumlah,
        'sisa_kasbon': jumlah,
        'metode_pembayaran': 'potong_gaji', // selalu potong gaji sesuai web
        'tanggal_kasbon': _tanggalCtrl.text,
        'catatan': _catatanCtrl.text.trim(),
        'status_lunas': false,
      });
      widget.onSaved();
      if (mounted) showSuccess(context, context.s.kasbonAdded);
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.82,
        decoration: BoxDecoration(
            color: context.cSurface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(24))),
        child: Column(children: [
          sheetHandle(context),
          sheetTitle(context, 'Ajukan Kasbon',
              sub: widget.project['nama_project']),
          const Divider(height: 1),
          Expanded(
              child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
                18, 16, 18, MediaQuery.of(context).viewInsets.bottom + 20),
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
                        items: widget.karyawan
                            .map((k) => AppDropdownItem(
                                  value: k,
                                  label: k['nama_karyawan'] as String? ?? '-',
                                  subtitle:
                                      '${k['nik'] ?? k['id_karyawan'] ?? ''} · ${(k['jabatan'] as Map?)?['nama_jabatan'] ?? '-'}',
                                ))
                            .toList(),
                        onChanged: (v) => setState(() => _selKaryawan = v),
                      ),
                      const SizedBox(height: 14),

                      // Jumlah
                      FLabel(context.s.kasbonAmountInput, req: true),
                      TextFormField(
                        controller: _jumlahCtrl,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly
                        ],
                        decoration: fDeco(context,
                                hint: context.s.kasbonAmountHint)
                            .copyWith(
                                prefixIcon: const Padding(
                                    padding: EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 13),
                                    child: Text('Rp',
                                        style: TextStyle(
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.brand600,
                                            fontSize: 16)))),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? context.s.requiredField
                            : null,
                      ),
                      const SizedBox(height: 14),

                      // Tanggal
                      const FLabel('Tanggal', req: true),
                      TextFormField(
                          controller: _tanggalCtrl,
                          readOnly: true,
                          decoration: fDeco(context,
                              hint: context.s.selectDateHint,
                              prefix: const Icon(Icons.calendar_today_outlined,
                                  size: 16, color: AppColors.brand500)),
                          onTap: () async {
                            final d = await showDatePicker(
                                context: context,
                                initialDate:
                                    DateTime.tryParse(_tanggalCtrl.text) ??
                                        DateTime.now(),
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

                      // Metode — info only, tidak bisa diubah (sesuai web)
                      FLabel(context.s.paymentMethod),
                      Container(
                        padding: const EdgeInsets.all(13),
                        decoration: BoxDecoration(
                            color: AppColors.brand50,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppColors.brand200)),
                        child: Row(children: [
                          Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                  color: AppColors.brand600,
                                  borderRadius: BorderRadius.circular(8)),
                              child: const Icon(Icons.money_off_rounded,
                                  size: 18, color: Colors.white)),
                          const SizedBox(width: 12),
                          Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(context.s.salaryDeduction,
                                    style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.brand700)),
                                Text(context.s.salaryDeductionDesc,
                                    style: const TextStyle(
                                        fontSize: 15,
                                        color: AppColors.brand600)),
                              ])),
                          const Icon(Icons.check_circle_rounded,
                              color: AppColors.brand600, size: 18),
                        ]),
                      ),
                      const SizedBox(height: 14),

                      // Catatan
                      const FLabel('Catatan'),
                      TextFormField(
                          controller: _catatanCtrl,
                          maxLines: 2,
                          decoration:
                              fDeco(context, hint: context.s.kasbonNotesHint)),
                      const SizedBox(height: 24),

                      SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton.icon(
                            onPressed: _saving ? null : _save,
                            style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.brand600,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12))),
                            icon: _saving
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 2))
                                : const Icon(Icons.save_rounded, size: 18),
                            label: Text(
                                _saving
                                    ? context.s.savingLabel
                                    : context.s.saveKasbon,
                                style: const TextStyle(
                                    fontSize: 17, fontWeight: FontWeight.w700)),
                          )),
                    ])),
          )),
        ]),
      );
}
