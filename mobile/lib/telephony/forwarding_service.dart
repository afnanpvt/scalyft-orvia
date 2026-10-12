import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/log.dart';
import '../core/phone.dart';
import 'forwarding.dart';
import 'forwarding_state.dart';
import 'telephony_gateway.dart';

/// Why the app could not even try to send the codes.
enum SetupBlocker {
  /// The phone has no telephony hardware (tablet, emulator without a modem).
  noTelephony,

  /// No SIM is ready.
  noSim,

  /// CALL_PHONE is not granted.
  noPermission,

  /// Android or the device cannot send USSD from an app.
  unsupported,
}

@immutable
class SetupReport {
  const SetupReport({required this.steps, required this.state, this.blocker, this.needsPhoneApp = false});

  final List<StepResult> steps;
  final ForwardingState state;
  final SetupBlocker? blocker;

  /// The network will not take the codes from the app; finish through the
  /// Phone app (see [ForwardingService.phoneAppSteps]).
  final bool needsPhoneApp;

  bool get blocked => blocker != null;
  bool get allFailed => steps.isNotEmpty && steps.every((s) => s.outcome == StepOutcome.failure);
  bool get anyFailed => steps.any((s) => s.outcome == StepOutcome.failure);
  bool get allConfirmed => steps.isNotEmpty && steps.every((s) => s.outcome == StepOutcome.success);

  /// Everything the carrier refused or ignored, so the screen can say which
  /// part did not take.
  List<StepResult> get failures => steps.where((s) => s.outcome == StepOutcome.failure).toList();

  /// The owner should try the system dialer: the phone cannot send the code
  /// itself, or the carrier refused every attempt.
  bool get suggestManual =>
      !needsPhoneApp &&
      (blocker == SetupBlocker.noPermission ||
          (allFailed && steps.every((s) => s.result.status != UssdStatus.noPermission)));
}

@immutable
class StatusReport {
  const StatusReport({required this.steps, required this.state, required this.diverged, this.needsPhoneApp = false});

  /// The carrier only answers this in the Phone app.
  final bool needsPhoneApp;

  final List<StepResult> steps;
  final ForwardingState state;

  /// True when what the carrier reports differs from what the app believed
  /// and the app updated its own record to match.
  final bool diverged;

  bool get allActive => steps.isNotEmpty && steps.every((s) => s.reading == ForwardingReading.active);
  bool get allInactive => steps.isNotEmpty && steps.every((s) => s.reading == ForwardingReading.inactive);
  bool get definitive => steps.isNotEmpty && steps.every((s) => s.reading != ForwardingReading.unknown);
}

/// Sets, pauses and checks call forwarding, and remembers what it did.
///
/// Operations run one at a time: a second tap on "Turn on" queues behind the
/// first instead of interleaving carrier codes.
class ForwardingService {
  ForwardingService({
    required this._gateway,
    required this._store,
    UssdCodeBook codeBook = const Gsm3gppCodeBook(),
    DateTime Function()? now,
    this.stepGap = const Duration(milliseconds: 900),
  })  : _codes = codeBook,
        _now = now ?? DateTime.now;

  final TelephonyGateway _gateway;
  final ForwardingStore _store;
  final UssdCodeBook _codes;
  final DateTime Function() _now;

  /// Carriers throttle back-to-back USSD sessions.
  final Duration stepGap;

  Future<void> _tail = Future<void>.value();

  Future<T> _serial<T>(Future<T> Function() op) {
    final done = Completer<T>();
    _tail = _tail.then((_) async {
      try {
        done.complete(await op());
      } catch (e, st) {
        done.completeError(e, st);
      }
    });
    return done.future;
  }

  Future<ForwardingState> load() => _store.read();

  /// Wipes the local record (sign-out). Does not touch the SIM.
  Future<void> forget() => _store.clear();

  // ── activate ─────────────────────────────────────────────────────────────

  Future<SetupReport> activate({
    required String destination,
    required ForwardingPlan plan,
    SimInfo? sim,
  }) =>
      _serial(() => _activate(destination: destination, plan: plan, sim: sim));

  Future<SetupReport> _activate({
    required String destination,
    required ForwardingPlan plan,
    SimInfo? sim,
  }) async {
    final e164 = Phone.toE164(destination);
    if (e164 == null) {
      throw ArgumentError.value(destination, 'destination', 'not an international phone number');
    }

    final previous = await _store.read();
    final blocker = await _blocker();
    if (blocker != null) return SetupReport(steps: const [], state: previous, blocker: blocker);
    if (await _usePhoneApp(previous)) return _toPhoneApp(previous, remember: false);

    final subId = sim?.subscriptionId ?? previous.simSubscriptionId;

    final steps = <StepResult>[];

    // Switching modes: switch off services the new plan does not use, or the
    // old ones would keep forwarding behind the owner's back.
    if (previous.isOn) {
      final stale = previous.plan.kinds.where((k) => !plan.kinds.contains(k)).toList();
      final run = await _run(_codes.deactivate(stale), subId, destination: null);
      if (run.routeFailed) return _toPhoneApp(previous);
      steps.addAll(run.results);
    }

    final run = await _run(_codes.activate(e164, plan), subId, destination: e164);
    if (run.routeFailed) return _toPhoneApp(previous);
    final activation = run.results;
    steps.addAll(activation);

    if (activation.isNotEmpty && activation.every((s) => s.outcome == StepOutcome.failure)) {
      // Nothing took. Leave the record alone.
      return SetupReport(steps: steps, state: previous);
    }

    final now = _now();
    final sameLine = previous.destination == e164 && previous.verifiedAt != null;
    final next = previous.copyWith(
      phase: sameLine ? ForwardingPhase.activeVerified : ForwardingPhase.activeUnverified,
      plan: plan,
      destination: e164,
      simSubscriptionId: () => subId,
      simLabel: () => sim?.label ?? previous.simLabel,
      activatedAt: () => now,
      verifiedAt: () => sameLine ? previous.verifiedAt : null,
      changedAt: now,
    );
    await _store.write(next);
    return SetupReport(steps: steps, state: next);
  }

  // ── pause / resume ───────────────────────────────────────────────────────

  /// Turns forwarding off so calls ring normally. Keeps the plan so
  /// [resume] can put it back.
  Future<SetupReport> pause() => _serial(() async {
        final current = await _store.read();
        final blocker = await _blocker();
        if (blocker != null) return SetupReport(steps: const [], state: current, blocker: blocker);
        if (await _usePhoneApp(current)) return _toPhoneApp(current, remember: false);

        final run = await _run(_codes.deactivate(current.plan.kinds), current.simSubscriptionId, destination: null);
        if (run.routeFailed) return _toPhoneApp(current);
        final steps = run.results;
        if (steps.isNotEmpty && steps.every((s) => s.outcome == StepOutcome.failure)) {
          return SetupReport(steps: steps, state: current);
        }
        final next = current.copyWith(phase: ForwardingPhase.paused, changedAt: _now());
        await _store.write(next);
        return SetupReport(steps: steps, state: next);
      });

  Future<SetupReport> resume() async {
    final current = await _store.read();
    final destination = current.destination;
    if (destination == null) {
      throw StateError('Nothing to resume: forwarding was never set up.');
    }
    return activate(destination: destination, plan: current.plan);
  }

  /// For phones that cannot send the codes: the owner dialed them by hand and
  /// tells us the result. Trust, but it is only a local record and a status
  /// check can correct it.
  Future<ForwardingState> recordManual({
    required bool on,
    String? destination,
    ForwardingPlan? plan,
    SimInfo? sim,
    ForwardingRoute? route,
  }) =>
      _serial(() async {
        final current = (await _store.read()).copyWith(route: route);
        final now = _now();
        final e164 = Phone.toE164(destination) ?? current.destination;
        final next = on
            ? current.copyWith(
                phase: (e164 != null && current.destination == e164 && current.verifiedAt != null)
                    ? ForwardingPhase.activeVerified
                    : ForwardingPhase.activeUnverified,
                plan: plan ?? current.plan,
                destination: e164,
                simSubscriptionId: () => sim?.subscriptionId ?? current.simSubscriptionId,
                simLabel: () => sim?.label ?? current.simLabel,
                activatedAt: () => now,
                changedAt: now,
              )
            : current.copyWith(phase: ForwardingPhase.paused, changedAt: now);
        await _store.write(next);
        return next;
      });

  // ── status ───────────────────────────────────────────────────────────────

  /// Asks the carrier what is actually set. When the answer is definitive and
  /// disagrees with the app's record, the record is corrected: a phone that
  /// shows "on" while forwarding is really off silently loses calls.
  Future<StatusReport> readStatus() => _serial(() async {
        final current = await _store.read();
        final kinds = current.phase == ForwardingPhase.notSetUp
            ? const [ForwardingKind.noReply, ForwardingKind.unconditional]
            : current.plan.kinds;

        final blocker = await _blocker();
        if (blocker != null) return StatusReport(steps: const [], state: current, diverged: false);
        if (await _usePhoneApp(current)) {
          return StatusReport(steps: const [], state: current, diverged: false, needsPhoneApp: true);
        }

        final run = await _run(_codes.query(kinds), current.simSubscriptionId, destination: current.destination);
        if (run.routeFailed) {
          final next = current.copyWith(route: ForwardingRoute.phoneApp);
          await _store.write(next);
          return StatusReport(steps: const [], state: next, diverged: false, needsPhoneApp: true);
        }
        final steps = run.results;
        final report = StatusReport(steps: steps, state: current, diverged: false);
        if (!report.definitive) return report;

        if (current.isOn && report.allInactive) {
          final next = current.copyWith(phase: ForwardingPhase.paused, changedAt: _now());
          await _store.write(next);
          return StatusReport(steps: steps, state: next, diverged: true);
        }
        if (current.phase == ForwardingPhase.paused && report.allActive) {
          final next = current.copyWith(phase: ForwardingPhase.activeUnverified, changedAt: _now());
          await _store.write(next);
          return StatusReport(steps: steps, state: next, diverged: true);
        }
        return report;
      });

  // ── verification ─────────────────────────────────────────────────────────

  /// Called with the creation times of real calls Orvia answered. The first
  /// one after activation proves the whole chain works.
  Future<ForwardingState> confirmFromCalls(Iterable<DateTime> callTimes) => _serial(() async {
        final current = await _store.read();
        if (current.phase != ForwardingPhase.activeUnverified) return current;
        final since = current.activatedAt;
        if (since == null) return current;
        final hits = callTimes.where((t) => t.isAfter(since)).toList()..sort();
        if (hits.isEmpty) return current;
        final next = current.copyWith(
          phase: ForwardingPhase.activeVerified,
          verifiedAt: () => hits.first,
          changedAt: _now(),
        );
        await _store.write(next);
        return next;
      });

  /// The codes to send through the Phone app, in order, for [purpose].
  /// Turning on also switches off services an earlier mode used. Pausing
  /// erases every forwarding service in one step; checking asks about the
  /// main service only (the Phone app shows each reply, so fewer is kinder).
  Future<List<UssdStep>> phoneAppSteps(StepPurpose purpose, {String? destination, ForwardingPlan? plan}) async {
    final current = await _store.read();
    switch (purpose) {
      case StepPurpose.activate:
        final e164 = Phone.toE164(destination);
        if (e164 == null || plan == null) {
          throw ArgumentError.value(destination, 'destination', 'not an international phone number');
        }
        final stale = current.isOn
            ? current.plan.kinds.where((k) => !plan.kinds.contains(k)).toList()
            : const <ForwardingKind>[];
        return [..._codes.deactivate(stale), ..._codes.activate(e164, plan)];
      case StepPurpose.deactivate:
        return _codes.eraseAll();
      case StepPurpose.query:
        return _codes.query([(plan ?? current.plan).kinds.first]);
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  /// What stops the app from trying at all. A phone that cannot send codes
  /// from an app is not blocked: the Phone app can still send them.
  Future<SetupBlocker?> _blocker() async {
    final caps = await _gateway.capabilities();
    if (!caps.hasTelephony) return SetupBlocker.noTelephony;
    if (!caps.simReady) return SetupBlocker.noSim;
    if (!caps.callPhoneGranted) return SetupBlocker.noPermission;
    return null;
  }

  Future<bool> _usePhoneApp(ForwardingState s) async =>
      s.route == ForwardingRoute.phoneApp || !(await _gateway.capabilities()).canSendUssd;

  /// Sends the owner to the Phone app. After a real failure ([remember]) the
  /// route is kept, so later changes go straight there instead of failing
  /// first; a phone that merely lacks the feature today is not marked.
  Future<SetupReport> _toPhoneApp(ForwardingState s, {bool remember = true}) async {
    var next = s;
    if (remember && s.route != ForwardingRoute.phoneApp) {
      next = s.copyWith(route: ForwardingRoute.phoneApp);
      await _store.write(next);
    }
    return SetupReport(steps: const [], state: next, needsPhoneApp: true);
  }

  /// No carrier text at all means the code never reached the carrier: the
  /// phone or network refused to send it from an app.
  static bool _isRouteFailure(StepResult r) =>
      const {UssdStatus.failed, UssdStatus.timeout, UssdStatus.unsupported}.contains(r.result.status) &&
      (r.result.response?.trim().isEmpty ?? true);

  /// Sends [steps] one by one. If the very first one cannot be sent from the
  /// app, stops there: the rest would fail the same way, and a half-applied
  /// setup is worse than none.
  Future<({List<StepResult> results, bool routeFailed})> _run(
    List<UssdStep> steps,
    int? subscriptionId, {
    required String? destination,
  }) async {
    final out = <StepResult>[];
    for (var i = 0; i < steps.length; i++) {
      if (i > 0 && stepGap > Duration.zero) await Future<void>.delayed(stepGap);
      final step = steps[i];
      final result = await _gateway.sendUssd(step.code, subscriptionId: subscriptionId);
      final interpreted = UssdInterpreter.interpret(step, result, destination: destination);
      final failure = result.failureCode == null ? '' : ' ${result.failureCode}';
      Log.d('ussd ${step.purpose.name} ${step.kind.name}: ${interpreted.outcome.name} ${result.status.name}$failure');
      if (i == 0 && _isRouteFailure(interpreted)) return (results: [interpreted], routeFailed: true);
      out.add(interpreted);
    }
    return (results: out, routeFailed: false);
  }
}
