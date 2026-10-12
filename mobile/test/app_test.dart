import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/app.dart';
import 'package:orvia/app_dependencies.dart';
import 'package:orvia/data/models/models.dart';
import 'package:orvia/platform/appearance.dart';
import 'package:orvia/screens/home/home_screen.dart';
import 'package:orvia/telephony/telephony_gateway.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_api.dart';
import 'support/fake_carrier.dart';
import 'support/fakes.dart';

/// Drives the real app shell with fakes. The first version of the app crashed
/// on every pushed screen because the providers sat below the Navigator; this
/// is what would have caught it.
Future<({FakeOrviaApi api, FakeTelephonyGateway tel, RecordingNotifier notifier, FakePermissionGateway perms})> pumpApp(WidgetTester tester) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final tel = FakeTelephonyGateway();
  final notifier = RecordingNotifier();
  final perms = FakePermissionGateway(tel);
  final auth = FakeAuthRepository(users: {'owner@smile.test': 'correct horse'})..profileValue = makeProfile();
  final api = FakeOrviaApi(overview: makeOverview(callsToday: 2))
    ..allCalls = [makeCall('c1', summary: 'Booked a cleaning.', outcome: CallOutcome.appointmentBooked)]
    ..allAppointments = [makeAppointment('a1', start: DateTime.now().add(const Duration(days: 1)))]
    ..followUpList = [makeFollowUp('f1')]
    ..leadList = [makeLead('l1')];

  final deps = AppDependencies(
    auth: auth,
    api: api,
    telephony: tel,
    permissions: perms,
    notifier: notifier,
    deviceAuth: FakeDeviceAuth()..supported = false,
    prefs: prefs,
    appVersion: '0.0.0-test',
  );
  await tester.pumpWidget(OrviaApp(deps: deps));
  await tester.pumpAndSettle();
  return (api: api, tel: tel, notifier: notifier, perms: perms);
}

Future<void> signIn(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextField, 'Email'), 'owner@smile.test');
  await tester.enterText(find.widgetWithText(TextField, 'Password'), 'correct horse');
  await tester.tap(find.text('Sign in').last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('sign in lands on Home with the business and the connect prompt', (tester) async {
    await pumpApp(tester);
    expect(find.text('Sign in to Orvia'), findsOneWidget);
    await signIn(tester);
    expect(find.text('Smile Dental'), findsOneWidget);
    expect(find.text('Connect your phone'), findsWidgets);
  });

  testWidgets('the first sign-in asks to show notifications; Settings shows a refusal', (tester) async {
    final h = await pumpApp(tester);
    h.perms.grantNotifications = false;
    await signIn(tester);
    expect(h.perms.notificationRequests, 1);

    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    final row = find.text('Tell me when a call is handled');
    await tester.scrollUntilVisible(row, 200, scrollable: find.byType(Scrollable).first);
    // Bring it to the top of the list, clear of the navigation bar.
    await tester.ensureVisible(row);
    await tester.pumpAndSettle();
    expect(find.text('Blocked in your phone settings. Turn on to allow.'), findsOneWidget);
    final toggle = find.widgetWithText(SwitchListTile, 'Tell me when a call is handled');
    expect(tester.widget<SwitchListTile>(toggle).value, isFalse);

    // Android has stopped prompting: turning it on opens the system page.
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(h.perms.settingsOpened, 1);
  });

  testWidgets('every pushed screen can reach the signed-in providers', (tester) async {
    await pumpApp(tester);
    await signIn(tester);

    // Phone connection (pushed from the home card).
    await tester.tap(find.widgetWithText(FilledButton, 'Connect your phone'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Phone connection'), findsOneWidget);
    expect(find.text('Your Orvia number'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Call detail (pushed from the Calls tab).
    await tester.tap(find.text('Calls').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Booked a cleaning.').first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Conversation'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Greeting and numbers (pushed from Settings).
    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Greeting and numbers'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Save changes'), findsOneWidget);
  });

  testWidgets('turning forwarding on from the phone screen sends the codes', (tester) async {
    final h = await pumpApp(tester);
    await signIn(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Connect your phone'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Turn on forwarding'), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Turn on forwarding'));
    await tester.pumpAndSettle(const Duration(seconds: 3));

    expect(h.tel.sent.map((s) => s.code).first, '**61*+918040001000**20#');
    expect(find.text('What your carrier said'), findsOneWidget);
    expect(h.api.registered, isNotEmpty, reason: 'the install is reported to the server');
  });

  testWidgets('when the network refuses app codes, the Phone app card finishes the job', (tester) async {
    final h = await pumpApp(tester);
    h.tel.interceptor = (_) => const UssdResult(UssdStatus.failed, failureCode: -1);
    await signIn(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Connect your phone'));
    await tester.pumpAndSettle();

    final list = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('Turn on forwarding'), 300, scrollable: list);
    await tester.tap(find.text('Turn on forwarding'));
    await tester.pumpAndSettle();

    expect(find.text('Finish in your Phone app'), findsOneWidget);
    expect(find.text('What your carrier said'), findsNothing, reason: 'no confusing list of failures');
    expect(h.tel.sent, hasLength(1));

    for (var n = 1; n <= 3; n++) {
      final send = find.text('Send code $n of 3');
      await tester.scrollUntilVisible(send, 200, scrollable: list);
      await tester.ensureVisible(send);
      await tester.pumpAndSettle();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(find.text('Did your phone say it worked?'), findsOneWidget);
      await tester.ensureVisible(find.text('Yes, it worked'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Yes, it worked'));
      await tester.pumpAndSettle();
    }

    expect(h.tel.phoneAppSent.map((s) => s.code), ['**61*+918040001000**20#', '**67*+918040001000#', '**62*+918040001000#']);
    expect(find.text('Finish in your Phone app'), findsNothing);
    await tester.scrollUntilVisible(find.text('On, waiting for a test call'), -300, scrollable: list);
    expect(find.text('On, waiting for a test call'), findsOneWidget);
  });

  testWidgets('tapping a call notification opens that call', (tester) async {
    final h = await pumpApp(tester);
    await signIn(tester);
    // Even from a pushed screen, the call opens on top of the tabs.
    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Greeting and numbers'));
    await tester.pumpAndSettle();

    h.notifier.taps.add('c1');
    await tester.pumpAndSettle();
    expect(find.text('Booked a cleaning.'), findsOneWidget);
    expect(find.text('Save changes'), findsNothing);

    await tester.pageBack();
    await tester.pumpAndSettle();
    h.notifier.taps.add('gone');
    await tester.pumpAndSettle();
    expect(find.text('Call not found'), findsOneWidget);
  });

  testWidgets('signing out returns to the sign-in screen', (tester) async {
    final h = await pumpApp(tester);
    await signIn(tester);
    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Sign out'), 300, scrollable: find.byType(Scrollable).first);
    // Scroll to the end so the row is clear of the navigation bar.
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -600));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out').last);
    await tester.pumpAndSettle();
    expect(find.text('Sign in to Orvia'), findsOneWidget);
    expect(h.notifier.cleared, 1, reason: 'the next person on the phone sees no old callers');
  });

  testWidgets('editing only the greeting saves even when a saved number is in a legacy format', (tester) async {
    final h = await pumpApp(tester);
    h.api.settingsValue = const BusinessSettings(greeting: 'Hi there', transferNumber: '98765 43210');
    await signIn(tester);
    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Greeting and numbers'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Greeting'), 'Hi there, welcome!');
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    expect(find.textContaining('country code'), findsNothing);
    expect(h.api.patches.single, {'greeting': 'Hi there, welcome!'});
  });

  testWidgets('a lead can be called or closed from its menu', (tester) async {
    final h = await pumpApp(tester);
    await signIn(tester);
    await tester.tap(find.text('Follow up').last);
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Leads'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Lead actions'));
    await tester.pumpAndSettle();
    expect(find.text('Call'), findsOneWidget);
    await tester.tap(find.text('Mark as closed'));
    await tester.pumpAndSettle();
    expect(h.api.leadList.single.status, LeadStatus.closed);
    expect(find.text('Ravi'), findsNothing, reason: 'closed leads leave the list');
  });

  testWidgets('the app opens light and the theme can be changed in Settings', (tester) async {
    await pumpApp(tester);
    Brightness now() => Theme.of(tester.element(find.byType(Scaffold).first)).brightness;
    expect(now(), Brightness.light, reason: 'light by default, like the dashboard');

    await signIn(tester);
    await tester.tap(find.text('Settings').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text(Appearance.dark.label));
    // The reveal needs a picture of the screen; a widget test cannot take
    // one, so after a short wait the change falls back to a plain blend.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(now(), Brightness.dark);
    expect(find.byType(RawImage), findsNothing, reason: 'no picture is left on screen');

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('appearance.v1'), 'dark', reason: 'kept for the next launch');
  });

  test('greeting uses the first name, skipping titles', () {
    expect(HomeScreen.firstName('Dr. Rao'), 'Rao');
    expect(HomeScreen.firstName('Asha Rao'), 'Asha');
    expect(HomeScreen.firstName('Mrs Iyer'), 'Iyer');
    expect(HomeScreen.firstName('Dr.'), 'Dr.');
    expect(HomeScreen.firstName(null), '');
    expect(HomeScreen.firstName('   '), '');
  });
}
