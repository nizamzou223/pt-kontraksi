/// Konfigurasi Supabase. Nilai bawaan memakai proyek yang sama dengan aplikasi Mandor & web admin
/// (kunci `anon` memang publik; keamanan data dijaga oleh Row Level Security di database).
///
/// Untuk memakai proyek lain tanpa mengubah kode:
///   flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
class AppConfig {
  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://zrgzersltowinheqtdpc.supabase.co',
  );
  static const supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZ3plcnNsdG93aW5oZXF0ZHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTYxNTksImV4cCI6MjA5NTA5MjE1OX0.XTxfR2tJrKteulY7yh2ixQrx0pCPoGsktK3tnqkO_RM',
  );

  /// Hanya peran ini yang boleh membuka data Sistem Cerdas (sama dengan kebijakan RLS `is_admin_or_hr()`).
  static const allowedRoles = {'admin', 'hr'};
}
