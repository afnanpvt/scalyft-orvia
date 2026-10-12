import 'package:flutter_test/flutter_test.dart';
import 'package:orvia/telephony/forwarding.dart';
import 'package:orvia/telephony/forwarding_service.dart';
import 'package:orvia/telephony/forwarding_state.dart';
import 'package:orvia/telephony/telephony_gateway.dart';

import '../support/fake_carrier.dart';

const aiNumber = '+918040001000';

void main() {
  late FakeTelephonyGateway gateway;
  late MemoryForwardingStore store;
  late ForwardingService service;
  late DateTime clock;

  setUp(() {
    gateway = FakeTelephonyGateway();
    store = MemoryForwardingStore();
    clock = DateTime.utc(2026, 10, 8, 9);
    service = ForwardingService(gateway: gateway, store: store, now: () => clock, stepGap: Duration.zero);
  });

  group('activate', () {
    test('sends the codes, records the plan, and starts unverified', () async {
      final report = await service.activate(destination: aiNumber, plan: const ForwardingPlan(ringSeconds: 25));

      expect(gateway.sent.map((s) => s.code), ['**61*+918040001000**25#', '**67*+918040001000#', '**62*+918040001000#']);
      expect(report.allConfirmed, isTrue);
      expect(report.state.phase, ForwardingPhase.activeUnverified);
      expect(report.state.destination, aiNumber);
      expect(report.state.activatedAt, clock);
      expect(report.state.verifiedAt, isNull);
      expect(await store.read(), report.state);
      // The carrier really holds the setting.
      expect(gateway.carrier.forwarding, {'61': aiNumber, '67': aiNumber, '62': aiNumber});
      expect(gateway.carrier.noReplySeconds, 25);
    });

    test('uses the chosen SIM for every code', () async {
      const sim = SimInfo(subscriptionId: 7, slotIndex: 1, carrierName: 'Jio');
      final report = await service.activate(destination: aiNumber, plan: const ForwardingPlan(), sim: sim);
      expect(gateway.sent.every((s) => s.subscriptionId == 7), isTrue);
      expect(report.state.simLabel, 'SIM 2 · Jio');
    });

    test('normalizes a formatted destination before dialing', () async {
      await service.activate(destination: '+91 80 4000 1000', plan: const ForwardingPlan(includeBusy: false, includeUnreachable: false));
      expect(gateway.sent.single.code, '**61*+918040001000**20#');
    });

    test('rejects a destination that could change the code', () async {
      await expectLater(service.activate(destination: '+91#', plan: const ForwardingPlan()), throwsArgumentError);
      expect(gateway.sent, isEmpty);
    });

    test('a carrier that refuses everything leaves the record untouched', () async {
      gateway.carrier.rejectNext = 99;
      final report = await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      expect(report.allFailed, isTrue);
      expect(report.state.phase, ForwardingPhase.notSetUp);
      expect((await store.read()).phase, ForwardingPhase.notSetUp);
      expect(report.suggestManual, isTrue);
    });

    test('a partial failure still records the setup and names what failed', () async {
      gateway.carrier.rejectNext = 0;
      var n = 0;
      gateway.interceptor = (code) => ++n == 2 ? ok('Not allowed for your plan') : null;
      final report = await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      expect(report.anyFailed, isTrue);
      expect(report.allFailed, isFalse);
      expect(report.failures.single.step.kind, ForwardingKind.busy);
      expect(report.state.phase, ForwardingPhase.activeUnverified);
    });

    test('switching mode switches off the services the new plan no longer uses', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      gateway.sent.clear();
      await service.activate(destination: aiNumber, plan: const ForwardingPlan(mode: ForwardingMode.everyCall));

      expect(gateway.sent.map((s) => s.code), ['##61#', '##67#', '##62#', '**21*+918040001000#']);
      expect(gateway.carrier.forwarding, {'21': aiNumber});
    });

    test('is blocked, not attempted, when it cannot work', () async {
      Future<SetupBlocker?> blockerFor(TelephonyCapabilities c) async {
        gateway.caps = c;
        return (await service.activate(destination: aiNumber, plan: const ForwardingPlan())).blocker;
      }

      const base = TelephonyCapabilities(hasTelephony: true, canSendUssd: true, callPhoneGranted: true, simReady: true);
      expect(await blockerFor(const TelephonyCapabilities()), SetupBlocker.noTelephony);
      expect(await blockerFor(const TelephonyCapabilities(hasTelephony: true)), SetupBlocker.noSim);
      expect(await blockerFor(const TelephonyCapabilities(hasTelephony: true, simReady: true)), SetupBlocker.noPermission);

      // A phone that cannot send codes from an app is not stuck: the Phone
      // app can. It is not marked for good, since that can change.
      gateway.caps = base.copyWith(canSendUssd: false);
      final viaPhone = await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      expect([viaPhone.blocker, viaPhone.needsPhoneApp, viaPhone.state.route], [null, true, ForwardingRoute.direct]);

      expect(await blockerFor(base), isNull);
      // Only the last attempt sent anything.
      expect(gateway.sent.length, 3);
    });

    test('two quick taps run one after the other, never interleaved', () async {
      final a = service.activate(destination: aiNumber, plan: const ForwardingPlan(includeBusy: false, includeUnreachable: false));
      final b = service.activate(destination: aiNumber, plan: const ForwardingPlan(includeBusy: false, includeUnreachable: false, ringSeconds: 10));
      await Future.wait([a, b]);
      expect(gateway.sent.map((s) => s.code), ['**61*+918040001000**20#', '**61*+918040001000**10#']);
    });
  });

  group('networks that only take codes from the Phone app', () {
    // What a 4G/5G voice network (Jio and others) does to sendUssdRequest:
    // an immediate failure with no carrier text.
    UssdResult refuse(String _) => const UssdResult(UssdStatus.failed, failureCode: -1);

    test('stops after the first refused code and remembers the route', () async {
      gateway.interceptor = refuse;
      final report = await service.activate(destination: aiNumber, plan: const ForwardingPlan());

      expect(gateway.sent, hasLength(1), reason: 'the other codes would fail the same way');
      expect(report.needsPhoneApp, isTrue);
      expect(report.suggestManual, isFalse);
      expect(report.state.isOn, isFalse, reason: 'nothing was set yet');
      expect((await store.read()).route, ForwardingRoute.phoneApp);

      // Next time it goes straight to the Phone app.
      gateway.sent.clear();
      final again = await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      expect([again.needsPhoneApp, gateway.sent.length], [true, 0]);
      final paused = await service.pause();
      expect([paused.needsPhoneApp, gateway.sent.length], [true, 0]);
      final status = await service.readStatus();
      expect([status.needsPhoneApp, gateway.sent.length], [true, 0]);
    });

    test('a carrier that answers with an error is a refusal, not a route problem', () async {
      gateway.interceptor = (_) => const UssdResult(UssdStatus.ok, response: 'Service not subscribed');
      final report = await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      expect(report.needsPhoneApp, isFalse);
      expect(report.allFailed, isTrue);
      expect((await store.read()).route, ForwardingRoute.direct);
    });

    test('a refused status check also switches to the Phone app', () async {
      gateway.interceptor = refuse;
      final status = await service.readStatus();
      expect(status.needsPhoneApp, isTrue);
      expect((await store.read()).route, ForwardingRoute.phoneApp);
    });

    test('builds the Phone app steps for each job', () async {
      Future<List<String>> codes(StepPurpose p, {ForwardingPlan? plan}) async =>
          (await service.phoneAppSteps(p, destination: aiNumber, plan: plan)).map((s) => s.code).toList();

      expect(await codes(StepPurpose.activate, plan: const ForwardingPlan()),
          ['**61*+918040001000**20#', '**67*+918040001000#', '**62*+918040001000#']);
      expect(await codes(StepPurpose.deactivate), ['##002#']);
      expect(await codes(StepPurpose.query), ['*#61#']);

      // Switching to every call first erases what the old mode set.
      await service.recordManual(on: true, destination: aiNumber, plan: const ForwardingPlan(), route: ForwardingRoute.phoneApp);
      expect(await codes(StepPurpose.activate, plan: const ForwardingPlan(mode: ForwardingMode.everyCall)),
          ['##61#', '##67#', '##62#', '**21*+918040001000#']);
    });

    test('recording the result keeps the route', () async {
      final s = await service.recordManual(on: true, destination: aiNumber, route: ForwardingRoute.phoneApp);
      expect([s.phase, s.route], [ForwardingPhase.activeUnverified, ForwardingRoute.phoneApp]);
      final restored = ForwardingState.fromJson(s.toJson());
      expect(restored.route, ForwardingRoute.phoneApp);
      expect(s.toServerSummary()['route'], 'phoneApp');
    });
  });

  group('pause and resume', () {
    test('pause erases only what Orvia set and keeps the plan', () async {
      gateway.carrier.forwarding['21'] = '+910000000000'; // the owner has their own unrelated forwarding
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      gateway.sent.clear();

      final report = await service.pause();

      expect(gateway.sent.map((s) => s.code), ['##61#', '##67#', '##62#']);
      expect(report.state.phase, ForwardingPhase.paused);
      expect(report.state.destination, aiNumber);
      expect(gateway.carrier.forwarding, {'21': '+910000000000'});
    });

    test('resume puts the same setup back', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan(ringSeconds: 15));
      await service.pause();
      gateway.sent.clear();

      final report = await service.resume();

      expect(gateway.sent.first.code, '**61*+918040001000**15#');
      expect(report.state.phase, ForwardingPhase.activeUnverified);
    });

    test('resume keeps "verified" when the line is unchanged', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      await service.confirmFromCalls([clock.add(const Duration(minutes: 3))]);
      await service.pause();
      final report = await service.resume();
      expect(report.state.phase, ForwardingPhase.activeVerified);
    });

    test('resume before any setup is an error, not a silent no-op', () async {
      await expectLater(service.resume(), throwsStateError);
    });

    test('if the carrier refuses to switch off, the app still says on', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      gateway.carrier.rejectNext = 99;
      final report = await service.pause();
      expect(report.allFailed, isTrue);
      expect(report.state.phase, ForwardingPhase.activeUnverified);
    });
  });

  group('verification', () {
    test('a real call after activation verifies it', () async {
      final r = await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      final callAt = r.state.activatedAt!.add(const Duration(minutes: 2));
      final next = await service.confirmFromCalls([callAt]);
      expect(next.phase, ForwardingPhase.activeVerified);
      expect(next.verifiedAt, callAt);
    });

    test('a call from before activation proves nothing', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      final next = await service.confirmFromCalls([clock.subtract(const Duration(hours: 1))]);
      expect(next.phase, ForwardingPhase.activeUnverified);
    });

    test('does nothing while paused or never set up', () async {
      expect((await service.confirmFromCalls([clock.add(const Duration(days: 1))])).phase, ForwardingPhase.notSetUp);
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      await service.pause();
      expect((await service.confirmFromCalls([clock.add(const Duration(days: 1))])).phase, ForwardingPhase.paused);
    });

    test('changing the destination resets verification', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      await service.confirmFromCalls([clock.add(const Duration(minutes: 1))]);
      final r = await service.activate(destination: '+14155550100', plan: const ForwardingPlan());
      expect(r.state.phase, ForwardingPhase.activeUnverified);
      expect(r.state.verifiedAt, isNull);
    });
  });

  group('readStatus', () {
    test('reads what the carrier holds', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      gateway.sent.clear();
      final report = await service.readStatus();
      expect(gateway.sent.map((s) => s.code), ['*#61#', '*#67#', '*#62#']);
      expect(report.allActive, isTrue);
      expect(report.diverged, isFalse);
    });

    test('notices forwarding that was switched off behind the app and corrects the record', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      gateway.carrier.forwarding.clear(); // owner dialed ##002# by hand, or the carrier dropped it

      final report = await service.readStatus();

      expect(report.allInactive, isTrue);
      expect(report.diverged, isTrue);
      expect(report.state.phase, ForwardingPhase.paused);
      expect((await store.read()).phase, ForwardingPhase.paused);
    });

    test('notices forwarding turned on by hand while the app said paused', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      await service.pause();
      gateway.carrier.forwarding.addAll({'61': aiNumber, '67': aiNumber, '62': aiNumber});
      final report = await service.readStatus();
      expect(report.diverged, isTrue);
      expect(report.state.phase, ForwardingPhase.activeUnverified);
    });

    test('an unclear reply never changes the record', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      gateway.carrier.customReply = (_, _, _) => 'Thank you.';
      final report = await service.readStatus();
      expect(report.definitive, isFalse);
      expect(report.diverged, isFalse);
      expect(report.state.phase, ForwardingPhase.activeUnverified);
    });

    test('mixed readings are not definitive for a switch-off', () async {
      await service.activate(destination: aiNumber, plan: const ForwardingPlan());
      gateway.carrier.forwarding.remove('67');
      final report = await service.readStatus();
      expect(report.allActive, isFalse);
      expect(report.allInactive, isFalse);
      expect(report.diverged, isFalse);
      expect(report.state.phase, ForwardingPhase.activeUnverified);
    });
  });

  group('manual setup', () {
    test('records an owner-dialed setup and can be corrected by a status check', () async {
      final s = await service.recordManual(on: true, destination: aiNumber);
      expect(s.phase, ForwardingPhase.activeUnverified);
      expect(s.destination, aiNumber);
      final off = await service.recordManual(on: false);
      expect(off.phase, ForwardingPhase.paused);
    });
  });

  test('forget wipes the local record', () async {
    await service.activate(destination: aiNumber, plan: const ForwardingPlan());
    await service.forget();
    expect((await service.load()).phase, ForwardingPhase.notSetUp);
  });

  test('server summary contains no phone numbers', () async {
    final r = await service.activate(destination: aiNumber, plan: const ForwardingPlan());
    expect(r.state.toServerSummary().toString(), isNot(contains('8040001000')));
  });
}

UssdResult ok(String t) => UssdResult(UssdStatus.ok, response: t);
