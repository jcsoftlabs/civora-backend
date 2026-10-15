/// Adresse de l'API, fixée à la compilation : `--dart-define=API_URL=https://api.civora.space`.
/// Par défaut, l'API locale vue depuis l'émulateur Android (10.0.2.2 désigne l'ordinateur hôte).
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');
