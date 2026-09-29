// Pemantauan akurasi: membandingkan ramalan tersimpan dengan pemakaian aktual.
// Port dari hitungAkurasi() pada admin-web/src/services/mlService.js.
import 'stats.dart';

class BarisRamalanTersimpan {
  final String dibuatPada;
  final String mingguTarget;
  final int horizon;
  final int barangId;
  final double yhat;
  const BarisRamalanTersimpan(this.dibuatPada, this.mingguTarget, this.horizon, this.barangId, this.yhat);
}

class AkurasiPerHorizon {
  final int h;
  final double mae;
  final double? wape;
  const AkurasiPerHorizon(this.h, this.mae, this.wape);
}

class AkurasiRun {
  final String dibuatPada;
  final int n;
  final double mae, bias;
  final double? wape;
  final List<AkurasiPerHorizon> perHorizon;
  const AkurasiRun(this.dibuatPada, this.n, this.mae, this.bias, this.wape, this.perHorizon);
}

class StatusDrift {
  final String status; // belum_cukup | stabil | memburuk
  final String pesan;
  const StatusDrift(this.status, this.pesan);
}

class AkurasiRamalan {
  final List<AkurasiRun> runs;
  final StatusDrift drift;
  const AkurasiRamalan(this.runs, this.drift);

  static const kosong = AkurasiRamalan([], StatusDrift('belum_cukup', 'Belum ada ramalan tersimpan. Jalankan prediksi lalu simpan hasilnya.'));
}

/// [actual] : 'barang_id|minggu' → jumlah. [lastCompleteWeek] : Senin minggu terakhir yang sudah lengkap.
AkurasiRamalan hitungAkurasi(List<BarisRamalanTersimpan> rows, Map<String, double> actual, String lastCompleteWeek) {
  final runs = <String, ({int n, double ae, double sy, double err, Map<int, ({int n, double ae, double sy})> byH})>{};
  for (final f in rows) {
    if (f.mingguTarget.compareTo(lastCompleteWeek) > 0) continue;
    final y = actual['${f.barangId}|${f.mingguTarget}'] ?? 0;
    final r = runs[f.dibuatPada] ?? (n: 0, ae: 0.0, sy: 0.0, err: 0.0, byH: <int, ({int n, double ae, double sy})>{});
    final e = f.yhat - y;
    final h = r.byH[f.horizon] ?? (n: 0, ae: 0.0, sy: 0.0);
    final byH = {...r.byH, f.horizon: (n: h.n + 1, ae: h.ae + e.abs(), sy: h.sy + y)};
    runs[f.dibuatPada] = (n: r.n + 1, ae: r.ae + e.abs(), sy: r.sy + y, err: r.err + e, byH: byH);
  }
  final tanggal = runs.keys.toList()..sort();
  final out = [
    for (final t in tanggal)
      () {
        final r = runs[t]!;
        final hs = r.byH.keys.toList()..sort();
        return AkurasiRun(
          t,
          r.n,
          r.ae / r.n,
          r.err / r.n,
          r.sy > 0 ? r.ae / r.sy : null,
          [for (final h in hs) AkurasiPerHorizon(h, r.byH[h]!.ae / r.byH[h]!.n, r.byH[h]!.sy > 0 ? r.byH[h]!.ae / r.byH[h]!.sy : null)],
        );
      }()
  ];

  var drift = const StatusDrift('belum_cukup', 'Perlu minimal 3 eksekusi yang sudah bisa dinilai untuk memantau pergeseran akurasi.');
  final wapes = [for (final r in out) if (r.wape != null) r.wape!];
  if (wapes.length >= 3) {
    final prev = mean(wapes.sublist(0, wapes.length - 1)), last = wapes.last;
    String p(double v) => (v * 100).toStringAsFixed(0);
    drift = last > prev * 1.3
        ? StatusDrift('memburuk', 'Galat (WAPE) eksekusi terbaru ${p(last)}% naik >30% dari rata-rata sebelumnya (${p(prev)}%). Pertimbangkan melatih ulang / meninjau data.')
        : StatusDrift('stabil', 'Galat (WAPE) eksekusi terbaru ${p(last)}% — stabil terhadap rata-rata sebelumnya (${p(prev)}%).');
  }
  return AkurasiRamalan(out, drift);
}
