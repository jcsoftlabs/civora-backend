import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/errors.dart';
import '../../core/theme.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';
import '../me/profile_fields.dart';
import 'join_flow.dart';

/// Adhésion depuis l'application (ADH-01, ADH-02, ENG-01) : prénom, nom, adresse e-mail, section communale ou
/// ville de la diaspora (recherche), code de parrainage (prérempli depuis un lien, obligatoire si le parti adhère
/// par parrainage). Un code part à l'adresse e-mail ; il confirme la fiche et ouvre l'espace membre.
class AdhesionScreen extends ConsumerStatefulWidget {
  const AdhesionScreen({super.key});

  @override
  ConsumerState<AdhesionScreen> createState() => _AdhesionScreenState();
}

class _AdhesionScreenState extends ConsumerState<AdhesionScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _zone = TextEditingController();
  late final _sponsor = TextEditingController(text: ref.read(joinFlowProvider).sponsorCode ?? '');
  final _phone = TextEditingController();
  final _referent = TextEditingController();
  final _identity = TextEditingController();
  String _identityKind = 'nin';
  DateTime? _birth;
  bool _more = false;
  Map<String, dynamic>? _picked;
  List<Map> _results = const [];
  Timer? _debounce;
  bool _busy = false;
  final Map<String, String> _errors = {};
  String? _error;

  @override
  void dispose() {
    for (final c in [_first, _last, _email, _zone, _sponsor, _phone, _referent, _identity]) {
      c.dispose();
    }
    _debounce?.cancel();
    super.dispose();
  }

  void _search(String q) {
    _debounce?.cancel();
    setState(() => _picked = null);
    if (q.trim().length < 2) return setState(() => _results = const []);
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final r = await ApiClient().get('/zones/search?q=${Uri.encodeQueryComponent(q.trim())}');
        final zones = ((r['zones'] as List?) ?? const []).cast<Map>().where(
          (z) => z['level'] == 'section_communale' || z['level'] == 'diaspora_ville',
        );
        if (mounted) setState(() => _results = zones.take(6).toList());
      } on ApiError {
        if (mounted) setState(() => _results = const []);
      }
    });
  }

  Future<void> _submit() async {
    final t = L.of(context);
    final party = ref.read(joinFlowProvider).party!;
    final required = party.admissionMode == 'parrainage';
    final errors = <String, String>{
      if (_first.text.trim().length < 2) 'first': t.errorRequired,
      if (_last.text.trim().length < 2) 'last': t.errorRequired,
      if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim())) 'email': t.errorInvalidEmail,
      if (_picked == null) 'zone': t.errorZoneTooBroad,
      if (required && _sponsor.text.trim().isEmpty) 'sponsor': t.sponsorRequired,
      if (_phone.text.trim().isNotEmpty && normalizePhone(_phone.text) == null) 'phone': t.errorPhone,
      if (_referent.text.trim().isNotEmpty && !RegExp(r'^\d{1,12}$').hasMatch(_referent.text.trim()))
        'referent': t.errorReferentNotFound,
      if (_identity.text.trim().isNotEmpty && _identity.text.trim().length < 4) 'identity': t.errorIdentityValue,
    };
    setState(() {
      _errors
        ..clear()
        ..addAll(errors);
      _error = null;
    });
    if (errors.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      final sponsor = _sponsor.text.trim().toUpperCase();
      await ref
          .read(joinFlowProvider.notifier)
          .startAdhesion(
            {
              'firstName': _first.text.trim(),
              'lastName': _last.text.trim(),
              'zoneCode': _picked!['code'] as String,
              if (sponsor.isNotEmpty) 'sponsorCode': sponsor,
              'phone': ?normalizePhone(_phone.text),
              if (_birth case final b?)
                'birthDate': '${b.year}-${b.month.toString().padLeft(2, '0')}-${b.day.toString().padLeft(2, '0')}',
              if (_referent.text.trim().isNotEmpty) 'referentMemberNumber': _referent.text.trim(),
              if (_identity.text.trim().isNotEmpty) 'identity': {'kind': _identityKind, 'value': _identity.text.trim()},
            },
            _email.text.trim(),
            Localizations.localeOf(context).languageCode,
          );
      if (mounted) context.push('/code');
    } on Object catch (e) {
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final party = ref.watch(joinFlowProvider).party;
    if (party == null) return const SizedBox.shrink();
    final brand = parseHex(party.brandColor);
    final required = party.admissionMode == 'parrainage';
    InputDecoration field(String label, String key, {String? helper}) => InputDecoration(
      labelText: label,
      errorText: _errors[key],
      helperText: helper,
      helperMaxLines: 3,
      errorMaxLines: 3,
    );
    return Theme(
      data: buildTheme(brand),
      child: Scaffold(
        body: BannerPage(
          brand: brand,
          title: t.joinAdhere(party.name),
          message: t.adhesionLead,
          children: [
            TextField(
              controller: _first,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.givenName],
              decoration: field(t.firstName, 'first'),
            ),
            const SizedBox(height: Space.m),
            TextField(
              controller: _last,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.familyName],
              decoration: field(t.lastName, 'last'),
            ),
            const SizedBox(height: Space.m),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              autofillHints: const [AutofillHints.email],
              decoration: field(t.joinEmail, 'email'),
            ),
            const SizedBox(height: Space.m),
            TextField(
              controller: _zone,
              onChanged: _search,
              decoration: field(
                t.zoneLabel,
                'zone',
                helper: _picked == null ? t.zoneHelp : null,
              ).copyWith(suffixIcon: _picked != null ? Icon(Icons.check_circle, color: brand) : null),
            ),
            if (_picked == null && _results.isNotEmpty)
              Column(
                children: [
                  for (final z in _results)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(z['name'] as String, style: Txt.body.copyWith(fontWeight: FontWeight.w600)),
                      subtitle: Text(z['code'] as String, style: Txt.small),
                      onTap: () => setState(() {
                        _picked = Map<String, dynamic>.from(z);
                        _zone.text = z['name'] as String;
                        _results = const [];
                      }),
                    ),
                ],
              )
            else if (_picked == null && _zone.text.trim().length >= 2)
              Padding(
                padding: const EdgeInsets.only(top: Space.s),
                child: Text(t.zoneNone, style: Txt.small),
              ),
            const SizedBox(height: Space.m),
            TextField(
              controller: _sponsor,
              textCapitalization: TextCapitalization.characters,
              autocorrect: false,
              decoration: field(
                required ? t.sponsorLabel : t.sponsorOptional,
                'sponsor',
              ).copyWith(hintText: 'ABCD-1234'),
            ),
            const SizedBox(height: Space.m),
            // Le reste de la fiche (ADH-01, ADH-02) : facultatif à l'adhésion, modifiable ensuite dans « Ma fiche ».
            Material(
              color: Palette.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: const BorderSide(color: Palette.line),
              ),
              clipBehavior: Clip.antiAlias,
              child: ExpansionTile(
                initiallyExpanded: _more,
                onExpansionChanged: (v) => setState(() => _more = v),
                shape: const Border(),
                collapsedShape: const Border(),
                title: Text(t.adhesionMore, style: Txt.body.copyWith(fontWeight: FontWeight.w600)),
                subtitle: Text(t.adhesionMoreHelp, style: Txt.small),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    decoration: field(t.phoneLabel, 'phone', helper: t.phoneHelp),
                  ),
                  const SizedBox(height: Space.m),
                  BirthDateField(value: _birth, onChanged: (d) => setState(() => _birth = d)),
                  const SizedBox(height: Space.m),
                  TextField(
                    controller: _referent,
                    keyboardType: TextInputType.number,
                    decoration: field(t.referentLabel, 'referent', helper: t.referentHelp),
                  ),
                  const SizedBox(height: Space.m),
                  IdentityFields(
                    kind: _identityKind,
                    onKind: (k) => setState(() => _identityKind = k),
                    number: _identity,
                    errorText: _errors['identity'],
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: Space.m),
              Text(_error!, style: Txt.body.copyWith(color: Palette.danger)),
            ],
            const SizedBox(height: Space.l),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(t.adhesionSubmit)),
          ],
        ),
      ),
    );
  }
}
