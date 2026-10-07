import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../services/payroll_service.dart';
import '../services/inventory_mandor_service.dart';
import '../services/connectivity_service.dart';
import '../services/cache_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/app_dropdown.dart';
import '../l10n/app_strings.dart';

class PermintaanScreen extends StatefulWidget {
  final UserModel user;
  final Map<String, dynamic> project;
  const PermintaanScreen(
      {super.key, required this.user, required this.project});
  @override
  State<PermintaanScreen> createState() => _PermintaanScreenState();
}

class _PermintaanScreenState extends State<PermintaanScreen>
    with SingleTickerProviderStateMixin {
  Timer? _refreshTimer;

  final _invSvc = InventoryMandorService();
  final _payrollSvc = PayrollService();
  List<Map<String, dynamic>> _list = [];
  List<Map<String, dynamic>> _stokKritis = [];
  bool _loading = true;
  String? _cacheAge;
  late TabController _tabs;
  String _jenis = 'permintaan'; // 'permintaan' | 'retur'

  String get _statusField =>
      _jenis == 'retur' ? 'status_retur' : 'status_permintaan';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _tabs.addListener(_onTabChanged);
    _load();
    _loadStokKritis();
  }

  @override
  void dispose() {
    _tabs.removeListener(_onTabChanged);
    _tabs.dispose();
    _refreshTimer?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(PermintaanScreen old) {
    super.didUpdateWidget(old);
    if (old.project['id'] != widget.project['id']) {
      _load();
      _loadStokKritis();
    }
  }

  // Stok kritis gudang pusat (global, bukan per-project) — sama seperti
  // MonitoringStok.jsx di admin-web (lihat FIX_GUDANG_PUSAT.sql)
  Future<void> _loadStokKritis() async {
    try {
      final barang = await _invSvc.getAllBarang();
      final kritis = barang.where((b) {
        final min = (b['stok_minimal'] as num?) ?? 0;
        final stok = (b['stok_saat_ini'] as num?) ?? 0;
        return min > 0 && stok <= min;
      }).toList();
      if (mounted) setState(() => _stokKritis = kritis);
    } catch (_) {
      // non-critical — banner cukup disembunyikan jika gagal dimuat
    }
  }

  void _onTabChanged() {
    // indexIsChanging = masih animating; kita reload saat sudah settled
    if (_tabs.indexIsChanging) return;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final pid = widget.project['id'] as int;
    final cacheKey = _jenis == 'retur' ? 'retur' : 'permintaan';
    if (ConnectivityService().isOffline) {
      final cached = await CacheService.getList(cacheKey, projectId: pid);
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
      final data = _jenis == 'retur'
          ? await _invSvc.getReturSaya(pid)
          : await _invSvc.getPermintaanSaya(pid);
      await CacheService.setList(cacheKey, data, projectId: pid);
      if (mounted) {
        setState(() {
          _list = data;
          _cacheAge = null;
          _loading = false;
        });
      }
    } catch (e) {
      final cached = await CacheService.getList(cacheKey, projectId: pid);
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

  void _setJenis(String jenis) {
    if (_jenis == jenis) return;
    setState(() {
      _jenis = jenis;
      _list = [];
    });
    _load();
  }

  List<Map<String, dynamic>> _byStatus(String s) =>
      _list.where((p) => p[_statusField] == s).toList();

  List<Map<String, dynamic>> get _tabList => switch (_tabs.index) {
        0 => _list,
        1 => _byStatus('pending'),
        2 => _byStatus('disetujui'),
        _ => _byStatus('ditolak'),
      };

  Future<void> _batalkan(Map<String, dynamic> item) async {
    final ok = await showConfirm(context,
        title: context.s.cancelRequestTitle,
        msg: context.s.cancelRequestMsg,
        danger: true);
    if (ok != true) return;
    try {
      if (_jenis == 'retur') {
        await _invSvc.batalRetur(item['id'] as int);
      } else {
        await _invSvc.batalPermintaan(item['id'] as int);
      }
      if (!mounted) return;
      showSuccess(context, context.s.requestCancelled);
      _load();
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    }
  }

  void _openForm({Map<String, dynamic>? presetBarang}) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _jenis == 'retur'
          ? _ReturFormSheet(
              project: widget.project,
              karyawan: {
                'id': widget.user.karyawanId,
                'nama': widget.user.namaLengkap
              },
              invSvc: _invSvc,
              onSaved: () {
                _load();
                Navigator.pop(context);
              })
          : _PermintaanFormSheet(
              project: widget.project,
              karyawan: {
                'id': widget.user.karyawanId,
                'nama': widget.user.namaLengkap
              },
              invSvc: _invSvc,
              payrollSvc: _payrollSvc,
              presetBarang: presetBarang,
              onSaved: () {
                _load();
                Navigator.pop(context);
              }));

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: Column(children: [
          if (_cacheAge != null) CacheBadge(age: _cacheAge!),
          // Toggle Permintaan / Retur
          Container(
            color: context.cCard,
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: Row(children: [
              Expanded(
                  child: _JenisTab(
                      label: 'Permintaan Barang',
                      selected: _jenis == 'permintaan',
                      onTap: () => _setJenis('permintaan'))),
              const SizedBox(width: 8),
              Expanded(
                  child: _JenisTab(
                      label: 'Retur / Sisa Barang',
                      selected: _jenis == 'retur',
                      onTap: () => _setJenis('retur'))),
            ]),
          ),
          // Stok Kritis — sama seperti alert dashboard admin-web
          if (_jenis == 'permintaan' && _stokKritis.isNotEmpty)
            Container(
              color: context.cCard,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: SizedBox(
                height: 64,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _stokKritis.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => _StokKritisChip(
                    data: _stokKritis[i],
                    onTap: () => _openForm(presetBarang: _stokKritis[i]),
                  ),
                ),
              ),
            ),
          // Summary chips
          if (!_loading && _list.isNotEmpty)
            Container(
              color: context.cCard,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  _StatusChip('Semua', _list.length, AppColors.brand100,
                      AppColors.brand700),
                  const SizedBox(width: 6),
                  _StatusChip('Pending', _byStatus('pending').length,
                      AppColors.amber100, AppColors.amber800),
                  const SizedBox(width: 6),
                  _StatusChip('Disetujui', _byStatus('disetujui').length,
                      AppColors.green100, AppColors.green800),
                  const SizedBox(width: 6),
                  _StatusChip('Ditolak', _byStatus('ditolak').length,
                      AppColors.red100, AppColors.red800),
                ]),
              ),
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
                  : _tabList.isEmpty
                      ? AppEmpty(
                          message: _jenis == 'retur'
                              ? 'Belum ada retur / sisa barang.'
                              : 'Belum ada permintaan barang.',
                          icon: Icons.inventory_2_outlined)
                      : RefreshIndicator(
                          color: AppColors.brand600,
                          onRefresh: _load,
                          child: ListView.separated(
                              padding: const EdgeInsets.all(12),
                              itemCount: _tabList.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 8),
                              itemBuilder: (ctx, i) => SlideUp(
                                  delay: Duration(
                                      milliseconds:
                                          i * 40 > 200 ? 200 : i * 40),
                                  child: _jenis == 'retur'
                                      ? _ReturCard(
                                          data: _tabList[i],
                                          onBatal: _tabList[i]
                                                      ['status_retur'] ==
                                                  'pending'
                                              ? () => _batalkan(_tabList[i])
                                              : null,
                                        )
                                      : _PermintaanCard(
                                          data: _tabList[i],
                                          onBatal: _tabList[i]
                                                      ['status_permintaan'] ==
                                                  'pending'
                                              ? () => _batalkan(_tabList[i])
                                              : null,
                                        ))))),
        ]),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _openForm,
          backgroundColor: AppColors.brand600,
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add_shopping_cart_rounded),
          label: Text(
              _jenis == 'retur' ? 'Ajukan Retur' : context.s.requestMaterialBtn,
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
      );
}

class _JenisTab extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _JenisTab(
      {required this.label, required this.selected, required this.onTap});
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: selected ? AppColors.brand600 : context.cSurface,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : context.cSub)),
        ),
      );
}

// Chip peringatan stok kritis — mirip alert "Stok Kritis" di dashboard admin-web
class _StokKritisChip extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback onTap;
  const _StokKritisChip({required this.data, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final satuan = (data['satuan_barang'] as Map?)?['singkatan'] ?? '';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 168,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.red50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.red100),
        ),
        child: Row(children: [
          const Icon(Icons.warning_amber_rounded,
              size: 18, color: AppColors.red600),
          const SizedBox(width: 8),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                Text(data['nama_barang'] ?? '-',
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.red800),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                Text('Sisa ${data['stok_saat_ini']} $satuan',
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.red600)),
              ])),
        ]),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final int count;
  final Color bg, fg;
  const _StatusChip(this.label, this.count, this.bg, this.fg);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
        child: Text('$label ($count)',
            style: TextStyle(
                fontSize: 15, fontWeight: FontWeight.w600, color: fg)),
      );
}

class _PermintaanCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback? onBatal;
  const _PermintaanCard({required this.data, this.onBatal});
  @override
  Widget build(BuildContext context) {
    final b = data['barang'] as Map<String, dynamic>? ?? {};
    final s = data['status_permintaan'] as String? ?? 'pending';
    final stok = b['stok_saat_ini'] as int? ?? 0;
    final diminta = data['jumlah_diminta'] as int? ?? 0;
    final satuan =
        (b['satuan_barang'] as Map<String, dynamic>?)?['singkatan'] ?? '';

    return AppCard(
      padding: const EdgeInsets.all(13),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                  color: AppColors.brand50,
                  borderRadius: BorderRadius.circular(11)),
              child: const Icon(Icons.inventory_2_outlined,
                  color: AppColors.brand500, size: 22)),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(b['nama_barang'] ?? '-',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: context.cText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                Text(
                    '${b['kode_barang'] ?? ''} · ${AppFormatter.tanggal(data['tanggal_permintaan'] as String?)}',
                    style: TextStyle(fontSize: 15, color: context.cSub)),
              ])),
          StatusBadge(status: s),
          if (onBatal != null) ...[
            const SizedBox(width: 4),
            IconButton(
              icon: const Icon(Icons.close_rounded,
                  size: 16, color: AppColors.red600),
              onPressed: onBatal,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              tooltip: 'Batalkan',
            ),
          ],
        ]),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
              color: context.cSurface, borderRadius: BorderRadius.circular(8)),
          child: Row(children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Jumlah Diminta',
                      style: TextStyle(fontSize: 14, color: context.cSub)),
                  Text('$diminta $satuan',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: context.cText)),
                ])),
            Container(width: 1, height: 36, color: context.cBorder),
            Expanded(
                child: Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(context.s.warehouseStock,
                              style:
                                  TextStyle(fontSize: 14, color: context.cSub)),
                          Text('$stok $satuan',
                              style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                  color: stok >= diminta
                                      ? AppColors.green600
                                      : AppColors.red600)),
                        ]))),
          ]),
        ),
        if (s == 'ditolak' && data['catatan'] != null) ...[
          const SizedBox(height: 8),
          InfoBanner('Ditolak: ${data['catatan']}',
              icon: Icons.cancel_outlined,
              bg: AppColors.red50,
              fg: AppColors.red600),
        ],
        if (s == 'disetujui') ...[
          const SizedBox(height: 8),
          InfoBanner(
              'Disetujui · ${AppFormatter.tanggal(data['tanggal_persetujuan'] as String?)}',
              icon: Icons.check_circle_outline_rounded,
              bg: AppColors.green50,
              fg: AppColors.green600),
        ],
      ]),
    );
  }
}

class _ReturCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback? onBatal;
  const _ReturCard({required this.data, this.onBatal});
  @override
  Widget build(BuildContext context) {
    final b = data['barang'] as Map<String, dynamic>? ?? {};
    final s = data['status_retur'] as String? ?? 'pending';
    final jumlah = data['jumlah_retur'] as int? ?? 0;
    final satuan =
        (b['satuan_barang'] as Map<String, dynamic>?)?['singkatan'] ?? '';

    return AppCard(
      padding: const EdgeInsets.all(13),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                  color: AppColors.brand50,
                  borderRadius: BorderRadius.circular(11)),
              child: const Icon(Icons.keyboard_return_rounded,
                  color: AppColors.brand500, size: 22)),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(b['nama_barang'] ?? '-',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: context.cText),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                Text(
                    '${b['kode_barang'] ?? ''} · ${AppFormatter.tanggal(data['tanggal_retur'] as String?)}',
                    style: TextStyle(fontSize: 15, color: context.cSub)),
              ])),
          StatusBadge(status: s),
          if (onBatal != null) ...[
            const SizedBox(width: 4),
            IconButton(
              icon: const Icon(Icons.close_rounded,
                  size: 16, color: AppColors.red600),
              onPressed: onBatal,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              tooltip: 'Batalkan',
            ),
          ],
        ]),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
              color: context.cSurface, borderRadius: BorderRadius.circular(8)),
          child: Row(children: [
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Jumlah Retur',
                      style: TextStyle(fontSize: 14, color: context.cSub)),
                  Text('$jumlah $satuan',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: context.cText)),
                ])),
          ]),
        ),
        if (s == 'ditolak' && data['catatan'] != null) ...[
          const SizedBox(height: 8),
          InfoBanner('Ditolak: ${data['catatan']}',
              icon: Icons.cancel_outlined,
              bg: AppColors.red50,
              fg: AppColors.red600),
        ],
        if (s == 'disetujui') ...[
          const SizedBox(height: 8),
          InfoBanner(
              'Disetujui · ${AppFormatter.tanggal(data['tanggal_persetujuan'] as String?)}',
              icon: Icons.check_circle_outline_rounded,
              bg: AppColors.green50,
              fg: AppColors.green600),
        ],
      ]),
    );
  }
}

// ── Permintaan Form Sheet ─────────────────────────────────────
class _PermintaanFormSheet extends StatefulWidget {
  final Map<String, dynamic> project, karyawan;
  final InventoryMandorService invSvc;
  final PayrollService payrollSvc;
  final Map<String, dynamic>? presetBarang;
  final VoidCallback onSaved;
  const _PermintaanFormSheet(
      {required this.project,
      required this.karyawan,
      required this.invSvc,
      required this.payrollSvc,
      this.presetBarang,
      required this.onSaved});
  @override
  State<_PermintaanFormSheet> createState() => _PermintaanFormSheetState();
}

class _PermintaanFormSheetState extends State<_PermintaanFormSheet> {
  final _formKey = GlobalKey<FormState>();
  List<Map<String, dynamic>> _barang = [];
  Map<String, dynamic>? _selBarang;
  final _jumlahCtrl = TextEditingController(text: '1');
  final _catatanCtrl = TextEditingController();
  bool _loadingBarang = true, _saving = false;

  @override
  void initState() {
    super.initState();
    _loadBarang();
  }

  Future<void> _loadBarang() async {
    try {
      final data = await widget.invSvc.getAllBarang(); // semua barang gudang
      if (mounted) {
        setState(() {
          _barang = data;
          _loadingBarang = false;
          final presetId = widget.presetBarang?['id'];
          if (presetId != null) {
            _selBarang = data.where((b) => b['id'] == presetId).firstOrNull;
          }
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingBarang = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selBarang == null) {
      showError(context, context.s.selectMaterialHint);
      return;
    }
    final jumlah = int.tryParse(_jumlahCtrl.text) ?? 0;
    if (jumlah <= 0) {
      showError(context, context.s.quantityPositive);
      return;
    }

    setState(() => _saving = true);
    try {
      await widget.invSvc.createPermintaan({
        'project_id': widget.project['id'],
        'barang_id': _selBarang!['id'],
        'jumlah_diminta': jumlah,
        'peminta_id': widget.karyawan['id'],
        'status_permintaan': 'pending',
        'tanggal_permintaan': AppFormatter.today(),
        'catatan': _catatanCtrl.text,
      });
      widget.onSaved();
      if (mounted) showSuccess(context, context.s.requestSent);
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.78,
        decoration: BoxDecoration(
            color: context.cSurface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(22))),
        child: Column(children: [
          sheetHandle(context),
          sheetTitle(context, 'Minta Barang ke Gudang',
              sub: widget.project['nama_project']),
          const Divider(height: 1),
          Expanded(
              child: _loadingBarang
                  ? const ShimmerList()
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(18),
                      child: Form(
                          key: _formKey,
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                FLabel(context.s.requestedMaterial, req: true),
                                AppDropdown<Map<String, dynamic>>(
                                  value: _selBarang,
                                  hint: context.s.selectMaterialHint,
                                  required: true,
                                  items: _barang.map((b) {
                                    final stok =
                                        b['stok_saat_ini'] as int? ?? 0;
                                    final satuan = (b['satuan_barang']
                                            as Map?)?['singkatan'] ??
                                        '';
                                    return AppDropdownItem(
                                      value: b,
                                      label: b['nama_barang'] as String? ?? '-',
                                      subtitle:
                                          '${context.s.stockLabel}$stok $satuan',
                                    );
                                  }).toList(),
                                  onChanged: (v) =>
                                      setState(() => _selBarang = v),
                                ),
                                // Stok info
                                if (_selBarang != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 12, vertical: 8),
                                        decoration: BoxDecoration(
                                            color: AppColors.brand50,
                                            borderRadius:
                                                BorderRadius.circular(8)),
                                        child: Row(children: [
                                          const Icon(Icons.inventory_2_rounded,
                                              size: 15,
                                              color: AppColors.brand500),
                                          const SizedBox(width: 6),
                                          Text(
                                              '${context.s.availableStock}${_selBarang!['stok_saat_ini']} ${((_selBarang!['satuan_barang'] as Map?)?['singkatan'] ?? '')}',
                                              style: const TextStyle(
                                                  fontSize: 16,
                                                  color: AppColors.brand700,
                                                  fontWeight: FontWeight.w600)),
                                        ])),
                                  ),
                                const SizedBox(height: 14),
                                const FLabel('Jumlah Diminta', req: true),
                                TextFormField(
                                  controller: _jumlahCtrl,
                                  keyboardType: TextInputType.number,
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly
                                  ],
                                  decoration: fDeco(context, hint: '1'),
                                  validator: (v) {
                                    if (v == null || v.isEmpty) {
                                      return context.s.requiredField;
                                    }
                                    final j = int.tryParse(v) ?? 0;
                                    if (j <= 0) {
                                      return context.s.quantityPositive;
                                    }
                                    return null;
                                  },
                                ),
                                const SizedBox(height: 14),
                                FLabel(context.s.notesDescLabel),
                                TextFormField(
                                    controller: _catatanCtrl,
                                    maxLines: 2,
                                    decoration: fDeco(context,
                                        hint: context.s.purposeHint)),
                                const SizedBox(height: 24),
                                SizedBox(
                                    width: double.infinity,
                                    height: 48,
                                    child: ElevatedButton.icon(
                                      onPressed: _saving ? null : _submit,
                                      icon: _saving
                                          ? const SizedBox(
                                              width: 18,
                                              height: 18,
                                              child: CircularProgressIndicator(
                                                  color: Colors.white,
                                                  strokeWidth: 2))
                                          : const Icon(Icons.send_rounded,
                                              size: 18),
                                      label: Text(_saving
                                          ? context.s.sendingLabel
                                          : context.s.sendRequest),
                                      style: ElevatedButton.styleFrom(
                                          backgroundColor: AppColors.brand600,
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(12))),
                                    )),
                              ])))),
        ]),
      );
}

// ── Retur / Sisa Barang Form Sheet ────────────────────────────
class _ReturFormSheet extends StatefulWidget {
  final Map<String, dynamic> project, karyawan;
  final InventoryMandorService invSvc;
  final VoidCallback onSaved;
  const _ReturFormSheet(
      {required this.project,
      required this.karyawan,
      required this.invSvc,
      required this.onSaved});
  @override
  State<_ReturFormSheet> createState() => _ReturFormSheetState();
}

class _ReturFormSheetState extends State<_ReturFormSheet> {
  final _formKey = GlobalKey<FormState>();
  List<Map<String, dynamic>> _barangDikirim = [];
  Map<String, dynamic>? _selBarang;
  final _jumlahCtrl = TextEditingController(text: '1');
  final _catatanCtrl = TextEditingController();
  bool _loadingBarang = true, _saving = false;

  @override
  void initState() {
    super.initState();
    _loadBarang();
  }

  Future<void> _loadBarang() async {
    try {
      final data = await widget.invSvc
          .getBarangDikirimKeProject(widget.project['id'] as int);
      if (mounted) {
        setState(() {
          _barangDikirim = data;
          _loadingBarang = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingBarang = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selBarang == null) {
      showError(context, 'Pilih barang yang akan diretur.');
      return;
    }
    final jumlah = int.tryParse(_jumlahCtrl.text) ?? 0;
    if (jumlah <= 0) {
      showError(context, context.s.quantityPositive);
      return;
    }

    setState(() => _saving = true);
    try {
      await widget.invSvc.createRetur({
        'project_id': widget.project['id'],
        'barang_id': _selBarang!['barang_id'],
        'jumlah_retur': jumlah,
        'pengembali_id': widget.karyawan['id'],
        'status_retur': 'pending',
        'tanggal_retur': AppFormatter.today(),
        'catatan': _catatanCtrl.text,
      });
      widget.onSaved();
      if (mounted) showSuccess(context, 'Retur diajukan');
    } catch (e) {
      if (mounted) showError(context, e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.78,
        decoration: BoxDecoration(
            color: context.cSurface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(22))),
        child: Column(children: [
          sheetHandle(context),
          sheetTitle(context, 'Retur / Sisa Barang ke Gudang',
              sub: widget.project['nama_project']),
          const Divider(height: 1),
          Expanded(
              child: _loadingBarang
                  ? const ShimmerList()
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(18),
                      child: Form(
                          key: _formKey,
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const FLabel('Barang', req: true),
                                AppDropdown<Map<String, dynamic>>(
                                  value: _selBarang,
                                  hint: _barangDikirim.isEmpty
                                      ? 'Belum ada barang yang dikirim ke project ini'
                                      : 'Pilih barang...',
                                  required: true,
                                  items: _barangDikirim.map((b) {
                                    final barang =
                                        b['barang'] as Map<String, dynamic>? ??
                                            {};
                                    final totalDikirim =
                                        b['total_dikirim'] as int? ?? 0;
                                    final satuan = (barang['satuan_barang']
                                            as Map?)?['singkatan'] ??
                                        '';
                                    return AppDropdownItem(
                                      value: b,
                                      label: barang['nama_barang'] as String? ??
                                          '-',
                                      subtitle:
                                          'Dikirim: $totalDikirim $satuan',
                                    );
                                  }).toList(),
                                  onChanged: (v) =>
                                      setState(() => _selBarang = v),
                                ),
                                const SizedBox(height: 14),
                                const FLabel('Jumlah Sisa / Retur', req: true),
                                TextFormField(
                                  controller: _jumlahCtrl,
                                  keyboardType: TextInputType.number,
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly
                                  ],
                                  decoration: fDeco(context, hint: '1'),
                                  validator: (v) {
                                    if (v == null || v.isEmpty) {
                                      return context.s.requiredField;
                                    }
                                    final j = int.tryParse(v) ?? 0;
                                    if (j <= 0) {
                                      return context.s.quantityPositive;
                                    }
                                    return null;
                                  },
                                ),
                                const SizedBox(height: 14),
                                FLabel(context.s.notesDescLabel),
                                TextFormField(
                                    controller: _catatanCtrl,
                                    maxLines: 2,
                                    decoration: fDeco(context,
                                        hint: 'Alasan retur / sisa barang...')),
                                const SizedBox(height: 24),
                                SizedBox(
                                    width: double.infinity,
                                    height: 48,
                                    child: ElevatedButton.icon(
                                      onPressed: _saving ? null : _submit,
                                      icon: _saving
                                          ? const SizedBox(
                                              width: 18,
                                              height: 18,
                                              child: CircularProgressIndicator(
                                                  color: Colors.white,
                                                  strokeWidth: 2))
                                          : const Icon(Icons.send_rounded,
                                              size: 18),
                                      label: Text(_saving
                                          ? context.s.sendingLabel
                                          : 'Ajukan Retur'),
                                      style: ElevatedButton.styleFrom(
                                          backgroundColor: AppColors.brand600,
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(12))),
                                    )),
                              ])))),
        ]),
      );
}
