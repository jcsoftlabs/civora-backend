import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/errors.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/objects.dart';
import '../home/common.dart';

/// Rassemblements à venir (ENG-03) en billets, avec l'inscription en un geste.
class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> {
  String? _busy;

  Future<void> _toggle(Map e) async {
    final id = e['id'] as String;
    setState(() => _busy = id);
    try {
      await apiSend(ref, e['isRegistered'] == true ? 'DELETE' : 'POST', '/events/$id/registration');
      ref.invalidate(apiGet('/events'));
    } on ApiError catch (err) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(L.of(context), err))));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    return Scaffold(
      appBar: AppBar(backgroundColor: Palette.paper, title: Text(t.eventsTitle)),
      body: Remote(
        '/events',
        skeleton: const Padding(padding: EdgeInsets.all(22), child: Skeleton(height: 100)),
        builder: (l) {
          final events = (l.data['events'] as List).cast<Map>();
          if (events.isEmpty) {
            return Padding(
              padding: const EdgeInsets.all(22),
              child: Text(t.eventsEmpty, style: const TextStyle(color: Palette.ink2)),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(22, 8, 22, 40),
            children: [
              for (final (i, e) in events.indexed) ...[
                TicketCard(
                  label: t.ticketLabel,
                  title: tr(e['title'], locale),
                  place: e['address'] as String?,
                  when: formatDayTime(DateTime.parse(e['startsAt'] as String), locale.languageCode),
                  footnote: e['isRegistered'] == true
                      ? t.ticketRegistered
                      : e['placesLeft'] is int
                      ? t.ticketPlaces(e['placesLeft'] as int)
                      : null,
                  tilt: i.isEven ? 0.012 : -0.01,
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 10, 4, 22),
                  child: e['isRegistered'] == true
                      ? OutlinedButton(
                          onPressed: _busy == e['id'] ? null : () => _toggle(e),
                          child: Text(t.eventUnregister),
                        )
                      : FilledButton(
                          onPressed: _busy == e['id'] || e['placesLeft'] == 0 ? null : () => _toggle(e),
                          child: Text(e['placesLeft'] == 0 ? t.eventFull : t.eventRegister),
                        ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
