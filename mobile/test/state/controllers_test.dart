import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/data/models/models.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show PostgrestException;
import 'package:orvia/data/orvia_api.dart';
import 'package:orvia/state/appointments_controller.dart';
import 'package:orvia/state/calls_controller.dart';
import 'package:orvia/state/followups_controller.dart';
import 'package:orvia/state/home_controller.dart';
import 'package:orvia/state/phone_setup_controller.dart';
import 'package:orvia/state/session_controller.dart';
import 'package:orvia/state/settings_controller.dart';
import 'package:orvia/telephony/forwarding.dart';
import 'package:orvia/telephony/forwarding_service.dart';
import 'package:orvia/telephony/forwarding_state.dart';
import 'package:orvia/telephony/telephony_gateway.dart';

import '../support/fake_api.dart';
import '../support/fake_carrier.dart';
import '../support/fakes.dart';

void main() {
  group('SessionController', () {
    late FakeAuthRepository auth;
    late SessionController session;
    var wiped = 0;

    setUp(() {
      wiped = 0;
      auth = FakeAuthRepository(users: {'owner@smile.test': 'correct horse'})..profileValue = makeProfile();
      session = SessionController(auth, onSignedOut: () async => wiped++);
    });
    tearDown(() async {
      session.dispose();
      await auth.close();
    });

    test('starts signed out when there is no session', () async {
      await session.start();
      await pumpEventQueue();
      expect(session.stage, SessionStage.signedOut);
    });

    test('signing in reaches ready', () async {
      await session.start();
      await pumpEventQueue();
      expect(await session.signIn('owner@smile.test', 'correct horse'), isTrue);
      await pumpEventQueue();
      expect(session.stage, SessionStage.ready);
      expect(session.profile?.fullName, 'Dr. Rao');
    });

    test('a wrong password shows a friendly message and stays signed out', () async {
      await session.start();
      await pumpEventQueue();
      expect(await session.signIn('owner@smile.test', 'nope'), isFalse);
      expect(session.error, isNotNull);
      expect(session.error, isNot(contains('bad credentials')));
      expect(session.stage, SessionStage.signedOut);
    });

    test('empty or malformed input never reaches the server', () async {
      await session.start();
      await pumpEventQueue();
      expect(await session.signIn('not-an-email', 'x'), isFalse);
      expect(await session.signIn('owner@smile.test', ''), isFalse);
    });

    test('a temporary password forces a change before anything else', () async {
      auth.profileValue = makeProfile(mustChange: true);
      await session.start();
      await pumpEventQueue();
      await session.signIn('owner@smile.test', 'correct horse');
      await pumpEventQueue();
      expect(session.stage, SessionStage.mustChangePassword);

      expect(await session.changePassword('short'), isFalse);
      expect(session.stage, SessionStage.mustChangePassword);

      expect(await session.changePassword('a fresh long passphrase'), isTrue);
      expect(auth.passwordChanges, ['a fresh long passphrase']);
      expect(auth.mustChangeCleared, isTrue);
      expect(session.stage, SessionStage.ready);
    });

    test('an account without a business is told so, not shown an empty app', () async {
      auth.profileValue = null;
      await session.start();
      await pumpEventQueue();
      await session.signIn('owner@smile.test', 'correct horse');
      await pumpEventQueue();
      expect(session.stage, SessionStage.noBusiness);
    });

    test('a profile that fails to load can be retried', () async {
      auth.profileError = const SocketException('offline');
      await session.start();
      await pumpEventQueue();
      await session.signIn('owner@smile.test', 'correct horse');
      await pumpEventQueue();
      expect(session.stage, SessionStage.noBusiness);
      expect(session.error, contains('connection'));

      auth.profileError = null;
      await session.retryProfile();
      expect(session.stage, SessionStage.ready);
    });

    test('a rejected saved session sends the owner back to sign in', () async {
      auth.profileError = const PostgrestException(message: 'permission denied for table users', code: '42501');
      await session.start();
      await pumpEventQueue();
      await session.signIn('owner@smile.test', 'correct horse');
      await pumpEventQueue();
      expect(session.stage, SessionStage.signedOut);
      expect(session.profile, isNull);
    });

    test('signing out wipes local state', () async {
      await session.start();
      await pumpEventQueue();
      await session.signIn('owner@smile.test', 'correct horse');
      await pumpEventQueue();
      await session.signOut();
      await pumpEventQueue();
      expect(session.stage, SessionStage.signedOut);
      expect(session.profile, isNull);
      expect(wiped, 1);
    });

    test('password reset reports success without confirming the address exists', () async {
      await session.start();
      await pumpEventQueue();
      expect(await session.sendReset('nobody@nowhere.test'), isTrue);
      expect(auth.resets, ['nobody@nowhere.test']);
      expect(await session.sendReset('garbage'), isFalse);
    });

    test('password rules', () {
      String? p(String pw, {String? email}) => SessionController.passwordProblem(pw, email: email);
      expect(p('short'), isNotNull);
      expect(p('        '), isNotNull);
      expect(p('aaaaaaaaaa'), isNotNull);
      expect(p('password123'), isNotNull);
      expect(p('owner-smile-2026', email: 'owner@smile.test'), isNotNull);
      expect(p('x' * 80), isNotNull);
      expect(p('a fresh long passphrase', email: 'owner@smile.test'), isNull);
    });
  });

  group('HomeController', () {
    test('loads overview, recent calls and events together', () async {
      final api = FakeOrviaApi(overview: makeOverview(callsToday: 3))
        ..allCalls = [makeCall('a'), makeCall('b')]
        ..eventList = [OpEvent(id: 'e1', type: 'ai_failure', severity: Severity.warning, createdAt: DateTime.now())];
      final home = HomeController(api);
      await home.refresh();
      expect(home.overview?.callsToday, 3);
      expect(home.recentCalls, hasLength(2));
      expect(home.events, hasLength(1));
      expect(home.error, isNull);
      expect(home.loading, isFalse);
    });

    test('keeps the last good data when a refresh fails', () async {
      final api = FakeOrviaApi()..allCalls = [makeCall('a')];
      final home = HomeController(api);
      await home.refresh();
      api.failNext = const SocketException('down');
      await home.refresh(silent: true);
      expect(home.hasData, isTrue);
      expect(home.recentCalls, hasLength(1));
      expect(home.error, contains('connection'));
    });

    test('a stale response cannot overwrite a newer one', () async {
      final api = FakeOrviaApi(overview: makeOverview(callsToday: 1))..latency = const Duration(milliseconds: 50);
      final home = HomeController(api);
      final first = home.refresh();
      api.overviewValue = makeOverview(callsToday: 2);
      api.latency = Duration.zero;
      await home.refresh();
      await first;
      expect(home.overview?.callsToday, 2);
    });

    test('resolving an event removes it and rolls back on failure', () async {
      final ev = OpEvent(id: 'e1', type: 'ai_failure', severity: Severity.warning, createdAt: DateTime.now());
      final api = FakeOrviaApi()..eventList = [ev];
      final home = HomeController(api);
      await home.refresh();

      api.failNext = const SocketException('x');
      await home.resolveEvent(ev);
      expect(home.events, hasLength(1));
      expect(home.error, isNotNull);

      await home.resolveEvent(ev);
      expect(home.events, isEmpty);
    });
  });

  group('CallsController', () {
    List<CallRecord> many(int n) => [
          for (var i = 0; i < n; i++)
            makeCall('c$i', at: DateTime(2026, 10, 8, 12).subtract(Duration(minutes: i * 10))),
        ];

    test('pages with a keyset cursor and never repeats a call', () async {
      final api = FakeOrviaApi()..allCalls = many(45);
      final c = CallsController(api, pageSize: 20);
      await c.refresh();
      expect(c.items, hasLength(20));
      expect(c.hasMore, isTrue);
      await c.loadMore();
      await c.loadMore();
      expect(c.items, hasLength(45));
      expect(c.items.map((e) => e.id).toSet(), hasLength(45));
      expect(c.hasMore, isFalse);
      await c.loadMore(); // no-op
      expect(c.items, hasLength(45));
    });

    test('changing the filter replaces the list', () async {
      final api = FakeOrviaApi()
        ..allCalls = [
          makeCall('ok'),
          makeCall('miss', status: CallStatus.missed, outcome: CallOutcome.missed),
        ];
      final c = CallsController(api);
      await c.refresh();
      expect(c.items, hasLength(2));
      await c.setFilter(CallFilter.missed);
      expect(c.items.map((e) => e.id), ['miss']);
    });

    test('a slow answer for an old filter is discarded', () async {
      final api = FakeOrviaApi()
        ..allCalls = [makeCall('ok'), makeCall('miss', status: CallStatus.missed, outcome: CallOutcome.missed)]
        ..latency = const Duration(milliseconds: 40);
      final c = CallsController(api);
      final slow = c.refresh(); // filter: all
      api.latency = Duration.zero;
      await c.setFilter(CallFilter.missed);
      await slow;
      expect(c.filter, CallFilter.missed);
      expect(c.items.map((e) => e.id), ['miss']);
    });

    test('an error is friendly and the list survives', () async {
      final api = FakeOrviaApi()..allCalls = many(3);
      final c = CallsController(api);
      await c.refresh();
      api.failNext = const SocketException('down');
      await c.refresh(silent: true);
      expect(c.items, hasLength(3));
      expect(c.error, isNotNull);
    });
  });

  group('AppointmentsController', () {
    final tomorrow = DateTime.now().add(const Duration(days: 1));

    test('marks an appointment done and keeps it done', () async {
      final api = FakeOrviaApi()..allAppointments = [makeAppointment('a1', start: tomorrow)];
      final c = AppointmentsController(api);
      await c.refresh();
      await c.setStatus(c.items.single, AppointmentStatus.completed);
      expect(c.items.single.status, AppointmentStatus.completed);
      expect(api.allAppointments.single.status, AppointmentStatus.completed);
      expect(c.actionError, isNull);
    });

    test('rolls the card back and says why when the server refuses', () async {
      final api = FakeOrviaApi()..allAppointments = [makeAppointment('a1', start: tomorrow)];
      final c = AppointmentsController(api);
      await c.refresh();
      api.failNext = const SocketException('down');
      await c.setStatus(c.items.single, AppointmentStatus.cancelled);
      expect(c.items.single.status, AppointmentStatus.confirmed);
      expect(c.actionError, contains('connection'));
    });

    test('switching to past shows only past appointments', () async {
      final api = FakeOrviaApi()
        ..allAppointments = [
          makeAppointment('future', start: tomorrow),
          makeAppointment('old', start: DateTime.now().subtract(const Duration(days: 2))),
        ];
      final c = AppointmentsController(api);
      await c.refresh();
      expect(c.items.map((a) => a.id), ['future']);
      await c.setRange(AppointmentRange.past);
      expect(c.items.map((a) => a.id), ['old']);
    });
  });

  group('FollowUpsController', () {
    test('counts callbacks and new leads for the badge', () async {
      final api = FakeOrviaApi()
        ..followUpList = [makeFollowUp('f1'), makeFollowUp('f2')]
        ..leadList = [makeLead('l1'), makeLead('l2', status: LeadStatus.contacted)];
      final c = FollowUpsController(api);
      await c.refresh();
      expect(c.openCount, 3);
    });

    test('handling a callback removes it, and restores it on failure', () async {
      final api = FakeOrviaApi()..followUpList = [makeFollowUp('f1')];
      final c = FollowUpsController(api);
      await c.refresh();
      api.failNext = const SocketException('x');
      await c.markHandled(c.callbacks.single);
      expect(c.callbacks, hasLength(1));
      expect(c.actionError, isNotNull);
      await c.markHandled(c.callbacks.single);
      expect(c.callbacks, isEmpty);
    });

    test('contacted keeps a lead in the list, booked removes it', () async {
      final api = FakeOrviaApi()..leadList = [makeLead('l1'), makeLead('l2')];
      final c = FollowUpsController(api);
      await c.refresh();
      await c.setLeadStatus(c.leads.first, LeadStatus.contacted);
      expect(c.leads.firstWhere((l) => l.id == 'l1').status, LeadStatus.contacted);
      await c.setLeadStatus(c.leads.last, LeadStatus.booked);
      expect(c.leads.map((l) => l.id), ['l1']);
    });
  });

  group('SettingsController', () {
    test('sends only what changed and never clears an untouched legacy value', () async {
      final api = FakeOrviaApi()
        ..settingsValue = const BusinessSettings(greeting: 'Hi', transferNumber: '98765 43210', notificationPhone: '+919800000009');
      final c = SettingsController(api);
      await c.load();

      expect(await c.save(greeting: 'Hello there', transferNumber: '98765 43210', notificationPhone: '+919800000009'), isTrue);
      expect(api.patches.single, {'greeting': 'Hello there'});
      expect(c.settings?.transferNumber, '98765 43210');
    });

    test('normalizes a changed phone and clears one that was emptied', () async {
      final api = FakeOrviaApi()..settingsValue = const BusinessSettings(transferNumber: '+919800000001');
      final c = SettingsController(api);
      await c.load();
      await c.save(greeting: '', transferNumber: '', notificationPhone: '+91 98000 00002');
      expect(api.patches.single, {'transfer_number': null, 'notification_phone': '+919800000002'});
    });

    test('rejects bad input without calling the server', () async {
      final api = FakeOrviaApi();
      final c = SettingsController(api);
      await c.load();
      expect(await c.save(greeting: '', transferNumber: '12345', notificationPhone: ''), isFalse);
      expect(c.error, contains('country code'));
      expect(await c.save(greeting: 'x' * 501, transferNumber: '', notificationPhone: ''), isFalse);
      expect(api.patches, isEmpty);
    });

    test('nothing changed is a no-op', () async {
      final api = FakeOrviaApi();
      final c = SettingsController(api);
      await c.load();
      expect(await c.save(greeting: '', transferNumber: '', notificationPhone: ''), isTrue);
      expect(api.patches, isEmpty);
    });
  });

  group('PhoneSetupController', () {
    late FakeTelephonyGateway gateway;
    late FakePermissionGateway perms;
    late FakeOrviaApi api;
    late MemoryForwardingStore store;
    late PhoneSetupController c;
    late DateTime clock;
    final announced = <ForwardingState>[];

    setUp(() {
      announced.clear();
      gateway = FakeTelephonyGateway();
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: false);
      perms = FakePermissionGateway(gateway);
      api = FakeOrviaApi();
      store = MemoryForwardingStore();
      clock = DateTime.utc(2026, 10, 8, 9);
      c = PhoneSetupController(
        service: ForwardingService(gateway: gateway, store: store, now: () => clock, stepGap: Duration.zero),
        gateway: gateway,
        permissions: perms,
        api: api,
        onStateChanged: announced.add,
      );
    });

    test('on a network that refuses app codes, walks the owner through the Phone app', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      gateway.sims = const [SimInfo(subscriptionId: 7, slotIndex: 0, carrierName: 'Jio', isDefaultVoice: true)];
      gateway.interceptor = (_) => const UssdResult(UssdStatus.failed, failureCode: -1);
      await c.load(aiNumber: '+918040001000');

      await c.turnOn();
      final task = c.task!;
      expect(task.purpose, StepPurpose.activate);
      expect(task.steps, hasLength(3));
      expect(c.state.isOn, isFalse);

      for (var i = 0; i < 3; i++) {
        expect(await c.sendTaskStep(), isTrue);
        expect(c.task!.sent, isTrue);
        await c.confirmTaskStep(worked: true);
      }
      expect(gateway.phoneAppSent.map((s) => s.code), ['**61*+918040001000**20#', '**67*+918040001000#', '**62*+918040001000#']);
      expect(gateway.phoneAppSent.map((s) => s.subscriptionId).toSet(), {7}, reason: 'sent on the chosen SIM');
      expect(c.task, isNull);
      expect(c.state.phase, ForwardingPhase.activeUnverified);
      expect(c.state.route, ForwardingRoute.phoneApp);
      expect(announced.last.isOn, isTrue);

      // Pausing goes the same way, with one code.
      await c.pause();
      expect(c.task!.steps.map((s) => s.code), ['##002#']);
      await c.sendTaskStep();
      await c.confirmTaskStep(worked: true);
      expect(c.state.phase, ForwardingPhase.paused);
    });

    test('a step the carrier refused can be sent again, and nothing is recorded meanwhile', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      gateway.interceptor = (_) => const UssdResult(UssdStatus.failed, failureCode: -1);
      await c.load(aiNumber: '+918040001000');
      await c.turnOn();

      await c.confirmTaskStep(worked: true);
      expect(c.task!.index, 0, reason: 'nothing to confirm before sending');

      await c.sendTaskStep();
      await c.confirmTaskStep(worked: false);
      expect([c.task!.failed, c.task!.sent, c.task!.index], [true, false, 0]);
      expect(c.state.isOn, isFalse);

      c.cancelTask();
      expect(c.task, isNull);
      expect(c.state.isOn, isFalse);
    });

    test('rejects a missing or malformed Orvia number with a clear reason', () async {
      await c.load(aiNumber: null);
      expect(c.target, isNull);
      expect(c.targetProblem, contains('not assigned'));
      await c.load(aiNumber: '080 4000 1000');
      expect(c.targetProblem, contains('international'));
      expect(await c.turnOn(), isNull);
      expect(gateway.sent, isEmpty);
    });

    test('needs permission first; granting it lets the codes go out', () async {
      await c.load(aiNumber: '+91 80 4000 1000');
      expect(c.target, '+918040001000');
      expect(c.needsPermission, isTrue);

      final report = await c.turnOn();
      expect(report?.blocker, SetupBlocker.noPermission);
      expect(c.error, contains('phone access'));
      expect(gateway.sent, isEmpty);

      expect(await c.requestPermission(), isTrue);
      expect(c.needsPermission, isFalse);
      final ok = await c.turnOn();
      expect(ok?.allConfirmed, isTrue);
      expect(c.state.phase, ForwardingPhase.activeUnverified);
      expect(announced.last.phase, ForwardingPhase.activeUnverified);
    });

    test('a permanently denied permission is surfaced so the screen can open settings', () async {
      perms
        ..grantPhone = false
        ..permanentlyDenied = true;
      await c.load(aiNumber: '+918040001000');
      expect(await c.requestPermission(), isFalse);
      expect(c.permissionBlockedForever, isTrue);
    });

    test('picks the default-voice SIM and uses the one the owner chooses', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      gateway.sims = const [
        SimInfo(subscriptionId: 3, slotIndex: 0, carrierName: 'Airtel'),
        SimInfo(subscriptionId: 9, slotIndex: 1, carrierName: 'Jio', isDefaultVoice: true),
      ];
      await c.load(aiNumber: '+918040001000');
      expect(c.selectedSim?.subscriptionId, 9);
      c.selectSim(gateway.sims.first);
      await c.turnOn();
      expect(gateway.sent.every((s) => s.subscriptionId == 3), isTrue);
    });

    test('the full journey: on, test call arrives, verified, pause, resume', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      await c.load(aiNumber: '+918040001000');
      await c.turnOn();
      expect(await c.checkForTestCall(), isFalse);

      api.allCalls = [makeCall('real', at: clock.add(const Duration(minutes: 5)))];
      expect(await c.checkForTestCall(), isTrue);
      expect(c.state.phase, ForwardingPhase.activeVerified);

      await c.pause();
      expect(c.state.phase, ForwardingPhase.paused);
      expect(gateway.carrier.forwarding, isEmpty);

      await c.resume();
      expect(c.state.phase, ForwardingPhase.activeVerified);
      expect(gateway.carrier.forwarding.keys, containsAll(['61', '67', '62']));
    });

    test('a browser test call does not count as proof', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      await c.load(aiNumber: '+918040001000');
      await c.turnOn();
      api.allCalls = [makeCall('web', at: clock.add(const Duration(minutes: 5)), test: true)];
      expect(await c.checkForTestCall(), isFalse);
      expect(c.state.phase, ForwardingPhase.activeUnverified);
    });

    test('a failing carrier surfaces manual steps instead of a dead end', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      gateway.carrier.rejectNext = 99;
      await c.load(aiNumber: '+918040001000');
      final report = await c.turnOn();
      expect(report?.suggestManual, isTrue);
      expect(c.manualSteps.first.code, '**61*+918040001000**20#');
      expect(c.manualOffSteps.first.code, '##61#');
      await c.recordManual(on: true);
      expect(c.state.phase, ForwardingPhase.activeUnverified);
    });

    test('double taps are ignored while busy', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      await c.load(aiNumber: '+918040001000');
      final a = c.turnOn();
      final b = c.turnOn();
      expect(await b, isNull);
      await a;
      expect(gateway.sent.length, 3);
    });

    test('status check corrects the app when forwarding was removed behind its back', () async {
      gateway.caps = gateway.caps.copyWith(callPhoneGranted: true);
      await c.load(aiNumber: '+918040001000');
      await c.turnOn();
      gateway.carrier.forwarding.clear();
      final status = await c.checkStatus();
      expect(status?.diverged, isTrue);
      expect(c.state.phase, ForwardingPhase.paused);
    });
  });

  test('Overview.canAnswer follows account status and minutes', () {
    expect(makeOverview().canAnswer, isTrue);
    expect(makeOverview(seconds: 0).canAnswer, isFalse);
    expect(makeOverview(status: BusinessStatus.inactive).canAnswer, isFalse);
    expect(makeOverview(seconds: 600).lowOnMinutes, isTrue);
    expect(makeOverview(seconds: 5000).lowOnMinutes, isFalse);
    expect(makeOverview(aiNumber: null).forwardTarget, isNull);
  });

  test('UssdStatus mapping from platform maps', () {
    expect(UssdResult.fromMap({'status': 'ok', 'response': 'x'}).status, UssdStatus.ok);
    expect(UssdResult.fromMap({'status': 'no_permission'}).status, UssdStatus.noPermission);
    expect(UssdResult.fromMap({'status': 'garbage'}).status, UssdStatus.failed);
    expect(UssdResult.fromMap({'status': 'failed', 'failureCode': -2}).failureCode, -2);
  });

  test('ChangedTable covers the tables the app watches', () {
    expect(ChangedTable.values, hasLength(4));
  });
}
