import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'screens/login_screen.dart';
import 'screens/shell_screen.dart';
import 'state/app_session.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([
    initializeDateFormatting('id_ID'),
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp, DeviceOrientation.portraitDown]),
    // anonKey (JWT legacy) sama dengan yang dipakai aplikasi Mandor & web admin.
    // ignore: deprecated_member_use
    Supabase.initialize(url: AppConfig.supabaseUrl, anonKey: AppConfig.supabaseAnonKey),
  ]);
  final session = AppSession();
  await session.init();
  runApp(SistemCerdasApp(session: session));
}

class SistemCerdasApp extends StatelessWidget {
  final AppSession session;
  const SistemCerdasApp({super.key, required this.session});

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: session,
        builder: (context, _) => MaterialApp(
          title: 'Sistem Cerdas - PT Krakatau Indah',
          debugShowCheckedModeBanner: false,
          locale: const Locale('id', 'ID'),
          supportedLocales: const [Locale('id', 'ID')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          themeMode: session.tema,
          theme: buildTheme(Brightness.light),
          darkTheme: buildTheme(Brightness.dark),
          home: session.sudahMasuk
              ? ShellScreen(key: ValueKey(session.pengguna), session: session)
              : LoginScreen(session: session),
        ),
      );
}
