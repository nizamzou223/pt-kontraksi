// ignore_for_file: non_constant_identifier_names
import 'package:flutter/material.dart';

// Access via: context.s.key
extension L10nContext on BuildContext {
  AppStrings get s {
    final code = Localizations.localeOf(this).languageCode;
    return code == 'en' ? const AppStrings._en() : const AppStrings._id();
  }
}

class AppStrings {
  const AppStrings._id() : _en = false;
  const AppStrings._en() : _en = true;
  final bool _en;

  // ── Auth ──────────────────────────────────────────────────
  String get loginWelcome       => _en ? 'Welcome Back'                 : 'Selamat Datang';
  String get loginSubtitle      => _en ? 'Sign in with your email'      : 'Masuk menggunakan Email Anda';
  String get emailLabel         => _en ? 'Email'                        : 'Email';
  String get emailHint          => _en ? 'name@domain.com'              : 'nama@domain.com';
  String get emailRequired      => _en ? 'Email is required'            : 'Email wajib diisi';
  String get emailInvalid       => _en ? 'Invalid email format'         : 'Format email tidak valid';
  String get passwordLabel      => _en ? 'Password'                     : 'Password';
  String get passwordRequired   => _en ? 'Password is required'         : 'Password wajib diisi';
  String get passwordTooShort   => _en ? 'Minimum 6 characters'         : 'Minimal 6 karakter';
  String get loginBtn           => _en ? 'Sign In'                      : 'Masuk';
  String get loginLoading       => _en ? 'Verifying...'                 : 'Memverifikasi...';
  String get loginFailed        => _en ? 'Login Failed'                 : 'Login Gagal';
  String get loginInfo          => _en ? 'Use your registered email to sign in.\nNot registered? Contact administrator.' : 'Gunakan email yang terdaftar untuk masuk.\nBelum terdaftar? Hubungi administrator.';
  String get biometricLoginBtn  => _en ? 'Sign in with Biometric'       : 'Masuk dengan Biometrik';
  String get biometricPrompt    => _en ? 'Verify your identity'         : 'Verifikasi identitas Anda';
  String get biometricFailed    => _en ? 'Biometric authentication failed' : 'Autentikasi biometrik gagal';

  // ── Navigation ────────────────────────────────────────────
  String get navDashboard       => _en ? 'Dashboard'    : 'Dashboard';
  String get navPresensi        => _en ? 'Attendance'   : 'Presensi';
  String get navKasbon          => _en ? 'Cash Adv'     : 'Kasbon';
  String get navLembur          => _en ? 'Overtime'     : 'Lembur';
  String get navPermintaan      => _en ? 'Requests'     : 'Permintaan';
  String get navProfile         => _en ? 'Profile'      : 'Profil';
  String get navMaterial        => _en ? 'Material'     : 'Material';

  // ── Home ──────────────────────────────────────────────────
  String get greetMorning       => _en ? 'Good Morning'     : 'Selamat Pagi';
  String get greetAfternoon     => _en ? 'Good Afternoon'   : 'Selamat Siang';
  String get greetEvening       => _en ? 'Good Evening'     : 'Selamat Sore';
  String get greetNight         => _en ? 'Good Night'       : 'Selamat Malam';
  String get selectProject      => _en ? 'Select Project'   : 'Pilih Proyek';
  String get noProject          => _en ? 'No project assigned' : 'Belum ada proyek';
  String get selectProjectFirst => _en ? 'Select Project First' : 'Pilih Proyek Terlebih Dahulu';
  String get tapProjectToSelect => _en ? 'Tap project name above to select' : 'Ketuk nama proyek di atas untuk memilih';
  String get tapProjectToSwitch => _en ? 'Tap project to switch'   : 'Tap proyek untuk beralih';

  // ── Date / time helpers ───────────────────────────────────
  List<String> get monthShort   => _en
    ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    : ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  List<String> get dayShort     => _en
    ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    : ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  String get toDateSeparator    => _en ? 'to'     : 's/d';
  String get dateLabel          => _en ? 'Date: ' : 'Tanggal: ';
  String get todayDate          => _en ? 'Today'  : 'Hari Ini';

  // ── Common actions ────────────────────────────────────────
  String get save               => _en ? 'Save'          : 'Simpan';
  String get saveChanges        => _en ? 'Save Changes'  : 'Simpan Perubahan';
  String get savingLabel        => _en ? 'Saving...'     : 'Menyimpan...';
  String get cancel             => _en ? 'Cancel'        : 'Batal';
  String get delete             => _en ? 'Delete'        : 'Hapus';
  String get edit               => _en ? 'Edit'          : 'Edit';
  String get add                => _en ? 'Add'           : 'Tambah';
  String get close              => _en ? 'Close'         : 'Tutup';
  String get yes                => _en ? 'Yes'           : 'Ya';
  String get no                 => _en ? 'No'            : 'Tidak';
  String get search             => _en ? 'Search'        : 'Cari';
  String get filter             => _en ? 'Filter'        : 'Filter';
  String get refresh            => _en ? 'Refresh'       : 'Refresh';
  String get exportExcel        => _en ? 'Export Excel'  : 'Export Excel';
  String get exportPdf          => _en ? 'Export PDF'    : 'Export PDF';
  String get loading            => _en ? 'Loading...'    : 'Memuat...';
  String get processingLabel    => _en ? 'Processing...' : 'Memproses...';
  String get sendingLabel       => _en ? 'Sending...'    : 'Mengirim...';
  String get retry              => _en ? 'Retry'         : 'Coba Lagi';
  String get confirm            => _en ? 'Confirm'       : 'Konfirmasi';
  String get back               => _en ? 'Back'          : 'Kembali';
  String get logout             => _en ? 'Sign Out'      : 'Keluar';
  String get logoutTitle        => _en ? 'Sign Out'               : 'Keluar dari Aplikasi';
  String get logoutConfirm      => _en ? 'Are you sure you want to sign out from your account ' : 'Yakin ingin keluar dari akun ';
  String get logoutSuccess      => _en ? 'See You!'               : 'Sampai Jumpa!';
  String get logoutMsg          => _en ? 'Your session has ended' : 'Sesi Anda telah diakhiri';
  String get seeYou             => _en ? 'See you again!'         : 'Sampai jumpa lagi!';
  String get verifying          => _en ? 'Verifying...'           : 'Memverifikasi...';
  String get requiredField      => _en ? 'Required'               : 'Wajib diisi';
  String get optionalLabel      => _en ? 'Optional'               : 'Opsional';
  String get totalLabel         => _en ? 'Total'                  : 'Total';
  String get historyTab         => _en ? 'History'                : 'Riwayat';
  String get selectDateHint     => _en ? 'Select date'            : 'Pilih tanggal';
  String get allProjects        => _en ? 'All Projects'           : 'Semua Proyek';

  // ── Status labels ─────────────────────────────────────────
  String get statusAll          => _en ? 'All'         : 'Semua';
  String get statusPending      => _en ? 'Pending'     : 'Pending';
  String get statusApproved     => _en ? 'Approved'    : 'Disetujui';
  String get statusRejected     => _en ? 'Rejected'    : 'Ditolak';
  String get statusActive       => _en ? 'Active'      : 'Aktif';
  String get statusPaid         => _en ? 'Paid'        : 'Dibayar';
  String get statusLunas        => _en ? 'Settled'     : 'Lunas';
  String get statusBelumLunas   => _en ? 'Outstanding' : 'Belum Lunas';
  String get activeStatus       => _en ? 'Active'      : 'Aktif';
  String get inactiveStatus     => _en ? 'Inactive'    : 'Nonaktif';

  // ── Export results ────────────────────────────────────────
  String get excelSuccess       => _en ? 'Excel file created & opened ✓' : 'File Excel berhasil dibuat & dibuka ✓';
  String get pdfSuccess         => _en ? 'PDF file created & opened ✓'   : 'File PDF berhasil dibuat & dibuka ✓';
  String get exportFailed       => _en ? 'Export failed'                  : 'Gagal export';
  String get exportPdfFailed    => _en ? 'PDF export failed'              : 'Gagal export PDF';

  // ── Profile ───────────────────────────────────────────────
  String get profileTitle       => _en ? 'My Profile'           : 'Profil Saya';
  String get accountInfo        => _en ? 'Account Information'  : 'Informasi Akun';
  String get projectInfo        => _en ? 'Assigned Project'     : 'Proyek Ditugaskan';
  String get settingsTitle      => _en ? 'Settings'             : 'Pengaturan';
  String get darkModeLabel      => _en ? 'Dark Mode'            : 'Tema Gelap';
  String get darkModeOn         => _en ? 'Dark mode active'     : 'Mode gelap aktif';
  String get darkModeOff        => _en ? 'Light mode active'    : 'Mode terang aktif';
  String get languageLabel      => _en ? 'Language'             : 'Bahasa / Language';
  String get languageCurrent    => _en ? 'English'              : 'Indonesia';
  String get textSizeLabel      => _en ? 'Display Size'         : 'Ukuran Tampilan';
  String get textSizeSub        => _en ? 'Make text & icons bigger or smaller' : 'Perbesar atau perkecil teks & ikon';
  String get biometricLabel     => _en ? 'Biometric Login'      : 'Login Biometrik';
  String get biometricSubOn     => _en ? 'Fingerprint / Face ID active'     : 'Sidik jari / Face ID aktif';
  String get biometricSubOff    => _en ? 'Use fingerprint or Face ID'        : 'Gunakan sidik jari atau Face ID';
  String get appVersion         => 'Mandor App v1.0.0 · PT Krakatau Indah';
  String get fullNameLabel      => _en ? 'Full Name'       : 'Nama Lengkap';
  String get kodeKaryawanLabel  => _en ? 'Employee Code'   : 'Kode Karyawan';
  String get roleLabel          => _en ? 'Role'            : 'Role';
  String get positionLabel      => _en ? 'Position'        : 'Jabatan';
  String get projectNameLabel   => _en ? 'Project Name'    : 'Nama Proyek';
  String get projectCodeLabel   => _en ? 'Project Code'    : 'Kode Proyek';
  String get locationLabel      => _en ? 'Location'        : 'Lokasi';

  // ── Offline ───────────────────────────────────────────────
  String get offlineMsg         => _en ? 'Offline · showing cached data' : 'Offline · menampilkan data tersimpan';
  String get onlineMsg          => _en ? 'Back online · syncing'         : 'Terhubung kembali · menyinkronkan';
  String get cacheData          => _en ? 'Cached data · updated'         : 'Data cache · diperbarui';

  // ── Dashboard ─────────────────────────────────────────────
  String get dashWorkers           => _en ? 'Workers'             : 'Karyawan';
  String get dashPresent           => _en ? 'Present Today'       : 'Hadir Hari Ini';
  String get dashAbsent            => _en ? 'Absent'              : 'Tidak Hadir';
  String get dashPendingPayroll    => _en ? 'Pending Payroll'     : 'Gaji Pending';
  String get dashCashAdv           => _en ? 'Cash Advance'        : 'Total Kasbon';
  String get dashAttendanceToday   => _en ? "Today's Attendance"  : 'Presensi Hari Ini';
  String get dashRecorded          => _en ? 'Recorded'            : 'Tercatat';
  String get dashTotalEmployees    => _en ? 'Total Employees'     : 'Total Karyawan';
  String get dashOvertimeCashAdv   => _en ? 'Overtime & Cash Adv' : 'Lembur & Kasbon';
  String get dashPendingOvertime   => _en ? 'Pending Overtime'    : 'Lembur Pending';
  String get dashAwaitingApproval  => _en ? 'Awaiting approval'   : 'Menunggu persetujuan';
  String get dashThisMonthCashAdv  => _en ? 'This Month'          : 'Kasbon Bulan Ini';
  String get dashOutstandingAdv    => _en ? 'Outstanding Balance' : 'Sisa Kasbon Belum Lunas';
  String get dashAttendanceRate    => _en ? '% present this month': '% hadir bulan ini';
  String get dashQuickMenu         => _en ? 'Quick Menu'          : 'Menu Cepat';

  // ── Attendance / Presensi ─────────────────────────────────
  String get attendanceTitle      => _en ? 'Attendance'            : 'Presensi';
  String get scanQR               => _en ? 'Scan QR'               : 'Scan QR';
  String get inputManual          => _en ? 'Manual Entry'          : 'Input Manual';
  String get editAttendance       => _en ? 'Edit Attendance'       : 'Edit Presensi';
  String get deleteAttendance     => _en ? 'Delete Attendance'     : 'Hapus Presensi';
  String get attendanceDeleted    => _en ? 'Attendance deleted'    : 'Presensi berhasil dihapus';
  String get present              => _en ? 'Present'               : 'Hadir';
  String get absent               => _en ? 'Absent'                : 'Tidak Hadir';
  String get notYetRecorded       => _en ? 'Not yet recorded'      : 'Belum Input';
  String get searchEmployee       => _en ? 'Search employee...'    : 'Cari karyawan...';
  String get scanQRTitle          => _en ? 'Scan QR Attendance'    : 'Scan QR Presensi';
  String get pointCameraToQR      => _en ? 'Point camera to employee QR code' : 'Arahkan kamera ke QR Code karyawan';
  String get attendanceStatus     => _en ? 'Attendance Status'     : 'Status Kehadiran';
  String get clockIn              => _en ? 'Clock In'              : 'Jam Masuk';
  String get clockOut             => _en ? 'Clock Out'             : 'Jam Keluar';
  String get foodAllowance        => _en ? 'Food Allowance (Rp)'        : 'Uang Makan (Rp)';
  String get transportAllowance   => _en ? 'Transport Allowance (Rp)'   : 'Uang Transport (Rp)';
  String get outOfCityAllowance   => _en ? 'Out-of-City Allowance (Rp)' : 'Upah Luar Kota (Rp)';
  String get outOfCityHint        => _en ? '0 (fill if out-of-city)'    : '0 (isi jika dinas luar kota)';
  String get saveAttendance       => _en ? 'Save Attendance'       : 'Simpan Presensi';
  String get manualInputTitle     => _en ? 'Manual Attendance'     : 'Input Presensi Manual';
  String get selectEmployeeLabel  => _en ? 'Select Employee'       : 'Pilih Karyawan';
  String get recordedTab          => _en ? 'Recorded'              : 'Tercatat';
  String get notRecordedTab       => _en ? 'Not Recorded'          : 'Belum Input';
  String get selectEmpForHistory  => _en ? 'Select an employee to view attendance history.' : 'Pilih karyawan untuk melihat riwayat presensi.';
  String get noAttendanceInPeriod => _en ? 'No attendance data in this period.' : 'Tidak ada data presensi di periode ini.';
  String get descriptionHint      => _en ? 'Description...'        : 'Keterangan...';

  // ── Cash Advance / Kasbon ─────────────────────────────────
  String get cashAdvTitle         => _en ? 'Cash Advance'          : 'Kasbon';
  String get applyKasbon          => _en ? '+ Apply Cash Advance'  : '+ Ajukan Kasbon';
  String get searchEmpCode        => _en ? 'Search employee name / code...' : 'Cari nama / kode karyawan...';
  String get outstanding          => _en ? 'Outstanding'           : 'Outstanding';
  String get totalKasbon          => _en ? 'Total Cash Advance'    : 'Total Kasbon';
  String get deleteKasbon         => _en ? 'Delete Cash Advance'   : 'Hapus Kasbon';
  String get confirmDeleteKasbon  => _en ? 'Delete cash advance of ' : 'Hapus kasbon sebesar ';
  String get kasbonDeleted        => _en ? 'Cash advance deleted'  : 'Kasbon dihapus';
  String get kasbonAdded          => _en ? 'Cash advance added'    : 'Kasbon berhasil ditambahkan';
  String get kasbonAmountLabel    => _en ? 'Cash Advance Amount'   : 'Jumlah Kasbon';
  String get kasbonAmountInput    => _en ? 'Amount (Rp)'           : 'Jumlah Kasbon (Rp)';
  String get kasbonAmountHint     => _en ? 'e.g. 500000'           : 'Contoh: 500000';
  String get kasbonAmountPositive => _en ? 'Amount must be greater than 0' : 'Jumlah kasbon harus lebih dari 0';
  String get kasbonNotesHint      => _en ? 'Purpose, details...'  : 'Keperluan kasbon, keterangan, dll...';
  String get saveKasbon           => _en ? 'Save Cash Advance'     : 'Simpan Kasbon';
  String get outstandingBalance   => _en ? 'Outstanding Balance'   : 'Sisa Belum Lunas';
  String get paidLabel            => _en ? 'Paid'                  : 'Terbayar';
  String get paymentMethod        => _en ? 'Payment Method'        : 'Metode Pembayaran';
  String get salaryDeduction      => _en ? 'Salary Deduction'      : 'Potong Gaji';
  String get salaryDeductionDesc  => _en ? 'Deducted from monthly salary' : 'Dipotong otomatis dari gaji bulanan';
  String get selectEmployeeFirst  => _en ? 'Please select an employee first.' : 'Pilih karyawan terlebih dahulu.';

  // ── Overtime / Lembur ─────────────────────────────────────
  String get overtimeTitle        => _en ? 'Overtime'              : 'Lembur';
  String get inputLembur          => _en ? 'Input Overtime'        : 'Input Lembur';
  String get saveLembur           => _en ? 'Save Overtime'         : 'Simpan Lembur';
  String get totalApproved        => _en ? 'Total approved'        : 'Total disetujui';
  String get deleteLembur         => _en ? 'Delete Overtime'       : 'Hapus Lembur';
  String get deleteOvertimeMsg    => _en ? 'Delete overtime record' : 'Hapus data lembur';
  String get overtimeDeleted      => _en ? 'Overtime record deleted' : 'Data lembur dihapus';
  String get overtimeAdded        => _en ? 'Overtime added'        : 'Lembur berhasil ditambahkan';
  String get pendingOvertimeAlert => _en ? 'Overtime Awaiting Approval' : 'Lembur Menunggu Persetujuan';
  String get pendingOvertimeSub   => _en ? 'There are overtime requests pending admin review' : 'Ada pengajuan lembur yang perlu ditinjau oleh admin';
  String get startTime            => _en ? 'Start Time'            : 'Jam Mulai';
  String get endTime              => _en ? 'End Time'              : 'Jam Selesai';
  String get endAfterStart        => _en ? 'End time must be after start time' : 'Waktu selesai harus setelah waktu mulai';
  String get overtimeCalc         => _en ? 'Overtime Calculation'  : 'Kalkulasi Lembur';
  String get dailyWage            => _en ? 'Daily Wage'            : 'Gaji Harian';
  String get overtimeRate         => _en ? 'Overtime Rate (1×/hr)' : 'Tarif Lembur (1×/jam)';
  String get durationLabel        => _en ? 'Duration'              : 'Durasi';
  String get totalOvertimeLabel   => _en ? 'Total Overtime'        : 'Total Lembur';
  String get overtimeReasonHint   => _en ? 'Reason or overtime details...' : 'Alasan atau keterangan lembur...';

  // ── Material Requests / Permintaan ────────────────────────
  String get requestTitle         => _en ? 'Material Request'      : 'Permintaan Barang';
  String get requestWarehouse     => _en ? 'Request to Warehouse'  : 'Minta Barang ke Gudang';
  String get requestMaterialBtn   => _en ? 'Request Material'      : 'Minta Barang';
  String get cancelRequestTitle   => _en ? 'Cancel Request'        : 'Batalkan Permintaan';
  String get cancelRequestMsg     => _en ? 'Cancel this material request?' : 'Batalkan permintaan barang ini?';
  String get requestCancelled     => _en ? 'Request cancelled'     : 'Permintaan dibatalkan';
  String get requestSent          => _en ? 'Request sent to warehouse' : 'Permintaan berhasil dikirim ke gudang';
  String get sendRequest          => _en ? 'Send Request'          : 'Kirim Permintaan';
  String get warehouseStock       => _en ? 'Warehouse Stock'       : 'Stok Gudang';
  String get requestedQty         => _en ? 'Requested Qty'         : 'Jumlah Diminta';
  String get selectMaterialHint   => _en ? 'Select material...'    : 'Pilih barang...';
  String get stockLabel           => _en ? 'Stock: '               : 'Stok: ';
  String get availableStock       => _en ? 'Available: '           : 'Stok tersedia: ';
  String get notesDescLabel       => _en ? 'Notes / Description'   : 'Catatan / Keterangan';
  String get purposeHint          => _en ? 'Purpose or additional notes...' : 'Keperluan atau catatan tambahan...';
  String get quantityPositive     => _en ? 'Quantity must be greater than 0' : 'Jumlah harus lebih dari 0';
  String get requestedMaterial    => _en ? 'Requested Material'    : 'Barang yang Diminta';

  // ── Form labels ───────────────────────────────────────────
  String get fieldEmployee        => _en ? 'Employee'              : 'Karyawan';
  String get fieldDate            => _en ? 'Date'                  : 'Tanggal';
  String get fieldAmount          => _en ? 'Amount'                : 'Jumlah';
  String get fieldNotes           => _en ? 'Notes'                 : 'Catatan';
  String get fieldStatus          => _en ? 'Status'                : 'Status';
  String get fieldMethod          => _en ? 'Method'                : 'Metode';
  String get fieldProject         => _en ? 'Project'               : 'Proyek';
  String get selectEmployee       => _en ? 'Select employee...'    : 'Pilih karyawan...';
  String get selectProject_       => _en ? 'Select project...'     : 'Pilih proyek...';

  // ── Empty states ──────────────────────────────────────────
  String get emptyKasbon            => _en ? 'No cash advance records' : 'Belum ada kasbon';
  String get emptyLembur            => _en ? 'No overtime records'     : 'Belum ada data lembur';
  String get emptyPermintaan        => _en ? 'No material requests'    : 'Belum ada permintaan';
  String get emptyPresensi          => _en ? 'No attendance recorded.\nScan QR or enter manually.' : 'Belum ada presensi tercatat.\nScan QR atau input manual.';
  String get emptyKaryawan          => _en ? 'No employees yet'        : 'Belum ada karyawan';
  String get tapPlusToAddKaryawan   => _en ? 'Tap the button to add an employee' : 'Tekan tombol untuk menambah karyawan';

  // ── Karyawan ──────────────────────────────────────────────
  String get karyawanTitle          => _en ? 'Employees'       : 'Karyawan';
  String get tambahKaryawan         => _en ? 'Add Employee'    : 'Tambah Karyawan';
  String get navKaryawan            => _en ? 'Employees'       : 'Karyawan';

  // ── Search / filter ───────────────────────────────────────
  String get recentSearches       => _en ? 'Recent Searches' : 'Pencarian Terbaru';
  String get clearHistory         => _en ? 'Clear'           : 'Hapus';
  String get noResults            => _en ? 'No results found' : 'Tidak ada hasil';
  String get searchAll            => _en ? 'Search in all pages...' : 'Cari di semua halaman...';
}
