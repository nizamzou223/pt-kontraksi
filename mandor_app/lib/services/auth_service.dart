import 'package:supabase_flutter/supabase_flutter.dart';

// ============================================================
// Model User — sesuai tabel public.users
// ============================================================
class UserModel {
  final int id;
  final String email;
  final String namaLengkap;
  final String role;
  final int? karyawanId;
  final int? projectId;
  final bool statusAktif;
  final Map<String, dynamic>? karyawan;
  final Map<String, dynamic>? project;
  // NIK 16 digit adalah field resmi (lihat admin-web/migration_nik_16_digit.sql);
  // id_karyawan hanya cadangan untuk data lama yang belum sempat diisi NIK-nya.
  String get idKaryawan => karyawan?['nik'] as String? ?? karyawan?['id_karyawan'] as String? ?? '-';

  UserModel({
    required this.id,
    required this.email,
    required this.namaLengkap,
    required this.role,
    this.karyawanId,
    this.projectId,
    required this.statusAktif,
    this.karyawan,
    this.project,
  });

  factory UserModel.fromMap(Map<String, dynamic> map) {
    return UserModel(
      id: (map['id'] as num).toInt(),
      email: map['email'] as String? ?? '',
      namaLengkap: map['nama_lengkap'] as String? ?? '',
      role: map['role'] as String? ?? 'staff',
      karyawanId: map['karyawan_id'] != null
          ? (map['karyawan_id'] as num).toInt()
          : null,
      projectId: map['project_id'] != null
          ? (map['project_id'] as num).toInt()
          : null,
      statusAktif: map['status_aktif'] as bool? ?? true,
      karyawan: map['karyawan'] as Map<String, dynamic>?,
      project: map['project'] as Map<String, dynamic>?,
    );
  }

  String get displayRole {
    switch (role) {
      case 'mandor': return 'Mandor Proyek';
      case 'admin': return 'Administrator';
      case 'hr': return 'HR';
      default: return role;
    }
  }
}

// ============================================================
// Auth Service — Mandor App
// ============================================================
class AuthService {
  final _client = Supabase.instance.client;

  // Role yang diizinkan masuk ke Mandor App
  // Sesuai ROLES di admin-web: 'admin', 'hr', 'mandor', 'staff'
  static const _allowedRoles = {'mandor', 'admin', 'hr'};

  // ── LOGIN via EMAIL (internal / admin use) ───────────────
  Future<UserModel> login(String email, String password) async {
    try {
      final resp = await _client.auth.signInWithPassword(
        email: email.trim().toLowerCase(),
        password: password,
      );
      if (resp.user == null) {
        throw Exception('Login gagal. Periksa email dan password Anda.');
      }

      final user = await _fetchUserFromDb(email.trim().toLowerCase());

      if (!_allowedRoles.contains(user.role)) {
        await _client.auth.signOut();
        throw Exception(
          'Akses ditolak.\n'
          'Aplikasi ini hanya untuk Mandor Proyek.\n'
          'Role akun Anda: ${user.role}',
        );
      }
      if (!user.statusAktif) {
        await _client.auth.signOut();
        throw Exception('Akun Anda dinonaktifkan. Hubungi administrator.');
      }

      return user;
    } on AuthException catch (e) {
      throw Exception(_parseError(e.message));
    } catch (e) {
      if (e.toString().startsWith('Exception:')) rethrow;
      throw Exception('Terjadi kesalahan: $e');
    }
  }

  // ── LOGIN via NIK (untuk karyawan / mandor) ───────────────
  Future<UserModel> loginByNik(String nik, String password) async {
    try {
      // Sebelum login, klien (role anon) tidak boleh membaca tabel apa pun (RLS).
      // Pencarian email dilakukan lewat RPC sempit email_for_nik (SECURITY DEFINER).
      final email = await _client.rpc('email_for_nik', params: {'p_nik': nik.trim()});

      if (email == null || (email as String).isEmpty) {
        // Pesan sengaja seragam agar tidak membocorkan NIK mana yang terdaftar.
        throw Exception(
          'NIK atau password salah, atau akun belum dibuat.\n'
          'Hubungi administrator jika masalah berlanjut.',
        );
      }

      // Login dengan email yang ditemukan
      return await login(email, password);
    } on AuthException catch (e) {
      throw Exception(_parseNikError(e.message));
    } on PostgrestException catch (e) {
      final m = e.message.toLowerCase();
      if (m.contains('fetch') || m.contains('network') || m.contains('connection') ||
          m.contains('failed') || m.contains('offline')) {
        throw Exception('Koneksi gagal. Periksa koneksi internet Anda.');
      }
      throw Exception('Kesalahan database: ${e.message}');
    } catch (e) {
      if (e.toString().startsWith('Exception:')) rethrow;
      throw Exception('Terjadi kesalahan. Periksa koneksi internet Anda.');
    }
  }

  // ── FETCH USER dari tabel public.users ────────────────────
  Future<UserModel> _fetchUserFromDb(String email) async {
    final data = await _client
        .from('users')
        .select('''
          id, email, nama_lengkap, role, status_aktif,
          karyawan_id, project_id,
          karyawan:karyawan_id (
            id, nama_karyawan, nik, id_karyawan,
            jabatan:jabatan_id ( id, nama_jabatan, gaji_harian, uang_makan, uang_transport )
          ),
          project:project_id (
            id, kode_project, nama_project, lokasi, status_project
          )
        ''')
        .eq('email', email)
        .maybeSingle();

    if (data == null) {
      throw Exception(
        'Akun tidak ditemukan di sistem.\n'
        'Minta administrator untuk mendaftarkan akun Anda\n'
        'di menu Pengaturan → Akun Mobile (Mandor).',
      );
    }

    return UserModel.fromMap(data);
  }

  Future<UserModel> fetchUserData(String email) =>
      _fetchUserFromDb(email.trim().toLowerCase());

  // ── RESTORE SESSION ───────────────────────────────────────
  Future<UserModel?> restoreSession() async {
    try {
      final session = _client.auth.currentSession;
      if (session == null) return null;
      if (session.isExpired) {
        final res = await _client.auth.refreshSession();
        if (res.session == null) return null;
      }
      return await _fetchUserFromDb(
          _client.auth.currentUser!.email!);
    } catch (_) {
      return null;
    }
  }

  // ── PROYEK MANDOR ─────────────────────────────────────────
  Future<List<Map<String, dynamic>>> getMandorProjects(
    int? userId,
    int? karyawanId,
  ) async {
    try {
      final projects = <Map<String, dynamic>>[];

      // Sumber 1: project_karyawan (penugasan aktif)
      if (karyawanId != null) {
        final rows = await _client
            .from('project_karyawan')
            .select('project:project_id(id,kode_project,nama_project,lokasi,status_project)')
            .eq('karyawan_id', karyawanId)
            .eq('status_assignment', 'aktif');

        for (final row in rows as List) {
          final p = row['project'] as Map<String, dynamic>?;
          if (p != null &&
              p['status_project'] == 'aktif' &&
              !projects.any((x) => x['id'] == p['id'])) {
            projects.add(p);
          }
        }
      }

      // Sumber 2: users.project_id (default dari admin)
      if (userId != null) {
        final row = await _client
            .from('users')
            .select('project:project_id(id,kode_project,nama_project,lokasi,status_project)')
            .eq('id', userId)
            .maybeSingle();

        final p = row?['project'] as Map<String, dynamic>?;
        if (p != null &&
            p['status_project'] == 'aktif' &&
            !projects.any((x) => x['id'] == p['id'])) {
          projects.add(p);
        }
      }

      // TIDAK ada fallback "semua proyek" di sini secara sengaja: daftar ini dipakai
      // untuk memilih proyek OTOMATIS saat aplikasi dibuka, jadi harus hanya proyek
      // yang benar-benar sudah ditugaskan. Bila kosong, layar depan menawarkan
      // activeProjectsCatalog() agar mandor memilih sendiri (lihat pilihProyekSendiri).
      projects.sort((a, b) =>
          (a['nama_project'] as String).compareTo(b['nama_project'] as String));
      return projects;
    } catch (e) {
      throw Exception('Gagal memuat proyek: $e');
    }
  }

  /// Pesan yang jelas saat RPC belum ada di database (migrasi belum dijalankan admin) —
  /// menyamarkan error teknis Postgres/PostgREST yang membingungkan bagi mandor.
  String _pesanRpc(Object e, String penjelasanFitur) {
    final msg = e.toString();
    final belumAda = e is PostgrestException && e.code == 'PGRST202' ||
        msg.contains('Could not find the function');
    if (belumAda) {
      return 'Fitur $penjelasanFitur belum aktif di sistem. '
          'Minta administrator menjalankan pembaruan database '
          '(MIGRATION_PROJECT_PICKER_MANDOR.sql) terlebih dahulu.';
    }
    return e is PostgrestException ? e.message : msg.replaceFirst('Exception: ', '');
  }

  /// Katalog SEMUA proyek aktif (nama/kode/lokasi saja) — dipakai saat mandor belum
  /// ditugaskan ke proyek mana pun, agar tetap bisa memilih sendiri proyek yang sedang
  /// ia kerjakan. RLS tabel `project` membatasi ke proyek yang sudah ditugaskan, jadi
  /// katalog ini diambil lewat RPC sempit (lihat MIGRATION_PROJECT_PICKER_MANDOR.sql).
  Future<List<Map<String, dynamic>>> activeProjectsCatalog() async {
    try {
      final all = await _client.rpc('active_projects_catalog');
      return List<Map<String, dynamic>>.from(all as List);
    } catch (e) {
      throw Exception(_pesanRpc(e, 'daftar proyek'));
    }
  }

  /// Mandor memilih proyeknya sendiri (dari activeProjectsCatalog atau daftar yang
  /// sudah ditugaskan) — tersimpan sebagai proyek default akun ini, sehingga presensi/
  /// lembur/kasbon di proyek itu langsung bisa dipakai tanpa menunggu admin.
  Future<void> pilihProyekSendiri(int projectId) async {
    try {
      await _client.rpc('mandor_pilih_proyek', params: {'p_project_id': projectId});
    } catch (e) {
      throw Exception(_pesanRpc(e, 'pilih proyek sendiri'));
    }
  }

  Future<void> logout() => _client.auth.signOut();
  User? get currentUser => _client.auth.currentUser;

  // ── PARSE ERROR ───────────────────────────────────────────
  String _parseNikError(String msg) {
    final m = msg.toLowerCase();
    if (m.contains('invalid login credentials') ||
        m.contains('invalid credentials') ||
        m.contains('wrong password') ||
        m.contains('invalid email or password')) {
      return 'NIK atau password salah.\n'
             'Pastikan password sesuai dengan yang\n'
             'didaftarkan oleh administrator.';
    }
    if (m.contains('too many') || m.contains('rate limit')) {
      return 'Terlalu banyak percobaan login.\nTunggu beberapa menit lalu coba lagi.';
    }
    if (m.contains('network') || m.contains('fetch') || m.contains('connection')) {
      return 'Koneksi gagal. Periksa koneksi internet Anda.';
    }
    return 'Login gagal: $msg';
  }

  String _parseError(String msg) {
    final m = msg.toLowerCase();
    if (m.contains('invalid login credentials') ||
        m.contains('invalid credentials') ||
        m.contains('wrong password') ||
        m.contains('invalid email or password')) {
      return 'Email atau password salah.\n'
             'Pastikan Anda menggunakan email & password\n'
             'yang didaftarkan oleh administrator.';
    }
    if (m.contains('email not confirmed')) {
      return 'Email belum dikonfirmasi.\n'
             'Admin perlu konfirmasi akun di Supabase Dashboard:\n'
             'Authentication → Users → klik akun → Confirm';
    }
    if (m.contains('too many') || m.contains('rate limit')) {
      return 'Terlalu banyak percobaan login.\nTunggu beberapa menit lalu coba lagi.';
    }
    if (m.contains('network') || m.contains('fetch') || m.contains('connection')) {
      return 'Koneksi gagal. Periksa koneksi internet Anda.';
    }
    if (m.contains('user not found') || m.contains('no user')) {
      return 'Email tidak terdaftar.\nHubungi administrator untuk membuat akun.';
    }
    if (m.contains('disabled') || m.contains('banned')) {
      return 'Akun dinonaktifkan. Hubungi administrator.';
    }
    return 'Login gagal: $msg';
  }
}
