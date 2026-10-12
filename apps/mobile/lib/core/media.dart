import 'config.dart';

/// Lien de fichier renvoyé par l'API (signé, valable une heure). En développement, le stockage local répond
/// sur localhost, que l'émulateur ne voit pas : on le remplace par l'adresse de l'API vue du téléphone.
String mediaUrl(String url) {
  final u = Uri.tryParse(url);
  if (u == null) return url;
  if (u.host == 'localhost' || u.host == '127.0.0.1') {
    final api = Uri.parse(apiUrl);
    return u.replace(scheme: api.scheme, host: api.host, port: api.port).toString();
  }
  return url;
}

/// Lien YouTube intégré (youtube-nocookie.com/embed/ID) vers la page de la vidéo, ouverte dans l'app YouTube.
String watchUrl(String embed) {
  final yt = RegExp(r'youtube(?:-nocookie)?\.com/embed/([\w-]{6,})').firstMatch(embed);
  if (yt != null) return 'https://www.youtube.com/watch?v=${yt.group(1)}';
  final vimeo = RegExp(r'player\.vimeo\.com/video/(\d+)').firstMatch(embed);
  if (vimeo != null) return 'https://vimeo.com/${vimeo.group(1)}';
  return embed;
}
