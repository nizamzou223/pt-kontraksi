import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme.dart';

// ───────────────────────── Identitas visual (mengikuti web admin) ─────────────────────────

/// Ubin logo bergradien biru dengan bayangan — sama dengan logo pada sidebar web admin.
class LogoBrand extends StatelessWidget {
  final double ukuran;
  const LogoBrand({super.key, this.ukuran = 40});
  @override
  Widget build(BuildContext context) => Container(
        width: ukuran,
        height: ukuran,
        decoration: BoxDecoration(
          gradient: Palet.gradienBrand,
          borderRadius: BorderRadius.circular(ukuran * 0.3),
          boxShadow: const [BoxShadow(color: Color(0x4D4F6FC7), blurRadius: 14, offset: Offset(0, 4))],
        ),
        child: Icon(Icons.auto_graph_rounded, color: Colors.white, size: ukuran * 0.56),
      );
}

/// Bilah judul putih dengan garis gradien 3 px di bawahnya (aksen atas sidebar web admin).
class BrandAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String judul;
  final List<Widget> aksi;
  final bool logo;
  const BrandAppBar({super.key, required this.judul, this.aksi = const [], this.logo = false});

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 3);

  @override
  Widget build(BuildContext context) => AppBar(
        titleSpacing: logo ? 12 : null,
        title: Row(children: [
          if (logo) ...[const LogoBrand(ukuran: 34), const SizedBox(width: 10)],
          Flexible(child: Text(judul, overflow: TextOverflow.ellipsis)),
        ]),
        actions: aksi,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: Container(height: 3, decoration: const BoxDecoration(gradient: Palet.gradienBar)),
        ),
      );
}

/// Pil bertepi dengan ikon/teks berwarna (gaya Badge web admin).
class _Label extends StatelessWidget {
  final Color warna;
  final IconData? ikon;
  final String teks;
  const _Label({required this.warna, required this.teks, this.ikon});

  @override
  Widget build(BuildContext context) {
    final gelap = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: warna.withValues(alpha: gelap ? 0.16 : 0.09),
        border: Border.all(color: warna.withValues(alpha: 0.32)),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (ikon != null) ...[Icon(ikon, size: 14, color: warna), const SizedBox(width: 4)],
        Text(teks, style: TextStyle(color: warna, fontWeight: FontWeight.w800, fontSize: 12.5)),
      ]),
    );
  }
}

class RisikoChip extends StatelessWidget {
  final Risiko risiko;
  const RisikoChip(this.risiko, {super.key});
  @override
  Widget build(BuildContext context) => _Label(
        warna: Palet.risiko(risiko, Theme.of(context).brightness),
        ikon: Palet.ikonRisiko(risiko),
        teks: risiko.label,
      );
}

class TingkatChip extends StatelessWidget {
  final Tingkat tingkat;
  const TingkatChip(this.tingkat, {super.key});
  @override
  Widget build(BuildContext context) => _Label(
        warna: Palet.tingkat(tingkat, Theme.of(context).brightness),
        teks: 'Tingkat ${tingkat.label}',
      );
}

class StatusChip extends StatelessWidget {
  final StatusTinjauan status;
  const StatusChip(this.status, {super.key});
  @override
  Widget build(BuildContext context) => _Label(
        warna: Palet.status(status, Theme.of(context).brightness),
        ikon: switch (status) {
          StatusTinjauan.baru => Icons.fiber_new_rounded,
          StatusTinjauan.valid => Icons.flag_rounded,
          StatusTinjauan.bukanAnomali => Icons.thumb_up_alt_rounded,
          StatusTinjauan.diabaikan => Icons.visibility_off_rounded,
        },
        teks: status.label,
      );
}

/// Chip kecil netral (mis. nama metode).
class InfoChip extends StatelessWidget {
  final String teks;
  final IconData? ikon;
  const InfoChip(this.teks, {super.key, this.ikon});
  @override
  Widget build(BuildContext context) {
    final w = Theme.of(context).colorScheme.onSurfaceVariant;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (ikon != null) ...[Icon(ikon, size: 13, color: w), const SizedBox(width: 4)],
        Text(teks, style: TextStyle(fontSize: 12, color: w, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

// ───────────────────────── Kontrol pilihan ─────────────────────────

/// Pil filter: aktif = biru tua berteks putih, tidak aktif = abu muda (gaya toggle web admin).
class ChipPilihan extends StatelessWidget {
  final String label;
  final bool dipilih;
  final VoidCallback onTap;
  final IconData? ikon;
  final Color? warnaIkon;
  const ChipPilihan({super.key, required this.label, required this.dipilih, required this.onTap, this.ikon, this.warnaIkon});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final gelap = t.brightness == Brightness.dark;
    final aktif = t.colorScheme.primary;
    final fg = dipilih ? Colors.white : t.colorScheme.onSurfaceVariant;
    return Semantics(
      button: true,
      selected: dipilih,
      label: label,
      child: Material(
        color: dipilih ? aktif : (gelap ? const Color(0xFF223050) : Palet.abu100),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 40),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (ikon != null) ...[Icon(ikon, size: 16, color: dipilih ? Colors.white : (warnaIkon ?? fg)), const SizedBox(width: 6)],
                Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 13.5)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class OpsiSegmen<T> {
  final T nilai;
  final String label;
  final IconData? ikon;
  const OpsiSegmen(this.nilai, this.label, [this.ikon]);
}

/// Segmented control ala `SourceToggle` web admin: wadah abu, segmen aktif biru tua.
class SegmenBrand<T> extends StatelessWidget {
  final List<OpsiSegmen<T>> opsi;
  final T dipilih;
  final ValueChanged<T> onChanged;
  const SegmenBrand({super.key, required this.opsi, required this.dipilih, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final gelap = t.brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: gelap ? const Color(0xFF223050) : Palet.abu100, borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        for (final o in opsi)
          Expanded(
            child: Semantics(
              button: true,
              selected: o.nilai == dipilih,
              label: o.label,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onChanged(o.nilai),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                  decoration: BoxDecoration(
                    color: o.nilai == dipilih ? t.colorScheme.primary : Colors.transparent,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: o.nilai == dipilih ? const [BoxShadow(color: Color(0x1A303F78), blurRadius: 4, offset: Offset(0, 1))] : null,
                  ),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    if (o.ikon != null) ...[
                      Icon(o.ikon, size: 16, color: o.nilai == dipilih ? Colors.white : t.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 6),
                    ],
                    Flexible(
                      child: Text(
                        o.label,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: o.nilai == dipilih ? Colors.white : t.colorScheme.onSurfaceVariant),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
          ),
      ]),
    );
  }
}

// ───────────────────────── Tata letak ─────────────────────────

class SectionHeader extends StatelessWidget {
  final String judul;
  final String? aksi;
  final VoidCallback? onAksi;
  const SectionHeader(this.judul, {super.key, this.aksi, this.onAksi});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Expanded(child: Text(judul, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
          if (aksi != null) TextButton(onPressed: onAksi, child: Text(aksi!)),
        ]),
      );
}

/// Kotak angka besar yang dapat diketuk.
class StatTile extends StatelessWidget {
  final IconData ikon;
  final String label;
  final String nilai;
  final String? catatan;
  final Color warna;
  final VoidCallback? onTap;
  const StatTile({
    super.key,
    required this.ikon,
    required this.label,
    required this.nilai,
    required this.warna,
    this.catatan,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: warna.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: Icon(ikon, color: warna, size: 22),
            ),
            const SizedBox(height: 12),
            Text(nilai, style: t.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, height: 1)),
            const SizedBox(height: 4),
            Text(label, style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
            if (catatan != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(catatan!, style: t.textTheme.bodySmall?.copyWith(color: t.colorScheme.onSurfaceVariant)),
              ),
          ]),
        ),
      ),
    );
  }
}

class KeadaanKosong extends StatelessWidget {
  final IconData ikon;
  final String judul;
  final String pesan;
  final String? aksi;
  final VoidCallback? onAksi;
  const KeadaanKosong({super.key, required this.ikon, required this.judul, required this.pesan, this.aksi, this.onAksi});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(color: t.colorScheme.primaryContainer, shape: BoxShape.circle),
            child: Icon(ikon, size: 40, color: t.colorScheme.primary),
          ),
          const SizedBox(height: 16),
          Text(judul, textAlign: TextAlign.center, style: t.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Text(pesan, textAlign: TextAlign.center, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant, height: 1.45)),
          if (aksi != null) ...[
            const SizedBox(height: 20),
            FilledButton(onPressed: onAksi, style: FilledButton.styleFrom(minimumSize: const Size(180, 48)), child: Text(aksi!)),
          ],
        ]),
      ),
    );
  }
}

/// Pesan galat dengan tombol coba lagi.
class KeadaanGalat extends StatelessWidget {
  final String pesan;
  final VoidCallback onUlang;
  const KeadaanGalat({super.key, required this.pesan, required this.onUlang});
  @override
  Widget build(BuildContext context) => KeadaanKosong(
        ikon: Icons.cloud_off_rounded,
        judul: 'Data belum dapat dimuat',
        pesan: pesan,
        aksi: 'Coba lagi',
        onAksi: onUlang,
      );
}

enum NadaCatatan { info, peringatan, bahaya, sukses }

/// Kotak pemberitahuan berwarna (padanan `Notice` web admin).
class Catatan extends StatelessWidget {
  final NadaCatatan nada;
  final String? judul;
  final Widget isi;
  final Widget? aksi;
  const Catatan({super.key, this.nada = NadaCatatan.info, this.judul, required this.isi, this.aksi});

  @override
  Widget build(BuildContext context) {
    final gelap = Theme.of(context).brightness == Brightness.dark;
    final (Color warna, IconData ikon) = switch (nada) {
      NadaCatatan.info => (gelap ? const Color(0xFF93C5FD) : Palet.brand700, Icons.info_rounded),
      NadaCatatan.peringatan => (gelap ? const Color(0xFFFBBF24) : const Color(0xFF92400E), Icons.warning_amber_rounded),
      NadaCatatan.bahaya => (gelap ? const Color(0xFFF87171) : const Color(0xFFB91C1C), Icons.error_rounded),
      NadaCatatan.sukses => (gelap ? const Color(0xFF34D399) : const Color(0xFF047857), Icons.check_circle_rounded),
    };
    return Semantics(
      liveRegion: nada == NadaCatatan.bahaya,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: warna.withValues(alpha: gelap ? 0.14 : 0.08),
          border: Border.all(color: warna.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(top: 1), child: Icon(ikon, color: warna, size: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: DefaultTextStyle.merge(
              style: TextStyle(color: warna, height: 1.4, fontSize: 13.5),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (judul != null) Text(judul!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                isi,
              ]),
            ),
          ),
          if (aksi != null) aksi!,
        ]),
      ),
    );
  }
}

/// Lingkaran skor anomali 0–100.
class SkorLingkaran extends StatelessWidget {
  final double skor;
  final Tingkat tingkat;
  final double ukuran;
  const SkorLingkaran({super.key, required this.skor, required this.tingkat, this.ukuran = 52});

  @override
  Widget build(BuildContext context) {
    final w = Palet.tingkat(tingkat, Theme.of(context).brightness);
    return Semantics(
      label: 'Skor anomali ${(skor * 100).round()} dari 100',
      excludeSemantics: true,
      child: SizedBox(
        width: ukuran,
        height: ukuran,
        child: Stack(alignment: Alignment.center, children: [
          SizedBox.expand(
            child: CircularProgressIndicator(value: skor.clamp(0, 1), strokeWidth: 5, color: w, backgroundColor: w.withValues(alpha: 0.15)),
          ),
          Text('${(skor * 100).round()}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: ukuran * 0.32, color: w)),
        ]),
      ),
    );
  }
}

/// Bilah tipis berisi persentase (mis. stok terhadap kebutuhan).
class BilahProgres extends StatelessWidget {
  final double nilai; // 0..1
  final Color warna;
  const BilahProgres({super.key, required this.nilai, required this.warna});
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: LinearProgressIndicator(value: nilai.clamp(0, 1), minHeight: 8, color: warna, backgroundColor: warna.withValues(alpha: 0.15)),
      );
}

/// Bilah progres bergradien biru (sama dengan `ProgressBar` web admin) untuk proses analisis.
class ProgresAnalisis extends StatelessWidget {
  final double nilai;
  final String label;
  const ProgresAnalisis({super.key, required this.nilai, required this.label});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final v = nilai.clamp(0.0, 1.0);
    return Semantics(
      label: 'Kemajuan analisis ${(v * 100).round()} persen. $label',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(label, overflow: TextOverflow.ellipsis, style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w700, color: t.colorScheme.onSurfaceVariant))),
          Text('${(v * 100).round()}%', style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w800)),
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Container(
            height: 10,
            color: t.colorScheme.primaryContainer,
            alignment: Alignment.centerLeft,
            child: FractionallySizedBox(
              widthFactor: v,
              child: AnimatedContainer(duration: const Duration(milliseconds: 250), decoration: const BoxDecoration(gradient: LinearGradient(colors: [Palet.brand600, Palet.sky]))),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Kartu berjudul dengan isi bebas.
class KartuBagian extends StatelessWidget {
  final String? judul;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;
  const KartuBagian({super.key, this.judul, this.trailing, required this.child, this.padding = const EdgeInsets.all(16)});

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: padding,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (judul != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(children: [
                  Expanded(child: Text(judul!, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800))),
                  if (trailing != null) trailing!,
                ]),
              ),
            child,
          ]),
        ),
      );
}

/// Baris "label ........ nilai".
class BarisNilai extends StatelessWidget {
  final String label;
  final String nilai;
  const BarisNilai(this.label, this.nilai, {super.key});
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: Text(label, style: t.textTheme.bodyMedium?.copyWith(color: t.colorScheme.onSurfaceVariant))),
        const SizedBox(width: 12),
        Flexible(child: Text(nilai, textAlign: TextAlign.end, style: t.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700))),
      ]),
    );
  }
}

/// Pita "Mode Demo" agar jelas bahwa data yang tampil hanya contoh (sama dengan DemoBanner web admin).
class PitaDemo extends StatelessWidget {
  const PitaDemo({super.key});
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
        color: const Color(0xFFFFF7E0),
        child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.science_rounded, size: 16, color: Color(0xFF92400E)),
          SizedBox(width: 6),
          Flexible(
            child: Text('Mode demo · data sintetis, bukan data perusahaan',
                overflow: TextOverflow.ellipsis, style: TextStyle(color: Color(0xFF92400E), fontWeight: FontWeight.w800, fontSize: 12.5)),
          ),
        ]),
      );
}
