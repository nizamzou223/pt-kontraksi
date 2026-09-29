// Aturan bisnis deterministik untuk data kepegawaian. Setiap aturan menghasilkan temuan yang ALASANNYA
// dapat dibaca admin. Port dari admin-web/src/ml/anomalyRules.js.
import 'baris_data.dart';
import 'teks.dart';
import 'timeseries.dart';

const bobotTingkat = {'tinggi': 0.9, 'sedang': 0.6, 'rendah': 0.35};

// Batas lembur mengikuti PP No. 35 Tahun 2021: paling lama 4 jam/hari dan 18 jam/minggu.
class Batas {
  static const lemburHarian = 4.0;
  static const lemburHarianEkstrem = 8.0;
  static const lemburMingguan = 18.0;
  static const durasiKerjaEkstrem = 16.0;
  static const durasiKerjaTerlaluSingkat = 0.5;
  static const selisihDurasi = 0.5;
  static const kasbonHariGaji = 26.0;
  static const kasbonBerulangHari = 14;
  static const kasbonBerulangJumlah = 3;
  static const polaJamIdentik = 12;
}

class Temuan {
  final String kode;
  final String tingkat;
  final double bobot;
  final String teks;
  final String? metode;
  const Temuan(this.kode, this.tingkat, this.bobot, this.teks, [this.metode]);

  Temuan denganMetode(String m) => Temuan(kode, tingkat, bobot, teks, m);
}

Temuan _t(String kode, String tingkat, String teks) => Temuan(kode, tingkat, bobotTingkat[tingkat]!, teks);
String _jam(num n) => fmtId(n);
String _rp(num n) => fmtRp(n);

/// 'HH:MM[:SS]' → jam desimal; null bila kosong/tidak valid.
double? toHours(String? t) {
  if (t == null || t.isEmpty) return null;
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(t);
  return m == null ? null : int.parse(m.group(1)!) + int.parse(m.group(2)!) / 60;
}

bool _isAuto(PresensiRow r) => r.metodeInput == 'otomatis';
bool isAutoLembur(LemburRow r) => RegExp(r'^otomatis', caseSensitive: false).hasMatch(r.catatan ?? '');

String _hhmm(String? s) => s == null ? '' : (s.length >= 5 ? s.substring(0, 5) : s);

/// Konteks pra-hitung agar aturan O(1) per baris.
class KonteksAnomali {
  final Map<int, KaryawanRow> karyawan;
  final Set<String> presensiHadir;
  final Map<String, int> manualIdentik;
  final Map<int, double> lemburMingguanLewat;
  final Map<int, int> kasbonBerulang;
  final String? today;
  const KonteksAnomali(this.karyawan, this.presensiHadir, this.manualIdentik, this.lemburMingguanLewat, this.kasbonBerulang, this.today);
}

KonteksAnomali buildContext({
  required List<KaryawanRow> karyawan,
  required List<PresensiRow> presensi,
  required List<LemburRow> lembur,
  required List<KasbonRow> kasbon,
  String? today,
}) {
  final kMap = {for (final k in karyawan) k.id: k};
  final presensiHadir = <String>{
    for (final p in presensi)
      if ((p.statusKehadiran ?? 'hadir') == 'hadir') '${p.karyawanId}|${p.tanggal}',
  };

  final manualIdentik = <String, int>{};
  for (final p in presensi) {
    if (p.metodeInput == 'manual' && (p.jamMasuk ?? '').isNotEmpty && (p.jamKeluar ?? '').isNotEmpty) {
      final key = '${p.karyawanId}|${p.jamMasuk}|${p.jamKeluar}';
      manualIdentik[key] = (manualIdentik[key] ?? 0) + 1;
    }
  }

  // Lembur mingguan: tandai baris yang membuat akumulasi minggu itu melewati batas
  final lemburMingguanLewat = <int, double>{};
  final byKw = <String, List<LemburRow>>{};
  for (final l in lembur.where((r) => !isAutoLembur(r))) {
    (byKw['${l.karyawanId}|${weekStart(l.tanggal)}'] ??= []).add(l);
  }
  for (final rows in byKw.values) {
    rows.sort((a, b) {
      final c = a.tanggal.compareTo(b.tanggal);
      return c != 0 ? c : a.id.compareTo(b.id);
    });
    var cum = 0.0;
    for (final r in rows) {
      cum += r.durasiJam ?? 0;
      if (cum > Batas.lemburMingguan) lemburMingguanLewat[r.id] = cum;
    }
  }

  // Kasbon berulang dalam jendela N hari
  final kasbonBerulang = <int, int>{};
  final byK = <int, List<KasbonRow>>{};
  for (final b in kasbon) {
    (byK[b.karyawanId] ??= []).add(b);
  }
  for (final rows in byK.values) {
    rows.sort((a, b) => a.tanggalKasbon.compareTo(b.tanggalKasbon));
    final ms = [for (final r in rows) utcMs(r.tanggalKasbon)];
    for (var i = 0; i < rows.length; i++) {
      final t = ms[i];
      final inWin = ms.where((x) => x <= t && t - x <= Batas.kasbonBerulangHari * Duration.millisecondsPerDay).length;
      if (inWin >= Batas.kasbonBerulangJumlah) kasbonBerulang[rows[i].id] = inWin;
    }
  }
  return KonteksAnomali(kMap, presensiHadir, manualIdentik, lemburMingguanLewat, kasbonBerulang, today);
}

/// Presensi 'otomatis' (alfa otomatis) BUKAN observasi nyata → tidak diperiksa.
List<Temuan> presensiRules(PresensiRow row, KonteksAnomali ctx) {
  if (_isAuto(row)) return const [];
  final out = <Temuan>[];
  final k = ctx.karyawan[row.karyawanId];
  final masuk = toHours(row.jamMasuk), keluar = toHours(row.jamKeluar);
  final durasi = row.durasiJam;
  final hadir = (row.statusKehadiran ?? 'hadir') == 'hadir';

  if (hadir && masuk != null && keluar != null && keluar < masuk && (durasi == null || durasi < 12)) {
    out.add(_t('KELUAR_SEBELUM_MASUK', 'tinggi', 'Jam keluar (${_hhmm(row.jamKeluar)}) lebih awal dari jam masuk (${_hhmm(row.jamMasuk)}).'));
  }
  if (hadir && masuk != null && keluar != null && durasi != null && keluar >= masuk) {
    final hitung = keluar - masuk;
    if ((hitung - durasi).abs() > Batas.selisihDurasi) {
      out.add(_t('DURASI_TIDAK_KONSISTEN', 'sedang', 'Durasi tercatat ${_jam(durasi)} jam, tetapi selisih jam masuk–keluar ${_jam(hitung)} jam.'));
    }
  }
  if (hadir && durasi != null) {
    if (durasi > Batas.durasiKerjaEkstrem) {
      out.add(_t('DURASI_EKSTREM', 'tinggi', 'Durasi kerja ${_jam(durasi)} jam dalam sehari (batas wajar ${Batas.durasiKerjaEkstrem.toInt()} jam).'));
    } else if (durasi > 0 && durasi < Batas.durasiKerjaTerlaluSingkat) {
      out.add(_t('DURASI_TERLALU_SINGKAT', 'sedang', 'Berstatus hadir namun hanya ${_jam(durasi)} jam.'));
    }
  }
  if (k != null) {
    if (k.statusAktif == false) {
      out.add(_t('PRESENSI_KARYAWAN_NONAKTIF', 'sedang', 'Presensi dicatat untuk karyawan berstatus NONAKTIF (${k.nama}).'));
    }
    final gabung = k.tanggalBergabung?.substring(0, 10);
    if (gabung != null && row.tanggal.compareTo(gabung) < 0) {
      out.add(_t('PRESENSI_SEBELUM_BERGABUNG', 'tinggi', 'Tanggal presensi ${row.tanggal} lebih awal dari tanggal bergabung $gabung.'));
    }
  }
  if (ctx.today != null && row.tanggal.compareTo(ctx.today!) > 0) {
    out.add(_t('PRESENSI_MASA_DEPAN', 'tinggi', 'Presensi bertanggal di masa depan (${row.tanggal}).'));
  }

  // Pola input manual identik berulang (indikasi jam "dikarang")
  if (row.metodeInput == 'manual' && (row.jamMasuk ?? '').isNotEmpty && (row.jamKeluar ?? '').isNotEmpty) {
    final n = ctx.manualIdentik['${row.karyawanId}|${row.jamMasuk}|${row.jamKeluar}'] ?? 0;
    if (n >= Batas.polaJamIdentik) {
      out.add(_t('POLA_JAM_IDENTIK', 'rendah', 'Jam manual ${_hhmm(row.jamMasuk)}–${_hhmm(row.jamKeluar)} identik pada $n hari (kemungkinan jam tidak nyata).'));
    }
  }
  return out;
}

List<Temuan> lemburRules(LemburRow row, KonteksAnomali ctx) {
  if (isAutoLembur(row)) return const []; // lembur bentukan sistem (turunan), bukan input manusia
  final out = <Temuan>[];
  final durasi = row.durasiJam ?? 0;
  if (!ctx.presensiHadir.contains('${row.karyawanId}|${row.tanggal}')) {
    out.add(_t('LEMBUR_TANPA_PRESENSI', 'tinggi', 'Lembur ${_jam(durasi)} jam pada ${row.tanggal} tanpa presensi hadir di hari yang sama.'));
  }
  if (durasi > Batas.lemburHarianEkstrem) {
    out.add(_t('LEMBUR_HARIAN_EKSTREM', 'tinggi', 'Lembur ${_jam(durasi)} jam dalam sehari (batas regulasi ${Batas.lemburHarian.toInt()} jam).'));
  } else if (durasi > Batas.lemburHarian) {
    out.add(_t('LEMBUR_HARIAN_BERLEBIH', 'sedang', 'Lembur ${_jam(durasi)} jam melebihi batas ${Batas.lemburHarian.toInt()} jam/hari (PP 35/2021).'));
  }
  final wk = ctx.lemburMingguanLewat[row.id];
  if (wk != null) {
    out.add(_t('LEMBUR_MINGGUAN_BERLEBIH', 'sedang', 'Akumulasi lembur minggu itu ${_jam(wk)} jam melebihi batas ${Batas.lemburMingguan.toInt()} jam/minggu.'));
  }
  final tarif = row.tarifLembur ?? 0, total = row.totalLembur ?? 0;
  if (tarif > 0 && total > 0 && (total - durasi * tarif).abs() > 0.01 * total) {
    out.add(_t('LEMBUR_TOTAL_TIDAK_SESUAI', 'sedang',
        'Total ${_rp(total)} tidak sama dengan durasi × tarif (${_jam(durasi)} × ${_rp(tarif)} = ${_rp(durasi * tarif)}).'));
  }
  return out;
}

List<Temuan> kasbonRules(KasbonRow row, KonteksAnomali ctx) {
  final out = <Temuan>[];
  final jumlah = row.jumlahKasbon, sisa = row.sisaKasbon;
  final k = ctx.karyawan[row.karyawanId];
  if (sisa > jumlah) out.add(_t('KASBON_SISA_LEBIH_BESAR', 'tinggi', 'Sisa kasbon ${_rp(sisa)} lebih besar dari jumlah kasbon ${_rp(jumlah)}.'));
  if (row.statusLunas && sisa > 0) out.add(_t('KASBON_LUNAS_ADA_SISA', 'sedang', 'Berstatus lunas tetapi masih ada sisa ${_rp(sisa)}.'));
  if (k?.statusAktif == false) out.add(_t('KASBON_KARYAWAN_NONAKTIF', 'sedang', 'Kasbon atas nama karyawan NONAKTIF (${k!.nama}).'));

  final gh = k?.gajiHarian ?? 0;
  if (gh > 0) {
    final kali = jumlah / gh;
    if (kali > Batas.kasbonHariGaji * 2) {
      out.add(_t('KASBON_SANGAT_BESAR', 'tinggi', 'Kasbon ${_rp(jumlah)} setara ${_jam(kali)} hari gaji (batas wajar ±${Batas.kasbonHariGaji.toInt()} hari).'));
    } else if (kali > Batas.kasbonHariGaji) {
      out.add(_t('KASBON_BESAR', 'sedang', 'Kasbon ${_rp(jumlah)} setara ${_jam(kali)} hari gaji (> ${Batas.kasbonHariGaji.toInt()} hari).'));
    }
  }
  final rep = ctx.kasbonBerulang[row.id];
  if (rep != null) {
    out.add(_t('KASBON_BERULANG', 'sedang', 'Kasbon ke-$rep dalam ${Batas.kasbonBerulangHari} hari terakhir untuk karyawan yang sama.'));
  }
  return out;
}
