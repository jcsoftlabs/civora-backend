// Heures à l'heure d'Haïti, sur 12 heures avec AM ou PM (règle du produit), quelle que soit la langue du téléphone.
// Haïti suit les règles d'heure d'été des États-Unis : du deuxième dimanche de mars au premier dimanche de novembre,
// à 2 h locale. Pas de base de fuseaux horaires embarquée : la règle suffit et reste testable.

const _monthsFr = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const _monthsHt = [
  'janvye', 'fevriye', 'mas', 'avril', 'me', 'jen',
  'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm',
];
const _daysFr = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const _daysHt = ['len', 'mad', 'mèk', 'jed', 'van', 'sam', 'dim'];

DateTime _nthSunday(int year, int month, int n) {
  final first = DateTime.utc(year, month, 1);
  final offset = (DateTime.sunday - first.weekday) % 7;
  return DateTime.utc(year, month, 1 + offset + 7 * (n - 1));
}

/// Décalage d'Haïti à cet instant, en heures (−5 l'hiver, −4 l'été).
int haitiOffset(DateTime instant) {
  final utc = instant.toUtc();
  // Début : 2 h heure d'hiver (7 h UTC) ; fin : 2 h heure d'été (6 h UTC).
  final start = _nthSunday(utc.year, 3, 2).add(const Duration(hours: 7));
  final end = _nthSunday(utc.year, 11, 1).add(const Duration(hours: 6));
  return (utc.isAfter(start) || utc.isAtSameMomentAs(start)) && utc.isBefore(end) ? -4 : -5;
}

/// L'instant vu à l'heure d'Haïti (champs year, month, day, hour… à lire tels quels).
DateTime haitiTime(DateTime instant) {
  final utc = instant.toUtc();
  return utc.add(Duration(hours: haitiOffset(utc)));
}

/// « 9:00 AM », « 12:30 PM ».
String formatTime(DateTime instant) {
  final t = haitiTime(instant);
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h:${t.minute.toString().padLeft(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}';
}

/// « sam. 17 octobre, 9:00 AM ».
String formatDayTime(DateTime instant, String locale) {
  final t = haitiTime(instant);
  final ht = locale == 'ht';
  final day = (ht ? _daysHt : _daysFr)[t.weekday - 1];
  final month = (ht ? _monthsHt : _monthsFr)[t.month - 1];
  return '$day ${t.day} $month, ${formatTime(instant)}';
}

/// « 17 octobre » (date seule, à l'heure d'Haïti).
String formatDay(DateTime instant, String locale) {
  final t = haitiTime(instant);
  return '${t.day} ${(locale == 'ht' ? _monthsHt : _monthsFr)[t.month - 1]}';
}

/// Année en cours à l'heure d'Haïti.
int haitiYear([DateTime? now]) => haitiTime(now ?? DateTime.now()).year;

/// Initiale du mois (1 à 12) dans la langue choisie : « O » pour out en créole, « A » pour août.
String monthInitial(int month, String locale) =>
    (locale == 'ht' ? _monthsHt : _monthsFr)[month - 1].substring(0, 1).toUpperCase();

/// Montant de l'API (« 500.00 ») à la française : « 500 », « 1 250,50 » (espace fine insécable des milliers).
String formatAmount(String raw, String currency) {
  final v = double.tryParse(raw) ?? 0;
  final whole = v.truncate();
  final cents = ((v - whole) * 100).round();
  final digits = whole.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '\u202f');
  return '${cents == 0 ? digits : '$digits,${cents.toString().padLeft(2, '0')}'} $currency';
}
