import 'package:flutter/material.dart';

import '../state/app_session.dart';
import '../theme.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  final AppSession session;
  const LoginScreen({super.key, required this.session});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _sandi = TextEditingController();
  bool _lihat = false;
  bool _proses = false;
  String? _galat;

  @override
  void dispose() {
    _email.dispose();
    _sandi.dispose();
    super.dispose();
  }

  Future<void> _masuk() async {
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _proses = true;
      _galat = null;
    });
    try {
      await widget.session.masuk(_email.text, _sandi.text);
    } catch (e) {
      if (mounted) setState(() => _galat = e.toString());
    } finally {
      if (mounted) setState(() => _proses = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cs = t.colorScheme;
    return Scaffold(
      body: Stack(children: [
        // Latar bergradien navy → biru (kartu login web admin)
        Positioned(top: 0, left: 0, right: 0, height: 340, child: Container(decoration: const BoxDecoration(gradient: Palet.gradienGelap))),
        Positioned(top: 0, left: 0, right: 0, height: 4, child: Container(decoration: const BoxDecoration(gradient: Palet.gradienBar))),
        SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Center(child: LogoBrand(ukuran: 72)),
                  const SizedBox(height: 16),
                  Text('Sistem Cerdas', textAlign: TextAlign.center, style: t.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: Colors.white)),
                  const SizedBox(height: 6),
                  Text(
                    'Prediksi kebutuhan material & deteksi anomali kepegawaian\nPT Krakatau Indah',
                    textAlign: TextAlign.center,
                    style: t.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.85), height: 1.4),
                  ),
                  const SizedBox(height: 24),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Form(
                        key: _form,
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          Text('Masuk', style: t.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                          const SizedBox(height: 4),
                          Text('Khusus akun Admin dan HRD.', style: t.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                          const SizedBox(height: 18),
                          TextFormField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            autofillHints: const [AutofillHints.email],
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded)),
                            validator: (v) => (v == null || !v.contains('@')) ? 'Masukkan email yang valid' : null,
                          ),
                          const SizedBox(height: 14),
                          TextFormField(
                            controller: _sandi,
                            obscureText: !_lihat,
                            autofillHints: const [AutofillHints.password],
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _masuk(),
                            decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: const Icon(Icons.lock_outline_rounded),
                              suffixIcon: IconButton(
                                tooltip: _lihat ? 'Sembunyikan password' : 'Tampilkan password',
                                icon: Icon(_lihat ? Icons.visibility_off_rounded : Icons.visibility_rounded),
                                onPressed: () => setState(() => _lihat = !_lihat),
                              ),
                            ),
                            validator: (v) => (v == null || v.isEmpty) ? 'Password wajib diisi' : null,
                          ),
                          if (_galat != null) ...[const SizedBox(height: 14), Catatan(nada: NadaCatatan.bahaya, isi: Text(_galat!, style: const TextStyle(fontWeight: FontWeight.w700)))],
                          const SizedBox(height: 20),
                          FilledButton(
                            onPressed: _proses ? null : _masuk,
                            child: _proses ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Masuk'),
                          ),
                          const SizedBox(height: 18),
                          Row(children: [
                            const Expanded(child: Divider()),
                            Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('atau', style: t.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant))),
                            const Expanded(child: Divider()),
                          ]),
                          const SizedBox(height: 14),
                          OutlinedButton.icon(
                            onPressed: _proses ? null : widget.session.masukDemo,
                            icon: const Icon(Icons.play_circle_outline_rounded),
                            label: const Text('Coba Mode Demo'),
                          ),
                          const SizedBox(height: 6),
                          Text('Menampilkan data sintetis tanpa perlu akun.', textAlign: TextAlign.center, style: t.textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                        ]),
                      ),
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
