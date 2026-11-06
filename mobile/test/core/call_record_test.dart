import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/data/models/models.dart';
import 'package:orvia/screens/calls/call_tile.dart';

void main() {
  Map<String, Object?> row(Map<String, Object?> extracted, {String? phone = '+919876543210'}) => {
    'id': 'c1',
    'status': 'completed',
    'created_at': '2026-10-13T10:00:00Z',
    'caller_phone': phone,
    'extracted_data': extracted,
  };

  test('a call the phone agent answered is marked and titled by name', () {
    final call = CallRecord.fromJson(row({'source': 'phone_agent', 'caller_name': 'Imran'}));
    expect(call.answeredOnPhone, isTrue);
    expect(call.isTestCall, isFalse);
    expect(callTitle(call), 'Imran');
  });

  test('without a name the title is the number', () {
    final call = CallRecord.fromJson(row({'source': 'phone_agent'}));
    expect(callTitle(call), '+91 98765 43210');
  });

  test('ordinary and test calls are not agent calls', () {
    expect(CallRecord.fromJson(row({})).answeredOnPhone, isFalse);
    final web = CallRecord.fromJson(row({'source': 'web'}, phone: null));
    expect(web.answeredOnPhone, isFalse);
    expect(callTitle(web), 'Test call');
  });
}
