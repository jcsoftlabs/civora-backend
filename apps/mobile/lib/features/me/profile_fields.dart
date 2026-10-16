import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/theme.dart';
import '../../core/time.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/layout.dart';

/// Champs communs à l'adhésion et à la fiche membre (ADH-01, ADH-02) : lieu, téléphone, date de naissance,
/// personne référente et pièce d'identité.

/// Téléphone international : « +509 3712-3456 » devient « +50937123456 » ; null s'il n'est pas valable.
String? normalizePhone(String raw) {
  final v = raw.replaceAll(RegExp(r'[\s().-]'), '');
  return RegExp(r'^\+\d{8,15}$').hasMatch(v) ? v : null;
}

const identityKinds = ['nin', 'nif', 'passport', 'ssn'];

String identityKindLabel(L t, String kind) => switch (kind) {
  'nin' => t.identityKindNin,
  'nif' => t.identityKindNif,
  'passport' => t.identityKindPassport,
  'ssn' => t.identityKindSsn,
  _ => kind,
};

/// Recherche d'une section communale ou d'une ville de la diaspora (les seuls lieux d'une fiche).
class ZoneSearchField extends StatefulWidget {
  const ZoneSearchField({
    super.key,
    required this.label,
    required this.onPicked,
    this.helper,
    this.errorText,
    this.brand = Palette.primary,
  });
  final String label;
  final String? helper;
  final String? errorText;
  final Color brand;
  final ValueChanged<Map<String, dynamic>?> onPicked;

  @override
  State<ZoneSearchField> createState() => _ZoneSearchFieldState();
}

class _ZoneSearchFieldState extends State<ZoneSearchField> {
  final _text = TextEditingController();
  Map<String, dynamic>? _picked;
  List<Map> _results = const [];
  Timer? _debounce;

  @override
  void dispose() {
    _text.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _search(String q) {
    _debounce?.cancel();
    if (_picked != null) {
      setState(() => _picked = null);
      widget.onPicked(null);
    }
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

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _text,
          onChanged: _search,
          decoration: InputDecoration(
            labelText: widget.label,
            helperText: _picked == null ? widget.helper : null,
            helperMaxLines: 3,
            errorText: widget.errorText,
            errorMaxLines: 3,
            suffixIcon: _picked != null ? Icon(Icons.check_circle, color: widget.brand) : null,
          ),
        ),
        if (_picked == null && _results.isNotEmpty)
          for (final z in _results)
            ListTile(
              contentPadding: EdgeInsets.zero,
              minTileHeight: 48,
              title: Text(z['name'] as String, style: Txt.body.copyWith(fontWeight: FontWeight.w600)),
              subtitle: Text(z['code'] as String, style: Txt.small),
              onTap: () {
                final picked = Map<String, dynamic>.from(z);
                setState(() {
                  _picked = picked;
                  _text.text = z['name'] as String;
                  _results = const [];
                });
                widget.onPicked(picked);
              },
            )
        else if (_picked == null && _text.text.trim().length >= 2)
          Padding(
            padding: const EdgeInsets.only(top: Space.s),
            child: Text(t.zoneNone, style: Txt.small),
          ),
      ],
    );
  }
}

/// Date de naissance : un bouton qui ouvre le calendrier, la date écrite en toutes lettres.
class BirthDateField extends StatelessWidget {
  const BirthDateField({super.key, required this.value, required this.onChanged});
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final lang = Localizations.localeOf(context).languageCode;
    final now = DateTime.now();
    return InputDecorator(
      decoration: InputDecoration(labelText: t.birthDateLabel),
      child: Row(
        children: [
          Expanded(
            child: Text(
              value == null ? t.birthDateNone : formatDate(value!, lang),
              style: Txt.body.copyWith(color: value == null ? Palette.ink2 : Palette.ink),
            ),
          ),
          TextButton(
            onPressed: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: value ?? DateTime(now.year - 30),
                firstDate: DateTime(now.year - 110),
                lastDate: DateTime(now.year - 14, now.month, now.day),
                initialEntryMode: DatePickerEntryMode.calendarOnly,
              );
              if (picked != null) onChanged(picked);
            },
            child: Text(t.birthDatePick),
          ),
        ],
      ),
    );
  }
}

/// Pièce d'identité : type et numéro. Le numéro part chiffré et ne revient jamais dans l'application.
class IdentityFields extends StatelessWidget {
  const IdentityFields({
    super.key,
    required this.kind,
    required this.onKind,
    required this.number,
    this.errorText,
    this.exclude = const [],
  });
  final String kind;
  final ValueChanged<String> onKind;
  final TextEditingController number;
  final String? errorText;

  /// Types déjà enregistrés par le membre (une seule pièce par type).
  final List<String> exclude;

  @override
  Widget build(BuildContext context) {
    final t = L.of(context);
    final kinds = identityKinds.where((k) => !exclude.contains(k)).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          initialValue: kinds.contains(kind) ? kind : kinds.first,
          decoration: InputDecoration(labelText: t.identityLabel),
          items: [for (final k in kinds) DropdownMenuItem(value: k, child: Text(identityKindLabel(t, k)))],
          onChanged: (k) => k == null ? null : onKind(k),
        ),
        const SizedBox(height: Space.m),
        TextField(
          controller: number,
          autocorrect: false,
          enableSuggestions: false,
          textCapitalization: TextCapitalization.characters,
          decoration: InputDecoration(labelText: t.identityNumber, errorText: errorText, errorMaxLines: 3),
        ),
        const SizedBox(height: Space.s),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 2),
              child: Icon(Icons.lock_outline, size: 16, color: Palette.ink2),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(t.identityNote, style: Txt.small)),
          ],
        ),
      ],
    );
  }
}
