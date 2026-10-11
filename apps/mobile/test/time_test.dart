import 'package:civora/core/time.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('heure d\'hiver et heure d\'été d\'Haïti', () {
    expect(haitiOffset(DateTime.utc(2026, 1, 15, 12)), -5);
    expect(haitiOffset(DateTime.utc(2026, 7, 1, 12)), -4);
    // 2026 : heure d'été du 8 mars (7 h UTC) au 1er novembre (6 h UTC).
    expect(haitiOffset(DateTime.utc(2026, 3, 8, 6, 59)), -5);
    expect(haitiOffset(DateTime.utc(2026, 3, 8, 7)), -4);
    expect(haitiOffset(DateTime.utc(2026, 11, 1, 5, 59)), -4);
    expect(haitiOffset(DateTime.utc(2026, 11, 1, 6)), -5);
  });

  test('heures sur 12 heures avec AM ou PM, à l\'heure d\'Haïti', () {
    expect(formatTime(DateTime.utc(2026, 10, 16, 13)), '9:00 AM');
    expect(formatTime(DateTime.utc(2026, 10, 16, 16, 30)), '12:30 PM');
    expect(formatTime(DateTime.utc(2026, 10, 17, 4)), '12:00 AM');
    expect(formatTime(DateTime.utc(2026, 12, 1, 23, 5)), '6:05 PM');
  });

  test('un soir en Haïti n\'est pas le lendemain', () {
    expect(formatDay(DateTime.utc(2026, 10, 17, 2), 'fr'), '16 octobre');
    expect(formatDayTime(DateTime.utc(2026, 10, 17, 13), 'ht'), 'sam 17 oktòb, 9:00 AM');
    expect(monthInitial(8, 'ht'), 'O');
    expect(monthInitial(8, 'fr'), 'A');
    expect(formatAmount('500.00', 'HTG'), '500 HTG');
    expect(formatAmount('1250.5', 'HTG'), '1\u202f250,50 HTG');
  });
}
