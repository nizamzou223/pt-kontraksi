# Setup Mandor App

## ⚠️ WAJIB: Jalankan ini dulu setelah extract ZIP

```bash
cd mandor_app
flutter pub get
```

Ini diperlukan untuk mengunduh package baru:
- `excel` — export ke .xlsx
- `pdf` — export ke .pdf  
- `path_provider` — akses folder Download
- `open_file` — buka file setelah export

## Jalankan App
```bash
flutter run
```

## Build APK
```bash
flutter build apk --release
```
APK tersimpan di: `build/app/outputs/flutter-apk/app-release.apk`
