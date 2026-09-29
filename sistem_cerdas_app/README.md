# Sistem Cerdas — PT Krakatau Indah (Flutter)

Aplikasi mobile untuk **prediksi kebutuhan material** dan **deteksi anomali data kepegawaian**.
Analisis dijalankan **langsung di aplikasi** (algoritma yang sama dengan web admin, ditulis ulang dalam Dart),
hasilnya bisa disimpan ke Supabase (tabel `ml_*`) lalu dilihat dan ditinjau dari mana saja.
Tampilan mengikuti tema web admin (biru lembut, gradien `#4059ad → #5b9bd5`, kartu bersudut bulat, mode gelap).

## Alur kerja

1. **Beranda → Jalankan analisis** (atau tombol *Prediksi baru* / *Deteksi baru* di tab masing-masing).
2. Atur parameter → **Jalankan**. Proses berjalan di *isolate* terpisah, ada bilah progres dan tombol Batalkan.
3. Lihat hasil → **Simpan ke sistem**. Hasil tampil di tab Prediksi/Anomali dan dapat dilihat Admin/HRD lain.
4. Di tab **Anomali**, tinjau tiap penanda: *Benar anomali / Bukan anomali / Abaikan*. Tinjauan ini dipakai
   mengukur presisi sistem (tab Model) dan menekan penanda yang sama pada analisis berikutnya.

| Tab | Isi |
| --- | --- |
| **Beranda** | Kartu sambutan, dua tombol analisis, kondisi stok, prioritas pemesanan, anomali teratas, model aktif |
| **Prediksi** | Barang per proyek + filter risiko & pencarian; detail dengan grafik pemakaian/ramalan/rentang 80%, angka kunci, alasan saran |
| **Anomali** | Daftar + filter status/tingkat; rincian alasan; tinjauan dengan catatan dan Urungkan |
| **Model** | Perbandingan model (MASE), akurasi ramalan vs kenyataan + deteksi pergeseran, presisi menurut tinjauan, penjelasan metode |
| **Pengaturan** | Tema Otomatis/Terang/Gelap, akun, keluar |

**Mode Demo** (tombol di layar login) memakai data sintetis yang dibangkitkan pembangkit data web admin; analisis yang
dijalankan di mode demo benar-benar memakai algoritma yang sama, dan hasilnya tersimpan di memori selama aplikasi terbuka.

## Menjalankan

```bash
export PATH="/c/src/flutter/bin:$PATH"      # sesuaikan lokasi Flutter
cd sistem_cerdas_app
flutter pub get
flutter run -d chrome                       # coba cepat di browser (Mode Demo)
flutter run                                 # perangkat/emulator Android
flutter build apk --release                 # APK: build/app/outputs/flutter-apk/app-release.apk
```

Supabase memakai proyek yang sama dengan aplikasi Mandor. Untuk proyek lain:
`--dart-define=SUPABASE_URL=https://xxx.supabase.co --dart-define=SUPABASE_ANON_KEY=xxx`

## Prasyarat data (mode non-demo)

1. `SECURITY_HARDENING.sql` dan `MIGRATION_ML_SISTEM_CERDAS.sql` sudah dijalankan di Supabase.
2. Masuk dengan akun **Admin** atau **HRD** (RLS tabel `ml_*` hanya mengizinkan keduanya).
3. Proyek memiliki data barang dan transaksi `stok_keluar` (idealnya ≥ 26 minggu) untuk prediksi;
   data presensi/lembur/kasbon untuk deteksi anomali.

## Kesetiaan terhadap web admin

Mesin ML (`lib/ml/`) adalah port dari `admin-web/src/ml`. Kesetaraannya diuji, bukan diasumsikan:
`tool/gen_fixtures.mjs` menjalankan **kode JS asli** pada data sintetis dan menyimpan hasilnya di `test/fixtures/`;
`test/ml_porting_test.dart` memastikan hasil Dart sama:

- pembangkit data & generator acak: **identik**;
- peramalan (8 model, evaluasi rolling-origin, interval, rekomendasi stok): MASE/RMSE/WAPE/bias sama sampai 1e-9,
  ramalan sampai 1e-6, risiko & teks alasan sama persis;
- deteksi anomali aturan bisnis + statistik: himpunan penanda, skor, dan teks alasan sama persis;
- Isolation Forest: memakai pengacakan berbeda (Fisher–Yates berbenih), sehingga diuji dengan irisan ≥ 90% dan
  recall/presisi terhadap label sintetis.

Perbedaan yang disengaja: pembanding "Random Forest lag-4 (metode lama)" tidak disertakan (memakai pustaka JS pihak ketiga).

Untuk membuat ulang fixture setelah kode JS berubah:
`cd admin-web && npx vite-node ../sistem_cerdas_app/tool/gen_fixtures.mjs`

## Struktur kode

```
lib/
  main.dart, config.dart, theme.dart          tema mengikuti web admin
  ml/                                          mesin ML murni Dart (stats, trees, forecasters, evaluation,
                                               forecast_pipeline, anomaly_*, isolation_forest, data_sintetis, runner)
  models/models.dart                           model tampilan + parsing tabel ml_*
  data/                                        ai_repository (Supabase), demo_repository, adapters
  state/                                       app_session (login/tema), ai_controller (status, filter, tinjauan)
  screens/                                     login, shell, 4 tab, detail, prediksi_baru, deteksi_baru, pengaturan
  widgets/                                     komponen UI (chip, segmen, kartu, catatan), grafik (fl_chart)
test/                                          unit, porting vs JS, isolate, end-to-end demo, widget (360dp)
```

## Catatan

- Analisis pada data besar memakan waktu (puluhan detik untuk ratusan barang di HP menengah); proses berjalan di
  isolate sehingga layar tetap responsif. Di web, isolate tidak tersedia sehingga proses berjalan di thread utama.
- Angka pada **Model → Anomali → Hasil pengujian** berasal dari eksperimen data sintetis
  (`admin-web/ml-experiments/hasil`); itu menguji mekanisme, bukan bukti kinerja di lapangan.
- Hak akses data mengikuti RLS akun yang login; aplikasi tidak mengubah data operasional.
