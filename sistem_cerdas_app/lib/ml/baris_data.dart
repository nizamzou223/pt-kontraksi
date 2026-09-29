// Baris data operasional yang dibaca (hanya-baca) untuk deteksi anomali. Nama kolom mengikuti tabel Supabase.

double? _num(dynamic v) {
  if (v == null || v == '') return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

int? _int(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse(v.toString()));

class KaryawanRow {
  final int id;
  final String nama;
  final bool? statusAktif;
  final String? tanggalBergabung;
  final int? jabatanId;
  final double gajiHarian;
  const KaryawanRow({required this.id, required this.nama, this.statusAktif, this.tanggalBergabung, this.jabatanId, this.gajiHarian = 0});

  factory KaryawanRow.fromJson(Map<String, dynamic> j) {
    final jab = j['jabatan'];
    final override = _num(j['gaji_harian_override']);
    final dasar = jab is Map ? _num(jab['gaji_harian']) : null;
    return KaryawanRow(
      id: _int(j['id'])!,
      nama: (j['nama_karyawan'] ?? '').toString(),
      statusAktif: j['status_aktif'] as bool?,
      tanggalBergabung: j['tanggal_bergabung']?.toString(),
      jabatanId: _int(j['jabatan_id']),
      gajiHarian: (override != null && override != 0) ? override : (dasar ?? 0),
    );
  }
}

class PresensiRow {
  final int id;
  final int? projectId;
  final int karyawanId;
  final String tanggal;
  final String? jamMasuk;
  final String? jamKeluar;
  final double? durasiJam;
  final String? statusKehadiran;
  final String? metodeInput;
  final String? catatan;
  const PresensiRow({
    required this.id,
    this.projectId,
    required this.karyawanId,
    required this.tanggal,
    this.jamMasuk,
    this.jamKeluar,
    this.durasiJam,
    this.statusKehadiran,
    this.metodeInput,
    this.catatan,
  });

  factory PresensiRow.fromJson(Map<String, dynamic> j) => PresensiRow(
        id: _int(j['id'])!,
        projectId: _int(j['project_id']),
        karyawanId: _int(j['karyawan_id']) ?? 0,
        tanggal: j['tanggal'].toString().substring(0, 10),
        jamMasuk: j['jam_masuk']?.toString(),
        jamKeluar: j['jam_keluar']?.toString(),
        durasiJam: _num(j['durasi_jam']),
        statusKehadiran: j['status_kehadiran']?.toString(),
        metodeInput: j['metode_input']?.toString(),
        catatan: j['catatan']?.toString(),
      );

  PresensiRow salin({String? jamMasuk, String? jamKeluar, double? durasiJam}) => PresensiRow(
        id: id,
        projectId: projectId,
        karyawanId: karyawanId,
        tanggal: tanggal,
        jamMasuk: jamMasuk ?? this.jamMasuk,
        jamKeluar: jamKeluar ?? this.jamKeluar,
        durasiJam: durasiJam ?? this.durasiJam,
        statusKehadiran: statusKehadiran,
        metodeInput: metodeInput,
        catatan: catatan,
      );
}

class LemburRow {
  final int id;
  final int? projectId;
  final int karyawanId;
  final String tanggal;
  final String? jamMulai;
  final String? jamSelesai;
  final double? durasiJam;
  final double? tarifLembur;
  final double? totalLembur;
  final String? statusPersetujuan;
  final String? catatan;
  const LemburRow({
    required this.id,
    this.projectId,
    required this.karyawanId,
    required this.tanggal,
    this.jamMulai,
    this.jamSelesai,
    this.durasiJam,
    this.tarifLembur,
    this.totalLembur,
    this.statusPersetujuan,
    this.catatan,
  });

  factory LemburRow.fromJson(Map<String, dynamic> j) => LemburRow(
        id: _int(j['id'])!,
        projectId: _int(j['project_id']),
        karyawanId: _int(j['karyawan_id']) ?? 0,
        tanggal: j['tanggal'].toString().substring(0, 10),
        jamMulai: j['jam_mulai']?.toString(),
        jamSelesai: j['jam_selesai']?.toString(),
        durasiJam: _num(j['durasi_jam']),
        tarifLembur: _num(j['tarif_lembur']),
        totalLembur: _num(j['total_lembur']),
        statusPersetujuan: j['status_persetujuan']?.toString(),
        catatan: j['catatan']?.toString(),
      );

  LemburRow salin({double? durasiJam, double? totalLembur, String? jamSelesai}) => LemburRow(
        id: id,
        projectId: projectId,
        karyawanId: karyawanId,
        tanggal: tanggal,
        jamMulai: jamMulai,
        jamSelesai: jamSelesai ?? this.jamSelesai,
        durasiJam: durasiJam ?? this.durasiJam,
        tarifLembur: tarifLembur,
        totalLembur: totalLembur ?? this.totalLembur,
        statusPersetujuan: statusPersetujuan,
        catatan: catatan,
      );
}

class KasbonRow {
  final int id;
  final int? projectId;
  final int karyawanId;
  final double jumlahKasbon;
  final double sisaKasbon;
  final String tanggalKasbon;
  final bool statusLunas;
  const KasbonRow({
    required this.id,
    this.projectId,
    required this.karyawanId,
    required this.jumlahKasbon,
    required this.sisaKasbon,
    required this.tanggalKasbon,
    this.statusLunas = false,
  });

  factory KasbonRow.fromJson(Map<String, dynamic> j) => KasbonRow(
        id: _int(j['id'])!,
        projectId: _int(j['project_id']),
        karyawanId: _int(j['karyawan_id']) ?? 0,
        jumlahKasbon: _num(j['jumlah_kasbon']) ?? 0,
        sisaKasbon: _num(j['sisa_kasbon']) ?? 0,
        tanggalKasbon: j['tanggal_kasbon'].toString().substring(0, 10),
        statusLunas: j['status_lunas'] == true,
      );

  KasbonRow salin({double? jumlahKasbon, double? sisaKasbon}) => KasbonRow(
        id: id,
        projectId: projectId,
        karyawanId: karyawanId,
        jumlahKasbon: jumlahKasbon ?? this.jumlahKasbon,
        sisaKasbon: sisaKasbon ?? this.sisaKasbon,
        tanggalKasbon: tanggalKasbon,
        statusLunas: statusLunas,
      );
}

class GajiRow {
  final int id;
  final int karyawanId;
  final String periodeMulai;
  final double gajiKotor;
  final double gajiBersih;
  final double totalPotonganKasbon;
  final double totalHariHadir;
  const GajiRow({
    required this.id,
    required this.karyawanId,
    required this.periodeMulai,
    required this.gajiKotor,
    required this.gajiBersih,
    required this.totalPotonganKasbon,
    required this.totalHariHadir,
  });

  factory GajiRow.fromJson(Map<String, dynamic> j) => GajiRow(
        id: _int(j['id'])!,
        karyawanId: _int(j['karyawan_id']) ?? 0,
        periodeMulai: j['periode_mulai'].toString().substring(0, 10),
        gajiKotor: _num(j['gaji_kotor']) ?? 0,
        gajiBersih: _num(j['gaji_bersih']) ?? 0,
        totalPotonganKasbon: _num(j['total_potongan_kasbon']) ?? 0,
        totalHariHadir: _num(j['total_hari_hadir']) ?? 0,
      );
}

/// Kumpulan data kepegawaian untuk satu analisis.
class DataKepegawaian {
  final List<KaryawanRow> karyawan;
  final List<PresensiRow> presensi;
  final List<LemburRow> lembur;
  final List<KasbonRow> kasbon;
  final List<GajiRow> gaji;
  final String today; // tanggal akhir periode
  final String dari; // awal periode yang dilaporkan (riwayat sebelumnya hanya untuk baseline)
  final String sampai;
  const DataKepegawaian({
    required this.karyawan,
    required this.presensi,
    required this.lembur,
    required this.kasbon,
    required this.gaji,
    required this.today,
    required this.dari,
    required this.sampai,
  });
}
