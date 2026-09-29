# PERUBAHAN & PERBAIKAN — admin-web v2

## Langkah Wajib Pertama: Jalankan SQL di Supabase

Sebelum deploy, jalankan **`MIGRATION_FIX_V2.sql`** di Supabase Dashboard → SQL Editor.

SQL ini akan:
- Menambah kolom `upah_luar_kota` ke tabel `presensi`
- Menambah kolom breakdown (`total_gaji_kotor`, `total_gaji_pokok`, dll.) ke `rekap_gaji_bulanan`
- Merename `total_lembur_jam` → `total_uang_lembur` (nama kolom yang benar)
- Menambah index untuk performa
- Memperbaiki data draft yang ada

---

## Ringkasan Bug yang Diperbaiki

### 🔴 BUG KRITIS

**1. Double-counting lembur otomatis** (`payrollService.js`)
- **Masalah:** Lembur dari presensi > 8 jam dihitung 2× — sekali dari loop durasi presensi, sekali lagi dari query tabel lembur (yang juga mengambil record "Otomatis%")
- **Fix:** Query `lemburManual` kini exclude record dengan `catatan LIKE 'Otomatis%'`

**2. Bug bulan rekap bulanan salah** (`payrollService.js`)
- **Masalah:** `_autoRekapBulanan()` menggunakan `new Date()` (hari ini) untuk menentukan bulan, bukan tanggal pembayaran. Bayar 1 Juli untuk minggu 28 Juni → rekap masuk bulan Juli bukan Juni
- **Fix:** `bayarGajiByIds()` dan `bayarSemuaGaji()` meneruskan `tglBayar` ke `_autoRekapBulanan(bulan, tahun, tglBayarFilter)`

**3. Kolom `upah_luar_kota` tidak ada di DB** (SQL schema)
- **Masalah:** Ada di logika JS dan form UI, tapi tidak ada di `migration.sql` → error saat runtime
- **Fix:** `MIGRATION_FIX_V2.sql` menambahkan kolom ini

**4. Kolom breakdown gaji bulanan hilang** (`payrollService.js` + SQL)
- **Masalah:** `rekap_gaji_bulanan` hanya punya `total_gaji_bersih`, tidak ada detail pokok/makan/transport/kotor → GajiBulanan tidak bisa tampilkan breakdown
- **Fix:** Kolom baru ditambah + `_autoRekapBulanan()` mengisi kolom tersebut

**5. Nama kolom salah: `total_lembur_jam`** (SQL + exportService.js)
- **Masalah:** Nama kolom `total_lembur_jam` menyesatkan — isinya rupiah, bukan jam
- **Fix:** Direname ke `total_uang_lembur`. `exportService.js` diperbarui menggunakan nama baru

### 🟡 BUG MEDIUM

**6. Thundering herd Realtime** (`GajiMingguan.jsx`)
- **Masalah:** Setiap perubahan presensi/lembur/kasbon langsung trigger `hitungSemuaGaji(force=true)` — jika banyak karyawan dan trafik tinggi, ratusan query paralel bisa overload
- **Fix:** Debounce 3000ms sebelum trigger recalculate

**7. Duplikasi logika kalkulasi gaji** (`calculations.ts`)
- **Masalah:** `calculations.ts` menggunakan formula berbeda (flat hari × gaji_harian) vs `payrollService.js` (per jam)
- **Fix:** `calculations.ts` diperbarui menggunakan `hitungKomponenJam()` yang konsisten, ditambah komentar bahwa ini hanya untuk preview UI

**8. Saat hapus presensi, lembur otomatis tidak ikut terhapus** (`payrollService.js`)
- **Fix:** `deletePresensi()` kini hapus record lembur otomatis terkait sebelum hapus presensi

**9. Saat edit presensi menjadi ≤ 8 jam, lembur otomatis tidak dihapus** (`payrollService.js`)
- **Fix:** `upsertPresensi()` kini hapus record lembur otomatis jika durasi diperbarui ≤ 8 jam

---

## File yang Diubah

| File | Perubahan |
|------|-----------|
| `src/services/payrollService.js` | Fix double-count, fix bulan rekap, fix hapus lembur, breakdown bulanan, helper `_potongKasbonKaryawan` |
| `src/components/penggajian/GajiMingguan.jsx` | Debounce Realtime 3 detik |
| `src/components/penggajian/GajiBulanan.jsx` | Tampilkan breakdown kolom baru (pokok, tunjangan, lembur per baris) |
| `src/services/exportService.js` | Rename `total_lembur_jam` → `total_uang_lembur` |
| `src/utils/calculations.ts` | Selaraskan formula dengan payrollService |
| `MIGRATION_FIX_V2.sql` | **Baru** — tambah kolom, rename, index, fix data |

---

## Cara Deploy

1. **Jalankan SQL:** Supabase Dashboard → SQL Editor → paste isi `MIGRATION_FIX_V2.sql` → Run
2. **Deploy frontend:** `npm run build` lalu upload folder `dist/` ke hosting
3. **Verifikasi:** Buka GajiBulanan, cek kolom Lembur dan breakdown tampil. Buka GajiMingguan, input presensi > 8 jam, cek lembur tidak double.

