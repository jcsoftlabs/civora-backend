import '../l10n/app_localizations.dart';
import 'api.dart';

/// Message d'erreur affiché : ce qui s'est passé et quoi faire, jamais le code technique.
String errorText(L t, Object e) {
  if (e is! ApiError) return t.errorGeneric;
  return switch (e.code) {
    'not_found' => t.errorNotFound,
    'otp_invalid' => t.errorOtpInvalid,
    'mfa_invalid' => t.errorMfaInvalid,
    'rate_limited' => t.errorRateLimited,
    'otp_channel_disabled' => t.errorChannelDisabled,
    _ => t.errorGeneric,
  };
}
