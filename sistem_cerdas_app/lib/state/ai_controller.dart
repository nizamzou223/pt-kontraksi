import 'package:flutter/foundation.dart';

import '../data/ai_repository.dart';
import '../models/models.dart';

/// Memuat dan menyimpan data Sistem Cerdas untuk seluruh tab. Tiap bagian punya status galat sendiri
/// sehingga kegagalan satu bagian (mis. izin) tidak mengosongkan bagian lain.
class AiController extends ChangeNotifier {
  AiController(this.repo, {this.userId});

  final AiRepository repo;
  final int? userId;

  List<Proyek> proyek = const [];
  Proyek? proyekAktif;
  HasilRamalan? ramalan;
  List<Anomali> anomali = const [];
  List<InfoModel> model = const [];

  bool memuat = true;
  String? galatRamalan;
  String? galatAnomali;
  String? galatModel;

  // Filter yang dibagikan antar tab (mis. dari Beranda → tab Anomali).
  Risiko? filterRisiko;
  StatusTinjauan? filterStatus = StatusTinjauan.baru;

  static String _pesan(Object e) =>
      (e is DataException || e is TabelBelumAdaException) ? e.toString() : 'Terjadi kesalahan: $e';

  Future<void> muat() async {
    memuat = true;
    notifyListeners();
    await Future.wait([_muatProyekDanRamalan(), _muatAnomali(), _muatModel()]);
    memuat = false;
    notifyListeners();
  }

  Future<void> _muatProyekDanRamalan() async {
    try {
      proyek = await repo.daftarProyek();
      if (proyek.isNotEmpty) {
        proyekAktif = proyek.firstWhere((p) => p.id == proyekAktif?.id, orElse: () => proyek.first);
      }
      galatRamalan = null;
      await _muatRamalan();
    } catch (e) {
      galatRamalan = _pesan(e);
    }
  }

  Future<void> _muatRamalan() async {
    final p = proyekAktif;
    if (p == null) {
      ramalan = null;
      return;
    }
    try {
      ramalan = await repo.ramalanTerbaru(p.id);
      galatRamalan = null;
    } catch (e) {
      ramalan = null;
      galatRamalan = _pesan(e);
    }
  }

  Future<void> _muatAnomali() async {
    try {
      anomali = await repo.daftarAnomali();
      galatAnomali = null;
    } catch (e) {
      galatAnomali = _pesan(e);
    }
  }

  Future<void> _muatModel() async {
    try {
      model = await repo.daftarModel();
      galatModel = null;
    } catch (e) {
      galatModel = _pesan(e);
    }
  }

  Future<void> pilihProyek(Proyek p) async {
    if (p.id == proyekAktif?.id) return;
    proyekAktif = p;
    memuat = true;
    notifyListeners();
    await _muatRamalan();
    memuat = false;
    notifyListeners();
  }

  void setFilterRisiko(Risiko? r) {
    filterRisiko = r;
    notifyListeners();
  }

  void setFilterStatus(StatusTinjauan? s) {
    filterStatus = s;
    notifyListeners();
  }

  /// Menyimpan hasil tinjauan admin. Melempar galat bila gagal agar UI dapat menampilkannya.
  Future<Anomali> tinjau(Anomali a, StatusTinjauan status, String? catatan) async {
    final baru = await repo.tinjauAnomali(a, status, catatan, userId: userId);
    anomali = [for (final x in anomali) x.id == a.id ? baru : x];
    notifyListeners();
    return baru;
  }

  // ── Turunan ──
  int get jumlahBaru => anomali.where((a) => a.status == StatusTinjauan.baru).length;
  int get jumlahBaruTinggi =>
      anomali.where((a) => a.status == StatusTinjauan.baru && a.tingkat == Tingkat.tinggi).length;
  int hitungStatus(StatusTinjauan s) => anomali.where((a) => a.status == s).length;

  /// Presisi berdasarkan tinjauan admin: valid ÷ (valid + bukan anomali). Null bila belum ada tinjauan.
  double? get presisiTinjauan {
    final v = hitungStatus(StatusTinjauan.valid);
    final b = hitungStatus(StatusTinjauan.bukanAnomali);
    return (v + b) == 0 ? null : v / (v + b);
  }

  InfoModel? get modelRamalanAktif {
    final f = model.where((m) => m.jenis == 'forecast').toList();
    if (f.isEmpty) return null;
    return f.firstWhere((m) => m.aktif, orElse: () => f.first);
  }
}
