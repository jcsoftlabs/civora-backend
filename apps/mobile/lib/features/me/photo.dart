import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../../core/api.dart';
import '../../core/media.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';

/// Lien de lecture de la photo du membre (cinq minutes, renouvelé à chaque ouverture).
final _photoUrl = FutureProvider.autoDispose.family<String?, String>((ref, fileId) async {
  final s = ref.watch(sessionProvider).value;
  if (s == null) return null;
  try {
    final r = await ApiClient(token: s.token).get('/files/$fileId/url');
    return r['url'] as String?;
  } on ApiError {
    return null;
  }
});

/// Photo du membre (ADH-01) dans un cercle, avec un bouton pour la changer : appareil photo ou galerie. L'image
/// est réduite sur le téléphone (900 px, JPEG) avant l'envoi : réseau lent, forfaits comptés.
class MemberPhoto extends ConsumerStatefulWidget {
  const MemberPhoto({super.key, required this.photoFileId, required this.initials, required this.ring});
  final String? photoFileId;
  final String initials;
  final Color ring;

  @override
  ConsumerState<MemberPhoto> createState() => _MemberPhotoState();
}

class _MemberPhotoState extends ConsumerState<MemberPhoto> {
  bool _busy = false;

  Future<void> _change() async {
    final t = L.of(context);
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: Palette.paper,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: Text(t.photoCamera),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(t.photoGallery),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
    if (source == null) return;
    final picked = await ImagePicker().pickImage(source: source, maxWidth: 900, maxHeight: 900, imageQuality: 82);
    if (picked == null) return;
    setState(() => _busy = true);
    try {
      final bytes = await picked.readAsBytes();
      final s = ref.read(sessionProvider).value!;
      final api = ApiClient(token: s.token);
      // Demande d'envoi, dépôt sur l'URL signée, vérification par l'API, rattachement à la fiche.
      final ticket = await api.post('/files/uploads', {
        'purpose': 'member_photo',
        'name': 'photo.jpg',
        'mimeType': 'image/jpeg',
        'sizeBytes': bytes.length,
      });
      final up = ticket['upload'] as Map;
      final put = await http.put(
        Uri.parse(mediaUrl(up['url'] as String)),
        headers: ((up['headers'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v')),
        body: bytes,
      );
      if (put.statusCode >= 300) throw ApiError(put.statusCode, 'upload_failed');
      await api.post('/files/${ticket['fileId']}/complete', const {});
      await api.put('/members/me/photo', {'fileId': ticket['fileId']});
      ref.invalidate(apiGet('/members/me'));
    } on Object {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.photoError)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final url = widget.photoFileId == null ? null : ref.watch(_photoUrl(widget.photoFileId!)).value;
    return Semantics(
      button: true,
      label: t.photoChange,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: _busy ? null : _change,
        child: SizedBox.square(
          dimension: 92,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 88,
                height: 88,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: widget.ring, width: 2),
                ),
                child: ClipOval(
                  child: url != null
                      ? Image.network(mediaUrl(url), fit: BoxFit.cover, cacheWidth: 300)
                      : ColoredBox(
                          color: widget.ring.withValues(alpha: 0.18),
                          child: Center(
                            child: Text(
                              widget.initials.toUpperCase(),
                              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w600, color: widget.ring),
                            ),
                          ),
                        ),
                ),
              ),
              Positioned(
                right: 0,
                bottom: 2,
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: Palette.ink,
                    shape: BoxShape.circle,
                    border: Border.all(color: Palette.paper, width: 2),
                  ),
                  child: Icon(_busy ? Icons.hourglass_top : Icons.photo_camera, size: 16, color: Palette.paper),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
