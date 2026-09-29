import 'package:flutter/material.dart';

import '../state/ai_controller.dart';
import 'deteksi_baru_screen.dart';
import 'prediksi_baru_screen.dart';

Future<void> bukaPrediksiBaru(BuildContext context, AiController c) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PrediksiBaruScreen(c: c)));

Future<void> bukaDeteksiBaru(BuildContext context, AiController c) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DeteksiBaruScreen(c: c)));
