import 'package:civora/features/me/profile_fields.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('téléphone : indicatif obligatoire, espaces et tirets acceptés', () {
    expect(normalizePhone('+509 3712-3456'), '+50937123456');
    expect(normalizePhone(' +1 (305) 555-0199 '), '+13055550199');
    expect(normalizePhone('37123456'), isNull);
    expect(normalizePhone('+509 37'), isNull);
    expect(normalizePhone('+509 3712 3456 x'), isNull);
  });
}
