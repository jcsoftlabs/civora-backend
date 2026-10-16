import 'package:civora/core/sync.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('UUID version 4, tiré au sort à chaque fois', () {
    final ids = {for (var i = 0; i < 200; i++) newUuid()};
    expect(ids, hasLength(200));
    for (final id in ids) {
      expect(id, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    }
  });

  test("une opération garde son heure d'origine et son refus d'un enregistrement à l'autre", () {
    final op = SyncOp(
      id: newUuid(),
      kind: 'training.chapter.view',
      payload: {'chapterId': 'abc'},
      createdAt: DateTime.utc(2026, 10, 15, 14, 2),
    );
    final back = SyncOp.fromJson(op.toJson());
    expect(back.createdAt, DateTime.utc(2026, 10, 15, 14, 2));
    expect(back.rejected, isNull);
    expect(op.toJson().containsKey('rejected'), isFalse);
    expect(SyncOp.fromJson(op.reject('not_found').toJson()).rejected, 'not_found');
    final state = SyncState(ops: [op, op.reject('x')]);
    expect(state.pending, hasLength(1));
    expect(state.pendingIds('training.chapter.view', 'chapterId'), {'abc'});
  });
}
