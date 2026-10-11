import 'package:civora/features/onboarding/join_flow.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('code, lien d\'invitation ou QR : identifiant de l\'organisation', () {
    expect(JoinFlow.slugFrom('horizon'), 'horizon');
    expect(JoinFlow.slugFrom('  Horizon '), 'horizon');
    expect(JoinFlow.slugFrom('https://horizon.civora.app'), 'horizon');
    expect(JoinFlow.slugFrom('horizon.civora.app/rejoindre'), 'horizon');
    expect(JoinFlow.slugFrom('https://civora.app/rejoindre/fanmi-lavalas'), 'fanmi-lavalas');
    expect(JoinFlow.slugFrom('http://horizon.localhost:5173/v/abc'), 'horizon');
    expect(JoinFlow.slugFrom('https://console.civora.app'), isNull);
    expect(JoinFlow.slugFrom('pas un code !'), isNull);
  });
}
