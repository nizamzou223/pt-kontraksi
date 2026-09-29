import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/auth_service.dart';
import '../services/payroll_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/app_dropdown.dart';
import '../l10n/app_strings.dart';

class KaryawanScreen extends StatefulWidget {
  final UserModel user;
  const KaryawanScreen({super.key, required this.user});

  @override
  State<KaryawanScreen> createState() => _KaryawanScreenState();
}

class _KaryawanScreenState extends State<KaryawanScreen> {
  final _svc = PayrollService();

  List<Map<String, dynamic>> _list = [];
  List<Map<String, dynamic>> _jabatanList = [];
  List<Map<String, dynamic>> _departemenList = [];
  bool _loading = true;
  String _searchQ = '';
  String _filterStatus = 'semua'; // semua | aktif | nonaktif

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _svc.getAllKaryawanFull(),
        _svc.getJabatan(),
        _svc.getDepartemen(),
      ]);
      if (!mounted) return;
      setState(() {
        _list = results[0];
        _jabatanList = results[1];
        _departemenList = results[2];
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        showError(context, e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  List<Map<String, dynamic>> get _filtered {
    return _list.where((k) {
      final nama = (k['nama_karyawan'] ?? '').toString().toLowerCase();
      final nik = (k['nik'] ?? k['id_karyawan'] ?? '').toString().toLowerCase();
      final golongan = ((k['jabatan'] as Map?)?['nama_jabatan'] ?? '').toString().toLowerCase();
      final q = _searchQ.toLowerCase();
      final matchSearch = q.isEmpty || nama.contains(q) || nik.contains(q) || golongan.contains(q);
      final matchStatus = _filterStatus == 'semua' ||
          (_filterStatus == 'aktif' && k['status_aktif'] == true) ||
          (_filterStatus == 'nonaktif' && k['status_aktif'] != true);
      return matchSearch && matchStatus;
    }).toList();
  }

  void _openForm({Map<String, dynamic>? editData}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _KaryawanFormSheet(
        jabatanList: _jabatanList,
        departemenList: _departemenList,
        editData: editData,
        onSaved: () {
          Navigator.pop(context);
          _load();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final aktifCount = _list.where((k) => k['status_aktif'] == true).length;

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: RefreshIndicator(
        color: AppColors.brand600,
        onRefresh: _load,
        child: CustomScrollView(
          slivers: [
            // ── Header ──────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(context.s.karyawanTitle,
                            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: context.cText)),
                        Text('$aktifCount aktif · ${_list.length} total',
                            style: TextStyle(fontSize: 16, color: context.cSub)),
                      ])),
                      _AddButton(onTap: () => _openForm()),
                    ]),
                    const SizedBox(height: 14),
                    // Search
                    _SearchField(
                      value: _searchQ,
                      onChanged: (v) => setState(() => _searchQ = v),
                      hint: context.s.searchEmployee,
                    ),
                    const SizedBox(height: 10),
                    // Filter chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(children: [
                        _FilterChip(label: context.s.statusAll, value: 'semua', current: _filterStatus, onTap: (v) => setState(() => _filterStatus = v)),
                        const SizedBox(width: 8),
                        _FilterChip(label: context.s.statusActive, value: 'aktif', current: _filterStatus, onTap: (v) => setState(() => _filterStatus = v)),
                        const SizedBox(width: 8),
                        _FilterChip(label: context.s.inactiveStatus, value: 'nonaktif', current: _filterStatus, onTap: (v) => setState(() => _filterStatus = v)),
                      ]),
                    ),
                    const SizedBox(height: 10),
                  ],
                ),
              ),
            ),

            // ── Content ─────────────────────────────────────
            if (_loading)
              const SliverFillRemaining(child: Center(child: CircularProgressIndicator(color: AppColors.brand600)))
            else if (filtered.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Container(
                      width: 64, height: 64,
                      decoration: BoxDecoration(color: AppColors.brand50, borderRadius: BorderRadius.circular(18)),
                      child: const Icon(Icons.people_outline_rounded, size: 32, color: AppColors.brand400),
                    ),
                    const SizedBox(height: 14),
                    Text(_searchQ.isNotEmpty ? context.s.noResults : context.s.emptyKaryawan,
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: context.cText),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 6),
                    if (_searchQ.isEmpty) ...[
                      Text(context.s.tapPlusToAddKaryawan,
                          style: TextStyle(fontSize: 16, color: context.cSub)),
                      const SizedBox(height: 20),
                      ElevatedButton.icon(
                        onPressed: () => _openForm(),
                        icon: const Icon(Icons.add_rounded, size: 18),
                        label: Text(context.s.tambahKaryawan),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.brand600, foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                        ),
                      ),
                    ],
                  ]),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => _KaryawanCard(
                      data: filtered[i],
                      onEdit: () => _openForm(editData: filtered[i]),
                    ),
                    childCount: filtered.length,
                  ),
                ),
              ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openForm(),
        backgroundColor: AppColors.brand600,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.person_add_rounded, size: 20),
        label: Text(context.s.tambahKaryawan, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        elevation: 4,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// KARYAWAN CARD
// ─────────────────────────────────────────────────────────────
class _KaryawanCard extends StatelessWidget {
  final Map<String, dynamic> data;
  final VoidCallback onEdit;
  const _KaryawanCard({required this.data, required this.onEdit});

  String _formatRupiah(num? v) {
    if (v == null || v == 0) return '-';
    final s = v.round().toString();
    final buf = StringBuffer();
    for (int i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
      buf.write(s[i]);
    }
    return 'Rp ${buf.toString()}';
  }

  @override
  Widget build(BuildContext context) {
    final aktif = data['status_aktif'] == true;
    final golongan = (data['jabatan'] as Map?)?['nama_jabatan'] ?? '-';
    final departemen = (data['departemen'] as Map?)?['nama_departemen'];
    final gajiHarian = (data['gaji_harian_override'] as num?) ??
        ((data['jabatan'] as Map?)?['gaji_harian'] as num?);
    final nik = data['nik']?.toString() ?? data['id_karyawan']?.toString() ?? '-';
    final initials = (data['nama_karyawan'] as String? ?? '?')
        .split(' ')
        .take(2)
        .map((w) => w.isNotEmpty ? w[0].toUpperCase() : '')
        .join();

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.cBorder),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: aktif ? AppColors.brand100 : context.cBorder,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(child: Text(initials,
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800,
                  color: aktif ? AppColors.brand700 : context.cMuted))),
        ),
        title: Row(children: [
          Expanded(child: Text(data['nama_karyawan'] ?? '-',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: context.cText),
              overflow: TextOverflow.ellipsis)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: aktif
                  ? (context.isDark ? const Color(0xFF052E16) : const Color(0xFFF0FDF4))
                  : (context.isDark ? const Color(0xFF1A1A1A) : const Color(0xFFF9FAFB)),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: aktif ? const Color(0xFF16A34A) : context.cBorder),
            ),
            child: Text(aktif ? 'Aktif' : 'Nonaktif',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700,
                    color: aktif ? const Color(0xFF16A34A) : context.cMuted)),
          ),
        ]),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(Icons.badge_outlined, size: 11, color: context.cMuted),
              const SizedBox(width: 4),
              Text('NIK: $nik',
                  style: TextStyle(fontSize: 15, color: context.cSub, fontFamily: 'monospace')),
            ]),
            const SizedBox(height: 3),
            Row(children: [
              Icon(Icons.work_outline_rounded, size: 11, color: context.cMuted),
              const SizedBox(width: 4),
              Expanded(child: Text(
                  departemen != null ? '$golongan · $departemen' : golongan,
                  style: TextStyle(fontSize: 15, color: context.cSub),
                  overflow: TextOverflow.ellipsis)),
            ]),
            if (gajiHarian != null && gajiHarian > 0) ...[
              const SizedBox(height: 3),
              Row(children: [
                Icon(Icons.payments_outlined, size: 11, color: context.cMuted),
                const SizedBox(width: 4),
                Text('${_formatRupiah(gajiHarian)}/hari',
                    style: const TextStyle(fontSize: 15, color: AppColors.brand600, fontWeight: FontWeight.w600)),
              ]),
            ],
          ]),
        ),
        trailing: GestureDetector(
          onTap: onEdit,
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: context.isDark ? const Color(0xFF1E3A5F) : AppColors.brand50,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.edit_outlined, size: 16, color: AppColors.brand600),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// FORM BOTTOM SHEET
// ─────────────────────────────────────────────────────────────
class _KaryawanFormSheet extends StatefulWidget {
  final List<Map<String, dynamic>> jabatanList;
  final List<Map<String, dynamic>> departemenList;
  final Map<String, dynamic>? editData;
  final VoidCallback onSaved;

  const _KaryawanFormSheet({
    required this.jabatanList,
    required this.departemenList,
    this.editData,
    required this.onSaved,
  });

  @override
  State<_KaryawanFormSheet> createState() => _KaryawanFormSheetState();
}

class _KaryawanFormSheetState extends State<_KaryawanFormSheet> {
  final _svc = PayrollService();
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nikCtrl;
  late final TextEditingController _namaCtrl;
  late final TextEditingController _gajiCtrl;

  int? _jabatanId;
  int? _departemenId;
  DateTime _tanggalBergabung = DateTime.now();
  bool _statusAktif = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final d = widget.editData;
    _nikCtrl = TextEditingController(
        text: d != null ? (d['nik']?.toString() ?? d['id_karyawan']?.toString() ?? '') : '');
    _namaCtrl = TextEditingController(text: d?['nama_karyawan']?.toString() ?? '');
    _gajiCtrl = TextEditingController(
        text: d?['gaji_harian_override'] != null ? d!['gaji_harian_override'].toString() : '');
    _jabatanId = d?['jabatan_id'] as int? ?? (d?['jabatan'] as Map?)?['id'] as int?;
    _departemenId = d?['departemen_id'] as int? ?? (d?['departemen'] as Map?)?['id'] as int?;
    _statusAktif = d?['status_aktif'] as bool? ?? true;
    if (d?['tanggal_bergabung'] != null) {
      try { _tanggalBergabung = DateTime.parse(d!['tanggal_bergabung']); } catch (_) {}
    }
  }

  @override
  void dispose() {
    _nikCtrl.dispose();
    _namaCtrl.dispose();
    _gajiCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _tanggalBergabung,
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: AppColors.brand600),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _tanggalBergabung = picked);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_jabatanId == null) {
      showError(context, 'Pilih golongan terlebih dahulu');
      return;
    }

    setState(() => _saving = true);
    try {
      final gajiStr = _gajiCtrl.text.trim();
      final payload = {
        'nama_karyawan': _namaCtrl.text.trim(),
        'nik': _nikCtrl.text.trim(),
        'jabatan_id': _jabatanId,
        'departemen_id': _departemenId,
        'gaji_harian_override': gajiStr.isNotEmpty ? double.parse(gajiStr) : null,
        'tanggal_bergabung': _tanggalBergabung.toIso8601String().split('T').first,
        'status_aktif': _statusAktif,
      };

      if (widget.editData != null) {
        await _svc.updateKaryawan(widget.editData!['id'] as int, payload);
        if (mounted) showSuccess(context, 'Karyawan berhasil diperbarui');
      } else {
        final created = await _svc.createKaryawan(payload);
        final newId = created['id'] as int?;
        if (newId != null) await _svc.generateKaryawanQR(newId);
        if (mounted) showSuccess(context, 'Karyawan berhasil ditambahkan + QR Code dibuat');
      }

      widget.onSaved();
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showError(context, e.toString().replaceFirst('Exception: ', ''));
      }
    }
  }

  String _formatDate(DateTime d) {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.editData != null;
    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      maxChildSize: 0.97,
      minChildSize: 0.5,
      builder: (_, ctrl) => Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(children: [
          // Handle
          sheetHandle(context),
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
            child: Row(children: [
              Container(
                width: 38, height: 38,
                decoration: BoxDecoration(color: AppColors.brand100, borderRadius: BorderRadius.circular(11)),
                child: const Icon(Icons.person_add_rounded, color: AppColors.brand600, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(isEdit ? 'Edit Karyawan' : 'Tambah Karyawan',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: context.cText)),
                Text(isEdit ? 'Perbarui data karyawan' : 'Isi NIK 16 digit karyawan',
                    style: TextStyle(fontSize: 15, color: context.cSub)),
              ])),
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: context.cBorder, shape: BoxShape.circle),
                  child: Icon(Icons.close_rounded, size: 16, color: context.cMuted),
                ),
              ),
            ]),
          ),
          Divider(height: 1, color: context.cBorder),
          // Form
          Expanded(
            child: SingleChildScrollView(
              controller: ctrl,
              padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 30),
              child: Form(
                key: _formKey,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  // NIK
                  const _SectionLabel('Data Diri'),
                  const SizedBox(height: 12),
                  const _FieldLabel(label: 'NIK Karyawan', required: true),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _nikCtrl,
                    style: TextStyle(fontSize: 17, color: context.cText),
                    keyboardType: TextInputType.number,
                    maxLength: 16,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: _inputDecor(context, hint: '16 digit NIK').copyWith(counterText: ''),
                    validator: (v) {
                      final s = v?.trim() ?? '';
                      if (s.isEmpty) return 'NIK wajib diisi';
                      if (!RegExp(r'^\d{16}$').hasMatch(s)) return 'NIK harus tepat 16 digit angka';
                      return null;
                    },
                  ),
                  const SizedBox(height: 4),
                  Text('NIK harus 16 digit angka dan unik untuk setiap karyawan',
                      style: TextStyle(fontSize: 15, color: context.cMuted)),
                  const SizedBox(height: 16),

                  // Nama
                  const _FieldLabel(label: 'Nama Lengkap', required: true),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _namaCtrl,
                    style: TextStyle(fontSize: 17, color: context.cText),
                    decoration: _inputDecor(context, hint: 'Contoh: Budi Santoso'),
                    validator: (v) => v == null || v.trim().length < 2 ? 'Nama minimal 2 karakter' : null,
                    textCapitalization: TextCapitalization.words,
                  ),
                  const SizedBox(height: 16),

                  // Golongan
                  const _FieldLabel(label: 'Golongan', required: true),
                  const SizedBox(height: 6),
                  AppDropdown<int>(
                    value: _jabatanId,
                    hint: 'Pilih golongan...',
                    items: widget.jabatanList.map((j) => AppDropdownItem<int>(
                      value: j['id'] as int,
                      label: j['nama_jabatan'] as String,
                    )).toList(),
                    onChanged: (v) => setState(() => _jabatanId = v),
                  ),
                  const SizedBox(height: 16),

                  // Departemen
                  const _FieldLabel(label: 'Departemen', required: false),
                  const SizedBox(height: 6),
                  AppDropdown<int>(
                    value: _departemenId,
                    hint: 'Pilih departemen (opsional)...',
                    items: widget.departemenList.map((d) => AppDropdownItem<int>(
                      value: d['id'] as int,
                      label: d['nama_departemen'] as String,
                    )).toList(),
                    onChanged: (v) => setState(() => _departemenId = v),
                  ),
                  const SizedBox(height: 16),

                  // Gaji
                  const _SectionLabel('Gaji Harian'),
                  const SizedBox(height: 12),
                  const _FieldLabel(label: 'Gaji Harian (Rp)', required: true),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _gajiCtrl,
                    style: TextStyle(fontSize: 17, color: context.cText),
                    decoration: _inputDecor(context, hint: 'Contoh: 250000'),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Gaji harian wajib diisi';
                      if ((double.tryParse(v) ?? 0) <= 0) return 'Gaji harus lebih dari 0';
                      return null;
                    },
                  ),
                  const SizedBox(height: 6),
                  Text('Gaji per jam = Gaji Harian ÷ 8',
                      style: TextStyle(fontSize: 15, color: context.cMuted)),
                  const SizedBox(height: 16),

                  // Tanggal Bergabung
                  const _SectionLabel('Info Bergabung'),
                  const SizedBox(height: 12),
                  const _FieldLabel(label: 'Tanggal Bergabung', required: true),
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: _pickDate,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                      decoration: BoxDecoration(
                        color: context.isDark ? const Color(0xFF0F1923) : const Color(0xFFF9FAFB),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: context.cBorder),
                      ),
                      child: Row(children: [
                        const Icon(Icons.calendar_today_rounded, size: 16, color: AppColors.brand600),
                        const SizedBox(width: 10),
                        Text(_formatDate(_tanggalBergabung),
                            style: TextStyle(fontSize: 17, color: context.cText, fontWeight: FontWeight.w500)),
                        const Spacer(),
                        Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: context.cMuted),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Status
                  const _FieldLabel(label: 'Status', required: false),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: context.cBorder),
                    ),
                    child: Row(children: [
                      Icon(
                        _statusAktif ? Icons.check_circle_rounded : Icons.cancel_rounded,
                        size: 18,
                        color: _statusAktif ? const Color(0xFF16A34A) : context.cMuted,
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(
                          _statusAktif ? 'Aktif' : 'Nonaktif',
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: context.cText))),
                      Switch(
                        value: _statusAktif,
                        onChanged: (v) => setState(() => _statusAktif = v),
                        activeThumbColor: AppColors.brand600,
                      ),
                    ]),
                  ),
                  const SizedBox(height: 16),

                  // Pembayaran info
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: context.isDark ? const Color(0xFF0F2040) : AppColors.brand50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.brand200),
                    ),
                    child: const Row(children: [
                      Icon(Icons.payments_rounded, size: 16, color: AppColors.brand600),
                      SizedBox(width: 8),
                      Expanded(child: Text('Metode pembayaran gaji: Tunai',
                          style: TextStyle(fontSize: 16, color: AppColors.brand700, fontWeight: FontWeight.w600))),
                    ]),
                  ),
                  const SizedBox(height: 28),

                  // Save button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _save,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.brand600,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: AppColors.brand200,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 0,
                      ),
                      child: _saving
                          ? const SizedBox(width: 20, height: 20,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : Text(isEdit ? 'Simpan Perubahan' : 'Simpan Karyawan',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    ),
                  ),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  InputDecoration _inputDecor(BuildContext context, {String hint = ''}) => InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(color: context.cMuted, fontSize: 16),
    filled: true,
    fillColor: context.isDark ? const Color(0xFF0F1923) : const Color(0xFFF9FAFB),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.cBorder)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: context.cBorder)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.brand500, width: 1.5)),
    errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFEF4444))),
    focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1.5)),
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 8),
    decoration: BoxDecoration(border: Border(bottom: BorderSide(color: context.cBorder))),
    child: Text(text.toUpperCase(),
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: context.cSub, letterSpacing: 1.1)),
  );
}

class _FieldLabel extends StatelessWidget {
  final String label;
  final bool required;
  const _FieldLabel({required this.label, required this.required});

  @override
  Widget build(BuildContext context) => RichText(
    text: TextSpan(
      text: label,
      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: context.cText),
      children: required ? const [TextSpan(text: ' *', style: TextStyle(color: Color(0xFFEF4444)))] : [],
    ),
  );
}

class _AddButton extends StatelessWidget {
  final VoidCallback onTap;
  const _AddButton({required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      decoration: BoxDecoration(
        color: AppColors.brand600,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: AppColors.brand600.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: const Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.add_rounded, color: Colors.white, size: 16),
        SizedBox(width: 4),
        Text('Tambah', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700)),
      ]),
    ),
  );
}

class _SearchField extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  final String hint;
  const _SearchField({required this.value, required this.onChanged, required this.hint});

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: context.cBorder),
    ),
    child: TextField(
      onChanged: onChanged,
      style: TextStyle(fontSize: 17, color: context.cText),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: context.cMuted, fontSize: 16),
        prefixIcon: Icon(Icons.search_rounded, color: context.cMuted, size: 18),
        suffixIcon: value.isNotEmpty
            ? GestureDetector(
                onTap: () => onChanged(''),
                child: Icon(Icons.close_rounded, color: context.cMuted, size: 16))
            : null,
        border: InputBorder.none,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
      ),
    ),
  );
}

class _FilterChip extends StatelessWidget {
  final String label, value, current;
  final ValueChanged<String> onTap;
  const _FilterChip({required this.label, required this.value, required this.current, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final sel = value == current;
    return GestureDetector(
      onTap: () => onTap(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: sel
              ? AppColors.brand600
              : (context.isDark ? const Color(0xFF1A2540) : AppColors.brand50),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: sel ? AppColors.brand600 : AppColors.brand200),
        ),
        child: Text(label,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600,
                color: sel ? Colors.white : AppColors.brand700)),
      ),
    );
  }
}
