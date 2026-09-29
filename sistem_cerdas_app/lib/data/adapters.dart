// Mengubah hasil analisis (lapisan ML) menjadi model tampilan yang sama dengan data tersimpan di database,
// sehingga hasil yang baru dijalankan dan hasil tersimpan tampil dengan komponen UI yang sama.
import '../ml/anomaly_detector.dart';
import '../ml/forecast_pipeline.dart';
import '../ml/timeseries.dart';
import '../models/models.dart';

DateTime _tgl(String s) => DateTime.parse(s.substring(0, 10));

/// Hasil peramalan → daftar barang berperingkat risiko (habis → aman, lalu jumlah pesan terbesar).
HasilRamalan hasilRamalanDari(HasilPrediksi h, DateTime dibuat, {int riwayatMinggu = 12}) {
  final items = <BarangRamalan>[];
  for (final b in h.items) {
    final mulai = b.values.length > riwayatMinggu ? b.values.length - riwayatMinggu : 0;
    final r = b.rekomendasi;
    items.add(BarangRamalan(
      barangId: b.id,
      nama: b.nama,
      kode: b.kode,
      satuan: b.satuan,
      stok: b.stok,
      stokMinimal: b.stokMinimal,
      titikPemesananUlang: r.reorderPoint,
      stokPengaman: r.safetyStock,
      jumlahDisarankan: r.orderQty,
      perkiraanHabis: r.stockoutWeek == null ? null : _tgl(r.stockoutWeek!),
      risiko: Risiko.parse(r.risiko),
      alasan: r.alasan,
      modelNama: b.modelNama,
      mase: b.mase,
      ramalan: [
        for (var i = 0; i < b.forecast.length; i++)
          TitikRamalan(minggu: _tgl(b.forecast[i].minggu), horizon: i + 1, yhat: b.forecast[i].yhat, bawah: b.forecast[i].low, atas: b.forecast[i].high),
      ],
      riwayat: [for (var i = mulai; i < b.values.length; i++) TitikRiwayat(_tgl(h.weeks[i]), b.values[i])],
    ));
  }
  items.sort((a, b) {
    final c = a.risiko.index.compareTo(b.risiko.index);
    return c != 0 ? c : b.jumlahDisarankan.compareTo(a.jumlahDisarankan);
  });
  return HasilRamalan(dibuat, items);
}

double? _hingga(double v) => v.isFinite ? v : null;

/// Metrik evaluasi model dalam bentuk JSON (NaN/Infinity → null agar valid disimpan sebagai JSONB).
Map<String, dynamic> metrikDari(HasilPrediksi h) => {
      'evaluasi': [
        for (final m in h.evaluasi)
          {
            'id': m.id,
            'nama': m.nama,
            'kelompok': m.kelompok,
            'mae': _hingga(m.m.mae),
            'rmse': _hingga(m.m.rmse),
            'wape': _hingga(m.m.wape),
            'mase': _hingga(m.m.mase),
            'bias': _hingga(m.m.bias),
            'meanRank': _hingga(m.meanRank),
            'wins': m.wins,
          }
      ],
      'cakupanInterval': h.cakupanInterval == null
          ? null
          : {
              'picp': _hingga(h.cakupanInterval!.picp),
              'width': _hingga(h.cakupanInterval!.width),
              'nominal': h.cakupanInterval!.nominal,
              'n': h.cakupanInterval!.n,
            },
    };

Map<String, dynamic> parameterDari(HasilPrediksi h) {
  final p = h.parameter!;
  return {
    'horizon': p.horizon,
    'nOrigins': p.nOrigins,
    'leadTimeWeeks': p.leadTimeWeeks,
    'serviceLevel': p.serviceLevel,
    'nItems': p.nItems,
    'nWeeks': p.nWeeks,
    'startWeek': p.startWeek,
  };
}

InfoModel infoModelDari(HasilPrediksi h, DateTime dibuat, {int id = 0}) => InfoModel(
      id: id,
      jenis: 'forecast',
      nama: h.terbaik?.nama ?? h.modelTerbaik ?? '-',
      versi: isoDate(dibuat),
      aktif: true,
      dilatihPada: dibuat,
      dataDari: h.weeks.isEmpty ? null : _tgl(h.weeks.first),
      dataSampai: h.weeks.isEmpty ? null : _tgl(h.weeks.last),
      hyperparameter: parameterDari(h),
      metrik: metrikDari(h),
    );

Anomali anomaliDari(ItemAnomali i, {required int id, String? proyekNama}) => Anomali(
      id: id,
      sumberTabel: i.sumberTabel,
      sumberId: i.sumberId,
      karyawan: i.namaKaryawan,
      proyek: proyekNama,
      tanggal: _tgl(i.tanggal),
      skor: i.skor,
      tingkat: Tingkat.parse(i.tingkat),
      alasan: [
        for (final a in i.alasan) AlasanAnomali(kode: a.kode, tingkat: Tingkat.parse(a.tingkat), teks: a.teks, metode: a.metode),
      ],
      metode: i.metode,
      status: StatusTinjauan.baru,
      catatan: null,
      ditinjauPada: null,
    );
