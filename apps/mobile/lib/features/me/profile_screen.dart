import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/errors.dart';
import '../../core/state.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../../widgets/objects.dart';
import 'profile_fields.dart';

/// Ma fiche (ADH-01, ADH-02) : identité, contact, lieu jusqu'à la section communale ou la ville de la diaspora,
/// personne référente et pièces d'identité. Lisible hors ligne (dernière fiche enregistrée) ; les changements
/// demandent le réseau. Une pièce ajoutée part chiffrée et n'est jamais réaffichée.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _phone = TextEditingController();
  final _referent = TextEditingController();
  DateTime? _birth;
  Map<String, dynamic>? _zone;
  bool _changeZone = false;
  bool _loaded = false;
  bool _busy = false;
  final Map<String, String> _errors = {};
  String? _error;

  @override
  void dispose() {
    for (final c in [_first, _last, _phone, _referent]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(Map<String, dynamic> m) {
    if (_loaded) return;
    _loaded = true;
    _first.text = m['firstName'] as String? ?? '';
    _last.text = m['lastName'] as String? ?? '';
    _phone.text = m['phone'] as String? ?? '';
    _referent.text = (m['referent'] as Map?)?['number'] as String? ?? '';
    final b = m['birthDate'] as String?;
    _birth = b == null ? null : DateTime.parse(b);
  }

  Future<void> _save(Map<String, dynamic> m) async {
    final t = L.of(context);
    final phone = _phone.text.trim();
    final referent = _referent.text.trim();
    final errors = <String, String>{
      if (_first.text.trim().isEmpty) 'first': t.errorRequired,
      if (_last.text.trim().isEmpty) 'last': t.errorRequired,
      if (phone.isNotEmpty && normalizePhone(phone) == null) 'phone': t.errorPhone,
      if (referent.isNotEmpty && !RegExp(r'^\d{1,12}$').hasMatch(referent)) 'referent': t.errorReferentNotFound,
      if (_changeZone && _zone == null) 'zone': t.errorZoneTooBroad,
    };
    setState(() {
      _errors
        ..clear()
        ..addAll(errors);
      _error = null;
    });
    if (errors.isNotEmpty) return;
    final before = (m['referent'] as Map?)?['number'] as String? ?? '';
    setState(() => _busy = true);
    try {
      await apiSend(ref, 'PATCH', '/members/me', {
        'firstName': _first.text.trim(),
        'lastName': _last.text.trim(),
        'phone': phone.isEmpty ? null : normalizePhone(phone),
        'birthDate': _birth == null
            ? null
            : '${_birth!.year}-${_birth!.month.toString().padLeft(2, '0')}-${_birth!.day.toString().padLeft(2, '0')}',
        if (_changeZone && _zone != null) 'zoneCode': _zone!['code'],
        if (referent != before) 'referentMemberNumber': referent.isEmpty ? null : referent,
      });
      ref.invalidate(apiGet('/members/me'));
      ref.invalidate(apiGet('/auth/me'));
      _loaded = false;
      if (!mounted) return;
      setState(() => _changeZone = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t.profileSaved)));
    } on ApiError catch (e) {
      setState(() => e.code == 'referent_not_found' ? _errors['referent'] = errorText(t, e) : _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addIdentity(List<String> taken) async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Palette.paper,
      showDragHandle: true,
      builder: (_) => _IdentitySheet(taken: taken),
    );
    if (added == true && mounted) {
      ref.invalidate(apiGet('/members/me'));
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(L.of(context).identitySaved)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final locale = Localizations.localeOf(context);
    final async = ref.watch(apiGet('/members/me'));
    final party = ref.watch(apiGet('/auth/me')).value?.data['party'] as Map?;
    final brand = parseHex(party?['brandColor'] as String?);
    return Theme(
      data: buildTheme(brand),
      child: Scaffold(
        body: async.when(
          loading: () => const SafeArea(
            child: Padding(padding: EdgeInsets.all(22), child: Skeleton(height: 420)),
          ),
          error: (e, _) => SafeArea(
            child: ErrorRetry(
              message: errorText(t, e),
              retry: t.retry,
              onRetry: () => ref.invalidate(apiGet('/members/me')),
            ),
          ),
          data: (l) {
            final m = l.data;
            _fill(m);
            final offline = l.offline;
            final location = ((m['location'] as List?) ?? const []).cast<Map>();
            final place = location.isEmpty ? null : location.last;
            final placeName = place == null
                ? ''
                : (locale.languageCode == 'ht' && (place['nameHt'] as String?)?.isNotEmpty == true
                      ? place['nameHt'] as String
                      : place['name'] as String);
            final chain = location.reversed.skip(1).map((z) => z['name'] as String).join(', ');
            final identities = ((m['identities'] as List?) ?? const []).cast<Map>();
            final taken = identities.map((i) => i['kind'] as String).toList();
            return BannerPage(
              brand: brand,
              title: t.profileTitle,
              message: t.meNumber(m['memberNumber'] as String? ?? ''),
              children: [
                if (offline) ...[OfflineBanner(text: t.profileOfflineEdit), const SizedBox(height: Space.m)],
                TextField(
                  controller: _first,
                  enabled: !offline,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(labelText: t.firstName, errorText: _errors['first']),
                ),
                const SizedBox(height: Space.m),
                TextField(
                  controller: _last,
                  enabled: !offline,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(labelText: t.lastName, errorText: _errors['last']),
                ),
                const SizedBox(height: Space.m),
                BirthDateField(value: _birth, onChanged: offline ? (_) {} : (d) => setState(() => _birth = d)),

                SheetHeading(t.joinEmail),
                Text(m['email'] as String? ?? '', style: Txt.body.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(t.profileEmailHelp, style: Txt.small),
                const SizedBox(height: Space.m),
                TextField(
                  controller: _phone,
                  enabled: !offline,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  decoration: InputDecoration(
                    labelText: t.phoneLabel,
                    helperText: t.phoneHelp,
                    errorText: _errors['phone'],
                    errorMaxLines: 3,
                  ),
                ),

                SheetHeading(t.profileLocation),
                Text(placeName, style: Txt.body.copyWith(fontWeight: FontWeight.w600)),
                if (chain.isNotEmpty) Text(chain, style: Txt.small),
                const SizedBox(height: Space.s),
                if (_changeZone)
                  ZoneSearchField(
                    label: t.zoneLabel,
                    helper: t.zoneHelp,
                    errorText: _errors['zone'],
                    brand: brand,
                    onPicked: (z) => setState(() => _zone = z),
                  )
                else
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: offline ? null : () => setState(() => _changeZone = true),
                      child: Text(t.profileZoneChange),
                    ),
                  ),

                SheetHeading(t.referentLabel),
                TextField(
                  controller: _referent,
                  enabled: !offline,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: t.referentLabel,
                    helperText: (m['referent'] as Map?) != null
                        ? '${(m['referent'] as Map)['firstName']} ${(m['referent'] as Map)['lastName']}'
                        : t.referentHelp,
                    helperMaxLines: 3,
                    errorText: _errors['referent'],
                    suffixIcon: _referent.text.isEmpty || offline
                        ? null
                        : IconButton(
                            tooltip: t.referentRemove,
                            icon: const Icon(Icons.close),
                            onPressed: () => setState(_referent.clear),
                          ),
                  ),
                ),

                SheetHeading(t.identityLabel),
                if (identities.isEmpty)
                  Text(t.identityNone, style: Txt.body.copyWith(color: Palette.ink2))
                else
                  for (final i in identities)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Space.s),
                      child: Row(
                        children: [
                          const Icon(Icons.lock_outline, size: 18, color: Palette.ink2),
                          const SizedBox(width: 10),
                          Expanded(child: Text(identityKindLabel(t, i['kind'] as String), style: Txt.body)),
                        ],
                      ),
                    ),
                if (taken.length < identityKinds.length)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: offline ? null : () => _addIdentity(taken),
                      icon: const Icon(Icons.add),
                      label: Text(t.identityAdd),
                    ),
                  ),

                if (_error != null) ...[
                  const SizedBox(height: Space.m),
                  Text(_error!, style: Txt.body.copyWith(color: Palette.danger)),
                ],
                const SizedBox(height: Space.l),
                FilledButton(onPressed: _busy || offline ? null : () => _save(m), child: Text(t.profileSave)),
                const SizedBox(height: Space.l),
                if (m['createdAt'] != null)
                  Text(
                    t.memberSince(formatDate(DateTime.parse(m['createdAt'] as String), locale.languageCode)),
                    style: Txt.small,
                    textAlign: TextAlign.center,
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Ajout d'une pièce d'identité, dans une feuille : type, numéro, rappel du chiffrement.
class _IdentitySheet extends ConsumerStatefulWidget {
  const _IdentitySheet({required this.taken});
  final List<String> taken;

  @override
  ConsumerState<_IdentitySheet> createState() => _IdentitySheetState();
}

class _IdentitySheetState extends ConsumerState<_IdentitySheet> {
  late String _kind = identityKinds.firstWhere((k) => !widget.taken.contains(k));
  final _number = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _number.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final t = L.of(context);
    final value = _number.text.trim();
    if (value.length < 4) return setState(() => _error = t.errorIdentityValue);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await apiSend(ref, 'PATCH', '/members/me', {
        'identity': {'kind': _kind, 'value': value},
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiError catch (e) {
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(22, 0, 22, 22 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(t.identityAdd, style: Txt.heading),
            const SizedBox(height: Space.m),
            IdentityFields(
              kind: _kind,
              onKind: (k) => setState(() => _kind = k),
              number: _number,
              errorText: _error,
              exclude: widget.taken,
            ),
            const SizedBox(height: Space.l),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(t.identityAdd)),
          ],
        ),
      ),
    );
  }
}
