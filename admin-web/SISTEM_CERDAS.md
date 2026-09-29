# Sistem Cerdas — Peramalan Kebutuhan Material & Deteksi Anomali Data Kepegawaian

Modul tambahan pada Panel Admin PT Kali Pelus / Krakatau Indah untuk tugas akhir
**"Pengembangan Sistem Cerdas Peramalan Kebutuhan Material dan Deteksi Anomali Data Kepegawaian Berbasis Machine Learning pada Panel Admin Manajemen Proyek Konstruksi"**.

## 1. Prinsip: tidak mengubah alur yang sudah ada

| | |
|---|---|
| **Berkas lama yang disentuh** | hanya dua, dan hanya **menambah**: `src/App.jsx` (3 rute baru + 3 impor lazy) dan `src/components/common/_ui.jsx` (satu grup menu "Sistem Cerdas" + satu ikon). `package.json` mendapat satu skrip. |
| **Halaman lama** | `PrediksiStok`, `DashboardCorporate`, dan semua halaman lain **tidak diubah**. Fitur Prediksi Stok lama tetap jalan; ia hanya diikutkan sebagai *pembanding* pada evaluasi. |
| **Database** | hanya **menambah 4 tabel `ml_*`** (`MIGRATION_ML_SISTEM_CERDAS.sql`). Tidak ada tabel/kolom/fungsi lama yang diubah. |
| **Data operasional** | modul hanya **membaca**. Semua penulisan hanya ke tabel `ml_*` (diuji otomatis). |
| **Bila migrasi belum dijalankan** | halaman tetap bisa menganalisis & menampilkan hasil; hanya tombol simpan yang memberi petunjuk. |

> Dokumen rujukan (`Referensi_Tugas_Akhir_AI_…`, bagian 5.4) menyarankan mengubah `PrediksiStok.jsx` dan `DashboardCorporate.jsx`. Itu **sengaja tidak dilakukan** agar alur berjalan tidak berubah; modul baru berdiri sendiri.

## 2. Yang ditambahkan

```
src/ml/                     mesin ML murni (tanpa React/Supabase → bisa diuji & dijalankan di Node)
  stats.js  timeseries.js   statistik dasar; agregasi mingguan, klasifikasi pola permintaan
  forecasters.js  gbm.js    10 model peramalan; Random Forest & Gradient Boosting tulisan sendiri
  evaluation.js             rolling-origin, MAE/RMSE/WAPE/MASE/bias, peringkat, interval empiris
  inventoryPolicy.js        stok pengaman, titik pesan ulang, jumlah pesan, perkiraan habis, risiko
  forecastPipeline.js       evaluasi → pilih model → ramal → interval → rekomendasi
  isolationForest.js        Isolation Forest (Liu et al., 2008)
  anomalyRules.js           aturan bisnis (termasuk batas lembur PP 35/2021)
  anomalyDetector.js        statistik robust + Isolation Forest + penggabung skor
  anomalyEvaluation.js      ablasi metode, presisi/recall/F1/AUC, sapuan ambang
  synthetic.js  syntheticWorkforce.js   generator data sintetis berbenih
  mlTasks.js  mlWorker.js  runTask.js   Web Worker agar UI tidak membeku
src/services/mlService.js   pemuat data (paginasi), simpan hasil, tinjauan anomali, akurasi berjalan
src/components/ai/          RingkasanCerdas, PeramalanMaterial, DeteksiAnomali, aiShared
MIGRATION_ML_SISTEM_CERDAS.sql   4 tabel ml_* + RLS admin/HRD
ml-experiments/             skrip eksperimen offline (hasil/*.md, *.csv)
src/__tests__/ml*.test.js   ± 110 tes untuk modul ini
```

Menu: **Sistem Cerdas → Ringkasan · Peramalan Material · Deteksi Anomali**.

## 3. Peramalan kebutuhan material

**Data.** `stok_keluar` dijumlahkan per minggu (Senin–Minggu, UTC) per barang, minggu tanpa transaksi diisi **0 eksplisit**. Minggu berjalan yang belum lengkap **dikecualikan**. Fitur eksogen: jumlah karyawan berbeda yang hadir per minggu (presensi otomatis dikecualikan).

**Model yang dibandingkan** (antarmuka seragam `fitPredict`):

| Kelompok | Model |
|---|---|
| Baseline | Naive · Rata-rata bergerak 4 minggu · SES |
| Permintaan intermiten | Croston · Croston-SBA · TSB |
| Metode lama | Random Forest lag-4 (meniru `predictionService.js`: 60 pohon, dibulatkan) |
| Global (satu model untuk semua barang, dinormalisasi per barang) | Random Forest · Gradient Boosting · Gradient Boosting + tenaga kerja |

**Evaluasi.** *Rolling-origin*: pada tiap titik asal model hanya melihat data sebelum titik itu (dibuktikan oleh tes "tidak ada kebocoran data"), lalu diuji pada H minggu berikutnya. Metrik: **MASE** (utama; <1 = lebih baik dari naive), RMSE, MAE, **WAPE** (pengganti MAPE untuk data bernilai nol), bias, peringkat rata-rata, jumlah kemenangan. Model per barang hanya menggantikan model global bila lebih baik ≥5% dan datanya cukup (mengurangi *selection noise*).

**Interval ketidakpastian.** Kuantil 10%/90% dari galat empiris rolling-origin (dinormalisasi rata-rata pemakaian, per horizon) — tanpa asumsi normal. Cakupan (PICP) diukur pada titik asal yang tidak dipakai kalibrasi.

**Kebijakan persediaan.** `stok pengaman = z·σ·√L`; `titik pesan ulang = kebutuhan selama waktu tunggu + stok pengaman`; `jumlah pesan = kebutuhan horizon + pengaman − stok`. Risiko: **habis / kritis / waspada / aman**, dengan alasan berupa kalimat yang dapat dibaca. Parameter: horizon (4/8), waktu tunggu (1–4 minggu), tingkat layanan (90/95/99%).

**Pemantauan.** Hasil dapat disimpan; tab *Akurasi Berjalan* membandingkan ramalan tersimpan dengan realisasi dan memberi peringatan *drift* bila WAPE terbaru naik >30%.

## 4. Deteksi anomali

Tiga sumber bukti, digabung **noisy-OR** `skor = 1 − Π(1 − wᵢ)` → tingkat *tinggi ≥0,75*, *sedang ≥0,5*, *rendah*:

1. **Aturan bisnis** — jam keluar < masuk, durasi tak konsisten/ekstrem, presensi karyawan nonaktif/sebelum bergabung/masa depan, jam manual identik berulang; lembur tanpa presensi, >4 jam/hari & >18 jam/minggu (PP 35/2021), total ≠ durasi×tarif; kasbon terlalu besar/berulang, sisa > jumlah, lunas tapi ada sisa.
2. **Statistik robust** — skor-z memakai median & MAD terhadap kebiasaan karyawan itu sendiri (fallback: seluruh karyawan), dengan **lantai variasi praktis** (mis. 0,75 jam untuk durasi kerja) supaya hari kerja panjang yang sah tidak ikut ditandai. Juga gaji vs rekan sejabatan pada minggu yang sama.
3. **Isolation Forest** — multivariat tanpa label (durasi, jam masuk/keluar, hari, penyimpangan dari kebiasaan, …) dengan penjelasan fitur yang paling menyimpang.

Presensi **otomatis** dan lembur **bentukan sistem** tidak diperiksa (bukan observasi nyata). **Pusat Tinjauan:** admin menandai *valid / bukan anomali / diabaikan*; dua yang terakhir **ditekan** pada analisis berikutnya dan menjadi label nyata untuk evaluasi.

## 5. Cara memakai

1. **Database (sekali):** jalankan `SECURITY_HARDENING.sql` (bila belum), lalu `MIGRATION_ML_SISTEM_CERDAS.sql` di Supabase SQL Editor. Hasil akhir harus menunjukkan 4 tabel `rls_aktif = true`, `jumlah_policy = 1`.
2. **Web:** menu *Sistem Cerdas*. Pilih **Data sistem** atau **Data demo** (sintetis, untuk peragaan), atur parameter, **Jalankan**. Peramalan memuat data proyek aktif; hasil dapat disimpan & diekspor Excel.
3. **Eksperimen untuk laporan:** `npm run ml:eksperimen` (data sintetis, ±1 menit) → `ml-experiments/hasil/peramalan.md|csv`, `anomali.md|csv`. Untuk **data nyata**: isi `TEST_ADMIN_EMAIL/PASSWORD` di `.env`, lalu `npm run ml:eksperimen -- --sumber=db --project=<id>` (keluaran hanya agregat, tanpa nama karyawan).
4. **Tes:** `npm test`.

## 6. Hasil terukur saat ini (data sintetis!)

Dari `npm run ml:eksperimen -- --seeds=3` (rata-rata ± SD):

* **Peramalan** — model terbaik *Gradient Boosting global + tenaga kerja*, MASE **0,89 ± 0,20**; metode lama (RF lag-4) MASE 1,34 → **±34% lebih baik**. Semua model **tanpa** fitur tenaga kerja MASE >1 (kalah dari naive) — sejalan dengan temuan bahwa model kompleks tidak otomatis unggul pada data kecil & intermiten.
* **Anomali, tingkat mudah** — hibrida P/R/F1 = 1,00. **Tingkat sulit** (variasi sah mirip anomali; anomali lebih halus) — hibrida F1 **0,85 ± 0,04**, ROC-AUC ≈0,99, menangkap anomali halus yang lolos dari aturan bisnis.
* Waktu: peramalan 18 barang ≈16 dtk (di Web Worker), deteksi anomali <1 dtk.

## 7. Batasan yang harus disampaikan jujur

* **Hasil di atas berasal dari data sintetis.** Generatornya membuat kebutuhan bergantung pada tenaga kerja dan anomali disuntik dengan pola yang dikenali detektor (sirkular). Itu membuktikan **mekanisme**, bukan kinerja lapangan. Klaim ilmiah skripsi harus memakai **data nyata** (mode `--sumber=db`) dan **label tinjauan admin**.
* **Panjang riwayat.** Butuh ≥ ±28 minggu; bila kurang sistem menolak dan menjelaskan alasannya. Dengan data puluhan karyawan, metode sederhana (Croston/SBA/naive) bisa tak kalah — temuan itu sah.
* **Tanggal pemakaian.** `stok_keluar.created_at` = waktu pencatatan, bukan waktu pemakaian; pencatatan borongan menggeser pola mingguan.
* **Waktu tunggu** diisi manual (tidak ada kolom `tanggal_pesan`; sengaja tidak menambah kolom di tabel lama).
* **Python/LightGBM/LSTM tidak dipakai.** Mesin ML ditulis di JavaScript agar berjalan di peramban, dapat diuji di lingkungan ini, dan dideploy di Vercel tanpa server tambahan. Bila skripsi perlu pembanding LSTM/XGBoost, jalankan sebagai eksperimen offline terpisah pada data hasil ekspor.
* **Privasi.** `ml_anomali` berisi data per karyawan → RLS admin/HRD; penggunaan mengikuti kebijakan perusahaan. Penanda adalah saran, bukan keputusan.
* **Pelatihan di peramban** (Web Worker) cukup untuk skala ini; untuk data jauh lebih besar pindahkan ke layanan terjadwal.

## 8. Pemetaan ke tugas akhir

| Bab | Bahan dari sistem ini |
|---|---|
| I Pendahuluan | keterbatasan Prediksi Stok lama (tanpa evaluasi, satu angka, tanpa interval) & kerentanan data kepegawaian |
| II Tinjauan pustaka | Croston/SBA/TSB, Random Forest, Gradient Boosting, Isolation Forest, MASE/WAPE, rolling-origin, kebijakan persediaan (ROP/safety stock), PP 35/2021 |
| III Metodologi | bagian 3–4 dokumen ini; `ml-experiments/`; protokol rolling-origin & label tinjauan admin |
| IV Hasil | `ml-experiments/hasil/*.md`; hasil pada data nyata; tangkapan layar halaman; UAT/SUS |
| V Penutup | batasan (bagian 7) & saran: tanggal pemakaian aktual, `tanggal_pesan`, fitur cuaca/libur, layanan terjadwal, notifikasi |
