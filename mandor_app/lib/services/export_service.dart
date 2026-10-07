import 'dart:io';
import 'package:excel/excel.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:path_provider/path_provider.dart';
import 'package:open_file/open_file.dart';
import 'package:intl/intl.dart';

// ══════════════════════════════════════════════════════════════
// EXPORT SERVICE — Excel + PDF  (excel ^4.0.6, pdf ^3.11.1)
// ══════════════════════════════════════════════════════════════
class ExportService {
  static final _rp = NumberFormat.currency(locale:'id_ID', symbol:'Rp', decimalDigits:0);
  static String _f(dynamic v) { try { return _rp.format(v ?? 0); } catch(_) { return '-'; } }
  // Kolom DECIMAL/NUMERIC Postgres dikirim Supabase sebagai String, bukan num JSON.
  static num _n(dynamic v) { if (v == null) return 0; if (v is num) return v; return num.tryParse(v.toString()) ?? 0; }
  // Gaji pokok per baris presensi — konsisten dengan admin-web hitungGajiMingguan:
  // tanpa jam tercatat = 1 hari penuh; <8 jam = proporsional per jam; >=8 jam = hari penuh + sisa per jam.
  static double _gajiPokokDariDurasi(double durasiJam, double gajiHarian) {
    if (durasiJam <= 0) return gajiHarian;
    final gajiPerJam = gajiHarian / 8;
    final hariPenuh = (durasiJam / 8).floor();
    final sisaJam = durasiJam % 8;
    if (hariPenuh == 0) return durasiJam * gajiPerJam;
    return hariPenuh * gajiHarian + sisaJam * gajiPerJam;
  }
  static String _d(String? d) { if (d==null||d.isEmpty) return '-'; try { return DateFormat('dd/MM/yyyy').format(DateTime.parse(d)); } catch(_) { return d; } }
  static String _dt(String? d) { if (d==null||d.isEmpty) return '-'; try { return DateFormat('dd/MM/yyyy HH:mm').format(DateTime.parse(d).toLocal()); } catch(_) { return d; } }
  static String _fd() => DateFormat('yyyyMMdd_HHmm').format(DateTime.now());
  static String _now() => DateFormat('dd/MM/yyyy HH:mm').format(DateTime.now());

  // ── Excel color helpers ───────────────────────────────────
  static ExcelColor _ec(String hex) => ExcelColor.fromHexString(hex);
  static const _cBrand   = 'FF2563EB';
  static const _cWhite   = 'FFFFFFFF';
  static const _cAlt     = 'FFEFF6FF';
  static const _cGreen   = 'FFDCFCE7';
  static const _cRed     = 'FFFEE2E2';
  static const _cAmber   = 'FFFEF9C3';
  static const _cSubHead = 'FFDBEAFE';

  // ── PDF colors ────────────────────────────────────────────
  static const _pBrand  = PdfColor.fromInt(0xFF2563EB);
  static const _pGreen  = PdfColor.fromInt(0xFF059669);

  // ════════════════════════════════════════════════════════
  // EXCEL — Presensi (incl. upah_luar_kota, grouped by golongan)
  // ════════════════════════════════════════════════════════
  static Future<void> exportPresensiExcel({
    required List<Map<String,dynamic>> data,
    required String tanggal,
    String? namaProject,
  }) async {
    final ex = Excel.createExcel(); final sh = ex['Presensi']; ex.delete('Sheet1');
    _title(sh, 'LAPORAN PRESENSI — ${namaProject??"Semua Project"}', 12, sub: 'Tanggal: ${_d(tanggal)}  ·  Cetak: ${_now()}');
    _hdr(sh, 2, ['No','Nama Karyawan','Kode Karyawan','Jabatan','Status','Jam Masuk','Jam Keluar','Uang Makan','Uang Transport','Upah Luar Kota','Gaji Harian','Total Gaji'],
        [4,24,14,18,13,10,10,15,15,16,16,18]);

    // Sort by golongan then nama
    final sorted = [...data]..sort((a, b) {
      final jabA = ((a['karyawan'] as Map?)?['jabatan'] as Map?)?['nama_jabatan'] as String? ?? '';
      final jabB = ((b['karyawan'] as Map?)?['jabatan'] as Map?)?['nama_jabatan'] as String? ?? '';
      final cmp = jabA.compareTo(jabB);
      return cmp != 0 ? cmp : ((a['karyawan'] as Map?)?['nama_karyawan'] as String? ?? '').compareTo((b['karyawan'] as Map?)?['nama_karyawan'] as String? ?? '');
    });

    double totalGaji = 0;
    for (var i=0; i<sorted.length; i++) {
      final p=sorted[i]; final k = p['karyawan'] != null ? p['karyawan'] as Map : <String,dynamic>{}; final jab = k['jabatan'] != null ? k['jabatan'] as Map : <String,dynamic>{};
      final hadir=p['status_kehadiran']=='hadir';
      final gajiHarian = _n(jab['gaji_harian']).toDouble();
      final uMakan = _n(p['uang_makan']).toDouble();
      final uTransport = _n(p['uang_transport']).toDouble();
      final uLuarKota = _n(p['upah_luar_kota']).toDouble();
      final durasiJam = _n(p['durasi_jam']).toDouble();
      final totalRow = hadir ? _gajiPokokDariDurasi(durasiJam, gajiHarian) + uMakan + uTransport + uLuarKota : 0.0;
      totalGaji += totalRow;
      _row(sh, i+3, i, [
        IntCellValue(i+1), TextCellValue(k['nama_karyawan']??'-'), TextCellValue(k['kode_karyawan']?.toString()??'-'),
        TextCellValue(jab['nama_jabatan']??'-'), TextCellValue(hadir?'Hadir':'Tidak Hadir'),
        TextCellValue(p['jam_masuk']!=null?(p['jam_masuk'] as String).substring(0,5):'-'),
        TextCellValue(p['jam_keluar']!=null?(p['jam_keluar'] as String).substring(0,5):'-'),
        DoubleCellValue(uMakan),
        DoubleCellValue(uTransport),
        DoubleCellValue(uLuarKota),
        DoubleCellValue(gajiHarian),
        DoubleCellValue(totalRow),
      ], over: {4: hadir?_cGreen:_cRed, 9: uLuarKota > 0 ? 'FFEDE9FE' : null});
    }
    final hadirCount=sorted.where((p)=>p['status_kehadiran']=='hadir').length;
    _sum(sh, sorted.length+3, 12, 'Hadir: $hadirCount / ${sorted.length}  |  Total Gaji Keseluruhan: ${_f(totalGaji)}');
    await _xOpen(ex, 'Presensi_${tanggal.replaceAll('-','')}.xlsx');
  }

  // ════════════════════════════════════════════════════════
  // EXCEL — Lembur
  // ════════════════════════════════════════════════════════
  static Future<void> exportLemburExcel({
    required List<Map<String,dynamic>> data,
    required String namaProject, String? dari, String? sampai,
  }) async {
    final ex=Excel.createExcel(); final sh=ex['Lembur']; ex.delete('Sheet1');
    _title(sh, 'LAPORAN LEMBUR — $namaProject', 9, dari: dari, sampai: sampai);
    _hdr(sh, 2, ['No','Nama','Kode Karyawan','Tanggal','Jam Mulai','Jam Selesai','Durasi (j)','Total (Rp)','Status'],
        [4,22,13,12,10,10,10,16,12]);
    for (var i=0; i<data.length; i++) {
      final l=data[i]; final k=(l['karyawan'] != null ? l['karyawan'] as Map : <String,dynamic>{});
      final s=(l['status_persetujuan'] as String?) ?? 'pending';
      _row(sh, i+3, i, [
        IntCellValue(i+1), TextCellValue(k['nama_karyawan']??'-'), TextCellValue(k['kode_karyawan']?.toString()??'-'),
        TextCellValue(_d(l['tanggal'] as String?)),
        TextCellValue((l['jam_mulai'] as String?)?.substring(0,5)??'-'),
        TextCellValue((l['jam_selesai'] as String?)?.substring(0,5)??'-'),
        DoubleCellValue((l['durasi_jam'] as num?)?.toDouble()??0),
        DoubleCellValue((l['total_lembur'] as num?)?.toDouble()??0),
        TextCellValue(s=='disetujui'?'Disetujui':s=='ditolak'?'Ditolak':'Pending'),
      ], over:{8: s=='disetujui'?_cGreen:s=='ditolak'?_cRed:_cAmber});
    }
    final total=data.where((l)=>l['status_persetujuan']=='disetujui').fold(0.0,(s,l)=>s+((l['total_lembur'] as num?)?.toDouble()??0));
    _sum(sh, data.length+3, 9, 'Total Disetujui: ${_f(total)}');
    await _xOpen(ex, 'Lembur_${_fd()}.xlsx');
  }

  // ════════════════════════════════════════════════════════
  // PDF — Lembur
  // ════════════════════════════════════════════════════════
  static Future<void> exportLemburPDF({
    required List<Map<String,dynamic>> data, required String namaProject,
    String? dari, String? sampai,
  }) async {
    final pdf = pw.Document();
    final approved = data.where((l)=>l['status_persetujuan']=='disetujui');
    final totalJam = approved.fold(0.0,(s,l)=>s+((l['durasi_jam'] as num?)?.toDouble()??0));
    final totalRp  = approved.fold(0.0,(s,l)=>s+((l['total_lembur'] as num?)?.toDouble()??0));
    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4, margin: const pw.EdgeInsets.all(28),
      header: (_) => _pdfHdr('LAPORAN LEMBUR', namaProject, dari!=null?'${_d(dari)} – ${_d(sampai)}':'', const PdfColor.fromInt(0xFFD97706)),
      footer: (_) => _pdfFtr(),
      build: (_) => [
        _pills([
          ('${data.length}','Total', const PdfColor.fromInt(0xFFD97706)),
          ('${approved.length}','Disetujui',PdfColors.green700),
          ('${totalJam.toStringAsFixed(1)} j','Jam',PdfColors.indigo700),
          (_f(totalRp),'Nilai',PdfColors.green700),
        ]),
        pw.SizedBox(height: 14),
        pw.TableHelper.fromTextArray(
          headers: ['No','Nama','Jabatan','Tanggal','Jam','Durasi','Total (Rp)','Status'],
          data: data.asMap().entries.map((e) {
            final l=e.value; final k=(l['karyawan'] != null ? l['karyawan'] as Map : <String,dynamic>{});
            final jab=(k['jabatan'] != null ? k['jabatan'] as Map : <String,dynamic>{});
            final s=l['status_persetujuan'] as String? ?? 'pending';
            return [
              '${e.key+1}', k['nama_karyawan']??'-', jab['nama_jabatan']??'-',
              _d(l['tanggal'] as String?),
              '${(l['jam_mulai'] as String?)?.substring(0,5)??'-'} – ${(l['jam_selesai'] as String?)?.substring(0,5)??'-'}',
              '${((l['durasi_jam'] as num?)?.toDouble()??0).toStringAsFixed(1)} j',
              _f(l['total_lembur']),
              s=='disetujui'?'Disetujui':s=='ditolak'?'Ditolak':'Pending',
            ];
          }).toList(),
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 8),
          headerDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFD97706)),
          cellStyle: const pw.TextStyle(fontSize: 7),
          cellAlignments: {0: pw.Alignment.center, 7: pw.Alignment.center},
          oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFFFFBEB)),
          border: pw.TableBorder.all(color: const PdfColor.fromInt(0xFFFDE68A), width: 0.5),
        ),
      ],
    ));
    await _pOpen(pdf, 'Lembur_${_fd()}.pdf');
  }

  // ════════════════════════════════════════════════════════
  // EXCEL — Kasbon
  // ════════════════════════════════════════════════════════
  static Future<void> exportKasbonExcel({required List<Map<String,dynamic>> data}) async {
    final ex=Excel.createExcel(); final sh=ex['Kasbon']; ex.delete('Sheet1');
    _title(sh, 'LAPORAN KASBON — PT Krakatau Indah', 8, sub: 'Cetak: ${_now()}');
    _hdr(sh, 2, ['No','Nama Karyawan','Kode Karyawan','Project','Tanggal','Jumlah (Rp)','Sisa (Rp)','Status'],
        [4,22,13,18,12,16,16,12]);
    for (var i=0; i<data.length; i++) {
      final k = data[i]['karyawan'] != null ? data[i]['karyawan'] as Map : <String,dynamic>{}; final proj = data[i]['project'] != null ? data[i]['project'] as Map : <String,dynamic>{};
      final lunas=data[i]['status_lunas'] as bool? ?? false;
      _row(sh, i+3, i, [
        IntCellValue(i+1), TextCellValue(k['nama_karyawan']??'-'), TextCellValue(k['kode_karyawan']?.toString()??'-'),
        TextCellValue(proj['nama_project']??'-'), TextCellValue(_d(data[i]['tanggal_kasbon'] as String?)),
        DoubleCellValue((data[i]['jumlah_kasbon'] as num?)?.toDouble()??0),
        DoubleCellValue((data[i]['sisa_kasbon'] as num?)?.toDouble()??0),
        TextCellValue(lunas?'Lunas':'Belum Lunas'),
      ], over:{7: lunas?_cGreen:_cRed});
    }
    final out=data.where((k)=>k['status_lunas']==false).fold(0.0,(s,k)=>s+((k['sisa_kasbon'] as num?)?.toDouble()??0));
    _sum(sh, data.length+3, 8, 'Outstanding: ${_f(out)}');
    await _xOpen(ex, 'Kasbon_${_fd()}.xlsx');
  }

  // ════════════════════════════════════════════════════════
  // PDF — Kasbon (grouped by golongan)
  // ════════════════════════════════════════════════════════
  static Future<void> exportKasbonPDF({
    required List<Map<String,dynamic>> data, required String namaProject,
  }) async {
    final pdf = pw.Document();
    final outstanding = data.where((k)=>k['status_lunas']==false).fold(0.0,(s,k)=>s+((k['sisa_kasbon'] as num?)?.toDouble()??0));

    // Group by jabatan
    final byGol = <String, List<Map<String,dynamic>>>{};
    for (final k in data) {
      final gol = ((k['karyawan'] as Map?)?['jabatan'] as Map?)?['nama_jabatan'] as String? ?? 'Tanpa Golongan';
      byGol.putIfAbsent(gol, () => []).add(k);
    }

    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4, margin: const pw.EdgeInsets.all(28),
      header: (_) => _pdfHdr('LAPORAN KASBON', namaProject, 'Cetak: ${_now()}', const PdfColor.fromInt(0xFF059669)),
      footer: (_) => _pdfFtr(),
      build: (_) {
        final lunas = data.where((k)=>k['status_lunas']==true).length;
        final widgets = <pw.Widget>[
          _pills([
            ('${data.length}','Total',const PdfColor.fromInt(0xFF2563EB)),
            ('${data.length - lunas}','Belum Lunas',PdfColors.red700),
            ('$lunas','Lunas',PdfColors.green700),
            (_f(outstanding),'Outstanding',PdfColors.red700),
          ]),
          pw.SizedBox(height: 14),
        ];
        byGol.entries.toList()
          ..sort((a,b)=>a.key.compareTo(b.key))
          ..forEach((entry) {
            widgets.add(pw.Padding(
              padding: const pw.EdgeInsets.only(bottom:6, top:4),
              child: pw.Text(entry.key.toUpperCase(),
                style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 9, color: const PdfColor.fromInt(0xFF1E3A8A))),
            ));
            widgets.add(pw.TableHelper.fromTextArray(
              headers: ['No','Nama Karyawan','Tanggal','Jumlah (Rp)','Sisa (Rp)','Status'],
              data: entry.value.asMap().entries.map((e) {
                final k=e.value; final kar=(k['karyawan'] != null ? k['karyawan'] as Map : <String,dynamic>{});
                final lunas2=k['status_lunas'] as bool? ?? false;
                return ['${e.key+1}', kar['nama_karyawan']??'-',
                  _d(k['tanggal_kasbon'] as String?), _f(k['jumlah_kasbon']), _f(k['sisa_kasbon']),
                  lunas2?'Lunas':'Belum Lunas'];
              }).toList(),
              headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 8),
              headerDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFF059669)),
              cellStyle: const pw.TextStyle(fontSize: 7),
              cellAlignments: {0: pw.Alignment.center, 5: pw.Alignment.center},
              oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFF0FDF4)),
              border: pw.TableBorder.all(color: const PdfColor.fromInt(0xFFD1FAE5), width: 0.5),
            ));
            widgets.add(pw.SizedBox(height: 10));
          });
        return widgets;
      },
    ));
    await _pOpen(pdf, 'Kasbon_${_fd()}.pdf');
  }

  // ════════════════════════════════════════════════════════
  // LAPORAN MINGGUAN HARIAN per Pekerjaan (presensi + lembur + kasbon
  // digabung, kolom harian Minggu–Sabtu). Pengelompokan "paket pekerjaan"
  // diketik manual oleh mandor saat export (bukan field tersimpan di
  // database), sama seperti versi admin-web — lihat exportService.js.
  // ════════════════════════════════════════════════════════
  static const _hariId = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  static const _bulanSingkat = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

  static List<Map<String,String>> _daftarTanggal(String dari, String sampai) {
    final out = <Map<String,String>>[];
    var d = DateTime.parse(dari);
    final akhir = DateTime.parse(sampai);
    while (!d.isAfter(akhir)) {
      final iso = '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
      out.add({'iso': iso, 'hari': _hariId[d.weekday % 7], 'label': '${d.day.toString().padLeft(2,'0')}-${_bulanSingkat[d.month-1]}'});
      d = d.add(const Duration(days: 1));
    }
    return out;
  }

  // Jml Total = (hari hadir x upah harian) + total lembur (Rp) - total kasbon periode ini.
  static List<Map<String,dynamic>> _rekapMingguanHarian({
    required List<Map<String,dynamic>> presensiRows,
    required List<Map<String,dynamic>> lemburRows,
    required List<Map<String,dynamic>> kasbonRows,
    required List<Map<String,String>> tanggalList,
  }) {
    final byKaryawan = <int, Map<String,dynamic>>{};
    Map<String,dynamic> baris(int id, Map<String,dynamic> r) {
      return byKaryawan.putIfAbsent(id, () {
        final k = r['karyawan'] != null ? r['karyawan'] as Map : <String,dynamic>{};
        final jab = k['jabatan'] != null ? k['jabatan'] as Map : <String,dynamic>{};
        return {
          'nama': k['nama_karyawan'] ?? '-',
          'golongan': jab['nama_jabatan'] ?? '-',
          'upahHarian': _n(k['gaji_harian_override'] ?? jab['gaji_harian']).toDouble(),
          'hadir': <String,bool>{},
          'totalLembur': 0.0,
          'totalKasbon': 0.0,
        };
      });
    }

    for (final r in presensiRows) {
      final id = r['karyawan_id'] as int;
      final row = baris(id, r);
      if (r['status_kehadiran'] == 'hadir') (row['hadir'] as Map<String,bool>)[r['tanggal'] as String] = true;
    }
    for (final r in lemburRows) {
      final id = r['karyawan_id'] as int;
      final row = baris(id, r);
      row['totalLembur'] = (row['totalLembur'] as double) + _n(r['total_lembur']).toDouble();
    }
    for (final r in kasbonRows) {
      final id = r['karyawan_id'] as int;
      final row = baris(id, r);
      row['totalKasbon'] = (row['totalKasbon'] as double) + _n(r['jumlah_kasbon']).toDouble();
    }

    final list = byKaryawan.values.map((row) {
      final hadir = row['hadir'] as Map<String,bool>;
      final jmlHari = tanggalList.where((t) => hadir[t['iso']] == true).length;
      final jumlahUpah = jmlHari * (row['upahHarian'] as double);
      final jmlTotal = jumlahUpah + (row['totalLembur'] as double) - (row['totalKasbon'] as double);
      return {...row, 'jmlHari': jmlHari, 'jumlahUpah': jumlahUpah, 'jmlTotal': jmlTotal};
    }).toList()
      ..sort((a,b) => (a['nama'] as String).compareTo(b['nama'] as String));
    return list;
  }

  static Future<void> exportLaporanMingguanExcel({
    required List<Map<String,dynamic>> presensiRows,
    required List<Map<String,dynamic>> lemburRows,
    required List<Map<String,dynamic>> kasbonRows,
    required String namaProject, String? namaPekerjaan,
    required String tanggalMulai, required String tanggalSelesai,
  }) async {
    final tanggalList = _daftarTanggal(tanggalMulai, tanggalSelesai);
    final list = _rekapMingguanHarian(presensiRows: presensiRows, lemburRows: lemburRows, kasbonRows: kasbonRows, tanggalList: tanggalList);

    final ex = Excel.createExcel(); final sh = ex['Laporan Mingguan']; ex.delete('Sheet1');
    final judul = 'LAPORAN MINGGUAN — ${namaPekerjaan?.isNotEmpty == true ? namaPekerjaan : namaProject}';
    final cols = 6 + tanggalList.length;
    _title(sh, judul, cols, sub: 'Project: $namaProject  |  Periode: ${_d(tanggalMulai)} – ${_d(tanggalSelesai)}  ·  Cetak: ${_now()}');
    final headers = ['No','Nama','Golongan', ...tanggalList.map((t)=>'${t['hari']}\n${t['label']}'), 'Hari','Upah Harian','Jumlah Upah','Lembur (Rp)','Kasbon','Jml Total'];
    final widths = [4.0,20.0,14.0, ...tanggalList.map((_)=>9.0), 8.0,14.0,15.0,14.0,13.0,15.0];
    _hdr(sh, 2, headers, widths);

    double totJumlahUpah=0, totLembur=0, totKasbon=0, totJmlTotal=0; int totHari=0;
    for (var i=0; i<list.length; i++) {
      final r = list[i];
      final hadir = r['hadir'] as Map<String,bool>;
      totHari += r['jmlHari'] as int;
      totJumlahUpah += r['jumlahUpah'] as double;
      totLembur += r['totalLembur'] as double;
      totKasbon += r['totalKasbon'] as double;
      totJmlTotal += r['jmlTotal'] as double;
      _row(sh, i+3, i, [
        IntCellValue(i+1), TextCellValue(r['nama'] as String), TextCellValue(r['golongan'] as String),
        ...tanggalList.map((t) => TextCellValue(hadir[t['iso']] == true ? 'Hadir' : '-')),
        IntCellValue(r['jmlHari'] as int),
        DoubleCellValue(r['upahHarian'] as double),
        DoubleCellValue(r['jumlahUpah'] as double),
        DoubleCellValue(r['totalLembur'] as double),
        DoubleCellValue(r['totalKasbon'] as double),
        DoubleCellValue(r['jmlTotal'] as double),
      ]);
    }
    _sum(sh, list.length+3, cols,
        'TOTAL (${list.length} karyawan)  |  Hari: $totHari  |  Upah: ${_f(totJumlahUpah)}  |  Lembur: ${_f(totLembur)}  |  Kasbon: ${_f(totKasbon)}  |  Jml Total: ${_f(totJmlTotal)}');
    await _xOpen(ex, 'LaporanMingguan_${_fd()}.xlsx');
  }

  static Future<void> exportLaporanMingguanPDF({
    required List<Map<String,dynamic>> presensiRows,
    required List<Map<String,dynamic>> lemburRows,
    required List<Map<String,dynamic>> kasbonRows,
    required String namaProject, String? namaPekerjaan,
    required String tanggalMulai, required String tanggalSelesai,
  }) async {
    final tanggalList = _daftarTanggal(tanggalMulai, tanggalSelesai);
    final list = _rekapMingguanHarian(presensiRows: presensiRows, lemburRows: lemburRows, kasbonRows: kasbonRows, tanggalList: tanggalList);
    final pdf = pw.Document();
    final judul = namaPekerjaan?.isNotEmpty == true ? namaPekerjaan! : namaProject;

    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4.landscape, margin: const pw.EdgeInsets.all(24),
      header: (_) => _pdfHdr('LAPORAN MINGGUAN — $judul', namaProject, 'Periode: ${_d(tanggalMulai)} – ${_d(tanggalSelesai)}', _pBrand),
      footer: (_) => _pdfFtr(),
      build: (_) => [
        pw.TableHelper.fromTextArray(
          headers: ['No','Nama','Golongan', ...tanggalList.map((t)=>'${t['hari']}\n${t['label']}'),
            'Hari','Upah Harian','Jumlah Upah','Lembur','Kasbon','Jml Total'],
          data: list.asMap().entries.map((e) {
            final i=e.key; final r=e.value; final hadir = r['hadir'] as Map<String,bool>;
            return ['${i+1}', r['nama'], r['golongan'],
              ...tanggalList.map((t) => hadir[t['iso']] == true ? 'H' : '-'),
              '${r['jmlHari']}', _f(r['upahHarian']), _f(r['jumlahUpah']), _f(r['totalLembur']), _f(r['totalKasbon']), _f(r['jmlTotal'])];
          }).toList(),
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 7),
          headerDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFF2563EB)),
          cellStyle: const pw.TextStyle(fontSize: 7),
          cellAlignments: {0: pw.Alignment.center},
          oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFEFF6FF)),
          border: pw.TableBorder.all(color: const PdfColor.fromInt(0xFFBFDBFE), width: 0.5),
        ),
      ],
    ));
    await _pOpen(pdf, 'LaporanMingguan_${_fd()}.pdf');
  }

  // ════════════════════════════════════════════════════════
  // EXCEL — Stok Masuk
  // ════════════════════════════════════════════════════════
  static Future<void> exportStokMasukExcel({
    required List<Map<String,dynamic>> data, required String dari, required String sampai,
  }) async {
    final ex=Excel.createExcel(); final sh=ex['Stok Masuk']; ex.delete('Sheet1');
    _title(sh, 'LAPORAN STOK MASUK', 8, dari: dari, sampai: sampai);
    _hdr(sh, 2, ['No','Tanggal','Kode','Nama Barang','Jumlah','Satuan','Harga Satuan','Total Harga'],
        [4,13,13,24,9,8,14,16]);
    for (var i=0; i<data.length; i++) {
      final d=data[i]; final b=(d['barang'] != null ? d['barang'] as Map : <String,dynamic>{});
      final sat=(b['satuan_barang'] as Map?)?['singkatan']??'-';
      _row(sh, i+3, i, [
        IntCellValue(i+1), TextCellValue(_dt(d['created_at'] as String?)),
        TextCellValue(b['kode_barang']??'-'), TextCellValue(b['nama_barang']??'-'),
        IntCellValue((d['jumlah'] as num?)?.toInt()??0), TextCellValue(sat),
        DoubleCellValue((d['harga_satuan'] as num?)?.toDouble()??0),
        DoubleCellValue((d['total_harga'] as num?)?.toDouble()??0),
      ]);
    }
    final total=data.fold(0.0,(s,d)=>s+((d['total_harga'] as num?)?.toDouble()??0));
    _sum(sh, data.length+3, 8, 'Total Nilai Masuk: ${_f(total)}');
    await _xOpen(ex, 'StokMasuk_${_fd()}.xlsx');
  }

  // ════════════════════════════════════════════════════════
  // EXCEL — Stok Keluar
  // ════════════════════════════════════════════════════════
  static Future<void> exportStokKeluarExcel({
    required List<Map<String,dynamic>> data, required String dari, required String sampai,
  }) async {
    final ex=Excel.createExcel(); final sh=ex['Stok Keluar']; ex.delete('Sheet1');
    _title(sh, 'LAPORAN STOK KELUAR', 7, dari: dari, sampai: sampai);
    _hdr(sh, 2, ['No','Tanggal','Kode','Nama Barang','Jumlah','Satuan','Project Tujuan'],
        [4,13,13,24,9,8,22]);
    for (var i=0; i<data.length; i++) {
      final d=data[i]; final b=(d['barang'] != null ? d['barang'] as Map : <String,dynamic>{}); final proj=(d['project'] != null ? d['project'] as Map : <String,dynamic>{});
      final sat=(b['satuan_barang'] as Map?)?['singkatan']??'-';
      _row(sh, i+3, i, [
        IntCellValue(i+1), TextCellValue(_dt(d['created_at'] as String?)),
        TextCellValue(b['kode_barang']??'-'), TextCellValue(b['nama_barang']??'-'),
        IntCellValue((d['jumlah'] as num?)?.toInt()??0), TextCellValue(sat),
        TextCellValue(proj['nama_project']??'-'),
      ]);
    }
    await _xOpen(ex, 'StokKeluar_${_fd()}.xlsx');
  }

  // ════════════════════════════════════════════════════════
  // EXCEL — Daftar Barang
  // ════════════════════════════════════════════════════════
  static Future<void> exportDaftarBarangExcel({required List<Map<String,dynamic>> data}) async {
    final ex=Excel.createExcel(); final sh=ex['Daftar Barang']; ex.delete('Sheet1');
    _title(sh, 'DAFTAR BARANG — PT Krakatau Indah', 8, sub: 'Cetak: ${_now()}');
    _hdr(sh, 2, ['No','Kode','Nama Barang','Kategori','Satuan','Stok','Min','Harga Beli'],
        [4,13,24,16,8,8,7,14]);
    for (var i=0; i<data.length; i++) {
      final d=data[i];
      final kat=(d['kategori_barang'] as Map?)?['nama_kategori']??'-';
      final sat=(d['satuan_barang'] as Map?)?['singkatan']??'-';
      final stok=(d['stok_saat_ini'] as num?)?.toInt()??0;
      final min=(d['stok_minimal'] as num?)?.toInt()??0;
      _row(sh, i+3, i, [
        IntCellValue(i+1), TextCellValue(d['kode_barang']??'-'), TextCellValue(d['nama_barang']??'-'),
        TextCellValue(kat), TextCellValue(sat), IntCellValue(stok), IntCellValue(min),
        DoubleCellValue((d['harga_beli'] as num?)?.toDouble()??0),
      ], over:{5: stok<=min?_cRed:null});
    }
    await _xOpen(ex, 'DaftarBarang_${_fd()}.xlsx');
  }

  // ════════════════════════════════════════════════════════
  // PDF — Presensi
  // ════════════════════════════════════════════════════════
  static Future<void> exportPresensiPDF({
    required List<Map<String,dynamic>> data, required String tanggal, String? namaProject,
  }) async {
    final pdf = pw.Document();
    final hadir = data.where((p)=>p['status_kehadiran']=='hadir').length;
    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4, margin: const pw.EdgeInsets.all(28),
      header: (_) => _pdfHdr('LAPORAN PRESENSI', namaProject??'Semua Project', 'Tgl: ${_d(tanggal)}', _pBrand),
      footer: (_) => _pdfFtr(),
      build: (_) => [
        _pills([
          ('${data.length}','Total',_pBrand), ('$hadir','Hadir',PdfColors.green700),
          ('${data.length-hadir}','Tidak Hadir',PdfColors.red700)]),
        pw.SizedBox(height: 14),
        pw.TableHelper.fromTextArray(
          headers: ['No','Nama Karyawan','Kode Karyawan','Status','Jam Masuk','Jam Keluar','Metode'],
          data: data.asMap().entries.map((e) {
            final p=e.value; final k = p['karyawan'] != null ? p['karyawan'] as Map : <String,dynamic>{};
            return ['${e.key+1}', k['nama_karyawan']??'-', k['kode_karyawan']?.toString()??'-',
              p['status_kehadiran']=='hadir'?'Hadir':'Tidak Hadir',
              p['jam_masuk']!=null?(p['jam_masuk'] as String).substring(0,5):'-',
              p['jam_keluar']!=null?(p['jam_keluar'] as String).substring(0,5):'-',
              p['metode_input']=='qr_code'?'QR':p['metode_input']=='otomatis'?'Auto':'Manual'];
          }).toList(),
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 9),
          headerDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFF2563EB)),
          cellStyle: const pw.TextStyle(fontSize: 8),
          cellAlignments: {0: pw.Alignment.center, 3: pw.Alignment.center},
          oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFEFF6FF)),
          border: pw.TableBorder.all(color: const PdfColor.fromInt(0xFFBFDBFE), width: 0.5),
        ),
      ],
    ));
    await _pOpen(pdf, 'Presensi_${tanggal.replaceAll('-','')}.pdf');
  }

  // ════════════════════════════════════════════════════════
  // PDF — Stok Masuk
  // ════════════════════════════════════════════════════════
  static Future<void> exportStokMasukPDF({
    required List<Map<String,dynamic>> data, required String dari, required String sampai,
  }) async {
    final pdf = pw.Document();
    final totalNilai = data.fold(0.0,(s,d)=>s+((d['total_harga'] as num?)?.toDouble()??0));
    pdf.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4, margin: const pw.EdgeInsets.all(28),
      header: (_) => _pdfHdr('LAPORAN STOK MASUK', 'PT Krakatau Indah', 'Periode: ${_d(dari)} – ${_d(sampai)}', _pGreen),
      footer: (_) => _pdfFtr(),
      build: (_) => [
        _pills([('${data.length}','Transaksi',_pGreen), (_f(totalNilai),'Total Nilai',_pGreen)]),
        pw.SizedBox(height: 14),
        pw.TableHelper.fromTextArray(
          headers: ['No','Tanggal','Nama Barang','Jumlah','Harga Satuan','Total'],
          data: data.asMap().entries.map((e) {
            final d=e.value; final b=(d['barang'] != null ? d['barang'] as Map : <String,dynamic>{});
            final sat=(b['satuan_barang'] as Map?)?['singkatan']??'';
            return ['${e.key+1}', _dt(d['created_at'] as String?), b['nama_barang']??'-',
              '${d['jumlah']} $sat', _f(d['harga_satuan']), _f(d['total_harga'])];
          }).toList(),
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: PdfColors.white, fontSize: 9),
          headerDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFF059669)),
          cellStyle: const pw.TextStyle(fontSize: 8),
          cellAlignments: {0: pw.Alignment.center, 3: pw.Alignment.center, 4: pw.Alignment.centerRight, 5: pw.Alignment.centerRight},
          oddRowDecoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFF0FDF4)),
          border: pw.TableBorder.all(color: const PdfColor.fromInt(0xFFD1FAE5), width: 0.5),
        ),
      ],
    ));
    await _pOpen(pdf, 'StokMasuk_${_fd()}.pdf');
  }

  // ════════════════════════════════════════════════════════
  // EXCEL PRIVATE HELPERS
  // ════════════════════════════════════════════════════════
  static void _title(Sheet sh, String title, int cols, {String? dari, String? sampai, String? sub}) {
    final end = String.fromCharCode(64 + cols);
    sh.merge(CellIndex.indexByString('A1'), CellIndex.indexByString('${end}1'));
    final c1 = sh.cell(CellIndex.indexByString('A1'));
    c1.value = TextCellValue(title);
    c1.cellStyle = CellStyle(backgroundColorHex: _ec(_cBrand), fontColorHex: _ec(_cWhite),
        bold: true, fontSize: 13, horizontalAlign: HorizontalAlign.Center, verticalAlign: VerticalAlign.Center);
    sh.setRowHeight(0, 26);
    final subText = dari != null
        ? 'Periode: ${_d(dari)} s/d ${_d(sampai)}  ·  Cetak: ${_now()}'
        : (sub ?? 'Cetak: ${_now()}');
    sh.merge(CellIndex.indexByString('A2'), CellIndex.indexByString('${end}2'));
    final c2 = sh.cell(CellIndex.indexByString('A2'));
    c2.value = TextCellValue(subText);
    c2.cellStyle = CellStyle(backgroundColorHex: _ec(_cSubHead), fontSize: 10,
        horizontalAlign: HorizontalAlign.Center, verticalAlign: VerticalAlign.Center);
    sh.setRowHeight(1, 18);
  }

  static void _hdr(Sheet sh, int row, List<String> hdrs, List<double> ws) {
    sh.setRowHeight(row, 22);
    for (var i=0; i<hdrs.length; i++) {
      final c = sh.cell(CellIndex.indexByColumnRow(columnIndex: i, rowIndex: row));
      c.value = TextCellValue(hdrs[i]);
      c.cellStyle = CellStyle(backgroundColorHex: _ec(_cBrand), fontColorHex: _ec(_cWhite),
          bold: true, fontSize: 10, horizontalAlign: HorizontalAlign.Center, verticalAlign: VerticalAlign.Center);
      if (i < ws.length) sh.setColumnWidth(i, ws[i]);
    }
  }

  static void _row(Sheet sh, int row, int idx, List<CellValue> vals, {Map<int,String?>? over}) {
    sh.setRowHeight(row, 18);
    final altBg = idx % 2 == 1 ? _cAlt : null;
    for (var j=0; j<vals.length; j++) {
      final c = sh.cell(CellIndex.indexByColumnRow(columnIndex: j, rowIndex: row));
      c.value = vals[j];
      final bgStr = (over != null && over.containsKey(j)) ? over[j] : altBg;
      final isNum = vals[j] is IntCellValue || vals[j] is DoubleCellValue;
      c.cellStyle = CellStyle(
        backgroundColorHex: _ec(bgStr ?? 'FFFFFFFF'),
        fontSize: 10,
        horizontalAlign: j==0 ? HorizontalAlign.Center : (isNum ? HorizontalAlign.Right : HorizontalAlign.Left),
        verticalAlign: VerticalAlign.Center,
      );
    }
  }

  static void _sum(Sheet sh, int row, int cols, String text) {
    sh.merge(CellIndex.indexByColumnRow(columnIndex:0, rowIndex:row),
             CellIndex.indexByColumnRow(columnIndex:cols-1, rowIndex:row));
    final c = sh.cell(CellIndex.indexByColumnRow(columnIndex:0, rowIndex:row));
    c.value = TextCellValue(text);
    c.cellStyle = CellStyle(backgroundColorHex: _ec(_cAmber), bold: true, fontSize: 10);
    sh.setRowHeight(row, 18);
  }

  // ════════════════════════════════════════════════════════
  // PDF PRIVATE HELPERS
  // ════════════════════════════════════════════════════════
  static pw.Widget _pdfHdr(String title, String sub, String period, PdfColor color) =>
    pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.Container(
        padding: const pw.EdgeInsets.fromLTRB(14,10,14,10),
        decoration: pw.BoxDecoration(color: color, borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6))),
        child: pw.Row(children: [
          pw.Expanded(child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text(title, style: pw.TextStyle(color: PdfColors.white, fontSize: 13, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 2),
            // FIX: PdfColors.white70 tidak ada → pakai PdfColor dengan opacity
            pw.Text('$sub  ·  $period', style: const pw.TextStyle(
              color: PdfColor.fromInt(0xCCFFFFFF), fontSize: 8)),
          ])),
          pw.Text('PT Krakatau Indah', style: const pw.TextStyle(
            color: PdfColor.fromInt(0xCCFFFFFF), fontSize: 8)),
        ]),
      ),
      pw.SizedBox(height: 12),
    ]);

  static pw.Widget _pdfFtr() => pw.Container(
    padding: const pw.EdgeInsets.only(top:5),
    decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColors.grey300, width: 0.5))),
    child: pw.Row(children: [
      pw.Text('PT Krakatau Indah', style: const pw.TextStyle(color: PdfColors.grey500, fontSize: 7)),
      pw.Spacer(),
      pw.Text('Cetak: ${_now()}', style: const pw.TextStyle(color: PdfColors.grey500, fontSize: 7)),
    ]));

  static pw.Widget _pills(List<(String,String,PdfColor)> items) =>
    pw.Row(children: items.map((item) => pw.Padding(
      padding: const pw.EdgeInsets.only(right: 8),
      child: pw.Container(
        padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: pw.BoxDecoration(
          color: PdfColor(item.$3.red, item.$3.green, item.$3.blue, 0.12),
          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6))),
        child: pw.Row(mainAxisSize: pw.MainAxisSize.min, children: [
          pw.Text(item.$1, style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold, color: item.$3)),
          pw.SizedBox(width: 5),
          pw.Text(item.$2, style: pw.TextStyle(fontSize: 9, color: item.$3)),
        ]),
      ))).toList());

  // ════════════════════════════════════════════════════════
  // FILE I/O
  // ════════════════════════════════════════════════════════
  static Future<void> _xOpen(Excel ex, String name) async {
    final bytes = ex.encode()!;
    final dir = await _dir();
    final file = File('${dir.path}/$name');
    await file.writeAsBytes(bytes);
    await OpenFile.open(file.path);
  }

  static Future<void> _pOpen(pw.Document pdf, String name) async {
    final bytes = await pdf.save();
    final dir = await _dir();
    final file = File('${dir.path}/$name');
    await file.writeAsBytes(bytes);
    await OpenFile.open(file.path);
  }

  static Future<Directory> _dir() async {
    if (Platform.isAndroid) {
      final d = Directory('/storage/emulated/0/Download/KaliPelus');
      if (!await d.exists()) await d.create(recursive: true);
      return d;
    }
    return getApplicationDocumentsDirectory();
  }
}