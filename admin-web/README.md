# PT Kali Pelus - Sistem Admin

Enterprise Multi-Project Management System untuk PT Kali Pelus.

## 🚀 Cara Setup & Jalankan

### 1. Setup Database Supabase
1. Buka https://supabase.com → Login → pilih project `zrgzersltowinheqtdpc`
2. Masuk ke **SQL Editor**
3. Copy seluruh isi file `migration.sql`
4. Paste & klik **Run**
5. Pastikan muncul "Migration completed successfully!"

### 2. Setup User Admin Pertama
Di Supabase → Authentication → Users → **Add User**:
- Email: `admin@kalipelus.com`
- Password: bebas
- Confirm email: centang

Lalu di SQL Editor jalankan:
```sql
INSERT INTO users (email, nama_lengkap, password_hash, role, status_aktif)
VALUES ('admin@kalipelus.com', 'Admin Utama', 'managed_by_supabase_auth', 'admin', TRUE);
```

### 3. Jalankan Aplikasi
```bash
# Install dependencies
npm install

# Development
npm run dev

# Build production
npm run build
```

Akses di: http://localhost:5173

---

## 📋 Fitur Lengkap

### Master Data
- ✅ Departemen - CRUD lengkap
- ✅ Jabatan - dengan komponen gaji
- ✅ Karyawan - override gaji, info bank
- ✅ Project - manajemen multi-project
- ✅ Assign Karyawan ke Project
- ✅ QR Code Generator & Download

### Penggajian
- ✅ Presensi - input manual/QR, status kehadiran
- ✅ Lembur - ajukan + approval
- ✅ Kasbon - potong gaji otomatis
- ✅ Gaji Mingguan - hitung konsolidasi semua project
- ✅ Gaji Bulanan - rekap per bulan + grafik

### Inventaris
- ✅ Daftar Barang - dengan stok real-time
- ✅ Stok Masuk - tambah stok langsung
- ✅ Stok Keluar - kurang stok dengan validasi
- ✅ Permintaan Barang - approval auto-decrement stok

### Pengaturan
- ✅ Manajemen User - role-based
- ✅ Audit Log - riwayat semua perubahan

### Export
- ✅ PDF - semua laporan
- ✅ Excel - semua laporan

---

## 🗄️ Struktur Database (20 tabel)

```
departemen → jabatan → karyawan → karyawan_qr_code
                    ↘ project_karyawan ← project
presensi, lembur, kasbon (per project per karyawan)
kategori_barang, satuan_barang, barang, stok_masuk, stok_keluar, permintaan_barang
rekap_gaji_mingguan, rekap_gaji_bulanan, pembayaran_otomatis
users, audit_log
```

## 🔑 Kredensial Supabase
```
URL: https://zrgzersltowinheqtdpc.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
