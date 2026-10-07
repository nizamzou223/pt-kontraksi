# 📱 PT Krakatau Indah — Aplikasi Mobile Flutter

Dua aplikasi mobile Flutter yang terhubung ke backend Supabase yang sama dengan sistem administrasi web admin.

---

## Struktur Proyek

```
flutter_apps/
├── mandor_app/          ← Aplikasi Mandor (Presensi, Lembur, Kasbon, Permintaan)
└── gudang_app/          ← Aplikasi Gudang (Inventaris, Stok, Validasi Permintaan)
```

---

## 📋 APLIKASI 1: MANDOR APP

### Fitur
| Menu | Deskripsi |
|------|-----------|
| **Dashboard** | Statistik hari ini: hadir, lembur pending, kasbon |
| **Presensi** | Scan QR Code karyawan + input manual, filter tanggal |
| **Lembur** | Ajukan lembur dengan kalkulasi otomatis `(gaji_harian/8) * 1.5 * durasi_jam` |
| **Kasbon** | Ajukan kasbon, lihat riwayat & sisa cicilan |
| **Kebutuhan** | Kirim permintaan barang ke gudang, lihat stok proyek |

### Alur Login
1. Mandor login dengan email & password Supabase Auth
2. Sistem verifikasi `role = 'mandor'` dari tabel `users`
3. Mandor memilih **proyek aktif** (dari `project_karyawan` / `users.project_id`)
4. Semua transaksi otomatis ter-link ke `project_id` yang dipilih

### Setup
```bash
cd mandor_app
flutter pub get
flutter run
```

### Dependensi Utama
- `supabase_flutter` — Koneksi Supabase + Auth
- `mobile_scanner` — Scan QR Code karyawan (format: `KRAKATAU-{kode_karyawan}-{id}`)
- `google_fonts` — Plus Jakarta Sans (sesuai tema web)
- `intl` — Format rupiah & tanggal Bahasa Indonesia

---

## 📦 APLIKASI 2: GUDANG APP

### Fitur
| Menu | Deskripsi |
|------|-----------|
| **Dashboard** | Ringkasan inventaris + peringatan stok kritis |
| **Barang** | CRUD barang, search, filter stok kritis |
| **Stok Masuk** | Catat penerimaan barang, update stok otomatis |
| **Stok Keluar** | Catat pengeluaran barang, validasi stok sebelum proses |
| **Permintaan** | Validasi permintaan dari mandor proyek — Approve / Reject |

### Alur Persetujuan Permintaan
1. Mandor proyek mengirim permintaan via **Mandor App**
2. Mandor gudang melihat daftar permintaan **pending** di tab "Permintaan"
3. Sistem otomatis menampilkan: nama barang, jumlah diminta, stok saat ini
4. Jika stok cukup → tombol **Setujui** aktif → sistem:
   - Kurangi `stok_saat_ini` pada tabel `barang`
   - Buat record baru di `stok_keluar`
   - Update `status_permintaan` → `disetujui`
5. Jika stok tidak cukup → tombol **Setujui** dinonaktifkan (disabled)

### Setup
```bash
cd gudang_app
flutter pub get
flutter run
```

---

## ⚙️ Konfigurasi Supabase

Kedua aplikasi menggunakan konfigurasi yang sama (sudah terkonfigurasi di `main.dart`):

```dart
const supabaseUrl = 'https://zrgzersltowinheqtdpc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Role Pengguna
| Role | Akses |
|------|-------|
| `admin` | Semua fitur web admin + kedua aplikasi mobile |
| `mandor` | Mandor App saja |
| `mandor_gudang` / `gudang` | Gudang App saja |

---

## 🗄️ Tabel Database yang Digunakan

### Mandor App
- `users` — Autentikasi & data role
- `project` — Daftar proyek aktif
- `project_karyawan` — Penugasan mandor ke proyek
- `karyawan` + `jabatan` — Data karyawan & gaji harian
- `karyawan_qr_code` — Validasi scan QR
- `presensi` — Upsert dengan key `(karyawan_id, tanggal)` (satu karyawan satu baris per hari, tidak peduli project)
- `lembur` — Pengajuan lembur (status: pending)
- `kasbon` — Pengajuan kasbon (potong gaji / manual)
- `permintaan_barang` — Kirim permintaan ke gudang
- `barang` — Katalog & stok gudang pusat (global, bukan per-project)

### Gudang App
- `users`, `project` — Auth & navigasi proyek
- `kategori_barang`, `satuan_barang` — Master data
- `barang` — CRUD + update stok otomatis
- `stok_masuk` — Pencatatan penerimaan
- `stok_keluar` — Pencatatan pengeluaran
- `permintaan_barang` — Approve/Reject + auto-update stok

---

## 🎨 Identitas Visual

| Elemen | Mandor App | Gudang App |
|--------|-----------|-----------|
| **Warna Utama** | `#2563EB` (Blue-600) | `#059669` (Emerald-600) |
| **Background** | `#F4F7FF` | `#F0FDF4` |
| **Font** | Plus Jakarta Sans (Google Fonts) | Plus Jakarta Sans |
| **Border** | `#E0E7FF` | `#D1FAE5` |

Kedua aplikasi menggunakan komponen yang sesuai dengan Tailwind CSS dari admin-web:
- Cards dengan `rounded-2xl` + border tipis
- Status badges (Hadir/Pending/Disetujui/Ditolak)
- Bottom sheets untuk form input
- FAB (Floating Action Button) untuk aksi utama

---

## 🔒 Keamanan & Validasi

- **Client-side**: Semua form memiliki validasi sebelum dikirim
- **Jumlah tidak negatif**: Validator di setiap input angka
- **Stok validation**: Persetujuan permintaan dicek stok di server sebelum diproses
- **Role verification**: Login ditolak jika role tidak sesuai aplikasi
- **QR format validation**: Format `KRAKATAU-{kode_karyawan}-{id}` divalidasi sebelum proses presensi

---

## 📲 Android Permissions yang Diperlukan

### Mandor App (`AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Gudang App (`AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

## 🚀 Build untuk Production

```bash
# APK
flutter build apk --release

# App Bundle (Play Store)
flutter build appbundle --release
```

---

## 📞 Support

Hubungi admin sistem PT Krakatau Indah untuk:
- Reset password
- Penugasan proyek
- Perubahan role pengguna
