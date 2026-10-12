import 'dart:async';
import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/data/models/models.dart';
import 'package:orvia/data/orvia_api.dart';
import 'package:orvia/platform/app_lock.dart';
import 'package:orvia/platform/call_alerts.dart';
import 'package:orvia/platform/device_registrar.dart';
import 'package:orvia/platform/live_sync.dart';
import 'package:orvia/platform/notifier.dart';
import 'package:orvia/telephony/forwarding_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fake_api.dart';
import '../support/fake_carrier.dart';
import '../support/fakes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('CallAlerts', () {
    late FakeOrviaApi api;
    late RecordingNotifier notifier;
    late SharedPreferences prefs;
    late CallAlerts alerts;
    final now = DateTime(2026, 10, 8, 12);

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      api = FakeOrviaApi();
      notifier = RecordingNotifier();
      alerts = CallAlerts(api: api, notifier: notifier, prefs: prefs, userId: 'u1', now: () => now);
    });

    test('asks for the notification permission once, and only while alerts are on', () async {
      final perms = FakePermissionGateway(FakeTelephonyGateway())..grantNotifications = false;
      expect(await alerts.askPermissionOnce(perms), isFalse);
      expect(await alerts.askPermissionOnce(perms), isFalse);
      expect(perms.notificationRequests, 1, reason: 'a refusal is not asked again on every launch');

      final other = CallAlerts(api: api, notifier: notifier, prefs: prefs, userId: 'u2', now: () => now);
      await other.setEnabled(false);
      expect(await other.askPermissionOnce(perms), isFalse);
      expect(perms.notificationRequests, 1, reason: 'an owner who turned alerts off is not asked');

      perms.notifGranted = true;
      expect(await alerts.askPermissionOnce(perms), isTrue);
      expect(perms.notificationRequests, 1);
    });

    test('the first run records the backlog without announcing it', () async {
      api.allCalls = [makeCall('old1', at: now.subtract(const Duration(hours: 2)))];
      expect(await alerts.check(), 0);
      expect(notifier.shown, isEmpty);
      // Still silent for the same calls afterwards.
      expect(await alerts.check(), 0);
    });

    test('announces each finished call exactly once', () async {
      await alerts.check(); // first run
      api.allCalls = [makeCall('c1', at: now.subtract(const Duration(minutes: 3)))];
      expect(await alerts.check(), 1);
      expect(await alerts.check(), 0);
      api.allCalls = [...api.allCalls, makeCall('c2', at: now.subtract(const Duration(minutes: 1)))];
      expect(await alerts.check(), 1);
      expect(notifier.shown.map((c) => c.id), ['c1', 'c2']);
    });

    test('a call in progress is announced when it finishes, not before', () async {
      await alerts.check();
      api.allCalls = [makeCall('live', status: CallStatus.inProgress, at: now.subtract(const Duration(minutes: 2)))];
      expect(await alerts.check(), 0);
      api.allCalls = [makeCall('live', at: now.subtract(const Duration(minutes: 2)))];
      expect(await alerts.check(), 1);
      expect(await alerts.check(), 0);
    });

    test('browser test calls are never announced', () async {
      await alerts.check();
      api.allCalls = [makeCall('t', test: true, at: now.subtract(const Duration(minutes: 1)))];
      expect(await alerts.check(), 0);
    });

    test('turning notifications off silences them but still remembers calls', () async {
      await alerts.check();
      await alerts.setEnabled(false);
      api.allCalls = [makeCall('c1', at: now.subtract(const Duration(minutes: 1)))];
      expect(await alerts.check(), 0);
      await alerts.setEnabled(true);
      expect(await alerts.check(), 0, reason: 'c1 was already consumed while off');
    });

    test('a failing check changes nothing and does not throw', () async {
      await alerts.check();
      api.failNext = Exception('boom');
      api.allCalls = [makeCall('c1', at: now.subtract(const Duration(minutes: 1)))];
      expect(await alerts.check(), 0);
      expect(await alerts.check(), 1, reason: 'the call is picked up on the next successful check');
    });

    test('state is per user', () async {
      await alerts.check();
      final other = CallAlerts(api: api, notifier: notifier, prefs: prefs, userId: 'u2', now: () => now);
      api.allCalls = [makeCall('c1', at: now.subtract(const Duration(minutes: 1)))];
      expect(await other.check(), 0, reason: 'u2 has its own first run');
      expect(await alerts.check(), 1);
    });
  });

  group('notification payload', () {
    test('only a call id in UUID form is accepted', () {
      expect(callIdFromPayload('call:0F8FAD5B-D9CB-469F-A165-70867728950E'), '0f8fad5b-d9cb-469f-a165-70867728950e');
      expect(callIdFromPayload('0f8fad5b-d9cb-469f-a165-70867728950e'), isNull);
      expect(callIdFromPayload('call:../../etc'), isNull);
      expect(callIdFromPayload("call:1' or '1'='1"), isNull);
      expect(callIdFromPayload('call:'), isNull);
      expect(callIdFromPayload(null), isNull);
    });
  });

  group('CallAlert text', () {
    final now = DateTime(2026, 10, 8, 12);

    test('a booked call says so', () {
      final a = CallAlert.from(makeCall('c', outcome: CallOutcome.appointmentBooked), now: now);
      expect(a.title, contains('+91 98765 43210'));
      expect(a.body, 'Booked an appointment');
    });

    test('a missed call and a failed call are distinct', () {
      expect(CallAlert.from(makeCall('c', status: CallStatus.missed), now: now).title, 'Missed call');
      expect(CallAlert.from(makeCall('c', status: CallStatus.failed), now: now).title, 'A call needs a look');
    });

    test('an info call falls back to the summary, then to a generic line', () {
      expect(CallAlert.from(makeCall('c', summary: 'Asked about hours.'), now: now).body, 'Asked about hours.');
      expect(CallAlert.from(makeCall('c', summary: null), now: now).body, 'Orvia answered');
    });

    test('a hidden number does not print the word null', () {
      final a = CallAlert.from(makeCall('c', phone: null), now: now);
      expect(a.title, contains('Unknown caller'));
    });
  });

  group('AppLockController', () {
    late SharedPreferences prefs;
    late FakeDeviceAuth auth;
    late AppLockController lock;
    late DateTime clock;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      auth = FakeDeviceAuth();
      clock = DateTime(2026, 10, 8, 9);
      lock = AppLockController(prefs: prefs, auth: auth, now: () => clock);
    });
    tearDown(() => lock.dispose());

    test('on by default when the phone has a screen lock, and starts locked', () async {
      await lock.init();
      expect(lock.enabled, isTrue);
      expect(lock.locked, isTrue);
    });

    test('stays off on a phone with no screen lock', () async {
      auth.supported = false;
      await lock.init();
      expect(lock.enabled, isFalse);
      expect(lock.locked, isFalse);
      expect(await lock.setEnabled(true), isFalse);
    });

    test('unlock needs the phone check and a failure keeps it locked', () async {
      await lock.init();
      auth.succeeds = false;
      expect(await lock.unlock(), isFalse);
      expect(lock.locked, isTrue);
      auth.succeeds = true;
      expect(await lock.unlock(), isTrue);
      expect(lock.locked, isFalse);
    });

    test('relocks only after the chosen time in the background', () async {
      await lock.init();
      await lock.unlock();
      await lock.setTimeout(LockTimeout.oneMinute);

      lock.didChangeAppLifecycleState(AppLifecycleState.paused);
      clock = clock.add(const Duration(seconds: 20));
      lock.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(lock.locked, isFalse);

      lock.didChangeAppLifecycleState(AppLifecycleState.paused);
      clock = clock.add(const Duration(minutes: 2));
      lock.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(lock.locked, isTrue);
    });

    test('"right away" locks on every return', () async {
      await lock.init();
      await lock.unlock();
      await lock.setTimeout(LockTimeout.immediately);
      lock.didChangeAppLifecycleState(AppLifecycleState.paused);
      lock.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(lock.locked, isTrue);
    });

    test('a system dialog does not lock the owner out', () async {
      await lock.init();
      await lock.unlock();
      await lock.setTimeout(LockTimeout.immediately);
      await lock.whileAway(() async {
        lock.didChangeAppLifecycleState(AppLifecycleState.paused);
        clock = clock.add(const Duration(seconds: 5));
        lock.didChangeAppLifecycleState(AppLifecycleState.resumed);
      });
      expect(lock.locked, isFalse);
    });

    test('the lock prompt itself backgrounding the app does not loop', () async {
      await lock.init();
      auth.hold = Completer<bool>();
      final pending = lock.unlock();
      lock.didChangeAppLifecycleState(AppLifecycleState.paused);
      lock.didChangeAppLifecycleState(AppLifecycleState.resumed);
      auth.hold!.complete(true);
      expect(await pending, isTrue);
      expect(lock.locked, isFalse);
    });

    test('turning the lock off needs a successful check', () async {
      await lock.init();
      await lock.unlock();
      auth.succeeds = false;
      expect(await lock.setEnabled(false), isFalse);
      expect(lock.enabled, isTrue);
      auth.succeeds = true;
      expect(await lock.setEnabled(false), isTrue);
      expect(lock.enabled, isFalse);
      expect(prefs.getBool('applock.enabled'), isFalse);
    });

    test('remembers the choice across launches', () async {
      await lock.init();
      await lock.unlock();
      await lock.setEnabled(false);
      await lock.setTimeout(LockTimeout.fiveMinutes);
      final again = AppLockController(prefs: prefs, auth: auth, now: () => clock);
      await again.init();
      expect(again.enabled, isFalse);
      expect(again.timeout, LockTimeout.fiveMinutes);
      again.dispose();
    });
  });

  group('LiveSync', () {
    test('turns a burst of realtime events into one refresh', () async {
      final api = FakeOrviaApi();
      final sync = LiveSync(api, pollEvery: Duration.zero, debounce: const Duration(milliseconds: 30))..start();
      final got = <ChangedTable>[];
      final sub = sync.events.listen(got.add);
      await pumpEventQueue();

      for (var i = 0; i < 5; i++) {
        api.emit(ChangedTable.calls);
      }
      api.emit(ChangedTable.appointments);
      await Future<void>.delayed(const Duration(milliseconds: 120));

      expect(got.where((t) => t == ChangedTable.calls), hasLength(1));
      expect(got.where((t) => t == ChangedTable.appointments), hasLength(1));
      await sub.cancel();
      await sync.dispose();
    });

    test('polls on a timer so a dead socket cannot leave data stale', () async {
      final api = FakeOrviaApi();
      final sync = LiveSync(api, pollEvery: const Duration(milliseconds: 40))..start();
      final got = <ChangedTable>[];
      final sub = sync.events.listen(got.add);
      await Future<void>.delayed(const Duration(milliseconds: 130));
      expect(got.toSet(), ChangedTable.values.toSet());
      await sub.cancel();
      await sync.dispose();
    });

    test('refreshes everything when the app returns to the foreground', () async {
      final api = FakeOrviaApi();
      final sync = LiveSync(api, pollEvery: Duration.zero)..start();
      final got = <ChangedTable>[];
      final sub = sync.events.listen(got.add);
      sync.didChangeAppLifecycleState(AppLifecycleState.paused);
      sync.didChangeAppLifecycleState(AppLifecycleState.resumed);
      await pumpEventQueue();
      expect(got.toSet(), ChangedTable.values.toSet());
      await sub.cancel();
      await sync.dispose();
    });
  });

  group('Installation and DeviceRegistrar', () {
    test('the install id is created once, valid, and stable', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final a = await Installation.id(prefs, random: Random(1));
      final b = await Installation.id(prefs, random: Random(2));
      expect(a, b);
      expect(RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(a), isTrue);
    });

    test('a corrupt stored id is replaced', () async {
      SharedPreferences.setMockInitialValues({'installation.id.v1': 'bad id!'});
      final prefs = await SharedPreferences.getInstance();
      final id = await Installation.id(prefs);
      expect(RegExp(r'^[A-Za-z0-9_-]{16,64}$').hasMatch(id), isTrue);
    });

    test('sync sends the forwarding summary and never a phone number', () async {
      final api = FakeOrviaApi();
      final reg = DeviceRegistrar(api: api, installationId: 'abcdefghijklmnop1234', appVersion: '0.1.0', pushToken: () async => 'tok');
      await reg.sync(const ForwardingState(phase: ForwardingPhase.activeUnverified, destination: '+918040001000'));
      final sent = api.registered.single;
      expect(sent['pushToken'], 'tok');
      expect((sent['forwarding']! as Map<String, Object?>)['phase'], 'activeUnverified');
      expect(sent.toString(), isNot(contains('8040001000')));
    });

    test('a failing registration is swallowed', () async {
      final api = FakeOrviaApi()..failNext = Exception('down');
      final reg = DeviceRegistrar(api: api, installationId: 'abcdefghijklmnop1234', appVersion: '0.1.0');
      await reg.sync(const ForwardingState());
      await reg.unregister();
    });
  });
}
