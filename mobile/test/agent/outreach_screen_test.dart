import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/agent/outreach.dart';
import 'package:orvia/agent/outreach_screen.dart';
import 'package:orvia/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The native outreach side, faked.
class _FakeOutreach {
  String phase = 'idle';
  String? contactId;
  List<Map<String, Object?>> calls = [];
  final log = <MethodCall>[];

  Future<Object?> handle(MethodCall call) async {
    log.add(call);
    switch (call.method) {
      case 'outreachStatus':
        return {'phase': phase, 'contactId': contactId, 'error': null};
      case 'outreachCalls':
        return calls;
      case 'placeOutboundCall':
        phase = 'dialing';
        contactId = (call.arguments as Map)['contactId'] as String?;
        return true;
      default:
        return true;
    }
  }
}

void main() {
  const channel = MethodChannel('com.scalyft.orvia/gemini_phone');

  Future<_FakeOutreach> pump(WidgetTester tester, {List<OutreachContact> contacts = const []}) async {
    SharedPreferences.setMockInitialValues({});
    final store = await OutreachStore.open();
    await store.saveContacts(contacts);
    final fake = _FakeOutreach();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, fake.handle);
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Brightness.light),
        home: Scaffold(body: OutreachScreen(store: store)),
      ),
    );
    await tester.pumpAndSettle();
    return fake;
  }

  // The page polls on a timer; replacing it disposes the timer.
  Future<void> unmount(WidgetTester tester) => tester.pumpWidget(const SizedBox());

  const jack = OutreachContact(id: 'c1', number: '+14155550100', name: 'Jack', business: 'Jack Plumbing');

  testWidgets('adding a number lists it with a Call button', (tester) async {
    await pump(tester);
    expect(find.textContaining('Add a number to try a test call'), findsOneWidget);

    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Phone number'), '+1 415 555 0100');
    await tester.enterText(find.widgetWithText(TextField, 'Name (optional)'), 'Jack');
    await tester.tap(find.widgetWithText(TextButton, 'Add').last);
    await tester.pumpAndSettle();

    expect(find.text('Jack'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Call'), findsOneWidget);
    final saved = (await OutreachStore.open()).contacts();
    expect(saved.single.number, '+14155550100');
    await unmount(tester);
  });

  testWidgets('a bad number is refused', (tester) async {
    await pump(tester);
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Phone number'), '12');
    await tester.tap(find.widgetWithText(TextButton, 'Add').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter a number with country code'), findsOneWidget);
    await unmount(tester);
  });

  testWidgets('Call sends the number and the offer, then shows the live banner', (tester) async {
    final fake = await pump(tester, contacts: [jack]);
    await tester.tap(find.widgetWithText(FilledButton, 'Call'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));

    final placed = fake.log.where((c) => c.method == 'placeOutboundCall').single.arguments as Map;
    expect(placed['number'], '+14155550100');
    expect(placed['company'], 'Orvia');
    expect(placed['pitch'], contains('AI receptionist'));

    expect(find.text('Jack · Jack Plumbing'), findsWidgets);
    expect(find.textContaining('Ringing'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Hang up'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Take over'), findsNothing); // only once the agent talks

    fake.phase = 'talking';
    await tester.pump(const Duration(seconds: 2));
    expect(find.widgetWithText(FilledButton, 'Take over'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Take over'));
    await tester.pump();
    expect(fake.log.any((c) => c.method == 'outreachTakeOver'), isTrue);
    await unmount(tester);
  });

  testWidgets('someone who asked not to be called cannot be called again', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await OutreachStore.open();
    await store.saveContacts([jack]);
    final fake = _FakeOutreach()
      ..calls = [
        {
          'id': 'r1',
          'contactId': 'c1',
          'startedAt': 1,
          'endedAt': 60001,
          'outcome': 'do_not_call',
          'notes': <String>[],
          'turns': <Map<String, String>>[],
        },
      ];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, fake.handle);
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(Brightness.light),
        home: Scaffold(body: OutreachScreen(store: store)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.widgetWithText(FilledButton, 'Call'), findsNothing);
    expect(find.text('Do not call'), findsWidgets);
    await unmount(tester);
  });

  test('the offer and contacts survive a restart', () async {
    SharedPreferences.setMockInitialValues({});
    final store = await OutreachStore.open();
    expect(store.offer().company, 'Orvia');
    await store.saveOffer(const OutreachOffer(company: 'Acme', pitch: 'We fix leaks.', availability: 'Mondays'));
    await store.saveContacts([jack]);
    final again = await OutreachStore.open();
    expect(again.offer().company, 'Acme');
    expect(again.contacts().single.name, 'Jack');
  });

  test('every outcome the phone records has its own label', () {
    // Mirrors GeminiLiveSession.OUTCOMES plus what OutboundCallService sets itself.
    const outcomes = [
      'meeting_booked', 'interested', 'not_interested', 'call_back', 'do_not_call', 'wrong_number', //
      'voicemail', 'no_answer', 'failed', 'taken_over', 'owner_hung_up',
    ];
    for (final o in outcomes) {
      expect(outcomeLabel(o).$1, isNot('Ended'), reason: o);
    }
    expect(outcomeLabel('ended').$1, 'Ended');
  });

  testWidgets('results appear for a call that ended while the page was not watching', (tester) async {
    final fake = await pump(tester, contacts: [jack]);
    expect(find.text('Meeting booked'), findsNothing);
    // The whole call happened with the app in the background: the page only sees idle -> ended.
    fake
      ..phase = 'ended'
      ..calls = [
        {
          'id': 'r1',
          'contactId': 'c1',
          'startedAt': 1,
          'endedAt': 60001,
          'outcome': 'meeting_booked',
          'notes': <String>[],
          'turns': <Map<String, String>>[],
          'meeting': {'when': 'Tuesday 3pm', 'name': 'Jack', 'contact': '', 'notes': ''},
        },
      ];
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Meeting booked'), findsOneWidget);
    await unmount(tester);
  });
}
