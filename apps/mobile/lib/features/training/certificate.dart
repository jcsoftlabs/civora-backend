import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/config.dart';
import '../../core/state.dart';
import '../../l10n/app_localizations.dart';

/// Certificat de formation (FOR-04) : le PDF au modèle du parti, téléchargé une fois puis gardé sur le téléphone
/// pour être rouvert hors ligne. Il s'ouvre dans la feuille de partage du système (enregistrer, imprimer, envoyer).
class CertificateButton extends ConsumerStatefulWidget {
  const CertificateButton({super.key, required this.courseId, required this.number});
  final String courseId;
  final String number;

  @override
  ConsumerState<CertificateButton> createState() => _CertificateButtonState();
}

class _CertificateButtonState extends ConsumerState<CertificateButton> {
  bool _busy = false;

  Future<File> _file(String slug) async {
    final dir = await getApplicationSupportDirectory();
    final safe = widget.number.replaceAll(RegExp(r'[^A-Za-z0-9-]'), '_');
    return File('${dir.path}/certificats/$slug/certificat-$safe.pdf');
  }

  Future<void> _open() async {
    final t = L.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final box = context.findRenderObject() as RenderBox?;
    final s = ref.read(sessionProvider).value;
    if (s == null) return;
    setState(() => _busy = true);
    try {
      final file = await _file(s.slug);
      if (!await file.exists()) {
        final res = await http
            .get(
              Uri.parse('$apiUrl/training/${widget.courseId}/certificate'),
              headers: {'authorization': 'Bearer ${s.token}', 'accept-language': lang},
            )
            .timeout(const Duration(seconds: 30));
        if (res.statusCode != 200) throw HttpException('${res.statusCode}');
        await file.parent.create(recursive: true);
        await file.writeAsBytes(res.bodyBytes, flush: true);
      }
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'application/pdf')],
          sharePositionOrigin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } on Object {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.certificateError)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: _busy ? null : _open,
    icon: const Icon(Icons.workspace_premium_outlined),
    label: Text(L.of(context).certificateDownload),
  );
}
