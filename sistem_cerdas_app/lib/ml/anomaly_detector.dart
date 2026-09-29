// Deteksi anomali data kepegawaian: aturan bisnis + statistik robust + Isolation Forest, digabung
// (noisy-OR) menjadi skor 0..1 lengkap dengan ALASAN yang dapat dibaca admin.
// Port dari admin-web/src/ml/anomalyDetector.js.
//
// Prinsip desain:
//  • Presensi 'otomatis' & lembur bentukan sistem tidak diperiksa (bukan observasi nyata).
//  • Penanda hanyalah SARAN — keputusan akhir ada pada admin (status tinjauan).
//  • Deterministik (benih tetap) → hasil dapat direproduksi.
import 'dart:math' as math;

import 'anomaly_rules.dart';
import 'baris_data.dart';
import 'isolation_forest.dart';
import 'stats.dart';
import 'teks.dart';

const ambangTinggi = 0.75;
const ambangSedang = 0.5;
String tingkatDari(double skor) => skor >= ambangTinggi ? 'tinggi' : (skor >= ambangSedang ? 'sedang' : 'rendah');

const _zBatas = 3.5;
const _ifMinData = 30;
const _lantai = (durasi: 0.75, masuk: 0.5, lembur: 0.75, kasbon: 0.5, gaji: 0.1);

String _jam(num n) => fmtId(n);
String _sgn(double z) => '${z >= 0 ? '+' : '−'}${z.abs().toStringAsFixed(1).replaceAll('.', ',')}';
double _noisyOr(Iterable<double> ws) => 1 - ws.fold<double>(1, (p, w) => p * (1 - w));
int _dow(String tanggal) => DateTime.parse('${tanggal}T00:00:00Z').weekday - 1; // Senin = 0

class _Baseline {
  final double med, mad, fb;
  const _Baseline(this.med, this.mad, this.fb);
}

_Baseline _baselineOf(List<double> values) {
  final med = median(values);
  return _Baseline(med, mad(values, med), std(values));
}

double _zOf(double x, _Baseline b, [double lantai = 0]) {
  final sigma = b.mad > 0 ? 1.4826 * b.mad : b.fb;
  final skala = math.max(sigma, lantai);
  return skala > 0 ? (x - b.med) / skala : 0;
}

double _bobotZ(double z) => math.min(0.9, 0.5 + 0.1 * (z.abs() - _zBatas));

String _hh(double x) {
  final t = (x * 60).round();
  return '${(t ~/ 60).toString().padLeft(2, '0')}:${(t % 60).toString().padLeft(2, '0')}';
}

typedef _Temuan = Map<int, List<Temuan>>;

void _tambah(_Temuan out, int id, Temuan f) => (out[id] ??= []).add(f);

// ───────────────────────── Statistik robust ─────────────────────────
_Temuan _statFindings(String domain, {required List<PresensiRow> presensi, required List<LemburRow> lembur, required List<KasbonRow> kasbon, required List<GajiRow> gaji, required KonteksAnomali ctx}) {
  final out = <int, List<Temuan>>{};

  if (domain == 'presensi') {
    final rows = presensi.where((p) => (p.durasiJam ?? 0) > 0 && toHours(p.jamMasuk) != null).toList();
    if (rows.isEmpty) return out;
    final gd = _baselineOf([for (final p in rows) p.durasiJam!]);
    final gm = _baselineOf([for (final p in rows) toHours(p.jamMasuk)!]);
    final per = <int, List<PresensiRow>>{};
    for (final p in rows) {
      (per[p.karyawanId] ??= []).add(p);
    }
    final base = {
      for (final e in per.entries)
        e.key: e.value.length >= 8
            ? (d: _baselineOf([for (final p in e.value) p.durasiJam!]), m: _baselineOf([for (final p in e.value) toHours(p.jamMasuk)!]), own: true)
            : (d: gd, m: gm, own: false)
    };
    for (final p in rows) {
      final b = base[p.karyawanId]!;
      final d = p.durasiJam!, m = toHours(p.jamMasuk)!;
      final zd = _zOf(d, b.d, _lantai.durasi), zm = _zOf(m, b.m, _lantai.masuk);
      final acuan = b.own ? 'median karyawan ini' : 'median seluruh karyawan';
      if (zd.abs() >= _zBatas && (d - b.d.med).abs() >= 2) {
        _tambah(out, p.id, Temuan('STAT_DURASI', 'sedang', _bobotZ(zd), 'Durasi kerja ${_jam(d)} jam menyimpang dari $acuan (${_jam(b.d.med)} jam), z = ${_sgn(zd)}.', 'statistik'));
      }
      if (zm.abs() >= _zBatas && (m - b.m.med).abs() >= 1.5) {
        _tambah(out, p.id, Temuan('STAT_JAM_MASUK', 'sedang', _bobotZ(zm), 'Jam masuk ${_hh(m)} tidak lazim dibanding $acuan (${_hh(b.m.med)}), z = ${_sgn(zm)}.', 'statistik'));
      }
    }
  }

  if (domain == 'lembur') {
    final rows = lembur.where((l) => (l.durasiJam ?? 0) > 0).toList();
    if (rows.isEmpty) return out;
    final global = _baselineOf([for (final l in rows) l.durasiJam!]);
    final per = <int, List<double>>{};
    for (final l in rows) {
      (per[l.karyawanId] ??= []).add(l.durasiJam!);
    }
    for (final l in rows) {
      final own = per[l.karyawanId]!;
      final b = own.length >= 5 ? _baselineOf(own) : global;
      final d = l.durasiJam!, z = _zOf(d, b, _lantai.lembur);
      if (z >= _zBatas && d - b.med >= 1.5) {
        _tambah(out, l.id, Temuan('STAT_LEMBUR', 'sedang', _bobotZ(z), 'Lembur ${_jam(d)} jam jauh di atas kebiasaan (${_jam(b.med)} jam), z = ${_sgn(z)}.', 'statistik'));
      }
    }
  }

  if (domain == 'kasbon') {
    final rows = [
      for (final b in kasbon)
        if ((ctx.karyawan[b.karyawanId]?.gajiHarian ?? 0) > 0 && b.jumlahKasbon > 0) (b: b, gh: ctx.karyawan[b.karyawanId]!.gajiHarian)
    ];
    if (rows.length >= 10) {
      final logs = [for (final r in rows) math.log(r.b.jumlahKasbon / r.gh)];
      final base = _baselineOf(logs);
      for (var i = 0; i < rows.length; i++) {
        final z = _zOf(logs[i], base, _lantai.kasbon);
        if (z >= _zBatas) {
          final r = rows[i];
          _tambah(out, r.b.id, Temuan('STAT_KASBON', 'sedang', _bobotZ(z),
              'Nilai kasbon (${_jam(r.b.jumlahKasbon / r.gh)} hari gaji) jauh di atas kasbon karyawan lain (median ${_jam(math.exp(base.med))} hari gaji), z = ${_sgn(z)}.', 'statistik'));
        }
      }
    }
  }

  if (domain == 'gaji') {
    final groups = <String, List<GajiRow>>{};
    for (final g in gaji) {
      final jab = ctx.karyawan[g.karyawanId]?.jabatanId?.toString() ?? 'x';
      (groups['${g.periodeMulai}|$jab'] ??= []).add(g);
    }
    for (final rs in groups.values) {
      if (rs.length < 5) continue;
      final base = _baselineOf([for (final g in rs) g.gajiKotor]);
      for (final g in rs) {
        final z = _zOf(g.gajiKotor, base, _lantai.gaji * base.med.abs());
        if (z.abs() >= _zBatas) {
          _tambah(out, g.id, Temuan('STAT_GAJI', 'sedang', _bobotZ(z),
              'Gaji kotor ${fmtRp(g.gajiKotor)} menyimpang dari rekan sejabatan pada minggu yang sama (median ${fmtRp(base.med)}), z = ${_sgn(z)}.', 'statistik'));
        }
      }
    }
  }
  return out;
}

// ───────────────────────── Isolation Forest ─────────────────────────
const _fiturNama = {
  'presensi': ['durasi kerja', 'jam masuk', 'jam keluar', 'hari dalam pekan', 'selisih durasi dari kebiasaan', 'selisih jam masuk dari kebiasaan', 'input manual'],
  'lembur': ['durasi lembur', 'rasio lembur terhadap durasi kerja', 'tarif per jam relatif terhadap gaji', 'jam mulai', 'hari dalam pekan'],
  'kasbon': ['nilai kasbon (hari gaji)', 'rasio sisa/jumlah', 'jumlah kasbon dalam 14 hari'],
  'gaji': ['gaji kotor', 'rasio gaji bersih', 'rasio potongan kasbon', 'jumlah hari hadir'],
};

({List<List<double>> rows, List<int> ids}) _featuresFor(String domain,
    {required List<PresensiRow> presensi, required List<LemburRow> lembur, required List<KasbonRow> kasbon, required List<GajiRow> gaji, required KonteksAnomali ctx}) {
  final rows = <List<double>>[];
  final ids = <int>[];
  if (domain == 'presensi') {
    final usable = presensi
        .where((p) => (p.statusKehadiran ?? 'hadir') == 'hadir' && p.durasiJam != null && toHours(p.jamMasuk) != null && toHours(p.jamKeluar) != null)
        .toList();
    final per = <int, List<PresensiRow>>{};
    for (final p in usable) {
      (per[p.karyawanId] ??= []).add(p);
    }
    final med = {
      for (final e in per.entries)
        e.key: (d: median([for (final p in e.value) p.durasiJam!]), m: median([for (final p in e.value) toHours(p.jamMasuk)!]))
    };
    for (final p in usable) {
      final b = med[p.karyawanId]!;
      rows.add([p.durasiJam!, toHours(p.jamMasuk)!, toHours(p.jamKeluar)!, _dow(p.tanggal).toDouble(), p.durasiJam! - b.d, toHours(p.jamMasuk)! - b.m, p.metodeInput == 'manual' ? 1 : 0]);
      ids.add(p.id);
    }
  } else if (domain == 'lembur') {
    final durasiKerja = {for (final p in presensi) '${p.karyawanId}|${p.tanggal}': p.durasiJam ?? 0};
    for (final l in lembur) {
      final gh = ctx.karyawan[l.karyawanId]?.gajiHarian ?? 0;
      final dk = durasiKerja['${l.karyawanId}|${l.tanggal}'] ?? 0;
      final d = l.durasiJam ?? 0;
      rows.add([d, dk > 0 ? d / dk : 2, gh > 0 ? (l.tarifLembur ?? 0) / (gh / 8) : 1, toHours(l.jamMulai) ?? 12, _dow(l.tanggal).toDouble()]);
      ids.add(l.id);
    }
  } else if (domain == 'kasbon') {
    for (final b in kasbon) {
      final gh = ctx.karyawan[b.karyawanId]?.gajiHarian ?? 0;
      final jumlah = b.jumlahKasbon;
      rows.add([gh > 0 ? jumlah / gh : 0, jumlah > 0 ? b.sisaKasbon / jumlah : 0, (ctx.kasbonBerulang[b.id] ?? 1).toDouble()]);
      ids.add(b.id);
    }
  } else if (domain == 'gaji') {
    for (final g in gaji) {
      final kotor = g.gajiKotor;
      rows.add([kotor, kotor > 0 ? g.gajiBersih / kotor : 1, kotor > 0 ? g.totalPotonganKasbon / kotor : 0, g.totalHariHadir]);
      ids.add(g.id);
    }
  }
  return (rows: rows, ids: ids);
}

({_Temuan out, Map<int, double> skorAll}) _iforestFindings(String domain, int seed,
    {required List<PresensiRow> presensi, required List<LemburRow> lembur, required List<KasbonRow> kasbon, required List<GajiRow> gaji, required KonteksAnomali ctx}) {
  final out = <int, List<Temuan>>{};
  final skorAll = <int, double>{};
  final f = _featuresFor(domain, presensi: presensi, lembur: lembur, kasbon: kasbon, gaji: gaji, ctx: ctx);
  if (f.rows.length < _ifMinData) return (out: out, skorAll: skorAll);
  final forest = IsolationForest(nTrees: 100, sampleSize: 256, seed: seed).fit(f.rows);
  final scores = forest.score(f.rows);
  final nFeat = f.rows.first.length;
  final bases = [for (var k = 0; k < nFeat; k++) _baselineOf([for (final r in f.rows) r[k]])];
  for (var i = 0; i < scores.length; i++) {
    final s = scores[i];
    skorAll[f.ids[i]] = s;
    if (s < 0.6) continue;
    final dev = [
      for (var k = 0; k < nFeat; k++) (f: k, z: _zOf(f.rows[i][k], bases[k])),
    ].where((x) => x.z.abs() >= 2).toList();
    sortStabil(dev, (a, b) => cmpNum(b.z.abs(), a.z.abs()));
    final top = dev.take(2).toList();
    final sebab = top.isNotEmpty ? ' Paling menyimpang: ${top.map((x) => '${_fiturNama[domain]![x.f]} (z ${_sgn(x.z)})').join(', ')}.' : '';
    final bobot = 0.8 * math.min(1.0, math.max(0.0, (s - 0.55) / 0.25));
    out[f.ids[i]] = [
      Temuan('IFOREST', 'sedang', bobot, 'Kombinasi nilai tidak lazim dibanding data lain (skor Isolation Forest ${s.toStringAsFixed(2).replaceAll('.', ',')}).$sebab', 'isolation forest')
    ];
  }
  return (out: out, skorAll: skorAll);
}

// ───────────────────────── Penggabung ─────────────────────────
class ItemAnomali {
  final String key; // 'tabel:id'
  final String sumberTabel;
  final int sumberId;
  final int? karyawanId;
  final String? namaKaryawan;
  final int? projectId;
  final String tanggal;
  final double skor;
  final String tingkat;
  final List<Temuan> alasan;
  final List<String> metode;
  const ItemAnomali({
    required this.key,
    required this.sumberTabel,
    required this.sumberId,
    required this.karyawanId,
    required this.namaKaryawan,
    required this.projectId,
    required this.tanggal,
    required this.skor,
    required this.tingkat,
    required this.alasan,
    required this.metode,
  });
}

class RingkasanAnomali {
  final Map<String, int> diperiksa;
  final Map<String, int> dikecualikan;
  final int ditandai;
  final Map<String, int> perSumber;
  final Map<String, int> perTingkat;
  final int disembunyikan;
  final double threshold;
  const RingkasanAnomali(this.diperiksa, this.dikecualikan, this.ditandai, this.perSumber, this.perTingkat, this.disembunyikan, this.threshold);
}

class HasilAnomali {
  final List<ItemAnomali> items;
  final RingkasanAnomali ringkasan;
  const HasilAnomali(this.items, this.ringkasan);
}

class MetodeAktif {
  final bool aturan, statistik, iforest;
  const MetodeAktif({this.aturan = true, this.statistik = true, this.iforest = true});
}

class PermintaanAnomali {
  final DataKepegawaian data;
  final double threshold;
  final MetodeAktif metode;
  final int seed;
  final Set<String> reviewed; // 'tabel:id' yang sudah ditinjau admin sebagai bukan anomali / diabaikan
  const PermintaanAnomali({required this.data, this.threshold = 0.5, this.metode = const MetodeAktif(), this.seed = 42, this.reviewed = const {}});
}

const _sumberTabel = {'presensi': 'presensi', 'lembur': 'lembur', 'kasbon': 'kasbon', 'gaji': 'rekap_gaji_mingguan'};

Future<HasilAnomali> jalankanDeteksi(PermintaanAnomali q, {void Function(double p, String label)? onProgress}) async {
  final d = q.data;
  final kar = d.karyawan;
  final presensiReal = d.presensi.where((p) => p.metodeInput != 'otomatis').toList();
  final lemburReal = d.lembur.where((l) => !isAutoLembur(l)).toList();
  final ctx = buildContext(karyawan: kar, presensi: presensiReal, lembur: lemburReal, kasbon: d.kasbon, today: d.today);

  final domains = <String, List<Object>>{'presensi': presensiReal, 'lembur': lemburReal, 'kasbon': d.kasbon, 'gaji': d.gaji};
  final items = <ItemAnomali>[];
  var disembunyikan = 0;
  var langkah = 0;

  for (final entry in domains.entries) {
    final domain = entry.key;
    final rows = entry.value;
    langkah++;
    onProgress?.call(0.1 + 0.85 * (langkah - 1) / domains.length, 'Memeriksa ${_labelDomain(domain)} (${rows.length} data)…');
    await Future<void>.delayed(Duration.zero);
    if (rows.isEmpty) continue;

    final st = q.metode.statistik
        ? _statFindings(domain, presensi: presensiReal, lembur: lemburReal, kasbon: d.kasbon, gaji: d.gaji, ctx: ctx)
        : <int, List<Temuan>>{};
    final iff = q.metode.iforest
        ? _iforestFindings(domain, q.seed, presensi: presensiReal, lembur: lemburReal, kasbon: d.kasbon, gaji: d.gaji, ctx: ctx)
        : (out: <int, List<Temuan>>{}, skorAll: <int, double>{});

    for (final r in rows) {
      final int id;
      final int? karyawanId;
      final int? projectId;
      final String tanggal;
      List<Temuan> aturan = const [];
      switch (r) {
        case PresensiRow p:
          id = p.id;
          karyawanId = p.karyawanId;
          projectId = p.projectId;
          tanggal = p.tanggal;
          if (q.metode.aturan) aturan = presensiRules(p, ctx);
        case LemburRow l:
          id = l.id;
          karyawanId = l.karyawanId;
          projectId = l.projectId;
          tanggal = l.tanggal;
          if (q.metode.aturan) aturan = lemburRules(l, ctx);
        case KasbonRow b:
          id = b.id;
          karyawanId = b.karyawanId;
          projectId = b.projectId;
          tanggal = b.tanggalKasbon;
          if (q.metode.aturan) aturan = kasbonRules(b, ctx);
        case GajiRow g:
          id = g.id;
          karyawanId = g.karyawanId;
          projectId = null;
          tanggal = g.periodeMulai;
        default:
          continue;
      }
      final temuan = [
        for (final f in aturan) f.denganMetode('aturan bisnis'),
        ...(st[id] ?? const <Temuan>[]),
        ...(iff.out[id] ?? const <Temuan>[]),
      ];
      sortStabil(temuan, (a, b) => cmpNum(b.bobot, a.bobot));
      final skor = temuan.isEmpty ? 0.0 : _noisyOr(temuan.map((f) => f.bobot));
      final tabel = _sumberTabel[domain]!;
      final key = '$tabel:$id';
      if (skor < q.threshold) continue;
      if (q.reviewed.contains(key)) {
        disembunyikan++;
        continue;
      }
      items.add(ItemAnomali(
        key: key,
        sumberTabel: tabel,
        sumberId: id,
        karyawanId: karyawanId,
        namaKaryawan: ctx.karyawan[karyawanId]?.nama,
        projectId: projectId,
        tanggal: tanggal,
        skor: skor,
        tingkat: tingkatDari(skor),
        alasan: temuan,
        metode: temuan.map((f) => f.metode ?? '').toSet().where((m) => m.isNotEmpty).toList(),
      ));
    }
  }

  sortStabil(items, (a, b) => cmpNum(b.skor, a.skor));
  final perSumber = <String, int>{};
  final perTingkat = {'tinggi': 0, 'sedang': 0, 'rendah': 0};
  for (final i in items) {
    perSumber[i.sumberTabel] = (perSumber[i.sumberTabel] ?? 0) + 1;
    perTingkat[i.tingkat] = perTingkat[i.tingkat]! + 1;
  }
  onProgress?.call(1, 'Selesai');
  return HasilAnomali(
    items,
    RingkasanAnomali(
      {'presensi': presensiReal.length, 'lembur': lemburReal.length, 'kasbon': d.kasbon.length, 'gaji': d.gaji.length},
      {'presensi_otomatis': d.presensi.length - presensiReal.length, 'lembur_otomatis': d.lembur.length - lemburReal.length},
      items.length,
      perSumber,
      perTingkat,
      disembunyikan,
      q.threshold,
    ),
  );
}

String _labelDomain(String d) => switch (d) {
      'presensi' => 'presensi',
      'lembur' => 'lembur',
      'kasbon' => 'kasbon',
      _ => 'gaji mingguan',
    };
