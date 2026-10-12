import 'package:flutter/cupertino.dart' show CupertinoLocalizations;
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/state.dart';
import 'core/storage.dart';
import 'core/theme.dart';
import 'features/act/dues_screen.dart';
import 'features/act/events_screen.dart';
import 'features/home/card_screen.dart';
import 'features/home/shell.dart';
import 'features/news/news_screen.dart';
import 'features/news/podcast_player.dart';
import 'features/onboarding/code_screen.dart';
import 'features/onboarding/scan_screen.dart';
import 'features/onboarding/signin_screen.dart';
import 'features/onboarding/welcome_screen.dart';
import 'features/training/course_screen.dart';
import 'features/training/courses_screen.dart';
import 'features/votes/vote_screen.dart';
import 'features/votes/votes_screen.dart';
import 'l10n/app_localizations.dart';

/// Les traductions de Flutter (boutons système, dates) n'existent pas en créole : le français les remplace.
class _FallbackDelegate<T> extends LocalizationsDelegate<T> {
  const _FallbackDelegate(this.inner);
  final LocalizationsDelegate<T> inner;

  @override
  bool isSupported(Locale locale) => locale.languageCode == 'ht' || inner.isSupported(locale);

  @override
  Future<T> load(Locale locale) => inner.load(locale.languageCode == 'ht' ? const Locale('fr') : locale);

  // Le type vient du délégué d'origine : sans cela, Localizations ne retrouve pas les traductions Material.
  @override
  Type get type => inner.type;

  @override
  bool shouldReload(covariant LocalizationsDelegate<T> old) => false;
}

/// Écrans accessibles sans session : accueil, scan, connexion, code, double authentification.
const _public = ['/bienvenue', '/scanner', '/connexion', '/code', '/double-authentification'];

final _routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(sessionProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);
  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      if (session.isLoading) return null;
      final signedIn = session.value != null;
      final public = _public.contains(state.matchedLocation);
      if (!signedIn && !public) return '/bienvenue';
      if (signedIn && (public || state.matchedLocation == '/')) return '/accueil';
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (_, _) => const _Splash()),
      GoRoute(path: '/bienvenue', builder: (_, _) => const WelcomeScreen()),
      GoRoute(path: '/scanner', builder: (_, _) => const ScanScreen()),
      GoRoute(path: '/connexion', builder: (_, _) => const SignInScreen()),
      GoRoute(path: '/code', builder: (_, _) => const CodeScreen()),
      GoRoute(
        path: '/double-authentification',
        builder: (_, s) {
          final (session, mfa) = s.extra! as (Session, String);
          return MfaScreen(session: session, mfa: mfa);
        },
      ),
      GoRoute(path: '/accueil', builder: (_, _) => const HomeShell()),
      GoRoute(path: '/carte', builder: (_, _) => const CardScreen()),
      GoRoute(path: '/votes', builder: (_, _) => const VotesScreen()),
      GoRoute(
        path: '/votes/:id',
        builder: (_, s) => VoteScreen(id: s.pathParameters['id']!),
      ),
      GoRoute(path: '/formations', builder: (_, _) => const CoursesScreen()),
      GoRoute(
        path: '/formations/:id',
        builder: (_, s) => CourseScreen(id: s.pathParameters['id']!),
      ),
      GoRoute(path: '/rassemblements', builder: (_, _) => const EventsScreen()),
      GoRoute(path: '/cotisations', builder: (_, _) => const DuesScreen()),
      GoRoute(
        path: '/podcasts',
        builder: (_, _) => const NewsScreen(only: 'podcast', standalone: true),
      ),
      GoRoute(
        path: '/albums',
        builder: (_, _) => const NewsScreen(only: 'album', standalone: true),
      ),
      GoRoute(
        path: '/album',
        builder: (_, s) {
          final (title, images) = s.extra! as (String, List<Map>);
          return AlbumScreen(title: title, images: images);
        },
      ),
    ],
  );
});

class CivoraApp extends ConsumerWidget {
  const CivoraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(sessionProvider).value != null;
    // Couleur du parti dans son espace ; pétrole civora avant la connexion.
    final brand = signedIn
        ? parseHex(((ref.watch(apiGet('/auth/me')).value?.data['party']) as Map?)?['brandColor'] as String?)
        : Palette.primary;
    return MaterialApp.router(
      title: 'civora',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(brand),
      locale: ref.watch(localeProvider),
      supportedLocales: L.supportedLocales,
      localizationsDelegates: const [
        L.delegate,
        _FallbackDelegate<MaterialLocalizations>(GlobalMaterialLocalizations.delegate),
        _FallbackDelegate<CupertinoLocalizations>(GlobalCupertinoLocalizations.delegate),
        _FallbackDelegate<WidgetsLocalizations>(GlobalWidgetsLocalizations.delegate),
      ],
      routerConfig: ref.watch(_routerProvider),
    );
  }
}

/// Le temps de lire la session dans le trousseau : un fond papier, sans indicateur.
class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const ColoredBox(color: Palette.paper);
}
